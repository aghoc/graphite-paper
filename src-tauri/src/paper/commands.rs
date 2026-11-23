// OpenPaper src-tauri/src/commands.rs (sionic-ai/openpaper bb870a7, MIT, Copyright (c) 2026 Sionic AI)
// 가져온 뒤 고친 점은 licenses/openpaper/NOTICE.md에 적는다.

//! Tauri commands and the translation job runner.

use crate::paper::lang::{self, Lang, LangInfo};
use crate::paper::library::{ChatThread, Folder, Library, Meta};
use crate::paper::model::{self, Doc};
use crate::paper::translate::Mode;
use crate::paper::{arxiv, ask, llm, pdf, recommend, roadmap, search, translate};
use serde::Serialize;
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use tauri::State;

const WORKERS: usize = 3;

#[derive(Default)]
pub(crate) struct Job {
    /// Units to translate in this job and units finished so far.
    total: usize,
    done: usize,
    running: bool,
    /// Retranslating everything in the current style while the old text stays on screen.
    redo: bool,
    error: Option<String>,
    cancel: Arc<AtomicBool>,
}

pub struct AppState {
    pub library: Library,
    /// Model settings and API keys, next to the library in the app data folder.
    pub llm: llm::Store,
    /// Keyed by paper id, mode and language; a translation and an easy explanation, or two
    /// languages, can run at once.
    pub(crate) jobs: Mutex<HashMap<(String, Mode, Lang), Job>>,
}

impl AppState {
    pub fn new(root: PathBuf) -> std::io::Result<Self> {
        let app_data = root
            .parent()
            .map(PathBuf::from)
            .unwrap_or_else(|| root.clone());
        Ok(Self {
            library: Library::open(root)?,
            llm: llm::Store::new(&app_data),
            jobs: Mutex::new(HashMap::new()),
        })
    }

    /// The model backend chosen in Model settings.
    pub fn backend(&self) -> Result<llm::Backend, String> {
        llm::backend(&self.llm.settings(), &self.llm)
    }

    pub fn cancel_all(&self) {
        for job in self.jobs.lock().unwrap().values() {
            job.cancel.store(true, Ordering::Relaxed);
        }
    }
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Status {
    pub total: usize,
    pub done: usize,
    pub running: bool,
    pub error: Option<String>,
    pub redo: bool,
    /// The saved translation was written in an older style and can be redone (Korean only).
    pub outdated: bool,
    /// Unit id → translated sentences.
    pub units: HashMap<u32, Vec<String>>,
}

async fn blocking<T: Send + 'static>(
    f: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(f)
        .await
        .map_err(|_| "The task stopped unexpectedly".to_string())?
}

/// Translation target languages, in display order.
#[tauri::command]
pub fn languages() -> Vec<LangInfo> {
    lang::all()
}

#[tauri::command]
pub fn library_list(state: State<'_, Arc<AppState>>) -> Vec<Meta> {
    state.library.list()
}

#[tauri::command]
pub fn library_get(state: State<'_, Arc<AppState>>, id: String) -> Result<Doc, String> {
    state.library.doc(&id)
}

#[tauri::command]
pub fn library_folders(state: State<'_, Arc<AppState>>) -> Vec<Folder> {
    state.library.folders()
}

#[tauri::command]
pub fn library_set_folders(
    state: State<'_, Arc<AppState>>,
    folders: Vec<Folder>,
) -> Result<Vec<Folder>, String> {
    state.library.set_folders(folders)
}

#[tauri::command]
pub fn library_chats(state: State<'_, Arc<AppState>>, id: String) -> Vec<ChatThread> {
    state.library.chats(&id)
}

#[tauri::command]
pub fn library_set_chats(
    state: State<'_, Arc<AppState>>,
    id: String,
    threads: Vec<ChatThread>,
) -> Result<Vec<ChatThread>, String> {
    state.library.set_chats(&id, threads)
}

/// Marks a paper read (the check in the sidebar) or not.
#[tauri::command]
pub fn library_set_read(
    state: State<'_, Arc<AppState>>,
    id: String,
    read: bool,
) -> Result<Meta, String> {
    state.library.set_read(&id, read)
}

#[tauri::command]
pub fn library_remove(state: State<'_, Arc<AppState>>, id: String) -> Result<(), String> {
    state.jobs.lock().unwrap().retain(|(doc, _, _), job| {
        if *doc == id {
            job.cancel.store(true, Ordering::Relaxed);
        }
        *doc != id
    });
    state.library.remove(&id)
}

#[tauri::command]
/// Opens a paper from an arXiv ID or link, or from another site's paper link or DOI (see `link`).
pub async fn open_arxiv(state: State<'_, Arc<AppState>>, input: String) -> Result<Meta, String> {
    if arxiv::parse_id(&input).is_none() && !crate::paper::link::looks_like(&input) {
        return Err("Enter an arXiv ID or arxiv.org link (for example 1706.03762)".to_string());
    }
    let state = state.inner().clone();
    blocking(move || {
        let doc = crate::paper::link::fetch(&input)?;
        let meta = state.library.save(&doc)?;
        if let Some(bytes) = crate::paper::link::take_pdf() {
            let _ = state.library.save_pdf(&doc.id, &bytes);
        }
        Ok(meta)
    })
    .await
}

#[tauri::command]
pub async fn arxiv_search(query: String, start: usize) -> Result<search::Page, String> {
    blocking(move || search::search(&query, start)).await
}

/// Whether the chosen model backend can run (installed, logged in, key and model set).
#[tauri::command]
pub async fn llm_status(state: State<'_, Arc<AppState>>) -> Result<llm::Status, String> {
    let state = state.inner().clone();
    blocking(move || Ok(llm::status(&state.llm.settings(), &state.llm))).await
}

/// Readiness summary of every known provider slot for the Model settings sidebar.
#[tauri::command]
pub async fn llm_overview(
    state: State<'_, Arc<AppState>>,
) -> Result<HashMap<String, llm::SlotOverview>, String> {
    let state = state.inner().clone();
    blocking(move || Ok(llm::overview(&state.llm.settings(), &state.llm))).await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PresetInfo {
    id: &'static str,
    name: &'static str,
    base: &'static str,
    needs_key: bool,
    model: &'static str,
    keys: &'static str,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmSettings {
    settings: llm::Settings,
    presets: Vec<PresetInfo>,
    /// Last four characters of each saved key, by slot. The keys themselves never leave Rust.
    key_hints: HashMap<String, String>,
}

fn llm_settings_now(state: &AppState) -> LlmSettings {
    LlmSettings {
        settings: state.llm.settings(),
        presets: llm::PRESETS
            .iter()
            .map(|p| PresetInfo {
                id: p.id,
                name: p.name,
                base: p.base,
                needs_key: p.needs_key,
                model: p.model,
                keys: p.keys,
            })
            .collect(),
        key_hints: state.llm.key_hints(),
    }
}

fn settings_for_slot(state: &AppState, slot: Option<&str>) -> Result<llm::Settings, String> {
    let cur = state.llm.settings();
    match slot {
        Some(s) if !s.trim().is_empty() => cur
            .with_slot(s.trim())
            .ok_or_else(|| "Unknown model provider".to_string()),
        _ => Ok(cur),
    }
}

#[tauri::command]
pub fn llm_settings(state: State<'_, Arc<AppState>>) -> LlmSettings {
    llm_settings_now(&state)
}

#[tauri::command]
pub fn llm_set_settings(
    state: State<'_, Arc<AppState>>,
    settings: llm::Settings,
) -> Result<LlmSettings, String> {
    // A key saved for one custom address must not follow the user to another host.
    let host = |u: &str| {
        reqwest::Url::parse(u.trim())
            .ok()
            .and_then(|u| u.host_str().map(str::to_string))
    };
    if host(&state.llm.settings().base_url) != host(&settings.base_url) {
        state.llm.set_key("openai:custom", None)?;
    }
    // Keep backups that name a real slot, once each.
    let mut settings = settings;
    let mut seen = std::collections::HashSet::new();
    let backups = std::mem::take(&mut settings.backups);
    settings.backups = backups
        .into_iter()
        .filter(|slot| settings.with_slot(slot).is_some() && seen.insert(slot.clone()))
        .collect();
    state.llm.save_settings(&settings)?;
    state.llm.reset_switch();
    Ok(llm_settings_now(&state))
}

/// The backup answering calls for now, if the chosen backend stopped. Cheap: no CLI checks.
#[tauri::command]
pub fn llm_backup(state: State<'_, Arc<AppState>>) -> Option<llm::Backup> {
    state.llm.serving(&state.llm.settings())
}

/// Saves (or with an empty `key`, removes) the API key of `slot` (or the current choice).
#[tauri::command]
pub fn llm_set_key(
    state: State<'_, Arc<AppState>>,
    key: String,
    slot: Option<String>,
) -> Result<LlmSettings, String> {
    let target = settings_for_slot(&state, slot.as_deref())?;
    state
        .llm
        .set_key(&target.slot(), Some(key.as_str()).filter(|k| !k.trim().is_empty()))?;
    Ok(llm_settings_now(&state))
}

/// Models the API endpoint (or Codex cache) lists for `slot` (or the current choice).
#[tauri::command]
pub async fn llm_models(
    state: State<'_, Arc<AppState>>,
    slot: Option<String>,
) -> Result<Vec<llm::ModelOption>, String> {
    let state = state.inner().clone();
    blocking(move || {
        let target = settings_for_slot(&state, slot.as_deref())?;
        llm::models(&target, &state.llm)
    })
    .await
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmTest {
    reply: String,
    ms: u128,
}

/// One tiny call through the chosen backend (or `slot`), never a backup, to check the path works.
#[tauri::command]
pub async fn llm_test(
    state: State<'_, Arc<AppState>>,
    slot: Option<String>,
) -> Result<LlmTest, String> {
    let state = state.inner().clone();
    blocking(move || {
        let target = settings_for_slot(&state, slot.as_deref())?;
        let backend = llm::backend_one(&target, &state.llm)?;
        let started = std::time::Instant::now();
        let reply = backend.complete(
            "Reply with the single word OK.",
            "Say OK.",
            &AtomicBool::new(false),
        )?;
        Ok(LlmTest {
            reply: reply.trim().chars().take(60).collect(),
            ms: started.elapsed().as_millis(),
        })
    })
    .await
}

/// AI paper finder: the model plans arXiv searches for the request, then picks from real
/// results. The reply and reasons are written in `lang`.
#[tauri::command]
pub async fn ai_recommend(
    state: State<'_, Arc<AppState>>,
    request: String,
    history: Vec<recommend::Turn>,
    lang: Lang,
    mode: Option<String>,
) -> Result<recommend::Answer, String> {
    let state = state.inner().clone();
    let roadmap = mode.as_deref() == Some("roadmap");
    blocking(move || recommend::recommend(&state.backend()?, &request, &history, lang, roadmap))
        .await
}

#[derive(Serialize)]
pub struct AskReply {
    pub reply: String,
}

/// Streamed to the frontend while Claude writes an answer.
#[derive(Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AskEvent {
    Delta {
        text: String,
    },
    Meta {
        label: Option<String>,
        mentions: usize,
        has_caption: bool,
        has_abstract: bool,
    },
}

/// Answers a question about the open paper (`doc_id`), optionally about a selected passage,
/// in `lang`. Pieces of the answer arrive on `on_event` as they are written; the full answer is
/// returned.
/// A quick translation of a word or short passage selected in the reader, read in its sentence.
#[tauri::command]
pub async fn gloss_selection(
    state: State<'_, Arc<AppState>>,
    text: String,
    context: String,
    lang: Lang,
) -> Result<ask::Gloss, String> {
    let state = state.inner().clone();
    blocking(move || ask::gloss(&state.backend()?, &text, &context, lang)).await
}

#[tauri::command]
pub async fn ask_claude(
    state: State<'_, Arc<AppState>>,
    question: String,
    quote: Option<String>,
    doc_id: Option<String>,
    history: Vec<recommend::Turn>,
    lang: Lang,
    on_event: tauri::ipc::Channel<AskEvent>,
) -> Result<AskReply, String> {
    let state = state.inner().clone();
    blocking(move || {
        ask_paper_stream(
            &state,
            &question,
            quote.as_deref(),
            doc_id.as_deref(),
            &history,
            lang,
            |d| {
                let _ = on_event.send(AskEvent::Delta {
                    text: d.to_string(),
                });
            },
        )
    })
    .await
}

/// Explains a cropped region (figure, chart, table, equation) from a PDF page in `lang`,
/// enriched with caption, abstract, full-page text, and citing paragraphs across the paper.
/// Streams metadata & markdown deltas over `on_event`. (Graphite Paper에서 추가)
#[tauri::command]
pub async fn explain_figure(
    state: State<'_, Arc<AppState>>,
    image_b64: String,
    mime: String,
    page: usize,
    kind: Option<String>,
    label: Option<String>,
    caption: Option<String>,
    page_text: Option<String>,
    nearby: Option<String>,
    question: Option<String>,
    doc_id: Option<String>,
    history: Vec<recommend::Turn>,
    lang: Lang,
    on_event: tauri::ipc::Channel<AskEvent>,
) -> Result<AskReply, String> {
    let state = state.inner().clone();
    blocking(move || {
        let doc = match doc_id.as_deref() {
            Some(id) => Some(
                state
                    .library
                    .doc(id)
                    .map_err(|_| "Couldn't find the paper".to_string())?,
            ),
            None => None,
        };
        let backend = state.backend()?;
        let req = ask::FigureRequest {
            doc: doc.as_ref(),
            image_b64: &image_b64,
            mime: &mime,
            page,
            kind: kind.as_deref(),
            label: label.as_deref(),
            caption: caption.as_deref(),
            page_text: page_text.as_deref(),
            nearby: nearby.as_deref(),
            question: question.as_deref(),
            history: &history,
            lang,
        };
        let (reply, _) = ask::explain_figure_stream(
            &backend,
            &req,
            |meta| {
                let _ = on_event.send(AskEvent::Meta {
                    label: meta.label.clone(),
                    mentions: meta.mentions,
                    has_caption: meta.has_caption,
                    has_abstract: meta.has_abstract,
                });
            },
            |d| {
                let _ = on_event.send(AskEvent::Delta {
                    text: d.to_string(),
                });
            },
        )?;
        Ok(AskReply { reply })
    })
    .await
}

pub fn ask_paper(
    state: &Arc<AppState>,
    question: &str,
    quote: Option<&str>,
    doc_id: Option<&str>,
    history: &[recommend::Turn],
    lang: Lang,
) -> Result<AskReply, String> {
    ask_paper_stream(state, question, quote, doc_id, history, lang, |_| {})
}

pub fn ask_paper_stream(
    state: &Arc<AppState>,
    question: &str,
    quote: Option<&str>,
    doc_id: Option<&str>,
    history: &[recommend::Turn],
    lang: Lang,
    on_delta: impl FnMut(&str),
) -> Result<AskReply, String> {
    let doc = match doc_id {
        Some(id) => Some(
            state
                .library
                .doc(id)
                .map_err(|_| "Couldn't find the paper".to_string())?,
        ),
        None => None,
    };
    let backend = state.backend()?;
    let reply = ask::ask_stream(
        &backend,
        doc.as_ref(),
        question,
        quote,
        history,
        lang,
        on_delta,
    )?;
    Ok(AskReply { reply })
}

#[derive(Serialize)]
pub struct SummaryReply {
    pub reply: String,
    /// True when the summary came from disk instead of a new Claude call.
    pub saved: bool,
}

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "event", content = "data")]
pub enum RoadmapEvent {
    Step { step: roadmap::Step },
}

/// The reading roadmap around a saved paper in `lang`: the saved one unless `fresh`, else a new
/// one built from real citation data, with progress over `on_event`, then saved.
#[tauri::command]
pub async fn paper_roadmap(
    state: State<'_, Arc<AppState>>,
    doc_id: String,
    lang: Lang,
    fresh: bool,
    on_event: tauri::ipc::Channel<RoadmapEvent>,
) -> Result<roadmap::Roadmap, String> {
    let state = state.inner().clone();
    blocking(move || {
        if !fresh {
            if let Some(saved) = state.library.roadmap(&doc_id, lang) {
                return Ok(saved);
            }
        }
        let doc = state.library.doc(&doc_id)?;
        let made = roadmap::build(&state.backend()?, &doc, lang, |step| {
            let _ = on_event.send(RoadmapEvent::Step { step });
        })?;
        state.library.set_roadmap(&doc_id, lang, &made)?;
        Ok(made)
    })
    .await
}

/// An explainer post about a saved paper in `lang`. Returns the saved one unless `fresh`;
/// a new one streams over `on_event` and is saved when done.
#[tauri::command]
pub async fn summarize_paper(
    state: State<'_, Arc<AppState>>,
    doc_id: String,
    fresh: bool,
    lang: Lang,
    on_event: tauri::ipc::Channel<AskEvent>,
) -> Result<SummaryReply, String> {
    let state = state.inner().clone();
    blocking(move || {
        summarize(&state, &doc_id, fresh, lang, |d| {
            let _ = on_event.send(AskEvent::Delta {
                text: d.to_string(),
            });
        })
    })
    .await
}

pub fn summarize(
    state: &Arc<AppState>,
    doc_id: &str,
    fresh: bool,
    lang: Lang,
    on_delta: impl FnMut(&str),
) -> Result<SummaryReply, String> {
    if !fresh {
        if let Some(reply) = state.library.summary(doc_id, lang) {
            return Ok(SummaryReply { reply, saved: true });
        }
    }
    let doc = state
        .library
        .doc(doc_id)
        .map_err(|_| "Couldn't find the paper".to_string())?;
    let reply = ask::summarize_stream(&state.backend()?, &doc, lang, on_delta)?;
    state.library.set_summary(doc_id, lang, &reply)?;
    Ok(SummaryReply {
        reply,
        saved: false,
    })
}

/// Opens the paper's abstract page on arxiv.org in the default browser. Only arXiv IDs are accepted,
/// so the webview can never open an arbitrary URL.
#[tauri::command]
pub fn open_arxiv_page(app: tauri::AppHandle, id: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let id = arxiv::parse_id(&id).ok_or_else(|| "Not an arXiv ID".to_string())?;
    app.opener()
        .open_url(format!("https://arxiv.org/abs/{id}"), None::<&str>)
        .map_err(|_| "Couldn't open the browser".to_string())
}

/// Opens the page where the user creates an API key for `slot` (or the current choice).
#[tauri::command]
pub fn llm_open_key_page(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
    slot: Option<String>,
) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    let target = settings_for_slot(&state, slot.as_deref())?;
    let page = target
        .key_page()
        .ok_or_else(|| "This service has no key page".to_string())?;
    app.opener()
        .open_url(page, None::<&str>)
        .map_err(|_| "Couldn't open the browser".to_string())
}

#[tauri::command]
pub async fn open_pdf(
    app: tauri::AppHandle,
    state: State<'_, Arc<AppState>>,
) -> Result<Option<Meta>, String> {
    use tauri_plugin_dialog::DialogExt;
    let state = state.inner().clone();
    blocking(move || {
        let Some(picked) = app
            .dialog()
            .file()
            .add_filter("PDF", &["pdf"])
            .blocking_pick_file()
        else {
            return Ok(None);
        };
        let path = picked
            .into_path()
            .map_err(|_| "Couldn't read the file path".to_string())?;
        let bytes = std::fs::read(&path).map_err(|_| "Couldn't read the file".to_string())?;
        let mut builder = pdf::parse(&bytes)?;
        if builder.title.is_empty() {
            builder.title = path
                .file_stem()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_else(|| "PDF".into());
        }
        let name = path
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();
        let doc = builder.finish(format!("pdf-{}", model::content_id(&bytes)), &name);
        let meta = state.library.save(&doc)?;
        let _ = state.library.save_pdf(&doc.id, &bytes); // 원본 보기용 (Graphite Paper)
        Ok(meta).map(Some)
    })
    .await
}

/// 경로로 받은 PDF를 서재에 넣는다. 끌어다 놓기, 파일 탐색기, Finder "다음으로 열기"가 쓴다.
/// (Graphite Paper에서 추가)
#[tauri::command]
pub async fn open_pdf_path(state: State<'_, Arc<AppState>>, path: String) -> Result<Meta, String> {
    let state = state.inner().clone();
    blocking(move || {
        let path = PathBuf::from(path);
        let bytes = std::fs::read(&path).map_err(|_| "Couldn't read the file".to_string())?;
        let mut builder = pdf::parse(&bytes)?;
        if builder.title.is_empty() {
            builder.title = path
                .file_stem()
                .map(|s| s.to_string_lossy().into_owned())
                .unwrap_or_else(|| "PDF".into());
        }
        let name = path
            .file_name()
            .map(|s| s.to_string_lossy().into_owned())
            .unwrap_or_default();
        let doc = builder.finish(format!("pdf-{}", model::content_id(&bytes)), &name);
        let meta = state.library.save(&doc)?;
        let _ = state.library.save_pdf(&doc.id, &bytes); // 원본 보기용 (Graphite Paper)
        Ok(meta)
    })
    .await
}

/// 원본 PDF를 바이트로 돌려준다 (Graphite Paper에서 추가). 서재에 없으면 arXiv 논문만
/// 한 번 받아 저장해 둔다. 바이트는 JSON이 아닌 그대로(ArrayBuffer) 웹뷰로 간다.
#[tauri::command]
pub async fn paper_pdf(state: State<'_, Arc<AppState>>, id: String) -> Result<tauri::ipc::Response, String> {
    let state = state.inner().clone();
    blocking(move || {
        let path = state.library.pdf_path(&id)?;
        if let Ok(bytes) = std::fs::read(&path) {
            return Ok(tauri::ipc::Response::new(bytes));
        }
        let Some(arxiv_id) = id.strip_prefix("arxiv-").map(|s| s.replacen('_', "/", 1)) else {
            return Err("No original PDF was saved for this paper".to_string());
        };
        let bytes = arxiv::fetch_pdf(&arxiv_id)?;
        state.library.save_pdf(&id, &bytes)?;
        Ok(tauri::ipc::Response::new(bytes))
    })
    .await
}

/// 원본 PDF가 없는 논문(원본 저장 전에 가져온 PDF)에 원본을 붙인다 (Graphite Paper에서 추가).
/// PDF로 가져온 논문은 id가 파일 해시라, 다른 파일을 붙이지 않도록 해시를 맞춰 본다.
#[tauri::command]
pub async fn attach_pdf(state: State<'_, Arc<AppState>>, id: String, path: String) -> Result<(), String> {
    let state = state.inner().clone();
    blocking(move || {
        let bytes = std::fs::read(&path).map_err(|_| "Couldn't read the file".to_string())?;
        if let Some(hash) = id.strip_prefix("pdf-") {
            if model::content_id(&bytes) != hash {
                return Err("This PDF is not the one this paper was made from".to_string());
            }
        }
        state.library.save_pdf(&id, &bytes)
    })
    .await
}

/// 화면이 pdf.js 글자 층에서 뽑은 원문 (Graphite Paper에서 추가)
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractedBlock {
    /// heading | para | static
    kind: String,
    #[serde(default)]
    level: u8,
    #[serde(default)]
    id: u32,
    #[serde(default)]
    sentences: Vec<String>,
    #[serde(default)]
    text: String,
}

/// PDF로 가져온 논문의 원문을, 화면이 PDF 글자 층(pdf.js)에서 뽑은 원문으로 바꾼다 (Graphite Paper에서 추가).
/// OpenPaper의 PDF 해석기는 한 단과 두 단이 섞인 쪽에서 두 단의 줄을 섞기도 해서, 읽는 순서가 정확한
/// pdf.js 글자로 다시 짠다. 문장은 화면이 이미 나눠 보내고, 문단 번호도 화면이 정한 것을 쓴다
/// (그래야 화면이 문장마다 PDF 글자 범위를 정확히 다시 맞출 수 있다). 문단이 달라지니 번역은 지운다.
#[tauri::command]
pub async fn replace_doc(
    state: State<'_, Arc<AppState>>,
    id: String,
    title: String,
    extract: String,
    blocks: Vec<ExtractedBlock>,
) -> Result<Meta, String> {
    let state = state.inner().clone();
    blocks_ok(&blocks)?;
    blocking(move || {
        let old = state.library.doc(&id)?;
        if translation_running(&state, &id) {
            return Err("Stop the translation first".to_string());
        }
        let blocks = blocks
            .into_iter()
            .map(|b| {
                let unit = || model::Unit { id: b.id, sentences: b.sentences.clone() };
                match b.kind.as_str() {
                    "heading" => model::Block::Heading { level: b.level.clamp(1, 6), unit: unit() },
                    "para" => model::Block::Para { unit: unit() },
                    _ => model::Block::Static { text: b.text.clone(), code: false },
                }
            })
            .collect();
        let doc = Doc {
            id: old.id.clone(),
            title: if title.trim().is_empty() { old.title.clone() } else { title },
            source: old.source.clone(),
            blocks,
            math: Vec::new(),
            extract: Some(extract),
        };
        state.library.clear_translations(&id)?;
        state.library.save(&doc)
    })
    .await
}

fn blocks_ok(blocks: &[ExtractedBlock]) -> Result<(), String> {
    let mut seen = std::collections::HashSet::new();
    for b in blocks {
        if (b.kind == "heading" || b.kind == "para") && (b.sentences.is_empty() || !seen.insert(b.id)) {
            return Err("The extracted text is broken".to_string());
        }
    }
    if seen.is_empty() {
        return Err("No text found in the PDF (it may be a scan)".to_string());
    }
    Ok(())
}

fn translation_running(state: &AppState, id: &str) -> bool {
    state.jobs.lock().unwrap().iter().any(|((doc, _, _), job)| doc == id && job.running)
}

#[tauri::command]
pub fn translation_cancel(state: State<'_, Arc<AppState>>, id: String, mode: Mode, lang: Lang) {
    if let Some(job) = state.jobs.lock().unwrap().get(&(id, mode, lang)) {
        job.cancel.store(true, Ordering::Relaxed);
    }
}

/// Translates every unit that has no saved translation in `lang` yet.
#[tauri::command]
pub fn translation_start(
    state: State<'_, Arc<AppState>>,
    id: String,
    mode: Mode,
    lang: Lang,
) -> Result<(), String> {
    start_translation(state.inner(), id, mode, lang, false)
}

/// Translates the whole paper again in the current style, replacing units as they arrive.
#[tauri::command]
pub fn translation_redo(
    state: State<'_, Arc<AppState>>,
    id: String,
    lang: Lang,
) -> Result<(), String> {
    start_translation(state.inner(), id, Mode::Plain, lang, true)
}

#[tauri::command]
pub fn translation_status(
    state: State<'_, Arc<AppState>>,
    id: String,
    mode: Mode,
    lang: Lang,
) -> Result<Status, String> {
    Ok(status(state.inner(), &id, mode, lang))
}

/// Only the Korean plain translation has older styles; everything else started at the current one.
fn has_styles(mode: Mode, lang: Lang) -> bool {
    mode == Mode::Plain && lang == Lang::Ko
}

pub fn status(state: &Arc<AppState>, id: &str, mode: Mode, lang: Lang) -> Status {
    let units = state.library.translations(id, mode, lang);
    let jobs = state.jobs.lock().unwrap();
    let job = jobs.get(&(id.to_string(), mode, lang));
    Status {
        total: job.map_or(0, |j| j.total),
        done: job.map_or(0, |j| j.done),
        running: job.is_some_and(|j| j.running),
        error: job.and_then(|j| j.error.clone()),
        redo: job.is_some_and(|j| j.running && j.redo),
        outdated: has_styles(mode, lang)
            && !units.is_empty()
            && state.library.style(id) < translate::STYLE,
        units,
    }
}

pub fn start_translation(
    state: &Arc<AppState>,
    id: String,
    mode: Mode,
    lang: Lang,
    redo: bool,
) -> Result<(), String> {
    let backend = state.backend()?;
    let doc = state.library.doc(&id)?;
    let have = state.library.translations(&id, mode, lang);
    let pending: Vec<model::Unit> = doc
        .units()
        .into_iter()
        .filter(|u| redo || !have.contains_key(&u.id))
        .cloned()
        .collect();
    let batches = translate::batches(&pending);
    let headings = doc.heading_ids();
    let cancel = Arc::new(AtomicBool::new(false));
    {
        let mut jobs = state.jobs.lock().unwrap();
        let key = (id.clone(), mode, lang);
        if jobs.get(&key).is_some_and(|j| j.running) {
            return Ok(());
        }
        jobs.insert(
            key,
            Job {
                total: pending.len(),
                done: 0,
                running: !batches.is_empty(),
                redo,
                error: None,
                cancel: cancel.clone(),
            },
        );
    }
    if batches.is_empty() {
        return Ok(());
    }
    // A paper translated from scratch is entirely in the current style. A redo only counts once
    // every unit has been replaced; until then the old style stays marked as outdated.
    if has_styles(mode, lang) && have.is_empty() {
        state.library.set_style(&id, translate::STYLE)?;
    }
    let state = state.clone();
    std::thread::spawn(move || {
        let queue = Mutex::new(batches.into_iter());
        let first_error: Mutex<Option<String>> = Mutex::new(None);
        std::thread::scope(|scope| {
            for _ in 0..WORKERS {
                scope.spawn(|| {
                    loop {
                        if cancel.load(Ordering::Relaxed) {
                            return;
                        }
                        let Some(batch) = queue.lock().unwrap().next() else {
                            return;
                        };
                        match translate::translate_batch(
                            &backend, &doc.title, &batch, &headings, mode, lang, &cancel,
                        ) {
                            Ok(units) => {
                                let _ = state.library.add_translations(&id, mode, lang, &units);
                                if let Some(job) =
                                    state
                                        .jobs
                                        .lock()
                                        .unwrap()
                                        .get_mut(&(id.clone(), mode, lang))
                                {
                                    job.done += batch.len();
                                }
                            }
                            Err(e) => {
                                first_error.lock().unwrap().get_or_insert(e);
                                cancel.store(true, Ordering::Relaxed);
                                return;
                            }
                        }
                    }
                });
            }
        });
        let error = first_error.into_inner().unwrap();
        if has_styles(mode, lang) && redo && error.is_none() && !cancel.load(Ordering::Relaxed) {
            let _ = state.library.set_style(&id, translate::STYLE);
        }
        if let Some(job) = state
            .jobs
            .lock()
            .unwrap()
            .get_mut(&(id.clone(), mode, lang))
        {
            job.running = false;
            job.error = error;
        }
    });
    Ok(())
}
