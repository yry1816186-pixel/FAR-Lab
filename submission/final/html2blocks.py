# -*- coding: utf-8 -*-
"""Parse submission/final/doc.html into blocks.json for the docx-js renderer.
Keeps inline bold/code runs; tables flattened to text cells; figures carry
PNG path + caption. Single source of truth = doc.html.
"""
import json
import re
import sys
from pathlib import Path

from bs4 import BeautifulSoup, NavigableString, Tag

HERE = Path(__file__).parent
html = (HERE / "doc.html").read_text(encoding="utf-8")
soup = BeautifulSoup(html, "html.parser")

def runs_of(el):
    """Extract inline runs: (text, bold, code, color)."""
    runs = []
    def walk(node, bold=False, code=False, color=None):
        if isinstance(node, NavigableString):
            t = str(node)
            if t.strip():
                runs.append({"text": re.sub(r"\s+", " ", t), "bold": bold, "code": code, "color": color})
            return
        if not isinstance(node, Tag):
            return
        name = node.name.lower()
        if name == "br":
            runs.append({"text": "\n", "bold": bold, "code": code, "color": color})
            return
        nb = bold or name in ("b", "strong") or (node.get("class") and "k" in node.get("class"))
        nc = code or name == "code"
        ncolor = color
        if name in ("b", "strong") or (node.get("class") and ("k" in node.get("class") or "nt" in node.get("class"))):
            ncolor = "0B3D91"
        if node.get("class") and "nt" in node.get("class") and "warn" in (node.parent.get("class") or []):
            ncolor = "B45309"
        for ch in node.children:
            walk(ch, nb, nc, ncolor)
    for ch in el.children:
        walk(ch)
    # merge adjacent same-style runs
    merged = []
    for r in runs:
        if merged and not r["code"] and merged[-1]["bold"] == r["bold"] and merged[-1]["code"] == r["code"] and merged[-1]["color"] == r["color"] and r["text"] != "\n" and merged[-1]["text"] != "\n":
            merged[-1]["text"] += r["text"]
        else:
            merged.append(dict(r))
    return [r for r in merged if r["text"].strip() or r["text"] == "\n"]

def cell_text(td):
    return re.sub(r"\s+", " ", td.get_text(" ", strip=True))

blocks = []
body = soup.body
for el in body.children:
    if not isinstance(el, Tag):
        continue
    cls = el.get("class") or []
    if "cover" in cls:
        blocks.append({"type": "cover", "text": el.get_text("\n", strip=True)})
        continue
    if "toc-page" in cls:
        entries = [a.get_text(strip=True) for a in el.select("ul.toc li a")]
        blocks.append({"type": "toc", "entries": entries})
        continue
    if el.name == "h1":
        num = el.select_one(".secnum")
        ttl = el.select_one(".sectitle")
        if num and ttl:
            blocks.append({"type": "h1", "runs": [{"text": num.get_text(strip=True) + "｜" + ttl.get_text(strip=True), "bold": True, "code": False, "color": None}]})
        else:
            blocks.append({"type": "h1", "runs": runs_of(el)})
    elif el.name == "h2":
        blocks.append({"type": "h2", "runs": runs_of(el)})
    elif el.name == "p":
        c = "small" if "small" in cls else "p"
        blocks.append({"type": c, "runs": runs_of(el)})
    elif el.name == "ul":
        kind = "checklist" if "checklist" in cls else "ul"
        for li in el.find_all("li", recursive=False):
            blocks.append({"type": "li", "kind": kind, "runs": runs_of(li)})
    elif el.name == "figure":
        img = el.find("img")
        cap = el.find("figcaption")
        blocks.append({
            "type": "fig",
            "src": img.get("src") if img else None,
            "label": cap.get("data-label") if cap else "",
            "caption": cap.get_text(" ", strip=True) if cap else "",
        })
    elif el.name == "table":
        cap = el.find("caption")
        label_ = cap.get("data-label") if cap else ""
        captext = cap.get_text(" ", strip=True) if cap else ""
        widths = []
        head = []
        for th in el.select("thead th"):
            head.append(cell_text(th))
            m = re.search(r"width:\s*([\d.]+)%", th.get("style") or "")
            widths.append(float(m.group(1)) if m else None)
        rows = [[cell_text(td) for td in tr.find_all(["td", "th"])] for tr in el.select("tbody tr")]
        blocks.append({"type": "table", "label": label_, "caption": captext,
                       "head": head, "rows": rows, "widths": widths})
    elif el.name == "div" and "blank" in cls:
        blocks.append({"type": "blank", "size": "tall" if "tall" in cls else "mid"})
    elif el.name == "div" and "stats" in cls:
        vals = [s.select_one(".v").get_text(" ", strip=True) for s in el.select(".stat")]
        keys = [s.select_one(".k").get_text(" ", strip=True) for s in el.select(".stat")]
        blocks.append({"type": "table", "label": "", "caption": "",
                       "head": keys, "rows": [vals], "widths": [None]*len(vals)})
    elif el.name == "div" and ("note" in cls or "warn" in cls or "fill" in cls):
        kind = "note" if "note" in cls else ("warn" if "warn" in cls else "fill")
        blocks.append({"type": kind, "runs": runs_of(el)})

(HERE / "blocks.json").write_text(json.dumps(blocks, ensure_ascii=False, indent=1), encoding="utf-8")
print("blocks:", len(blocks))
from collections import Counter
print(Counter(b["type"] for b in blocks))
