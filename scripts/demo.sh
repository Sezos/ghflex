#!/usr/bin/env bash
# Regenerates the README demo assets from your own GitHub account.
# Every command masks private repo names (--hide-private). Check both files before committing them.
set -euo pipefail
cd "$(dirname "$0")/.."

if ! command -v vhs >/dev/null; then
  echo "vhs is needed to record the GIF: https://github.com/charmbracelet/vhs (brew install vhs)" >&2
  exit 1
fi

npm run build
vhs demo/demo.tape
(cd demo && node ../dist/cli.js --story --hide-private --theme sunset --fast >/dev/null && mv ghflex-story.png story-sunset.png)

echo "wrote demo/demo.gif and demo/story-sunset.png. Look through both for private names before committing."
