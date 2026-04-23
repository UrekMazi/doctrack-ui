"""Normalize active user positions to official catalog titles.

Usage:
  python reconcile_legacy_positions.py --dry-run
  python reconcile_legacy_positions.py --apply
"""

import argparse
import os

from flask import Flask

from models import User, db
from position_catalog import DIVISION_POSITION_CATALOG, OPM_DIVISION


GENERIC_ALIASES = {
    'Division Head': 'Division Manager A',
}

LEGACY_POSITION_ALIASES = {
    OPM_DIVISION: {
        'OPM Executive Assistant': 'Executive Assistant A',
        'EA (Exec. Asst. A)': 'Executive Assistant A',
        'BDMS (Business Dev./Mktg. Specialist)': 'Business Devt./Mktg. Specialist',
        'PPDO A (Proj. Planning & Devt. Officer A)': 'Project Planning & Devt. Officer A',
        'BDMO (Business Devt./Mktg. Officer A)': 'Business Devt./Mktg. Officer A',
        'ESC (Exec. Sec. C)': 'Executive Secretary C',
    },
}


def create_maintenance_app():
    app = Flask(__name__)
    base_dir = os.path.abspath(os.path.dirname(__file__))
    app.config['SQLALCHEMY_DATABASE_URI'] = f"sqlite:///{os.path.join(base_dir, 'doctrack.db')}"
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app)
    return app


def normalize_text(value):
    return str(value or '').strip()


def resolve_alias(division, legacy_position):
    division_aliases = LEGACY_POSITION_ALIASES.get(division, {})
    return division_aliases.get(legacy_position) or GENERIC_ALIASES.get(legacy_position) or ''


def reconcile_positions(apply_changes=False):
    app = create_maintenance_app()

    with app.app_context():
        catalog = {division: set(positions) for division, positions in DIVISION_POSITION_CATALOG.items()}

        users = User.query.filter_by(is_active=True).order_by(User.id.asc()).all()
        mapped = 0
        deactivated = 0
        unchanged = 0
        skipped = 0

        for user in users:
            division = normalize_text(user.division)
            position = normalize_text(user.position)

            if not division or not position:
                skipped += 1
                continue

            official_positions = catalog.get(division)
            if not official_positions:
                skipped += 1
                continue

            if position in official_positions:
                unchanged += 1
                continue

            alias = resolve_alias(division, position)
            if alias and alias in official_positions:
                if apply_changes:
                    user.position = alias
                mapped += 1
                print(f"[map] {user.username}: {division} / {position} -> {alias}")
                continue

            if apply_changes:
                user.is_active = False
            deactivated += 1
            print(f"[deactivate] {user.username}: {division} / {position} (no official match)")

        if apply_changes:
            db.session.commit()

        mode = 'APPLY' if apply_changes else 'DRY-RUN'
        print(
            f"\n{mode} summary -> mapped: {mapped}, deactivated: {deactivated}, "
            f"unchanged: {unchanged}, skipped: {skipped}"
        )


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Normalize legacy user positions to official catalog titles.')
    parser.add_argument('--apply', action='store_true', help='Apply changes to database')
    parser.add_argument('--dry-run', action='store_true', help='Show planned changes only')
    args = parser.parse_args()

    apply_flag = args.apply and not args.dry_run
    reconcile_positions(apply_changes=apply_flag)
