"""Find Greek and Latin roots in the word lists, for the Learning card's Word parts.

Reads roots.json (the roots), root_overrides.json (hand corrections), the word
lists and the Merriam-Webster entries in mw_entries/ (their "history" is the
word's etymology). Writes word_roots.json, which the app loads:

  { "roots": { id: {root, lang, meaning} }, "words": { word: [[id, start, end], ...] } }

start/end are letter positions in the word (end not included).

A root is tagged when one of its forms is in the word (at the start for a
prefix, at the end for a suffix) and:
  - the word is one of the root's hand-checked examples, or
  - the word's origin fits the root's language, and, for a strict root (short
    or look-alike: pan, ped, re...), the word's MW history names the root.
    For a word with an English origin (a modern coinage), the history must
    name the root even when the root is not strict.

Run after the word lists or roots.json change:  python tag_roots.py
--report prints every tagged word with how each root was confirmed, for
checking by hand. No network, no API key.
"""

import argparse
import glob
import html
import json
import re
import sys
import unicodedata

WORD_LISTS = ["word_list_school.json", "word_list_regional.json"]
ROOTS_FILE = "roots.json"
OVERRIDES_FILE = "root_overrides.json"
OUTPUT_FILE = "word_roots.json"

# Origins that carry roots of each language (origin lists the root language first)
GREEK_ORIGINS = {"Greek"}
LATIN_ORIGINS = {"Latin", "French", "Italian", "Spanish", "Portuguese", "Occitan", "Catalan"}
COINED_ORIGINS = {"English"}


def plain(text: str) -> str:
    """Lowercase, accents off, one character per character (positions stay put)."""
    out = []
    for ch in text.lower():
        base = unicodedata.normalize("NFD", ch)[0]
        out.append(base)
    return "".join(out)


def history_text(raw: str) -> str:
    """MW history as plain lowercase text: tags and accents off."""
    text = html.unescape(re.sub(r"<[^>]+>", "", raw or ""))
    text = unicodedata.normalize("NFD", text.lower())
    return "".join(ch for ch in text if not unicodedata.combining(ch))


def load_histories() -> dict:
    histories = {}
    for path in glob.glob("mw_entries/*.json"):
        with open(path, encoding="utf-8") as f:
            for word, record in json.load(f).get("words", {}).items():
                text = " ".join(e.get("history") or "" for e in record.get("entries", []))
                if text.strip():
                    histories[word.lower()] = history_text(text)
    return histories


def origin_fits(lang: str, origins: list) -> str:
    """'yes' when the origin carries the root's language, 'coined' for an
    English coinage (needs the history to confirm), else ''."""
    langs = set(lang.split("/"))
    wanted = set()
    if "Greek" in langs:
        wanted |= GREEK_ORIGINS
    if "Latin" in langs:
        wanted |= LATIN_ORIGINS
    # Greek roots reached English mostly through Latin and French: fine when the
    # history confirms the Greek
    if "Greek" in langs and not wanted & set(origins) and set(origins) & LATIN_ORIGINS:
        return "coined"
    if wanted & set(origins):
        return "yes"
    if set(origins) & COINED_ORIGINS:
        return "coined"
    return ""


def candidates(word_plain: str, root: dict):
    """(start, end) of each place a form of the root fits in the word."""
    spans = []
    for form in sorted(root["forms"], key=len, reverse=True):
        for m in re.finditer(form, word_plain):
            start, end = m.span()
            if end == start:
                continue
            if root["at"] == "start" and start != 0:
                continue
            if root["at"] == "end" and end != len(word_plain):
                continue
            # A root inside a longer run of letters is fine; across a space is not
            if " " in word_plain[start:end] or "-" in word_plain[start:end]:
                continue
            spans.append((start, end))
    return spans


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--report", action="store_true", help="print each tagged word and why")
    args = parser.parse_args()
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")

    with open(ROOTS_FILE, encoding="utf-8") as f:
        roots = json.load(f)["roots"]
    try:
        with open(OVERRIDES_FILE, encoding="utf-8") as f:
            overrides = {k: v for k, v in json.load(f).items() if not k.startswith("_")}
    except FileNotFoundError:
        overrides = {}
    for root in roots:
        root["_etyma"] = [re.compile(e) for e in root.get("etyma", [])]
        root["_examples"] = {plain(w) for w in root.get("examples", [])}
    by_id = {r["id"]: r for r in roots}

    words = {}
    for path in WORD_LISTS:
        with open(path, encoding="utf-8") as f:
            for item in json.load(f):
                words.setdefault(item["word"], item)
    histories = load_histories()

    out_words = {}
    report = []
    for word, item in sorted(words.items(), key=lambda kv: kv[0].lower()):
        wp = plain(word)
        origins = [o.strip() for o in (item.get("origin") or "").split(",") if o.strip()]
        history = histories.get(word.lower(), "")
        override = overrides.get(word)
        found = []  # (start, end, id, how)
        for root in roots:
            if override and root["id"] in override.get("remove", []):
                continue
            forced = bool(override) and root["id"] in override.get("add", [])
            for start, end in candidates(wp, root):
                confirmed = bool(history) and any(e.search(history) for e in root["_etyma"])
                if forced or wp in root["_examples"]:
                    how = "example" if not forced else "override"
                else:
                    fit = origin_fits(root["lang"], origins)
                    # needOrigin: the origin itself must name the language (a- "not" is
                    # Greek; in French and Latin words a- is usually ad-)
                    if not fit or (root.get("needOrigin") and fit != "yes"):
                        continue
                    if (root.get("strict") or fit == "coined") and not confirmed:
                        continue
                    how = "history" if confirmed else "origin"
                found.append((start, end, root["id"], how))

        # Longest roots first, hand-checked before history before origin; no overlaps
        rank = {"override": 0, "example": 0, "history": 1, "origin": 2}
        found.sort(key=lambda f: (rank[f[3]], -(f[1] - f[0]), f[0]))
        chosen = []
        for f in found:
            if all(f[1] <= c[0] or f[0] >= c[1] for c in chosen):
                chosen.append(f)
        chosen.sort()
        if chosen:
            out_words[word] = [[c[2], c[0], c[1]] for c in chosen]
            report.append((word, item.get("origin"), chosen))

    used = {c[0] for spans in out_words.values() for c in spans}
    # Every root, even one no list word has: the Roots tab shows them all.
    # kind: prefix / suffix / root (from where the root sits in a word)
    kinds = {"start": "prefix", "end": "suffix", "any": "root"}
    output = {
        "_about": "Made by tag_roots.py from roots.json, root_overrides.json and mw_entries/. Don't edit by hand: fix roots.json or root_overrides.json and rerun.",
        "roots": {r["id"]: {"root": r["root"], "lang": r["lang"], "meaning": r["meaning"],
                            "kind": kinds[r["at"]], "common": r.get("common", []),
                            **({"scripps": True} if r.get("source") else {})}
                  for r in roots},
        "words": out_words,
    }
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(output, f, ensure_ascii=False, separators=(",", ":"))
        f.write("\n")

    if args.report:
        for word, origin, chosen in report:
            parts = ", ".join(f"{word[s:e]}={rid}({how})" for s, e, rid, how in chosen)
            print(f"{word}  [{origin}]  {parts}")
    unused = [r["id"] for r in roots if r["id"] not in used]
    print(f"{len(out_words)} of {len(words)} words tagged; {len(used)} roots used"
          + (f"; unused: {', '.join(unused)}" if unused else ""), file=sys.stderr)


if __name__ == "__main__":
    main()
