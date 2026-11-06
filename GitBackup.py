import firebase_admin
from firebase_admin import credentials, firestore
import glob
import json
import os
from datetime import datetime, timedelta, timezone

from progress_layout import (DOC_LIMIT_BYTES, PART_PREFIX, USER_ID, assemble_progress,
                             doc_size, is_progress_doc)

BACKUP_DIR = "backup_progress_2027"
SNAPSHOT_PATTERN = "progress_nikku_snapshot_*.json"
KEEP_DAYS = 7  # older snapshots are deleted (they stay in git history)
WARN_AT = 0.7  # warn when any progress document passes 70% of Firestore's 1 MB limit


def snapshot_time(path):
    """The UTC time in a snapshot's name, e.g. ..._2026-11-06_12-21-12.json"""
    stamp = os.path.basename(path)[len("progress_nikku_snapshot_"):-len(".json")]
    return datetime.strptime(stamp, "%Y-%m-%d_%H-%M-%S").replace(tzinfo=timezone.utc)


def prune_old_snapshots(backup_dir=BACKUP_DIR, keep_days=KEEP_DAYS, now=None):
    """Delete snapshots older than `keep_days`. The newest one is always kept, so
    a quiet stretch (no changes, so no new snapshots) never leaves none."""
    cutoff = (now or datetime.now(timezone.utc)) - timedelta(days=keep_days)
    snapshots = sorted(glob.glob(os.path.join(backup_dir, SNAPSHOT_PATTERN)))
    removed = []
    for path in snapshots[:-1]:
        try:
            old = snapshot_time(path) < cutoff
        except ValueError:
            continue  # not a name this script wrote: leave it alone
        if old:
            os.remove(path)
            removed.append(os.path.basename(path))
    print(f"Kept {len(snapshots) - len(removed)} snapshot(s) from the last {keep_days} days; "
          f"removed {len(removed)} older" + (": " + ", ".join(removed) if removed else ""))
    return removed


def main():
    # The Firebase admin key is stored in the FIREBASE_SERVICE_ACCOUNT GitHub
    # secret (the whole key JSON); the nightly GitHub Actions job passes it in.
    key_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
    if not key_json:
        raise SystemExit("FIREBASE_SERVICE_ACCOUNT is not set. This script runs from the "
                         "'Back up progress' GitHub Actions workflow, which provides it.")

    firebase_admin.initialize_app(credentials.Certificate(json.loads(key_json)))
    db = firestore.client()

    # Every progress document: the original one and its slices (see progress_layout.py)
    docs = {snap.id: snap.to_dict() or {}
            for snap in db.collection("progress").stream() if is_progress_doc(snap.id)}
    parts = {doc_id[len(PART_PREFIX):]: d for doc_id, d in docs.items() if doc_id != USER_ID}

    # Saved merged, in the same shape as the snapshots from before the split.
    # split_progress() in progress_layout.py turns one back into documents.
    data = assemble_progress(docs.get(USER_ID), parts)

    # Early warning, long before saves start failing
    for doc_id, d in sorted(docs.items()):
        size = doc_size(d, doc_id)
        if size > DOC_LIMIT_BYTES * WARN_AT:
            # ::warning:: shows up on the workflow run's summary page
            print(f"::warning::progress/{doc_id} is {size:,} bytes "
                  f"({size / DOC_LIMIT_BYTES:.0%} of Firestore's 1 MB limit). Split it further.")
    largest = max(((doc_size(d, i), i) for i, d in docs.items()), default=(0, "-"))
    print(f"{len(docs)} progress documents · largest: progress/{largest[1]} at {largest[0]:,} bytes "
          f"({largest[0] / DOC_LIMIT_BYTES:.0%} of 1 MB)")

    # A new snapshot only if something changed since the last one
    os.makedirs(BACKUP_DIR, exist_ok=True)
    previous = sorted(glob.glob(os.path.join(BACKUP_DIR, SNAPSHOT_PATTERN)))
    unchanged = False
    if previous:
        with open(previous[-1], encoding="utf-8") as f:
            unchanged = assemble_progress(json.load(f), {}) == data
    if unchanged:
        print("No changes since", os.path.basename(previous[-1]), "- no new snapshot")
    else:
        timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")  # Windows-safe
        filename = os.path.join(BACKUP_DIR, f"progress_nikku_snapshot_{timestamp}.json")
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        print("✅ Snapshot saved:", filename)

    # Only the last week is kept
    prune_old_snapshots()


if __name__ == "__main__":
    main()
