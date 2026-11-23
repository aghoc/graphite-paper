# 구현 계획

Graphite Paper는 Graphite 0.1.0(커밋 `5fbb8d2`)의 코드에서 출발합니다. 논문 처리는 OpenPaper(커밋 `bb870a7`)의 Rust 모듈을 가져와 고쳐 쓰고, 화면은 Graphite 방식(순수 JS, `ui.css` 부품)으로 새로 만듭니다.

## 원칙

- **화면은 Graphite 것을 씁니다.** 상단 바, 사이드바(파일/목차), 찾기, 글자 크기, 다크 모드, 디자인 토큰을 그대로 두고 논문 리더를 그 안에 넣습니다.
- **Rust 코어는 OpenPaper에서 가져옵니다.** 가져온 모듈은 `src-tauri/src/paper/` 아래에 두고, 원본에 딸린 단위 테스트도 함께 가져옵니다. 가져온 목록은 [licenses/openpaper/NOTICE.md](../licenses/openpaper/NOTICE.md)에 적습니다.
- **논문은 Markdown으로 바꾸지 않습니다.** 원문과 번역을 문장 단위로 짝지으려면 OpenPaper의 `Doc` / `Block` / `Unit` 구조가 필요하므로, 이 구조를 받아 리더가 직접 그립니다.
- **리더는 한 단이 기본입니다.** 번역을 켜면 넓은 2단(원문 | 번역)으로 펼칩니다.
- **가져오지 않는 것**: `update.rs`, `install.sh`(GitHub의 스크립트를 받아 실행하는 자동 업데이트), UI 다국어(`locales`), Windows 대응

## 단계

### 0. 준비 — 끝남

- Graphite 코드를 복사하고 이름, 번들 ID(`dev.graphite.paper`), 바이너리 이름을 바꿉니다.
- `.md` 파일 연결을 없앱니다. 마크다운 기본 앱은 Graphite가 맡습니다.
- Rust edition을 2024(`rust-version` 1.85)로 올립니다.
- OpenPaper 라이선스 전문과 저작권 안내를 `licenses/openpaper/`에 넣습니다.

### 1. 논문 열기와 원문 읽기 (AI 없이) — 구현함, 앱 화면 확인 남음

- 가져온 모듈: `model.rs`, `sentence.rs`, `layout.rs`, `pdf.rs`, `arxiv.rs`, `link.rs`, `search.rs`(`src-tauri/src/paper/`)
- 새 명령: `open_paper_file`(PDF 경로), `open_paper_link`(arXiv 번호·링크, 논문 링크, DOI), `take_launch_path`, `is_paper`
- 화면: 논문 구조를 마크다운 렌더 결과와 같은 모양의 HTML로 바꿔(`paperHtml`) 기존 `#viewer`에 그립니다. 그래서 목차, 찾기, 글자 크기, KaTeX, 표 꾸미기를 마크다운과 같이 씁니다. 문장마다 `<span class="s" data-s="문단:문장">`을 붙여 3단계 번역 짝짓기에 씁니다.
- 열기: `⌘O`(PDF·마크다운), 끌어다 놓기, 파일 탐색기, `⌘L` 링크 대화상자, Finder "다음으로 열기"(PDF 연결은 Alternate 순위라 기본 앱을 빼앗지 않음)
- 논문을 열면 마크다운 파일 감시와 저장 대상을 비우고, 보기/편집 전환과 저장 버튼을 숨깁니다.
- 확인: `PAPER_IN=<PDF|arXiv 번호> PAPER_OUT=out.json cargo test -- --ignored dump_paper`로 백엔드 결과를 JSON으로 볼 수 있습니다.

### 2~5. OpenPaper 기능 전체 — 구현함, 앱 화면 확인 남음

1단계 뒤 계획을 바꿔 남은 기능을 한 번에 붙였습니다. 업데이트 기능(`update.rs`)만 빼고 OpenPaper의 Rust 모듈을 모두 가져왔고, 화면은 `src/paper.js`에 Graphite 디자인으로 새로 만들었습니다.

- 사이드바 "논문" 탭: PDF 열기, 링크로 열기, AI로 논문 찾기, arXiv 검색, 서재(읽음 표시·지우기). 아래에 번역 언어와 모델 상태
- 상단 바(논문을 열었을 때): 번역 시작(번역 / 쉬운 설명), 진행률과 멈추기, 다시 번역, 번역·쉬운 설명 전환, 원문 / 나란히 / 번역 보기, 자리 바꾸기, 요약, 로드맵, arxiv.org, AI에게 질문(⌘J)
- 나란히 보기: 문장마다 원문과 번역을 짝지어 가리키면 함께 강조. 번역이 들어오는 동안 바뀐 칸만 다시 그림
- 본문에서 문장을 고르면 말풍선: 바로 번역(gloss), 그 구절로 질문
- 오른쪽 질문 패널: 이어지는 대화, 요약, 답은 Graphite 마크다운 렌더러로 표시
- AI로 논문 찾기(논문 찾기 / 로드맵), arXiv 검색 결과, 읽기 로드맵 화면
- 모델 설정: Claude Code, Codex, Anthropic API, OpenAI 호환 API(서비스·주소·키·모델), 연결 확인
- 개발 빌드에서 PDF가 느리던 문제: 의존 crate를 최적화해서 빌드(`[profile.dev.package."*"]`), 논문 한 편 1.7초 → 0.36초

- 원본 PDF 보기(Graphite Paper에서 추가): 보기 전환의 "PDF"에서 pdf.js로 원본을 쪽마다 그린다. 글자 층이 있어 고르기·찾기·말풍선이 되고, 목차는 PDF 안의 목차를 쓴다. 원본은 서재에 `<id>.pdf`로 저장하고, arXiv 논문은 처음 볼 때 한 번 받는다. 원본 저장 전에 가져온 논문은 "원본 PDF 연결"로 붙인다.
- 앱 번들을 띄워 확인함: 서재, 나란히 보기, PDF 보기와 PDF 목차, 고른 단어 번역(실제 Claude Code 호출), 질문 패널, 모델 설정, AI 찾기 화면, arXiv 검색 결과, 저장된 로드맵

- 화면 구성 변경(사용자 요청): 본문은 항상 원본 PDF이고, 원문/나란히/번역만 전환은 없앴다. 번역과 질문은 오른쪽 사이드 뷰(번역·질문 탭)에 있다. PDF를 내리면 번역 쪽이 지금 보이는 문단을 따라오고, 번역 문단을 누르면 PDF의 그 자리로 가서 표시한다(다시 짠 원문의 첫 40자를 PDF 글자에서 찾아 자리를 맞춤). 상단 오른쪽 버튼은 로드맵·arxiv.org·찾기·글자 크기·링크로 열기·사이드 뷰 6개로 고정하고, 쓸 수 없을 때는 흐리게만 둔다.

- 문장 단위 연결(문라이트 분석 반영): 문라이트는 pdf.js 뷰어 위에 문장마다 줄 단위 상자(sentence-bbox)를 깔고, 번역 문장과 같은 번호로 묶는다. Graphite Paper도 PDF 글자 조각의 위치로 문장마다 상자를 만들고(앞 문장 뒤에서만 찾아 순서를 지킴), PDF 문장 가리키기·누르기 ↔ 번역 문장 강조·이동, 스크롤 따라가기를 문장 단위로 한다.
- PDF 글 고르기: pdf.js 뷰어의 선택 보조(endOfContent를 선택 끝 뒤로 옮김)를 옮겨 와 빈 곳을 지날 때 선택이 튀지 않게 했다. 스크롤을 무겁게 하던 ctrl+휠 감시는 빼고 핀치는 제스처 이벤트로만 받는다.
- 남은 한계: 문장 나누기는 OpenPaper sentence.rs 그대로라 "…91.4%.[12] Kantar…"처럼 인용 번호 뒤 문장이 한 문장으로 묶이기도 한다(바꾸면 이미 번역한 논문의 문장 짝이 어긋나 새로 가져온 논문부터 적용해야 함).

- 추가 구현: 서재 폴더(생성·드래그 이동), 논문별 질문 기록 저장, 그림·표 자동 감지 및 드래그 영역 AI 설명 카드, Gemini CLI 지원, 주 모델 한도 초과 시 자동 전환 백업

아직 없는 것: 탭 여러 개

## 확인 방법

- 단계마다 `cargo test`로 가져온 모듈의 테스트를 돌립니다.
- `npm run dev`로 실제 PDF와 arXiv 논문을 열어 화면을 확인합니다.
- 추가될 crate: `pdf-extract`, `reqwest`(rustls), `scraper`, `roxmltree`, `regex`, `sha2`, `base64`, `url`
