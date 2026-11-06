"""How progress is spread over Firestore documents. Must match app.js
(letterPart, monthOf, assembleProgress): a Firestore document can't grow past
1 MB, so each slice of progress lives in its own document in "progress":

  nikku__regional_a        {"regional": {word: progress}}   one per scope + first letter
  nikku__sessions_2026-11  {"_practiceSessions": [...]}     one per month (test end)
  nikku__timelog_2026-11   {"_timeLog": {id: sitting}}      one per month (sitting start)
  nikku__savedtests        {"_savedPracticeTests": {...}}
  nikku__settings          {"_settings": {...}}

"nikku" itself is the original single document from before the split.
"""
import json
import re
import unicodedata

USER_ID = "nikku"
PART_PREFIX = f"{USER_ID}__"
SESSIONS_KEY = "_practiceSessions"
TIME_LOG_KEY = "_timeLog"
SAVED_TESTS_KEY = "_savedPracticeTests"
SETTINGS_KEY = "_settings"
DOC_LIMIT_BYTES = 1_048_576  # Firestore's per-document limit


def letter_part(scope, word):
    first = unicodedata.normalize("NFD", str(word))[:1].lower()
    return f"{scope}_{first if re.fullmatch('[a-z]', first) else 'other'}"


def month_of(iso):
    match = re.match(r"\d{4}-\d{2}", iso or "")
    return match.group(0) if match else "undated"


def is_progress_doc(doc_id):
    return doc_id == USER_ID or doc_id.startswith(PART_PREFIX)


def split_progress(data):
    """{part name: slice} for everything in an original-style progress doc."""
    parts = {}

    def put(part, key, value):
        slot = parts.setdefault(part, {})
        if isinstance(value, list):
            slot.setdefault(key, []).extend(value)
        else:
            slot.setdefault(key, {}).update(value)

    for key, value in (data or {}).items():
        if key == SESSIONS_KEY:
            for session in value or []:
                put(f"sessions_{month_of(session.get('at') or session.get('startedAt'))}", key, [session])
        elif key == TIME_LOG_KEY:
            for sid, sitting in (value or {}).items():
                put(f"timelog_{month_of((sitting or {}).get('startedAt'))}", key, {sid: sitting})
        elif key == SAVED_TESTS_KEY:
            put("savedtests", key, value or {})
        elif key == SETTINGS_KEY:
            put("settings", key, value or {})
        elif isinstance(value, dict):  # a scope: {word: progress}
            for word, progress in value.items():
                put(letter_part(key, word), key, {word: progress})
        else:
            raise ValueError(f"Don't know which slice field {key!r} belongs in")
    return parts


def merge_into(target, source):
    """Like Firestore's merge: maps field by field, anything else replaced."""
    for key, value in (source or {}).items():
        if isinstance(value, dict):
            if not isinstance(target.get(key), dict):
                target[key] = {}
            merge_into(target[key], value)
        else:
            target[key] = value
    return target


def assemble_progress(legacy, parts):
    """The original doc with every slice (newer) merged over it, as app.js does."""
    data, sessions = {}, []
    for source in [legacy] + [parts[name] for name in sorted(parts)]:
        source = dict(source or {})
        sessions.extend(source.pop(SESSIONS_KEY, None) or [])
        merge_into(data, source)
    sessions.sort(key=lambda s: str(s.get("at") or s.get("startedAt") or ""))
    data[SESSIONS_KEY] = sessions
    return data


def doc_size(data, doc_id="x"):
    """Firestore's stored size of a document (its documented size rules)."""
    def size(value):
        if isinstance(value, dict):
            return sum(len(k.encode()) + 1 + size(v) for k, v in value.items())
        if isinstance(value, list):
            return sum(size(v) for v in value)
        if isinstance(value, str):
            return len(value.encode()) + 1
        if isinstance(value, bool) or value is None:
            return 1
        return 8
    return size(data) + len(f"progress/{doc_id}".encode()) + 1 + 16


def same(a, b):
    return json.dumps(a, sort_keys=True) == json.dumps(b, sort_keys=True)
