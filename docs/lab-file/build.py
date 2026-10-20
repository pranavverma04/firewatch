#!/usr/bin/env python3
"""Build the FireWatch lab file PDF (same layout as the AI Repo Assistant lab file).

python3 build.py  ->  ~/Downloads/FireWatch Lab File - Pranav Verma.pdf
"""
import os, re, subprocess
import fitz

NAME, ROLL = "Pranav Verma", ""
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.expanduser("~/Downloads/FireWatch Lab File - Pranav Verma.pdf")
RAW = os.path.join(HERE, "raw.pdf")
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
rd = lambda n: open(os.path.join(HERE, n), encoding="utf-8").read()


def html(body):
    return ('<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><title>FireWatch Lab File</title>\n'
            '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Carlito:ital,wght@0,400;0,700;1,400&display=swap">\n'
            '<style>\n' + rd("style.css") + '</style>\n<script>\n' + rd("dia.js") + '</script>\n</head>\n<body>\n'
            + body + '\n</body></html>\n')


def render(body):
    path = os.path.join(HERE, "lab.html")
    open(path, "w", encoding="utf-8").write(html(body))
    subprocess.run([CHROME, "--headless=new", "--disable-gpu", "--no-pdf-header-footer", "--virtual-time-budget=15000",
                    "--print-to-pdf=" + RAW, "file://" + path], stderr=subprocess.DEVNULL, check=True)


def toc_pages(body):
    """Put the real page number of every SRS heading into the table of contents."""
    doc = fitz.open(RAW)
    texts = [p.get_text() for p in doc]
    start = next(i for i, t in enumerate(texts) if "Table of Contents" in t) + 1

    def find(label):
        key = label.split(":")[0].strip()          # "Appendix A" / "1.1 Purpose"
        for i in range(start, len(texts)):
            for line in texts[i].splitlines():
                if line.strip().startswith(key) and "..." not in line:
                    return i + 1
        return ""
    return re.sub(r'<td class="l">([^<]+)</td><td class="n">\d*</td>',
                  lambda m: f'<td class="l">{m.group(1)}</td><td class="n">{find(m.group(1).replace("&amp;", "&"))}</td>', body)


def stamp():
    doc = fitz.open(RAW)
    for i, page in enumerate(doc):
        r = page.rect
        page.draw_rect(fitz.Rect(36, 36, r.width - 36, r.height - 36), color=(0, 0, 0), width=0.8)
        page.insert_text((50, 56), f"Name: {NAME}", fontname="helv", fontsize=11)
        roll = f"Roll No.: {ROLL}" if ROLL else "Roll No.: ________________"
        page.insert_text((r.width - 50 - fitz.get_text_length(roll, "helv", 11), 56), roll, fontname="helv", fontsize=11)
        n = str(i + 1)
        page.insert_text((r.width / 2 - fitz.get_text_length(n, "helv", 9) / 2, r.height - 46), n, fontname="helv", fontsize=9)
    doc.save(OUT)
    print("wrote", OUT, len(doc), "pages")


body = rd("part1.html") + "\n" + rd("part2.html")
render(body)
body = toc_pages(body)
render(body)
stamp()
