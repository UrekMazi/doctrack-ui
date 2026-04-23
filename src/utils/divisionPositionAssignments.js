export const OPM_DIVISION = 'Office of the Port Manager (OPM)'

export const OPM_POSITION_OPTIONS = [
  'Executive Assistant A',
  'Attorney IV',
  'Business Devt./Mktg. Specialist',
  'Project Planning & Devt. Officer A',
  'Business Devt./Mktg. Officer A',
  'Executive Secretary C',
  'Port Manager',
]

export const DEFAULT_DIVISION_POSITION_OPTIONS = {
  [OPM_DIVISION]: OPM_POSITION_OPTIONS,
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
  Terminal: ['Terminal Head', 'Terminal Supervisor', 'Terminal Staff'],
  'Records Section': ['Records Head', 'Records Encoder', 'Records Clerk'],
}

function normalizeText(value) {
  return String(value || '').trim()
}

function dedupe(values) {
  const seen = new Set()
  const list = []

  values.forEach((value) => {
    const clean = normalizeText(value).replace(/\s+/g, ' ')
    const key = clean.toLowerCase()
    if (!clean || seen.has(key)) return
    seen.add(key)
    list.push(clean)
  })

  return list
}

export function getDivisionPositionOptions(division) {
  const key = normalizeText(division)
  if (!key) return []

  return dedupe(DEFAULT_DIVISION_POSITION_OPTIONS[key] || [])
}

function normalizeCatalogPositions(catalogEntry) {
  if (!catalogEntry) return []

  if (Array.isArray(catalogEntry)) {
    return dedupe(catalogEntry)
  }

  if (typeof catalogEntry === 'object') {
    return dedupe(Object.values(catalogEntry))
  }

  return []
}

export function getDivisionPositionOptionsFromCatalog(division, runtimeCatalog = {}) {
  const key = normalizeText(division)
  if (!key) return []

  const defaultOptions = getDivisionPositionOptions(key)
  if (!runtimeCatalog || typeof runtimeCatalog !== 'object') {
    return defaultOptions
  }

  const runtimeOptions = normalizeCatalogPositions(runtimeCatalog[key])
  return dedupe([...defaultOptions, ...runtimeOptions])
}

export function getAssignedPosition(routeAssignments, division) {
  const key = normalizeText(division)
  if (!key || !routeAssignments || typeof routeAssignments !== 'object') return ''
  const entry = routeAssignments[key]
  if (!entry || typeof entry !== 'object') return ''
  return normalizeText(entry.position)
}

export function getPmDefaultDivisionPosition(division, runtimeCatalog = {}) {
  const key = normalizeText(division)
  if (!key) return ''

  const options = getDivisionPositionOptionsFromCatalog(key, runtimeCatalog)
  const divisionManager = options.find(
    (position) => normalizeText(position).toLowerCase() === 'division manager a'
  )
  if (divisionManager) return divisionManager

  if (key === OPM_DIVISION) {
    const opmFallback = options.find(
      (position) => normalizeText(position).toLowerCase() === 'executive assistant a'
    )
    return opmFallback || options[0] || ''
  }

  if (key.toLowerCase() === 'terminal') {
    const terminalFallback = options.find(
      (position) => normalizeText(position).toLowerCase() === 'terminal staff'
    )
    return terminalFallback || options[0] || ''
  }

  return options[0] || 'Division Manager A'
}

export function buildPmRouteAssignments({ divisions = [], runtimeCatalog = {}, opmAssignee = '' } = {}) {
  const normalizedAssignments = {}
  const opmFallback = normalizeText(opmAssignee)

  divisions
    .map((division) => normalizeText(division))
    .filter(Boolean)
    .forEach((division) => {
      let position = getPmDefaultDivisionPosition(division, runtimeCatalog)
      if (division === OPM_DIVISION && opmFallback) {
        position = opmFallback
      }

      normalizedAssignments[division] = {
        position,
      }
    })

  return normalizedAssignments
}

export function buildRouteAssignments({ divisions = [], routeAssignments = {}, opmAssignee = '' } = {}) {
  const normalizedAssignments = {}
  const opmPositionFallback = normalizeText(opmAssignee)

  divisions
    .map((division) => normalizeText(division))
    .filter(Boolean)
    .forEach((division) => {
      const explicitPosition = getAssignedPosition(routeAssignments, division)
      const resolvedPosition = division === OPM_DIVISION
        ? (explicitPosition || opmPositionFallback)
        : explicitPosition

      normalizedAssignments[division] = {
        position: resolvedPosition,
      }
    })

  return normalizedAssignments
}
