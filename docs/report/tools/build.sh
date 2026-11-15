#!/usr/bin/env bash
# Rebuild report.html, Marswalk-Report.pdf and Marswalk-Report.docx from REPORT.md. Run from the repository root.
# PY is a Python with markdown, python-docx, pillow and pymupdf installed.
set -euo pipefail
PY=${PY:-python3}
$PY docs/report/tools/build.py html
node docs/report/tools/render.mjs pdf
$PY docs/report/tools/build.py html --pdf docs/report/Marswalk-Report.pdf   # page numbers in the index
node docs/report/tools/render.mjs pdf
$PY docs/report/tools/build.py stamp
$PY docs/report/tools/build.py docx
