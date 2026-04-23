"""Bootstrap position-based user accounts from the canonical division catalog.

Run: python seed_positions.py
"""
import os
import re
import bcrypt  # pyright: ignore[reportMissingImports]
from flask import Flask
from models import db, User
from position_catalog import DIVISION_POSITION_CATALOG, OPM_DIVISION

DEFAULT_PASSWORD = 'doctrack2026'

DIVISION_CODE = {
    'Office of the Port Manager (OPM)': 'opm',
    'Administrative Division': 'adm',
    'Finance Division': 'fin',
    'Engineering Services Division (ESD)': 'esd',
    'Port Services Division (PSD)': 'psd',
    'Port Police Division (PPD)': 'ppd',
    'Terminal': 'ter',
    'Records Section': 'rec',
}


def normalize_slug(text):
    cleaned = re.sub(r'[^a-z0-9]+', '_', text.lower()).strip('_')
    return cleaned or 'user'


def build_username(division, position, used_usernames):
    base_div = DIVISION_CODE.get(division, 'usr')
    base_pos = normalize_slug(position)[:12]
    candidate = f'{base_div}_{base_pos}'[:24]

    if candidate not in used_usernames:
        return candidate

    index = 2
    while True:
        suffix = f'_{index}'
        next_candidate = f"{candidate[:24-len(suffix)]}{suffix}"
        if next_candidate not in used_usernames:
            return next_candidate
        index += 1


def resolve_role(division, position):
    if position == 'Port Manager':
        return 'PM'
    if division == OPM_DIVISION:
        return 'OPM Assistant'
    if division == 'Records Section':
        return 'Operator'
    return 'Division'


def create_seed_app():
    app = Flask(__name__)
    base_dir = os.path.abspath(os.path.dirname(__file__))
    app.config['SQLALCHEMY_DATABASE_URI'] = f"sqlite:///{os.path.join(base_dir, 'doctrack.db')}"
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    db.init_app(app)
    return app


def bootstrap_position_accounts():
    app = create_seed_app()

    with app.app_context():
        db.create_all()

        existing_users = User.query.all()
        used_usernames = {u.username for u in existing_users}
        existing_pairs = {
            (str(u.division or '').strip(), str(u.position or '').strip()): u
            for u in existing_users
        }

        password_hash = bcrypt.hashpw(DEFAULT_PASSWORD.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        added = 0
        skipped = 0

        for division, positions in DIVISION_POSITION_CATALOG.items():
            for position in positions:
                key = (division.strip(), position.strip())
                if key in existing_pairs:
                    skipped += 1
                    continue

                username = build_username(division, position, used_usernames)
                used_usernames.add(username)

                user = User(
                    username=username,
                    password_hash=password_hash,
                    full_name=f'{position} ({division})',
                    role=resolve_role(division, position),
                    division=division,
                    position=position,
                )
                db.session.add(user)
                existing_pairs[key] = user
                added += 1
                print(f'[added] {username} -> {division} / {position}')

        db.session.commit()
        print(f'\nDone. Added: {added}, skipped existing: {skipped}, total users: {User.query.count()}')
        print(f'Default password for generated users: {DEFAULT_PASSWORD}')


if __name__ == '__main__':
    bootstrap_position_accounts()
