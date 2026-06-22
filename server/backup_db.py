"""Backup the SQLite database with a timestamped copy.

Usage:
  python backup_db.py
  python backup_db.py --output c:\backups\doctrack.db.bak
"""

import argparse
import os
import shutil
from datetime import datetime


def build_default_backup_path(base_dir):
    timestamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    return os.path.join(base_dir, f'doctrack.db.bak-{timestamp}.sqlite')


def backup_db(output_path=None):
    base_dir = os.path.abspath(os.path.dirname(__file__))
    db_path = os.path.join(base_dir, 'doctrack.db')

    if not os.path.exists(db_path):
        raise FileNotFoundError(f'Database not found at {db_path}')

    target_path = output_path or build_default_backup_path(base_dir)
    target_dir = os.path.dirname(target_path) or base_dir
    os.makedirs(target_dir, exist_ok=True)

    shutil.copy2(db_path, target_path)
    return target_path


def main():
    parser = argparse.ArgumentParser(description='Backup the DocTrack SQLite database.')
    parser.add_argument('--output', help='Full path for the backup copy.')
    args = parser.parse_args()

    backup_path = backup_db(output_path=args.output)
    print(f'Backup created: {backup_path}')


if __name__ == '__main__':
    main()
