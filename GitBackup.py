import firebase_admin
from firebase_admin import credentials, firestore
import glob
import json
import os
from datetime import datetime, timezone

BACKUP_DIR = "backup_progress_2027"

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

# Fetch data
doc = db.collection("progress").document("nikku").get()
data = doc.to_dict() or {}

# Skip the backup if nothing changed since the last one
os.makedirs(BACKUP_DIR, exist_ok=True)
previous = sorted(glob.glob(os.path.join(BACKUP_DIR, "progress_nikku_snapshot_*.json")))
if previous:
    with open(previous[-1], encoding="utf-8") as f:
        if json.load(f) == data:
            print("No changes since", os.path.basename(previous[-1]), "- nothing to back up")
            raise SystemExit(0)

# Windows-safe timestamp
timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")

filename = os.path.join(BACKUP_DIR, f"progress_nikku_snapshot_{timestamp}.json")

with open(filename, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print("✅ Snapshot saved:", filename)
