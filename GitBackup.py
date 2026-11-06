import firebase_admin
from firebase_admin import credentials, firestore
import glob
import json
import os
from datetime import datetime, timezone

from progress_layout import (DOC_LIMIT_BYTES, PART_PREFIX, USER_ID, assemble_progress,
                             doc_size, is_progress_doc)

BACKUP_DIR = "backup_progress_2027"
WARN_AT = 0.7  # warn when any progress document passes 70% of Firestore's 1 MB limit

# The Firebase admin key is stored in the FIREBASE_SERVICE_ACCOUNT GitHub
# secret (the whole key JSON); the nightly GitHub Actions job passes it in.
key_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
if not key_json:
    raise SystemExit("FIREBASE_SERVICE_ACCOUNT is not set. This script runs from the "
                     "'Back up progress' GitHub Actions workflow, which provides it.")

# Initialize Firebase
cred = credentials.Certificate(json.loads(key_json))
firebase_admin.initialize_app(cred)

db = firestore.client()

# Fetch every progress document: the original one and its slices (see progress_layout.py)
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

# Skip the backup if nothing changed since the last one
os.makedirs(BACKUP_DIR, exist_ok=True)
previous = sorted(glob.glob(os.path.join(BACKUP_DIR, "progress_nikku_snapshot_*.json")))
if previous:
    with open(previous[-1], encoding="utf-8") as f:
        if assemble_progress(json.load(f), {}) == data:
            print("No changes since", os.path.basename(previous[-1]), "- nothing to back up")
            raise SystemExit(0)

# Windows-safe timestamp
timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")

filename = os.path.join(BACKUP_DIR, f"progress_nikku_snapshot_{timestamp}.json")

with open(filename, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print("✅ Snapshot saved:", filename)
