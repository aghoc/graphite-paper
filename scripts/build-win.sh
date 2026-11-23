#!/usr/bin/env bash
# macOS에서 Windows 64비트용 포터블 앱(Graphite-Paper-Windows.zip)을 크로스 컴파일한다.
#   npm run build:win
#
# 최초 1회 필요 도구:
#   rustup target add x86_64-pc-windows-msvc
#   brew install llvm lld
#   cargo install --locked cargo-xwin
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BREW_PREFIX="$(brew --prefix 2>/dev/null || echo /opt/homebrew)"

export PATH="$BREW_PREFIX/opt/llvm/bin:$BREW_PREFIX/opt/lld/bin:$PATH"

for tool in lld-link clang-cl cargo-xwin zip; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "✗ 필요한 도구가 없어요: $tool"
    echo "  먼저 아래 명령을 실행해 설치해 주세요:"
    echo "    rustup target add x86_64-pc-windows-msvc"
    echo "    brew install llvm lld"
    echo "    cargo install --locked cargo-xwin"
    exit 1
  fi
done

cd "$ROOT"
echo "▸ Windows 포터블 실행 파일(.exe) 빌드 중…"
npx tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc --no-bundle

EXE="$ROOT/src-tauri/target/x86_64-pc-windows-msvc/release/graphite-paper.exe"
[ -f "$EXE" ] || { echo "✗ 빌드된 .exe 파일을 찾지 못했어요: $EXE"; exit 1; }

OUT_DIR="$ROOT/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/portable"
OUT_ZIP="$OUT_DIR/Graphite-Paper-Windows.zip"
STAGE="$(mktemp -d)"
trap 'rm -rf "$STAGE"' EXIT

mkdir -p "$OUT_DIR"
cp "$EXE" "$STAGE/Graphite Paper.exe"
rm -f "$OUT_ZIP"
(cd "$STAGE" && zip -9 -q "$OUT_ZIP" "Graphite Paper.exe")

SIZE="$(du -h "$OUT_ZIP" | awk '{print $1}')"
echo "✓ Windows 포터블 패키지 빌드 완료: $OUT_ZIP ($SIZE)"
