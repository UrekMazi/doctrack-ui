"""
DocTrack EDMS — Seed initial PPA users
Run: python seed.py
"""
import bcrypt
from app import create_app
from models import db, User

INITIAL_USERS = [
    {'username': 'admin', 'full_name': 'System Administrator', 'role': 'Admin', 'division': None, 'position': 'System Admin'},
    {'username': 'pm', 'full_name': 'Mr. Rey T. Del Moro', 'role': 'PM', 'division': 'Office of the Port Manager (OPM)', 'position': 'Port Manager'},
    {'username': 'asst', 'full_name': 'Ms. Shirley', 'role': 'OPM Assistant', 'division': 'Office of the Port Manager (OPM)', 'position': 'Executive Assistant A'},
    {'username': 'ppd', 'full_name': 'Mr. Emman', 'role': 'Division', 'division': 'Port Police Division (PPD)', 'position': 'Division Manager A'},
    {'username': 'psd', 'full_name': 'Mrs. Arlyn Caraig', 'role': 'Division', 'division': 'Port Services Division (PSD)', 'position': 'Division Manager A'},
    {'username': 'adm', 'full_name': 'Mr. King John Philips T. Cagas', 'role': 'Division', 'division': 'Administrative Division', 'position': 'Division Manager A'},
    {'username': 'fin', 'full_name': 'Ms. Jazel', 'role': 'Division', 'division': 'Finance Division', 'position': 'Division Manager A'},
    {'username': 'esd', 'full_name': 'Mrs. Richel Arceo', 'role': 'Division', 'division': 'Engineering Services Division (ESD)', 'position': 'Division Manager A'},
    {'username': 'terminal', 'full_name': 'Mr. Jebs', 'role': 'Division', 'division': 'Terminal', 'position': 'Terminal Staff'},
    {'username': 'records', 'full_name': 'Ms. Irish', 'role': 'Operator', 'division': 'Administrative Division', 'position': 'Records Officer A'},
]

DEFAULT_PASSWORD = 'doctrack2026'


def seed():
    app = create_app()
    with app.app_context():
        db.create_all()
        for u in INITIAL_USERS:
            existing = User.query.filter_by(username=u['username']).first()
            if existing:
                print(f"  [skip] {u['username']} already exists")
                continue
            pw_hash = bcrypt.hashpw(DEFAULT_PASSWORD.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
            user = User(
                username=u['username'],
                password_hash=pw_hash,
                full_name=u['full_name'],
                role=u['role'],
                division=u['division'],
                position=u['position'],
            )
            db.session.add(user)
            print(f"  [added] {u['username']} — {u['full_name']} ({u['role']})")
        db.session.commit()
        print(f"\nDone. {User.query.count()} users in database.")
        print(f"Default password for all: {DEFAULT_PASSWORD}")


if __name__ == '__main__':
    seed()
