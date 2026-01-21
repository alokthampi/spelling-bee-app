import requests
import json
import time
import re
from typing import List, Dict, Optional

# ============================================================
# Configuration
# ============================================================
MW_API_KEY = "56791146-8d8a-4567-a528-a7c547a1e3d7"
MW_BASE_URL = "https://www.dictionaryapi.com/api/v3/references/collegiate/json"
MW_AUDIO_BASE = "https://media.merriam-webster.com/audio/prons/en/us/mp3"

INPUT_WORD_FILE = "input_words.txt"
OUTPUT_WORD_FILE = "words_new.json"

REQUEST_DELAY = 0.6

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
                            if isinstance(vis, list) and len(vis) > 1:
                                text = normalize_text(vis[1])
                                if text:
                                    sentences.append(text)

    # Deduplicate while preserving order
    seen = set()
    unique = []
    for s in sentences:
        if s not in seen:
            seen.add(s)
            unique.append(s)

    return unique


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


# ============================================================
# Fetch a single word
# ============================================================
def fetch_word(word: str) -> Dict:
    url = f"{MW_BASE_URL}/{word}?key={MW_API_KEY}"

    result = {
        "word": word,
        "difficulty": "two",
        "part_of_speech": "",
        "definition": "",
        "sentence": "",
        "origin": "",
        "audio_url": None
    }

    try:
        response = requests.get(url, timeout=10)
        if response.status_code != 200:
            return result
        data = response.json()
    except Exception:
        return result

    if not isinstance(data, list):
        return result

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
            break

    if not result["sentence"]:
        for entry in related_entries:
            sentences = extract_example_sentences(entry)
            if sentences:
                result["sentence"] = sentences[0]
                break

    # --------------------------------------------------------
    # Audio (exact entry only)
    # --------------------------------------------------------
    if exact_entries:
        audio_id = extract_audio_id(exact_entries[0])
        if audio_id:
            result["audio_url"] = build_audio_url(audio_id)

    return result


# ============================================================
# Batch fetch
# ============================================================
def fetch_words(words: List[str]) -> List[Dict]:
    results = []
    total = len(words)

    for idx, word in enumerate(words, start=1):
        print(f"[ {idx:>4} / {total} ] {word}", end="\r", flush=True)
        results.append(fetch_word(word))
        time.sleep(REQUEST_DELAY)

    print()
    return results


# ============================================================
# Main
# ============================================================
def main() -> None:
    with open(INPUT_WORD_FILE, "r", encoding="utf-8") as f:
        words = [
            line.strip()
            for line in f
            if line.strip() and not line.startswith("#")
        ]

    results = fetch_words(words)

    with open(OUTPUT_WORD_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    main()
