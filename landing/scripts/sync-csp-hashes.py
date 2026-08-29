#!/usr/bin/env python3
"""Keeps vercel.json's CSP script-src hash list in sync with the inline
<script> blocks actually present across landing/**/*.html.

The CSP is `default-src 'none'`, so every inline <script> (JSON-LD included —
browsers apply script-src to it too) must be allowlisted by exact sha256
hash. Landing pages are partly hand-written and partly generated
(generate-commodity-pages.py), and several embed page-specific JSON-LD (COT
figures, dates) that changes its hash on every edit. That drift is what
caused /now and /learn pages to silently lose CSP coverage for their
structured data in the past.

Run this after ANY edit to a landing page's inline <script> content,
including regenerating commodity pages:
    python3 landing/scripts/sync-csp-hashes.py

It rewrites vercel.json's script-src hash set to exactly what the HTML
needs — no more, no less — and leaves everything else (headers, formatting,
the googlesyndication host) untouched. Safe to run repeatedly; a no-op run
prints "no changes needed".
"""
import base64
import glob
import hashlib
import json
import os
import re
import sys

ROOT = os.path.join(os.path.dirname(__file__), "..")
VERCEL_JSON = os.path.join(ROOT, "vercel.json")
INLINE_SCRIPT_RE = re.compile(
    r"<script(?![^>]*\bsrc=)[^>]*>(.*?)</script>", re.S | re.I
)


def find_required_hashes():
    hashes = {}  # hash -> set of files it came from, for reporting
    for path in sorted(glob.glob(os.path.join(ROOT, "**", "*.html"), recursive=True)):
        html = open(path, encoding="utf-8").read()
        for body in INLINE_SCRIPT_RE.findall(html):
            digest = base64.b64encode(hashlib.sha256(body.encode("utf-8")).digest()).decode()
            h = f"sha256-{digest}"
            hashes.setdefault(h, set()).add(os.path.relpath(path, ROOT))
    return hashes


def main():
    required = find_required_hashes()

    with open(VERCEL_JSON, encoding="utf-8") as f:
        config = json.load(f)

    csp_header = config["headers"][0]["headers"][0]
    assert csp_header["key"] == "Content-Security-Policy", "vercel.json shape changed — update this script"
    csp = csp_header["value"]

    # script-src runs from "script-src " to the next "; " boundary.
    m = re.search(r"script-src ([^;]*);", csp)
    if not m:
        sys.exit("Could not find script-src directive in vercel.json's CSP — aborting.")
    tokens = m.group(1).split()

    hash_tokens = {t for t in tokens if t.startswith("'sha256-")}
    other_tokens = [t for t in tokens if not t.startswith("'sha256-")]  # e.g. the googlesyndication host

    current = {t.strip("'") for t in hash_tokens}
    needed = set(required.keys())

    added = needed - current
    removed = current - needed

    if not added and not removed:
        print(f"no changes needed — {len(needed)} hashes already match {sum(len(v) for v in required.values())} script blocks across the site")
        return

    new_hash_tokens = [f"'{h}'" for h in sorted(needed)]
    new_script_src = " ".join(new_hash_tokens + other_tokens)
    csp = csp[: m.start(1)] + new_script_src + csp[m.end(1):]
    csp_header["value"] = csp

    with open(VERCEL_JSON, "w", encoding="utf-8") as f:
        json.dump(config, f, indent=2)
        f.write("\n")

    if added:
        print(f"added {len(added)} hash(es):")
        for h in sorted(added):
            files = ", ".join(sorted(required[h]))
            print(f"  + {h}  ({files})")
    if removed:
        print(f"removed {len(removed)} stale hash(es) no longer used by any page:")
        for h in sorted(removed):
            print(f"  - {h}")


if __name__ == "__main__":
    main()
