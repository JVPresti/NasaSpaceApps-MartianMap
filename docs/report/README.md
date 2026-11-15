# Technical report for the Ensenada judges

The report the team hands the local judges, in the same section order as our 2025 report: cover, index, challenge, overview, problem, solution, technical implementation, results, impact, future work, team contributions, references and appendices.

| File | What it is |
|---|---|
| `REPORT.md` | The source. Edit this one |
| `report.html` | Print layout in the app's fonts and colours (#232), A4. Generated |
| `Marswalk-Report.pdf` | The PDF to hand in, rendered from `report.html`. Generated |
| `Marswalk-Report.docx` | The same content for Google Docs. Generated |
| `img/` | Screenshots from the running app (#282 at `8ec6f72`, merged into `main` as `cfcf299`, and open #290 for the habitat and airlock), the architecture diagram and the Mars Trek check |
| `tools/` | The build: `build.py` (Markdown to HTML and DOCX, index page numbers, footers), `render.mjs` (HTML to PDF, diagram to PNG), `template.html`, `architecture.html` |

## Before handing it in

Search the PDF or the DOCX for `[email]` and `[confirm]`. Each one is a fact only the team can fill in:

- `[email]`: each member's email, on the cover. Add them in Google Docs only. Keep emails out of the repository.
- `[confirm]` after the roles of Andrea and Brayan: their roles are new or changed since last year's report.
- `[confirm]` in Impact, Presentation: the talk runs at most 4 minutes, with an edited app video in place of a live demo, but the organisers' page still says 3 minutes. A second `[confirm]` there asks for the 4-minute script.
- Appendix B: whether each SI-generated image now carries a visible watermark.
- Appendix C: the prior-work statement, after the local lead answers.
- Appendix D: whether the repository is public, and the video link.

The report is written for judges, not developers, so it names no pull requests, files, functions, branches or commits. Keep it that way when editing.

## In Google Docs

Upload `Marswalk-Report.docx` to Drive and open it with Google Docs. Headings come in as Heading 1 and 2, so Insert, Table of contents builds a live index. Figures and captions keep their order. The fonts fall back to Arial if Barlow is not installed. In Docs, pick Barlow from More fonts.

## Rebuild

From the repository root, with `npm ci` done and a Python that has `markdown`, `python-docx`, `pillow` and `pymupdf`:

```
PY=/path/to/python docs/report/tools/build.sh      # report.html, the PDF with index page numbers, the DOCX
node docs/report/tools/render.mjs arch               # only after editing tools/architecture.html
```

The screenshots came from `scripts/measure-demo.mjs` at #282's head `8ec6f72`, now on `main`, run with `--headed --shots <folder>` in a Chrome that renders on the GPU.
