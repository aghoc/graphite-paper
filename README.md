<p align="center">
  <img src="src-tauri/icons/128x128@2x.png" width="128" height="128" alt="Graphite Paper 로고">
</p>

<h1 align="center">Graphite Paper</h1>

영어 논문을 원문과 번역으로 나란히 읽는 macOS 앱입니다. 마크다운 뷰어 [Graphite](https://github.com/aghoc/graphite)의 화면과 디자인을 그대로 쓰고, 논문을 읽는 기능을 더합니다.

번역과 질문은 이미 쓰고 있는 AI 구독으로 처리합니다. 컴퓨터에 로그인해 둔 Claude Code나 Codex CLI를 불러 쓰므로 따로 API 키를 넣지 않아도 됩니다.

> 지금은 개발을 시작한 단계입니다. 코드는 Graphite 0.1.0에서 출발했고, 논문 기능은 [구현 계획](docs/PLAN.md)의 순서대로 붙입니다.

## 만들 기능

- PDF 파일이나 arXiv·DOI 링크로 논문 열기. 2단 편집, 수식, 표를 살려 읽기
- 원문과 번역을 문장 단위로 짝지어 나란히 보기. 한쪽 문장을 가리키면 짝 문장도 강조
- 고른 문장에 대해 질문하기, 논문 요약
- 번역과 요약을 `.md`로 내보내 Graphite에서 열기

## 개발

macOS에서 Node.js, Rust(1.85 이상), Xcode Command Line Tools가 필요합니다.

```bash
npm install
npm run dev
```

테스트는 `src-tauri`에서 실행합니다.

```bash
cd src-tauri
cargo test
```

설치한 앱을 새 빌드로 바꿀 때는 `npm run update`를 실행합니다. `/Applications/Graphite Paper.app`이 교체됩니다.

## 라이선스

Graphite Paper 코드는 [MIT 라이선스](LICENSE)를 따릅니다. 논문 처리 코드의 일부는 [OpenPaper](https://github.com/sionic-ai/openpaper)(MIT, Sionic AI)에서 가져와 고쳐 씁니다. [저작권 안내](licenses/openpaper/NOTICE.md)

| 라이브러리·글꼴 | 용도 | 라이선스 |
| --- | --- | --- |
| [Tauri](https://tauri.app) | 데스크톱 앱 프레임워크 | MIT / Apache-2.0 |
| [comrak](https://github.com/kivikakk/comrak) | 마크다운 렌더링 | BSD-2-Clause |
| [notify](https://github.com/notify-rs/notify) | 파일 변경 감지 | CC0-1.0 |
| [KaTeX](https://katex.org) | 수식 렌더링 | MIT |
| [Mermaid](https://mermaid.js.org) | 다이어그램 렌더링 | MIT |
| [highlight.js](https://highlightjs.org) | 코드 강조 | BSD-3-Clause |
| [Pretendard](https://github.com/orioncactus/pretendard) | 본문 글꼴 | SIL OFL 1.1 |
| [토스페이스](https://github.com/toss/tossface) v1.6.1 | 이모지 글꼴 | [토스페이스 라이선스](licenses/tossface/LICENSE) |

본문과 목차에는 토스팀에서 제공한 토스페이스를 사용합니다. 공식 v1.6.1의 WOFF2 파일을 고치지 않고 넣으며, 빌드할 때 저작권 안내와 라이선스 전문을 앱에 포함합니다. 토스페이스 자체를 판매하거나 허락 없이 수정본을 만들 수 없습니다. [저작권 안내](licenses/tossface/NOTICE.md) · [라이선스 전문](licenses/tossface/LICENSE)
