"""Copy every Firestore document from the prod project to the dev project, so
dev matches prod exactly (dev documents that prod doesn't have are deleted).

Prod is only read, never written. Before anything in dev changes, dev's
current contents are saved to dev_backup_<time>.json next to this script.

Needs an admin key for each project (Firebase console > Project settings >
Service accounts > Generate new private key). Never commit them. Either:
  - pass the key files:
      python sync_prod_to_dev.py --prod-key C:\\keys\\prod.json --dev-key C:\\keys\\dev.json
  - or set the whole key JSON in FIREBASE_SERVICE_ACCOUNT (prod) and
    FIREBASE_SERVICE_ACCOUNT_DEV (dev), as the GitHub Actions workflows do.
Add --dry-run to see what would change without writing anything.
"""
import argparse
import json
import os
from datetime import datetime, timezone

import firebase_admin
from firebase_admin import credentials, firestore

PROD_PROJECT = "spelling-bee-practice-e4b0c"
DEV_PROJECT = "spelling-bee-practice-dev"


def load_key(path, env_name):
    if path:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    key_json = os.environ.get(env_name)
    if not key_json:
        raise SystemExit(f"No key for {env_name}: pass it as a file or set {env_name}.")
    return json.loads(key_json)


def connect(key, expected_project, name):
    if key.get("project_id") != expected_project:
        raise SystemExit(f"The {name} key is for project {key.get('project_id')!r}, "
                         f"expected {expected_project!r}. Nothing was changed.")
    app = firebase_admin.initialize_app(credentials.Certificate(key), name=name)
    return firestore.client(app)


def read_all(db):
    """{"collection/doc[/sub/doc...]": data} for every document, subcollections included."""
    docs = {}

    def walk(collection):
        for snap in collection.stream():
            docs[snap.reference.path] = snap.to_dict() or {}
            for sub in snap.reference.collections():
                walk(sub)

    for collection in db.collections():
        walk(collection)
    return docs


def to_json(value):
    """Firestore values (timestamps, references) as something json can write."""
    if isinstance(value, dict):
        return {k: to_json(v) for k, v in value.items()}
    if isinstance(value, list):
        return [to_json(v) for v in value]
    if isinstance(value, datetime):
        return value.isoformat()
    if hasattr(value, "path") and not isinstance(value, str):
        return value.path
    return value


def main():
    parser = argparse.ArgumentParser(description="Make the dev Firestore an exact copy of prod.")
    parser.add_argument("--prod-key", help="Prod admin key file (else FIREBASE_SERVICE_ACCOUNT)")
    parser.add_argument("--dev-key", help="Dev admin key file (else FIREBASE_SERVICE_ACCOUNT_DEV)")
    parser.add_argument("--dry-run", action="store_true", help="Show what would change; write nothing")
    args = parser.parse_args()

    prod = connect(load_key(args.prod_key, "FIREBASE_SERVICE_ACCOUNT"), PROD_PROJECT, "prod")
    dev = connect(load_key(args.dev_key, "FIREBASE_SERVICE_ACCOUNT_DEV"), DEV_PROJECT, "dev")

    prod_docs = read_all(prod)
    dev_docs = read_all(dev)
    to_write = [path for path in prod_docs if prod_docs[path] != dev_docs.get(path)]
    to_delete = [path for path in dev_docs if path not in prod_docs]

    print(f"Prod: {len(prod_docs)} documents · Dev: {len(dev_docs)} documents")
    for path in to_write:
        print(f"  {'update' if path in dev_docs else 'add'}: {path}")
    for path in to_delete:
        print(f"  delete from dev: {path}")
    if not to_write and not to_delete:
        print("Dev already matches prod. Nothing to do.")
        return
    if args.dry_run:
        print("Dry run: nothing was written.")
        return

    stamp = datetime.now(timezone.utc).strftime("%Y-%m-%d_%H-%M-%S")
    backup = os.path.join(os.path.dirname(os.path.abspath(__file__)), f"dev_backup_{stamp}.json")
    with open(backup, "w", encoding="utf-8") as f:
        json.dump(to_json(dev_docs), f, indent=2, ensure_ascii=False)
    print(f"Saved dev's previous contents to {backup}")

    # set() replaces each document whole, so dev ends up identical to prod
    batch, pending = dev.batch(), 0
    for path in to_write:
        batch.set(dev.document(path), prod_docs[path])
        pending += 1
        if pending == 400:  # Firestore allows 500 writes per batch
            batch.commit()
            batch, pending = dev.batch(), 0
    for path in to_delete:
        batch.delete(dev.document(path))
        pending += 1
        if pending == 400:
            batch.commit()
            batch, pending = dev.batch(), 0
    if pending:
        batch.commit()
    print(f"Done: {len(to_write)} written, {len(to_delete)} deleted. Dev now matches prod.")


if __name__ == "__main__":
    main()
