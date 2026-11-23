// Graphite Paper 논문 기능: 서재, 원본 PDF 보기, 오른쪽 사이드 뷰(번역·질문), 문장 번역, AI 논문 찾기, 로드맵,
// arXiv 검색, 모델 설정.
// 기능과 백엔드 명령은 OpenPaper(MIT)의 화면을 따르고, 모양은 Graphite의 부품(ui.css·theme.css)으로 다시 만들었다.
// main.js 다음에 읽힌다. main.js의 전역($, state, showHtml, toast, invoke …)을 그대로 쓴다.
"use strict";

// ───────────────────────── 공통 ─────────────────────────

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const KO = { ...(window.PAPER_KO ?? {}), "No original PDF was saved for this paper": "이 논문은 원본 PDF가 저장되어 있지 않아요. 원본 파일을 연결하면 그대로 볼 수 있어요",
  "This PDF is not the one this paper was made from": "이 논문을 만든 PDF와 다른 파일이에요",
  "Stop the translation first": "번역을 멈춘 뒤에 다시 뽑을 수 있어요",
  "The extracted text is broken": "PDF에서 원문을 제대로 뽑지 못했어요",
  "Couldn't find the Gemini CLI. Install `@google/gemini-cli` or pick Google Gemini API in Model settings": "Gemini CLI를 찾지 못했어요. @google/gemini-cli를 설치하거나 Google Gemini API를 골라 주세요",
  "Gemini CLI failed. Check that you are logged in (run `gemini` to sign in) and within your usage limit": "Gemini CLI 실행에 실패했어요. 터미널에서 gemini로 로그인되어 있는지와 사용량 한도를 확인해 주세요",
  "Couldn't run Gemini CLI": "Gemini CLI를 실행하지 못했어요",
  "Gemini CLI timed out": "Gemini CLI 응답 시간이 지났어요",
  "Unknown model provider": "알 수 없는 모델 공급자예요",
  "Unsupported image format": "지원하지 않는 이미지 형식이에요",
  "The selected region image is empty or too large": "선택한 영역 이미지가 너무 크거나 비어 있어요",
  "No explanation came back. Try again": "설명이 돌아오지 않았어요. 다시 시도해 주세요" };

/** 백엔드의 영어 문구를 한국어로. `문구: 세부`면 앞부분만 바꾼다 (OpenPaper의 tError와 같은 규칙) */
function koText(message) {
  const m = typeof message === "string" ? message : message?.message ?? String(message);
  if (KO[m]) return KO[m];
  const at = m.indexOf(": ");
  if (at > 0 && KO[m.slice(0, at)]) return `${KO[m.slice(0, at)]}: ${m.slice(at + 2)}`;
  return m;
}
const fill = (text, vars) => text.replace(/\{(\w+)\}/g, (all, k) => (k in vars ? String(vars[k]) : all));

const ICON = {
  spark: '<path d="M12 3.5 13.9 9 19.5 11 13.9 13 12 18.5 10.1 13 4.5 11 10.1 9z"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h4"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.66 0l3-3a4 4 0 0 0-5.66-5.66l-1 1"/><path d="M14 10a4 4 0 0 0-5.66 0l-3 3a4 4 0 0 0 5.66 5.66l1-1"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
  route: '<circle cx="6" cy="19" r="2"/><circle cx="18" cy="5" r="2"/><path d="M8 19h8.5a3.5 3.5 0 0 0 0-7h-9a3.5 3.5 0 0 1 0-7H16"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3"/>',
  close: '<path d="M6 6l12 12M18 6 6 18"/>',
  send: '<path d="M12 19V5M5 12l7-7 7 7"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V5a2 2 0 0 1 2-2h10"/>',
  ext: '<path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4"/>',
  swap: '<path d="M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4"/>',
  check: '<path d="m5 12 5 5 9-10"/>',
  back: '<path d="M15 6l-6 6 6 6"/>',
  refresh: '<path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/>',
  globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3z"/>',
  cpu: '<rect x="6" y="6" width="12" height="12" rx="2"/><path d="M9 2v4M15 2v4M9 18v4M15 18v4M2 9h4M2 15h4M18 9h4M18 15h4"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  folderPlus: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M12 10v6M9 13h6"/>',
  chev: '<path d="m9 6 6 6-6 6"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  out: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
};
const ico = (name, cls = "") => `<svg class="t-ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;
const spinner = (cls = "") => `<svg class="t-spin ${cls}" viewBox="0 0 66 66" aria-hidden="true"><circle cx="33" cy="33" r="28"/></svg>`;

const arxivIdOf = (docId) => (docId?.startsWith("arxiv-") ? docId.slice(6).replace("_", "/").replace(/v\d+$/, "") : null);
const arxivDocId = (id) => `arxiv-${id.replace("/", "_")}`;
const looksLikeArxivId = (s) => {
  s = s.trim();
  return /^(arxiv:\s*)?\d{4}\.\d{4,5}(v\d+)?$/i.test(s) || /^(arxiv:\s*)?[a-z-]+(\.[a-z]{2})?\/\d{7}(v\d+)?$/i.test(s) ||
    /^(https?:\/\/)?(www\.|export\.)?arxiv\.org\//i.test(s);
};
const looksLikePaperLink = (s) => {
  s = s.trim();
  if (/^(doi:\s*)?10\.\d{4,9}\/\S+$/i.test(s)) return true;
  if (/\s/.test(s)) return false;
  return /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(:\d+)?(\/\S*)?$/i.test(s) && (/^https?:\/\//i.test(s) || s.includes("/"));
};

/** 논문 상태. state.doc(main.js)은 화면 공통 정보, P는 논문 기능 정보 */
const P = {
  view: "doc",               // doc | ai | search | roadmap
  lang: store.get("paper.lang", "ko"),
  langs: [],
  papers: [],                // 서재 (library_list)
  folders: [],               // 서재 폴더 (library_folders)
  doc: null,                 // 열린 논문 (library_get)
  mode: "plain",             // plain(번역) | easy(쉬운 설명)
  status: null,              // translation_status
  tr: {},                    // 문단 id → 번역 문장
  otherHas: false,           // 다른 모드(번역/쉬운 설명)도 만든 적이 있음
  llm: null,                 // llm_status
  openSeq: 0,
  trSeq: 0,
  needExtract: false,        // 예전 방식 원문이라 다시 뽑자고 안내 중
  autoStart: false,          // 새로 가져온 PDF: 원문을 바꾼 뒤 번역을 시작
  poll: 0,
  units: new Map(),          // 문단 id → { unit, heading }
};

const isPaper = () => state.doc?.kind === "paper";
const langName = () => P.langs.find((l) => l.code === P.lang)?.native ?? P.lang;

// 오래 걸리는 일(PDF 읽기, arXiv 가져오기) 동안 가운데 진행 표시
const loading = {
  el: $("loading"),
  seq: 0,
  show(msg) { $("loading-msg").textContent = msg; this.el.hidden = false; return ++this.seq; },
  hide(seq) { if (seq === this.seq) this.el.hidden = true; },
};

/** 같은 논문을 두 번 그리지 않도록, 지금 보이는 화면(view)을 바꾼다 */
function setView(view) {
  P.view = view;
  app.dataset.view = view;
  if (view !== "doc") search.close();
  updateChrome();
  if (view === "ai") setTimeout(() => $("ai-input").focus(), 0);
  if (view === "search") setTimeout(() => $("arxiv-input").focus(), 0);
}

// ───────────────────────── 번역 사이드 뷰 ─────────────────────────
/*
 * 본문은 항상 원본 PDF(pdfView)이고, 번역은 오른쪽 사이드 뷰에 문단 순서대로 보여 준다.
 * PDF를 내리면 사이드 뷰가 지금 보이는 문단으로 따라오고, 번역 문단을 누르면 PDF의 그 자리로 간다.
 */
const MATH_TOKEN = /⟦M(\d+)⟧/g;

function paperInline(text, math) {
  let out = "", last = 0;
  for (const m of text.matchAll(MATH_TOKEN)) {
    out += esc(text.slice(last, m.index));
    const tex = math[Number(m[1])];
    out += tex === undefined ? esc(m[0]) : `<span data-math-style="inline">${esc(tex)}</span>`;
    last = m.index + m[0].length;
  }
  return out + esc(text.slice(last));
}

const sentencesHtml = (id, list, math) =>
  list.map((s, i) => (s ? `<span class="s" data-s="${id}:${i}">${paperInline(s, math)}</span>` : "")).join(" ");

/** 번역 문단 안쪽: 번역문, 아직이면 제목은 원문을, 문단은 빈 줄 자리표시를 */
function trInner(unit, heading) {
  const t = P.tr[unit.id];
  if (t) return sentencesHtml(unit.id, t, P.doc.math);
  if (heading) return `<span class="untranslated">${paperInline(unit.sentences.join(" "), P.doc.math)}</span>`;
  return `<span class="pending" aria-label="아직 번역하지 않았어요">${unit.sentences.slice(0, 4).map(() => "<i></i>").join("")}</span>`;
}

/** 수식 자리(data-math-style)를 KaTeX로 그린다 (번역 문단, 답변) */
async function renderMathIn(root) {
  const nodes = root.querySelectorAll("[data-math-style]");
  if (!nodes.length) return;
  await Promise.all([loadScript("vendor/katex/katex.min.js"), loadCss("vendor/katex/katex.min.css")]);
  nodes.forEach((el) => {
    const display = el.dataset.mathStyle === "display";
    const tex = el.textContent;
    let target = el;
    if (el.tagName === "CODE" || el.tagName === "DIV") {
      target = document.createElement("div");
      target.className = "math-block";
      (el.tagName === "CODE" ? el.closest("pre") : el).replaceWith(target);
    }
    target.removeAttribute("data-math-style");
    try { window.katex.render(tex, target, { displayMode: display, throwOnError: false, output: "htmlAndMathml" }); }
    catch { target.textContent = tex; }
  });
}

/** 번역 단위의 원문 글. 수식 자리는 $TeX$로 되돌린다 */
function unitText(id) {
  if (id == null || !P.doc) return "";
  const u = paperUnits(P.doc).find((x) => x.unit.id === id)?.unit;
  if (!u) return "";
  return u.sentences.join(" ").replace(MATH_TOKEN, (m, n) => {
    const tex = P.doc.math[Number(n)];
    return tex ? "$" + tex + "$" : m;
  });
}

/** 번역할 단위(절 제목·문단·그림/표 설명)를 논문 순서대로 */
function paperUnits(d) {
  const out = [];
  for (const b of d.blocks) {
    if (b.kind === "heading" && b.level > 1) out.push({ unit: b.unit, kind: `h${Math.min(b.level, 4)}` });
    else if (b.kind === "para") out.push({ unit: b.unit, kind: "p" });
    else if ((b.kind === "figure" || b.kind === "table") && b.caption) out.push({ unit: b.caption, kind: "cap" });
  }
  return out;
}

const trView = {
  list: $("tr-list"),
  active: null,
  userScroll: 0, // 사용자가 번역 쪽을 직접 굴린 시각 (그동안은 PDF를 따라가지 않는다)
  render() {
    const has = isPaper() && (P.status?.running || Object.keys(P.tr).length > 0);
    $("rs-tr").classList.toggle("is-empty", !has);
    $("tr-empty-text").textContent = !isPaper() ? "논문을 열면 번역이 여기에 나와요"
      : "아직 번역하지 않았어요. 시작하면 문단마다 여기에 채워져요";
    $("tr-reextract").hidden = !(isPaper() && P.needExtract);
    P.units = new Map();
    this.active = null;
    if (!has) { this.list.replaceChildren(); this.status(); return; }
    const d = P.doc;
    const title = `<h1 class="tu-title" lang="en">${paperInline(d.title, d.math)}</h1>`;
    this.list.innerHTML = title + paperUnits(d).map(({ unit, kind }) => {
      const heading = kind.startsWith("h");
      P.units.set(unit.id, { unit, heading });
      return `<div class="tu tu--${kind}" data-u="${unit.id}" lang="${P.lang}">${trInner(unit, heading)}</div>`;
    }).join("");
    renderMathIn(this.list);
    this.status();
    this.follow(true);
  },
  /** 번역이 들어오는 동안 바뀐 문단만 다시 그린다 */
  fill(next) {
    if (!this.list.querySelector(".tu")) { P.tr = next; return this.render(); }
    for (const [id, list] of Object.entries(next)) {
      const old = P.tr[id];
      if (old && old.length === list.length && old.every((s, i) => s === list[i])) continue;
      P.tr[id] = list;
      const info = P.units.get(Number(id));
      const cell = this.list.querySelector(`[data-u="${id}"]`);
      if (!info || !cell) continue;
      cell.innerHTML = trInner(info.unit, info.heading);
      renderMathIn(cell);
    }
    P.tr = next;
  },
  /** 번역 쪽 위의 상태 줄: 시작 / 진행·멈추기 / 다시 번역 */
  status() {
    const s = P.status;
    const running = !!s?.running;
    const has = Object.keys(P.tr).length > 0;
    $("tr-start").hidden = !isPaper() || running || has;
    $("tr-empty-start").hidden = !isPaper() || running;
    $("tr-progress").hidden = !running;
    if (running) {
      const done = Math.min(s.done, s.total);
      $("tr-count").textContent = `${done}/${s.total}`;
      $("tr-bar-fill").style.width = `${s.total ? Math.round((done / s.total) * 100) : 0}%`;
    }
    $("btn-redo").hidden = !(isPaper() && s?.outdated && !running);
  },
  lockUntil: 0, // 문장을 누른 직후에는 그 강조를 유지한다
  /** PDF에서 지금 읽는 문장을 번역 쪽에서 강조하고 보이게 한다 (문장을 못 찾은 논문은 문단 단위) */
  follow(force = false) {
    if (!isPaper() || !rside.isOpen("tr")) return;
    // 문장을 누른 직후에는(색인이 늦게 끝나 force로 불려도) 그 자리를 지킨다
    if (Date.now() < this.lockUntil) return;
    const key = pdfView.sentAtTop();
    let el = key && this.list.querySelector(`.s[data-s="${CSS.escape(key)}"]`);
    if (!el) {
      const id = key ? Number(key.split(":")[0]) : pdfView.unitAtTop();
      el = id != null && this.list.querySelector(`[data-u="${id}"]`);
    }
    if (!el || (el === this.active && !force)) return;
    this.setActive(el);
    if (Date.now() - this.userScroll < 1200) return;
    this.reveal(el);
  },
  setActive(el) {
    this.active?.classList.remove("is-active");
    this.active?.closest(".tu")?.classList.remove("is-active");
    el.classList.add("is-active");
    el.closest(".tu")?.classList.add("is-active");
    this.active = el;
  },
  /** 번역 쪽 위에서 1/4~1/2 사이에 보이도록 굴린다 */
  reveal(el, center = false) {
    const box = this.list.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (center || r.top < box.top + 8 || r.bottom > box.top + box.height * 0.6) {
      this.list.scrollTop = this.list.scrollTop + r.top - box.top - (center ? box.height * 0.3 : 16);
    }
  },
  /** PDF에서 가리킨 문장의 번역을 칠한다 */
  hover(key) {
    this.list.querySelector(".s.is-hover")?.classList.remove("is-hover");
    if (key) this.list.querySelector(`.s[data-s="${CSS.escape(key)}"]`)?.classList.add("is-hover");
  },
  /** PDF에서 누른 문장의 번역으로 간다 */
  showSent(key) {
    const el = this.list.querySelector(`.s[data-s="${CSS.escape(key)}"]`) ?? this.list.querySelector(`[data-u="${key.split(":")[0]}"]`);
    if (!rside.isOpen("tr")) return;
    if (!el) return;
    this.lockUntil = Date.now() + 1500;
    this.setActive(el);
    this.reveal(el, true);
  },
};
trView.list.addEventListener("wheel", () => (trView.userScroll = Date.now()), { passive: true });
trView.list.addEventListener("click", (e) => {
  if (getSelection()?.toString()) return; // 글을 고르는 중이면 이동하지 않는다
  const s = e.target.closest(".s[data-s]");
  const tu = e.target.closest(".tu[data-u]");
  if (!s && !tu) return;
  trView.setActive(s ?? tu);
  trView.lockUntil = Date.now() + 900;
  if (s) {
    const key = s.dataset.s;
    pdfView.gotoSent(key);
    const quote = sentenceText(key) || s.textContent.trim();
    if (quote.length >= 2) {
      bubble.showSent(`tr:${key}`, quote, () => [...s.getClientRects()].filter((r) => r.width || r.height), sentenceContext(key));
    }
  } else pdfView.goto(Number(tu.dataset.u));
});
// 번역 문장을 가리키면 PDF의 그 문장을 칠한다
trView.list.addEventListener("mouseover", (e) => {
  const s = e.target.closest?.(".s[data-s]");
  pdfView.mark(s?.dataset.s ?? null, "hover");
});
trView.list.addEventListener("mouseleave", () => pdfView.mark(null, "hover"));

/** 글자 조각 상자들을 줄마다 하나로 합치고, 위아래 줄 상자가 겹치지 않게 자른다 (겹치면 그 띠가 진하게 보인다) */
function lineBoxes(raw) {
  const out = [];
  for (const r of raw) {
    const last = out[out.length - 1];
    if (last && last.p === r.p && Math.abs(last.y - r.y) < r.h * 0.6 && r.x >= last.x - 2 && r.x - (last.x + last.w) < r.h * 2) {
      const right = Math.max(last.x + last.w, r.x + r.w);
      last.y = Math.min(last.y, r.y);
      last.h = Math.max(last.h, r.h);
      last.w = right - last.x;
    } else out.push({ ...r });
  }
  for (let i = 1; i < out.length; i++) {
    const a = out[i - 1], b = out[i];
    if (a.p === b.p && b.y > a.y + a.h * 0.3 && a.y + a.h > b.y) a.h = Math.max(1, b.y - a.y - 0.5);
  }
  return out;
}

/** 서재 원문이 지금 규칙으로 PDF에서 뽑은 원문과 같은지 (같아야 문장 번호로 정확히 맞출 수 있다) */
function sameExtract(doc, ex) {
  const a = doc.blocks.filter((b) => b.unit).map((b) => b.unit);
  const b = ex.blocks.filter((x) => x.sentences);
  return a.length === b.length && a.every((u, i) => u.id === b[i].id && u.sentences.join("\u0001") === b[i].sentences.join("\u0001"));
}

/** 예전 방식 원문인 PDF 논문: 번역이 없으면 바로 바꾸고, 있으면 번역 쪽에서 바꾸자고 안내한다 */
async function extractFlow() {
  const id = P.doc?.id;
  if (!id) return;
  const s = await invoke("translation_status", { id, mode: "plain", lang: P.lang }).catch(() => null);
  if (P.doc?.id !== id) return;
  if (s && !s.running && !Object.keys(s.units).length) return applyExtract({ start: P.autoStart });
  P.needExtract = true;
  trView.render();
}

/** pdf.js로 뽑은 원문으로 서재 원문을 바꾼다. 문단 번호가 달라지니 번역은 지워지고, start면 다시 번역한다 */
async function applyExtract({ start = false } = {}) {
  const ex = pdfView.extracted, id = P.doc?.id;
  if (!ex || !id) return;
  try {
    const blocks = ex.blocks.map((b) => (b.kind === "static" ? { kind: "static", text: b.text }
      : { kind: b.kind, level: b.level ?? 0, id: b.id, sentences: b.sentences }));
    await invoke("replace_doc", { id, title: ex.title, extract: ex.version, blocks });
    const d = await invoke("library_get", { id });
    if (P.doc?.id !== id) return;
    P.doc = d;
    P.needExtract = false;
    P.autoStart = false;
    state.doc.name = d.title;
    updateChrome();
    refreshPapers();
    pdfView.exact(ex, pdfView.pages);
    P.tr = {};
    if (start) rside.show("tr");
    await loadTranslation({ start });
  } catch (e) { toast(koText(e)); }
}

async function renderReader() {
  if (!P.doc) return;
  await pdfView.show(P.doc.id);
}

// ───────────────────────── 원본 PDF 보기 (pdf.js) ─────────────────────────
/*
 * 서재에 저장한 원본 PDF(없으면 arXiv에서 한 번 받아 저장)를 쪽마다 캔버스로 그린다.
 * 기본은 본문 폭에 꽉 차게(폭 맞춤), 아래 확대·축소 단추·⌘+/⌘−/⌘0·트랙패드 핀치로 배율을 바꾼다.
 * 글자 크기 단추는 PDF에 영향을 주지 않는다(사이드 뷰 글에만 쓰인다).
 * 화면에 들어오는 쪽만 그리고, 글자 층(textLayer)을 얹어 글을 고르고 찾고 물어볼 수 있게 한다.
 * 위치(번역 단위 자리, 목차 자리)는 배율 1 기준 좌표로 저장해, 배율이 바뀌어도 그대로 쓴다.
 */
const PDF_MIN = 0.4, PDF_MAX = 5, PDF_STEP = 1.15;
const PDF_100 = 96 / 72; // PDF 1pt = 화면 1.333px 일 때를 100%로 본다 (pdf.js와 같은 기준)
const pdfView = {
  lib: null,
  doc: null,
  id: null,
  seq: 0,
  observer: null,
  bytes: new Map(),  // 논문 id → 원본 (한 번 받은 것은 다시 받지 않는다)
  pages: [],         // { page, base(배율 1 viewport), box, drawn, token }
  pos: new Map(),    // 번역 단위 id → { page, x, y } (배율 1 좌표, 그 단위 첫 문장 자리)
  sents: null,       // "단위:문장" → { unit, page, x, y, boxes: [{ p, x, y, w, h }] }
  sentOrder: [],     // 자리를 찾은 문장, 논문 순서
  pageSents: null,   // 쪽마다 [{ key, b(상자) }] (가리킨 문장 찾기용)
  hoverKey: null,
  order: [],         // 자리를 찾은 단위 id, 논문 순서
  zoom: null,        // null = 폭 맞춤, 숫자 = 사용자가 고른 배율
  scale: 1,          // 지금 쓰는 배율
  redrawTimer: 0,
  async load() {
    if (!this.lib) {
      this.lib = await import("./vendor/pdfjs/pdf.min.mjs");
      this.lib.GlobalWorkerOptions.workerSrc = "vendor/pdfjs/pdf.worker.min.mjs";
    }
    return this.lib;
  },
  active() { return isPaper() && P.view === "doc" && this.pages.length > 0; },
  stop() {
    this.seq++;
    this.hideBack();
    this.observer?.disconnect();
    this.observer = null;
    this.doc?.destroy();
    this.doc = null;
    this.pages = [];
    this.pos = new Map();
    this.order = [];
    this.sents = null;
    this.sentOrder = [];
    this.pageSents = null;
    this.hoverKey = null;
    textSel.clear();
    app.classList.remove("pdf-on");
  },
  async show(id) {
    this.stop();
    const seq = this.seq;
    const mine = () => seq === this.seq;
    state.renderSeq++; // 그리던 문서 HTML이 있으면 멈춘다
    search.close();
    content.innerHTML = `<div class="pdf-view"><div class="thinking pdf-wait">${spinner()}<span>원본 PDF를 불러오는 중…</span></div></div>`;
    buildToc();
    try {
      let buf = this.bytes.get(id);
      if (!buf) {
        buf = await invoke("paper_pdf", { id });
        if (!mine()) return;
        this.bytes.set(id, buf);
      }
      const lib = await this.load();
      const doc = await lib.getDocument({
        data: new Uint8Array(buf.slice(0)),
        cMapUrl: "vendor/pdfjs/cmaps/",
        cMapPacked: true,
        standardFontDataUrl: "vendor/pdfjs/standard_fonts/",
        isEvalSupported: false,
      }).promise;
      if (!mine()) { doc.destroy(); return; }
      this.doc = doc;
      this.id = id;
      await this.layout(doc, mine);
    } catch (e) {
      devLog(`PDF 열기 실패: ${e?.message ?? e}`);
      if (!mine()) return;
      const missing = String(e).includes("No original PDF");
      content.innerHTML = `<div class="pdf-view"><div class="pdf-missing"><p>${esc(koText(e))}</p>` +
        `${missing ? `<button id="pdf-attach" class="t-btn t-btn--sm t-btn--primary" type="button">원본 PDF 연결</button>` : ""}</div></div>`;
      $("pdf-attach")?.addEventListener("click", () => this.attach(id));
    }
  },
  /** 원본이 없는 논문에 PDF 파일을 붙인다 */
  async attach(id) {
    if (!T) return;
    const path = await T.dialog.open({ multiple: false, directory: false, filters: [{ name: "논문 PDF", extensions: ["pdf"] }] });
    if (typeof path !== "string") return;
    try {
      await invoke("attach_pdf", { id, path });
      toast("원본 PDF를 연결했어요");
      this.show(id);
    } catch (e) { toast(koText(e)); }
  },
  /** 쪽 자리를 먼저 다 잡고(스크롤 길이가 처음부터 맞게), 보이는 쪽부터 그린다 */
  async layout(doc, mine) {
    const view = document.createElement("div");
    view.className = "pdf-view";
    const pages = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      if (!mine()) return;
      const box = document.createElement("div");
      box.className = "pdf-page";
      box.dataset.page = String(n);
      view.appendChild(box);
      pages.push({ page, base: page.getViewport({ scale: 1 }), box, drawn: false, token: 0 });
    }
    content.replaceChildren(view);
    this.pages = pages;
    this.zoom = store.get("paper.pdfZoom", null);
    this.size(this.zoom ?? this.fitScale());
    app.classList.add("pdf-on");
    this.observer = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const p = pages[Number(en.target.dataset.page) - 1];
        if (p && !p.drawn) { p.drawn = true; this.draw(p, mine); }
      }
    }, { root: viewer, rootMargin: "800px 0px" });
    pages.forEach((p) => this.observer.observe(p.box));
    await this.outline(doc, pages, mine);
    await this.index(pages, mine);
  },
  /** 폭 맞춤 배율: 가장 넓은 쪽이 본문 폭에 꽉 차게 */
  fitScale() {
    const maxW = Math.max(...this.pages.map((p) => p.base.width), 1);
    const avail = (content.clientWidth || viewer.clientWidth) - 8;
    return Math.min(PDF_MAX, Math.max(PDF_MIN, avail / maxW));
  },
  /** 쪽 상자 크기만 배율에 맞춘다. 이미 그린 캔버스는 늘어나 보이고, 잠시 뒤 새 배율로 다시 그린다 */
  size(scale, anchorY = null) {
    if (!this.pages.length) return;
    // 보던 자리(기준 높이에 걸친 쪽과 그 쪽 안의 비율)를 기억했다가 배율을 바꾼 뒤 맞춘다
    const vr = viewer.getBoundingClientRect();
    const y = anchorY ?? vr.top + 1;
    let keep = null;
    for (const p of this.pages) {
      const r = p.box.getBoundingClientRect();
      if (r.bottom >= y) { keep = { p, frac: (y - r.top) / r.height }; break; }
    }
    this.scale = scale;
    for (const p of this.pages) {
      p.box.style.width = `${Math.floor(p.base.width * scale)}px`;
      p.box.style.height = `${Math.floor(p.base.height * scale)}px`;
      p.box.style.setProperty("--scale-factor", String(scale));
    }
    if (keep && keep.p.box.isConnected) {
      const r = keep.p.box.getBoundingClientRect();
      viewer.scrollTop += r.top + keep.frac * r.height - y;
    }
    $("pdf-zoom-value").textContent = `${Math.round((scale / PDF_100) * 100)}%`;
    $("pdf-fit").setAttribute("aria-pressed", String(this.zoom == null));
    clearTimeout(this.redrawTimer);
    this.redrawTimer = setTimeout(() => this.redraw(), 180);
  },
  /** 새 배율로 다시 그린다: 그렸던 쪽은 모두 다시, 화면 근처 쪽부터 */
  redraw() {
    for (const p of this.pages) if (p.drawn && p.drawnScale !== this.scale) p.drawn = false;
    if (!this.observer) return;
    // 다시 관찰하면 지금 화면 근처에 있는 쪽들이 곧바로 다시 그려진다
    for (const p of this.pages) { this.observer.unobserve(p.box); this.observer.observe(p.box); }
  },
  zoomTo(scale, anchorY) {
    this.zoom = Math.min(PDF_MAX, Math.max(PDF_MIN, scale));
    store.set("paper.pdfZoom", this.zoom);
    this.size(this.zoom, anchorY);
  },
  zoomBy(f, anchorY) { this.zoomTo(this.scale * f, anchorY); },
  fitWidth() {
    this.zoom = null;
    store.set("paper.pdfZoom", null);
    this.size(this.fitScale());
  },
  /** 본문 폭이 바뀌면(사이드 뷰, 창 크기) 폭 맞춤일 때만 다시 맞춘다 */
  refit() {
    if (!this.pages.length || this.zoom != null) return;
    const s = this.fitScale();
    if (Math.abs(s - this.scale) > 0.005) this.size(s);
  },
  async draw(p, mine) {
    const token = ++p.token;
    const scale = this.scale;
    const vp = p.page.getViewport({ scale });
    const dpr = window.devicePixelRatio || 1;
    const canvas = document.createElement("canvas");
    canvas.width = Math.floor(vp.width * dpr);
    canvas.height = Math.floor(vp.height * dpr);
    try {
      await p.page.render({ canvasContext: canvas.getContext("2d"), viewport: vp, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null }).promise;
      if (!mine() || token !== p.token) return;
      // 다 그린 뒤에 바꿔 끼워, 다시 그리는 동안 빈 면이 보이지 않게 한다
      p.box.querySelectorAll("canvas, .textLayer").forEach((el) => { textSel.remove(el); el.remove(); });
      p.box.prepend(canvas);
      p.drawnScale = scale;
      const text = document.createElement("div");
      text.className = "textLayer";
      p.box.appendChild(text);
      await new this.lib.TextLayer({ textContentSource: p.page.streamTextContent(), container: text, viewport: vp }).render();
      textSel.add(text);
      if (search.open) search.run(search.input.value, { keepIndex: true });
    } catch (e) {
      if (mine() && token === p.token) {
        devLog(`PDF 쪽 그리기 실패: ${e?.message ?? e}`);
        p.box.insertAdjacentHTML("beforeend", `<p class="pdf-page__err">이 쪽을 그리지 못했어요: ${esc(e?.message ?? e)}</p>`);
      }
    }
  },
  /** PDF 안의 목차를 사이드바 목차로 */
  async outline(doc, pages, mine) {
    const list = $("toc-list");
    list.replaceChildren();
    tocLinks = [];
    let items = [];
    try { items = (await doc.getOutline()) ?? []; } catch { items = []; }
    const add = async (item, level) => {
      if (level > 3 || !mine()) return;
      let index = null, top = 0;
      try {
        const dest = typeof item.dest === "string" ? await doc.getDestination(item.dest) : item.dest;
        if (dest?.[0]) index = typeof dest[0] === "number" ? dest[0] : await doc.getPageIndex(dest[0]);
        // [ref, {name:"XYZ"}, left, top, zoom]: top은 PDF 좌표(아래가 0)
        if (index != null && dest[1]?.name === "XYZ" && typeof dest[3] === "number") {
          top = Math.max(0, pages[index].base.convertToViewportPoint(0, dest[3])[1]);
        }
      } catch { index = null; }
      if (index != null && pages[index]) {
        const anchor = this.anchor(pages[index], top);
        const a = document.createElement("a");
        a.href = "#";
        a.className = `l${level}`;
        a.textContent = item.title;
        a.title = item.title;
        a.addEventListener("click", (e) => { e.preventDefault(); scrollToEl(anchor); });
        list.appendChild(a);
        tocLinks.push({ a, h: anchor });
      }
      for (const child of item.items ?? []) await add(child, level + 1);
    };
    for (const item of items) await add(item, 1);
    if (!mine()) return;
    $("toc").classList.toggle("is-empty", tocLinks.length === 0);
    updateActiveToc();
  },
  /** 쪽 안 y(배율 1 기준) 자리에 보이지 않는 표시를 둔다. 배율이 바뀌어도 --scale-factor로 따라간다 */
  anchor(p, y) {
    const a = document.createElement("div");
    a.className = "pdf-anchor";
    a.style.top = `calc(var(--scale-factor) * ${y}px)`;
    p.box.appendChild(a);
    return a;
  },
  /*
   * 문장마다 PDF의 어느 자리에 있는지 찾는다. 문라이트처럼 원문 PDF와 번역을 문장 단위로 잇기 위해서다.
   * PDF 글자 조각(text item)을 소문자 영숫자만 남겨 이어 붙이면 줄 끝 하이픈과 합자(ﬁ)가 사라져,
   * 다시 짠 원문 문장을 그대로 찾을 수 있다. 수식 자리(⟦M n⟧)는 PDF 쪽 글자와 모양이 달라서
   * 문장의 첫 조각과 끝 조각으로 범위를 정한다. 그 범위에 걸친 글자 조각들로 줄마다 상자를 만든다.
   * 좌표는 모두 배율 1 기준이라 확대·축소해도 --scale-factor만 곱하면 된다.
   */
  async index(pages, mine) {
    const norm = (t) => t.normalize("NFKD").toLowerCase().replace(/[^a-z0-9]/g, "");
    const items = [];   // { page, x, y(위), w, h, n(정규화한 글자 수) }
    const charItem = []; // 이어 붙인 글자마다 몇 번째 조각인지
    const charOff = [];  // 그 조각 안에서 몇 번째 글자인지
    let joined = "";
    for (let i = 0; i < pages.length; i++) {
      let tc;
      try { tc = await pages[i].page.getTextContent(); } catch { continue; }
      if (!mine()) return;
      pages[i].items = tc.items; // pdf.js 원문 뽑기·정확한 문장 상자에 다시 쓴다
      const base = pages[i].base, W = base.width;
      // 2단 편집인지: 오른쪽 단 시작 근처(폭의 48~62%)에서 시작하는 줄이 많으면 2단
      const starts = tc.items.filter((it) => it.str?.trim()).map((it) => base.convertToViewportPoint(it.transform[4], it.transform[5])[0]);
      pages[i].twoCol = starts.length > 20 && starts.filter((x) => x > W * 0.48 && x < W * 0.62).length > starts.length * 0.15;
      for (const it of tc.items) {
        if (!it.str) continue;
        // 정규화한 글자마다 원래 글자 몇 번째였는지 기억해 둔다. 줄 안에서 문장이 시작·끝나는 x를
        // 원래 글자(공백·문장부호 포함) 비율로 계산해야 "94.2%. However"에서 However부터 칠해진다.
        let n = "";
        const orig = [];
        for (let j = 0; j < it.str.length; j++) {
          const c = norm(it.str[j]);
          for (const ch of c) { n += ch; orig.push(j); }
        }
        if (!n) continue;
        const [x, baseline] = base.convertToViewportPoint(it.transform[4], it.transform[5]);
        const h = it.height || Math.hypot(it.transform[2], it.transform[3]) || 8;
        // 글자 높이만큼(윗부분 0.8 + 아랫부분 0.2)만 잡아 위아래 줄 상자가 겹치지 않게 한다
        items.push({ page: i, x, y: baseline - h * 0.8, w: it.width || h * it.str.length * 0.5, h, L: it.str.length });
        const idx = items.length - 1;
        for (let k = 0; k < n.length; k++) { charItem.push(idx); charOff.push(orig[k]); }
        joined += n;
      }
    }
    if (!P.doc || !mine()) return;

    // PDF로 가져온 논문: pdf.js 글자에서 원문을 뽑는다(paper-extract.js). 서재의 원문이 같은 규칙으로
    // 뽑아 둔 것이면 문장마다 정확한 글자 범위로 상자를 만들고(추정 없음), 아니면 원문을 바꾸거나 바꾸자고 안내한다.
    this.extracted = null;
    if (P.doc.id.startsWith("pdf-") && window.PaperExtract) {
      const ex = PaperExtract.run(pages.map((p) => ({ width: p.base.width, height: p.base.height, items: p.items ?? [] })));
      this.extracted = ex;
      if (P.doc.extract === ex.version && sameExtract(P.doc, ex)) {
        this.exact(ex, pages);
        return;
      }
      extractFlow();
    }

    let cursor = 0;
    const locate = (text) => {
      const segs = text.split(/⟦M\d+⟧/).map(norm).filter((x) => x.length >= 4);
      if (!segs.length) return null;
      const whole = norm(text.replace(MATH_TOKEN, ""));
      const head = segs[0].slice(0, 32);
      // 너무 짧으면(쪽 번호, ORCID 한 줄 등) 논문 여러 곳에 같은 글이 있어 엉뚱한 자리에 붙으므로 건너뛴다
      if (head.length < 12) return null;
      // 앞 문장 바로 뒤에서부터, 멀지 않은 곳에서만 찾는다(같은 글이 여러 번 나와도 순서를 지킨다).
      // 다시 짠 원문과 PDF의 순서가 조금 엇갈리는 앞부분을 위해 바로 앞쪽도 조금 본다.
      let at = joined.indexOf(head, cursor);
      if (at < 0 || at - cursor > 8000) {
        const back = joined.lastIndexOf(head, cursor);
        at = back >= 0 && cursor - back < 3000 ? back : -1;
      }
      if (at < 0) return null;
      if (segs.length === 1 && joined.startsWith(whole, at)) return [at, at + whole.length];
      // 끝 조각은 "머리 위치 + 문장 길이" 근처에서만 찾는다. PDF에는 수식·인용 번호 글자가 더 있어
      // 실제 끝이 조금 뒤로 밀리지만, 넓게 찾으면 뒤 문장의 비슷한 글자를 끝으로 잡는다.
      const tail = segs[segs.length - 1].slice(-20);
      const from = at + Math.max(0, whole.length - tail.length - 12);
      const t = joined.indexOf(tail, from);
      const end = t >= 0 && t <= at + whole.length * 1.25 + 40 ? t + tail.length : Math.min(joined.length, at + whole.length);
      return [at, end];
    };
    // 글자 범위 → 줄마다 상자 하나
    const boxesOf = (from, to) => {
      const raw = [];
      for (let k = from; k < to;) {
        const it = charItem[k], a = charOff[k];
        let k2 = k;
        while (k2 + 1 < to && charItem[k2 + 1] === it) k2++;
        const m = items[it];
        const x0 = m.x + (m.w * a) / m.L, x1 = m.x + (m.w * (charOff[k2] + 1)) / m.L;
        raw.push({ p: m.page, x: x0, y: m.y, w: Math.max(1, x1 - x0), h: m.h });
        k = k2 + 1;
      }
      return lineBoxes(raw);
    };

    const sents = new Map(), sentOrder = [], pageSents = pages.map(() => []);
    for (const { unit } of paperUnits(P.doc)) {
      unit.sentences.forEach((text, i) => {
        const r = locate(text);
        if (!r) return;
        if (r[0] >= cursor) cursor = r[1];
        const boxes = boxesOf(r[0], r[1]);
        if (!boxes.length) return;
        const key = `${unit.id}:${i}`;
        const first = boxes[0];
        sents.set(key, { unit: unit.id, page: first.p, x: first.x, y: first.y, boxes });
        sentOrder.push(key);
        for (const b of boxes) pageSents[b.p].push({ key, b });
        if (!this.pos.has(unit.id)) this.pos.set(unit.id, { page: first.p, x: first.x, y: first.y });
      });
    }
    this.settle(sents, sentOrder, pageSents, pages, "추정");
  },
  settle(sents, sentOrder, pageSents, pages, how) {
    this.sents = sents;
    this.sentOrder = sentOrder;
    this.pageSents = pageSents;
    this.order = paperUnits(P.doc).map(({ unit }) => unit.id).filter((id) => this.pos.has(id));
    devLog(`문장 자리(${how}): ${sentOrder.length}개 (단위 ${this.order.length}개)`);
    if (!tocLinks.length) this.headingToc(pages);
    trView.follow(true);
    figure.detectAll(pages, () => this.pages === pages);
    this.mountLinks(pages, () => this.pages === pages);
  },
  backState: null,
  backTimer: 0,
  showBack(scrollTop, fromPage) {
    this.backState = { scrollTop, fromPage };
    $("pdf-back-label").textContent = `p.${fromPage} 위치로 돌아가기`;
    $("pdf-back").hidden = false;
    clearTimeout(this.backTimer);
    this.backTimer = setTimeout(() => this.hideBack(), 12000);
  },
  hideBack() {
    clearTimeout(this.backTimer);
    this.backState = null;
    $("pdf-back").hidden = true;
  },
  /** PDF 내부 링크(인용 번호→레퍼런스, 그림·절 링크) 목적지로 이동 */
  async gotoDest(dest, fromPage) {
    if (!this.doc || !this.pages.length) return;
    let resolved = dest;
    try {
      if (typeof dest === "string") resolved = await this.doc.getDestination(dest);
    } catch { return; }
    if (!Array.isArray(resolved) || !resolved[0]) return;
    let idx = null;
    try {
      idx = typeof resolved[0] === "number" ? resolved[0] : await this.doc.getPageIndex(resolved[0]);
    } catch { return; }
    const pg = this.pages[idx];
    if (!pg) return;
    let y = 0;
    const mode = resolved[1]?.name;
    const rawY = (mode === "XYZ" || mode === "FitR") ? resolved[3]
      : (mode === "FitH" || mode === "FitBH") ? resolved[2] : null;
    if (typeof rawY === "number" && Number.isFinite(rawY)) {
      y = Math.max(0, pg.base.convertToViewportPoint(0, rawY)[1]);
    }
    const prevTop = viewer.scrollTop;
    const r = pg.box.getBoundingClientRect(), vr = viewer.getBoundingClientRect();
    const ratio = r.width / pg.base.width;
    viewer.scrollTop = viewer.scrollTop + r.top - vr.top + y * ratio - 48;
    const flash = document.createElement("div");
    flash.className = "pdf-flash";
    flash.style.top = `${Math.max(0, y * ratio - 12)}px`;
    pg.box.appendChild(flash);
    setTimeout(() => flash.remove(), 1650);
    if (fromPage && idx + 1 !== fromPage) this.showBack(prevTop, fromPage);
  },
  /** PDF 내장 링크 주석(인용 점프·DOI·URL) + 일반 텍스트 DOI/URL/arXiv를 클릭 가능한 링크로 올린다 */
  async mountLinks(pages, mine) {
    if (!this.doc) return;
    let extCount = 0, intCount = 0;
    const openExt = (url) => {
      if (!/^https?:|^mailto:/i.test(url)) return;
      if (T?.opener) T.opener.openUrl(url).catch(() => {});
      else window.open(url, "_blank", "noopener");
    };
    const TEXT_LINK_RE = /\b(?:https?:\/\/[^\s<>()]+|doi:\s*10\.\d{4,9}\/[^\s<>()]+|10\.\d{4,9}\/[^\s<>()]+|arXiv:\s*(?:\d{4}\.\d{4,5}(?:v\d+)?|[a-z-]+(?:\.[a-z]{2})?\/\d{7}(?:v\d+)?))/gi;

    for (let i = 0; i < pages.length; i++) {
      if (!mine()) return;
      const pg = pages[i];
      pg.box.querySelectorAll(".pdf-link").forEach((el) => el.remove());
      const placed = [];
      const addLink = (x, y, w, h, { url = null, dest = null }) => {
        if (w < 4 || h < 4) return;
        const a = document.createElement("a");
        a.className = url ? "pdf-link pdf-link--ext" : "pdf-link pdf-link--int";
        a.href = url || "#";
        a.style.left = `calc(var(--scale-factor) * ${x}px)`;
        a.style.top = `calc(var(--scale-factor) * ${y}px)`;
        a.style.width = `calc(var(--scale-factor) * ${w}px)`;
        a.style.height = `calc(var(--scale-factor) * ${h}px)`;
        a.title = url ? `${url} (클릭해서 열기)` : "클릭해서 해당 위치로 이동";
        a.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation();
          bubble.hide();
          if (url) openExt(url);
          else if (dest) this.gotoDest(dest, i + 1);
        });
        pg.box.appendChild(a);
        placed.push({ x, y, x2: x + w, y2: y + h });
      };

      // 1) PDF 자체 Link 주석 (본문 인용→레퍼런스 점프, 레퍼런스 DOI·외부 URL)
      let annots = [];
      try { annots = await pg.page.getAnnotations(); } catch { annots = []; }
      if (!mine()) return;
      for (const an of annots) {
        if (an.subtype !== "Link" || !an.rect?.length) continue;
        const url = an.url && /^https?:|^mailto:/i.test(an.url) ? an.url : null;
        const dest = !url && an.dest ? an.dest : null;
        if (!url && !dest) continue;
        const [vx1, vy1, vx2, vy2] = pg.base.convertToViewportRectangle(an.rect);
        const x = Math.min(vx1, vx2), y = Math.min(vy1, vy2);
        const w = Math.abs(vx2 - vx1), h = Math.abs(vy2 - vy1);
        addLink(x, y, w, h, { url, dest });
        if (url) extCount++; else intCount++;
      }

      // 2) 주석이 없는 일반 텍스트 URL / DOI / arXiv ID 보조 감지
      if (pg.items?.length) {
        for (const it of pg.items) {
          const s = it.str;
          if (!s || s.length < 8) continue;
          TEXT_LINK_RE.lastIndex = 0;
          let m;
          while ((m = TEXT_LINK_RE.exec(s))) {
            let raw = m[0].replace(/[.,;:\])]+$/, "");
            if (raw.length < 8) continue;
            let url = null;
            if (/^https?:\/\//i.test(raw)) url = raw;
            else if (/^doi:\s*/i.test(raw)) url = `https://doi.org/${raw.replace(/^doi:\s*/i, "")}`;
            else if (/^10\.\d{4,9}\//.test(raw)) url = `https://doi.org/${raw}`;
            else if (/^arXiv:\s*/i.test(raw)) url = `https://arxiv.org/abs/${raw.replace(/^arXiv:\s*/i, "")}`;
            if (!url) continue;
            const [bx, baseline] = pg.base.convertToViewportPoint(it.transform[4], it.transform[5]);
            const ih = it.height || Math.hypot(it.transform[2], it.transform[3]) || 8;
            const iw = it.width || ih * s.length * 0.5;
            const x = bx + (iw * m.index) / s.length;
            const w = (iw * raw.length) / s.length;
            const y = baseline - ih * 0.85;
            const dup = placed.some((p) => x + w > p.x + 2 && x < p.x2 - 2 && y + ih > p.y + 2 && y < p.y2 - 2);
            if (dup) continue;
            addLink(x, y, w, ih * 1.1, { url });
            extCount++;
          }
        }
      }
    }
    if (mine() && (extCount || intCount)) devLog(`PDF 링크 인식: 외부 ${extCount}개, 내부 이동 ${intCount}개`);
  },
  /** pdf.js 원문 뽑기가 기억한 글자 범위로 문장 상자를 정확히 만든다 */
  exact(ex, pages) {
    const sents = new Map(), sentOrder = [], pageSents = pages.map(() => []);
    this.pos = new Map();
    for (const [key, segs] of ex.spans) {
      const raw = [];
      for (const sg of segs) {
        const pg = pages[sg.page];
        const it = pg?.items?.[sg.item];
        if (!it?.str) continue;
        const [x, baseline] = pg.base.convertToViewportPoint(it.transform[4], it.transform[5]);
        const h = it.height || Math.hypot(it.transform[2], it.transform[3]) || 8;
        const L = it.str.length, w = it.width || h * L * 0.5;
        const x0 = x + (w * sg.from) / L, x1 = x + (w * sg.to) / L;
        raw.push({ p: sg.page, x: x0, y: baseline - h * 0.8, w: Math.max(1, x1 - x0), h });
      }
      const boxes = lineBoxes(raw);
      if (!boxes.length) continue;
      const unit = Number(key.split(":")[0]);
      sents.set(key, { unit, page: boxes[0].p, x: boxes[0].x, y: boxes[0].y, boxes });
      sentOrder.push(key);
      for (const b of boxes) pageSents[b.p].push({ key, b });
      if (!this.pos.has(unit)) this.pos.set(unit, { page: boxes[0].p, x: boxes[0].x, y: boxes[0].y });
    }
    this.settle(sents, sentOrder, pageSents, pages, "정확");
  },
  /** 화면 좌표에 있는 문장 (쪽 상자 안) */
  sentAt(clientX, clientY, boxEl) {
    const n = Number(boxEl.dataset.page) - 1;
    const pg = this.pages[n];
    if (!pg || !this.pageSents) return null;
    const r = boxEl.getBoundingClientRect();
    const ratio = r.width / pg.base.width;
    const x = (clientX - r.left) / ratio, y = (clientY - r.top) / ratio;
    for (const { key, b } of this.pageSents[n]) {
      if (x >= b.x - 2 && x <= b.x + b.w + 2 && y >= b.y - 1 && y <= b.y + b.h + 1) return key;
    }
    return null;
  },
  /** 문장 상자의 현재 화면 좌표 목록 (클릭 말풍선 위치용) */
  sentRects(key) {
    const s = this.sents?.get(key);
    if (!s) return [];
    const out = [];
    for (const b of s.boxes) {
      const pg = this.pages[b.p];
      if (!pg) continue;
      const r = pg.box.getBoundingClientRect();
      const ratio = r.width / pg.base.width;
      out.push({
        left: r.left + b.x * ratio,
        right: r.left + (b.x + b.w) * ratio,
        top: r.top + b.y * ratio,
        bottom: r.top + (b.y + b.h) * ratio,
        width: b.w * ratio,
        height: b.h * ratio,
      });
    }
    return out;
  },
  /** 문장 상자를 칠한다. kind: hover(가리킴) | active(고른 문장·지금 읽는 문장) */
  mark(key, kind) {
    content.querySelectorAll(`.pdf-hl--${kind}`).forEach((el) => el.remove());
    const s = key && this.sents?.get(key);
    if (!s) return;
    for (const b of s.boxes) {
      const el = document.createElement("div");
      el.className = `pdf-hl pdf-hl--${kind}`;
      el.style.left = `calc(var(--scale-factor) * ${b.x - 1.5}px)`;
      el.style.top = `calc(var(--scale-factor) * ${b.y}px)`;
      el.style.width = `calc(var(--scale-factor) * ${b.w + 3}px)`;
      el.style.height = `calc(var(--scale-factor) * ${b.h}px)`;
      this.pages[b.p]?.box.appendChild(el);
    }
  },
  /** 문장이 있는 PDF 자리로 가서 칠해 둔다 */
  gotoSent(key) {
    const s = this.sents?.get(key);
    if (!s) return this.goto(Number(String(key).split(":")[0]));
    const pg = this.pages[s.page];
    const r = pg.box.getBoundingClientRect();
    const ratio = r.height / pg.base.height;
    const vr = viewer.getBoundingClientRect();
    viewer.scrollTop = viewer.scrollTop + r.top - vr.top + s.y * ratio - vr.height * 0.25 + 24;
    this.mark(key, "active");
  },
  /** 지금 읽는 자리(본문 위에서 1/4 지점) 바로 위에서 시작하는 문장 */
  sentAtTop() {
    if (!this.sentOrder?.length) return null;
    const vr = viewer.getBoundingClientRect();
    const w = this.where(vr.top + vr.height * 0.25);
    if (!w) return null;
    let best = null, bestPage = -1, bestY = -1;
    for (const key of this.sentOrder) {
      const p = this.sents.get(key);
      if (p.page > w.page || (p.page === w.page && p.y > w.y + 4)) continue;
      if (p.page > bestPage || (p.page === bestPage && p.y >= bestY)) { best = key; bestPage = p.page; bestY = p.y; }
    }
    return best ?? this.sentOrder[0];
  },
  /** 화면 좌표 → 쪽과 그 안의 y(배율 1 기준) */
  where(clientY) {
    for (let i = 0; i < this.pages.length; i++) {
      const r = this.pages[i].box.getBoundingClientRect();
      if (clientY <= r.bottom + 10) return { page: i, y: Math.max(0, (clientY - r.top) / (r.height / this.pages[i].base.height)) };
    }
    return null;
  },
  /**
   * 지금 읽는 자리(본문 위에서 1/4 지점)의 번역 단위. 다시 짠 원문의 문단 순서가 PDF 위 순서와
   * 다를 수 있어(앞부분의 저자·소속, 2단 편집) 순서대로 훑지 않고, 그 자리 바로 위에서 시작하는 단위를 고른다.
   */
  unitAtTop() {
    if (!this.order.length) return null;
    const vr = viewer.getBoundingClientRect();
    const w = this.where(vr.top + vr.height * 0.25);
    if (!w) return null;
    let best = null, bestPage = -1, bestY = -1;
    for (const id of this.order) {
      const p = this.pos.get(id);
      if (p.page > w.page || (p.page === w.page && p.y > w.y + 4)) continue;
      if (p.page > bestPage || (p.page === bestPage && p.y >= bestY)) { best = id; bestPage = p.page; bestY = p.y; }
    }
    return best ?? this.order[0];
  },
  /** 번역 단위가 있는 PDF 자리로 가서 잠깐 표시한다 */
  goto(id) {
    const p = this.pos.get(id);
    if (!p) { toast("PDF에서 이 문단의 자리를 찾지 못했어요"); return; }
    const pg = this.pages[p.page];
    const r = pg.box.getBoundingClientRect();
    const ratio = r.height / pg.base.height;
    // 읽는 자리(본문 위에서 1/4 지점) 조금 위에 오게 해서, 따라가기가 같은 문단을 고르게 한다
    const vr = viewer.getBoundingClientRect();
    viewer.scrollTop = viewer.scrollTop + r.top - vr.top + p.y * ratio - vr.height * 0.25 + 24;
    pg.box.querySelector(".pdf-flash")?.remove();
    const flash = document.createElement("div");
    flash.className = "pdf-flash";
    // 2단이면 그 단에만, 1단이면 본문 폭에 그린다 (배율 1 좌표 × --scale-factor)
    const W = pg.base.width;
    const right = pg.twoCol && p.x > W * 0.45;
    const left = pg.twoCol ? (right ? W * 0.5 : 0) + W * 0.04 : W * 0.06;
    const width = pg.twoCol ? W * 0.44 : W * 0.88;
    flash.style.top = `calc(var(--scale-factor) * ${Math.max(0, p.y - 4)}px)`;
    flash.style.left = `calc(var(--scale-factor) * ${left}px)`;
    flash.style.width = `calc(var(--scale-factor) * ${width}px)`;
    flash.style.height = `calc(var(--scale-factor) * 44px)`;
    pg.box.appendChild(flash);
    setTimeout(() => flash.remove(), 1600);
  },
  /** PDF에 목차가 없으면 논문의 절 제목으로 목차를 만든다 */
  headingToc(pages) {
    const list = $("toc-list");
    for (const b of P.doc.blocks) {
      if (b.kind !== "heading" || b.level < 2 || b.level > 3) continue;
      const p = this.pos.get(b.unit.id);
      if (!p) continue;
      const anchor = this.anchor(pages[p.page], p.y);
      const a = document.createElement("a");
      a.href = "#";
      a.className = `l${b.level - 1}`;
      a.textContent = b.unit.sentences.join(" ");
      a.title = a.textContent;
      a.addEventListener("click", (e) => { e.preventDefault(); scrollToEl(anchor); });
      list.appendChild(a);
      tocLinks.push({ a, h: anchor });
    }
    $("toc").classList.toggle("is-empty", tocLinks.length === 0);
    updateActiveToc();
  },
};

/*
 * PDF 글 고르기 보조. pdf.js 뷰어(web/pdf_viewer.mjs의 TextLayerBuilder, Apache-2.0)와 같은 방식:
 * 글자 층 끝에 보이지 않는 칸(endOfContent)을 두고, 고르는 동안 선택 끝 바로 뒤로 옮겨 둔다.
 * 그래야 글자 사이 빈 곳을 지날 때 선택이 쪽 전체나 엉뚱한 줄로 튀지 않는다.
 */
const textSel = {
  layers: new Map(), // 글자 층 → endOfContent
  bound: false,
  prevRange: null,
  add(div) {
    const end = document.createElement("div");
    end.className = "endOfContent";
    div.append(end);
    div.addEventListener("mousedown", () => div.classList.add("selecting"));
    this.layers.set(div, end);
    this.bind();
  },
  remove(div) { this.layers.delete(div); },
  clear() { this.layers.clear(); },
  reset(end, layer) {
    layer.append(end);
    end.style.width = "";
    end.style.height = "";
    layer.classList.remove("selecting");
  },
  bind() {
    if (this.bound) return;
    this.bound = true;
    let down = false;
    const resetAll = () => this.layers.forEach((end, layer) => this.reset(end, layer));
    document.addEventListener("pointerdown", () => { down = true; });
    document.addEventListener("pointerup", () => { down = false; resetAll(); });
    window.addEventListener("blur", () => { down = false; resetAll(); });
    document.addEventListener("keyup", () => { if (!down) resetAll(); });
    document.addEventListener("selectionchange", () => {
      const sel = document.getSelection();
      if (!sel || sel.rangeCount === 0) { resetAll(); return; }
      const active = new Set();
      for (let i = 0; i < sel.rangeCount; i++) {
        const range = sel.getRangeAt(i);
        for (const layer of this.layers.keys()) if (!active.has(layer) && range.intersectsNode(layer)) active.add(layer);
      }
      for (const [layer, end] of this.layers) {
        if (active.has(layer)) layer.classList.add("selecting"); else this.reset(end, layer);
      }
      const range = sel.getRangeAt(0);
      const prev = this.prevRange;
      const modifyStart = prev && (range.compareBoundaryPoints(Range.END_TO_END, prev) === 0 || range.compareBoundaryPoints(Range.START_TO_END, prev) === 0);
      let anchor = modifyStart ? range.startContainer : range.endContainer;
      if (anchor.nodeType === Node.TEXT_NODE) anchor = anchor.parentNode;
      const layer = anchor.parentElement?.closest(".textLayer");
      const end = this.layers.get(layer);
      if (end) {
        end.style.width = layer.style.width;
        end.style.height = layer.style.height;
        anchor.parentElement.insertBefore(end, modifyStart ? anchor : anchor.nextSibling);
      }
      this.prevRange = range.cloneRange();
    });
  },
};

// 문장 단위 연결 + 자동 감지된 그림·표·수식 호버
content.addEventListener("pointermove", (e) => {
  figure.lastMouse = { x: e.clientX, y: e.clientY };
  if (!pdfView.active() || figure.capturing || figure.pending || e.buttons) return;
  if (e.target.closest?.(".pdf-link")) {
    figure.setHover(null);
    if (pdfView.hoverKey) { pdfView.hoverKey = null; pdfView.mark(null, "hover"); trView.hover(null); }
    return;
  }
  const box = e.target.closest?.(".pdf-page");
  const reg = box ? figure.regionAt(e.clientX, e.clientY, box) : null;
  figure.setHover(reg, { x: e.clientX, y: e.clientY });
  if (reg && (reg.kind === "figure" || reg.kind === "equation")) {
    if (pdfView.hoverKey) { pdfView.hoverKey = null; pdfView.mark(null, "hover"); trView.hover(null); }
    return;
  }
  const key = box ? pdfView.sentAt(e.clientX, e.clientY, box) : null;
  if (key === pdfView.hoverKey) return;
  pdfView.hoverKey = key;
  pdfView.mark(key, "hover");
  trView.hover(key);
});
content.addEventListener("pointerleave", (e) => {
  if (e.relatedTarget && figure.hoverBar.contains(e.relatedTarget)) return;
  figure.setHover(null);
  pdfView.hoverKey = null;
  pdfView.mark(null, "hover");
  trView.hover(null);
});
content.addEventListener("click", (e) => {
  if (!pdfView.active() || figure.capturing || figure.pending || Date.now() - figure.dismissedAt < 250 || getSelection()?.toString()) return;
  if (e.target.closest?.(".pdf-link")) return;
  const box = e.target.closest?.(".pdf-page");
  const reg = box ? figure.regionAt(e.clientX, e.clientY, box) : null;
  const key = box ? pdfView.sentAt(e.clientX, e.clientY, box) : null;
  if (reg && (reg.kind === "figure" || reg.kind === "equation" || !key)) {
    bubble.hide();
    figure.openPickFromRegion(reg, { x: e.clientX, y: e.clientY });
    return;
  }
  if (!key) return;
  pdfView.mark(key, "active");
  trView.showSent(key);
  const quote = sentenceText(key);
  if (quote.length >= 2) {
    bubble.showSent(`pdf:${key}`, quote, () => pdfView.sentRects(key), sentenceContext(key));
  }
});

// 확대·축소: 아래 단추, ⌘+/⌘−/⌘0(main.js), 트랙패드 핀치
$("pdf-zoom-in").addEventListener("click", () => pdfView.zoomBy(PDF_STEP));
$("pdf-zoom-out").addEventListener("click", () => pdfView.zoomBy(1 / PDF_STEP));
$("pdf-fit").addEventListener("click", () => pdfView.fitWidth());
$("pdf-back").addEventListener("click", () => {
  if (!pdfView.backState) return;
  viewer.scrollTop = pdfView.backState.scrollTop;
  pdfView.hideBack();
});
// 트랙패드 핀치는 WebKit 제스처 이벤트로 받는다. ctrl+휠 감시(passive: false)는 걸지 않는다:
// 걸면 WebKit이 스크롤마다 스크립트를 기다려서 PDF 스크롤이 뻑뻑해진다.
let pinchFrom = 1;
document.addEventListener("gesturestart", (e) => { if (pdfView.active()) { e.preventDefault(); pinchFrom = pdfView.scale; } });
document.addEventListener("gesturechange", (e) => { if (pdfView.active()) { e.preventDefault(); pdfView.zoomTo(pinchFrom * e.scale, e.clientY); } });
document.addEventListener("gestureend", (e) => { if (pdfView.active()) e.preventDefault(); });
let refitTimer = 0;
new ResizeObserver(() => { clearTimeout(refitTimer); refitTimer = setTimeout(() => pdfView.refit(), 120); }).observe(viewer);


// ───────────────────────── 서재 · 폴더 ─────────────────────────

async function refreshPapers() {
  try {
    const [papers, folders] = await Promise.all([invoke("library_list"), invoke("library_folders")]);
    P.papers = papers ?? [];
    P.folders = folders ?? [];
  } catch (e) { toast(koText(e)); }
  renderPapers();
}

async function saveFolders(next) {
  try {
    P.folders = await invoke("library_set_folders", { folders: next });
  } catch (e) { toast(koText(e)); }
  renderPapers();
}

const folderOfPaper = (paperId) => P.folders.find((f) => f.papers.includes(paperId)) ?? null;

const folderOps = {
  newId() {
    return `f-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  },
  async create(name, movePaperId = null) {
    const clean = name.trim();
    if (!clean) return;
    const base = P.folders.map((f) => ({
      ...f,
      papers: movePaperId ? f.papers.filter((id) => id !== movePaperId) : [...f.papers],
    }));
    base.push({ id: this.newId(), name: clean, papers: movePaperId ? [movePaperId] : [], open: true });
    await saveFolders(base);
    toast(movePaperId ? `"${clean}" 폴더로 옮겼어요` : `"${clean}" 폴더를 만들었어요`);
  },
  async rename(folderId, name) {
    const clean = name.trim();
    if (!clean) return renderPapers();
    const next = P.folders.map((f) => (f.id === folderId ? { ...f, name: clean } : f));
    await saveFolders(next);
  },
  async toggle(folderId) {
    const next = P.folders.map((f) => (f.id === folderId ? { ...f, open: !f.open } : f));
    await saveFolders(next);
  },
  async remove(folderId) {
    const target = P.folders.find((f) => f.id === folderId);
    if (!target) return;
    if (target.papers.length > 0) {
      const ok = T ? await T.dialog.ask(
        `"${target.name}" 폴더를 지울까요? 안의 논문 ${target.papers.length}편은 지워지지 않고 미분류 서재로 돌아가요.`,
        { title: "Graphite Paper", kind: "warning", okLabel: "폴더 지우기", cancelLabel: "취소" }
      ) : confirm(`"${target.name}" 폴더를 지울까요?`);
      if (!ok) return;
    }
    await saveFolders(P.folders.filter((f) => f.id !== folderId));
    toast(`"${target.name}" 폴더를 지웠어요`);
  },
  async movePaper(paperId, targetFolderId) {
    const prev = folderOfPaper(paperId);
    if ((prev?.id ?? null) === targetFolderId) return;
    const next = P.folders.map((f) => {
      const kept = f.papers.filter((id) => id !== paperId);
      if (f.id === targetFolderId) return { ...f, papers: [...kept, paperId], open: true };
      return { ...f, papers: kept };
    });
    await saveFolders(next);
    const dest = targetFolderId ? P.folders.find((f) => f.id === targetFolderId)?.name : null;
    toast(dest ? `"${dest}" 폴더로 옮겼어요` : "폴더에서 뺐어요");
  },
  /** 서재 목록 맨 위에 인라인 입력 줄을 열어 새 폴더를 만든다 */
  startCreate(movePaperId = null) {
    const list = $("papers-list");
    list.querySelector(".paper-folder__input-row")?.remove();
    const row = document.createElement("div");
    row.className = "paper-folder__input-row";
    row.innerHTML = `${ico("folder")}<input type="text" placeholder="새 폴더 이름" maxlength="60" aria-label="새 폴더 이름" />`;
    list.prepend(row);
    const input = row.querySelector("input");
    input.focus();
    let done = false;
    const cancel = () => { if (done) return; done = true; row.remove(); };
    const commit = async () => {
      if (done) return;
      const val = input.value.trim();
      if (!val) return cancel();
      done = true;
      row.remove();
      await this.create(val, movePaperId);
    };
    input.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancel(); }
    });
    input.addEventListener("blur", () => setTimeout(() => { if (!done && row.isConnected) cancel(); }, 120));
  },
  /** 폴더 헤더 안에서 인라인으로 이름을 바꾼다 */
  startRename(folderId, headEl) {
    const f = P.folders.find((x) => x.id === folderId);
    if (!f) return;
    const row = document.createElement("div");
    row.className = "paper-folder__input-row";
    row.innerHTML = `${ico("folder")}<input type="text" maxlength="60" aria-label="폴더 이름 바꾸기" />`;
    const input = row.querySelector("input");
    input.value = f.name;
    headEl.replaceWith(row);
    input.focus();
    input.select();
    let done = false;
    const cancel = () => { if (done) return; done = true; renderPapers(); };
    const commit = async () => {
      if (done) return;
      done = true;
      await this.rename(folderId, input.value);
    };
    input.addEventListener("keydown", (e) => {
      if (e.isComposing) return;
      if (e.key === "Enter") { e.preventDefault(); commit(); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); cancel(); }
    });
    input.addEventListener("blur", () => setTimeout(() => { if (!done && row.isConnected) commit(); }, 120));
  },
};

/** 논문 항목의 "폴더로 이동" 팝오버 메뉴 */
const folderMenu = {
  el: $("folder-menu"),
  paperId: null,
  open(paperId, anchorBtn) {
    if (this.paperId === paperId && !this.el.hidden) { this.close(); return; }
    this.paperId = paperId;
    const cur = folderOfPaper(paperId);
    this.el.replaceChildren();
    const title = document.createElement("div");
    title.className = "folder-menu__title";
    title.textContent = "폴더로 이동";
    this.el.appendChild(title);

    for (const f of P.folders) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "folder-menu__item";
      btn.setAttribute("role", "menuitem");
      const active = cur?.id === f.id;
      btn.innerHTML = `${ico("folder")}<span>${esc(f.name)}</span>${active ? ico("check", "is-check") : ""}`;
      btn.addEventListener("click", () => {
        this.close();
        folderOps.movePaper(paperId, f.id);
      });
      this.el.appendChild(btn);
    }
    if (cur) {
      const outBtn = document.createElement("button");
      outBtn.type = "button";
      outBtn.className = "folder-menu__item";
      outBtn.setAttribute("role", "menuitem");
      outBtn.innerHTML = `${ico("out")}<span>폴더에서 빼기</span>`;
      outBtn.addEventListener("click", () => {
        this.close();
        folderOps.movePaper(paperId, null);
      });
      this.el.appendChild(outBtn);
    }
    if (P.folders.length > 0) {
      const sep = document.createElement("div");
      sep.className = "folder-menu__sep";
      this.el.appendChild(sep);
    }
    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.className = "folder-menu__item";
    addBtn.setAttribute("role", "menuitem");
    addBtn.innerHTML = `${ico("folderPlus")}<span>새 폴더 만들어 옮기기…</span>`;
    addBtn.addEventListener("click", () => {
      this.close();
      folderOps.startCreate(paperId);
    });
    this.el.appendChild(addBtn);

    this.el.hidden = false;
    const r = anchorBtn.getBoundingClientRect();
    const mw = this.el.offsetWidth || 210, mh = this.el.offsetHeight || 120;
    const left = Math.min(Math.max(r.right + 6, 12), innerWidth - mw - 12);
    const top = Math.min(Math.max(r.top, 60), innerHeight - mh - 12);
    this.el.style.left = `${Math.round(left)}px`;
    this.el.style.top = `${Math.round(top)}px`;
  },
  close() {
    this.paperId = null;
    this.el.hidden = true;
  },
};
document.addEventListener("pointerdown", (e) => {
  if (!folderMenu.el.hidden && !folderMenu.el.contains(e.target) && !e.target.closest?.(".paper-item__move")) folderMenu.close();
}, true);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !folderMenu.el.hidden) { e.preventDefault(); e.stopPropagation(); folderMenu.close(); }
}, true);

/** 포인터 기반 서재 논문 드래그 앤 드롭 (macOS WKWebView의 OS 파일 드롭과 충돌 없음) */
const paperDrag = {
  state: null, // { id, title, row, x0, y0, active, ghost, dropEl }
  justDragged: 0,
  start(e, m, row) {
    if (e.button !== 0 || e.target.closest("button:not(.paper-item__main)")) return;
    if (!P.folders.length) return;
    this.state = { id: m.id, title: m.title, row, x0: e.clientX, y0: e.clientY, active: false, ghost: null, dropEl: null };
  },
  move(e) {
    const s = this.state;
    if (!s) return;
    if (!s.active) {
      if (Math.hypot(e.clientX - s.x0, e.clientY - s.y0) < 6) return;
      s.active = true;
      folderMenu.close();
      s.row.classList.add("is-dragging");
      const g = document.createElement("div");
      g.className = "paper-drag-ghost";
      g.textContent = s.title;
      document.body.appendChild(g);
      s.ghost = g;
    }
    s.ghost.style.left = `${e.clientX}px`;
    s.ghost.style.top = `${e.clientY}px`;
    const hit = document.elementFromPoint(e.clientX, e.clientY)?.closest?.("[data-drop-folder]") ?? null;
    if (s.dropEl !== hit) {
      s.dropEl?.classList.remove("is-drop");
      s.dropEl = hit;
      hit?.classList.add("is-drop");
    }
  },
  end() {
    const s = this.state;
    if (!s) return;
    this.state = null;
    if (!s.active) return;
    this.justDragged = Date.now();
    s.row.classList.remove("is-dragging");
    s.ghost?.remove();
    const target = s.dropEl?.dataset.dropFolder ?? null;
    s.dropEl?.classList.remove("is-drop");
    if (target) folderOps.movePaper(s.id, target === "__uncat__" ? null : target);
  },
};
window.addEventListener("pointermove", (e) => paperDrag.move(e));
window.addEventListener("pointerup", () => paperDrag.end());
window.addEventListener("pointercancel", () => paperDrag.end());

function paperItemEl(m) {
  const row = document.createElement("div");
  row.className = "paper-item";
  row.dataset.paperId = m.id;
  if (P.doc?.id === m.id && P.view === "doc") row.setAttribute("aria-current", "page");
  if (m.read) row.classList.add("is-read");
  row.innerHTML =
    `<button class="paper-item__main" type="button" title="${esc(m.title)}">` +
    `<span class="paper-item__title">${esc(m.title)}</span>` +
    `<span class="paper-item__meta">${esc(m.source)}</span></button>` +
    `<button class="paper-item__move t-iconbtn t-iconbtn--sm" type="button" title="폴더로 이동" aria-label="폴더로 이동">${ico("folder")}</button>` +
    `<button class="paper-item__read t-iconbtn t-iconbtn--sm" type="button" aria-pressed="${!!m.read}" title="${m.read ? "읽음 표시 지우기" : "다 읽음으로 표시"}" aria-label="다 읽음">${ico("check")}</button>` +
    `<button class="paper-item__del t-iconbtn t-iconbtn--sm" type="button" title="서재에서 지우기" aria-label="서재에서 지우기">${ico("trash")}</button>`;
  row.addEventListener("pointerdown", (e) => paperDrag.start(e, m, row));
  row.querySelector(".paper-item__main").addEventListener("click", () => {
    if (Date.now() - paperDrag.justDragged < 250) return;
    openPaper(m.id);
  });
  row.querySelector(".paper-item__move").addEventListener("click", (e) => {
    e.stopPropagation();
    folderMenu.open(m.id, e.currentTarget);
  });
  row.querySelector(".paper-item__read").addEventListener("click", async () => {
    try { await invoke("library_set_read", { id: m.id, read: !m.read }); await refreshPapers(); } catch (e) { toast(koText(e)); }
  });
  row.querySelector(".paper-item__del").addEventListener("click", async () => {
    const ok = T ? await T.dialog.ask(`"${m.title}"을(를) 서재에서 지울까요? 번역과 요약도 함께 지워져요.`,
      { title: "Graphite Paper", kind: "warning", okLabel: "지우기", cancelLabel: "취소" }) : confirm("지울까요?");
    if (!ok) return;
    try {
      await invoke("library_remove", { id: m.id });
      if (P.doc?.id === m.id) closePaper();
      await refreshPapers();
    } catch (e) { toast(koText(e)); }
  });
  return row;
}

function renderPapers() {
  const list = $("papers-list");
  list.replaceChildren();
  $("papers-empty").hidden = P.papers.length > 0 || P.folders.length > 0;

  const byId = new Map(P.papers.map((m) => [m.id, m]));
  const inFolder = new Set();

  for (const f of P.folders) {
    const items = f.papers.map((id) => byId.get(id)).filter(Boolean);
    for (const m of items) inFolder.add(m.id);
    const hasCurrent = P.view === "doc" && P.doc?.id && items.some((m) => m.id === P.doc.id);

    const sec = document.createElement("div");
    sec.className = `paper-folder${f.open ? " is-open" : ""}`;
    sec.dataset.dropFolder = f.id;

    const head = document.createElement("div");
    head.className = "paper-folder__head";
    head.innerHTML =
      `<button class="paper-folder__toggle" type="button" aria-expanded="${!!f.open}">` +
      `${ico("chev", "paper-folder__chev")}${ico("folder", "paper-folder__ico")}` +
      `<span class="paper-folder__name">${esc(f.name)}</span>` +
      `${!f.open && hasCurrent ? '<span class="paper-folder__dot" aria-hidden="true"></span>' : ""}` +
      `<span class="paper-folder__count">${items.length}</span></button>` +
      `<div class="paper-folder__acts">` +
      `<button class="t-iconbtn t-iconbtn--sm" type="button" data-act="rename" title="이름 바꾸기" aria-label="이름 바꾸기">${ico("edit")}</button>` +
      `<button class="t-iconbtn t-iconbtn--sm" type="button" data-act="del" title="폴더 지우기" aria-label="폴더 지우기">${ico("trash")}</button>` +
      `</div>`;
    head.querySelector(".paper-folder__toggle").addEventListener("click", () => folderOps.toggle(f.id));
    head.querySelector(".paper-folder__name").addEventListener("dblclick", (e) => {
      e.stopPropagation();
      folderOps.startRename(f.id, head);
    });
    head.querySelector('[data-act="rename"]').addEventListener("click", (e) => {
      e.stopPropagation();
      folderOps.startRename(f.id, head);
    });
    head.querySelector('[data-act="del"]').addEventListener("click", (e) => {
      e.stopPropagation();
      folderOps.remove(f.id);
    });
    sec.appendChild(head);

    const body = document.createElement("div");
    body.className = "paper-folder__body";
    body.hidden = !f.open;
    if (items.length) {
      for (const m of items) body.appendChild(paperItemEl(m));
    } else {
      const empty = document.createElement("div");
      empty.className = "paper-folder__empty";
      empty.textContent = "논문을 끌어다 넣으세요";
      body.appendChild(empty);
    }
    sec.appendChild(body);
    list.appendChild(sec);
  }

  const uncat = P.papers.filter((m) => !inFolder.has(m.id));
  if (P.folders.length > 0) {
    const box = document.createElement("div");
    box.className = "papers-uncat";
    box.dataset.dropFolder = "__uncat__";
    if (uncat.length) {
      const lbl = document.createElement("div");
      lbl.className = "papers-uncat__label";
      lbl.textContent = "미분류";
      box.appendChild(lbl);
      for (const m of uncat) box.appendChild(paperItemEl(m));
    }
    list.appendChild(box);
  } else {
    for (const m of uncat) list.appendChild(paperItemEl(m));
  }
}

$("btn-new-folder").addEventListener("click", () => folderOps.startCreate());

function closePaper() {
  stopPoll();
  pdfView.stop();
  P.doc = null; P.status = null; P.tr = {};
  state.doc = null;
  ask.clearPaper();
  trView.render();
  setView("doc");
}

// ───────────────────────── 열기 ─────────────────────────

/** 서재에 있는 논문을 연다. 본문은 원본 PDF, 번역은 오른쪽 사이드 뷰. start면 번역도 시작한다 */
async function openPaper(id, { start = false } = {}) {
  if (!(await confirmDiscard("저장하지 않은 변경이 있어요. 버리고 논문을 열까요?"))) return;
  const seq = ++P.openSeq;
  stopPoll();
  try {
    const same = P.doc?.id === id && isPaper();
    const d = same ? P.doc : await invoke("library_get", { id });
    if (seq !== P.openSeq) return;
    invoke("close_markdown").catch(() => {});
    bubble.hide();
    figure.setMode(false);
    figure.close();
    if (!same) { ask.loadForPaper(id); P.needExtract = false; }
    P.doc = d;
    P.mode = "plain"; // 번역 탭은 원문에 충실한 번역. 쉬운 설명은 질문 탭에서 문단마다 묻는다
    P.tr = {}; P.status = null;
    state.doc = { kind: "paper", id, path: `paper:${id}`, name: d.title, dir: "", raw: "", source: d.source };
    state.raw = state.savedRaw = "";
    state.editing = false; state.dirty = false; state.guard = false;
    hideBanner();
    P.view = "doc"; app.dataset.view = "doc";
    updateChrome();
    renderPapers();
    files.markCurrent?.();
    trView.render();
    if (!same) { viewer.scrollTop = 0; renderReader(); }
    if (start) rside.show("tr");
    await loadTranslation({ start });
  } catch (e) {
    if (seq === P.openSeq) toast(koText(e));
  }
}

/** 새로 가져온 논문: 서재를 새로 읽고 연다. 모델이 준비돼 있으면 번역도 바로 시작한다 */
async function imported(meta) {
  if (!meta) return;
  await refreshPapers();
  const ready = P.llm && !P.llm.problem;
  // PDF는 화면이 pdf.js 원문을 뽑아 바꾼 뒤에 번역을 시작한다 (extractFlow → applyExtract)
  const pdf = meta.id.startsWith("pdf-");
  P.autoStart = !!ready && pdf;
  await openPaper(meta.id, { start: !!ready && !pdf });
  if (!ready) toast("모델 설정을 마치면 번역할 수 있어요");
}

async function importPdf(path) {
  if (!(await confirmDiscard("저장하지 않은 변경이 있어요. 버리고 논문을 열까요?"))) return;
  const seq = loading.show("PDF를 읽고 있어요");
  try {
    const meta = await invoke("open_pdf_path", { path });
    loading.hide(seq);
    await imported(meta);
  } catch (e) {
    loading.hide(seq);
    toast(koText(e));
  }
}

async function pickPdf() {
  if (!T) return;
  const path = await T.dialog.open({ multiple: false, directory: false, filters: [{ name: "논문 PDF", extensions: ["pdf"] }] });
  if (typeof path === "string") importPdf(path);
}

/** arXiv 번호·링크, 다른 논문 사이트 링크, DOI */
async function importLink(input) {
  const seq = loading.show(looksLikeArxivId(input) ? "arXiv에서 논문을 가져오고 있어요" : "논문을 가져오고 있어요");
  try {
    const meta = await invoke("open_arxiv", { input });
    loading.hide(seq);
    await imported(meta);
    return true;
  } catch (e) {
    loading.hide(seq);
    toast(koText(e));
    return false;
  }
}

/** arXiv 번호로 연다: 서재에 있으면 그대로, 없으면 가져와서 번역 */
async function openArxivHit(id) {
  const saved = P.papers.find((p) => arxivIdOf(p.id) === id);
  if (saved) return openPaper(saved.id);
  return importLink(id);
}

// 링크로 열기 (⌘L)
const linkDialog = {
  el: $("link-dialog"),
  input: $("link-input"),
  show() { this.el.hidden = false; this.input.value = ""; this.input.focus(); },
  close() { this.el.hidden = true; },
  async submit() {
    const text = this.input.value.trim();
    if (!text) { this.input.focus(); return; }
    if (!looksLikeArxivId(text) && !looksLikePaperLink(text)) {
      // 링크가 아니면 arXiv 검색으로 넘긴다 (OpenPaper의 입력창과 같은 동작)
      this.close();
      setView("search");
      $("arxiv-input").value = text;
      arxivSearch.run(text, 0);
      return;
    }
    this.close();
    const ok = await importLink(text);
    if (!ok) { this.show(); this.input.value = text; }
  },
};
$("link-form").addEventListener("submit", (e) => { e.preventDefault(); linkDialog.submit(); });
$("link-cancel").addEventListener("click", () => linkDialog.close());
linkDialog.el.addEventListener("mousedown", (e) => { if (e.target === linkDialog.el) linkDialog.close(); });
linkDialog.el.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); linkDialog.close(); } });

// ───────────────────────── 번역 ─────────────────────────

function stopPoll() { clearInterval(P.poll); P.poll = 0; }
function startPoll() {
  stopPoll();
  const id = P.doc.id, mode = P.mode, lang = P.lang;
  P.poll = setInterval(async () => {
    try {
      const s = await invoke("translation_status", { id, mode, lang });
      if (P.doc?.id !== id || P.mode !== mode || P.lang !== lang) return stopPoll();
      P.status = s;
      trView.fill(s.units);
      trView.status();
      if (!s.running) {
        stopPoll();
        if (s.error) toast(koText(s.error));
        else if (s.total) toast(P.mode === "easy" ? "쉬운 설명을 다 만들었어요" : "번역을 마쳤어요");
      }
    } catch { /* 다음 차례에 다시 */ }
  }, 1200);
}

/** 지금 논문·모드·언어의 번역을 불러와 사이드 뷰에 그린다. start면 시작도 한다 */
async function loadTranslation({ start = false, redo = false } = {}) {
  if (!P.doc) return;
  const id = P.doc.id, mode = P.mode, lang = P.lang;
  const seq = ++P.trSeq;
  stopPoll();
  try {
    if (redo) await invoke("translation_redo", { id, lang });
    else if (start) await invoke("translation_start", { id, mode, lang });
    const s = await invoke("translation_status", { id, mode, lang });
    if (seq !== P.trSeq) return;
    P.status = s;
    P.tr = s.units;
    trView.render();
    if (s.running) startPoll();
  } catch (e) {
    if (seq === P.trSeq) toast(koText(e));
  }
}

function startTranslation({ redo = false } = {}) {
  if (!P.doc) return;
  if (P.llm?.problem) { modelDialog.show(); return; }
  rside.show("tr");
  loadTranslation({ start: !redo, redo });
}

async function cancelTranslation() {
  if (!P.doc) return;
  await invoke("translation_cancel", { id: P.doc.id, mode: P.mode, lang: P.lang }).catch(() => {});
}

$("tr-start").addEventListener("click", () => startTranslation());
$("tr-reextract-btn").addEventListener("click", async () => {
  if (P.status?.running) { toast("번역을 멈춘 뒤에 다시 뽑을 수 있어요"); return; }
  const ok = T ? await T.dialog.ask("원문을 PDF 글자 기준으로 다시 뽑고 처음부터 번역할까요? 지금 번역은 지워져요.",
    { title: "Graphite Paper", kind: "warning", okLabel: "다시 뽑고 번역", cancelLabel: "취소" }) : true;
  if (!ok) return;
  if (P.llm?.problem) { await applyExtract({ start: false }); modelDialog.show(); return; }
  applyExtract({ start: true });
});
$("tr-empty-start").addEventListener("click", () => startTranslation());
$("tr-stop").addEventListener("click", cancelTranslation);
$("btn-redo").addEventListener("click", () => startTranslation({ redo: true }));

// ───────────────────────── 오른쪽 사이드 뷰: 번역 / 질문 ─────────────────────────

const rside = {
  tab: store.get("paper.sideTab", "tr"),
  isOpen(tab) { return app.classList.contains("rside-open") && (!tab || this.tab === tab); },
  show(tab = this.tab) {
    this.tab = tab;
    store.set("paper.sideTab", tab);
    app.classList.add("rside-open");
    app.dataset.rtab = tab;
    store.set("paper.sideOpen", true);
    this.sync();
    if (tab === "ask") { ask.render(); setTimeout(() => ask.input.focus(), 0); }
    else trView.follow(true);
  },
  hide() {
    app.classList.remove("rside-open");
    store.set("paper.sideOpen", false);
    this.sync();
  },
  toggle(tab) {
    if (this.isOpen(tab ?? undefined) || (!tab && this.isOpen())) this.hide();
    else this.show(tab ?? this.tab);
  },
  sync() {
    $("btn-side").setAttribute("aria-pressed", String(this.isOpen()));
    $("rside-tabs").querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.tab === this.tab)));
    pdfView.refit();
  },
};
$("btn-side").addEventListener("click", () => rside.toggle());
$("rside-close").addEventListener("click", () => rside.hide());
$("rside-tabs").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-tab]");
  if (b) rside.show(b.dataset.tab);
});

// ───────────────────────── 상단 바 ─────────────────────────
// 버튼은 언제나 같은 자리에 있다. 쓸 수 없을 때는 숨기지 않고 흐리게(disabled) 둔다.

function paperBar() {
  const paper = isPaper() && P.view === "doc";
  $("btn-figure").disabled = !paper;
  $("btn-roadmap").disabled = !isPaper();
  $("btn-arxiv").disabled = !arxivIdOf(P.doc?.id) || !isPaper();
  $("btn-search").disabled = !state.doc || P.view !== "doc";
  app.classList.toggle("paper-doc", paper);
  if (!paper) figure.setMode(false);
  trView.status();
}

$("btn-arxiv").addEventListener("click", () => {
  const id = arxivIdOf(P.doc?.id);
  if (id) invoke("open_arxiv_page", { id }).catch((e) => toast(koText(e)));
});
$("btn-roadmap").addEventListener("click", () => P.doc && isPaper() && roadmap.show(P.doc.id, P.doc.title));

/** main.js의 updateChrome이 부른다: 제목줄·사이드바를 논문 화면에 맞춘다 */
function paperChrome() {
  app.classList.toggle("is-paper", isPaper());
  const titles = { ai: "AI로 논문 찾기", search: "arXiv 검색", roadmap: "읽기 로드맵" };
  if (P.view !== "doc") {
    $("doc-name").textContent = titles[P.view];
    $("doc-name").title = "";
    app.classList.remove("no-doc");
    document.title = `${titles[P.view]} — Graphite Paper`;
  }
  paperBar();
  renderPapersCurrent();
}
function renderPapersCurrent() {
  $("papers-list").querySelectorAll(".paper-item").forEach((row, i) => {
    const m = P.papers[i];
    if (m && P.doc?.id === m.id && P.view === "doc" && isPaper()) row.setAttribute("aria-current", "page");
    else row.removeAttribute("aria-current");
  });
  document.querySelectorAll(".papers-nav button[data-view]").forEach((b) =>
    b.setAttribute("aria-current", String(b.dataset.view === P.view)));
}

// ───────────────────────── 언어 ─────────────────────────

async function loadLangs() {
  try { P.langs = await invoke("languages"); } catch { P.langs = []; }
  if (!P.langs.some((l) => l.code === P.lang)) P.lang = P.langs.some((l) => l.code === "ko") ? "ko" : P.langs[0]?.code ?? "ko";
  const sel = $("lang-select");
  sel.replaceChildren(...P.langs.map((l) => new Option(`${l.native} · ${l.name}`, l.code)));
  sel.value = P.lang;
  $("lang-label").textContent = langName();
}
$("lang-select").addEventListener("change", (e) => {
  P.lang = e.target.value;
  store.set("paper.lang", P.lang);
  $("lang-label").textContent = langName();
  if (P.doc && isPaper()) loadTranslation();
});

// ───────────────────────── 모델 ─────────────────────────

const IS_WIN = /Win/i.test(navigator.platform || navigator.userAgent);

const SLOT_GROUPS = [
  {
    title: "구독 · CLI",
    items: [
      {
        slot: "claude-code", provider: "claude-code", badge: "CC", name: "Claude Code", kind: "구독 CLI",
        short: "Claude 구독",
        desc: "이 컴퓨터에 로그인한 Claude Code 구독으로 번역과 질문을 해요. 별도 API 키가 필요 없어요.",
        steps: [
          {
            label: IS_WIN ? "1. 설치 (PowerShell)" : "1. 설치",
            cmd: IS_WIN
              ? "irm https://claude.ai/install.ps1 | iex"
              : "curl -fsSL https://claude.ai/install.sh | bash",
          },
          { label: "2. 로그인", cmd: "claude auth login" },
        ],
      },
      {
        slot: "codex", provider: "codex", badge: "Cx", name: "Codex", kind: "구독 CLI",
        short: "ChatGPT 구독",
        desc: "Codex CLI 또는 ChatGPT 데스크톱 앱에 로그인한 ChatGPT 구독으로 연결해요.",
        steps: [
          { label: "1. 설치 (또는 ChatGPT 앱 설치)", cmd: "npm install -g @openai/codex" },
          { label: "2. 로그인", cmd: "codex login" },
        ],
      },
      {
        slot: "gemini-cli", provider: "gemini-cli", badge: "GC", name: "Gemini CLI", kind: "구독 CLI",
        short: "Google 계정",
        desc: "Google Gemini CLI에 로그인한 Google 계정으로 연결해요. 도구 실행 없이 순수 텍스트 호출만 사용해요.",
        steps: [
          { label: "1. 설치", cmd: "npm install -g @google/gemini-cli" },
          { label: "2. Google 계정 로그인", cmd: "gemini" },
        ],
      },
    ],
  },
  {
    title: "클라우드 API",
    items: [
      {
        slot: "openai:gemini", provider: "openai", preset: "gemini", badge: "Ge", name: "Google Gemini", kind: "API 키",
        short: "Gemini 2.5 · AI Studio",
        desc: "Google AI Studio API 키로 Gemini 2.5 모델을 바로 연결해요. 빠르고 긴 논문 번역에 잘 맞아요.",
        keyHint: "AIza…로 시작하는 Google AI Studio API 키를 붙여 넣으세요",
        customPh: "예: gemini-2.5-pro, gemini-2.5-flash",
      },
      {
        slot: "anthropic", provider: "anthropic", badge: "An", name: "Anthropic", kind: "API 키",
        short: "Claude API",
        desc: "내 Anthropic API 키로 Claude 모델을 직접 호출해요.",
        keyHint: "sk-ant-…로 시작하는 Anthropic API 키를 붙여 넣으세요",
        customPh: "예: claude-sonnet-5-5",
      },
      {
        slot: "openai:openai", provider: "openai", preset: "openai", badge: "OA", name: "OpenAI", kind: "API 키",
        short: "GPT · o-시리즈",
        desc: "내 OpenAI API 키로 GPT 및 추론 모델을 연결해요.",
        keyHint: "sk-…로 시작하는 OpenAI API 키를 붙여 넣으세요",
        customPh: "예: gpt-4.1-mini, gpt-4.1",
      },
      {
        slot: "openai:openrouter", provider: "openai", preset: "openrouter", badge: "OR", name: "OpenRouter", kind: "API 키",
        short: "멀티 모델 게이트웨이",
        desc: "OpenRouter 키 하나로 Claude, Gemini, GPT 등 여러 회사의 모델을 골라 써요.",
        keyHint: "sk-or-…로 시작하는 OpenRouter API 키를 붙여 넣으세요",
        customPh: "예: google/gemini-2.5-flash",
      },
      {
        slot: "openai:deepseek", provider: "openai", preset: "deepseek", badge: "DS", name: "DeepSeek", kind: "API 키",
        short: "DeepSeek API",
        desc: "DeepSeek API 키로 빠르고 경제적으로 논문을 번역해요.",
        keyHint: "sk-…로 시작하는 DeepSeek API 키를 붙여 넣으세요",
        customPh: "예: deepseek-chat, deepseek-reasoner",
      },
      {
        slot: "openai:opengateway", provider: "openai", preset: "opengateway", badge: "OG", name: "OpenGateway", kind: "API 키",
        short: "통합 API",
        desc: "OpenGateway API 키로 여러 모델을 한곳에서 호출해요.",
        keyHint: "OpenGateway API 키를 붙여 넣으세요",
        customPh: "예: anthropic/claude-sonnet-5-5",
      },
    ],
  },
  {
    title: "로컬 · 직접 연결",
    items: [
      {
        slot: "openai:ollama", provider: "openai", preset: "ollama", badge: "Ol", name: "Ollama (로컬)", kind: "로컬 서버",
        short: "localhost:11434",
        desc: "이 컴퓨터에서 실행 중인 Ollama 로컬 모델로 오프라인 번역과 질문을 해요.",
        customPh: "예: qwen2.5:14b, llama3.3",
      },
      {
        slot: "openai:custom", provider: "openai", preset: "custom", badge: "Cu", name: "직접 입력 (Custom)", kind: "직접 연결",
        short: "OpenAI 호환 주소",
        desc: "사내 프록시, LM Studio, vLLM 등 OpenAI 호환 API 주소를 직접 입력해 연결해요.",
        keyHint: "인증이 필요한 서버라면 API 키를 입력하세요 (선택)",
        customPh: "서버에서 제공하는 모델 ID 입력",
        optionalKey: true,
      },
    ],
  },
];
const ALL_SLOTS = SLOT_GROUPS.flatMap((g) => g.items);
const slotMeta = (slot) => ALL_SLOTS.find((x) => x.slot === slot) ?? ALL_SLOTS[0];

/** 공식 브랜드 로고 SVG 파일 (src/icons/providers/) */
const PROVIDER_ICONS = {
  "claude-code": { file: "claude-color.svg" },
  codex: { file: "codex-color.svg", full: true },
  "gemini-cli": { file: "geminicli-color.svg", full: true },
  "openai:gemini": { file: "gemini-color.svg" },
  anthropic: { file: "anthropic.svg", mono: true },
  "openai:openai": { file: "openai.svg", mono: true },
  "openai:openrouter": { file: "openrouter.svg", mono: true },
  "openai:deepseek": { file: "deepseek-color.svg" },
  "openai:opengateway": { file: "opengateway.svg", full: true },
  "openai:ollama": { file: "ollama.svg", mono: true },
};

/** 공급자별 공식 브랜드 로고 */
function providerLogo(slot) {
  const info = PROVIDER_ICONS[slot];
  if (info) {
    const cls = `provider-ico${info.mono ? " is-mono" : ""}${info.full ? " is-full" : ""}`;
    return `<img class="${cls}" src="icons/providers/${info.file}" alt="" draggable="false" />`;
  }
  return `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.8"/><path fill="none" stroke="currentColor" stroke-width="1.7" d="M3.5 12h17M12 3c2.5 2.6 3.7 5.6 3.7 9s-1.2 6.4-3.7 9c-2.5-2.6-3.7-5.6-3.7-9S9.5 5.6 12 3Z"/></svg>`;
}

/** 목록을 불러오기 전에 보여 줄 추천 모델 */
const KNOWN = {
  "claude-code": [
    { id: "sonnet", name: "Sonnet 5.5", note: "균형이 좋아요. 대부분의 논문에 알맞아요" },
    { id: "opus", name: "Opus 5.5", note: "가장 뛰어나요. 느리고 사용량을 더 써요" },
    { id: "haiku", name: "Haiku 5.5", note: "가장 빠르고 사용량을 적게 써요" },
  ],
  codex: [{ id: "", name: "Codex 기본 모델", note: "Codex가 내 계정에 맞춰 골라요" }],
  "gemini-cli": [
    { id: "", name: "Gemini CLI 기본 모델 (auto)", note: "계정 기본 모델로 자동 선택해요" },
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", note: "가장 뛰어나요. 복잡한 수식·추론에 좋아요" },
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", note: "빠르고 균형이 좋아요" },
    { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash-Lite", note: "가장 빠르고 가벼워요" },
  ],
  "openai:gemini": [
    { id: "gemini-2.5-flash", name: "Gemini 2.5 Flash", note: "추천 · 빠르고 번역 품질이 좋아요" },
    { id: "gemini-2.5-pro", name: "Gemini 2.5 Pro", note: "가장 뛰어나요. 수식·심층 질문에 강해요" },
    { id: "gemini-2.5-flash-lite", name: "Gemini 2.5 Flash-Lite", note: "가장 빠르고 저렴해요" },
  ],
  anthropic: [
    { id: "claude-sonnet-5-5", name: "Claude Sonnet 5.5", note: "균형이 좋아요" },
    { id: "claude-opus-5-5", name: "Claude Opus 5.5", note: "가장 뛰어나요. 논문당 비용이 더 들어요" },
    { id: "claude-haiku-5-5", name: "Claude Haiku 5.5", note: "가장 빠르고 저렴해요" },
  ],
  "openai:openai": [
    { id: "gpt-4.1-mini", name: "GPT-4.1 mini", note: "빠르고 경제적이에요" },
    { id: "gpt-4.1", name: "GPT-4.1", note: "정확하고 자연스러워요" },
    { id: "o4-mini", name: "o4-mini", note: "추론에 강해요" },
  ],
  "openai:deepseek": [
    { id: "deepseek-chat", name: "DeepSeek Chat", note: "빠르고 저렴해요" },
    { id: "deepseek-reasoner", name: "DeepSeek Reasoner", note: "추론형 모델" },
  ],
  "openai:opengateway": [
    { id: "anthropic/claude-sonnet-5-5", name: "Claude Sonnet 5.5", note: "기본 추천 모델" },
  ],
};

const slotOf = (s) => (s.provider === "openai" ? `openai:${s.preset}` : s.provider);
const modelLabelFor = (slot, model) => {
  const k = KNOWN[slot]?.find((m) => m.id === model);
  if (k?.name) return k.name;
  if (model) return model;
  if (slot === "codex") return "Codex 기본 모델";
  if (slot === "gemini-cli") return "Gemini CLI 기본 모델";
  return "모델을 고르지 않았어요";
};
const modelLabel = (st) => modelLabelFor(st.provider === "openai" ? `openai:${st.preset}` : st.provider, st.model);

const PROBLEM_TEXT = {
  "claude-code:missing": "Claude Code가 설치되어 있지 않아요. 아래 명령어로 설치한 뒤 로그인해 주세요.",
  "claude-code:logged-out": "Claude Code에 로그인되어 있지 않아요. 터미널에서 claude auth login 을 실행한 뒤 다시 확인해 주세요.",
  "codex:missing": "Codex가 설치되어 있지 않아요. Codex CLI나 ChatGPT 앱을 설치해 주세요.",
  "codex:logged-out": "Codex에 로그인되어 있지 않아요. 터미널에서 codex login 을 실행해 주세요.",
  "gemini-cli:missing": "Gemini CLI가 설치되어 있지 않아요. 터미널에서 @google/gemini-cli 를 설치하거나, Google Gemini API를 사용해 보세요.",
  "gemini-cli:logged-out": "Gemini CLI에 Google 계정이 로그인되어 있지 않아요. 터미널에서 gemini 를 실행해 로그인해 주세요.",
  "no-key": "{label} API 키가 필요해요.",
  "no-model": "{label} 모델을 골라 주세요.",
  "bad-url": "API 주소를 넣어 주세요. 외부 주소는 https://로 시작해야 해요.",
};
const PROBLEM_SHORT = {
  missing: "미설치",
  "logged-out": "로그인 필요",
  "no-key": "키 필요",
  "no-model": "모델 필요",
  "bad-url": "주소 필요",
};
function problemTextFor(provider, label, problem) {
  if (!problem) return "";
  const t = PROBLEM_TEXT[`${provider}:${problem}`] ?? PROBLEM_TEXT[problem] ?? problem;
  return fill(t, { label });
}
function problemText(st) {
  return st?.problem ? problemTextFor(st.provider, st.label, st.problem) : "";
}

async function checkLlm() {
  try { P.llm = await invoke("llm_status"); } catch (e) { P.llm = null; }
  const btn = $("btn-model");
  const st = P.llm;
  const activeSlot = st ? (st.provider === "openai" ? `openai:${st.preset}` : st.provider) : "claude-code";
  $("model-logo").innerHTML = providerLogo(activeSlot);
  $("model-name").textContent = st ? modelLabel(st) : "모델 확인 못 함";
  $("model-provider").textContent = st ? (st.backup ? `${st.label} → ${st.backup.label}` : st.label) : "";
  btn.classList.toggle("has-problem", !!st?.problem);
  btn.title = st?.problem ? problemText(st) : "모델 연결";
  const notice = $("llm-notice");
  notice.hidden = !st?.problem;
  $("llm-notice-text").textContent = problemText(st);
  if (modelDialog.open) modelDialog.renderActivePill();
}
// 다른 앱/터미널에서 로그인하고 돌아오면 다시 확인한다
window.addEventListener("focus", () => {
  if (P.llm?.problem) checkLlm();
  if (modelDialog.open) modelDialog.refreshOverview();
});

const modelDialog = {
  el: $("model-dialog"),
  open: false,
  cfg: null,
  overview: {},
  viewing: "claude-code",
  modelsBySlot: new Map(),
  loadingModels: false,
  testMsg: { text: "", kind: "" },
  async show() {
    this.el.hidden = false;
    this.open = true;
    this.setTest("", "");
    try { this.cfg = await invoke("llm_settings"); } catch (e) { toast(koText(e)); return; }
    this.viewing = slotOf(this.cfg.settings);
    this.render();
    this.refreshOverview();
    this.loadModels(this.viewing);
  },
  close() { this.el.hidden = true; this.open = false; checkLlm(); },
  async refreshOverview() {
    try { this.overview = await invoke("llm_overview"); } catch { /* ignore */ }
    if (this.open) this.render();
  },
  setTest(text, kind = "") {
    this.testMsg = { text, kind };
    const el = $("model-test-result");
    el.textContent = text || "이 공급자로 짧은 요청을 보내 연결을 확인해요";
    el.className = `mdet-test-result${kind ? ` is-${kind}` : ""}`;
  },
  selectSlot(slot) {
    if (this.viewing === slot) return;
    this.viewing = slot;
    $("model-key").value = "";
    $("model-key").type = "password";
    $("model-custom").value = "";
    this.setTest("", "");
    this.render();
    this.loadModels(slot);
  },
  async save(settings) {
    try { this.cfg = await invoke("llm_set_settings", { settings }); } catch (e) { toast(koText(e)); return; }
    this.render();
    checkLlm();
    this.refreshOverview();
  },
  async activate(slot) {
    const s = this.cfg?.settings;
    if (!s) return;
    const meta = slotMeta(slot);
    const models = { ...(s.models ?? {}) };
    if (!models[slot] && !this.resolvedModel(slot) && $("model-pick").value) {
      models[slot] = $("model-pick").value;
    }
    const next = { ...s, provider: meta.provider, preset: meta.preset ?? s.preset, models };
    await this.save(next);
    toast(`${meta.name}로 전환했어요`);
  },
  resolvedModel(slot) {
    const s = this.cfg.settings;
    const explicit = (s.models?.[slot] ?? "").trim();
    if (explicit) return explicit;
    if (this.overview[slot]?.model) return this.overview[slot].model;
    if (slot === "claude-code") return "sonnet";
    if (slot === "anthropic") return "claude-sonnet-5-5";
    const meta = slotMeta(slot);
    if (meta.preset) return this.cfg.presets.find((p) => p.id === meta.preset)?.model ?? "";
    return "";
  },
  renderActivePill() {
    const pill = $("model-active-pill");
    const st = P.llm;
    if (!st) { pill.textContent = "확인 중…"; pill.classList.remove("is-problem"); return; }
    pill.textContent = st.problem
      ? `${st.label} · ${PROBLEM_SHORT[st.problem] ?? "설정 필요"}`
      : `현재: ${st.label} · ${modelLabel(st)}`;
    pill.classList.toggle("is-problem", !!st.problem);
  },
  render() {
    if (!this.cfg) return;
    const s = this.cfg.settings;
    const activeSlot = slotOf(s);
    const backups = s.backups ?? [];
    this.renderActivePill();

    // 왼쪽 공급자 목록
    const nav = $("model-nav");
    nav.replaceChildren(...SLOT_GROUPS.map((g) => {
      const wrap = document.createElement("div");
      wrap.className = "mnav-group";
      const lbl = document.createElement("div");
      lbl.className = "mnav-label";
      lbl.textContent = g.title;
      wrap.appendChild(lbl);
      for (const item of g.items) {
        const ov = this.overview[item.slot];
        const isActive = item.slot === activeSlot;
        const isBackup = !isActive && backups.includes(item.slot);
        const dotCls = !ov ? "is-off" : !ov.problem ? "is-ok" : ov.problem === "missing" ? "is-off" : "is-warn";
        const b = document.createElement("button");
        b.type = "button";
        b.className = "mnav-item";
        b.setAttribute("aria-selected", String(this.viewing === item.slot));
        const subText = ov?.problem ? (PROBLEM_SHORT[ov.problem] ?? item.short) : (ov ? "준비됨" : item.short);
        b.innerHTML = `<span class="mnav-badge">${providerLogo(item.slot)}</span>`
          + `<span class="mnav-text"><span class="mnav-name">${esc(item.name)}`
          + `${isActive ? '<span class="mnav-pill">사용 중</span>' : isBackup ? '<span class="mnav-pill mnav-pill--bak">백업</span>' : ""}`
          + `</span><span class="mnav-sub">${esc(subText)}</span></span>`
          + `<span class="mnav-dot ${dotCls}" title="${esc(subText)}"></span>`;
        b.addEventListener("click", () => this.selectSlot(item.slot));
        wrap.appendChild(b);
      }
      return wrap;
    }));

    // 오른쪽 상세 패널
    const slot = this.viewing;
    const meta = slotMeta(slot);
    const preset = meta.preset ? this.cfg.presets.find((p) => p.id === meta.preset) : null;
    const ov = this.overview[slot];
    const isActive = slot === activeSlot;

    $("mdet-logo").innerHTML = providerLogo(slot);
    $("mdet-name").textContent = meta.name;
    $("mdet-kind").textContent = meta.kind;
    $("mdet-desc").textContent = meta.desc;
    $("mdet-inuse").hidden = !isActive;
    $("mdet-use").hidden = isActive;
    $("mdet-foot-use").textContent = isActive ? "완료" : "이 모델로 사용";

    // 상태 카드
    const dot = $("mdet-dot");
    const problem = ov?.problem ?? null;
    dot.className = `mdet-dot ${!ov ? "is-off" : !problem ? "is-ok" : problem === "missing" ? "is-off" : "is-warn"}`;
    $("mdet-status-title").textContent = !ov ? "상태를 확인하는 중…"
      : !problem ? "연결 준비됨"
      : (PROBLEM_SHORT[problem] ?? "설정이 필요해요");
    const endpoint = ov?.cliPath || (slot === "anthropic" ? "https://api.anthropic.com" : slot === "openai:custom" ? (s.baseUrl || "주소 미입력") : preset?.base || "");
    $("mdet-endpoint").textContent = endpoint;
    $("mdet-endpoint").title = endpoint;
    $("mdet-status-msg").textContent = !ov ? ""
      : problem ? problemTextFor(meta.provider, meta.name, problem)
      : `${modelLabelFor(slot, this.resolvedModel(slot))} 모델로 바로 번역·질문할 수 있어요.`;

    // CLI 설치·로그인 안내 카드
    const isCli = meta.provider === "claude-code" || meta.provider === "codex" || meta.provider === "gemini-cli";
    const guide = $("mdet-cli-guide");
    guide.hidden = !isCli;
    if (isCli) {
      const stepsEl = $("mdet-cli-steps");
      stepsEl.replaceChildren(...(meta.steps ?? []).map((st) => {
        const row = document.createElement("div");
        row.className = "mdet-step";
        row.innerHTML = `<div class="mdet-step__body"><span class="mdet-step__label">${esc(st.label)}</span><code class="mdet-step__cmd">${esc(st.cmd)}</code></div>`;
        const copy = document.createElement("button");
        copy.type = "button";
        copy.className = "t-btn t-btn--xs t-btn--grey";
        copy.textContent = "복사";
        copy.addEventListener("click", () => {
          navigator.clipboard?.writeText(st.cmd).then(() => toast("명령어를 복사했어요")).catch(() => {});
        });
        row.appendChild(copy);
        return row;
      }));
    }

    // Custom URL 카드
    $("model-url-field").hidden = slot !== "openai:custom";
    if (slot === "openai:custom" && document.activeElement !== $("model-url")) {
      $("model-url").value = s.baseUrl ?? "";
    }

    // API 키 카드 (클라우드 API + Custom 선택 키)
    const showKey = slot === "anthropic" || !!preset?.needsKey || !!meta.optionalKey;
    $("model-key-form").hidden = !showKey;
    if (showKey) {
      const hasKey = slot in (this.cfg.keyHints ?? {});
      const tail = this.cfg.keyHints?.[slot] ?? "";
      const badge = $("model-key-badge");
      badge.textContent = hasKey ? (tail ? `저장됨 ••••${tail}` : "저장됨") : (meta.optionalKey ? "선택 사항" : "미등록");
      badge.className = `mdet-tag${hasKey ? " is-ok" : ""}`;
      $("model-key").placeholder = hasKey
        ? (tail ? `새 키로 바꾸려면 붙여 넣으세요 (현재 ••••${tail})` : "새 키로 바꾸려면 붙여 넣으세요")
        : (meta.keyHint ?? "API 키를 붙여 넣으세요");
      $("model-key-clear").hidden = !hasKey;
      const hasPage = slot === "anthropic" || !!(preset?.keys);
      $("model-key-page").hidden = !hasPage;
    }

    // 모델 선택 카드
    this.renderModels();

    // 백업 체인 카드
    const bakBody = $("mdet-backup-body");
    if (isActive) {
      const chain = [activeSlot, ...backups.filter((b) => b !== activeSlot)];
      if (chain.length <= 1) {
        bakBody.innerHTML = `<p class="mdet-note">아직 백업 공급자가 없어요. 왼쪽에서 다른 공급자를 눌러 백업으로 추가해 두면, 한도에 걸릴 때 자동으로 이어서 번역해요.</p>`;
      } else {
        const row = document.createElement("div");
        row.className = "mdet-chain";
        chain.forEach((cid, idx) => {
          if (idx > 0) {
            const arr = document.createElement("span");
            arr.className = "mdet-arrow";
            arr.textContent = "→";
            row.appendChild(arr);
          }
          const chip = document.createElement("span");
          chip.className = `mdet-chip${idx === 0 ? " mdet-chip--main" : ""}`;
          chip.textContent = slotMeta(cid).name;
          if (idx > 0) {
            const rm = document.createElement("button");
            rm.type = "button";
            rm.title = "백업에서 빼기";
            rm.textContent = "×";
            rm.addEventListener("click", () => this.save({ ...s, backups: backups.filter((x) => x !== cid) }));
            chip.appendChild(rm);
          }
          row.appendChild(chip);
        });
        bakBody.replaceChildren(row);
      }
    } else {
      const idx = backups.indexOf(slot);
      const checked = idx >= 0;
      const row = document.createElement("div");
      row.className = "mdet-backup-toggle";
      const lbl = document.createElement("label");
      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.checked = checked;
      cb.addEventListener("change", () => {
        const next = cb.checked ? [...backups.filter((x) => x !== slot), slot] : backups.filter((x) => x !== slot);
        this.save({ ...s, backups: next });
      });
      lbl.append(cb, document.createTextNode("주 모델이 한도 초과·오류일 때 이 공급자로 자동 전환"));
      row.appendChild(lbl);
      if (checked) {
        const tag = document.createElement("span");
        tag.className = "mdet-tag is-ok";
        tag.textContent = `백업 ${idx + 1}순위`;
        row.appendChild(tag);
      }
      bakBody.replaceChildren(row);
    }
  },
  renderModels() {
    const s = this.cfg.settings;
    const slot = this.viewing;
    const meta = slotMeta(slot);
    const known = KNOWN[slot] ?? [];
    const fetched = this.modelsBySlot.get(slot) ?? [];
    // 추천 목록 + 서버에서 받아 온 목록을 중복 없이 합친다 (추천 설명 유지)
    const seen = new Set();
    const list = [];
    for (const m of known) { seen.add(m.id); list.push(m); }
    for (const m of fetched) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      list.push(m);
    }
    const sel = $("model-pick");
    const explicit = (s.models?.[slot] ?? "").trim();
    const resolved = this.resolvedModel(slot);
    const opts = list.map((m) => new Option(m.name ? `${m.name}${m.note ? ` — ${m.note}` : ""}` : m.id, m.id));
    if (explicit && !list.some((m) => m.id === explicit)) opts.unshift(new Option(`${explicit} (직접 지정)`, explicit));
    if (!opts.length) opts.push(new Option(this.loadingModels ? "모델 목록을 불러오는 중…" : "API 키를 저장하거나 아래에 모델 ID를 입력하세요", ""));
    sel.replaceChildren(...opts);
    sel.value = explicit || (list.some((m) => m.id === resolved) ? resolved : (list[0]?.id ?? ""));
    const canFetch = slot !== "claude-code" && slot !== "gemini-cli";
    $("model-refresh").hidden = !canFetch;
    $("model-refresh").textContent = this.loadingModels ? "불러오는 중…" : "목록 새로고침";
    $("model-custom").placeholder = meta.customPh ?? "목록에 없는 모델 ID 직접 입력";
  },
  async loadModels(slot = this.viewing, { force = false } = {}) {
    if (!this.cfg || slot === "claude-code" || slot === "gemini-cli") return this.renderModels();
    if (!force && this.modelsBySlot.has(slot)) return this.renderModels();
    this.loadingModels = true;
    if (this.viewing === slot) this.renderModels();
    try {
      const list = await invoke("llm_models", { slot });
      this.modelsBySlot.set(slot, list ?? []);
    } catch {
      this.modelsBySlot.set(slot, []);
    } finally {
      this.loadingModels = false;
      if (this.open && this.viewing === slot) this.renderModels();
    }
  },
};

$("btn-model").addEventListener("click", () => modelDialog.show());
$("llm-notice-open").addEventListener("click", () => modelDialog.show());
$("model-close").addEventListener("click", () => modelDialog.close());
$("model-recheck").addEventListener("click", async () => {
  toast("공급자 상태를 다시 확인하고 있어요");
  await modelDialog.refreshOverview();
  checkLlm();
});
$("mdet-use").addEventListener("click", () => modelDialog.activate(modelDialog.viewing));
$("mdet-foot-use").addEventListener("click", () => {
  if (!modelDialog.cfg) return;
  if (modelDialog.viewing === slotOf(modelDialog.cfg.settings)) modelDialog.close();
  else modelDialog.activate(modelDialog.viewing);
});
modelDialog.el.addEventListener("mousedown", (e) => { if (e.target === modelDialog.el) modelDialog.close(); });
modelDialog.el.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); modelDialog.close(); } });

$("model-url-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = $("model-url").value.trim();
  await modelDialog.save({ ...modelDialog.cfg.settings, baseUrl: url });
  modelDialog.loadModels("openai:custom", { force: true });
  toast("API 주소를 저장했어요");
});
$("model-pick").addEventListener("change", (e) => {
  const s = modelDialog.cfg.settings;
  const slot = modelDialog.viewing;
  modelDialog.save({ ...s, models: { ...s.models, [slot]: e.target.value } });
});
$("model-custom-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const id = $("model-custom").value.trim();
  if (!id) return;
  const s = modelDialog.cfg.settings;
  const slot = modelDialog.viewing;
  await modelDialog.save({ ...s, models: { ...s.models, [slot]: id } });
  $("model-custom").value = "";
  toast(`모델을 ${id}로 지정했어요`);
});
$("model-refresh").addEventListener("click", () => modelDialog.loadModels(modelDialog.viewing, { force: true }));

$("model-key-eye").addEventListener("click", () => {
  const inp = $("model-key");
  const show = inp.type === "password";
  inp.type = show ? "text" : "password";
  $("model-key-eye").title = show ? "키 숨기기" : "키 보기";
});
$("model-key-form").addEventListener("submit", async (e) => {
  e.preventDefault();
  const key = $("model-key").value.trim();
  if (!key) { $("model-key").focus(); return; }
  const slot = modelDialog.viewing;
  try {
    modelDialog.cfg = await invoke("llm_set_key", { key, slot });
    toast("API 키를 저장했어요");
  } catch (err) { toast(koText(err)); return; }
  $("model-key").value = "";
  $("model-key").type = "password";
  // 기본 모델이 비어 있는 서비스(OpenAI·DeepSeek 등)는 드롭다운에 보이는 추천 모델을 함께 저장해 바로 쓸 수 있게 한다
  const curS = modelDialog.cfg.settings;
  if (!curS.models?.[slot] && !modelDialog.resolvedModel(slot) && $("model-pick").value) {
    await modelDialog.save({ ...curS, models: { ...(curS.models ?? {}), [slot]: $("model-pick").value } });
  } else {
    modelDialog.render();
    modelDialog.refreshOverview();
    checkLlm();
  }
  modelDialog.loadModels(slot, { force: true });
});
$("model-key-clear").addEventListener("click", async () => {
  const slot = modelDialog.viewing;
  try {
    modelDialog.cfg = await invoke("llm_set_key", { key: "", slot });
    toast("API 키를 삭제했어요");
  } catch (err) { toast(koText(err)); return; }
  modelDialog.modelsBySlot.delete(slot);
  modelDialog.render();
  modelDialog.refreshOverview();
  checkLlm();
});
$("model-key-page").addEventListener("click", () =>
  invoke("llm_open_key_page", { slot: modelDialog.viewing }).catch((e) => toast(koText(e))));

$("model-test").addEventListener("click", async () => {
  const slot = modelDialog.viewing;
  modelDialog.setTest("연결을 확인하는 중…");
  try {
    const r = await invoke("llm_test", { slot });
    if (modelDialog.viewing === slot) {
      modelDialog.setTest(`연결됐어요 · ${(r.ms / 1000).toFixed(1)}초 (답: ${r.reply})`, "ok");
    }
  } catch (e) {
    if (modelDialog.viewing === slot) modelDialog.setTest(koText(e), "err");
  }
});

// ───────────────────────── 질문·요약 패널 ─────────────────────────

const HISTORY_TURNS = 8;
const QUOTE_IN_HISTORY = 600;

function formatChatTime(ms) {
  if (!ms) return "";
  const diff = Math.max(0, Date.now() - ms);
  if (diff < 60_000) return "방금";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}분 전`;
  const d = new Date(ms);
  const now = new Date();
  const sameDay = d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
  if (sameDay) return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${d.getMonth() + 1}월 ${d.getDate()}일`;
}

const ask = {
  el: $("rs-ask"),
  log: $("ask-log"),
  input: $("ask-input"),
  histPop: $("ask-history-pop"),
  histList: $("ask-history-list"),
  docId: null,
  threads: [],     // [{ id, title, updatedAt, messages }] (최신순)
  threadId: null,  // 현재 보고 있는 스레드 id
  messages: [],    // { role: user|assistant|error, text, quote?, summaryOf? }
  loading: false,
  seq: 0,
  quote: null,     // 다음 질문에 붙일 고른 구절
  toggle(open = !rside.isOpen("ask")) {
    if (open) rside.show("ask"); else { this.closeHistory(); rside.hide(); }
  },
  newThreadId() {
    return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  },
  reset() {
    this.newChat();
  },
  /** 현재 대화 기록은 그대로 둔 채 빈 새 대화를 시작한다 */
  newChat() {
    this.seq++;
    this.threadId = null;
    this.messages = [];
    this.loading = false;
    this.setQuote(null);
    this.closeHistory();
    this.render();
    this.syncHistoryUi();
  },
  clearPaper() {
    this.seq++;
    this.docId = null;
    this.threads = [];
    this.threadId = null;
    this.messages = [];
    this.loading = false;
    this.setQuote(null);
    this.closeHistory();
    this.render();
    this.syncHistoryUi();
  },
  /** 논문을 열 때 저장된 질문 기록을 불러오고, 가장 최근 대화를 복원한다 */
  async loadForPaper(id) {
    this.seq++;
    this.docId = id;
    this.threads = [];
    this.threadId = null;
    this.messages = [];
    this.loading = false;
    this.setQuote(null);
    this.closeHistory();
    this.render();
    this.syncHistoryUi();
    if (!T || !id) return;
    try {
      const threads = await invoke("library_chats", { id });
      if (this.docId !== id) return;
      this.threads = Array.isArray(threads) ? threads : [];
      if (this.threads.length > 0 && this.messages.length === 0) {
        const latest = this.threads[0];
        this.threadId = latest.id;
        this.messages = latest.messages.map((m) => ({ ...m }));
      }
      this.render();
      this.syncHistoryUi();
    } catch { /* ignore */ }
  },
  deriveTitle(messages) {
    const first = messages.find((m) => m.role === "user");
    if (!first) return "새 대화";
    if (messages.some((m) => m.summaryOf)) return "이 논문 요약";
    if (first.titleHint) return first.titleHint;
    return first.text.replace(/\s+/g, " ").trim().slice(0, 60) || "새 대화";
  },
  /** 현재 대화를 논문별 파일(<id>.chats.json)에 자동 저장한다 */
  async saveCurrent() {
    const docId = this.docId;
    if (!T || !docId) return;
    const cleanMsgs = this.messages
      .filter((m) => (m.role === "user" || m.role === "assistant") && !m.streaming && m.text?.trim())
      .map((m) => ({
        role: m.role,
        text: m.text,
        ...(m.quote ? { quote: m.quote } : {}),
        ...(m.summaryOf ? { summaryOf: m.summaryOf } : {}),
      }));
    if (!cleanMsgs.length) return;
    if (!this.threadId) this.threadId = this.newThreadId();
    const existing = this.threads.find((t) => t.id === this.threadId);
    const updated = {
      id: this.threadId,
      title: existing?.title || this.deriveTitle(this.messages),
      updatedAt: Date.now(),
      messages: cleanMsgs,
    };
    const next = [updated, ...this.threads.filter((t) => t.id !== this.threadId)];
    this.threads = next;
    this.syncHistoryUi();
    try {
      const kept = await invoke("library_set_chats", { id: docId, threads: next });
      if (this.docId === docId && Array.isArray(kept)) {
        this.threads = kept;
        this.syncHistoryUi();
      }
    } catch { /* ignore */ }
  },
  openThread(threadId) {
    const t = this.threads.find((x) => x.id === threadId);
    if (!t) return;
    this.seq++;
    this.loading = false;
    this.threadId = t.id;
    this.messages = t.messages.map((m) => ({ ...m }));
    this.setQuote(null);
    this.closeHistory();
    this.render();
    this.syncHistoryUi();
  },
  async deleteThread(threadId) {
    const docId = this.docId;
    const next = this.threads.filter((t) => t.id !== threadId);
    this.threads = next;
    if (this.threadId === threadId) {
      this.seq++;
      this.loading = false;
      if (next.length > 0) {
        this.threadId = next[0].id;
        this.messages = next[0].messages.map((m) => ({ ...m }));
      } else {
        this.threadId = null;
        this.messages = [];
      }
      this.render();
    }
    this.syncHistoryUi();
    if (T && docId) {
      try {
        const kept = await invoke("library_set_chats", { id: docId, threads: next });
        if (this.docId === docId && Array.isArray(kept)) {
          this.threads = kept;
          this.syncHistoryUi();
        }
      } catch (e) { toast(koText(e)); }
    }
    toast("대화 기록을 지웠어요");
  },
  syncHistoryUi() {
    $("ask-history-dot").hidden = this.threads.length === 0;
    if (!this.histPop.hidden) this.renderHistory();
  },
  renderHistory() {
    $("ask-history-count").textContent = this.threads.length ? `${this.threads.length}개` : "";
    this.histList.replaceChildren();
    if (!this.threads.length) {
      const empty = document.createElement("div");
      empty.className = "ask-hist-empty";
      empty.textContent = "아직 저장된 질문 기록이 없어요";
      this.histList.appendChild(empty);
      return;
    }
    for (const t of this.threads) {
      const row = document.createElement("div");
      row.className = `ask-hist-item${t.id === this.threadId ? " is-active" : ""}`;
      const qCount = t.messages.filter((m) => m.role === "user").length;
      row.innerHTML =
        `<button class="ask-hist-item__main" type="button" title="${esc(t.title)}">` +
        `<span class="ask-hist-item__title">${esc(t.title)}</span>` +
        `<span class="ask-hist-item__meta"><span>${esc(formatChatTime(t.updatedAt))}</span><span>·</span><span>질문 ${qCount}개</span></span>` +
        `</button>` +
        `<button class="t-iconbtn t-iconbtn--sm ask-hist-item__del" type="button" title="기록 지우기" aria-label="기록 지우기">${ico("trash")}</button>`;
      row.querySelector(".ask-hist-item__main").addEventListener("click", () => this.openThread(t.id));
      row.querySelector(".ask-hist-item__del").addEventListener("click", (e) => {
        e.stopPropagation();
        this.deleteThread(t.id);
      });
      this.histList.appendChild(row);
    }
  },
  toggleHistory() {
    if (!this.histPop.hidden) { this.closeHistory(); return; }
    this.renderHistory();
    this.histPop.hidden = false;
    $("ask-history").setAttribute("aria-expanded", "true");
    const btn = $("ask-history").getBoundingClientRect();
    const pw = this.histPop.offsetWidth || 320;
    const ph = this.histPop.offsetHeight || 200;
    const left = Math.min(Math.max(btn.right - pw, 12), innerWidth - pw - 12);
    const top = Math.min(Math.max(btn.bottom + 6, 60), innerHeight - ph - 12);
    this.histPop.style.left = `${Math.round(left)}px`;
    this.histPop.style.top = `${Math.round(top)}px`;
  },
  closeHistory() {
    if (this.histPop.hidden) return;
    this.histPop.hidden = true;
    $("ask-history").setAttribute("aria-expanded", "false");
  },
  setQuote(q) {
    this.quote = q;
    $("ask-quote").hidden = !q;
    $("ask-quote-text").textContent = q ?? "";
  },
  history() {
    return this.messages.filter((m) => m.role !== "error").slice(-HISTORY_TURNS).map((m) => ({
      role: m.role,
      text: m.role === "user" && m.quote ? `> ${m.quote.slice(0, QUOTE_IN_HISTORY)}\n\n${m.text}` : m.text,
    }));
  },
  /** 질문을 넣고 답을 받아 오는 동안 나오는 대로 그린다 */
  async stream(asked, run, summaryOf) {
    const id = ++this.seq;
    this.messages.push(asked);
    const reply = { role: "assistant", text: "", streaming: true, summaryOf };
    this.messages.push(reply);
    this.loading = true;
    this.render();
    try {
      const r = await run((d) => { if (id === this.seq) { reply.text += d; this.renderLast(); } });
      if (id !== this.seq) return;
      reply.text = r.reply;
    } catch (e) {
      if (id !== this.seq) return;
      if (!reply.text) this.messages.pop();
      this.messages.push({ role: "error", text: koText(e) });
    } finally {
      if (id === this.seq) {
        reply.streaming = false;
        this.loading = false;
        this.render();
        this.saveCurrent();
      }
    }
  },
  send(question, quote = this.quote, titleHint = null) {
    const q = question.trim();
    if (!q || this.loading) return;
    if (P.llm?.problem) { modelDialog.show(); return; }
    this.toggle(true);
    this.setQuote(null);
    const history = this.history();
    const docId = isPaper() ? P.doc.id : null;
    this.stream({ role: "user", text: q, quote, ...(titleHint ? { titleHint } : {}) }, (onDelta) => {
      const ch = new T.core.Channel();
      ch.onmessage = (e) => { if (e.kind === "delta") onDelta(e.text); };
      return invoke("ask_claude", { question: q, quote, docId, history, lang: P.lang, onEvent: ch });
    });
  },
  summarize(fresh = false) {
    if (!isPaper() || this.loading) return;
    this.toggle(true);
    const key = `${P.doc.id}:${P.lang}`;
    if (!fresh && this.messages.some((m) => m.summaryOf === key)) return this.scrollTo(this.messages.find((m) => m.summaryOf === key));
    if (P.llm?.problem && !fresh) {
      // 저장된 요약은 모델 없이도 보여 줄 수 있으니 그대로 부른다
    }
    const docId = P.doc.id, lang = P.lang;
    this.stream({ role: "user", text: fresh ? "요약을 새로 써 줘" : "이 논문을 요약해 줘" }, (onDelta) => {
      const ch = new T.core.Channel();
      ch.onmessage = (e) => { if (e.kind === "delta") onDelta(e.text); };
      return invoke("summarize_paper", { docId, fresh, lang, onEvent: ch });
    }, key);
  },
  /** 쉬운 설명: 고른 구절이 있으면 그 구절, 없으면 PDF에서 지금 읽는 문단을 쉬운 말로 풀어 준다 */
  easy(quote = this.quote) {
    if (!isPaper()) { toast("논문을 열면 쓸 수 있어요"); return; }
    const text = quote || unitText(pdfView.unitAtTop());
    if (!text) { toast("설명할 문단을 찾지 못했어요. 본문에서 문장을 골라 주세요"); return; }
    const snippet = text.replace(/\s+/g, " ").trim().slice(0, 28);
    this.send(
      "이 부분을 이 분야를 처음 공부하는 사람도 이해할 수 있게 쉬운 말로 풀어서 설명해 줘. 어려운 용어는 짧게 뜻을 덧붙여 줘.",
      text,
      snippet ? `쉬운 설명 · ${snippet}` : "쉬운 설명"
    );
  },
  scrollTo() { this.log.scrollTop = this.log.scrollHeight; },
  render() {
    $("ask-empty").hidden = this.messages.length > 0;
    this.log.querySelectorAll(".msg").forEach((m) => m.remove());
    for (const m of this.messages) this.log.appendChild(this.msgEl(m));
    $("ask-send").disabled = this.loading;
    this.scrollTo();
  },
  renderLast() {
    const last = this.log.querySelector(".msg:last-child");
    const m = this.messages[this.messages.length - 1];
    if (!last || !m) return this.render();
    const stick = this.log.scrollHeight - this.log.scrollTop - this.log.clientHeight < 40;
    last.replaceWith(this.msgEl(m));
    if (stick) this.scrollTo();
  },
  msgEl(m) {
    const el = document.createElement("div");
    el.className = `msg msg--${m.role}`;
    if (m.role === "user") {
      el.innerHTML = `${m.quote ? `<blockquote>${esc(m.quote)}</blockquote>` : ""}<div class="bubble">${esc(m.text)}</div>`;
    } else if (m.role === "error") {
      el.innerHTML = `<div class="bubble bubble--error">${esc(m.text)}</div>`;
    } else {
      const body = document.createElement("div");
      body.className = "answer markdown-body";
      if (!m.text && m.streaming) body.innerHTML = `<div class="thinking">${spinner()}<span>생각하는 중…</span></div>`;
      else if (m.streaming) body.textContent = m.text;
      else this.markdown(m.text, body);
      el.appendChild(body);
      if (!m.streaming && m.text) {
        const acts = document.createElement("div");
        acts.className = "msg__acts";
        acts.innerHTML = `<button class="t-iconbtn t-iconbtn--sm" type="button" title="답 복사" aria-label="답 복사">${ico("copy")}</button>` +
          (m.summaryOf ? `<button class="t-btn t-btn--xs t-btn--grey" type="button" data-act="resum">새로 쓰기</button>` : "");
        acts.querySelector(".t-iconbtn").addEventListener("click", () =>
          navigator.clipboard.writeText(m.text).then(() => toast("답을 복사했어요"), () => toast("복사하지 못했어요")));
        acts.querySelector("[data-act=resum]")?.addEventListener("click", () => this.summarize(true));
        el.appendChild(acts);
      }
    }
    return el;
  },
  /** 답은 마크다운이라 Graphite의 렌더러(comrak)로 그린다 */
  async markdown(text, target) {
    try {
      const html = await invoke("render_markdown", { raw: text });
      const tpl = document.createElement("template");
      tpl.innerHTML = html;
      sanitize(tpl.content);
      tpl.content.querySelectorAll("a[href]").forEach((a) => { a.target = "_blank"; });
      target.replaceChildren(tpl.content);
      renderMathIn(target);
    } catch { target.textContent = text; }
  },
};
$("ask-form").addEventListener("submit", (e) => { e.preventDefault(); const v = ask.input.value; ask.input.value = ""; ask.send(v); });
ask.input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("ask-form").requestSubmit(); }
  if (e.key === "Escape") { e.preventDefault(); ask.toggle(false); }
});
$("ask-new").addEventListener("click", () => { ask.newChat(); ask.input.focus(); });
$("ask-history").addEventListener("click", () => ask.toggleHistory());
$("ask-history-new").addEventListener("click", () => { ask.newChat(); ask.input.focus(); });
$("ask-sum").addEventListener("click", () => ask.summarize());
$("ask-easy").addEventListener("click", () => ask.easy());
$("ask-quote-clear").addEventListener("click", () => ask.setQuote(null));
document.addEventListener("pointerdown", (e) => {
  if (!ask.histPop.hidden && !ask.histPop.contains(e.target) && !e.target.closest?.("#ask-history")) ask.closeHistory();
}, true);
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !ask.histPop.hidden) { e.preventDefault(); e.stopPropagation(); ask.closeHistory(); }
}, true);
ask.log.addEventListener("click", (e) => {
  const a = e.target.closest("a[href]");
  if (!a) return;
  e.preventDefault();
  if (/^https?:/i.test(a.getAttribute("href"))) T?.opener.openUrl(a.getAttribute("href")).catch(() => {});
});

// ───────────────────────── 고른 문장: 번역·질문 말풍선 ─────────────────────────

const GLOSS_MAX = 600;
const glossCache = new Map();

/** 문장 키("문단id:문장번호")에 해당하는 원문 문장·문단 */
function sentenceUnit(key) {
  if (!P.doc || !key) return null;
  const [uid, idx] = String(key).split(":").map(Number);
  for (const b of P.doc.blocks) {
    const u = b.unit ?? b.caption;
    if (u?.id === uid) return { unit: u, idx };
  }
  return null;
}
function sentenceText(key) {
  const hit = sentenceUnit(key);
  return (hit?.unit.sentences?.[hit.idx] ?? "").replace(MATH_TOKEN, "").trim();
}
function sentenceContext(key) {
  const hit = sentenceUnit(key);
  return (hit?.unit.sentences ?? []).join(" ").replace(MATH_TOKEN, "").trim();
}

const bubble = {
  el: $("sel-bubble"),
  quote: "",
  ctx: "",
  range: null,
  getRects: null,
  sentKey: null,
  closedKey: null,
  hide() {
    this.el.hidden = true;
    this.range = null;
    this.getRects = null;
    this.sentKey = null;
    $("gloss-out").hidden = true;
  },
  show(range, quote, { key = null, getRects = null, ctx = "" } = {}) {
    this.range = range;
    this.getRects = getRects;
    this.sentKey = key;
    this.quote = quote;
    this.ctx = ctx;
    $("sel-q").value = "";
    $("gloss-out").hidden = true;
    $("sel-gloss").hidden = quote.length > GLOSS_MAX;
    this.el.hidden = false;
    this.place();
  },
  /** 문장 클릭으로 말풍선을 연다. 이미 열려 있던 같은 문장을 다시 누르면 닫힌 채로 둔다 */
  showSent(key, quote, getRects, ctx = "") {
    if (this.closedKey === key) { this.closedKey = null; return; }
    this.closedKey = null;
    this.show(null, quote, { key, getRects, ctx });
  },
  place() {
    if (this.el.hidden) return;
    const rects = this.getRects
      ? this.getRects()
      : (this.range ? [...this.range.getClientRects()].filter((r) => r.width || r.height) : []);
    const r = rects[rects.length - 1] ?? this.range?.getBoundingClientRect();
    if (!r || (!r.width && !r.height)) return;
    const w = this.el.offsetWidth, h = this.el.offsetHeight;
    const left = Math.min(Math.max((r.left + r.right) / 2 - w / 2, 8), innerWidth - w - 8);
    const below = r.bottom + 10 + h <= innerHeight - 8;
    this.el.style.left = `${left}px`;
    this.el.style.top = `${below ? r.bottom + 10 : Math.max((rects[0] ?? r).top - 10 - h, 8)}px`;
  },
  context() {
    if (this.ctx) return this.ctx;
    const n = this.range?.startContainer;
    const el = n instanceof Element ? n : n?.parentElement;
    return el?.closest("[data-s]")?.textContent?.trim() ?? this.quote;
  },
  async gloss() {
    if (P.llm?.problem) { modelDialog.show(); return; }
    const out = $("gloss-out");
    const ctx = this.context();
    const key = `${P.lang}|${this.quote}|${ctx}`;
    out.hidden = false;
    const show = (g) => { out.innerHTML = `<strong>${esc(g.translation)}</strong>${g.note ? `<p>${esc(g.note)}</p>` : ""}`; this.place(); };
    if (glossCache.has(key)) return show(glossCache.get(key));
    out.innerHTML = `<span class="gloss-wait">${spinner()}번역하는 중…</span>`;
    this.place();
    const quote = this.quote;
    try {
      const g = await invoke("gloss_selection", { text: quote, context: ctx, lang: P.lang });
      glossCache.set(key, g);
      if (this.quote === quote && !this.el.hidden) show(g);
    } catch (e) { out.textContent = koText(e); this.place(); }
  },
};
document.addEventListener("mouseup", (e) => {
  if (e.button !== 0 || bubble.el.contains(e.target)) return;
  setTimeout(() => {
    if (!isPaper() || P.view !== "doc") return;
    const sel = getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return;
    const range = sel.getRangeAt(0);
    if (!content.contains(range.commonAncestorContainer) && !trView.list.contains(range.commonAncestorContainer)) return;
    const quote = sel.toString().trim();
    if (quote.length < 2 || quote.length > 2000) return;
    bubble.show(range.cloneRange(), quote);
  }, 0);
});
document.addEventListener("mousedown", (e) => {
  bubble.closedKey = null;
  if (!bubble.el.hidden && !bubble.el.contains(e.target)) {
    bubble.closedKey = bubble.sentKey;
    bubble.hide();
  }
}, true);
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !bubble.el.hidden) { e.preventDefault(); e.stopPropagation(); bubble.hide(); } }, true);
viewer.addEventListener("scroll", () => {
  bubble.place();
  figure.setHover(null);
}, { passive: true });
trView.list.addEventListener("scroll", () => bubble.place(), { passive: true });
window.addEventListener("resize", () => bubble.place(), { passive: true });
// PDF를 내리면 번역 쪽이 지금 보이는 문단으로 따라온다
let followTimer = 0;
viewer.addEventListener("scroll", () => {
  if (!followTimer) followTimer = setTimeout(() => { followTimer = 0; trView.follow(); }, 90);
}, { passive: true });
$("sel-gloss").addEventListener("click", () => bubble.gloss());
$("sel-easy").addEventListener("click", () => {
  const quote = bubble.quote;
  bubble.hide();
  getSelection()?.removeAllRanges();
  ask.easy(quote);
});
$("sel-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = $("sel-q").value.trim();
  const quote = bubble.quote;
  bubble.hide();
  getSelection()?.removeAllRanges();
  if (q) ask.send(q, quote);
  else { ask.toggle(true); ask.setQuote(quote); }
});

// ───────────────────────── 그림 설명 (문라이트 방식 영역 드래그 + 설명 카드) ─────────────────────────

const figure = {
  card: $("fig-card"),
  log: $("fig-log"),
  input: $("fig-input"),
  hoverBar: $("fig-hover"),
  hoverBtn: $("fig-hover-btn"),
  pick: $("fig-pick"),
  pickInput: $("fig-pick-q"),
  capturing: false,
  drag: null,
  pinEl: null,
  pending: null, // 드래그로 선택하고 요청을 고르기 기다리는 영역
  dismissedAt: 0,
  regionsByPage: [], // pageIdx → [{ pageIdx, kind, label, caption, x, y, w, h, el }]
  hoverReg: null,
  lastMouse: null,
  seq: 0,
  loading: false,
  imageB64: "",
  mime: "image/png",
  page: 1,
  kind: "region",
  label: "",
  caption: "",
  pageText: "",
  nearby: "",
  messages: [], // { role: user|assistant|error, text, streaming? }

  /** pdf.js operatorList(이미지·벡터 도형) + 캡션·수식 구조로 그림·표·수식 영역을 자동 감지한다 */
  async detectAll(pages, mine) {
    const OPS = pdfView.lib?.OPS;
    if (!OPS) return;
    this.regionsByPage = pages.map(() => []);
    this.setHover(null);
    let figCount = 0, eqCount = 0;
    for (let i = 0; i < pages.length; i++) {
      if (!mine()) return;
      const regs = await this.detectPage(pages[i], i, OPS);
      if (!mine()) return;
      this.regionsByPage[i] = regs;
      this.mountRegions(pages[i], regs);
      for (const r of regs) { if (r.kind === "equation") eqCount++; else figCount++; }
    }
    if (mine()) devLog(`그림·표·수식 자동 감지: 그림·표 ${figCount}개, 수식 ${eqCount}개`);
  },

  async detectPage(pg, pageIdx, OPS) {
    let opList;
    try { opList = await pg.page.getOperatorList(); } catch { return []; }
    const vp = pg.base;
    const W = vp.width, H = vp.height;
    const mul = (a, b) => [
      a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
    ];
    const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    const toVpBox = (pts) => {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const [ux, uy] of pts) {
        const [vx, vy] = vp.convertToViewportPoint(ux, uy);
        if (vx < minX) minX = vx;
        if (vy < minY) minY = vy;
        if (vx > maxX) maxX = vx;
        if (vy > maxY) maxY = vy;
      }
      const x = Math.max(0, minX), y = Math.max(0, minY);
      return { x, y, w: Math.min(W, maxX) - x, h: Math.min(H, maxY) - y };
    };

    let ctm = [1, 0, 0, 1, 0, 0];
    const stack = [], prims = [];
    let pathPts = [];
    const addPrim = (box, isImg) => {
      if (box.w <= 0 || box.h <= 0) return;
      if (box.w > W * 0.93 && box.h > H * 0.93) return;
      if ((box.y < H * 0.055 || box.y + box.h > H * 0.95) && box.h < 25) return;
      if (!isImg && box.w < 3 && box.h < 3) return;
      prims.push({ ...box, isImg });
    };

    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i], args = opList.argsArray[i];
      if (fn === OPS.save) stack.push(ctm.slice());
      else if (fn === OPS.restore) { if (stack.length) ctm = stack.pop(); }
      else if (fn === OPS.transform) ctm = mul(ctm, args);
      else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject || fn === OPS.paintImageMaskXObject || fn === OPS.paintImageXObjectRepeat) {
        const box = toVpBox([[0, 0], [1, 0], [1, 1], [0, 1]].map(([x, y]) => apply(ctm, x, y)));
        if (box.w >= 28 && box.h >= 24) addPrim(box, true);
      } else if (fn === OPS.constructPath) {
        const ops = args[0], coords = args[1];
        let ci = 0;
        for (const op of ops) {
          if (op === OPS.moveTo || op === OPS.lineTo) { pathPts.push(apply(ctm, coords[ci], coords[ci + 1])); ci += 2; }
          else if (op === OPS.curveTo) {
            pathPts.push(apply(ctm, coords[ci], coords[ci + 1]), apply(ctm, coords[ci + 2], coords[ci + 3]), apply(ctm, coords[ci + 4], coords[ci + 5]));
            ci += 6;
          } else if (op === OPS.curveTo2 || op === OPS.curveTo3) {
            pathPts.push(apply(ctm, coords[ci], coords[ci + 1]), apply(ctm, coords[ci + 2], coords[ci + 3]));
            ci += 4;
          } else if (op === OPS.rectangle) {
            const [rx, ry, rw, rh] = [coords[ci], coords[ci + 1], coords[ci + 2], coords[ci + 3]];
            pathPts.push(apply(ctm, rx, ry), apply(ctm, rx + rw, ry), apply(ctm, rx + rw, ry + rh), apply(ctm, rx, ry + rh));
            ci += 4;
          }
        }
      } else if (fn === OPS.stroke || fn === OPS.closeStroke || fn === OPS.fill || fn === OPS.eoFill || fn === OPS.fillStroke || fn === OPS.eoFillStroke || fn === OPS.closeFillStroke || fn === OPS.closeEOFillStroke) {
        if (pathPts.length >= 2) {
          const box = toVpBox(pathPts);
          if (box.w >= 12 || box.h >= 12) addPrim(box, false);
        }
        pathPts = [];
      } else if (fn === OPS.endPath) pathPts = [];
    }

    // 캡션 줄 추출 (FIGURE N / Fig. N / TABLE N)
    const lines = [];
    let cur = null;
    const flush = () => { if (cur && cur.text.trim()) lines.push(cur); cur = null; };
    for (const it of pg.items ?? []) {
      if (it.str) {
        const [vx, baseline] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
        const h = it.height || Math.hypot(it.transform[2], it.transform[3]) || 8;
        const w = it.width || h * it.str.length * 0.5;
        if (cur && Math.abs(cur.y - baseline) > Math.max(cur.h, h) * 0.6) flush();
        if (!cur) cur = { x: vx, y: baseline, top: baseline - h * 0.85, bottom: baseline + h * 0.2, right: vx + w, h, text: "" };
        cur.x = Math.min(cur.x, vx);
        cur.right = Math.max(cur.right, vx + w);
        cur.top = Math.min(cur.top, baseline - h * 0.85);
        cur.bottom = Math.max(cur.bottom, baseline + h * 0.2);
        cur.text += it.str;
      }
      if (it.hasEOL) flush();
    }
    flush();

    const unspace = (t) => t.replace(/\b(?:[A-Z] ){2,}[A-Z]\b/g, (m) => m.replace(/ /g, ""));
    const captions = [];
    const CAP_RE = /^(FIG(?:URE)?|TABLE|TAB\.|Fig(?:ure)?|Table|Tab\.)\s*\.?\s*(\d+[A-Za-z]?)(.*)$/;
    for (let i = 0; i < lines.length; i++) {
      const t = unspace(lines[i].text.trim());
      const m = CAP_RE.exec(t);
      if (!m) continue;
      const head = m[1], rest = m[3];
      const allCaps = head === head.toUpperCase();
      if (!allCaps && !/^\s*[:.|]\s+\S/.test(rest)) continue;
      if (!allCaps && /^\s*\.\s+(This|These|It|They|As|We|The\s+results?)\b/.test(rest)) continue;
      let top = lines[i].top, bottom = lines[i].bottom, left = lines[i].x, right = lines[i].right;
      const firstBottom = bottom;
      let full = t;
      for (let j = i + 1; j < lines.length; j++) {
        const nxt = lines[j];
        if (nxt.top - bottom > nxt.h * 1.15 || nxt.top < bottom - nxt.h * 0.5) break;
        if (Math.abs(nxt.x - left) > 30 || Math.abs(nxt.h - lines[i].h) > 1.5) break;
        if (/^tab/i.test(head) && (nxt.text.match(/\d/g) ?? []).length > 6) break;
        bottom = Math.max(bottom, nxt.bottom);
        right = Math.max(right, nxt.right);
        full += " " + unspace(nxt.text.trim());
        i = j;
      }
      captions.push({
        kind: /^tab/i.test(head) ? "table" : "figure",
        label: `${/^tab/i.test(head) ? "Table" : "Figure"} ${m[2]}`,
        text: full, x: left, y: top, w: right - left, h: bottom - top, firstBottom,
      });
    }

    // 가까운 그래픽 요소를 하나의 그림·표 덩어리로 묶는다
    const PAD_X = 24, PAD_Y = 20;
    const boxes = prims.map((p) => ({ x: p.x, y: p.y, x2: p.x + p.w, y2: p.y + p.h, imgCount: p.isImg ? 1 : 0, vecCount: p.isImg ? 0 : 1 }));
    let merged = true;
    while (merged) {
      merged = false;
      for (let i = 0; i < boxes.length; i++) {
        for (let j = i + 1; j < boxes.length; j++) {
          const a = boxes[i], b = boxes[j];
          if (a.x - PAD_X <= b.x2 && b.x - PAD_X <= a.x2 && a.y - PAD_Y <= b.y2 && b.y - PAD_Y <= a.y2) {
            a.x = Math.min(a.x, b.x); a.y = Math.min(a.y, b.y);
            a.x2 = Math.max(a.x2, b.x2); a.y2 = Math.max(a.y2, b.y2);
            a.imgCount += b.imgCount; a.vecCount += b.vecCount;
            boxes.splice(j, 1);
            merged = true;
            break;
          }
        }
        if (merged) break;
      }
    }

    const out = [];
    for (const b of boxes) {
      const w = b.x2 - b.x, h = b.y2 - b.y;
      if (w < 80 || h < 55) continue;
      if (w > W * 0.92 && h > H * 0.85) continue;
      let cap = null, bestDist = 90;
      for (const c of captions) {
        const xOverlap = Math.min(b.x2, c.x + c.w) - Math.max(b.x, c.x);
        if (xOverlap < Math.min(w, c.w) * 0.2) continue;
        const dBelow = c.y - b.y2;
        const dAbove = Math.min(Math.abs(b.y - (c.y + c.h)), Math.abs(b.y - c.firstBottom));
        const aboveOk = c.y < b.y + 10;
        const dist = Math.min(dBelow >= -18 ? Math.abs(dBelow) : 999, aboveOk ? dAbove : 999);
        if (dist < bestDist) { bestDist = dist; cap = c; }
      }
      if (b.imgCount === 0 && !cap && b.vecCount <= 6) continue;
      const x = Math.max(0, b.x - 6), y = Math.max(0, b.y - 6);
      out.push({
        pageIdx,
        kind: cap?.kind ?? "figure",
        label: cap?.label ?? "그림",
        caption: cap?.text ?? "",
        x, y,
        w: Math.min(W, b.x2 + 6) - x,
        h: Math.min(H, b.y2 + 6) - y,
        el: null,
      });
    }
    const eqs = this.detectEquations(pg, pageIdx, opList, OPS, out);
    return [...out, ...eqs];
  },

  /** 텍스트 토큰 배치 + 수식 번호 (N) + 분수선 벡터로 독립 수식(display equation) 영역을 자동 감지한다 */
  detectEquations(pg, pageIdx, opList, OPS, figTableBoxes) {
    const items = pg.items;
    if (!items?.length) return [];
    const vp = pg.base;
    const W = vp.width, H = vp.height;

    const mul = (a, b) => [
      a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1],
      a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3],
      a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5],
    ];
    const apply = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
    let ctm = [1, 0, 0, 1, 0, 0];
    const stack = [], hbars = [];
    let pts = [];
    const flushBar = () => {
      if (pts.length >= 2) {
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const [ux, uy] of pts) {
          const [vx, vy] = vp.convertToViewportPoint(ux, uy);
          if (vx < minX) minX = vx;
          if (vy < minY) minY = vy;
          if (vx > maxX) maxX = vx;
          if (vy > maxY) maxY = vy;
        }
        const bw = maxX - minX, bh = maxY - minY;
        if (bw >= 12 && bw <= W * 0.48 && bh <= 3.5 && minY > H * 0.06 && maxY < H * 0.94) {
          hbars.push({ x: minX, y: minY, x2: maxX, y2: maxY, w: bw });
        }
      }
      pts = [];
    };
    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i], args = opList.argsArray[i];
      if (fn === OPS.save) stack.push(ctm.slice());
      else if (fn === OPS.restore) { if (stack.length) ctm = stack.pop(); }
      else if (fn === OPS.transform) ctm = mul(ctm, args);
      else if (fn === OPS.constructPath) {
        const ops = args[0], coords = args[1];
        let ci = 0;
        for (const op of ops) {
          if (op === OPS.moveTo || op === OPS.lineTo) { pts.push(apply(ctm, coords[ci], coords[ci + 1])); ci += 2; }
          else if (op === OPS.rectangle) {
            const [rx, ry, rw, rh] = [coords[ci], coords[ci + 1], coords[ci + 2], coords[ci + 3]];
            pts.push(apply(ctm, rx, ry), apply(ctm, rx + rw, ry + rh));
            ci += 4;
          } else if (op === OPS.curveTo) ci += 6;
          else if (op === OPS.curveTo2 || op === OPS.curveTo3) ci += 4;
        }
      } else if (fn === OPS.stroke || fn === OPS.closeStroke || fn === OPS.fill || fn === OPS.eoFill || fn === OPS.fillStroke) {
        flushBar();
      } else if (fn === OPS.endPath) pts = [];
    }

    const inFigTable = (x, y, w, h) => figTableBoxes.some((b) =>
      x + w > b.x + 2 && x < b.x + b.w - 2 && y + h > b.y + 2 && y < b.y + b.h - 2);
    const toks = [];
    for (const it of items) {
      const str = (it.str || "").trim();
      if (!str) continue;
      const [x, base] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
      const h = Math.hypot(it.transform[2], it.transform[3]) || it.height || 8;
      const rawW = it.width || h * str.length * 0.5;
      const isOverline = /^[\u0305\u203e_¯‾]+$/.test(str) || str.split("").every((ch) => ch.charCodeAt(0) === 0x0305);
      const w = isOverline ? Math.min(rawW, W * 0.42) : rawW;
      const y = base - h * 0.85;
      if (y < H * 0.055 || base > H * 0.945) continue;
      if (inFigTable(x, y, w, h)) continue;
      toks.push({ x, y, base, w, h, x2: x + w, y2: base + h * 0.15, str, isOverline });
    }
    if (!toks.length) return [];

    const leftCount = toks.filter((t) => t.x2 < W * 0.505).length;
    const rightCount = toks.filter((t) => t.x > W * 0.495).length;
    const crossCount = toks.filter((t) => t.x < W * 0.46 && t.x2 > W * 0.54 && !t.isOverline).length;
    const twoCol = leftCount > 20 && rightCount > 20 && crossCount < (leftCount + rightCount) * 0.08;
    const colOf = (t) => (!twoCol ? 0 : (t.x < W * 0.495 ? 0 : 1));

    const eqs = [];
    const cols = twoCol ? [0, 1] : [0];
    const MATH_OP_RE = /[=≈≤≥≠≡∼∝±×⋅·÷∑Σ∏Π∫∂∇√∞∈∉⊂⊃∀∃→⇒⇔−]/;
    const EQ_NUM_RE = /^\(\s*(\d{1,3}(?:[.\-]\d{1,2})?[a-z]?)\s*\)$/;

    for (const c of cols) {
      const ctoks = toks.filter((t) => colOf(t) === c);
      if (!ctoks.length) continue;
      const nonOver = ctoks.filter((t) => !t.isOverline && (!twoCol || c === 1 || t.x2 <= W * 0.51));
      if (!nonOver.length) continue;
      const colLeft = Math.min(...nonOver.map((t) => t.x));
      const colRight = Math.max(...nonOver.map((t) => t.x2));
      const colW = colRight - colLeft;
      if (colW < 60) continue;

      ctoks.sort((a, b) => a.y - b.y || a.x - b.x);
      const lines = [];
      for (const t of ctoks) {
        let best = null;
        for (let i = lines.length - 1; i >= 0 && i >= lines.length - 6; i--) {
          const ln = lines[i];
          if (Math.abs(t.base - ln.base) <= Math.max(2.5, Math.min(t.h, ln.h) * 0.42)) {
            best = ln;
            break;
          }
        }
        const tx2 = t.isOverline ? Math.min(t.x2, colRight) : t.x2;
        if (best) {
          best.toks.push(t);
          best.x = Math.min(best.x, t.x);
          best.x2 = Math.max(best.x2, tx2);
          best.y = Math.min(best.y, t.y);
          best.y2 = Math.max(best.y2, t.y2);
        } else {
          lines.push({ toks: [t], x: t.x, x2: tx2, y: t.y, y2: t.y2, base: t.base, h: t.h });
        }
      }
      lines.sort((a, b) => a.y - b.y);
      for (const ln of lines) {
        ln.toks.sort((a, b) => a.x - b.x);
        const tail = [];
        for (let i = ln.toks.length - 1; i >= 0; i--) {
          const cur = ln.toks[i];
          if (tail.length && tail[0].x - cur.x2 > 6) break;
          tail.unshift(cur);
        }
        const tailStr = tail.map((t) => t.str).join("");
        const mNum = EQ_NUM_RE.exec(tailStr);
        const tailLeft = tail.length ? tail[0].x : ln.x2;
        const tailRight = tail.length ? tail[tail.length - 1].x2 : ln.x2;
        const prevRight = tail.length < ln.toks.length ? ln.toks[ln.toks.length - tail.length - 1].x2 : colLeft;
        ln.eqNum = (mNum && tailRight >= colRight - 28 && (tail.length === ln.toks.length || tailLeft - prevRight >= 16))
          ? { num: mNum[1], tailLeft, tailRight, alone: tail.length === ln.toks.length }
          : null;
        ln.bodyToks = ln.eqNum ? ln.toks.slice(0, ln.toks.length - tail.length) : ln.toks;
        ln.text = ln.bodyToks.filter((t) => !t.isOverline).map((t) => t.str).join(" ").trim();
        ln.hasOp = MATH_OP_RE.test(ln.text);
        const words = ln.text.match(/[A-Za-z]{4,}/g) || [];
        const wordChars = words.reduce((s, wd) => s + wd.length, 0);
        const nonSpace = ln.text.replace(/\s+/g, "").length || 1;
        ln.proseRatio = wordChars / nonSpace;
        ln.isProse = ln.bodyToks.length > 0 && words.length >= 4 && ln.proseRatio > 0.65 && (ln.x - colLeft < 18) && (ln.x2 - ln.x > colW * 0.55);
      }

      const hasBarNear = (ln) => hbars.some((b) => b.x >= colLeft - 5 && b.x2 <= colRight + 5 && b.y >= ln.y - 8 && b.y <= ln.y2 + 8);
      const isMathLine = (ln, blockHasLeadingEq = false) => {
        if (!ln.bodyToks.length || ln.isProse) return false;
        const words = ln.text.match(/[A-Za-z]{4,}/g) || [];
        if (words.length >= 4 && ln.proseRatio > 0.6) return false;
        if (/^(abbreviations?|note|source|table|fig)/i.test(ln.text)) return false;
        const indented = ln.x - colLeft >= 10;
        const shortFragmented = ln.bodyToks.length >= 3 && (ln.bodyToks.filter((t) => t.str.length <= 3).length / ln.bodyToks.length >= 0.55);
        const isLhs = blockHasLeadingEq && ln.bodyToks.length <= 2 && ln.text.length <= 16 && !/[.:;]$/.test(ln.text);
        return ln.hasOp || hasBarNear(ln) || ln.bodyToks.some((t) => t.isOverline) || isLhs || (indented && (shortFragmented || ln.text.length <= 28));
      };

      const used = new Set();
      // 1단계: 오른쪽 끝 수식 번호 (1), (2), ... 기준 감지
      for (let i = 0; i < lines.length; i++) {
        if (used.has(i)) continue;
        const ln = lines[i];
        if (!ln.eqNum) continue;
        let lo = i, hi = i;
        while (lo > 0 && !used.has(lo - 1)) {
          const prev = lines[lo - 1];
          const gap = lines[lo].y - prev.y2;
          if (gap > 18 || prev.isProse || prev.eqNum) break;
          const blockHasLeadingEq = lines.slice(lo, hi + 1).some((l) => /^[=≈≤≥]/.test(l.text));
          if (!isMathLine(prev, blockHasLeadingEq)) break;
          lo--;
        }
        while (hi + 1 < lines.length && !used.has(hi + 1)) {
          const nxt = lines[hi + 1];
          const gap = nxt.y - lines[hi].y2;
          if (gap > 14 || nxt.isProse || nxt.eqNum) break;
          if (hi + 2 < lines.length && lines[hi + 2].eqNum && (lines[hi + 2].y - nxt.y2) < gap) break;
          if (!isMathLine(nxt)) break;
          hi++;
        }
        const slice = lines.slice(lo, hi + 1);
        const hasAnyMath = slice.some((l) => l.hasOp || hasBarNear(l) || l.bodyToks.some((t) => t.isOverline));
        if (!hasAnyMath) continue;
        for (let k = lo; k <= hi; k++) used.add(k);
        const x = Math.min(...slice.flatMap((l) => (l.bodyToks.length ? l.bodyToks.map((t) => t.x) : [l.x])));
        const x2 = Math.max(...slice.map((l) => l.x2));
        const y = Math.min(...slice.map((l) => l.y));
        const y2 = Math.max(...slice.map((l) => l.y2));
        eqs.push({
          pageIdx,
          kind: "equation",
          label: `Equation (${ln.eqNum.num})`,
          caption: "",
          x: Math.max(0, x - 6),
          y: Math.max(0, y - 5),
          w: Math.min(W, x2 + 6) - Math.max(0, x - 6),
          h: Math.min(H, y2 + 5) - Math.max(0, y - 5),
          el: null,
        });
      }

      // 2단계: 번호 없는 가운데 정렬 독립 수식 감지
      for (let i = 0; i < lines.length; i++) {
        if (used.has(i)) continue;
        const ln = lines[i];
        if (!ln.hasOp || ln.isProse) continue;
        const indented = ln.x - colLeft >= 18 && (colRight - ln.x2) >= 12;
        if (!indented) continue;
        if (ln.proseRatio > 0.42 || /^(fig|table|section|appendix|http|doi|abbreviations?|note|source)/i.test(ln.text)) continue;
        let lo = i, hi = i;
        while (lo > 0 && !used.has(lo - 1) && lines[lo].y - lines[lo - 1].y2 <= 10 && isMathLine(lines[lo - 1])) lo--;
        while (hi + 1 < lines.length && !used.has(hi + 1) && lines[hi + 1].y - lines[hi].y2 <= 10 && isMathLine(lines[hi + 1])) hi++;
        const slice = lines.slice(lo, hi + 1);
        const gapAbove = lo > 0 ? slice[0].y - lines[lo - 1].y2 : 20;
        const gapBelow = hi + 1 < lines.length ? lines[hi + 1].y - slice[slice.length - 1].y2 : 20;
        const hasBar = slice.some(hasBarNear);
        if (!hasBar && gapAbove < 6 && gapBelow < 6) continue;
        const allText = slice.map((l) => l.text).join(" ");
        const totalToks = slice.reduce((s, l) => s + l.bodyToks.length, 0);
        if (totalToks < 3 || allText.length < 4) continue;
        if (!hasBar && !/[≈≤≥≠≡∼∝∑Σ∏Π∫∂∇√∞∈∉→⇒⇔]/.test(allText) && !(/[=]/.test(allText) && totalToks >= 4)) continue;
        for (let k = lo; k <= hi; k++) used.add(k);
        const x = Math.min(...slice.map((l) => l.x));
        const x2 = Math.max(...slice.map((l) => l.x2));
        const y = Math.min(...slice.map((l) => l.y));
        const y2 = Math.max(...slice.map((l) => l.y2));
        if (x2 - x < 30 || y2 - y < 10) continue;
        eqs.push({
          pageIdx,
          kind: "equation",
          label: "수식",
          caption: "",
          x: Math.max(0, x - 6),
          y: Math.max(0, y - 5),
          w: Math.min(W, x2 + 6) - Math.max(0, x - 6),
          h: Math.min(H, y2 + 5) - Math.max(0, y - 5),
          el: null,
        });
      }
    }
    return eqs;
  },

  mountRegions(pg, regs) {
    pg.box.querySelectorAll(".fig-region").forEach((el) => el.remove());
    for (const reg of regs) {
      const el = document.createElement("div");
      el.className = reg.kind === "equation" ? "fig-region fig-region--eq" : "fig-region";
      el.style.left = `calc(var(--scale-factor) * ${reg.x}px)`;
      el.style.top = `calc(var(--scale-factor) * ${reg.y}px)`;
      el.style.width = `calc(var(--scale-factor) * ${reg.w}px)`;
      el.style.height = `calc(var(--scale-factor) * ${reg.h}px)`;
      pg.box.appendChild(el);
      reg.el = el;
    }
  },

  regionAt(clientX, clientY, boxEl) {
    const n = Number(boxEl.dataset.page) - 1;
    const pg = pdfView.pages[n];
    const regs = this.regionsByPage[n];
    if (!pg || !regs?.length) return null;
    const r = boxEl.getBoundingClientRect();
    const ratio = r.width / pg.base.width;
    const x = (clientX - r.left) / ratio, y = (clientY - r.top) / ratio;
    for (const reg of regs) {
      if (x >= reg.x && x <= reg.x + reg.w && y >= reg.y && y <= reg.y + reg.h) return reg;
    }
    return null;
  },

  placeHover(point) {
    const bw = this.hoverBar.offsetWidth || 260;
    const bh = this.hoverBar.offsetHeight || 38;
    const px = point?.x ?? innerWidth / 2;
    const py = point?.y ?? innerHeight / 3;
    const left = Math.min(Math.max(px - bw / 2, 12), Math.max(12, innerWidth - bw - 12));
    const preferAbove = py - bh - 12 >= 68;
    const rawTop = preferAbove ? py - bh - 12 : py + 14;
    const top = Math.min(Math.max(rawTop, 68), Math.max(68, innerHeight - bh - 12));
    this.hoverBar.style.left = `${Math.round(left)}px`;
    this.hoverBar.style.top = `${Math.round(top)}px`;
  },

  setHover(reg, point = null) {
    if (this.hoverReg === reg) return;
    this.hoverReg?.el?.classList.remove("is-hover");
    this.hoverReg = reg;
    content.classList.toggle("is-fig-hover", reg?.kind === "figure" || reg?.kind === "equation");
    if (!reg || this.capturing || this.pending) {
      this.hoverBar.hidden = true;
      return;
    }
    reg.el?.classList.add("is-hover");
    const kindKo = reg.kind === "equation" ? "수식" : reg.kind === "table" ? "표" : "그림";
    const hasSpecific = reg.label && reg.label !== "그림" && reg.label !== "수식";
    const labelText = hasSpecific ? `이 ${kindKo}(${reg.label}) 풀어서 설명받기` : `이 ${kindKo} 풀어서 설명받기`;
    this.hoverBtn.innerHTML = `${ico("spark")}<span>${esc(labelText)}</span><kbd class="kbd">E</kbd>`;
    this.hoverBar.hidden = false;
    this.placeHover(point ?? this.lastMouse);
  },

  openPickFromRegion(reg, point) {
    const pg = pdfView.pages[reg.pageIdx];
    if (!pg) return;
    const pr = pg.box.getBoundingClientRect();
    const ratio = pr.width / pg.base.width;
    this.openPick(reg.pageIdx, reg.x * ratio, reg.y * ratio, reg.w * ratio, reg.h * ratio, point, reg);
  },

  async startFromRegion(reg, point = null) {
    const pg = pdfView.pages[reg.pageIdx];
    if (!pg) return;
    const pr = pg.box.getBoundingClientRect();
    const ratio = pr.width / pg.base.width;
    this.setHover(null);
    await this.startFromRect(reg.pageIdx, reg.x * ratio, reg.y * ratio, reg.w * ratio, reg.h * ratio, {
      label: reg.label,
      caption: reg.caption,
      kind: reg.kind,
      point: point ?? this.lastMouse,
    });
  },

  async copyRegion(reg) {
    const pg = pdfView.pages[reg.pageIdx];
    if (!pg) return;
    const pr = pg.box.getBoundingClientRect();
    const ratio = pr.width / pg.base.width;
    const cropped = await this.crop(reg.pageIdx, reg.x * ratio, reg.y * ratio, reg.w * ratio, reg.h * ratio);
    if (!cropped?.dataUrl) return;
    try {
      const blob = await (await fetch(cropped.dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast("이미지를 복사했어요");
    } catch {
      toast("이미지를 복사하지 못했어요");
    }
  },

  setMode(on) {
    this.capturing = !!on && pdfView.active();
    app.classList.toggle("pdf-crop", this.capturing);
    $("btn-figure").setAttribute("aria-pressed", String(this.capturing));
    $("pdf-crop-bar").hidden = !this.capturing;
    if (this.capturing) {
      this.closePick();
      bubble.hide();
      pdfView.hoverKey = null;
      pdfView.mark(null, "hover");
      trView.hover(null);
      getSelection()?.removeAllRanges();
    } else if (this.drag) {
      this.drag.rectEl?.remove();
      this.drag = null;
    }
  },

  clearPin() {
    this.pinEl?.remove();
    this.pinEl = null;
  },

  placePin(pg, bx, by, bw, bh) {
    this.clearPin();
    const pin = document.createElement("div");
    pin.className = "pdf-hl--figure";
    pin.style.left = `calc(var(--scale-factor) * ${bx}px)`;
    pin.style.top = `calc(var(--scale-factor) * ${by}px)`;
    pin.style.width = `calc(var(--scale-factor) * ${bw}px)`;
    pin.style.height = `calc(var(--scale-factor) * ${bh}px)`;
    pg.box.appendChild(pin);
    this.pinEl = pin;
  },

  /** 수동 드래그 영역이 자동 감지된 그림·표와 크게 겹치면 번호·캡션 메타를 이어받는다 */
  overlapRegion(pageIdx, bx, by, bw, bh) {
    const regs = this.regionsByPage[pageIdx];
    if (!regs?.length) return null;
    const area = Math.max(1, bw * bh);
    let best = null, bestScore = 0;
    for (const reg of regs) {
      const ix = Math.max(0, Math.min(bx + bw, reg.x + reg.w) - Math.max(bx, reg.x));
      const iy = Math.max(0, Math.min(by + bh, reg.y + reg.h) - Math.max(by, reg.y));
      const inter = ix * iy;
      if (inter <= 0) continue;
      const score = Math.max(inter / area, inter / Math.max(1, reg.w * reg.h));
      if (score > bestScore) { bestScore = score; best = reg; }
    }
    return bestScore >= 0.35 ? best : null;
  },

  placePick(point) {
    const pw = this.pick.offsetWidth || Math.min(392, innerWidth - 24);
    const ph = this.pick.offsetHeight || 96;
    const px = point?.x ?? innerWidth / 2;
    const py = point?.y ?? innerHeight / 3;
    const preferRight = px + 10 + pw <= innerWidth - 12;
    const rawLeft = preferRight ? px + 10 : px - pw - 10;
    const left = Math.min(Math.max(rawLeft, 12), Math.max(12, innerWidth - pw - 12));
    const preferBelow = py + 12 + ph <= innerHeight - 12;
    const rawTop = preferBelow ? py + 12 : py - ph - 12;
    const top = Math.min(Math.max(rawTop, 68), Math.max(68, innerHeight - ph - 12));
    this.pick.style.left = `${Math.round(left)}px`;
    this.pick.style.top = `${Math.round(top)}px`;
  },

  /** 드래그 완료 또는 그림 클릭 직후 바로 AI 요청을 보내지 않고, 마우스 위치에 요청 선택 팝오버를 띄운다 */
  openPick(pageIdx, rx, ry, rw, rh, point, knownReg = null) {
    const pg = pdfView.pages[pageIdx];
    if (!pg) return;
    const pr = pg.box.getBoundingClientRect();
    const scale = pr.width / pg.base.width;
    const bx = rx / scale, by = ry / scale, bw = rw / scale, bh = rh / scale;
    const hit = knownReg ?? this.overlapRegion(pageIdx, bx, by, bw, bh);

    this.setHover(null);
    this.placePin(pg, bx, by, bw, bh);
    const cropPromise = this.crop(pageIdx, rx, ry, rw, rh);
    const anchor = point ?? { x: pr.left + rx + rw / 2, y: pr.top + ry + rh / 2 };
    this.pending = { pageIdx, bx, by, bw, bh, point: anchor, hit, cropPromise };

    this.pickInput.value = "";
    const isEq = hit?.kind === "equation";
    const [b1, b2, b3] = this.pick.querySelectorAll("button[data-action]");
    if (b1) b1.textContent = isEq ? "수식 설명" : hit?.kind === "table" ? "표 설명" : "그림 설명";
    if (b2) b2.textContent = isEq ? "기호·변수 정리" : "핵심 요약";
    if (b3) b3.textContent = isEq ? "쉬운 예시로" : "수식·기호 풀이";
    this.pickInput.placeholder = isEq ? "이 수식에 대해 직접 질문…" : "이 영역에 대해 직접 질문…";
    this.pick.hidden = false;
    this.placePick(anchor);
    setTimeout(() => this.pickInput.focus(), 0);
  },

  closePick(keepPin = false) {
    if (!this.pending && this.pick.hidden) return;
    this.pending = null;
    this.pick.hidden = true;
    this.pickInput.value = "";
    this.dismissedAt = Date.now();
    if (!keepPin) this.clearPin();
  },

  async commitPick(question = null) {
    const p = this.pending;
    if (!p) return;
    const cropped = await p.cropPromise;
    if (!cropped?.b64) { this.closePick(); toast("선택한 영역을 잘라내지 못했어요"); return; }
    this.closePick(true);
    this.openCardWithCrop(p.pageIdx, p.bx, p.by, p.bw, p.bh, cropped, {
      kind: p.hit?.kind ?? "region",
      label: p.hit?.label ?? "",
      caption: p.hit?.caption ?? "",
      point: p.point,
    }, question);
  },

  async copyPending() {
    const p = this.pending;
    if (!p) return;
    const cropped = await p.cropPromise;
    this.closePick();
    if (!cropped?.dataUrl) { toast("이미지를 복사하지 못했어요"); return; }
    try {
      const blob = await (await fetch(cropped.dataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast("이미지를 복사했어요");
    } catch {
      toast("이미지를 복사하지 못했어요");
    }
  },

  close() {
    this.seq++;
    this.loading = false;
    this.closePick();
    this.card.hidden = true;
    this.card.classList.remove("is-min");
    $("fig-preview-btn").classList.remove("is-zoomed");
    this.clearPin();
  },

  /** 선택한 PDF 영역 주변 텍스트(캡션·그림 번호·수식 기호 정의 등)를 뽑아 AI에 함께 보낸다 */
  nearbyText(pageIdx, x, y, w, h, isEq = false) {
    const pg = pdfView.pages[pageIdx];
    if (!pg?.items?.length) return "";
    const padTop = isEq ? 120 : 55;
    const padBot = isEq ? 160 : 110;
    const padX = isEq ? 90 : 40;
    const parts = [];
    for (const it of pg.items) {
      if (!it.str?.trim()) continue;
      const [ix, baseline] = pg.base.convertToViewportPoint(it.transform[4], it.transform[5]);
      const ih = it.height || Math.hypot(it.transform[2], it.transform[3]) || 8;
      const iw = it.width || ih * it.str.length * 0.5;
      const iy = baseline - ih * 0.8;
      if (ix + iw >= x - padX && ix <= x + w + padX && iy + ih >= y - padTop && iy <= y + h + padBot) {
        parts.push(it.str);
      }
    }
    return parts.join(" ").replace(/\s+/g, " ").trim().slice(0, isEq ? 2200 : 1500);
  },

  /** 현재 페이지 전체 텍스트 (그림이 위치한 쪽의 주변 설명·수식·표 문맥) */
  fullPageText(pageIdx) {
    const pg = pdfView.pages[pageIdx];
    if (!pg?.items?.length) return "";
    return pg.items.map((it) => it.str || "").join(" ").replace(/\s+/g, " ").trim().slice(0, 6000);
  },

  /** PDF 페이지에서 드래그·감지한 사각형 영역을 고해상도(최소 2.2배, 수식은 3.2배, 최대 1600px) PNG로 잘라낸다 */
  async crop(pageIdx, rx, ry, rw, rh) {
    const pg = pdfView.pages[pageIdx];
    if (!pg) return null;
    const pr = pg.box.getBoundingClientRect();
    let srcCanvas = pg.box.querySelector("canvas");
    // 작은 수식(첨자·그리스 문자)은 3.2배, 그림·표는 최소 2.2배 해상도로 렌더링한다
    const baseH = (rh / pr.height) * pg.base.height;
    const minDensity = baseH < 85 ? 3.0 : 2.2;
    const renderScale = baseH < 85 ? 3.2 : 2.4;
    const curDensity = srcCanvas && pg.base.width ? srcCanvas.width / pg.base.width : 0;
    if (!srcCanvas || curDensity < minDensity) {
      const vp = pg.page.getViewport({ scale: renderScale });
      srcCanvas = document.createElement("canvas");
      srcCanvas.width = Math.floor(vp.width);
      srcCanvas.height = Math.floor(vp.height);
      await pg.page.render({ canvasContext: srcCanvas.getContext("2d"), viewport: vp }).promise;
    }
    const sx = Math.max(0, Math.floor((rx / pr.width) * srcCanvas.width));
    const sy = Math.max(0, Math.floor((ry / pr.height) * srcCanvas.height));
    const sw = Math.min(srcCanvas.width - sx, Math.max(1, Math.ceil((rw / pr.width) * srcCanvas.width)));
    const sh = Math.min(srcCanvas.height - sy, Math.max(1, Math.ceil((rh / pr.height) * srcCanvas.height)));
    const maxDim = 1600;
    const ratio = Math.min(1, maxDim / Math.max(sw, sh));
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(sw * ratio));
    out.height = Math.max(1, Math.round(sh * ratio));
    const ctx = out.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, out.width, out.height);
    const dataUrl = out.toDataURL("image/png");
    return { dataUrl, b64: dataUrl.split(",")[1], mime: "image/png" };
  },

  /** 클릭(또는 드래그 끝)한 마우스 위치 기준으로 카드를 띄우고, 큰 그림이어도 화면 밖으로 벗어나지 않게 맞춘다 */
  placeAt(point) {
    const cw = this.card.offsetWidth || Math.min(440, innerWidth - 24);
    const ch = Math.min(Math.max(this.card.offsetHeight || 360, 360), Math.min(560, innerHeight - 84));
    const px = point?.x ?? innerWidth / 2;
    const py = point?.y ?? innerHeight / 3;
    // 마우스 오른쪽 아래로 자연스럽게 열되, 공간이 부족하면 왼쪽/위로 뒤집고 항상 화면 안에 가둔다
    const preferRight = px + 14 + cw <= innerWidth - 12;
    const rawLeft = preferRight ? px + 14 : px - cw - 14;
    const left = Math.min(Math.max(rawLeft, 12), Math.max(12, innerWidth - cw - 12));
    const preferBelow = py + 12 + ch <= innerHeight - 12;
    const rawTop = preferBelow ? py + 12 : py - ch - 12;
    const top = Math.min(Math.max(rawTop, 68), Math.max(68, innerHeight - ch - 12));
    this.card.style.left = `${Math.round(left)}px`;
    this.card.style.top = `${Math.round(top)}px`;
  },

  /** 카드 높이가 스트리밍 중 커졌을 때 화면 아래로 넘치지 않게 살짝 끌어올린다 */
  clampInView() {
    if (this.card.hidden) return;
    const r = this.card.getBoundingClientRect();
    if (r.bottom > innerHeight - 12) {
      const top = Math.max(68, innerHeight - r.height - 12);
      this.card.style.top = `${Math.round(top)}px`;
    }
    if (r.right > innerWidth - 12) {
      const left = Math.max(12, innerWidth - r.width - 12);
      this.card.style.left = `${Math.round(left)}px`;
    }
  },

  openCardWithCrop(pageIdx, bx, by, bw, bh, cropped, meta = null, question = null) {
    this.imageB64 = cropped.b64;
    this.mime = cropped.mime;
    this.page = pageIdx + 1;
    this.kind = meta?.kind ?? "region";
    const isEq = this.kind === "equation";
    this.label = meta?.label && meta.label !== "그림" && meta.label !== "수식" ? meta.label : "";
    this.caption = meta?.caption ?? "";
    this.pageText = this.fullPageText(pageIdx);
    this.nearby = this.nearbyText(pageIdx, bx, by, bw, bh, isEq);
    this.messages = [];
    $("fig-preview").src = cropped.dataUrl;
    $("fig-preview-btn").classList.remove("is-zoomed");
    $("fig-ctx").hidden = true;
    const kindKo = isEq ? "수식 설명" : this.kind === "table" ? "표 설명" : "그림 설명";
    const suffix = isEq ? "풀이" : "설명";
    $("fig-head").querySelector("strong").textContent = this.label ? `${this.label} ${suffix}` : kindKo;
    $("fig-page").textContent = `p.${this.page}`;
    this.input.placeholder = isEq ? "이 수식에 대해 이어서 질문…" : "이 그림에 대해 이어서 질문…";
    const chips = isEq
      ? [
        ["쉬운 숫자 예시로", "이 수식에 간단한 숫자를 넣어서 어떻게 계산되는지 예시로 설명해 줘."],
        ["유도·원리 단계별", "이 수식이 왜 이런 형태로 나왔는지 핵심 원리와 유도 과정을 단계별로 설명해 줘."],
        ["본문에서 쓰이는 곳", "이 수식이 논문의 방법론이나 실험·평가에서 어떻게 쓰이는지 연결해서 설명해 줘."],
      ]
      : [
        ["핵심만 3줄로", "이 그림의 핵심 결론만 3줄로 요약해 줘."],
        ["축·기호 자세히", "그림 속 축, 범례, 기호, 수치가 각각 무엇을 의미하는지 자세히 설명해 줘."],
        ["본문 결과와 연결", "이 그림이 논문의 본문 주장이나 실험 결과와 어떻게 연결되는지 설명해 줘."],
      ];
    $("fig-chips").innerHTML = chips.map(([lbl, q]) => `<button class="t-chip" type="button" data-q="${esc(q)}">${esc(lbl)}</button>`).join("");
    this.card.classList.remove("is-min");
    this.card.hidden = false;
    this.placeAt(meta?.point ?? this.lastMouse);
    this.run(question);
  },

  async startFromRect(pageIdx, rx, ry, rw, rh, meta = null) {
    const pg = pdfView.pages[pageIdx];
    if (!pg) return;
    const pr = pg.box.getBoundingClientRect();
    const scale = pr.width / pg.base.width;
    const bx = rx / scale, by = ry / scale, bw = rw / scale, bh = rh / scale;

    const cropped = await this.crop(pageIdx, rx, ry, rw, rh);
    if (!cropped?.b64) { toast("선택한 영역을 잘라내지 못했어요"); return; }

    this.closePick();
    this.placePin(pg, bx, by, bw, bh);
    this.openCardWithCrop(pageIdx, bx, by, bw, bh, cropped, {
      ...meta,
      point: meta?.point ?? { x: pr.left + rx + rw / 2, y: pr.top + ry + rh / 2 },
    }, null);
  },

  history() {
    return this.messages
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-8)
      .map((m) => ({ role: m.role, text: m.text.slice(0, 1500) }));
  },

  async run(question = null) {
    if (!this.imageB64 || this.loading) return;
    if (P.llm?.problem) { modelDialog.show(); return; }
    const id = ++this.seq;
    const hist = question ? this.history() : [];
    if (question) this.messages.push({ role: "user", text: question });
    else this.messages = [];
    const reply = { role: "assistant", text: "", streaming: true };
    this.messages.push(reply);
    this.loading = true;
    this.render();
    try {
      const ch = new T.core.Channel();
      ch.onmessage = (e) => {
        if (id !== this.seq) return;
        if (e.kind === "meta") {
          const tags = [];
          if (e.hasCaption) tags.push("캡션");
          if (e.mentions > 0) tags.push(`본문 언급 ${e.mentions}개 문단`);
          if (e.hasAbstract) tags.push("초록");
          if (this.pageText) tags.push(`p.${this.page} 본문`);
          const ctxEl = $("fig-ctx");
          ctxEl.hidden = !tags.length;
          ctxEl.innerHTML = tags.length ? `참고 컨텍스트 ${tags.map((t) => `<span>${esc(t)}</span>`).join("")}` : "";
          if (e.label) $("fig-head").querySelector("strong").textContent = `${e.label} ${this.kind === "equation" ? "풀이" : "설명"}`;
        } else if (e.kind === "delta") {
          reply.text += e.text;
          this.renderLast();
        }
      };
      const r = await invoke("explain_figure", {
        imageB64: this.imageB64,
        mime: this.mime,
        page: this.page,
        kind: this.kind || null,
        label: this.label || null,
        caption: this.caption || null,
        pageText: this.pageText || null,
        nearby: this.nearby || null,
        question: question || null,
        docId: isPaper() ? P.doc.id : null,
        history: hist,
        lang: P.lang,
        onEvent: ch,
      });
      if (id !== this.seq) return;
      reply.text = r.reply;
    } catch (e) {
      if (id !== this.seq) return;
      if (!reply.text) this.messages.pop();
      this.messages.push({ role: "error", text: koText(e) });
    } finally {
      if (id === this.seq) {
        reply.streaming = false;
        this.loading = false;
        this.render();
      }
    }
  },

  msgEl(m) {
    const el = document.createElement("div");
    el.className = `msg msg--${m.role}`;
    if (m.role === "user") {
      el.innerHTML = `<div class="bubble">${esc(m.text)}</div>`;
    } else if (m.role === "error") {
      el.innerHTML = `<div class="bubble">${esc(m.text)}</div>`;
    } else {
      const body = document.createElement("div");
      body.className = "answer markdown-body";
      if (!m.text && m.streaming) body.innerHTML = `<div class="thinking">${spinner()}<span>${this.kind === "equation" ? "수식을 풀이하고 있어요…" : "그림을 분석하고 있어요…"}</span></div>`;
      else if (m.streaming) body.textContent = m.text;
      else ask.markdown(m.text, body);
      el.appendChild(body);
    }
    return el;
  },

  render() {
    this.log.replaceChildren(...this.messages.map((m) => this.msgEl(m)));
    const hasReply = this.messages.some((m) => m.role === "assistant" && !m.streaming && m.text);
    $("fig-chips").hidden = !hasReply || this.loading || this.messages.length > 2;
    $("fig-send").disabled = this.loading;
    const body = this.card.querySelector(".fig-card__body");
    if (body) body.scrollTop = body.scrollHeight;
    this.clampInView();
  },

  renderLast() {
    const last = this.log.lastElementChild;
    const m = this.messages[this.messages.length - 1];
    if (!last || !m) return this.render();
    last.replaceWith(this.msgEl(m));
    const body = this.card.querySelector(".fig-card__body");
    if (body && body.scrollHeight - body.scrollTop - body.clientHeight < 60) body.scrollTop = body.scrollHeight;
  },
};

$("btn-figure").addEventListener("click", () => {
  if (!pdfView.active()) return;
  figure.setMode(!figure.capturing);
});
$("pdf-crop-cancel").addEventListener("click", () => figure.setMode(false));

// PDF 페이지 위에서 사각형 드래그로 그림 영역 선택
content.addEventListener("pointerdown", (e) => {
  if (!figure.capturing || e.button !== 0) return;
  const box = e.target.closest?.(".pdf-page");
  if (!box) return;
  e.preventDefault();
  const pageIdx = Number(box.dataset.page) - 1;
  const r = box.getBoundingClientRect();
  const x0 = Math.min(Math.max(e.clientX - r.left, 0), r.width);
  const y0 = Math.min(Math.max(e.clientY - r.top, 0), r.height);
  const rectEl = document.createElement("div");
  rectEl.className = "pdf-crop-rect";
  const sizeEl = document.createElement("span");
  sizeEl.className = "pdf-crop-size";
  rectEl.appendChild(sizeEl);
  box.appendChild(rectEl);
  figure.drag = { pageIdx, box, r, x0, y0, x1: x0, y1: y0, rectEl, sizeEl };
});
window.addEventListener("pointermove", (e) => {
  const d = figure.drag;
  if (!d) return;
  const r = d.box.getBoundingClientRect();
  d.x1 = Math.min(Math.max(e.clientX - r.left, 0), r.width);
  d.y1 = Math.min(Math.max(e.clientY - r.top, 0), r.height);
  const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1);
  const w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
  d.rectEl.style.left = `${x}px`;
  d.rectEl.style.top = `${y}px`;
  d.rectEl.style.width = `${w}px`;
  d.rectEl.style.height = `${h}px`;
  d.sizeEl.textContent = `${Math.round(w)} × ${Math.round(h)}`;
});
window.addEventListener("pointerup", (e) => {
  const d = figure.drag;
  if (!d) return;
  figure.drag = null;
  d.rectEl.remove();
  const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1);
  const w = Math.abs(d.x1 - d.x0), h = Math.abs(d.y1 - d.y0);
  if (w < 24 || h < 24) { toast("그림 영역을 조금 더 넓게 드래그해 주세요"); return; }
  figure.setMode(false);
  figure.openPick(d.pageIdx, x, y, w, h, { x: e.clientX, y: e.clientY });
});

// 자동 감지된 그림·표 호버 바 동작
$("fig-hover-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  if (figure.hoverReg) figure.startFromRegion(figure.hoverReg, { x: e.clientX, y: e.clientY });
});
$("fig-hover-copy").addEventListener("click", (e) => {
  e.stopPropagation();
  if (figure.hoverReg) figure.copyRegion(figure.hoverReg);
});
figure.hoverBar.addEventListener("pointerleave", (e) => {
  if (e.relatedTarget && content.contains(e.relatedTarget)) return;
  figure.setHover(null);
});

// 드래그·클릭 선택 후 요청 고르기 팝오버
const FIG_PICK_PROMPTS = {
  explain: null,
  summary: "이 영역의 핵심 내용과 결론만 3줄 이내로 간결하게 요약해 줘.",
  symbols: "이 영역에 나온 수식·기호·변수·축과 범례가 각각 무엇을 뜻하는지 쉽게 풀어 설명해 줘.",
};
const EQ_PICK_PROMPTS = {
  explain: null,
  summary: "이 수식에 나오는 모든 기호, 변수, 첨자, 함수의 의미를 본문 정의에 맞춰 목록으로 깔끔하게 정리해 줘.",
  symbols: "이 수식이 실제로 어떻게 동작하는지 간단한 숫자 예시나 직관적인 비유로 쉽게 설명해 줘.",
};
$("fig-pick").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-action]");
  if (!b) return;
  const map = figure.pending?.hit?.kind === "equation" ? EQ_PICK_PROMPTS : FIG_PICK_PROMPTS;
  figure.commitPick(map[b.dataset.action] ?? null);
});
$("fig-pick-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = figure.pickInput.value.trim();
  if (!q) return;
  figure.commitPick(q);
});
$("fig-pick-copy").addEventListener("click", () => figure.copyPending());
$("fig-pick-retry").addEventListener("click", () => figure.setMode(true));
$("fig-pick-close").addEventListener("click", () => figure.closePick());
document.addEventListener("pointerdown", (e) => {
  if (!figure.pending) return;
  if (figure.pick.contains(e.target) || e.target.closest?.("#btn-figure")) return;
  figure.closePick();
}, true);

// 그림 설명 카드 헤더 드래그로 위치 이동
let figMove = null;
$("fig-head").addEventListener("pointerdown", (e) => {
  if (e.button !== 0 || e.target.closest("button")) return;
  const r = figure.card.getBoundingClientRect();
  figMove = { dx: e.clientX - r.left, dy: e.clientY - r.top };
  e.preventDefault();
});
window.addEventListener("pointermove", (e) => {
  if (!figMove) return;
  const w = figure.card.offsetWidth, h = figure.card.offsetHeight;
  const left = Math.min(Math.max(e.clientX - figMove.dx, 8), innerWidth - w - 8);
  const top = Math.min(Math.max(e.clientY - figMove.dy, 64), innerHeight - Math.min(h, 80) - 8);
  figure.card.style.left = `${Math.round(left)}px`;
  figure.card.style.top = `${Math.round(top)}px`;
});
window.addEventListener("pointerup", () => { figMove = null; });

$("fig-close").addEventListener("click", () => figure.close());
$("fig-min").addEventListener("click", () => figure.card.classList.toggle("is-min"));
$("fig-preview-btn").addEventListener("click", () => $("fig-preview-btn").classList.toggle("is-zoomed"));
$("fig-redo").addEventListener("click", () => figure.run(null));
$("fig-copy").addEventListener("click", () => {
  const txt = figure.messages.filter((m) => m.role === "assistant" && m.text).map((m) => m.text).join("\n\n---\n\n");
  if (!txt) return;
  navigator.clipboard?.writeText(txt).then(() => toast("그림 설명을 복사했어요"), () => toast("복사하지 못했어요"));
});
$("fig-chips").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-q]");
  if (b) figure.run(b.dataset.q);
});
$("fig-form").addEventListener("submit", (e) => {
  e.preventDefault();
  const q = figure.input.value.trim();
  if (!q || figure.loading) return;
  figure.input.value = "";
  figure.run(q);
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") {
    if (figure.capturing) { e.preventDefault(); e.stopPropagation(); figure.setMode(false); }
    else if (figure.pending) { e.preventDefault(); e.stopPropagation(); figure.closePick(); }
    else if (!figure.card.hidden && document.activeElement !== figure.input) { e.preventDefault(); e.stopPropagation(); figure.close(); }
    return;
  }
  // 그림·표 위에 마우스를 올린 상태에서 E 키를 누르면 바로 설명 (문라이트 단축키)
  if ((e.key === "e" || e.key === "E") && !e.metaKey && !e.ctrlKey && !e.altKey && figure.hoverReg && !figure.capturing && !figure.pending) {
    const tag = document.activeElement?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || document.activeElement?.isContentEditable) return;
    e.preventDefault();
    figure.startFromRegion(figure.hoverReg, figure.lastMouse);
  }
}, true);

// ───────────────────────── AI로 논문 찾기 ─────────────────────────

const AI_EXAMPLES = {
  search: ["LLM 파라미터에 지식을 저장하는 방법을 다룬 서베이", "RAG 원조 논문과 최근 개선 연구", "긴 문맥을 위한 빠른 어텐션"],
  roadmap: ["LLM이 지식을 저장하는 방식을 연구하고 싶어요", "지금 연 논문의 읽기 로드맵", "확산 모델을 어디서부터 읽어야 할까요"],
};
const ai = {
  mode: "search",
  messages: [],   // { role: user|assistant|error, text, picks? }
  loading: false,
  render() {
    const log = $("ai-log");
    $("ai-mode").querySelectorAll("button").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.mode === this.mode)));
    log.replaceChildren();
    if (!this.messages.length) {
      const empty = document.createElement("div");
      empty.className = "ai-empty";
      empty.innerHTML = this.mode === "roadmap"
        ? `<h2>무엇을 연구하고 싶나요?</h2><p>주제나 논문을 말하면 읽을 순서대로 논문을 골라 줘요. "이 논문"은 지금 연 논문이에요.</p>`
        : `<h2>어떤 논문을 찾고 있나요?</h2><p>주제나 궁금한 점을 쓰면 Claude가 arXiv에서 논문을 골라 줘요. 고른 논문의 <b>번역해서 읽기</b>를 누르면 원본 PDF와 번역을 함께 볼 수 있어요.</p>`;
      const ex = document.createElement("div");
      ex.className = "ai-examples";
      for (const t of AI_EXAMPLES[this.mode]) {
        const b = document.createElement("button");
        b.type = "button"; b.className = "t-chip"; b.textContent = t;
        b.addEventListener("click", () => this.ask(t));
        ex.appendChild(b);
      }
      empty.appendChild(ex);
      log.appendChild(empty);
    }
    for (const m of this.messages) {
      const el = document.createElement("div");
      el.className = `msg msg--${m.role}`;
      if (m.role === "user") el.innerHTML = `<div class="bubble">${esc(m.text)}</div>`;
      else if (m.role === "error") el.innerHTML = `<div class="bubble bubble--error">${esc(m.text)}</div>`;
      else {
        el.innerHTML = `<p class="ai-reply">${esc(m.text)}</p>`;
        for (const { hit, why } of m.picks ?? []) el.appendChild(hitCard(hit, why));
      }
      log.appendChild(el);
    }
    if (this.loading) {
      const w = document.createElement("div");
      w.className = "msg msg--assistant";
      w.innerHTML = `<div class="thinking">${spinner()}<span>arXiv에서 찾는 중…</span></div>`;
      log.appendChild(w);
    }
    log.scrollTop = log.scrollHeight;
    $("ai-input").placeholder = this.mode === "roadmap" ? "예: LLM이 지식을 저장하는 방식을 연구하고 싶어요" : "예: 트랜스포머 KV 캐시를 압축하는 논문";
    $("ai-send").disabled = this.loading;
  },
  async ask(text) {
    const q = text.trim();
    if (!q || this.loading) return;
    if (P.llm?.problem) { modelDialog.show(); return; }
    const history = this.messages.filter((m) => m.role !== "error").map((m) => ({
      role: m.role,
      text: m.role === "assistant" && m.picks?.length ? `${m.text}\n${m.picks.map((p) => `${p.hit.id} ${p.hit.title}`).join("\n")}` : m.text,
    }));
    this.messages.push({ role: "user", text: q });
    this.loading = true;
    this.render();
    try {
      const a = await invoke("ai_recommend", { request: q, history, lang: P.lang, mode: this.mode });
      if (a.roadmap || (a.roadmap === "" && a.picks.length)) {
        if (a.picks.length) this.messages.push({ role: "assistant", text: a.reply, picks: a.picks });
        this.loading = false;
        this.render();
        await this.roadmapFrom(a.roadmap || a.picks[0].hit.id);
        return;
      }
      this.messages.push({ role: "assistant", text: a.reply, picks: a.picks });
    } catch (e) {
      this.messages.push({ role: "error", text: koText(e) });
    }
    this.loading = false;
    this.render();
  },
  /** AI가 로드맵을 원하면: 이름 댄 논문(없으면 가져옴)이나 지금 연 논문에서 시작 */
  async roadmapFrom(seed) {
    let docId = null, title = "";
    if (seed === "this") { docId = P.doc?.id ?? null; title = P.doc?.title ?? ""; }
    else if (seed) {
      const saved = P.papers.find((p) => arxivIdOf(p.id) === seed);
      if (saved) { docId = saved.id; title = saved.title; }
      else {
        const seq = loading.show("arXiv에서 논문을 가져오고 있어요");
        try { const meta = await invoke("open_arxiv", { input: seed }); docId = meta.id; title = meta.title; await refreshPapers(); }
        catch (e) { this.messages.push({ role: "error", text: koText(e) }); this.render(); return; }
        finally { loading.hide(seq); }
      }
    }
    if (!docId) {
      this.messages.push({ role: "assistant", text: "어떤 논문에서 시작할까요? 논문을 열거나 arXiv 번호를 알려 주세요", picks: [] });
      this.render();
      return;
    }
    roadmap.show(docId, title);
  },
};
$("ai-mode").addEventListener("click", (e) => {
  const b = e.target.closest("button[data-mode]");
  if (!b || b.dataset.mode === ai.mode) return;
  ai.mode = b.dataset.mode;
  ai.render();
  $("ai-input").focus();
});
$("ai-form").addEventListener("submit", (e) => { e.preventDefault(); const v = $("ai-input").value; $("ai-input").value = ""; ai.ask(v); });
$("ai-input").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); $("ai-form").requestSubmit(); }
});

/** arXiv 논문 카드: AI 추천, 검색 결과, 로드맵이 같이 쓴다 */
function hitCard(hit, why, extra = "") {
  const el = document.createElement("article");
  el.className = "hit";
  const saved = P.papers.some((p) => arxivIdOf(p.id) === hit.id);
  const authors = hit.authors?.length > 2 ? `${hit.authors[0]} 외` : (hit.authors ?? []).join(", ");
  el.innerHTML =
    `<h3 class="hit__title" lang="en">${esc(hit.title)}</h3>` +
    `<div class="hit__meta"><span>arXiv:${esc(hit.id)}</span>${authors ? `<span>${esc(authors)}</span>` : ""}` +
    `${hit.published ? `<span>${esc(String(hit.published).slice(0, 4))}</span>` : ""}${extra}</div>` +
    `${why ? `<p class="hit__why">${esc(why)}</p>` : ""}` +
    `${hit.summary ? `<p class="hit__sum" lang="en">${esc(hit.summary)}</p>` : ""}` +
    `<div class="hit__acts"><button class="t-btn t-btn--sm t-btn--primary" type="button" data-act="open">${saved ? "서재에서 열기" : "번역해서 읽기"}</button>` +
    `<button class="t-btn t-btn--sm t-btn--grey" type="button" data-act="web">arxiv.org ${ico("ext")}</button></div>`;
  el.querySelector("[data-act=open]").addEventListener("click", () => openArxivHit(hit.id));
  el.querySelector("[data-act=web]").addEventListener("click", () => invoke("open_arxiv_page", { id: hit.id }).catch((e) => toast(koText(e))));
  return el;
}

// ───────────────────────── arXiv 검색 ─────────────────────────

const ARXIV_GAP = 1100; // arXiv 요청 사이 간격 (백엔드도 같은 간격을 지킨다)
const arxivSearch = {
  query: "",
  page: null,
  hits: [],
  loading: false,
  async run(query, start) {
    const q = query.trim();
    if (!q) return;
    if (looksLikeArxivId(q) || looksLikePaperLink(q)) { importLink(q); return; }
    this.loading = true;
    if (start === 0) { this.query = q; this.hits = []; }
    this.render();
    try {
      const page = await invoke("arxiv_search", { query: q, start });
      this.page = page;
      this.hits = start === 0 ? page.hits : [...this.hits, ...page.hits];
    } catch (e) { toast(koText(e)); }
    this.loading = false;
    this.render();
  },
  render() {
    const list = $("arxiv-results");
    list.replaceChildren(...this.hits.map((h) => hitCard(h, "")));
    const total = this.page?.total ?? 0;
    $("arxiv-summary").textContent = this.query && !this.loading ? (total ? `"${this.query}" 결과 ${total.toLocaleString()}개` : `"${this.query}"에 맞는 논문이 없어요`) : "";
    $("arxiv-more").hidden = this.loading || !this.page || this.hits.length >= total;
    $("arxiv-wait").hidden = !this.loading;
  },
};
$("arxiv-form").addEventListener("submit", (e) => { e.preventDefault(); arxivSearch.run($("arxiv-input").value, 0); });
$("arxiv-more").addEventListener("click", () => setTimeout(() => arxivSearch.run(arxivSearch.query, arxivSearch.hits.length), 0));

// ───────────────────────── 읽기 로드맵 ─────────────────────────

const STEP_TEXT = { references: "이 논문이 바탕으로 삼은 논문을 찾는 중", citing: "이 논문을 이어 간 논문을 찾는 중", ordering: "읽을 순서로 정리하는 중" };
const RELATION = { "key-reference": "핵심 참고 문헌", reference: "이 논문이 인용함", citing: "이 논문을 인용함", "recent-citing": "최근 후속 연구" };
const roadmap = {
  docId: null, title: "", data: null, step: null, error: null, seq: 0, busy: false,
  show(docId, title, fresh = false) {
    if (P.llm?.problem && fresh) { modelDialog.show(); return; }
    // 같은 논문의 로드맵을 만들고 있거나 이미 받았으면 그 화면으로만 돌아간다 (두 번 만들지 않게)
    if (!fresh && docId === this.docId && !this.error && (this.data || this.busy)) { setView("roadmap"); this.render(); return; }
    const seq = ++this.seq;
    Object.assign(this, { docId, title, data: null, step: null, error: null });
    setView("roadmap");
    this.render();
    const ch = new T.core.Channel();
    ch.onmessage = (m) => { if (seq === this.seq) { this.step = m.data.step; this.render(); } };
    this.busy = true;
    invoke("paper_roadmap", { docId, lang: P.lang, fresh, onEvent: ch })
      .then((data) => { if (seq === this.seq) { this.data = data; this.step = null; this.render(); } })
      .catch((e) => { if (seq === this.seq) { this.error = koText(e); this.step = null; this.render(); } })
      .finally(() => { if (seq === this.seq) this.busy = false; });
  },
  render() {
    const box = $("roadmap-body");
    $("roadmap-seed").textContent = this.data?.title || this.title;
    $("roadmap-redo").hidden = !this.data;
    box.replaceChildren();
    if (this.error) { box.innerHTML = `<div class="t-callout t-callout--danger"><div class="t-callout__body">${esc(this.error)}</div></div>`; return; }
    if (!this.data) {
      const steps = ["references", "citing", "ordering"];
      const at = steps.indexOf(this.step);
      box.innerHTML = `<ol class="rm-steps">${steps.map((s, i) =>
        `<li class="${i < at ? "done" : i === at ? "now" : ""}">${i === at ? spinner() : i < at ? ico("check") : "<i></i>"}<span>${STEP_TEXT[s]}</span></li>`).join("")}</ol>` +
        `<p class="rm-wait">${this.step ? "인용 데이터를 모아 읽을 순서를 만들고 있어요. 1분쯤 걸려요" : "저장된 로드맵을 찾는 중…"}</p>`;
      return;
    }
    const stages = (after) => this.data.stages.filter((s) => !!s.after === after);
    const stageEl = (st) => {
      const sec = document.createElement("section");
      sec.className = "rm-stage";
      sec.innerHTML = `<h2>${esc(st.name)}</h2><p class="rm-goal">${esc(st.goal)}</p>`;
      for (const it of st.items) {
        const meta = [it.year, it.citations != null ? `인용 ${it.citations.toLocaleString()}회` : null, RELATION[it.relation]].filter(Boolean)
          .map((x) => `<span>${esc(x)}</span>`).join("");
        const card = hitCard({ id: it.id, title: it.title, authors: [], published: "" }, it.why, meta);
        if (it.focus) card.querySelector(".hit__acts").insertAdjacentHTML("beforebegin", `<p class="hit__focus"><b>집중해서 볼 곳</b> ${esc(it.focus)}</p>`);
        sec.appendChild(card);
      }
      return sec;
    };
    stages(false).forEach((s) => box.appendChild(stageEl(s)));
    const seed = document.createElement("div");
    seed.className = "rm-seed";
    seed.innerHTML = `<span>지금 논문</span><strong lang="en">${esc(this.data.title || this.title)}</strong>`;
    seed.addEventListener("click", () => openPaper(this.docId));
    box.appendChild(seed);
    stages(true).forEach((s) => box.appendChild(stageEl(s)));
    if (!this.data.openalex) box.insertAdjacentHTML("beforeend", `<p class="rm-note">OpenAlex에서 인용 정보를 찾지 못해 arXiv 검색만으로 만들었어요.</p>`);
  },
};
$("roadmap-back").addEventListener("click", () => { if (roadmap.docId) openPaper(roadmap.docId); });
$("roadmap-redo").addEventListener("click", () => roadmap.show(roadmap.docId, roadmap.title, true));

// ───────────────────────── 사이드바 ─────────────────────────

$("btn-pdf").addEventListener("click", pickPdf);
$("btn-link-side").addEventListener("click", () => linkDialog.show());
document.querySelectorAll(".papers-nav button[data-view]").forEach((b) =>
  b.addEventListener("click", () => { setView(b.dataset.view); if (b.dataset.view === "ai") ai.render(); }));

// ───────────────────────── 시작 ─────────────────────────

async function paperBoot() {
  app.dataset.view = "doc";
  app.dataset.rtab = rside.tab;
  if (store.get("paper.sideOpen", false)) app.classList.add("rside-open");
  rside.sync();
  trView.render();
  ai.render();
  if (!T) return;
  await Promise.all([loadLangs(), refreshPapers(), checkLlm()]);
}

boot();
paperBoot();
