"""Extract the SJTU 125 Questions booklet using its embedded heading typography."""

import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re

import fitz


def normalize(text):
    return re.sub(r"\s+", " ", text).strip()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", default="C:/Users/RichardYuan/Downloads/sjtu-booklet.pdf")
    parser.add_argument("--output", default="artifacts/sjtu-125/source")
    args = parser.parse_args()
    source = Path(args.pdf)
    output = Path(args.output)
    output.mkdir(parents=True, exist_ok=True)
    document = fitz.open(source)
    pages = []
    questions = []
    category = None
    source_question_marks = 0
    for page_number, page in enumerate(document, start=1):
        page_text = page.get_text()
        pages.append({"page": page_number, "printedPage": page_number - 2 if 3 <= page_number <= 42 else None, "text": page_text})
        if not 7 <= page_number <= 42:
            continue
        title_lines = []
        categories = []
        for block in page.get_text("dict")["blocks"]:
            for line in block.get("lines", []):
                spans = line["spans"]
                headings = [s for s in spans if s["font"] == "MyriadPro-Bold"]
                if not headings:
                    continue
                text = normalize("".join(s["text"] for s in headings))
                if not text:
                    continue
                if max(s["size"] for s in headings) > 18:
                    categories.append((line["bbox"][1], text))
                elif all(11 <= s["size"] <= 13 for s in headings):
                    source_question_marks += text.count("?")
                    title_lines.append({"text": text, "bbox": line["bbox"]})
        categories.sort()
        # Reading order is top-to-bottom within each horizontal heading band.
        # The booklet has no explicit question numbers; IDs below are assigned.
        title_lines.sort(key=lambda item: (round(item["bbox"][1] / 3), item["bbox"][0]))
        pending = []
        while title_lines:
            line = title_lines.pop(0)
            parts = [line["text"]]
            bbox = list(line["bbox"])
            while not parts[-1].endswith("?"):
                candidates = [(i, nxt) for i, nxt in enumerate(title_lines)
                              if 0 < nxt["bbox"][1] - bbox[1] < 24
                              and abs(nxt["bbox"][0] - bbox[0]) < 35]
                if not candidates:
                    raise ValueError(f"Incomplete question heading on PDF page {page_number}: {parts}")
                i, nxt = min(candidates, key=lambda item: item[1]["bbox"][1])
                title_lines.pop(i)
                parts.append(nxt["text"])
                bbox[1] = nxt["bbox"][1]
                bbox[2] = max(bbox[2], nxt["bbox"][2])
                bbox[3] = nxt["bbox"][3]
            applicable = [name for y, name in categories if y < line["bbox"][1]]
            question_category = applicable[-1] if applicable else category
            pending.append({
                "title": normalize(" ".join(parts)),
                "category": question_category,
                "pages": [page_number],
                "printedPages": [page_number - 2],
                "sourceHeadingBounds": [round(v, 3) for v in line["bbox"]],
                "context": page_text,
                "contextScope": "full_source_page_including_neighboring_questions",
            })
        for question in pending:
            questions.append({"id": len(questions) + 1, **question})
        if categories:
            category = categories[-1][1]
    titles = [q["title"] for q in questions]
    checks = {
        "questionCount125": len(questions) == 125,
        "uniqueTitles125": len(set(titles)) == 125,
        "contiguousIds": [q["id"] for q in questions] == list(range(1, 126)),
        "allTitlesEndWithQuestionMark": all(t.endswith("?") for t in titles),
        "allHaveCategoryAndContext": all(q["category"] and q["context"] for q in questions),
        "allSourceHeadingQuestionMarksPreserved": sum(t.count("?") for t in titles) == source_question_marks,
    }
    audit = {
        "sourceFile": source.name,
        "sourceSha256": hashlib.sha256(source.read_bytes()).hexdigest(),
        "extractedAt": datetime.now(timezone.utc).isoformat(),
        "extractor": "PyMuPDF embedded text and MyriadPro-Bold heading spans (11-13 pt)",
        "pdfPageCount": len(document),
        "questionCount": len(questions),
        "sourceHeadingQuestionMarkCount": source_question_marks,
        "categoryCounts": dict(Counter(q["category"] for q in questions)),
        "checks": checks,
        "notes": [
            "IDs are assigned in PDF page order, then heading vertical position and horizontal position; the source has no numeric question IDs.",
            "Titles are extracted verbatim except whitespace normalization. No Chinese question titles are present in the source, so titleZh is omitted.",
            "Context is the complete source page, explicitly including adjacent questions; no machine-inferred paragraph attribution is claimed.",
            "PDF source was published 14 May 2021. Its context is historical evidence, not a claim about the current state of science.",
        ],
    }
    for name, value in [("questions.json", questions), ("pages.json", pages), ("extraction-audit.json", audit)]:
        (output / name).write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (output / "text.txt").write_text("\n\n".join(f"--- PDF PAGE {p['page']} ---\n{p['text']}" for p in pages), encoding="utf-8")
    print(json.dumps(audit, ensure_ascii=True, indent=2))
    if not all(checks.values()):
        raise SystemExit("Extraction verification failed")


if __name__ == "__main__":
    main()
