#!/usr/bin/env bash
# 코드를 고친 뒤 이 명령 하나로 설치된 Graphite Paper를 최신으로 바꾼다.
#   npm run update
#
# 1) 릴리스 .app만 빌드한다 (.dmg는 만들지 않아 빠르다)
# 2) /Applications/Graphite Paper.app을 새 버전으로 바꾼다
#    - 새 앱을 옆에 먼저 복사한 뒤 이름만 바꿔 끼우므로, 중간에 실패해도 기존 앱이 남는다
#    - 앱이 켜져 있어도 강제로 끄지 않는다 (편집 중인 내용을 잃지 않게). 다시 열면 새 버전이 뜬다
# 3) LaunchServices에 다시 등록한다. 등록해야 Finder와 "다음으로 열기"에 새 버전이 보인다
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
DEST="${GRAPHITE_APP_DIR:-/Applications}/Graphite Paper.app"
BUILT="$ROOT/src-tauri/target/release/bundle/macos/Graphite Paper.app"
LSREGISTER=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister

cd "$ROOT"
echo "▸ 빌드 중…"
npx tauri build --bundles app

[ -d "$BUILT" ] || { echo "✗ 빌드 결과를 찾지 못했어요: $BUILT"; exit 1; }

echo "▸ $DEST 교체 중…"
NEW="${DEST%.app}.new.app"
OLD="${DEST%.app}.old.app"
rm -rf "$NEW" "$OLD"
ditto "$BUILT" "$NEW"
[ -d "$DEST" ] && mv "$DEST" "$OLD"
mv "$NEW" "$DEST"
rm -rf "$OLD"

"$LSREGISTER" -f "$DEST" >/dev/null 2>&1 || true

VERSION=$(plutil -extract CFBundleShortVersionString raw -o - "$DEST/Contents/Info.plist")
echo "✓ Graphite Paper $VERSION 설치를 마쳤어요 ($(date '+%H:%M:%S'))"
if pgrep -x graphite-paper >/dev/null; then
  echo "  지금 켜져 있는 Graphite Paper는 이전 버전이에요. 창을 닫고 다시 열면 새 버전이 떠요."
fi
