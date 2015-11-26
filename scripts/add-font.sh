#!/bin/bash
set -e
DEFAULT_SOURCE="/Library/Fonts/Verdana.ttf"
SOURCE="${1:-$DEFAULT_SOURCE}"
DEST="./Verdana.ttf"
if [ ! -f "$SOURCE" ]; then
    echo "$SOURCE not found! Try: npm run add-font -- /path/to/Verdana.ttf"
    exit 1
fi
cp "$SOURCE" "$DEST"
