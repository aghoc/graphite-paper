# OpenPaper 저작권 안내

Graphite Paper는 논문을 읽고 번역하는 Rust 코드의 일부를 OpenPaper에서 가져와 고쳐 씁니다.

- 저작권자: Copyright (c) 2026 Sionic AI
- 원본: https://github.com/sionic-ai/openpaper
- 기준 커밋: `bb870a7` (v0.2.24 다음 커밋)
- 라이선스: MIT, 전문은 같은 폴더의 `LICENSE`

## 가져온 파일

가져온 모듈은 `src-tauri/src/paper/` 아래에 두고, 파일 첫머리에 원본 경로를 적습니다. 화면 코드(React)와 자동 업데이트(`update.rs`, `install.sh`)는 가져오지 않습니다.

| 모듈 | 가져온 단계 | 고친 내용 |
| --- | --- | --- |
| `model.rs`, `sentence.rs` | 1단계 | `crate::` 경로를 `crate::paper::`로 바꿈 |
| `layout.rs`, `pdf.rs` | 1단계 | 경로만 바꿈 |
| `arxiv.rs`, `link.rs` | 1단계 | 경로, User-Agent를 `graphite-paper/<버전>`으로 바꿈 |
| `search.rs` | 1단계 | 경로만 바꿈 |
| `ask.rs`, `lang.rs`, `library.rs`, `recommend.rs` | 2단계 | 경로를 바꾸고, `ask.rs`에 그림·표 설명, `library.rs`에 폴더·질문 기록 저장을 더함 |
| `llm.rs`, `roadmap.rs`, `translate.rs` | 2단계 | 경로, User-Agent·OpenRouter 앱 표시·임시 폴더 이름을 Graphite Paper로 바꾸고, `llm.rs`에 Gemini CLI와 자동 전환 백업을 더함 |
| `commands.rs` | 2단계 | 자동 업데이트 명령(`update_check`, `update_install`)을 빼고, PDF 경로 열기·원본 PDF 제공·원문 교체·그림 설명·폴더·질문 기록 명령을 더함 |
| `src/locales/ko.json` | 2단계 | `src/paper-ko.js`로 감싸 오류·상태 문구를 한국어로 바꿀 때 씀 |

화면(`src/paper.js`)은 OpenPaper의 React 화면(App, Reader, Assistant, Ai, Search, Roadmap, Papers, Model)의 기능과 백엔드 호출 순서를 따라 순수 JavaScript로 새로 썼습니다. 모양은 Graphite의 부품(`ui.css`, `theme.css`)을 씁니다.
