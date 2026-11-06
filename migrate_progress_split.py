"""One-time move of Nikku's progress from the single "progress/nikku" document
(which would pass Firestore's 1 MB limit before June 2027) into the small
per-slice documents described in progress_layout.py.

Safe to run while the new app is live, and safe to run again: slices the app
has already written are kept and win over the original document (they're
newer). Everything happens in one transaction, and the result is checked to
show exactly the same progress as before. Afterwards the original document is
deleted; a copy is kept in progress_archive/nikku_<time> and in a local file.

Runs from the "Split progress" GitHub Actions workflow, which has the keys:
    python migrate_progress_split.py --project dev --dry-run
    python migrate_progress_split.py --project prod
or locally with a key file: --key C:\\keys\\dev.json
"""
import argparse
import json
import os
import sys
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import credentials, firestore
from google.cloud.firestore_v1.field_path import FieldPath

from progress_layout import (DOC_LIMIT_BYTES, PART_PREFIX, SESSIONS_KEY, USER_ID,
                             assemble_progress, doc_size, merge_into, same, split_progress)

PROJECTS = {
    "dev": ("spelling-bee-practice-dev", "FIREBASE_SERVICE_ACCOUNT_DEV"),
    "prod": ("spelling-bee-practice-e4b0c", "FIREBASE_SERVICE_ACCOUNT"),
}
SAFE_SIZE = int(DOC_LIMIT_BYTES * 0.7)


def connect(project, key_path):
    project_id, env_name = PROJECTS[project]
    if key_path:
        with open(key_path, encoding="utf-8") as f:
            key = json.load(f)
    else:
        key_json = os.environ.get(env_name)
        if not key_json:
            raise SystemExit(f"No key: pass --key or set {env_name}.")
        key = json.loads(key_json)
    if key.get("project_id") != project_id:
        raise SystemExit(f"The key is for {key.get('project_id')!r}, expected {project_id!r}. Nothing was changed.")
    firebase_admin.initialize_app(credentials.Certificate(key))
    return firestore.client()


def combine(legacy_slice, existing):
    """The original document's slice with the app's newer writes over it."""
    if existing is None:
        return legacy_slice
    combined = merge_into(merge_into({}, legacy_slice), {k: v for k, v in existing.items() if k != SESSIONS_KEY})
    # Joined, exactly as the app shows them (old and new copies of the app
    # write different tests, so nothing is in both)
    sessions = list(legacy_slice.get(SESSIONS_KEY, [])) + list(existing.get(SESSIONS_KEY, []))
    if sessions:
        combined[SESSIONS_KEY] = sessions
    return combined


def plan(legacy, existing_parts):
    """{part: new content} to write, after checking nothing would be lost."""
    legacy_parts = split_progress(legacy)
    new_parts = dict(existing_parts)
    for part, legacy_slice in legacy_parts.items():
        new_parts[part] = combine(legacy_slice, existing_parts.get(part))

    if not same(assemble_progress(None, new_parts), assemble_progress(legacy, existing_parts)):
        raise SystemExit("Check failed: the split would not show the same progress. Nothing was changed.")
    for part, content in new_parts.items():
        size = doc_size(content, PART_PREFIX + part)
        if size > SAFE_SIZE:
            raise SystemExit(f"{part} would be {size:,} bytes, too close to the 1 MB limit. Nothing was changed.")
    return {part: content for part, content in new_parts.items()
            if not same(content, existing_parts.get(part))}


def main():
    parser = argparse.ArgumentParser(description="Split progress/nikku into per-slice documents.")
    parser.add_argument("--project", choices=PROJECTS, required=True)
    parser.add_argument("--key", help="Admin key file (else the key JSON from the environment)")
    parser.add_argument("--dry-run", action="store_true", help="Show what would change; write nothing")
    args = parser.parse_args()

    db = connect(args.project, args.key)
    progress = db.collection("progress")
    legacy_ref = progress.document(USER_ID)
    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")
    result = {}

    @firestore.transactional
    def run(transaction):
        legacy_snap = legacy_ref.get(transaction=transaction)
        if not legacy_snap.exists:
            result["status"] = "nothing"
            return
        legacy = legacy_snap.to_dict() or {}
        existing = {snap.id[len(PART_PREFIX):]: snap.to_dict() or {}
                    for snap in transaction.get(progress.order_by(FieldPath.document_id()))
                    if snap.id.startswith(PART_PREFIX)}
        writes = plan(legacy, existing)
        result.update(status="planned", legacy=legacy, existing=existing, writes=writes)
        if args.dry_run:
            return
        for part, content in writes.items():
            transaction.set(progress.document(PART_PREFIX + part), content)
        transaction.set(db.collection("progress_archive").document(f"{USER_ID}_{stamp}"),
                        {"json": json.dumps(legacy, ensure_ascii=False), "archivedAt": stamp})
        transaction.delete(legacy_ref)
        result["status"] = "done"

    run(db.transaction())

    if result["status"] == "nothing":
        print(f"No progress/{USER_ID} document in {args.project}: already split. Nothing to do.")
        return
    legacy, existing, writes = result["legacy"], result["existing"], result["writes"]
    sizes = sorted(((doc_size(c, PART_PREFIX + p), p) for p, c in {**existing, **writes}.items()), reverse=True)
    print(f"Original document: {doc_size(legacy, USER_ID):,} bytes")
    print(f"Slices already written by the app: {len(existing)} · to write: {len(writes)}")
    print("Largest slices: " + ", ".join(f"{p} {s:,} B" for s, p in sizes[:5]))

    backup = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                          f"progress_before_split_{args.project}_{stamp}.json")
    with open(backup, "w", encoding="utf-8") as f:
        json.dump({"original": legacy, "slices": existing}, f, indent=2, ensure_ascii=False)
    print(f"Saved the progress as it was to {backup}")

    if args.dry_run:
        print("Dry run: nothing was written.")
    else:
        print(f"Done: progress/{USER_ID} split into slices; original archived as "
              f"progress_archive/{USER_ID}_{stamp} and deleted.")


if __name__ == "__main__":
    sys.exit(main())
