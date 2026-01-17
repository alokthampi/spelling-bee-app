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

REQUEST_DELAY = 0.6  # seconds (safe for MW rate limits)

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


def is_exact_match(entry: dict, word: str) -> bool:
    """
    STRICT matching used ONLY for audio eligibility
    """
    meta_id = entry.get("meta", {}).get("id", "")
    if not meta_id:
        return False

    headword = meta_id.split(":")[0]
    return headword.lower() == word.lower()


def extract_audio_id(entry: dict) -> Optional[str]:
    """
    Robust Merriam-Webster audio extraction.
    Handles words like 'acclaim' where audio exists only under inflections.
    """

    # 1️⃣ Primary pronunciations
    for prs in entry.get("hwi", {}).get("prs", []):
        sound = prs.get("sound")
        if sound and sound.get("audio"):
            return sound["audio"]

    # 2️⃣ Inflected forms
    for ins in entry.get("ins", []):
        for prs in ins.get("prs", []):
            sound = prs.get("sound")
            if sound and sound.get("audio"):
                return sound["audio"]

    return None


def load_words_from_file(path: str) -> List[str]:
    with open(path, "r", encoding="utf-8") as f:
        return [
            line.strip()
            for line in f
            if line.strip() and not line.strip().startswith("#")
        ]


def generate_sentence(word: str, pos: str) -> str:
    w = word.lower()

    if pos.startswith("noun"):
        return f"The {w} was easy to understand."
    elif pos.startswith("verb"):
        return f"They will {w} during the game."
    elif pos.startswith("adjective"):
        return f"It was a very {w} day."
    elif pos.startswith("adverb"):
        return f"She spoke {w}."
    else:
        return f"The word {w} is important to learn."


# ============================================================
# Origin normalization (OFFICIAL SCRIPPS CATEGORIES)
# ============================================================
def simplify_origin_from_text(text: str) -> List[str]:
    t = text.lower()
    origins = []

    # Classical
    if "greek" in t:
        origins.append("Greek")
    if "latin" in t:
        origins.append("Latin")

    # Romance
    if "romance" in t:
        origins.append("Romance Languages")
    if "french" in t:
        origins.append("French")
    if "italian" in t:
        origins.append("Italian")
    if "spanish" in t:
        origins.append("Spanish")

    # Germanic
    if "germanic" in t:
        origins.append("Germanic Languages")
    if "german" in t:
        origins.append("German")
    if "dutch" in t or "afrikaans" in t:
        origins.append("Dutch/Afrikaans")
    if any(x in t for x in ["scandinavian", "swedish", "norwegian", "danish", "icelandic"]):
        origins.append("Scandinavian Languages")

    # East Asia & Pacific
    if "japanese" in t:
        origins.append("Japanese")
    if any(x in t for x in ["chinese", "korean"]):
        origins.append("Other East Asian Languages")
    if any(x in t for x in ["austronesian", "malay", "indonesian", "tagalog"]):
        origins.append("Austronesian Languages")
    if "pacific" in t:
        origins.append("Languages of East Asia and the Pacific")

    # South Asia
    if "sanskrit" in t:
        origins.append("Sanskrit")
    if any(x in t for x in ["hindi", "urdu", "tamil", "telugu", "bengali"]):
        origins.append("Other South Asian Languages")
    if "indic" in t or "south asia" in t:
        origins.append("Languages of South Asia")

    # Middle East
    if "hebrew" in t:
        origins.append("Hebrew")
    if "arabic" in t:
        origins.append("Arabic")
    if "persian" in t or "farsi" in t:
        origins.append("Persian")
    if "turkish" in t:
        origins.append("Turkish")
    if "semitic" in t:
        origins.append("Languages of the Middle East")

    # Other families
    if "african" in t:
        origins.append("Languages of Africa")
    if "native american" in t or "american indian" in t:
        origins.append("Languages of the Americas")
    if "slavic" in t or "eastern europe" in t:
        origins.append("Languages of Eastern Europe")

    # Other origins
    if "trademark" in t:
        origins.append("Trademarks")
    if "imitative" in t or "onomatopoeia" in t:
        origins.append("Imitative Words")
    if "from the name of" in t or "place name" in t:
        origins.append("Words from People or Places")

    return list(dict.fromkeys(origins))


def extract_and_simplify_origin(et_list) -> str:
    if not et_list:
        return ""

    texts = []
    for block in et_list:
        if isinstance(block, list) and block[0] == "text":
            text = re.sub(r"\{.*?\}", "", block[1])
            texts.append(text)

    full_text = " ".join(texts)
    origins = simplify_origin_from_text(full_text)

    return " + ".join(origins)


# ============================================================
# Merriam-Webster Fetch
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

        if response.status_code != 200 or not response.text.strip():
            result["sentence"] = generate_sentence(word, "")
            return result

        data = response.json()

    except Exception:
        result["sentence"] = generate_sentence(word, "")
        return result

    if not isinstance(data, list):
        result["sentence"] = generate_sentence(word, "")
        return result

    exact_entry = None
    fallback_entry = None

    for entry in data:
        if not isinstance(entry, dict):
            continue

        if is_exact_match(entry, word):
            exact_entry = entry

        if fallback_entry is None and entry.get("shortdef"):
            fallback_entry = entry

    meaning_entry = exact_entry or fallback_entry

    if meaning_entry:
        pos = meaning_entry.get("fl", "")
        result["part_of_speech"] = pos

        defs = meaning_entry.get("shortdef", [])
        if defs:
            result["definition"] = defs[0]

        et = meaning_entry.get("et")
        if et:
            result["origin"] = extract_and_simplify_origin(et)

        result["sentence"] = generate_sentence(word, pos)
    else:
        result["sentence"] = generate_sentence(word, "")

    # 🔊 Audio — STRICT exact match ONLY
    if exact_entry:
        audio_id = extract_audio_id(exact_entry)
        if audio_id:
            result["audio_url"] = build_audio_url(audio_id)

    return result


def fetch_words(words: List[str]) -> List[Dict]:
    results = []
    total = len(words)

    for idx, word in enumerate(words, start=1):
        # Progress display (low overhead)
        print(f"[ {idx:>4} / {total} ] Processing: {word}", end="\r", flush=True)

        results.append(fetch_word(word))
        time.sleep(REQUEST_DELAY)

    # Move to next line after completion
    print()

    return results


# ============================================================
# Main
# ============================================================
def main() -> None:
    words = load_words_from_file(INPUT_WORD_FILE)
    results = fetch_words(words)

    with open(OUTPUT_WORD_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    main()
