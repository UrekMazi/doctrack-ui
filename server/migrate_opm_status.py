"""Migrate legacy OPM Assistant review status to OPM Secretary review.

Run with --apply to commit updates; default is dry-run.
"""

import argparse

from sqlalchemy import text

from app import create_app
from models import db

LEGACY_STATUS = 'For OPM Assistant Review'
NEW_STATUS = 'For OPM Secretary Review'
LEGACY_ROLE_LABEL = 'OPM Assistant'
NEW_ROLE_LABEL = 'OPM Secretary'


def migrate(dry_run=True, update_history=False):
    app = create_app()
    with app.app_context():
        count = db.session.execute(
            text('SELECT COUNT(1) FROM documents WHERE status = :legacy'),
            {'legacy': LEGACY_STATUS},
        ).scalar() or 0
        history_count = db.session.execute(
            text("SELECT COUNT(1) FROM documents WHERE routing_history LIKE :pattern"),
            {'pattern': f'%{LEGACY_ROLE_LABEL}%'},
        ).scalar() or 0

        if dry_run:
            print(f"[DRY RUN] {count} document(s) still use '{LEGACY_STATUS}'.")
            if count:
                print(f"[DRY RUN] Would update to '{NEW_STATUS}'.")
            if update_history:
                print(f"[DRY RUN] {history_count} document(s) have routing history containing '{LEGACY_ROLE_LABEL}'.")
                if history_count:
                    print(f"[DRY RUN] Would update routing history to '{NEW_ROLE_LABEL}'.")
            return

        if not count:
            print('No legacy OPM Assistant review statuses found. Nothing to update.')
            return

        result = db.session.execute(
            text('UPDATE documents SET status = :new WHERE status = :legacy'),
            {'new': NEW_STATUS, 'legacy': LEGACY_STATUS},
        )

        history_result = None
        if update_history:
            history_result = db.session.execute(
                text(
                    'UPDATE documents '
                    'SET routing_history = REPLACE(routing_history, :legacy, :new) '
                    'WHERE routing_history LIKE :pattern'
                ),
                {
                    'legacy': LEGACY_ROLE_LABEL,
                    'new': NEW_ROLE_LABEL,
                    'pattern': f'%{LEGACY_ROLE_LABEL}%',
                },
            )
        db.session.commit()

        updated = result.rowcount or 0
        print(f"Updated {updated} document(s) to '{NEW_STATUS}'.")
        if update_history:
            history_updated = history_result.rowcount if history_result is not None else 0
            print(f"Updated {history_updated} document(s) routing history to '{NEW_ROLE_LABEL}'.")

        remaining = db.session.execute(
            text('SELECT COUNT(1) FROM documents WHERE status = :legacy'),
            {'legacy': LEGACY_STATUS},
        ).scalar() or 0
        remaining_history = db.session.execute(
            text("SELECT COUNT(1) FROM documents WHERE routing_history LIKE :pattern"),
            {'pattern': f'%{LEGACY_ROLE_LABEL}%'},
        ).scalar() or 0
        print(f"Remaining legacy status rows: {remaining}.")
        if update_history:
            print(f"Remaining legacy routing history rows: {remaining_history}.")


def main():
    parser = argparse.ArgumentParser(description='Migrate OPM Assistant review status to OPM Secretary review.')
    parser.add_argument('--apply', action='store_true', help='Apply updates (otherwise dry-run only).')
    parser.add_argument(
        '--update-history',
        action='store_true',
        help='Also update routing_history text from OPM Assistant to OPM Secretary.',
    )
    args = parser.parse_args()

    migrate(dry_run=not args.apply, update_history=args.update_history)


if __name__ == '__main__':
    main()
