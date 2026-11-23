#!/usr/bin/env bash
# macOS에서 Windows 64비트용 NSIS 설치 파일(.exe)을 크로스 컴파일한다.
#   npm run build:win
#
# 최초 1회 필요 도구:
#   rustup target add x86_64-pc-windows-msvc
#   brew install nsis llvm lld
#   cargo install --locked cargo-xwin
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
BREW_PREFIX="$(brew --prefix 2>/dev/null || echo /opt/homebrew)"

export PATH="$BREW_PREFIX/opt/llvm/bin:$BREW_PREFIX/opt/lld/bin:$PATH"

for tool in makensis lld-link clang-cl cargo-xwin; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "✗ 필요한 도구가 없어요: $tool"
    echo "  먼저 아래 명령을 실행해 설치해 주세요:"
    echo "    rustup target add x86_64-pc-windows-msvc"
    echo "    brew install nsis llvm lld"
    echo "    cargo install --locked cargo-xwin"
    exit 1
  fi
done

cd "$ROOT"
echo "▸ Windows 설치 파일(.exe) 빌드 중…"
npx tauri build --runner cargo-xwin --target x86_64-pc-windows-msvc --bundles nsis

EXE="$(find "$ROOT/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis" -maxdepth 1 -name '*-setup.exe' | head -n 1)"
[ -f "$EXE" ] || { echo "✗ 빌드된 .exe 파일을 찾지 못했어요."; exit 1; }

SIZE="$(du -h "$EXE" | awk '{print $1}')"
echo "✓ Windows 설치 파일 빌드 완료: $EXE ($SIZE)"
