"""Build docs/report/report.html and docs/report/Marswalk-Report.docx from docs/report/REPORT.md.

    python docs/report/tools/build.py html [--pdf docs/report/Marswalk-Report.pdf]
    python docs/report/tools/build.py docx

`--pdf` reads a first PDF render to put page numbers in the index. Needs `markdown`, `python-docx`, `pillow` and,
for --pdf, `pymupdf` (pip install markdown python-docx pillow pymupdf). `render.mjs` turns the HTML into the PDF.
"""
import html
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
REPORT = HERE.parent
SRC = REPORT / 'REPORT.md'

SECTIONS = ['Challenge', 'Project overview', 'Problem statement', 'Proposed solution', 'Technical implementation',
            'Results', 'Impact and relevance', 'Future work', 'Team contributions', 'References', 'Appendices']
SUBSECTIONS = {'Challenge': ['Interplanetary Survival Guide: Martian Map', 'Background', 'Why did we choose this challenge?']}


def split_front(md):
    """Cover block (title to index) and body (from '## Challenge')."""
    front, body = md.split('\n## Challenge\n', 1)
    return front, '## Challenge\n' + body


def cover_data(front):
    team = []
    for line in front.splitlines():
        m = re.match(r'\|\s*([^|]+?)\s*\|\s*([^|]+?)\s*\|\s*(\[email\])\s*\|', line)
        if m and m.group(1) != 'Name':
            team.append((m.group(1), m.group(2), m.group(3)))
    url = re.search(r'App: (\S+)', front).group(1)
    return team, url


# ------------------------------------------------------------------------------------------------------------- HTML

def inline_tags(text):
    """Colour the DATA, DERIVED and SIM words when they stand alone in a table cell or as a tag."""
    return re.sub(r'(?<![\w-])(DATA|DERIVED|SIM)(?![\w-])', r'<span class="tag t-\1">\1</span>', text)


def body_html(body):
    import markdown
    out = markdown.markdown(body, extensions=['tables', 'sane_lists'])
    # Figures: <p><img></p> followed by <p><em>Image ...</em></p>
    out = re.sub(r'<p><img alt="[^"]*" src="([^"]+)" ?/?></p>\s*<p><em>(Image [^<]+)</em></p>',
                 lambda m: f'<figure><img src="{m.group(1)}" alt=""><figcaption>{m.group(2)}</figcaption></figure>', out)
    # Pairs: a two-column table of images followed by its caption
    def pair(m):
        imgs = re.findall(r'<img alt="[^"]*" src="([^"]+)"', m.group(1))
        cells = ''.join(f'<img src="{s}" alt="">' for s in imgs)
        return f'<figure class="pair"><div class="pair-grid">{cells}</div><figcaption>{m.group(2)}</figcaption></figure>'
    out = re.sub(r'<table>\s*<thead>\s*<tr>\s*<th></th>\s*<th></th>\s*</tr>\s*</thead>\s*<tbody>(.*?)</tbody>\s*</table>\s*<p><em>(Image [^<]+)</em></p>',
                 pair, out, flags=re.S)
    # Colour tags inside tables only (prose keeps plain words)
    out = re.sub(r'<td>(DATA|DERIVED|SIM)([^<]*)</td>', lambda m: f'<td>{inline_tags(m.group(1))}{m.group(2)}</td>', out)
    # Section anchors and page breaks before each top section
    def h2(m):
        title = html.unescape(m.group(1))
        sid = re.sub(r'[^a-z0-9]+', '-', title.lower()).strip('-')
        return f'<h2 id="{sid}">{m.group(1)}</h2>'
    out = re.sub(r'<h2>(.*?)</h2>', h2, out)
    out = re.sub(r'(https?://[^\s<"]+)(?![^<]*</a>)(?![^<]*">)', r'<a href="\1">\1</a>', out)
    return out


def index_html(pages):
    rows = []
    for i, s in enumerate(SECTIONS, 1):
        n = pages.get(s, '')
        rows.append(f'<li class="lvl1"><span>{i}. {html.escape(s)}</span><span class="dots"></span><span class="pg">{n}</span></li>')
        for sub in SUBSECTIONS.get(s, []):
            n2 = pages.get(sub, '')
            rows.append(f'<li class="lvl2"><span>{html.escape(sub)}</span><span class="dots"></span><span class="pg">{n2}</span></li>')
    return '<ol class="toc">' + ''.join(rows) + '</ol>'


def build_html(pdf=None):
    md = SRC.read_text()
    front, body = split_front(md)
    team, url = cover_data(front)
    pages = page_numbers(pdf) if pdf else {}
    members = ''.join(
        f'<div class="member"><div class="m-name">{html.escape(n)}</div><div class="m-role">{inline_confirm(r)}</div>'
        f'<div class="m-mail">{e}</div></div>' for n, r, e in team)
    page = (TEMPLATE.replace('%%MEMBERS%%', members).replace('%%URL%%', url)
            .replace('%%INDEX%%', index_html(pages)).replace('%%BODY%%', body_html(body)))
    (REPORT / 'report.html').write_text(page)
    print('wrote', REPORT / 'report.html', '(index pages from ' + str(pdf) + ')' if pdf else '')


def inline_confirm(text):
    t = html.escape(text)
    return re.sub(r'\[confirm\]', '<span class="confirm">[confirm]</span>', t)


def page_numbers(pdf):
    import pymupdf
    doc = pymupdf.open(pdf)
    found = {}
    wanted = SECTIONS + [s for v in SUBSECTIONS.values() for s in v]
    # skip the cover and the index (pages 1 and 2)
    for pno in range(2, len(doc)):
        for block in doc[pno].get_text('dict')['blocks']:
            for line in block.get('lines', []):
                text = ''.join(sp['text'] for sp in line['spans']).strip()
                size = max((sp['size'] for sp in line['spans']), default=0)
                if text in wanted and text not in found and size >= 13:
                    found[text] = pno + 1
    return found


# ------------------------------------------------------------------------------------------------------------- DOCX

INLINE = re.compile(r'(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|https?://\S+)')


def add_inline(par, text, bold=False, italic=False):
    from docx.shared import RGBColor
    for part in INLINE.split(text):
        if not part:
            continue
        if part.startswith('**') and part.endswith('**'):
            add_inline(par, part[2:-2], bold=True, italic=italic)
        elif part.startswith('*') and part.endswith('*') and len(part) > 2:
            add_inline(par, part[1:-1], bold=bold, italic=True)
        elif part.startswith('`') and part.endswith('`'):
            r = par.add_run(part[1:-1])
            r.font.name = 'Consolas'
            r.bold, r.italic = bold, italic
        elif part.startswith('http'):
            r = par.add_run(part)
            r.font.color.rgb = RGBColor(0x1F, 0x5F, 0xA8)
            r.underline = True
        else:
            r = par.add_run(part)
            r.bold, r.italic = bold, italic
            if '[confirm' in part or '[email]' in part:
                r.font.highlight_color = 7  # yellow


def build_docx():
    import docx
    from docx.enum.text import WD_ALIGN_PARAGRAPH, WD_BREAK
    from docx.shared import Pt, Cm, RGBColor

    md = SRC.read_text()
    front, body = split_front(md)
    team, url = cover_data(front)
    d = docx.Document()
    sec = d.sections[0]
    sec.page_width, sec.page_height = Cm(21), Cm(29.7)
    for side in ('left_margin', 'right_margin'):
        setattr(sec, side, Cm(2.2))
    sec.top_margin = sec.bottom_margin = Cm(2)
    st = d.styles['Normal']
    st.font.name = 'Barlow'
    st.font.size = Pt(10.5)
    for name, size in (('Title', 30), ('Heading 1', 18), ('Heading 2', 13.5), ('Heading 3', 11.5)):
        s = d.styles[name]
        s.font.name = 'Barlow Condensed'
        s.font.size = Pt(size)
        s.font.color.rgb = RGBColor(0x14, 0x18, 0x1D)
    d.styles['Heading 1'].font.color.rgb = RGBColor(0xD9, 0x4F, 0x14)

    # Cover
    p = d.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run('NASA SPACE APPS CHALLENGE 2026 · ENSENADA')
    r.font.size = Pt(10)
    r.font.color.rgb = RGBColor(0xD9, 0x4F, 0x14)
    t = d.add_paragraph('MARSWALK', style='Title')
    t.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p = d.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.add_run('Technical report for the local judges\nInterplanetary Survival Guide: Martian Map').italic = True
    hero = REPORT / 'img' / '03-route-terrain.jpg'
    if hero.exists():
        d.add_picture(str(hero), width=Cm(16.6))
        d.paragraphs[-1].alignment = WD_ALIGN_PARAGRAPH.CENTER
    p = d.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run('Los Frijolitos Espaciales Refritos Nueva Generación')
    r.bold = True
    r.font.size = Pt(13)
    p = d.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run('DEVELOPMENT TEAM')
    r.bold = True
    for n, role, e in team:
        p = d.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        p.paragraph_format.space_after = Pt(2)
        r = p.add_run(n + '\n')
        r.bold = True
        add_inline(p, '[' + role.replace(' [confirm]', '') + ']' + (' [confirm]' if '[confirm]' in role else '') + '\n')
        add_inline(p, e)
    p = d.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    add_inline(p, url)
    d.add_page_break()

    # Index (Google Docs can turn the headings into a live table of contents)
    d.add_paragraph('Index', style='Heading 1')
    for i, s in enumerate(SECTIONS, 1):
        d.add_paragraph(f'{i}. {s}')
        for sub in SUBSECTIONS.get(s, []):
            q = d.add_paragraph(sub)
            q.paragraph_format.left_indent = Cm(1)
    d.add_page_break()

    lines = body.splitlines()
    i = 0
    first_h2 = True
    pending_imgs = []
    while i < len(lines):
        line = lines[i]
        if not line.strip():
            i += 1
            continue
        if line.startswith('## '):
            if not first_h2 and line[3:].strip() in SECTIONS:
                d.add_page_break()
            first_h2 = False
            d.add_paragraph(line[3:].strip().replace('`', ''), style='Heading 1')
        elif line.startswith('### '):
            d.add_paragraph(line[4:].strip().replace('`', ''), style='Heading 2')
        elif line.startswith('#### '):
            d.add_paragraph(line[5:].strip().replace('`', ''), style='Heading 3')
        elif line.startswith('!['):
            src = re.search(r'\]\(([^)]+)\)', line).group(1)
            pending_imgs = [src]
            add_images(d, pending_imgs, Cm)
        elif line.startswith('| |'):
            # two-image table: header '| | |', separator, then one row of images
            row = lines[i + 2]
            srcs = re.findall(r'\]\(([^)]+)\)', row)
            add_images(d, srcs, Cm)
            i += 3
            continue
        elif line.startswith('*Image ') and line.endswith('*'):
            p = d.add_paragraph()
            p.alignment = WD_ALIGN_PARAGRAPH.CENTER
            r = p.add_run(line.strip('*'))
            r.italic = True
            r.font.size = Pt(9.5)
        elif line.startswith('|'):
            rows = []
            while i < len(lines) and lines[i].startswith('|'):
                if not re.match(r'^\|[\s|:-]+\|$', lines[i]):
                    rows.append([c.strip() for c in lines[i].strip().strip('|').split('|')])
                i += 1
            table = d.add_table(rows=len(rows), cols=len(rows[0]))
            table.style = 'Light Grid Accent 1'
            for ri, row in enumerate(rows):
                for ci, cell in enumerate(row[:len(rows[0])]):
                    par = table.cell(ri, ci).paragraphs[0]
                    add_inline(par, cell, bold=(ri == 0))
                    for run in par.runs:
                        run.font.size = Pt(9)
            d.add_paragraph()
            continue
        elif line.startswith('> '):
            buf = []
            while i < len(lines) and (lines[i].startswith('>')):
                buf.append(lines[i].lstrip('> ').rstrip())
                i += 1
            for para in '\n'.join(buf).split('\n\n'):
                if para.strip():
                    p = d.add_paragraph()
                    p.paragraph_format.left_indent = Cm(0.8)
                    add_inline(p, para.replace('\n', ' '), italic=True)
            continue
        elif re.match(r'^\s*(\d+\.|-) ', line):
            indent = len(line) - len(line.lstrip())
            numbered = re.match(r'^\s*\d+\.', line) is not None
            style = 'List Number' if numbered else 'List Bullet'
            if indent >= 2:
                style += ' 2'
            text = re.sub(r'^\s*(\d+\.|-) ', '', line)
            p = d.add_paragraph(style=style)
            add_inline(p, text)
        else:
            buf = [line]
            while i + 1 < len(lines) and lines[i + 1].strip() and not re.match(r'^(#|!\[|\||>|\s*(\d+\.|-) |\*Image )', lines[i + 1]):
                i += 1
                buf.append(lines[i])
            p = d.add_paragraph()
            add_inline(p, ' '.join(buf))
        i += 1
    out = REPORT / 'Marswalk-Report.docx'
    d.save(out)
    print('wrote', out)


def add_images(d, srcs, Cm):
    from docx.enum.text import WD_ALIGN_PARAGRAPH
    width = Cm(16.6) if len(srcs) == 1 else Cm(8.1)
    p = d.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    for k, s in enumerate(srcs):
        run = p.add_run()
        run.add_picture(str(REPORT / s), width=width)
        if k < len(srcs) - 1:
            p.add_run('  ')


def stamp(pdf):
    """Footer with the team and the page number on every page but the cover."""
    import pymupdf
    doc = pymupdf.open(pdf)
    grey = (0.4, 0.44, 0.49)
    left = 'Marswalk · Los Frijolitos Espaciales Refritos Nueva Generación · NASA Space Apps 2026 Ensenada'
    for pno in range(1, len(doc)):
        page = doc[pno]
        w, h = page.rect.width, page.rect.height
        page.insert_text((48, h - 26), left, fontsize=6.5, fontname='helv', color=grey)
        page.insert_text((w - 56, h - 26), str(pno + 1), fontsize=8, fontname='helv', color=grey)
    tmp = Path(str(pdf) + '.tmp')
    doc.save(tmp, garbage=3, deflate=True)
    doc.close()
    tmp.replace(pdf)
    print('stamped', pdf)


TEMPLATE = (HERE / 'template.html').read_text() if (HERE / 'template.html').exists() else ''

if __name__ == '__main__':
    what = sys.argv[1] if len(sys.argv) > 1 else 'html'
    if what == 'html':
        pdf = sys.argv[sys.argv.index('--pdf') + 1] if '--pdf' in sys.argv else None
        build_html(pdf)
    elif what == 'docx':
        build_docx()
    elif what == 'stamp':
        stamp(REPORT / 'Marswalk-Report.pdf')
