import os
import sys
import glob

DRY_RUN = '--dry-run' in sys.argv

# Complete replacement map — ordered from most-specific to least-specific
# to prevent partial matches from interfering with longer patterns.
replacements = {
    # --- User-facing labels (toast messages, error strings) ---
    "Control/Tracking number is required before registration.": "Control/Reference number is required before registration.",
    "Control/Tracking number already exists. Generate a new number and retry.": "Control/Reference number already exists. Generate a new number and retry.",
    "Unable to generate control/tracking number.": "Unable to generate control/reference number.",
    "Daily control/tracking number limit reached (100). Counter resets at 12:00 AM.": "Daily control/reference number limit reached (100). Counter resets at 12:00 AM.",

    # --- Display labels ---
    "Control/Tracking Number": "Control/Reference Number",
    "Control/Tracking #": "Control/Reference #",
    "CONTROL / TRACKING #": "CONTROL / REFERENCE #",
    "control/tracking #": "control/reference #",
    "control/tracking number": "control/reference number",

    # --- Reports table headers ---
    "DATE/CONTROL NO.": "DATE/CONTROL-REF NO.",
    "DATE / CONTROL NO.": "DATE / CONTROL-REF NO.",

    # --- Sidebar footer ---
    "PPA - Records Process Flow v2.0": "PPA-PMO-NOB Records Flow",

    # --- Branding (if present) ---
    "PPA Records Process Flow": "PMO-Negros Occidental/Bacolod/Banago Records Process Flow",
}

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    new_content = content
    changes = []

    for old, new in replacements.items():
        if old in new_content:
            count = new_content.count(old)
            new_content = new_content.replace(old, new)
            changes.append(f"  '{old}' → '{new}' ({count}x)")

    if changes:
        rel_path = os.path.relpath(filepath, base_dir)
        if DRY_RUN:
            print(f"[DRY RUN] Would update: {rel_path}")
        else:
            with open(filepath, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Updated: {rel_path}")
        for c in changes:
            print(c)


if __name__ == "__main__":
    base_dir = r"c:\doctrack-ui"

    # Scan frontend: src/**/*.jsx and src/**/*.js
    src_dir = os.path.join(base_dir, 'src')
    patterns = [
        os.path.join(src_dir, '**', '*.jsx'),
        os.path.join(src_dir, '**', '*.js'),
    ]

    # Scan backend: server/**/*.py
    server_dir = os.path.join(base_dir, 'server')
    patterns.append(os.path.join(server_dir, '**', '*.py'))

    if DRY_RUN:
        print("=== DRY RUN MODE — no files will be modified ===\n")

    total_updated = 0
    for pattern in patterns:
        for filepath in glob.glob(pattern, recursive=True):
            # Skip __pycache__
            if '__pycache__' in filepath:
                continue
            process_file(filepath)

    print(f"\n{'[DRY RUN] ' if DRY_RUN else ''}Done replacing labels.")
