#!/usr/bin/env bash
# Generate the placeholder <video>/<audio> sources the fixtures reference.
#
# These are deliberately SILENT and visually static. Two of the fixtures carry
# `autoplay` on purpose -- that is the violation the extension repairs -- so a
# real file with sound would start playing the moment the page is reverted
# during a demo. A silent still frame keeps that beat predictable.
#
# Usage: scripts/make-fixture-media.sh
set -euo pipefail

cd "$(dirname "$0")/.."
OUT=test/fixtures

# libopenh264 rather than libx264 -- it is what Fedora's ffmpeg ships. It takes
# a bitrate, not -crf.
video() { # $1 = filename, $2 = fill colour
  ffmpeg -loglevel error -y \
    -f lavfi -i "color=c=$2:s=480x270:r=15:d=3,format=yuv420p" \
    -c:v libopenh264 -b:v 120k -an -movflags +faststart \
    "$OUT/$1"
  echo "  $1"
}

video promo.mp4 0x263238
video markets-highlight.mp4 0x12181c

ffmpeg -loglevel error -y \
  -f lavfi -i anullsrc=r=44100:cl=mono -t 2 -c:a libmp3lame -q:a 9 \
  "$OUT/product-film-intro.mp3"
echo "  product-film-intro.mp3"
