import { WORKFLOW_STATUS, isOpmInitialReviewStatus, isOpmRole, isPMRole, normalizeRole } from './workflowLabels'

function normalizeText(value) {
  return String(value || '').trim().toLowerCase()
}

function parseDateMs(value) {
  const raw = String(value || '').trim()
  if (!raw) return 0

  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) return parsed.getTime()

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const fallback = new Date(`${raw}T00:00:00`)
    if (!Number.isNaN(fallback.getTime())) return fallback.getTime()
  }

  return 0
}

function getDocumentTargetDivisions(doc) {
  const divisions = []
  const pushValue = (value) => {
    const raw = String(value || '').trim()
    if (!raw) return

    const normalizedRaw = normalizeText(raw)
    const exists = divisions.some((item) => normalizeText(item) === normalizedRaw)
    if (!exists) divisions.push(raw)
  }

  if (Array.isArray(doc?.targetDivisions)) {
    doc.targetDivisions.forEach(pushValue)
  }

  pushValue(doc?.targetDivision)
  pushValue(doc?.mainDivision)
  pushValue(doc?.oprDivision)

  return divisions
}

function getDivisionAssignedPosition(doc, userDivision) {
  const normalizedDivision = normalizeText(userDivision)
  if (!normalizedDivision) return ''

  const delegatedDivision = normalizeText(doc?.assignedDivision)
  const delegatedPosition = String(doc?.assignedTo || '').trim()
  if (delegatedPosition && delegatedDivision === normalizedDivision) {
    return delegatedPosition
  }

  const assignments = doc?.routeAssignments
  if (!assignments || typeof assignments !== 'object') return ''

  const assignmentKey = Object.keys(assignments).find(
    (key) => normalizeText(key) === normalizedDivision
  )

  if (!assignmentKey) return ''

  return String(assignments[assignmentKey]?.position || '').trim()
}

function getPrioritySortValue(doc) {
  const nowMs = Date.now()
  const dueMs = parseDateMs(doc?.dueDate)
  const receivedMs = parseDateMs(doc?.dateReceived || doc?.createdAt)

  const overdueRank = dueMs && dueMs < nowMs ? 0 : dueMs ? 1 : 2
  const timeRank = dueMs || receivedMs || nowMs

  return { overdueRank, timeRank }
}

export function getRoleQueuePath(role) {
  const cleanRole = normalizeRole(role)

  if (cleanRole === 'Operator') return '/incoming'
  if (isOpmRole(cleanRole)) return '/opm-secretary'
  if (cleanRole === 'PM') return '/pm-routing'
  if (cleanRole === 'Division') return '/division-documents'
  if (cleanRole === 'Admin') return '/reports'
  return '/tracking'
}

export function getPendingDocumentsForUser(documents, currentUser) {
  const role = normalizeRole(currentUser?.systemRole || currentUser?.role || '')
  const list = Array.isArray(documents) ? documents : []

  let filtered = []

  if (role === 'Operator') {
    filtered = list.filter((doc) => doc?.status === WORKFLOW_STATUS.REGISTERED)
  } else if (isOpmRole(role)) {
    filtered = list.filter((doc) => isOpmInitialReviewStatus(doc?.status))
  } else if (isPMRole(role)) {
    const isSpecificOIC = String(currentUser?.systemRole || currentUser?.role || '').trim().toUpperCase() === 'OIC'
    const isSpecificPM = String(currentUser?.systemRole || currentUser?.role || '').trim().toUpperCase() === 'PM'
    filtered = list.filter((doc) => {
      if (doc?.status !== WORKFLOW_STATUS.PM_REVIEW) return false
      if (isSpecificOIC && doc.targetDivision !== 'Officer-in-Charge (OIC)') return false
      if (isSpecificPM && doc.targetDivision !== 'Port Manager (PM)') return false
      return true
    })
  } else if (role === 'Division') {
    const userDivision = String(currentUser?.division || '').trim()
    const userPosition = String(currentUser?.position || '').trim()
    const normalizedUserDivision = normalizeText(userDivision)
    const normalizedUserPosition = normalizeText(userPosition)

    filtered = list.filter((doc) => {
      if (doc?.status !== WORKFLOW_STATUS.ROUTED_CONCERNED) return false

      const targetDivisions = getDocumentTargetDivisions(doc)
      const senderDivision = normalizeText(doc?.senderAddress)
      const routedToDivision = targetDivisions.some(
        (division) => normalizeText(division) === normalizedUserDivision
      )
      const sentByDivision = senderDivision === normalizedUserDivision

      if (!routedToDivision && !sentByDivision) return false

      const assignedPosition = normalizeText(getDivisionAssignedPosition(doc, userDivision))
      if (!assignedPosition) return true
      if (!normalizedUserPosition) return true

      return assignedPosition === normalizedUserPosition
    })
  } else {
    filtered = []
  }

  return filtered
    .slice()
    .sort((a, b) => {
      const aSort = getPrioritySortValue(a)
      const bSort = getPrioritySortValue(b)

      if (aSort.overdueRank !== bSort.overdueRank) {
        return aSort.overdueRank - bSort.overdueRank
      }

      return aSort.timeRank - bSort.timeRank
    })
}
