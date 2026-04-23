export const WORKFLOW_STATUS = {
  REGISTERED: 'Registered',
  OPM_INITIAL_REVIEW: 'For OPM Assistant Review',
  PM_REVIEW: 'Endorsed to OPM',
  ROUTED_CONCERNED: 'Routed to Division',
  RECEIVED_ACKNOWLEDGED: 'Received & Acknowledged',
}

export const STATUS_DISPLAY_LABELS = {
  [WORKFLOW_STATUS.OPM_INITIAL_REVIEW]: 'Endorsed to OPM',
  [WORKFLOW_STATUS.PM_REVIEW]: 'Under PM Review/Evaluation',
  [WORKFLOW_STATUS.ROUTED_CONCERNED]: 'Routed to RC/s Concerned',
}

export function getStatusDisplayLabel(status) {
  const key = String(status || '').trim()
  return STATUS_DISPLAY_LABELS[key] || key
}

export const OPM_ROLE_INTERNAL = 'OPM Assistant'
export const OPM_ROLE_DISPLAY = 'Office of the Port Manager'

export function getRoleDisplayLabel(role) {
  const key = String(role || '').trim()
  return key === OPM_ROLE_INTERNAL ? OPM_ROLE_DISPLAY : key
}
