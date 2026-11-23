//! Graphite Paper 백엔드
//!
//! - CLI 인자 / macOS 파일 열기 이벤트로 받은 경로를 프론트엔드에 넘긴다 (마크다운·PDF)
//! - 논문: PDF·arXiv·논문 링크 열기, 서재, 번역, 질문·요약, AI 찾기, 로드맵, 모델 설정은 `paper` 모듈
//! - comrak으로 GFM + 수식 파싱, 상대 경로 이미지를 asset:// URL로 바꿈
//! - 파일 탐색기: 고른 폴더를 한 단계씩 읽고(폴더·마크다운만), 새 .md 파일을 만든다
//! - notify로 열린 파일만 감시. 편집 중(또는 저장 안 한 변경이 있음)이면
//!   내용을 덮어쓰지 않고 `file-conflict` 이벤트만 보낸다.

use std::{
    fs,
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc::{self, RecvTimeoutError},
        Mutex,
    },
    thread,
    time::Duration,
};

use comrak::{nodes::NodeValue, Arena, Options};
use notify::{EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

mod paper;

const MD_EXTS: &[&str] = &["md", "markdown", "mdown", "mkd", "mkdn", "txt"];
const PAPER_EXTS: &[&str] = &["pdf"];
const IMG_EXTS: &[&str] = &[
    "png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico", "avif", "apng",
];

// ───────────────────────── 상태 ─────────────────────────

#[derive(Default)]
struct AppState {
    /// 지금 열려 있는 파일 (canonical 경로)
    current: Mutex<Option<PathBuf>>,
    /// 디스크에 있다고 알고 있는 마지막 내용. 직접 저장한 변경을 외부 변경으로 착각하지 않게 한다.
    disk_snapshot: Mutex<String>,
    /// 편집 모드이거나 저장 안 한 변경이 있으면 true → 외부 변경으로 덮어쓰지 않음
    guard: AtomicBool,
    /// 교체되면 drop되며 이전 감시가 끝난다
    watcher: Mutex<Option<RecommendedWatcher>>,
    /// 프론트엔드가 뜨기 전에 받은 경로 (CLI 인자, macOS Opened 이벤트)
    pending: Mutex<Option<PathBuf>>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct Doc {
    path: String,
    name: String,
    dir: String,
    raw: String,
    html: String,
}

// ───────────────────────── 마크다운 ─────────────────────────

fn md_options() -> Options<'static> {
    let mut o = Options::default();
    o.extension.strikethrough = true;
    o.extension.table = true;
    o.extension.autolink = true;
    o.extension.tasklist = true;
    o.extension.footnotes = true;
    o.extension.math_dollars = true; // $...$, $$...$$
    o.extension.math_dollars_block = true; // 여러 줄 $$ 블록
    o.extension.math_code = true; // ```math
    o.extension.alerts = true; // > [!NOTE] 같은 GitHub 알림 블록
    o.render.tasklist_classes = true;
    // 블록마다 data-sourcepos="시작줄:열-끝줄:열"을 붙인다 → 편집기와 뷰어 스크롤을 줄 단위로 맞추는 데 쓴다
    o.render.sourcepos = true;
    // 문서 안의 일반 HTML(<details>, <img> 등)은 허용한다.
    // <script>·on* 속성 등은 프론트엔드 sanitize()가 지우고, CSP(script-src 'self')가 한 번 더 막는다.
    o.render.r#unsafe = true;
    o
}

/// 마크다운 → HTML. 이미지 URL은 `resolve_img`가 바꿔 줄 수 있다.
fn render_with(md: &str, resolve_img: impl Fn(&str) -> Option<String>) -> String {
    let opts = md_options();
    let arena = Arena::new();
    let root = comrak::parse_document(&arena, md, &opts);
    for node in root.descendants() {
        let mut data = node.data.borrow_mut();
        if let NodeValue::Image(ref mut link) = data.value {
            if let Some(url) = resolve_img(&link.url) {
                link.url = url.into();
            }
        }
    }
    let mut html = String::with_capacity(md.len() * 2);
    let _ = comrak::format_html(root, &opts, &mut html);
    html
}

fn render(app: &AppHandle, md: &str, base_dir: &Path) -> String {
    render_with(md, |src| local_asset_url(app, base_dir, src))
}

/// 상대/절대 로컬 이미지 경로를 asset 프로토콜 URL로 바꾸고, 그 파일 하나만 scope에 허용한다.
fn local_asset_url(app: &AppHandle, base_dir: &Path, src: &str) -> Option<String> {
    let s = src.trim();
    let lower = s.to_ascii_lowercase();
    if s.is_empty()
        || s.starts_with('#')
        || s.starts_with("//")
        || lower.starts_with("data:")
        || lower.starts_with("blob:")
        || lower.starts_with("asset:")
        || lower.starts_with("http:")
        || lower.starts_with("https:")
    {
        return None;
    }
    let s = s.strip_prefix("file://").unwrap_or(s);
    let clean = s.split(['?', '#']).next()?;
    let decoded = urlencoding::decode(clean).map(|c| c.into_owned()).unwrap_or_else(|_| clean.to_string());
    let p = Path::new(&decoded);
    let full = if p.is_absolute() { p.to_path_buf() } else { base_dir.join(p) };
    let full = full.canonicalize().ok()?;
    let ext = full.extension()?.to_string_lossy().to_ascii_lowercase();
    if !IMG_EXTS.contains(&ext.as_str()) {
        return None;
    }
    app.asset_protocol_scope().allow_file(&full).ok()?;
    Some(asset_url(&full))
}

/// 프론트엔드의 `convertFileSrc()`와 같은 규칙
fn asset_url(p: &Path) -> String {
    let enc = urlencoding::encode(&p.to_string_lossy()).into_owned();
    if cfg!(any(windows, target_os = "android")) {
        format!("http://asset.localhost/{enc}")
    } else {
        format!("asset://localhost/{enc}")
    }
}

// ───────────────────────── 파일 ─────────────────────────

fn read_text(p: &Path) -> Result<String, String> {
    let bytes = fs::read(p).map_err(|e| format!("파일을 읽지 못했어요: {e}"))?;
    let mut s = String::from_utf8_lossy(&bytes).into_owned();
    if s.starts_with('\u{feff}') {
        s.remove(0);
    }
    Ok(s)
}

fn make_doc(app: &AppHandle, p: &Path, raw: String) -> Doc {
    let dir = p.parent().unwrap_or(Path::new("/")).to_path_buf();
    let html = render(app, &raw, &dir);
    Doc {
        path: p.to_string_lossy().into_owned(),
        name: p.file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default(),
        dir: dir.to_string_lossy().into_owned(),
        raw,
        html,
    }
}

fn has_ext(p: &Path, exts: &[&str]) -> bool {
    p.extension()
        .map(|e| exts.contains(&e.to_string_lossy().to_ascii_lowercase().as_str()))
        .unwrap_or(false)
}

fn is_markdown_path(p: &Path) -> bool {
    has_ext(p, MD_EXTS)
}

fn is_paper_path(p: &Path) -> bool {
    has_ext(p, PAPER_EXTS)
}

/// 실행 인자에서 첫 번째로 존재하는 파일 경로 (macOS의 `-psn_...` 같은 옵션은 건너뜀)
///
/// `npm run dev`로 띄우면 tauri가 작업 폴더를 src-tauri로 바꾸므로,
/// 상대 경로는 npm을 실행한 폴더(INIT_CWD) 기준으로도 찾아본다.
fn cli_path() -> Option<PathBuf> {
    let init_cwd = std::env::var_os("INIT_CWD").map(PathBuf::from);
    std::env::args_os()
        .skip(1)
        .map(PathBuf::from)
        .filter(|p| !p.to_string_lossy().starts_with('-'))
        .find_map(|p| {
            if p.is_file() {
                return Some(p);
            }
            let alt = init_cwd.as_ref()?.join(&p);
            alt.is_file().then_some(alt)
        })
}

// ───────────────────────── 파일 감시 ─────────────────────────

fn start_watch(app: &AppHandle, state: &AppState, file: &Path) {
    let mut slot = state.watcher.lock().unwrap();
    *slot = None; // 이전 감시 종료

    // 에디터들은 "임시 파일에 쓰고 rename" 방식으로 저장하는 경우가 많아
    // 파일이 아니라 상위 폴더를 감시하고 파일 이름으로 거른다.
    let Some(dir) = file.parent() else { return };
    let (tx, rx) = mpsc::channel::<notify::Result<notify::Event>>();
    let Ok(mut watcher) = notify::recommended_watcher(tx) else { return };
    if watcher.watch(dir, RecursiveMode::NonRecursive).is_err() {
        return;
    }
    *slot = Some(watcher);

    let app = app.clone();
    let target = file.to_path_buf();
    thread::spawn(move || {
        let name = target.file_name().map(|n| n.to_os_string());
        let touches = |ev: &notify::Result<notify::Event>| match ev {
            Ok(ev) => {
                !matches!(ev.kind, EventKind::Access(_))
                    && ev.paths.iter().any(|p| p.file_name() == name.as_deref())
            }
            Err(_) => false,
        };
        // 감시자가 drop되면 송신 쪽이 닫혀 recv()가 Err → 스레드 종료
        while let Ok(first) = rx.recv() {
            let mut hit = touches(&first);
            // 디바운스: 이벤트가 150ms 동안 잠잠해질 때까지 모은다
            loop {
                match rx.recv_timeout(Duration::from_millis(150)) {
                    Ok(ev) => hit |= touches(&ev),
                    Err(RecvTimeoutError::Timeout) => break,
                    Err(RecvTimeoutError::Disconnected) => return,
                }
            }
            if hit {
                handle_change(&app, &target);
            }
        }
    });
}

fn handle_change(app: &AppHandle, target: &Path) {
    let state = app.state::<AppState>();
    if state.current.lock().unwrap().as_deref() != Some(target) {
        return; // 이미 다른 파일로 바뀜
    }
    if !target.exists() {
        // rename 저장 도중일 수 있으니 잠깐 기다렸다가 다시 확인
        thread::sleep(Duration::from_millis(250));
        if !target.exists() {
            let _ = app.emit("file-missing", target.to_string_lossy().to_string());
            return;
        }
    }
    let Ok(raw) = read_text(target) else { return };

    let mut snapshot = state.disk_snapshot.lock().unwrap();
    if *snapshot == raw {
        return; // 내용이 같음 (우리가 저장한 것 포함)
    }
    if state.guard.load(Ordering::SeqCst) {
        // 편집 중: 사용자가 쓰던 내용을 지키고 알림만 보낸다
        let _ = app.emit("file-conflict", target.to_string_lossy().to_string());
        return;
    }
    *snapshot = raw.clone();
    drop(snapshot);
    let _ = app.emit("file-reloaded", make_doc(app, target, raw));
}

// ───────────────────────── 파일 탐색기 ─────────────────────────

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Entry {
    name: String,
    path: String,
    is_dir: bool,
}

/// 폴더 한 단계만 읽는다 (하위 폴더는 펼칠 때 따로 부른다).
/// 숨김 파일은 빼고, 폴더와 마크다운·PDF 파일만 돌려준다. 폴더 먼저, 이름순.
#[tauri::command]
fn list_dir(path: String) -> Result<Vec<Entry>, String> {
    let dir = PathBuf::from(&path)
        .canonicalize()
        .map_err(|_| format!("폴더를 찾지 못했어요: {path}"))?;
    let rd = fs::read_dir(&dir).map_err(|e| format!("폴더를 읽지 못했어요: {e}"))?;
    let mut out: Vec<Entry> = rd
        .filter_map(Result::ok)
        .filter_map(|e| {
            let name = e.file_name().to_string_lossy().into_owned();
            if name.starts_with('.') {
                return None;
            }
            let p = e.path();
            // 심볼릭 링크는 가리키는 대상 기준으로 판단
            let is_dir = p.is_dir();
            if !is_dir && !(p.is_file() && (is_markdown_path(&p) || is_paper_path(&p))) {
                return None;
            }
            Some(Entry { name, path: p.to_string_lossy().into_owned(), is_dir })
        })
        .collect();
    out.sort_by(|a, b| {
        b.is_dir
            .cmp(&a.is_dir)
            .then_with(|| a.name.to_lowercase().cmp(&b.name.to_lowercase()))
    });
    Ok(out)
}

/// 새 마크다운 파일을 빈 내용으로 만든다. 확장자가 없으면 .md를 붙이고, 이미 있으면 덮어쓰지 않는다.
#[tauri::command]
fn create_file(dir: String, name: String) -> Result<String, String> {
    let name = name.trim();
    if name.is_empty() {
        return Err("파일 이름을 입력해 주세요.".into());
    }
    if name.contains(['/', '\\']) || name == "." || name == ".." {
        return Err("파일 이름에 / 는 쓸 수 없어요.".into());
    }
    let dir = PathBuf::from(&dir)
        .canonicalize()
        .map_err(|_| format!("폴더를 찾지 못했어요: {dir}"))?;
    if !dir.is_dir() {
        return Err("폴더 안에만 만들 수 있어요.".into());
    }
    let mut p = dir.join(name);
    if !is_markdown_path(&p) {
        p = dir.join(format!("{name}.md"));
    }
    fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&p)
        .map_err(|e| match e.kind() {
            std::io::ErrorKind::AlreadyExists => "같은 이름의 파일이 이미 있어요.".to_string(),
            _ => format!("파일을 만들지 못했어요: {e}"),
        })?;
    Ok(p.to_string_lossy().into_owned())
}

// ───────────────────────── 커맨드 ─────────────────────────

#[tauri::command]
fn open_file(app: AppHandle, state: State<'_, AppState>, path: String) -> Result<Doc, String> {
    let p = PathBuf::from(&path)
        .canonicalize()
        .map_err(|_| format!("파일을 찾지 못했어요: {path}"))?;
    if !p.is_file() {
        return Err("폴더가 아니라 파일을 골라 주세요.".into());
    }
    let raw = read_text(&p)?;
    let doc = make_doc(&app, &p, raw.clone());
    *state.disk_snapshot.lock().unwrap() = raw;
    *state.current.lock().unwrap() = Some(p.clone());
    state.guard.store(false, Ordering::SeqCst);
    start_watch(&app, &state, &p);
    Ok(doc)
}

/// 앱 시작 시 프론트엔드가 한 번 호출: CLI 인자나 OS에서 넘겨받은 파일 경로.
/// 마크다운인지 PDF인지는 프론트엔드가 확장자로 나눠 연다.
#[tauri::command]
fn take_launch_path(state: State<'_, AppState>) -> Option<String> {
    let p = state.pending.lock().unwrap().take()?;
    Some(p.to_string_lossy().into_owned())
}

// ───────────────────────── 논문 ─────────────────────────

/// 논문을 열면 프론트엔드가 부른다: 마크다운 파일 감시를 멈추고, 저장 대상도 비운다.
/// 논문 자체는 `paper::commands`(서재·번역·AI)가 맡는다.
#[tauri::command]
fn close_markdown(state: State<'_, AppState>) {
    *state.watcher.lock().unwrap() = None;
    *state.current.lock().unwrap() = None;
    state.disk_snapshot.lock().unwrap().clear();
    state.guard.store(false, Ordering::SeqCst);
}

/// 편집 중인 원문을 미리 렌더링 (저장하지 않음)
#[tauri::command]
fn render_markdown(app: AppHandle, state: State<'_, AppState>, raw: String) -> String {
    let dir = state
        .current
        .lock()
        .unwrap()
        .as_ref()
        .and_then(|p| p.parent().map(Path::to_path_buf))
        .unwrap_or_else(|| PathBuf::from("."));
    render(&app, &raw, &dir)
}

#[tauri::command]
fn save_file(state: State<'_, AppState>, path: String, content: String) -> Result<(), String> {
    let p = PathBuf::from(&path).canonicalize().map_err(|e| e.to_string())?;
    if state.current.lock().unwrap().as_deref() != Some(p.as_path()) {
        return Err("지금 열린 파일에만 저장할 수 있어요.".into());
    }
    let mut snapshot = state.disk_snapshot.lock().unwrap();
    // 원래 CRLF였으면 줄바꿈을 그대로 유지 (textarea는 LF로 바꾼다)
    let content = if snapshot.contains("\r\n") && !content.contains("\r\n") {
        content.replace('\n', "\r\n")
    } else {
        content
    };
    // 감시 스레드가 우리 저장을 외부 변경으로 보지 않도록 먼저 기록
    let previous = std::mem::replace(&mut *snapshot, content.clone());
    if let Err(e) = fs::write(&p, content.as_bytes()) {
        *snapshot = previous;
        return Err(format!("저장하지 못했어요: {e}"));
    }
    Ok(())
}

/// 프론트엔드가 편집 모드 진입/이탈, 저장 안 한 변경 여부를 알려 준다
#[tauri::command]
fn set_guard(state: State<'_, AppState>, on: bool) {
    state.guard.store(on, Ordering::SeqCst);
}

/// HTML로 직접 쓴 <img src="./a.png"> 처럼 렌더 단계에서 못 바꾼 이미지를 위한 보조 커맨드
#[tauri::command]
fn resolve_asset(app: AppHandle, state: State<'_, AppState>, src: String) -> Option<String> {
    let dir = state.current.lock().unwrap().as_ref()?.parent()?.to_path_buf();
    local_asset_url(&app, &dir, &src)
}

/// 개발 빌드에서만: 프론트엔드 오류·렌더 결과를 `npm run dev` 터미널에 찍는다
#[tauri::command]
fn dev_log(msg: String) {
    if cfg!(debug_assertions) {
        eprintln!("[web] {msg}");
    }
}

/// 개발 빌드에서만: `src/` 안의 프론트엔드 파일이 바뀌면 창을 자동으로 새로고침한다.
#[cfg(debug_assertions)]
fn start_dev_frontend_reload(app: &AppHandle) {
    let dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../src");
    if !dir.is_dir() {
        return;
    }
    let handle = app.clone();
    thread::spawn(move || {
        let (tx, rx) = mpsc::channel::<notify::Result<notify::Event>>();
        let Ok(mut watcher) = notify::recommended_watcher(tx) else {
            return;
        };
        if watcher.watch(&dir, RecursiveMode::Recursive).is_err() {
            return;
        }
        let is_front = |ev: &notify::Result<notify::Event>| match ev {
            Ok(ev) => {
                !matches!(ev.kind, EventKind::Access(_))
                    && ev.paths.iter().any(|p| {
                        matches!(
                            p.extension().and_then(|e| e.to_str()),
                            Some("js" | "css" | "html" | "svg")
                        )
                    })
            }
            Err(_) => false,
        };
        while let Ok(first) = rx.recv() {
            let mut hit = is_front(&first);
            loop {
                match rx.recv_timeout(Duration::from_millis(250)) {
                    Ok(ev) => hit |= is_front(&ev),
                    Err(RecvTimeoutError::Timeout) => break,
                    Err(RecvTimeoutError::Disconnected) => return,
                }
            }
            if hit {
                if let Some(w) = handle.get_webview_window("main") {
                    eprintln!("[dev] src/ 변경 감지 → 새로고침");
                    let _ = w.eval("location.reload()");
                }
            }
        }
        drop(watcher);
    });
}

#[tauri::command]
fn is_markdown(path: String) -> bool {
    is_markdown_path(Path::new(&path))
}

#[tauri::command]
fn is_paper(path: String) -> bool {
    is_paper_path(Path::new(&path))
}

// ───────────────────────── 실행 ─────────────────────────

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState::default())
        .setup(|app| {
            // 논문 서재·모델 설정: <앱 데이터>/papers, <앱 데이터>/settings.json·keys.json
            let data = app.path().app_data_dir()?;
            app.manage(std::sync::Arc::new(paper::commands::AppState::new(data.join("papers"))?));
            if let Some(p) = cli_path() {
                *app.state::<AppState>().pending.lock().unwrap() = Some(p);
            }
            // 창은 첫 화면을 그린 뒤 프론트엔드가 띄운다 (흰 화면 깜빡임 방지).
            // 스크립트가 실패해도 창이 안 뜨는 일이 없게 안전장치를 둔다.
            let handle = app.handle().clone();
            thread::spawn(move || {
                thread::sleep(Duration::from_millis(1500));
                if let Some(w) = handle.get_webview_window("main") {
                    if !w.is_visible().unwrap_or(true) {
                        let _ = w.show();
                    }
                }
            });
            #[cfg(debug_assertions)]
            start_dev_frontend_reload(app.handle());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            open_file,
            take_launch_path,
            is_paper,
            close_markdown,
            paper::commands::languages,
            paper::commands::library_list,
            paper::commands::library_get,
            paper::commands::library_remove,
            paper::commands::library_set_read,
            paper::commands::library_folders,
            paper::commands::library_set_folders,
            paper::commands::library_chats,
            paper::commands::library_set_chats,
            paper::commands::open_arxiv,
            paper::commands::open_pdf,
            paper::commands::open_pdf_path,
            paper::commands::paper_pdf,
            paper::commands::attach_pdf,
            paper::commands::replace_doc,
            paper::commands::arxiv_search,
            paper::commands::ai_recommend,
            paper::commands::llm_status,
            paper::commands::llm_overview,
            paper::commands::llm_settings,
            paper::commands::llm_set_settings,
            paper::commands::llm_set_key,
            paper::commands::llm_models,
            paper::commands::llm_open_key_page,
            paper::commands::llm_backup,
            paper::commands::paper_roadmap,
            paper::commands::gloss_selection,
            paper::commands::llm_test,
            paper::commands::open_arxiv_page,
            paper::commands::translation_start,
            paper::commands::translation_redo,
            paper::commands::translation_status,
            paper::commands::translation_cancel,
            paper::commands::ask_claude,
            paper::commands::explain_figure,
            paper::commands::summarize_paper,
            render_markdown,
            save_file,
            set_guard,
            resolve_asset,
            is_markdown,
            list_dir,
            create_file,
            dev_log
        ])
        .build(tauri::generate_context!())
        .expect("Graphite Paper를 시작하지 못했어요")
        .run(|_app, _event| {
            // 앱을 닫으면 돌고 있던 번역을 멈춘다
            if let tauri::RunEvent::Exit = &_event {
                _app.state::<std::sync::Arc<paper::commands::AppState>>().cancel_all();
            }
            // macOS는 Finder 더블클릭/“다음으로 열기”를 실행 인자가 아니라 Opened 이벤트로 준다.
            #[cfg(any(target_os = "macos", target_os = "ios"))]
            if let tauri::RunEvent::Opened { urls } = &_event {
                if let Some(p) = urls.iter().find_map(|u| u.to_file_path().ok()) {
                    *_app.state::<AppState>().pending.lock().unwrap() = Some(p.clone());
                    // 프론트엔드가 이미 떠 있으면 바로 열고, 아니면 take_launch_doc이 가져간다
                    let _ = _app.emit("open-path", p.to_string_lossy().to_string());
                }
            }
        });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_gfm_and_math() {
        let md = "# 제목\n\n- [x] 완료\n- [ ] 할 일\n\n| a | b |\n|---|---|\n| 1 | 2 |\n\n~~취소~~ 각주[^1]\n\n인라인 $a^2$ 그리고\n\n$$\nE=mc^2\n$$\n\n```mermaid\ngraph TD; A-->B\n```\n\n![img](./assets/a.png)\n\n<script>alert(1)</script>\n\n[^1]: 각주 내용\n";
        let html = render_with(md, |src| Some(format!("asset://localhost/{src}")));
        println!("{html}");
        assert!(html.contains("<table data-sourcepos="));
        assert!(html.contains("checkbox"));
        assert!(html.contains("<del data-sourcepos="));
        // 스크롤 동기화용 원문 줄 위치: 첫 제목은 1번째 줄
        assert!(html.contains(r#"<h1 data-sourcepos="1:1-1:8">"#));
        assert!(html.contains("data-math-style"));
        assert!(html.contains("asset://localhost/./assets/a.png"));
    }

    #[test]
    fn explorer_lists_and_creates() {
        let root = std::env::temp_dir().join(format!("graphite-paper-test-{}", std::process::id()));
        let _ = fs::remove_dir_all(&root);
        fs::create_dir_all(root.join("b폴더")).unwrap();
        fs::create_dir_all(root.join(".git")).unwrap();
        fs::write(root.join("Z.md"), "").unwrap();
        fs::write(root.join("a.markdown"), "").unwrap();
        fs::write(root.join("사진.png"), "").unwrap();
        let dir = root.to_string_lossy().into_owned();

        let names: Vec<_> = list_dir(dir.clone()).unwrap().into_iter().map(|e| e.name).collect();
        assert_eq!(names, ["b폴더", "a.markdown", "Z.md"]); // 폴더 먼저, 숨김·이미지 제외

        let made = create_file(dir.clone(), "새 문서".into()).unwrap();
        assert!(made.ends_with("새 문서.md") && Path::new(&made).is_file());
        assert!(create_file(dir.clone(), "새 문서.md".into()).is_err()); // 덮어쓰지 않음
        assert!(create_file(dir.clone(), "../밖".into()).is_err());
        assert!(create_file(dir.clone(), "  ".into()).is_err());
        let _ = fs::remove_dir_all(&root);
    }
}

#[cfg(test)]
mod sample {
    /// `cargo test -- --ignored dump_sample` : docs/sample.md(또는 DUMP_MD 경로) 렌더 결과를 JSON으로 출력
    #[test]
    #[ignore]
    fn dump_sample() {
        let md = std::fs::read_to_string(std::env::var("DUMP_MD").as_deref().unwrap_or("../docs/sample.md")).unwrap();
        let html = super::render_with(&md, |_| None);
        println!("SAMPLE_JSON={}", serde_json::json!({ "path": "/demo/sample.md", "name": "sample.md", "dir": "/demo", "raw": md, "html": html }));
    }

    /// `PAPER_IN=<PDF 경로 | arXiv 번호·링크> PAPER_OUT=<json 경로> cargo test -- --ignored dump_paper`
    /// : 앱이 프론트엔드에 넘기는 논문 JSON을 파일로 쓴다 (화면 확인·디버깅용, 링크는 네트워크를 쓴다)
    #[test]
    #[ignore]
    fn dump_paper() {
        let input = std::env::var("PAPER_IN").expect("PAPER_IN");
        let p = std::path::Path::new(&input);
        let doc = if p.is_file() {
            let bytes = std::fs::read(p).unwrap();
            super::paper::pdf::parse(&bytes).unwrap().finish("pdf".into(), &input)
        } else {
            super::paper::link::fetch(&input).unwrap()
        };
        let view = serde_json::json!({ "paper": doc });
        let out = std::env::var("PAPER_OUT").unwrap_or_else(|_| "paper.json".into());
        std::fs::write(&out, serde_json::to_string(&view).unwrap()).unwrap();
        let counts = doc.blocks.iter().fold(std::collections::BTreeMap::new(), |mut m, b| {
            *m.entry(serde_json::to_value(b).unwrap()["kind"].as_str().unwrap().to_string()).or_insert(0) += 1;
            m
        });
        println!("title={:?} source={:?} math={} blocks={counts:?}", doc.title, doc.source, doc.math.len());
    }
}
