import requests
import json
import os
import time
import re
import argparse
import csv
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Optional

# ============================================================
# Configuration
# ============================================================
# Stored in the MW_API_KEY GitHub secret; the "Generate word data" GitHub
# Actions workflow passes it in. To run locally, set it first:
#   PowerShell:  $env:MW_API_KEY = "your-key"
MW_API_KEY = os.environ.get("MW_API_KEY", "")
MW_BASE_URL = "https://www.dictionaryapi.com/api/v3/references/collegiate/json"
MW_AUDIO_BASE = "https://media.merriam-webster.com/audio/prons/en/us/mp3"
TATOEBA_SENTENCES_URL = "https://api.tatoeba.org/v1/sentences"

INPUT_WORD_FILE = "input_words.txt"
OUTPUT_WORD_FILE = "words_new.json"

MAX_WORKERS = 5

# Used only when neither dictionary source provides a suitable complete
# sentence. Every one is marked "generated" in the output.
GENERATED_SENTENCES = {
    "dangle": "The keys dangle from a hook beside the door.",
    "grumpily": "He grumpily put on his boots for the rainy walk.",
    "sparkle": "The stars sparkle above the quiet campsite.",
    "alphabetical": "The librarian placed the books in alphabetical order.",
    "duende": "The dancer performed with duende and deep emotion.",
    "megahertz": "The radio station broadcasts at ninety megahertz.",
    "pentathlete": "The pentathlete trained hard for five different events.",
    "piteously": "The lost puppy piteously whined at the shelter door.",
    "romerillo": "The botanist carefully labeled the romerillo plant.",
    "snarkiness": "Her snarkiness disappeared when she heard the good news.",
    "staccato": "The drummer played a quick staccato rhythm.",
    "ampulla": "The scientist examined the tiny ampulla in the laboratory.",
    "arachnid": "A spider is an arachnid with eight legs.",
    "bogong moth": "The bogong moth migrates to mountain caves in summer.",
    "cappadocia": "Our family saw the cave homes of Cappadocia.",
    "cerulean": "A cerulean sky stretched above the blue lake.",
    "chitinous": "The beetle has a hard, chitinous outer covering.",
    "credenza": "Grandma stored the good plates in the credenza.",
    "diffidence": "His diffidence made him speak quietly at first.",
    "diplomatically": "She diplomatically helped the two friends solve their disagreement.",
    "éclair": "We shared a chocolate éclair after lunch.",
    "endothermy": "Endothermy helps a bird stay warm in cold weather.",
    "forsythia": "Yellow forsythia blossoms brightened the garden.",
    "gauntlets": "The knight wore steel gauntlets to protect his hands.",
    "gloucester": "We visited Gloucester during our trip to England.",
    "glycerin": "The soap contains glycerin to help keep skin soft.",
    "inaugurate": "The mayor will inaugurate the new community center tomorrow.",
    "irascibility": "His irascibility made small delays seem very frustrating.",
    "lactobacillus": "Lactobacillus is a helpful bacterium found in yogurt.",
    "lapels": "He brushed snow from the lapels of his coat.",
    "legation": "The ambassador worked at the legation in the capital city.",
    "mewling": "We heard a mewling kitten behind the garden shed.",
    "mysticetes": "Mysticetes are whales that filter food through baleen.",
    "odorant": "The odorant gave the candle a fresh lemon smell.",
    "ototoxic": "The doctor explained that some medicines can be ototoxic.",
    "phantasmal": "A phantasmal shape appeared in the misty hallway.",
    "procession": "A cheerful procession marched down the main street.",
    "prosciutto": "The pizza was topped with prosciutto and fresh basil.",
    "prospective": "The prospective students toured the school on Saturday.",
    "reassurance": "Her kind words gave him reassurance before the test.",
    "sensilla": "The insect uses tiny sensilla to sense its surroundings.",
    "shar-pei": "The wrinkled shar-pei waited patiently by the gate.",
    "solenodon": "A solenodon is a rare mammal from the Caribbean.",
    "spes phthisica": "The historian explained the old medical phrase spes phthisica.",
    "stomatopods": "Stomatopods use powerful claws to catch their prey.",
    "thermotaxis": "Thermotaxis helps some animals move toward a comfortable temperature.",
    "thrummed": "Rain thrummed softly on the roof all night.",
    "trichobothria": "Trichobothria help some spiders detect tiny movements in the air.",
    "unrelenting": "The unrelenting rain finally stopped after three days.",
    "vibrissae": "A cat uses its vibrissae to feel nearby objects.",
    "vibrometer": "The engineer used a vibrometer to measure the machine's movement.",
}

# ============================================================
# Utility helpers
# ============================================================
def build_audio_url(audio_id: Optional[str]) -> Optional[str]:
    if not audio_id:
        return None

    if audio_id.startswith("bix"):
        subdir = "bix"
    elif audio_id.startswith("gg"):
        subdir = "gg"
    elif audio_id[0].isdigit():
        subdir = "number"
    else:
        subdir = audio_id[0]

    return f"{MW_AUDIO_BASE}/{subdir}/{audio_id}.mp3"


def normalize_text(text: str) -> str:
    """Remove Merriam-Webster formatting markers"""
    return re.sub(r"\{.*?\}", "", text).strip()


def is_exact_entry(entry: dict, word: str) -> bool:
    meta_id = entry.get("meta", {}).get("id", "")
    headword = meta_id.split(":")[0].lower()
    return headword == word.lower()


# ============================================================
# Pronunciations
# ============================================================
def headword(entry: dict) -> str:
    """The entry's headword without MW's syllable dots, e.g. "de*tail" -> "detail"."""
    return entry.get("hwi", {}).get("hw", "").replace("*", "")


def pronunciation_items(prs_list: list) -> List[Dict]:
    """MW "prs" objects as {written, label, audio_url}, in MW's order. A written
    form without audio is kept: MW often spells out an alternate it hasn't
    recorded. Partial forms such as "-ˈrij-nəl" are kept as MW shows them."""
    items = []
    for prs in prs_list or []:
        written = prs.get("mw", "")
        audio = (prs.get("sound") or {}).get("audio")
        if not written and not audio:
            continue
        item = {"written": written, "audio_url": build_audio_url(audio)}
        label = " ".join(part for part in (prs.get("l"), prs.get("l2")) if part)
        if label:
            item["label"] = label
        items.append(item)
    return items


def find_pronunciations(data: list, word: str, part_of_speech: str = "",
                        definition: str = "") -> List[Dict]:
    """Every MW pronunciation of the word, MW's preferred one first.

    Homographs can be pronounced differently ("august" the adjective vs.
    "August" the month), so the entry is matched on exact spelling first, then
    on the definition or part of speech the word list uses. Words without their
    own entry ("amiably", plurals) are looked up among the run-on words and
    inflections of related entries."""
    entries = [e for e in data if isinstance(e, dict)]

    candidates = ([e for e in entries if headword(e) == word]
                  or [e for e in entries if headword(e).lower() == word.lower()])
    if candidates:
        chosen = (next((e for e in candidates if definition and definition in e.get("shortdef", [])), None)
                  or next((e for e in candidates if part_of_speech and e.get("fl") == part_of_speech), None)
                  or candidates[0])
        # Later homographs often leave out a pronunciation shared with the first
        for entry in [chosen] + [e for e in candidates if e is not chosen]:
            items = pronunciation_items(entry.get("hwi", {}).get("prs"))
            if items:
                return items
        return []

    for entry in entries:
        for uro in entry.get("uros", []) or []:
            if uro.get("ure", "").replace("*", "").lower() == word.lower():
                items = pronunciation_items(uro.get("prs"))
                if items:
                    return items
        for ins in entry.get("ins", []) or []:
            if ins.get("if", "").replace("*", "").lower() == word.lower():
                items = pronunciation_items(ins.get("prs"))
                if items:
                    return items
    return []


def default_audio_url(pronunciations: List[Dict]) -> Optional[str]:
    """The first recorded pronunciation, used by the app's Dictionary button."""
    return next((p["audio_url"] for p in pronunciations if p.get("audio_url")), None)


def fetch_mw(word: str) -> Optional[list]:
    """MW's raw response for a word, or None if the request failed or MW
    returned something other than a list (such as a key or quota error)."""
    try:
        response = requests.get(f"{MW_BASE_URL}/{word}?key={MW_API_KEY}", timeout=15)
        data = response.json() if response.status_code == 200 else None
    except Exception:
        return None
    return data if isinstance(data, list) else None


# ============================================================
# Merriam-Webster example sentence extraction (SAFE)
# ============================================================
def extract_example_sentences(entry: dict) -> List[str]:
    """
    Extract real MW example sentences ("vis")
    Fully guarded against MW sseq structure variations
    """
    sentences = []

    for d in entry.get("def", []):
        for sseq in d.get("sseq", []):
            for sense in sseq:
                if (
                    not isinstance(sense, list)
                    or len(sense) < 2
                    or not isinstance(sense[1], dict)
                ):
                    continue

                sense_data = sense[1]

                for dt in sense_data.get("dt", []):
                    if not isinstance(dt, list) or len(dt) < 2:
                        continue

                    if dt[0] == "vis":
                        for vis in dt[1]:
                            # Current Collegiate API responses return visual
                            # examples as {"t": "..."}; retain support for
                            # the older list form as well.
                            if isinstance(vis, dict):
                                text = normalize_text(vis.get("t", ""))
                            elif isinstance(vis, list) and len(vis) > 1:
                                text = normalize_text(vis[1])
                            else:
                                text = ""

                            if text:
                                sentences.append(text)

    # Deduplicate while preserving order
    seen = set()
    unique = []
    for s in sentences:
        if s not in seen:
            seen.add(s)
            unique.append(s)

    # MW's "vis" field can contain either a full example sentence or a
    # fragment (for example, "always smiling").  Only return complete,
    # punctuated sentences for read-aloud spelling practice; callers use a
    # definition-based fallback when no full example is available.
    return [sentence for sentence in unique if re.search(r'[.!?]["\'\)\]]*$', sentence)]


# ============================================================
# Origin extraction
# ============================================================
# Scripps-style language of origin: the root language first, then the
# languages the word passed through on its way into English, for example
# "Middle English, from Anglo-French X, from Latin Y" -> "Latin, French".
ORIGIN_LANGUAGES = {
    "Anglo-French": "French", "Old French": "French", "Middle French": "French",
    "French": "French", "Old North French": "French", "Gallo-Romance": "French",
    "Walloon": "French", "Old Occitan": "Occitan",
    "Latin": "Latin", "Late Latin": "Latin", "Medieval Latin": "Latin",
    "New Latin": "Latin", "Vulgar Latin": "Latin",
    "Greek": "Greek", "Late Greek": "Greek", "Middle Greek": "Greek",
    "Old High German": "German", "Middle High German": "German", "German": "German",
    "Middle Low German": "German", "Low German": "German",
    "Middle Dutch": "Dutch", "Dutch": "Dutch",
    "Old English": "Old English", "Middle English": None, "English": None,
    "Old Norse": "Old Norse", "Old Icelandic": "Old Norse", "Scandinavian": "Old Norse",
    "Danish": "Danish", "Norwegian": "Norwegian", "Swedish": "Swedish",
    "Italian": "Italian", "Old Italian": "Italian", "Tuscan": "Italian",
    "Neapolitan": "Italian", "Spanish": "Spanish", "American Spanish": "Spanish",
    "Portuguese": "Portuguese",
    "Germanic": "Germanic", "Continental Germanic": "Germanic", "West Germanic": "Germanic",
    "Celtic": "Celtic", "Old Irish": "Irish", "Irish": "Irish", "Welsh": "Welsh",
    "Indo-European": None, "International Scientific Vocabulary": None,
    "Sanskrit": "Sanskrit", "Hindi": "Hindi", "Pali": "Pali", "Persian": "Persian",
    "Malay": "Malay", "Chinese": "Chinese", "Japanese": "Japanese", "Russian": "Russian",
    "Armenian": "Armenian", "Amharic": "Amharic", "Krio": "Krio", "Yoruba": "Yoruba",
    "Kongo": "Kongo", "Arabic": "Arabic", "Turkish": "Turkish", "Hebrew": "Hebrew",
    "Nahuatl": "Nahuatl", "Indo-Aryan": "Indo-Aryan", "Afrikaans": "Afrikaans",
    "Tagalog": "Tagalog", "Hawaiian": "Hawaiian",
}
ORIGIN_LANGUAGE_RE = re.compile(
    r"\b(" + "|".join(sorted(map(re.escape, ORIGIN_LANGUAGES), key=len, reverse=True)) + r")\b"
)
# Where the word's own history ends and comparisons with related words begin
ORIGIN_STOP_RE = re.compile(
    r"\bakin to\b|\bcompare\b|\bmore at\b|;|\bwhence\b|\bIndo-European\b|\bpre-Germanic\b"
    r"|\balso in\b|\bwith Latin\b|\breplacing\b|\bdialectal\b"
)
ORIGIN_HEDGE_RE = re.compile(r"\b(?:perhaps|probably)\b")


def etymology_text(entry: dict) -> str:
    return " ".join(
        block[1] for block in entry.get("et") or []
        if isinstance(block, list) and len(block) > 1 and block[0] == "text"
    )


def scripps_origin(et: str) -> str:
    """Languages named in an MW etymology, root first; "" when none are named."""
    chain = re.sub(r"\{it\}.*?\{/it\}", "", et)
    chain = re.sub(r"\{[^}]*\}", "", chain)
    chain = re.sub(r"\"[^\"]*\"|\([^)]*\)", "", chain)
    chain = ORIGIN_STOP_RE.split(chain)[0]
    hedge = ORIGIN_HEDGE_RE.search(chain)

    found = []
    for match in ORIGIN_LANGUAGE_RE.finditer(chain):
        # A guess after a definite source ("Italian ... perhaps from Old French") is left out
        if hedge and found and match.start() > hedge.start():
            break
        name = ORIGIN_LANGUAGES[match.group(1)]
        if name and name not in found:
            found.append(name)

    # Old English words are listed as Old English, not by their deeper Germanic roots
    if "Old English" in found and "Germanic" in found:
        found.remove("Germanic")
    return ", ".join(reversed(found))


def etymology_links(et: str) -> List[str]:
    """Entries an etymology points to ("see distant", "from charm"), skipping affixes."""
    chain = re.split(r"\bakin to\b|—\s*more at|;", et)[0]
    targets = []
    for match in re.finditer(r"\{(?:et_link|dxt|mat)\|([^|}]+)\|?([^|}]*)", chain):
        target = (match.group(2) or match.group(1)).strip()
        if not (target.startswith("-") or target.endswith("-")):
            targets.append(target)
    return targets


def fetch_entry(entry_id: str) -> Optional[dict]:
    headword = entry_id.split(":")[0]
    try:
        response = requests.get(f"{MW_BASE_URL}/{headword}?key={MW_API_KEY}", timeout=10)
        data = response.json() if response.status_code == 200 else []
    except Exception:
        return None
    entries = [e for e in data if isinstance(e, dict)]
    return next((e for e in entries if e.get("meta", {}).get("id") == entry_id),
                entries[0] if entries else None)


def resolve_origin(entry: dict, seen: Optional[List[str]] = None) -> str:
    """Scripps-style origin, following MW's cross-references when an entry
    only points at another word (up to four steps)."""
    seen = (seen or []) + [entry.get("meta", {}).get("id", "")]
    et = etymology_text(entry)
    origin = scripps_origin(et)
    if origin or len(seen) > 4:
        return origin
    for target in etymology_links(et):
        linked = fetch_entry(target)
        if linked and linked.get("meta", {}).get("id") not in seen:
            origin = resolve_origin(linked, seen)
            if origin:
                return origin
    return ""


def fetch_tatoeba_sentence(word: str) -> Optional[Dict[str, str]]:
    """Return a short, complete, exact-word English example from Tatoeba."""
    try:
        response = requests.get(
            TATOEBA_SENTENCES_URL,
            params={
                "lang": "eng",
                "q": word,
                "word_count": "4-20",
                "is_unapproved": "no",
                "sort": "relevance",
                "limit": 10,
            },
            timeout=15,
        )
        if response.status_code != 200:
            return None
        candidates = response.json().get("data", [])
    except Exception:
        return None

    # Search may return related forms (for example, "bushes" for "bush").
    # Retain only sentences containing the list word as an exact word or phrase.
    exact_word = re.compile(r"(?<!\w)" + re.escape(word) + r"(?!\w)", re.IGNORECASE)
    for candidate in candidates:
        sentence = candidate.get("text", "").strip()
        if exact_word.search(sentence) and re.search(r"[.!?][\"'\)\]]*$", sentence):
            author = candidate.get("owner") or "unknown contributor"
            license_name = candidate.get("license") or "license not specified"
            sentence_id = candidate.get("id")
            return {
                "sentence": sentence,
                "attribution": (
                    f"Tatoeba contributor {author}; {license_name}; "
                    f"https://tatoeba.org/en/sentences/show/{sentence_id}"
                ),
            }

    return None


# ============================================================
# Fetch a single word
# ============================================================
def fetch_word(word: str, difficulty: str = "three") -> Dict:
    result = {
        "word": word,
        "difficulty": difficulty,
        "part_of_speech": "",
        "definition": "",
        "definition_source": "",
        "sentence": "",
        "sentence_source": "",
        "sentence_attribution": "",
        "origin": "",
        "audio_url": None,
        "pronunciations": []
    }

    data = fetch_mw(word) or []

    exact_entries = []
    related_entries = []

    for entry in data:
        if not isinstance(entry, dict):
            continue

        if is_exact_entry(entry, word):
            exact_entries.append(entry)
        else:
            related_entries.append(entry)

    # Definition & POS
    meaning_entry = exact_entries[0] if exact_entries else (
        related_entries[0] if related_entries else None
    )

    if meaning_entry:
        result["part_of_speech"] = meaning_entry.get("fl", "")

        defs = meaning_entry.get("shortdef", [])
        if defs:
            result["definition"] = defs[0]
            result["definition_source"] = "merriam_webster"

        # Blank origins (compounds, place names, words MW doesn't trace) are
        # filled in by hand in the output file
        for entry in [meaning_entry] + [e for e in exact_entries if e is not meaning_entry]:
            result["origin"] = resolve_origin(entry)
            if result["origin"]:
                break

    # --------------------------------------------------------
    # Sentence priority logic
    # --------------------------------------------------------
    for entry in exact_entries:
        sentences = extract_example_sentences(entry)
        if sentences:
            result["sentence"] = sentences[0]
            result["sentence_source"] = "merriam_webster"
            result["sentence_attribution"] = "Merriam-Webster Collegiate Dictionary API"
            break

    if not result["sentence"]:
        for entry in related_entries:
            sentences = extract_example_sentences(entry)
            if sentences:
                result["sentence"] = sentences[0]
                result["sentence_source"] = "merriam_webster"
                result["sentence_attribution"] = "Merriam-Webster Collegiate Dictionary API"
                break

    # --------------------------------------------------------
    # Audio (exact entry only)
    # --------------------------------------------------------
    result["pronunciations"] = find_pronunciations(
        data, word, result["part_of_speech"], result["definition"]
    )
    result["audio_url"] = default_audio_url(result["pronunciations"])

    # Prefer a separately sourced, complete practice sentence when MW does
    # not provide one. Tatoeba attribution is retained for CC BY compliance.
    if not result["sentence"]:
        tatoeba = fetch_tatoeba_sentence(word)
        if tatoeba:
            result["sentence"] = tatoeba["sentence"]
            result["sentence_source"] = "tatoeba"
            result["sentence_attribution"] = tatoeba["attribution"]

    # A generated sentence is used only if neither source has a usable
    # complete example. Its source is explicit in the output.
    if not result["sentence"]:
        result["sentence"] = GENERATED_SENTENCES.get(
            word.casefold(), f'Practice spelling the word "{word}".'
        )
        result["sentence_source"] = "generated"
        result["sentence_attribution"] = "Generated for spelling-bee practice"

    return result


# ============================================================
# Batch fetch
# ============================================================
def fetch_words(words: List[Dict[str, str]]) -> List[Dict]:
    results = [None] * len(words)
    total = len(words)

    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {
            executor.submit(fetch_word, item["word"], item.get("difficulty", "three")): idx
            for idx, item in enumerate(words)
        }
        completed = 0
        for future in as_completed(futures):
            idx = futures[future]
            results[idx] = future.result()
            completed += 1
            print(f"[ {completed:>4} / {total} ] {words[idx]['word']}", end="\r", flush=True)

    print()
    return results


def update_pronunciations(path: str) -> None:
    """Refresh pronunciations and audio_url in an existing word file, leaving
    every other field (including hand edits) untouched. A word whose lookup
    fails keeps what it had, so the run can simply be repeated."""
    with open(path, "r", encoding="utf-8") as f:
        items = json.load(f)

    def lookup(item: Dict) -> Optional[List[Dict]]:
        data = fetch_mw(item["word"])
        if data is None:
            return None
        return find_pronunciations(data, item["word"],
                                   item.get("part_of_speech", ""), item.get("definition", ""))

    failed = []
    with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
        futures = {executor.submit(lookup, item): item for item in items}
        for completed, future in enumerate(as_completed(futures), 1):
            item = futures[future]
            pronunciations = future.result()
            if pronunciations is None:
                failed.append(item["word"])
            else:
                item["pronunciations"] = pronunciations
                item["audio_url"] = default_audio_url(pronunciations)
            print(f"[ {completed:>4} / {len(items)} ] {item['word']}", end="\r", flush=True)
    print()

    # pronunciations sits right after audio_url
    items = [
        {**{k: v for k, v in item.items() if k != "pronunciations"},
         "pronunciations": item.get("pronunciations", [])}
        for item in items
    ]
    with open(path, "w", encoding="utf-8") as f:
        json.dump(items, f, indent=2, ensure_ascii=False)
        f.write("\n")

    print(f"Updated {len(items) - len(failed)} words; {len(failed)} lookups failed"
          + (f": {', '.join(failed)}" if failed else ""))


# ============================================================
# Main
# ============================================================
def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate Merriam-Webster word data from a text or CSV word list."
    )
    parser.add_argument("--input", default=INPUT_WORD_FILE,
                        help="Text file (one word per line) or CSV with Word and Category columns.")
    parser.add_argument("--output", default=OUTPUT_WORD_FILE,
                        help="Destination JSON file.")
    parser.add_argument("--pronunciations-only", action="store_true",
                        help="Treat --input as an existing word JSON file and refresh only its "
                             "pronunciations and audio_url, in place.")
    args = parser.parse_args()

    if not MW_API_KEY:
        raise SystemExit("MW_API_KEY is not set. Run this from the 'Generate word data' "
                         "GitHub Actions workflow, or set $env:MW_API_KEY first.")

    if args.pronunciations_only:
        update_pronunciations(args.input)
        return

    if args.input.lower().endswith(".csv"):
        try:
            with open(args.input, "r", encoding="utf-8-sig", newline="") as f:
                rows = list(csv.DictReader(f))
        except UnicodeDecodeError:
            # School lists exported from Excel are commonly Windows-1252 encoded.
            with open(args.input, "r", encoding="cp1252", newline="") as f:
                rows = list(csv.DictReader(f))

        words = [
            {"word": row["Word"].strip(), "difficulty": row["Category"].strip()}
            for row in rows
            if row.get("Word", "").strip()
        ]
    else:
        with open(args.input, "r", encoding="utf-8") as f:
            words = [
                {"word": line.strip(), "difficulty": "three"}
                for line in f
                if line.strip() and not line.startswith("#")
            ]

    results = fetch_words(words)

    # Keep the established word fields and add transparent definition and
    # sentence provenance. Definitions rewritten by hand are marked "generated".
    results = [
        {key: item[key] for key in (
            "word", "difficulty", "origin", "part_of_speech", "definition",
            "definition_source", "sentence", "sentence_source", "audio_url",
            "pronunciations"
        )}
        for item in results
    ]

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    main()
