//! 논문 읽기: PDF·arXiv·논문 링크를 문단·문장 단위 구조(`model::Doc`)로 바꾸고,
//! 서재(library), 번역(translate), 질문·요약(ask), AI 논문 찾기(recommend), 읽기 로드맵(roadmap),
//! 모델 연결(llm: Claude Code·Codex CLI, API)을 맡는다. 화면이 부르는 명령은 commands.
//! 모듈은 OpenPaper(MIT)에서 가져와 고쳐 쓴다. 출처와 고친 점은 licenses/openpaper/NOTICE.md.

pub mod arxiv;
// ask_paper·ask는 OpenPaper의 개발용 CLI(probe)가 쓰던 함수라 앱에서는 안 쓴다.
#[allow(dead_code)]
pub mod ask;
#[allow(dead_code)]
pub mod commands;
pub mod lang;
pub mod layout;
// 옛 OpenPaper(Nanran) 서재를 옮기는 함수는 쓰지 않는다.
#[allow(dead_code)]
pub mod library;
pub mod link;
pub mod llm;
#[allow(dead_code)]
pub mod model;
pub mod pdf;
pub mod recommend;
pub mod roadmap;
pub mod search;
pub mod sentence;
pub mod translate;
