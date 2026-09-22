#!/usr/bin/env bash
# images/src -> images/full + images/thumb，再產生 data/data.js
set -e
cd "$(dirname "$0")"
python3 tools/images.py
python3 build.py
