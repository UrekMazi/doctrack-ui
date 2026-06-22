export const WORKFLOW_STATUS = {
  REGISTERED: 'Registered',
  OPM_INITIAL_REVIEW: 'For OPM Secretary Review',
  OPM_INITIAL_REVIEW_LEGACY: 'For OPM Assistant Review',
  PM_REVIEW: 'Endorsed to OPM',
  ROUTED_CONCERNED: 'Routed to Division',
  PENDING_OPM_FINALIZATION: 'Pending OPM Finalization',
  REROUTED: 'Re-routed by OPM',
  RECEIVED_ACKNOWLEDGED: 'Received & Acknowledged',
}

export const STATUS_DISPLAY_LABELS = {
  [WORKFLOW_STATUS.OPM_INITIAL_REVIEW]: 'For OPM Secretary Review',
  [WORKFLOW_STATUS.OPM_INITIAL_REVIEW_LEGACY]: 'For OPM Secretary Review',
  [WORKFLOW_STATUS.PM_REVIEW]: 'Under PM Review/Evaluation',
  [WORKFLOW_STATUS.ROUTED_CONCERNED]: 'Routed to RC/s Concerned',
  [WORKFLOW_STATUS.PENDING_OPM_FINALIZATION]: 'OPM Outgoing Review',
  [WORKFLOW_STATUS.REROUTED]: 'Re-routed by OPM',
}

export function isOpmInitialReviewStatus(status) {
  const normalized = String(status || '').trim()
  return normalized === WORKFLOW_STATUS.OPM_INITIAL_REVIEW
    || normalized === WORKFLOW_STATUS.OPM_INITIAL_REVIEW_LEGACY
}

export function normalizeStatus(status) {
  const normalized = String(status || '').trim()
  if (!normalized) return ''
  return isOpmInitialReviewStatus(normalized)
    ? WORKFLOW_STATUS.OPM_INITIAL_REVIEW
    : normalized
}

export function getStatusDisplayLabel(status) {
  const key = normalizeStatus(status)
  return STATUS_DISPLAY_LABELS[key] || key
}

export const OPM_ROLE_INTERNAL = 'OPM Secretary'
export const OPM_ROLE_LEGACY = 'OPM Assistant'
export const OPM_ROLE_DISPLAY = 'OPM Secretary'

export function isOpmRole(role) {
  const normalized = String(role || '').trim().toLowerCase()
  if (!normalized) return false
  return normalized === OPM_ROLE_INTERNAL.toLowerCase() || normalized === OPM_ROLE_LEGACY.toLowerCase()
}

export function normalizeRole(role) {
  const key = String(role || '').trim()
  if (!key) return ''
  return isOpmRole(key) ? OPM_ROLE_INTERNAL : key
}

export function getRoleDisplayLabel(role) {
  const normalized = normalizeRole(role)
  return normalized || String(role || '').trim()
}
