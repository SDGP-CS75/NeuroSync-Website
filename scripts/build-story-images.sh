#!/usr/bin/env bash

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
output_dir="$root/assets/images"
temp_dir="$(mktemp -d)"
trap 'rm -rf "$temp_dir"' EXIT

for command_name in cwebp dwebp avifenc; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "Missing required image tool: $command_name" >&2
    exit 1
  fi
done

screens=(
  "story-screen"
  "story-screen-2"
  "story-screen-3"
  "story-screen-4"
  "story-screen-5"
)

for screen in "${screens[@]}"; do
  source_image="$root/$screen.png"
  if [[ ! -f "$source_image" ]]; then
    echo "Missing source screenshot: $source_image" >&2
    exit 1
  fi

  for width in 220 440; do
    height=$((width * 956 / 440))
    webp_output="$output_dir/$screen-$width.webp"
    avif_output="$output_dir/$screen-$width.avif"
    lossless_webp="$temp_dir/$screen-$width-lossless.webp"
    resized_png="$temp_dir/$screen-$width.png"

    cwebp -quiet -q 96 -m 6 -sharp_yuv -metadata none \
      -resize "$width" "$height" "$source_image" -o "$webp_output"
    cwebp -quiet -lossless -z 9 -m 6 -metadata none \
      -resize "$width" "$height" "$source_image" -o "$lossless_webp"
    dwebp -quiet "$lossless_webp" -o "$resized_png"
    avifenc -q 94 -s 4 --ignore-exif --ignore-xmp --ignore-icc \
      "$resized_png" "$avif_output" >/dev/null
  done
done

echo "Generated responsive story screenshots in $output_dir"
