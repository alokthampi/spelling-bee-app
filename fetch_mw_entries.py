"""Saves a compact copy of each word's Merriam-Webster Collegiate entry, so the
app can show it in its own MW pop-up (MW's website can't be shown inside the
app). Same API and key as generate_word_data.py; nothing is called from the
browser, so the key stays secret.

Output: mw_entries/<scope>_<letter>.json  ({"words": {word: record}}), one file
per scope and first letter (same split as progress_layout.letter_part), so the
app only downloads the letter it needs. Runs add to the files: words already
saved in the current format are skipped (unless --refetch), so a daily run with
--limit fills everything in over a few days within MW's 1,000-a-day allowance.

    python fetch_mw_entries.py --scope all --limit 1000
    python fetch_mw_entries.py --scope school --difficulty one
    python fetch_mw_entries.py --scope all --words cliché piñata     # look these up again
    python fetch_mw_entries.py --scope all --missing   # again, every word saved without an entry

Normally the nightly "Fetch MW entries" GitHub workflow runs this and commits
the files. Don't also run it locally then: both would edit the same files and
share the same daily allowance.

Each record:  {"v": FORMAT, "fetched": date, "entries": [compact_entry(), …]}
plus "suggestions" (not in MW: its closest words), "offensive": true (MW
marks the word offensive; nothing is kept) or "within": true (MW only has the
word as part of a longer entry, e.g. fipple flute). app.js renderMWRecord shows them.

The key comes from MW_API_KEY (environment), else from the .env file here.
"""
import argparse
import glob
import html
import json
import os
import re
import sys
import time
import unicodedata
from datetime import datetime, timezone

import requests

from progress_layout import letter_part

MW_BASE_URL = "https://www.dictionaryapi.com/api/v3/references/collegiate/json"
MW_AUDIO_BASE = "https://media.merriam-webster.com/audio/prons/en/us/mp3"
MW_ART_BASE = "https://www.merriam-webster.com/assets/mw/static/art/dict"
OUT_DIR = "mw_entries"
FORMAT = 2         # bump when a record gains fields: older records are looked up again
SCOPES = ["school", "regional"]
MAX_EXAMPLES = 2   # per sense, to keep the files small
MAX_ENTRIES = 4    # homographs per word (e.g. bear 1 noun, bear 2 verb)
MAX_PHRASES = 6


def api_key():
    key = os.environ.get("MW_API_KEY", "")
    if not key and os.path.exists(".env"):
        with open(".env", encoding="utf-8") as f:
            for line in f:
                name, _, value = line.strip().partition("=")
                if name.strip() == "MW_API_KEY":
                    key = value.strip().strip('"').strip("'")
    if not key:
        raise SystemExit("No MW_API_KEY (environment or .env).")
    return key


def audio_url(audio_id):
    if not audio_id:
        return None
    if audio_id.startswith("bix"):
        subdir = "bix"
    elif audio_id.startswith("gg"):
        subdir = "gg"
    elif not audio_id[0].isalpha():
        subdir = "number"
    else:
        subdir = audio_id[0]
    return f"{MW_AUDIO_BASE}/{subdir}/{audio_id}.mp3"


# MW's inline markup -> plain text with only <i> and <b> (the app escapes
# everything else before showing it)
_PAIRS = {"it": "i", "wi": "i", "qword": "i", "phrase": "i", "parahw": "b", "b": "b", "sc": "b",
          "sup": None, "inf": None}


def mw_text(raw):
    if not raw:
        return ""
    text = html.escape(raw, quote=False)
    text = text.replace("{bc}", "").replace("{ldquo}", "“").replace("{rdquo}", "”").replace("{p_br}", " ")
    for token, tag in _PAIRS.items():
        text = text.replace("{" + token + "}", f"<{tag}>" if tag else "")
        text = text.replace("{/" + token + "}", f"</{tag}>" if tag else "")
    text = re.sub(r"\{gloss\}(.*?)\{/gloss\}", r"[\1]", text)
    text = re.sub(r"\{dx\}(.*?)\{/dx\}", r" — \1", text)
    text = re.sub(r"\{dx_(?:def|ety)\}(.*?)\{/dx_(?:def|ety)\}", r"(\1)", text)
    text = re.sub(r"\{ma\}(.*?)\{/ma\}", r" — more at \1", text)
    # {sx|word||}, {a_link|word}, {d_link|word|id}, {i_link|word|id}, {et_link|word|id}, {mat|word|id}, {dxt|word|id|n}
    text = re.sub(r"\{(?:i_link|et_link)\|([^|}]*)[^}]*\}", r"<i>\1</i>", text)
    text = re.sub(r"\{(?:sx|a_link|d_link|mat|dxt)\|([^|}]*)[^}]*\}", r"\1", text)
    text = re.sub(r"\{[^}]*\}", "", text)  # anything else MW adds
    return re.sub(r"\s+", " ", text).strip(" ,;")


def syllables(text):
    return (text or "").replace("*", "·")


def variants_from(vrs):
    """Other accepted spellings: [{"label": "or", "spelling": "the·a·tre"}]"""
    return [{"label": v.get("vl", "or"), "spelling": syllables(v["va"])} for v in vrs or [] if v.get("va")]


def is_offensive(labels):
    return any("offensive" in str(label).lower() for label in labels or [])


def sense_from(sense):
    out = {"sn": sense.get("sn", ""), "text": "", "examples": []}
    if sense.get("sls"):
        out["label"] = ", ".join(sense["sls"])
    for kind, value in sense.get("dt", []):
        if kind == "text":
            out["text"] = (out["text"] + " " + mw_text(value)).strip()
        elif kind == "vis":
            out["examples"] += [mw_text(v.get("t", "")) for v in value]
        elif kind == "uns":  # usage notes
            for note in value:
                for nkind, nvalue in note:
                    if nkind == "text":
                        out["note"] = mw_text(nvalue)
    variants = variants_from(sense.get("vrs"))
    if variants:
        out["variants"] = variants
    sd = sense.get("sdsense")
    if sd:
        extra = sense_from({"dt": sd.get("dt", [])})
        out["also"] = f"{sd.get('sd', 'also')} {extra['text']}".strip()
    out["examples"] = [e for e in out["examples"] if e][:MAX_EXAMPLES]
    if not out["examples"]:
        del out["examples"]
    return out


def senses_from(sseq_items):
    senses = []
    for item in sseq_items:
        if not isinstance(item, list) or len(item) < 2:
            continue
        kind, value = item[0], item[1]
        if kind == "pseq":
            senses += senses_from(value)
        elif kind == "bs":
            sense = value.get("sense", {})
            if is_offensive(sense.get("sls")) or is_offensive(sense.get("lbs")):
                continue
            senses.append(sense_from(sense))
        elif kind == "sense":
            if is_offensive(value.get("sls")) or is_offensive(value.get("lbs")):
                continue
            senses.append(sense_from(value))
    return [s for s in senses if s.get("text") or s.get("also")]


def defs_from(def_list):
    defs = []
    for d in def_list or []:
        senses = [s for sseq in d.get("sseq", []) for s in senses_from(sseq)]
        if senses:
            defs.append({"vd": d["vd"], "senses": senses} if d.get("vd") else {"senses": senses})
    return defs


def compact_entry(entry):
    """One MW entry, cut down to what the app shows (fields are left out when MW
    has nothing for them). Text fields may contain <i>/<b> only.
      hw         headword with syllable dots ("ap·ple");  hom: homograph number
      fl         part of speech;  labels: e.g. "often capitalized"
      variants   other accepted spellings [{label: "or", spelling}]  (key for bees)
      crossRefs  "plural of <b>mouse</b>", "past tense of <b>swim</b>"
      prs        pronunciations [{mw: "ˈa-pəl", audio: mp3 URL or None}]
      forms      inflections ("plural ap·ples")
      defs       [{vd: "transitive verb"?, senses: [{sn, text, label?, examples?,
                  note?, also?, variants?}]}]
      art        MW's drawing {url, caption}
      phrases    [{phrase, meaning}]: idioms and compounds
      synonyms   {title, text, examples?}: MW's synonym discussion
      history    word history;  firstUse: first known use
      related    other forms [{word: "ab·o·rig·i·nal·ly", fl: "adverb"}]
    """
    hwi = entry.get("hwi", {})
    out = {
        "hw": syllables(hwi.get("hw", "")),
        "fl": entry.get("fl", ""),
        "prs": [{"mw": p.get("mw", ""), "audio": audio_url(p.get("sound", {}).get("audio"))}
                for p in hwi.get("prs", []) if p.get("mw")],
    }
    if entry.get("hom"):
        out["hom"] = entry["hom"]
    if entry.get("lbs"):
        out["labels"] = entry["lbs"]

    # Variant spellings: the most important part for a spelling bee
    variants = variants_from(entry.get("vrs"))
    if variants:
        out["variants"] = variants

    # "plural of mouse", "past tense of swim"
    cross = []
    for cx in entry.get("cxs", []):
        targets = ", ".join(t.get("cxt", "") for t in cx.get("cxtis", []) if t.get("cxt"))
        cross.append(f"{cx.get('cxl', '')} <b>{html.escape(targets, quote=False)}</b>".strip())
    if cross:
        out["crossRefs"] = cross

    forms = [f"{i.get('il', '')} {syllables(i.get('if', ''))}".strip() for i in entry.get("ins", []) if i.get("if")]
    if forms:
        out["forms"] = forms
    defs = defs_from(entry.get("def"))
    if defs:
        out["defs"] = defs
    elif entry.get("shortdef"):
        out["defs"] = [{"senses": [{"sn": "", "text": html.escape(s, quote=False)} for s in entry["shortdef"]]}]

    art = entry.get("art") or {}
    if art.get("artid"):
        out["art"] = {"url": f"{MW_ART_BASE}/{art['artid']}.gif", "caption": mw_text(art.get("capt", ""))}

    # Phrases built on the word ("full of beans"), each with its meaning
    phrases = []
    for dro in entry.get("dros", [])[:MAX_PHRASES]:
        senses = [s for d in defs_from(dro.get("def")) for s in d["senses"]][:2]
        if dro.get("drp") and senses:
            phrases.append({"phrase": mw_text(dro["drp"]), "meaning": "; ".join(s["text"] for s in senses)})
    if phrases:
        out["phrases"] = phrases

    # Synonym discussion: how near-synonyms differ
    for syn in entry.get("syns", []):
        text = " ".join(mw_text(v) for k, v in syn.get("pt", []) if k == "text")
        examples = [mw_text(v.get("t", "")) for k, vs in syn.get("pt", []) if k == "vis" for v in vs][:3]
        if text:
            out["synonyms"] = {"title": syn.get("pl", "synonyms"), "text": text}
            if examples:
                out["synonyms"]["examples"] = examples
            break

    et = " ".join(mw_text(v) for k, v in entry.get("et", []) if k == "text")
    if et:
        out["history"] = et
    if entry.get("date"):
        out["firstUse"] = mw_text(entry["date"])
    uros = [{"word": syllables(u.get("ure", "")), "fl": u.get("fl", "")} for u in entry.get("uros", []) if u.get("ure")]
    if uros:
        out["related"] = uros
    return out


def entries_for(word, data):
    """MW's entries for this word: its own homographs, else the entry it's a form of
    (e.g. "beans" -> bean, "lay-ups" -> layup), else the entry it's part of
    ("fipple" -> fipple flute; the record then gets "within": true).
    Offensive senses are left out (senses_from); an entry MW flags offensive is
    left out only if it has nothing else (e.g. "primitive" keeps its other senses).
    Returns (entries, extra fields for the record)."""
    if not data or not isinstance(data[0], dict):
        suggestions = [s for s in (data or []) if isinstance(s, str)][:5]
        return [], ({"suggestions": suggestions} if suggestions else {})  # not found
    found = [e for e in data if isinstance(e, dict)]
    flagged = lambda e: bool(e.get("meta", {}).get("offensive"))
    head_id = lambda e: e.get("meta", {}).get("id", "").split(":")[0]
    squash = lambda s: re.sub(r"[\s-]", "", s.lower())
    pattern = re.compile(rf"(^|[\s-]){re.escape(word.lower())}([\s-]|$)")
    extra_fields = {}
    own = [e for e in found if head_id(e).lower() == word.lower()]
    if not own:
        own = [e for e in found if squash(word) in (squash(s) for s in e.get("meta", {}).get("stems", []))][:1]
    if not own:
        own = [e for e in found if not flagged(e) and pattern.search(head_id(e).lower())][:2]
        extra_fields = {"within": True} if own else {}
    entries = [compact_entry(e) for e in own[:MAX_ENTRIES]
               if not flagged(e) or (not is_offensive(e.get("lbs")) and defs_from(e.get("def")))]
    if own and not entries:
        return [], {"offensive": True}  # MW has it, but nothing in it is fit to show
    usable = [e for e in found if not flagged(e)]
    used = {e.get("meta", {}).get("id") for e in own}

    # MW lists phrases and compounds as entries of their own ("head in the sand",
    # "head cold"): add them to the word's phrases
    if entries:
        extra = []
        for e in usable:
            if e.get("meta", {}).get("id") in used:
                continue
            name = head_id(e)
            meaning = (e.get("shortdef") or [""])[0]
            if name.lower() != word.lower() and pattern.search(name.lower()) and meaning \
                    and "offensive" not in meaning.lower():
                extra.append({"phrase": html.escape(name, quote=False), "meaning": html.escape(meaning, quote=False)})
        known = {p["phrase"] for p in entries[0].get("phrases", [])}
        phrases = entries[0].get("phrases", []) + [p for p in extra if p["phrase"] not in known]
        if phrases:
            entries[0]["phrases"] = phrases[:MAX_PHRASES]
    return entries, (extra_fields if entries else {})


def without_accents(word):
    return "".join(c for c in unicodedata.normalize("NFD", word) if not unicodedata.combining(c))


def lookup(word, key):
    """MW's raw answer (a list), or None if MW couldn't be reached / refused."""
    try:
        response = requests.get(f"{MW_BASE_URL}/{requests.utils.quote(word)}", params={"key": key}, timeout=15)
        data = response.json() if response.status_code == 200 else None
    except Exception:
        return None
    return data if isinstance(data, list) else None


def main():
    parser = argparse.ArgumentParser(description="Save Merriam-Webster entries for the in-app MW pop-up.")
    parser.add_argument("--scope", required=True, choices=SCOPES + ["all"])
    parser.add_argument("--difficulty", choices=["one", "two", "three"], help="Only this difficulty")
    parser.add_argument("--limit", type=int, default=1000, help="Most words to look up this run (MW allows 1,000 a day)")
    parser.add_argument("--refetch", action="store_true", help="Look up words already saved, too")
    parser.add_argument("--words", nargs="+", help="Only these words (looked up again even if saved)")
    parser.add_argument("--missing", action="store_true", help="Look up again words saved without an entry")
    args = parser.parse_args()

    key = api_key()
    scopes = SCOPES if args.scope == "all" else [args.scope]
    words = []  # (scope, word)
    for scope in scopes:
        with open(f"word_list_{scope}.json", encoding="utf-8") as f:
            words += [(scope, w["word"]) for w in json.load(f)
                      if (not args.difficulty or w.get("difficulty") == args.difficulty)
                      and (not args.words or w["word"] in args.words)]

    os.makedirs(OUT_DIR, exist_ok=True)
    files = {}

    def file_for(scope, word):
        name = os.path.join(OUT_DIR, f"{letter_part(scope, word)}.json")
        if name not in files:
            files[name] = json.load(open(name, encoding="utf-8")) if os.path.exists(name) else {"words": {}}
        return files[name]

    def needed(scope, word):
        record = file_for(scope, word)["words"].get(word)
        return args.refetch or args.words or not record or record.get("v", 1) < FORMAT \
            or (args.missing and not record.get("entries"))

    pending = [sw for sw in words if needed(*sw)]
    todo = pending[:args.limit]
    print(f"{len(words)} words · {len(pending)} still to look up · {len(todo)} this run")
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    found = missing = failed = 0
    for i, (scope, word) in enumerate(todo, 1):
        data = lookup(word, key)
        if data is None:
            failed += 1
            print(f"  could not look up {word!r}")
            if failed >= 5 and failed == i:
                print("MW isn't answering (key or daily limit?). Stopping; what was saved is kept.")
                break
            continue
        entries, extra = entries_for(word, data)
        # MW's search wants accented words without accents (cliché -> cliche)
        if not entries and not extra.get("offensive") and without_accents(word) != word:
            retry = lookup(without_accents(word), key)
            if retry is not None:
                entries, extra = entries_for(without_accents(word), retry)
        record = {"v": FORMAT, "entries": entries, "fetched": today, **extra}
        file_for(scope, word)["words"][word] = record
        found += bool(entries)
        missing += not entries
        if i % 100 == 0:
            print(f"  {i}/{len(todo)}")
        time.sleep(0.15)  # be gentle with MW

    for name, content in files.items():
        content["words"] = dict(sorted(content["words"].items(), key=lambda kv: kv[0].lower()))
        with open(name, "w", encoding="utf-8") as f:
            json.dump(content, f, ensure_ascii=False, separators=(",", ":"))
    sizes = {os.path.basename(n): os.path.getsize(n) for n in glob.glob(os.path.join(OUT_DIR, "*.json"))}
    left = len(pending) - found - missing
    print(f"Done: {found} with an entry, {missing} not in MW, {failed} failed · {left} still to look up.")
    print(f"{len(sizes)} files, {sum(sizes.values()) / 1024:.0f} KB total, largest "
          f"{max(sizes.values(), default=0) / 1024:.0f} KB")


if __name__ == "__main__":
    sys.exit(main())
