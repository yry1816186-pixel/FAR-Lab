#!/usr/bin/env python3
"""Helper script to insert JSDoc comments before specific lines in TypeScript files."""
import sys

def apply_jsdoc(filepath, search_line, jsdoc_text):
    """Apply a JSDoc comment before the line containing search_line."""
    with open(filepath, "r", encoding="utf-8") as f:
        content = f.read()
    
    if search_line not in content:
        print(f"NOT_FOUND: {search_line[:80]}", file=sys.stderr)
        return False
    
    # Find the FIRST occurrence
    idx = content.find(search_line)
    before = content[:idx].rstrip("\r\n")
    if before.endswith("*/"):
        print("ALREADY_HAS_JSDOC")
        return True
    
    content = before + "\n" + jsdoc_text + "\n" + content[idx:]
    with open(filepath, "w", encoding="utf-8") as f:
        f.write(content)
    print("OK")
    return True

if __name__ == "__main__":
    if len(sys.argv) != 4:
        print("Usage: python _jsdoc_helper.py <filepath> <search_line> <jsdoc_text>", file=sys.stderr)
        sys.exit(1)
    filepath = sys.argv[1]
    search_line = sys.argv[2]
    jsdoc_text = sys.argv[3]
    ok = apply_jsdoc(filepath, search_line, jsdoc_text)
    sys.exit(0 if ok else 1)
