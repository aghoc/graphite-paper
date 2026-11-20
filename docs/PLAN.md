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

### 1. 논문 열기와 원문 읽기 (AI 없이)

- 가져올 모듈: `model.rs`, `sentence.rs`, `layout.rs`, `pdf.rs`, `arxiv.rs`, `link.rs`
- 새 명령: `open_pdf`, `open_paper_link`
- 화면: `#viewer` 옆에 `#paper` 리더를 두고 제목, 문단, 표, 그림, 수식 블록을 그립니다. 사이드바 목차는 논문의 제목 블록으로 만듭니다. `⌘O`와 끌어다 놓기로 PDF를 받고, 링크를 붙여 넣어 여는 입력창을 추가합니다.
- 끝난 기준: PDF 파일과 arXiv 링크가 열리고 목차, 찾기, 글자 크기가 동작합니다.

### 2. AI 구독 연결

- 가져올 모듈: `llm.rs`, `translate.rs`의 CLI 찾기와 환경 변수 정리 부분
- 처음에는 Claude Code CLI와 Codex CLI만 붙입니다. API 키 방식은 코드만 남겨 둡니다.
- 화면: 모델 고르기, 로그인 상태 표시
- 끝난 기준: 설치와 로그인 여부가 화면에 맞게 표시됩니다.

### 3. 나란히 번역

- 가져올 모듈: `translate.rs`, `lang.rs`, `library.rs`. 번역은 앱 데이터 폴더에 JSON으로 저장합니다.
- 화면: 원문 | 번역 2단 격자, 짝 문장 강조, 진행률과 취소
- 끝난 기준: 논문 하나를 끝까지 번역하고, 다시 열면 저장된 번역이 바로 뜹니다.

### 4. 질문과 요약

- 가져올 모듈: `ask.rs`. 답은 Tauri Channel로 받아 나오는 대로 보여 줍니다.
- 화면: 문장을 고르면 "질문하기"가 뜨고 오른쪽 패널에서 대화를 이어 갑니다. 요약 버튼을 둡니다.
- Graphite Paper만의 기능: 번역과 요약을 `.md`로 내보내 Graphite에서 엽니다.

### 5. 나중에 고를 기능

- arXiv 검색(`search.rs`), AI 논문 추천(`recommend.rs`), 읽기 로드맵(`roadmap.rs`), 논문 폴더와 읽음 표시

## 확인 방법

- 단계마다 `cargo test`로 가져온 모듈의 테스트를 돌립니다.
- `npm run dev`로 실제 PDF와 arXiv 논문을 열어 화면을 확인합니다.
- 추가될 crate: `pdf-extract`, `reqwest`(rustls), `scraper`, `roxmltree`, `regex`, `sha2`, `base64`, `url`
