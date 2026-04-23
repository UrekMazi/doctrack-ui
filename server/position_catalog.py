"""Canonical per-division position catalog used by routing + admin provisioning."""

OPM_DIVISION = 'Office of the Port Manager (OPM)'

DIVISION_POSITION_CATALOG = {
    OPM_DIVISION: [
        'Port Manager',
        'Executive Assistant A',
        'Attorney IV',
        'Business Devt./Mktg. Specialist',
        'Project Planning & Devt. Officer A',
        'Business Devt./Mktg. Officer A',
        'Executive Secretary C',
    ],
    'Administrative Division': [
        'Division Manager A',
        'Administrative Officer IV',
        'HRMO III',
        'HRMO II',
        'Supervising Supply Officer',
        'Records Officer A',
        'General Services Officer A',
        'Procurement Officer B',
        'Sr. Bldg. Electrician B',
        'Sr. Elec. Com. Sys. Tech',
        'Plant Mechanic/Electrician B',
        'Clerk Processor A',
        'Storekeeper A',
        'Liaison Aide',
        'Reproduction Machine Operator A',
        'Utility Worker A',
    ],
    'Finance Division': [
        'Division Manager A',
        'Corp. Fin. Services Chief',
        'Sr. Corp. Accountant A',
        'Corp. Accountant',
        'Clearing Officer IV',
        'Senior Cashier',
        'Sr. Corp. Accts. Analyst',
        'Corp. Budget Analyst',
        'Insurance/Risk Analyst',
        'Cashier A',
        'Cashier B',
        'Sr. Acctg. Processor B',
    ],
    'Engineering Services Division (ESD)': [
        'Division Manager A',
        'Principal Engineer A',
        'Supervising Engineer A',
        'Senior Engineer A',
        'Construction Foreman A',
        'Engg. Asst. A',
    ],
    'Port Services Division (PSD)': [
        'Division Manager A',
        'Terminal Supervisor A',
        'Harbor Master',
        'Sr. Terminal Operations Officer',
        'Terminal Operations Officer A',
        'Harbor Operations Officer',
        'Chief Safety Officer',
        'Environmental Specialist A',
        'Port Operations Analyst A',
        'Statistician A',
    ],
    'Port Police Division (PPD)': [
        'Division Manager A',
        'Chief Civil Sec. Officer',
        'Civil Sec. Officer A',
        'Civil Sec. Officer B',
        'Civil Sec. Officer C',
        'Industrial Sec. Officer',
    ],
    'Terminal': [
        'Terminal Head',
        'Terminal Supervisor',
        'Terminal Staff',
    ],
    'Records Section': [
        'Records Head',
        'Records Encoder',
        'Records Clerk',
    ],
}


def dedupe_positions(values):
    seen = set()
    ordered = []
    for value in values or []:
        clean = ' '.join(str(value or '').strip().split())
        key = clean.lower()
        if not clean or key in seen:
            continue
        seen.add(key)
        ordered.append(clean)
    return ordered


def get_catalog_for_api():
    return {
        division: dedupe_positions(positions)
        for division, positions in DIVISION_POSITION_CATALOG.items()
    }
