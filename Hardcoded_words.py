import requests
import json
import time
from typing import List, Dict, Optional

# ----------------------------
# Configuration
# ----------------------------
MW_API_KEY = "56791146-8d8a-4567-a528-a7c547a1e3d7"
MW_BASE_URL = "https://www.dictionaryapi.com/api/v3/references/collegiate/json"
MW_AUDIO_BASE = "https://media.merriam-webster.com/audio/prons/en/us/mp3"

REQUEST_DELAY = 0.5  # seconds


# ----------------------------
# Helpers
# ----------------------------
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


def fetch_word(word: str) -> Dict:
    url = f"{MW_BASE_URL}/{word}?key={MW_API_KEY}"
    response = requests.get(url, timeout=10)
    response.raise_for_status()

    data = response.json()

    result = {
        "word": word,
        "definition": None,
        "audio_url": None
    }

    if not data or not isinstance(data[0], dict):
        return result

    entry = data[0]

    # Definition
    shortdefs = entry.get("shortdef", [])
    if shortdefs:
        result["definition"] = shortdefs[0]

    # Audio
    prs_list = entry.get("hwi", {}).get("prs", [])
    if prs_list:
        audio_id = prs_list[0].get("sound", {}).get("audio")
        result["audio_url"] = build_audio_url(audio_id)

    return result


def fetch_words(words: List[str]) -> List[Dict]:
    results = []

    for word in words:
        try:
            results.append(fetch_word(word))
            time.sleep(REQUEST_DELAY)
        except Exception:
            results.append({
                "word": word,
                "definition": None,
                "audio_url": None
            })

    return results


# ----------------------------
# Main (HARDCODED WORDS)
# ----------------------------
def main() -> None:
    word_list = [
        "shark","cake","maitre d"
    ]

    results = fetch_words(word_list)

    # Print JSON to console
    print(json.dumps(results, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
