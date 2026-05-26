"""Move legacy stamped PDFs into the storage root and remove non-stamped files.

- Sources: per-document folders (tracking.subject or tracking)
- Destination: storage root with filename tracking.subject.pdf

Run with --dry-run to preview changes.
"""
import argparse
import json
import os

from app import create_app
from models import Document
from routes.documents import build_document_folder_name, get_storage_root_candidates, LEGACY_STORAGE_ROOT


def _unique_paths(paths):
    seen = set()
    unique = []
    for path in paths:
        normalized = os.path.normcase(os.path.normpath(path))
        if normalized in seen:
            continue
        seen.add(normalized)
        unique.append(path)
    return unique


def _source_candidates(root, tracking_number, target_base):
    return [
        os.path.join(root, target_base, f"{tracking_number}.pdf"),
        os.path.join(root, tracking_number, f"{tracking_number}.pdf"),
    ]


def _legacy_folder_candidates(root, tracking_number, target_base):
    return _unique_paths([
        os.path.join(root, target_base),
        os.path.join(root, tracking_number),
    ])


def _remove_non_stamped_files(folder_paths, dry_run=False):
    removed_files = 0
    removed_dirs = 0

    for folder_path in folder_paths:
        if not os.path.isdir(folder_path):
            continue

        for name in os.listdir(folder_path):
            candidate = os.path.join(folder_path, name)
            if not os.path.isfile(candidate):
                continue
            if dry_run:
                print(f"[DRY RUN] delete {candidate}")
            else:
                try:
                    os.remove(candidate)
                except OSError:
                    continue
            removed_files += 1

        if not os.listdir(folder_path):
            if dry_run:
                print(f"[DRY RUN] rmdir {folder_path}")
            else:
                _try_remove_empty_dir(folder_path)
            removed_dirs += 1

    return removed_files, removed_dirs


def _prune_attachment_metadata(doc, dry_run=False):
    try:
        extra_data = json.loads(doc.extra_data) if doc.extra_data else {}
    except Exception:
        return False, 0

    attachments = extra_data.get('attachments')
    if not isinstance(attachments, list):
        return False, 0

    filtered = [att for att in attachments if isinstance(att, dict) and att.get('kind') == 'stamped-pdf']
    new_count = len(filtered)
    new_has = new_count > 0

    changed = False
    removed_count = len(attachments) - new_count
    if filtered != attachments:
        changed = True
    if extra_data.get('attachmentCount') != new_count:
        changed = True
    if extra_data.get('hasAttachments') != new_has:
        changed = True

    if not changed:
        return False, 0

    if dry_run:
        print(f"[DRY RUN] prune attachments for {doc.tracking_number}: {len(attachments)} -> {new_count}")
        return True, removed_count

    extra_data['attachments'] = filtered
    extra_data['attachmentCount'] = new_count
    extra_data['hasAttachments'] = new_has
    doc.extra_data = json.dumps(extra_data)
    return True, removed_count


def _try_remove_empty_dir(path):
    try:
        if os.path.isdir(path) and not os.listdir(path):
            os.rmdir(path)
    except OSError:
        pass


def main():
    parser = argparse.ArgumentParser(description="Migrate stamped PDFs into the storage root.")
    parser.add_argument("--storage-folder", default="", help="Override DOCTRACK_STORAGE_FOLDER.")
    parser.add_argument("--dry-run", action="store_true", help="Only print planned moves.")
    parser.add_argument("--keep-non-stamped", action="store_true", help="Keep legacy non-stamped files.")
    parser.add_argument("--keep-metadata", action="store_true", help="Keep legacy attachment metadata.")
    args = parser.parse_args()

    app = create_app()
    with app.app_context():
        storage_folder = args.storage_folder.strip() or None
        roots = [c["storage_root"] for c in get_storage_root_candidates(storage_folder)]
        roots.append(LEGACY_STORAGE_ROOT)
        roots = _unique_paths(roots)

        documents = Document.query.all()
        moved = 0
        skipped = 0
        missing = 0
        removed_files = 0
        removed_dirs = 0
        pruned_docs = 0
        pruned_attachments = 0

        for doc in documents:
            tracking = str(doc.tracking_number or "").strip()
            if not tracking:
                continue

            target_base = build_document_folder_name(tracking, doc.subject)
            if not target_base:
                target_base = tracking
            destination_name = f"{target_base}.pdf"

            migrated = False
            for root in roots:
                destination_path = os.path.join(root, destination_name)
                if os.path.isfile(destination_path):
                    skipped += 1
                    migrated = True
                    break

                for source_path in _source_candidates(root, tracking, target_base):
                    if not os.path.isfile(source_path):
                        continue
                    if args.dry_run:
                        print(f"[DRY RUN] {source_path} -> {destination_path}")
                    else:
                        os.makedirs(root, exist_ok=True)
                        os.replace(source_path, destination_path)
                        _try_remove_empty_dir(os.path.dirname(source_path))
                    moved += 1
                    migrated = True
                    break

                if migrated:
                    break

            if migrated and not args.keep_non_stamped:
                for root in roots:
                    folders = _legacy_folder_candidates(root, tracking, target_base)
                    removed, removed_folder_count = _remove_non_stamped_files(folders, args.dry_run)
                    removed_files += removed
                    removed_dirs += removed_folder_count

            if migrated and not args.keep_metadata:
                changed, removed_count = _prune_attachment_metadata(doc, args.dry_run)
                if changed:
                    pruned_docs += 1
                    pruned_attachments += removed_count

            if not migrated:
                missing += 1

        if not args.dry_run and pruned_docs:
            db.session.commit()

        print("Migration complete.")
        print(f"Moved: {moved}")
        print(f"Already present: {skipped}")
        print(f"Missing: {missing}")
        if not args.keep_non_stamped:
            print(f"Deleted files: {removed_files}")
            print(f"Removed folders: {removed_dirs}")
        if not args.keep_metadata:
            print(f"Pruned documents: {pruned_docs}")
            print(f"Pruned attachments: {pruned_attachments}")


if __name__ == "__main__":
    main()
