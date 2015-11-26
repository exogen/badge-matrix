#!/bin/bash
set -e
if [ ! -f "./Verdana.ttf" ]; then
    echo "Verdana.ttf not found! Use: npm run add-font"
    exit 1
fi
