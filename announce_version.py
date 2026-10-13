import firebase_admin
from firebase_admin import credentials, firestore
import json
import os
import re
from datetime import datetime, timezone

# Tells open copies of the app that a new version is live. Run by the
# "Announce new version" workflow after GitHub Pages deploys main: it writes
# the script versions (the ?v= on each <script> in index.html) to the
# Firestore doc meta/version, which every open page listens to. A page whose
# own script versions differ reloads itself (see "Auto-refresh" in app.js).

key_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT")
if not key_json:
    raise SystemExit("FIREBASE_SERVICE_ACCOUNT is not set. This script runs from the "
                     "'Announce new version' GitHub Actions workflow, which provides it.")

with open("index.html", encoding="utf-8") as f:
    html = f.read()

# Same list, in the same order, that the page builds from its own script tags
scripts = " ".join(re.findall(r'<script src="([^"]*\?v=[^"]*)"', html))
if not scripts:
    raise SystemExit("No <script src=\"...?v=...\"> tags found in index.html")

firebase_admin.initialize_app(credentials.Certificate(json.loads(key_json)))
firestore.client().collection("meta").document("version").set({
    "scripts": scripts,
    "commit": os.environ.get("DEPLOYED_SHA", ""),
    "deployedAt": datetime.now(timezone.utc).isoformat(),
})

print("✅ Announced:", scripts)
