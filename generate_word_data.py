import requests
import json
import time
import re
import argparse
import csv
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import List, Dict, Optional

# ============================================================
# Configuration
# ============================================================
MW_API_KEY = "56791146-8d8a-4567-a528-a7c547a1e3d7"
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


def extract_audio_id(entry: dict) -> Optional[str]:
    for prs in entry.get("hwi", {}).get("prs", []):
        sound = prs.get("sound")
        if sound and sound.get("audio"):
            return sound["audio"]

    for ins in entry.get("ins", []):
        for prs in ins.get("prs", []):
            sound = prs.get("sound")
            if sound and sound.get("audio"):
                return sound["audio"]

    return None


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
def extract_and_simplify_origin(et_list) -> str:
    if not et_list:
        return ""

    texts = []
    for block in et_list:
        if isinstance(block, list) and block[0] == "text":
            text = re.sub(r"\{.*?\}", "", block[1])
            texts.append(text)

    return " ".join(texts).strip()


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
    url = f"{MW_BASE_URL}/{word}?key={MW_API_KEY}"

    result = {
        "word": word,
        "difficulty": difficulty,
        "part_of_speech": "",
        "definition": "",
        "sentence": "",
        "sentence_source": "",
        "sentence_attribution": "",
        "origin": "",
        "audio_url": None
    }

    try:
        response = requests.get(url, timeout=10)
        data = response.json() if response.status_code == 200 else []
    except Exception:
        data = []

    if not isinstance(data, list):
        data = []

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

        et = meaning_entry.get("et")
        if et:
            result["origin"] = extract_and_simplify_origin(et)

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
    if exact_entries:
        audio_id = extract_audio_id(exact_entries[0])
        if audio_id:
            result["audio_url"] = build_audio_url(audio_id)

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
    args = parser.parse_args()

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

    # Keep the established word fields and add transparent sentence provenance.
    results = [
        {key: item[key] for key in (
            "word", "difficulty", "part_of_speech", "definition", "sentence",
            "sentence_source", "sentence_attribution", "audio_url"
        )}
        for item in results
    ]

    with open(args.output, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    main()
