"""Report legacy OPM Assistant status/history rows to CSV.

Usage:
  python report_legacy_opm.py
  python report_legacy_opm.py --output c:\backups\legacy_opm_report.csv
"""

import argparse
import csv
import os
from datetime import datetime

from sqlalchemy import text

from app import create_app
from models import db

LEGACY_STATUS = 'For OPM Assistant Review'
LEGACY_ROLE_LABEL = 'OPM Assistant'


def build_default_output(base_dir):
    timestamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    return os.path.join(base_dir, f'legacy_opm_report-{timestamp}.csv')


def report(output_path=None):
    app = create_app()
    with app.app_context():
        rows = db.session.execute(
            text(
                'SELECT id, tracking_number, status, routing_history '
                'FROM documents '
                'WHERE status = :legacy OR routing_history LIKE :pattern'
            ),
            {
                'legacy': LEGACY_STATUS,
                'pattern': f'%{LEGACY_ROLE_LABEL}%',
            },
        ).fetchall()

        target_path = output_path or build_default_output(os.path.abspath(os.path.dirname(__file__)))
        target_dir = os.path.dirname(target_path) or os.path.abspath(os.path.dirname(__file__))
        os.makedirs(target_dir, exist_ok=True)

        with open(target_path, 'w', newline='', encoding='utf-8') as handle:
            writer = csv.writer(handle)
            writer.writerow([
                'id',
                'tracking_number',
                'status',
                'legacy_status',
                'legacy_history',
            ])
            for row in rows:
                status = row[2] or ''
                history = row[3] or ''
                writer.writerow([
                    row[0],
                    row[1],
                    status,
                    'yes' if status == LEGACY_STATUS else 'no',
                    'yes' if LEGACY_ROLE_LABEL in history else 'no',
                ])

        print(f'Report written: {target_path}')
        print(f'Rows: {len(rows)}')


def main():
    parser = argparse.ArgumentParser(description='Report legacy OPM Assistant status/history rows to CSV.')
    parser.add_argument('--output', help='Full path for the CSV output file.')
    args = parser.parse_args()

    report(output_path=args.output)


if __name__ == '__main__':
    main()
