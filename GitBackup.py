import firebase_admin
from firebase_admin import credentials, firestore
import json
from datetime import datetime, timezone

# Initialize Firebase
cred = credentials.Certificate("serviceAccountKey.json")
firebase_admin.initialize_app(cred)

db = firestore.client()

# Fetch data
doc = db.collection("progress").document("nikku").get()
data = doc.to_dict()

# Windows-safe timestamp
timestamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")

filename = f"progress_nikku_snapshot_{timestamp}.json"

with open(filename, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2, ensure_ascii=False)

print("✅ Snapshot saved:", filename)
