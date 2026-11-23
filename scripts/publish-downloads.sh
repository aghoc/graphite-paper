#!/usr/bin/env bash
# Windows 포터블(.zip)과 macOS(.dmg) 설치 파일을 빌드해 현재 브랜치(main)의 `downloads/` 폴더에 반영하고 푸시한다.
#   npm run publish:downloads                  # 빌드 후 커밋·푸시
#   npm run publish:downloads -- --skip-build  # 이미 빌드된 파일만 복사 후 커밋·푸시
#   npm run publish:downloads -- --no-push     # 빌드·복사만 하고 커밋·푸시는 하지 않음
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SKIP_BUILD=0
NO_PUSH=0

for arg in "$@"; do
  case "$arg" in
    --skip-build) SKIP_BUILD=1 ;;
    --no-push) NO_PUSH=1 ;;
    *)
      echo "알 수 없는 옵션: $arg"
      echo "사용법: $0 [--skip-build] [--no-push]"
      exit 1
      ;;
  esac
done

cd "$ROOT"

if [ "$SKIP_BUILD" -eq 0 ]; then
  echo "▸ macOS 설치 파일(.dmg) 빌드 중…"
  npx tauri build --bundles dmg

  echo "▸ Windows 포터블(.zip) 빌드 중…"
  bash "$ROOT/scripts/build-win.sh"
fi

WIN_ZIP="$ROOT/src-tauri/target/x86_64-pc-windows-msvc/release/bundle/portable/Graphite-Paper-Windows.zip"
MAC_DMG="$(find "$ROOT/src-tauri/target/release/bundle/dmg" -maxdepth 1 -name '*.dmg' 2>/dev/null | head -n 1 || true)"

if [ ! -f "$WIN_ZIP" ] && [ -z "$MAC_DMG" ]; then
  echo "✗ 업로드할 파일을 찾지 못했어요. 먼저 빌드를 실행해 주세요."
  exit 1
fi

VERSION="$(node -p "require('./src-tauri/tauri.conf.json').version")"
BUILD_DATE="$(date '+%Y-%m-%d %H:%M %Z')"
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
REMOTE_URL="$(git remote get-url origin)"

mkdir -p "$ROOT/downloads"
FILES=()

echo "▸ downloads/ 폴더 갱신 중… (v$VERSION)"
if [ -f "$WIN_ZIP" ]; then
  cp "$WIN_ZIP" "$ROOT/downloads/Graphite-Paper-Windows.zip"
  FILES+=("Graphite-Paper-Windows.zip")
  echo "  • downloads/Graphite-Paper-Windows.zip ($(du -h "$WIN_ZIP" | awk '{print $1}'))"
fi

if [ -n "$MAC_DMG" ]; then
  cp "$MAC_DMG" "$ROOT/downloads/Graphite-Paper-macOS.dmg"
  FILES+=("Graphite-Paper-macOS.dmg")
  echo "  • downloads/Graphite-Paper-macOS.dmg ($(du -h "$MAC_DMG" | awk '{print $1}'))"
fi

(
  cd "$ROOT/downloads"
  {
    echo "Graphite Paper v$VERSION"
    echo "Built: $BUILD_DATE"
    echo ""
    shasum -a 256 "${FILES[@]}"
  } > CHECKSUMS.txt
)

if [ "$NO_PUSH" -eq 1 ]; then
  echo "✓ downloads/ 폴더 갱신 완료 (--no-push)"
  exit 0
fi

git add "$ROOT/downloads"
if git diff --cached --quiet -- "$ROOT/downloads"; then
  echo "✓ 변경된 파일이 없어요."
  exit 0
fi

git commit -m "Update downloads for v$VERSION" -- "$ROOT/downloads"
echo "▸ GitHub \`$BRANCH\` 브랜치로 푸시 중…"
git push origin "$BRANCH"

REPO_HTTPS="$(echo "$REMOTE_URL" | sed -E 's#^git@github\.com:#https://github.com/#; s#\.git$##')"
echo "✓ 업로드 완료!"
for f in "${FILES[@]}"; do
  echo "  $REPO_HTTPS/raw/$BRANCH/downloads/$f"
done
