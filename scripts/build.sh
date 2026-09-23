#!/bin/zsh
set -euo pipefail

project_dir="${0:A:h:h}"
app_dir="$project_dir/dist/DeguGatekeeper.app"
contents_dir="$app_dir/Contents"
videos_dir="$contents_dir/Resources/Videos"

mkdir -p "$contents_dir/MacOS" "$videos_dir"
cp "$project_dir/Info.plist" "$contents_dir/Info.plist"

xcrun swiftc \
  -O \
  -swift-version 5 \
  -target arm64-apple-macosx13.0 \
  -framework AppKit \
  -framework AVFoundation \
  -framework QuartzCore \
  "$project_dir/Sources/DeguGatekeeper/main.swift" \
  -o "$contents_dir/MacOS/DeguGatekeeper"

for name in agouti-a-bottom-pop agouti-b-side-peek agouti-c-center-hop; do
  cp "$project_dir/concept/flow-alpha/$name.mov" "$videos_dir/$name.mov"
done

codesign --force --deep --sign - "$app_dir"
echo "$app_dir"
