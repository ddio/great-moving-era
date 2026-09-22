#!/usr/bin/env bash
# 產縮圖 + 產生 data/data.js
set -e
cd "$(dirname "$0")"
python3 tools/thumbs.py
python3 build.py
