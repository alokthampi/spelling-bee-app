"""Keeps a copy of every Merriam-Webster recording the app uses in mw_audio/,
served from the app's own site.

Why: on iPad, Safari's connection to media.merriam-webster.com sometimes goes
dead (after a Wi-Fi blip) and every recording then stays silent for about two
minutes. With the copies on the app's own site, the app downloads a word's
recordings in the background as soon as the word appears (app.js "Audio
helpers"), so a tap plays from memory without touching the network.

Finds the recording links in the word lists and mw_entries/, mirrors each to
mw_audio/<letter>/<name>.mp3 (the part of the link after /mp3/), and only
downloads files it doesn't have yet. Run after new words are added; the
nightly "Fetch MW entries" workflow runs it too.

    python download_mw_audio.py
"""
import concurrent.futures
import glob
import os
import re
import sys
import time
import urllib.request

ROOT = os.path.dirname(os.path.abspath(__file__))
AUDIO_DIR = os.path.join(ROOT, "mw_audio")
URL_RE = re.compile(r"https://media\.merriam-webster\.com/audio/prons/en/us/mp3/([a-z0-9_]+/[A-Za-z0-9_\-]+\.mp3)")
# The files the app loads (app.js WORD_FILES, CLASS_WORDS_FILE, mw_entries/)
SOURCES = ["word_list_school.json", "word_list_regional.json", "2027_class_words.json", "mw_entries/*.json"]


def recording_paths():
    paths = set()
    for pattern in SOURCES:
        for file in glob.glob(os.path.join(ROOT, pattern)):
            with open(file, encoding="utf-8") as f:
                paths.update(URL_RE.findall(f.read()))
    return sorted(paths)


def download(path):
    target = os.path.join(AUDIO_DIR, *path.split("/"))
    url = f"https://media.merriam-webster.com/audio/prons/en/us/mp3/{path}"
    for attempt in range(3):
        try:
            with urllib.request.urlopen(url, timeout=20) as r:
                data = r.read()
            if not data:
                raise ValueError("empty file")
            os.makedirs(os.path.dirname(target), exist_ok=True)
            tmp = target + ".part"
            with open(tmp, "wb") as f:
                f.write(data)
            os.replace(tmp, target)
            return None
        except Exception as err:  # noqa: BLE001 - report and retry any failure
            if attempt == 2:
                return f"{path}: {err}"
            time.sleep(2 * (attempt + 1))


def main():
    paths = recording_paths()
    missing = [p for p in paths if not os.path.exists(os.path.join(AUDIO_DIR, *p.split("/")))]
    print(f"{len(paths)} recordings used, {len(missing)} to download")
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        failures = [f for f in pool.map(download, missing) if f]
    for failure in failures:
        print("Failed:", failure)
    print(f"Downloaded {len(missing) - len(failures)}, failed {len(failures)}")
    # A few failures shouldn't stop the nightly run: the app falls back to MW's link
    return 1 if missing and len(failures) == len(missing) else 0


if __name__ == "__main__":
    sys.exit(main())
