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
  APPLE_SIGNING_IDENTITY="${APPLE_SIGNING_IDENTITY:--}" npx tauri build --bundles dmg

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

echo "▸ downloads/ 폴더 갱신 중… (v$VERSION)"
if [ -f "$WIN_ZIP" ]; then
  cp "$WIN_ZIP" "$ROOT/downloads/Graphite-Paper-Windows.zip"
  echo "  • downloads/Graphite-Paper-Windows.zip ($(du -h "$WIN_ZIP" | awk '{print $1}'))"
fi

if [ -n "$MAC_DMG" ]; then
  echo "▸ macOS 디스크 이미지 서명 검증 중…"
  VERIFY_MOUNT="$(mktemp -d "${TMPDIR:-/tmp}/graphite-paper-dmg.XXXXXX")"
  cleanup_mount() {
    hdiutil detach "$VERIFY_MOUNT" >/dev/null 2>&1 || true
    rmdir "$VERIFY_MOUNT" 2>/dev/null || true
  }
  trap cleanup_mount EXIT
  hdiutil attach "$MAC_DMG" -readonly -nobrowse -mountpoint "$VERIFY_MOUNT" >/dev/null
  VERIFY_APP="$VERIFY_MOUNT/Graphite Paper.app"
  [ -d "$VERIFY_APP" ] || { echo "✗ DMG 안에서 Graphite Paper.app을 찾지 못했어요."; exit 1; }
  test "$(lipo -archs "$VERIFY_APP/Contents/MacOS/graphite-paper")" = "arm64"
  codesign --verify --deep --strict "$VERIFY_APP"
  cleanup_mount
  trap - EXIT
  echo "  • codesign --verify --deep --strict 통과"

  cp "$MAC_DMG" "$ROOT/downloads/Graphite-Paper-macOS.dmg"
  echo "  • downloads/Graphite-Paper-macOS.dmg ($(du -h "$MAC_DMG" | awk '{print $1}'))"
fi

CHECKSUM_FILES=()
for name in "Graphite-Paper-Windows.zip" "Graphite-Paper-macOS.dmg"; do
  [ -f "$ROOT/downloads/$name" ] && CHECKSUM_FILES+=("$name")
done

(
  cd "$ROOT/downloads"
  {
    echo "Graphite Paper v$VERSION"
    echo "Built: $BUILD_DATE"
    echo ""
    shasum -a 256 "${CHECKSUM_FILES[@]}"
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
for f in "${CHECKSUM_FILES[@]}"; do
  echo "  $REPO_HTTPS/raw/$BRANCH/downloads/$f"
done
