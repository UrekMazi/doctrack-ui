
// Divisions/offices of the Philippine Ports Authority
export const DIVISIONS = [
  'Records Section',
  'Office of the Port Manager (OPM)',
  'Administrative Division',
  'Finance Division',
  'Engineering Services Division (ESD)',
  'Port Services Division (PSD)',
  'Port Police Division (PPD)',
  'Terminal',
]

export const DOCUMENT_TYPES = [
  'Memorandum',
  'Letter',
  'Endorsement',
  'Report',
  'Resolution',
  'Ordinance',
  'Request',
  'Directive',
  'Communication',
  'Notice',
]

export const STATUSES = {
  REGISTERED: 'Registered',
  FOR_OPM_ASSISTANT_REVIEW: 'For OPM Assistant Review',
  ENDORSED_TO_OPM: 'Endorsed to OPM',
  ROUTED_TO_DIVISION: 'Routed to Division',
  RECEIVED_ACKNOWLEDGED: 'Received & Acknowledged',
  PENDING: 'Pending',
  RELEASED: 'Released',
  COMPLETED: 'Completed',
}

// User roles for role-based views
export const ROLES = {
  OPERATOR: 'Operator',
  OPM_ASSISTANT: 'OPM Assistant',
  PM: 'PM',
  DIVISION: 'Division',
}

export const USERS = [
  { id: 1, name: 'Maria Santos', role: 'Records Officer', division: 'Records Section', username: 'rec1', systemRole: 'Operator' },
  { id: 2, name: 'Juan Dela Cruz', role: 'Records Staff', division: 'Records Section', username: 'rec2', systemRole: 'Operator' },
  { id: 3, name: 'Port Manager', role: 'PM', division: 'Office of the Port Manager (OPM)', username: 'pm', systemRole: 'PM' },
  { id: 4, name: 'Lorna Villanueva', role: 'OPM Assistant', division: 'Office of the Port Manager (OPM)', username: 'asst', systemRole: 'OPM Assistant' },
  { id: 5, name: 'Pedro Garcia', role: 'Division Chief', division: 'Administrative Division', username: 'div1', systemRole: 'Division' },
  { id: 6, name: 'Joshua Rivera', role: 'Division Staff', division: 'Port Police Division (PPD)', username: 'div2', systemRole: 'Division' },
  { id: 7, name: 'Angela Cruz', role: 'Division Staff', division: 'Engineering Services Division (ESD)', username: 'div3', systemRole: 'Division' },
]

// Generate tracking numbers like 260318-001 (YYMMDD-XXX), resets daily at midnight.
const TRACKING_COUNTER_KEY = 'ppa_tracking_daily_counter_v1'
let trackingCounterFallback = { dateKey: '', count: 0 }

const toDateKeyYYMMDD = (date = new Date()) => {
  const yy = String(date.getFullYear()).slice(-2)
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  return `${yy}${mm}${dd}`
}

const readTrackingCounterState = () => {
  try {
    const raw = localStorage.getItem(TRACKING_COUNTER_KEY)
    if (!raw) return trackingCounterFallback
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return trackingCounterFallback
    const dateKey = typeof parsed.dateKey === 'string' ? parsed.dateKey : ''
    const count = Number.isFinite(parsed.count) ? Number(parsed.count) : 0
    return { dateKey, count: Math.max(0, count) }
  } catch {
    return trackingCounterFallback
  }
}

const writeTrackingCounterState = (state) => {
  trackingCounterFallback = state
  try {
    localStorage.setItem(TRACKING_COUNTER_KEY, JSON.stringify(state))
  } catch {
    // localStorage may be unavailable; fallback in-memory state is still used.
  }
}

export function generateTrackingNumber(now = new Date()) {
  const todayKey = toDateKeyYYMMDD(now)
  const state = readTrackingCounterState()

  let nextState = state
  if (state.dateKey !== todayKey) {
    nextState = { dateKey: todayKey, count: 0 }
  }

  if (nextState.count >= 100) {
    throw new Error('Daily control/tracking number limit reached (100). Counter resets at 12:00 AM.')
  }

  nextState = { ...nextState, count: nextState.count + 1 }
  writeTrackingCounterState(nextState)
  return `${todayKey}-${String(nextState.count).padStart(3, '0')}`
}

// Generate control numbers like CN-2026-02-0001
let controlCounter = 0
export function generateControlNumber() {
  controlCounter++
  return `CN-2026-03-${String(controlCounter).padStart(4, '0')}`
}

export const INCOMING_DOCUMENTS = [
  {
    id: 'DOC-DEMO-001',
    trackingNumber: 'REC-2026-00101',
    subject: 'Request for Overtime Authorization – Port Operations',
    type: 'Memorandum',
    sender: 'Joshua Rivera',
    senderAddress: 'Port Police Division (PPD)',
    dateReceived: '2026-03-08',
    timeReceived: '09:15',
    receivedBy: 'Records Section',
    deliveryMode: 'Hand-delivered',
    status: 'Received & Acknowledged',
    currentLocation: 'Port Police Division (PPD)',
    targetDivision: 'Port Police Division (PPD)',
    pages: 3,
    hasAttachments: false,
    attachmentCount: 0,
    remarks: '',
    routingHistory: [
      { office: 'Records Section', action: 'Received & Timestamped', date: '2026-03-08', time: '09:15', user: 'Records Section', status: 'done' },
      { office: 'EDMS', action: 'Scanned, PDF/OCR Processed, Control # Assigned', date: '2026-03-08', time: '09:17', user: 'System', status: 'done' },
      { office: 'Records Section', action: 'Transmittal Slip & Sticker Printed', date: '2026-03-08', time: '09:18', user: 'Records Section', status: 'done' },
      { office: 'Office of the Port Manager (OPM)', action: 'Endorsed (Physical + Digital via EDMS)', date: '2026-03-08', time: '09:30', user: 'Records Section', status: 'done' },
      { office: 'Port Police Division (PPD)', action: 'Routed by PM (Physical + Digital)', date: '2026-03-08', time: '10:45', user: 'OPM Staff', status: 'done' },
      { office: 'Port Police Division (PPD)', action: 'Received & Acknowledged', date: '2026-03-08', time: '11:00', user: 'PPD Staff', status: 'done' },
    ],
  },
  {
    id: 'DOC-DEMO-002',
    trackingNumber: 'REC-2026-00102',
    subject: 'Quarterly Financial Report – Q1 2026',
    type: 'Report',
    sender: 'External Auditor',
    senderAddress: 'Commission on Audit (COA)',
    dateReceived: '2026-03-09',
    timeReceived: '10:30',
    receivedBy: 'Records Section',
    deliveryMode: 'Courier',
    status: 'Routed to Division',
    currentLocation: 'Finance Division',
    targetDivision: 'Finance Division',
    pages: 12,
    hasAttachments: false,
    attachmentCount: 0,
    remarks: 'Urgent review required',
    routingHistory: [
      { office: 'Records Section', action: 'Received & Timestamped', date: '2026-03-09', time: '10:30', user: 'Records Section', status: 'done' },
      { office: 'EDMS', action: 'Scanned, PDF/OCR Processed, Control # Assigned', date: '2026-03-09', time: '10:32', user: 'System', status: 'done' },
      { office: 'Records Section', action: 'Transmittal Slip & Sticker Printed', date: '2026-03-09', time: '10:33', user: 'Records Section', status: 'done' },
      { office: 'Office of the Port Manager (OPM)', action: 'Endorsed (Physical + Digital via EDMS)', date: '2026-03-09', time: '10:45', user: 'Records Section', status: 'done' },
      { office: 'Finance Division', action: 'Routed by PM (Physical + Digital)', date: '2026-03-09', time: '14:00', user: 'OPM Staff', status: 'done' },
    ],
  },
  {
    id: 'DOC-DEMO-003',
    trackingNumber: 'REC-2026-00103',
    subject: 'Proposed Rehabilitation of Wharf No. 3',
    type: 'Letter',
    sender: 'Engr. Carlos Mendoza',
    senderAddress: 'Engineering Services Division (ESD)',
    dateReceived: '2026-03-10',
    timeReceived: '08:45',
    receivedBy: 'Records Section',
    deliveryMode: 'Hand-delivered',
    status: 'Endorsed to OPM',
    currentLocation: 'Office of the Port Manager (OPM)',
    targetDivision: 'Office of the Port Manager (OPM)',
    pages: 5,
    hasAttachments: false,
    attachmentCount: 0,
    remarks: '',
    routingHistory: [
      { office: 'Records Section', action: 'Received & Timestamped', date: '2026-03-10', time: '08:45', user: 'Records Section', status: 'done' },
      { office: 'EDMS', action: 'Scanned, PDF/OCR Processed, Control # Assigned', date: '2026-03-10', time: '08:47', user: 'System', status: 'done' },
      { office: 'Records Section', action: 'Transmittal Slip & Sticker Printed', date: '2026-03-10', time: '08:48', user: 'Records Section', status: 'done' },
      { office: 'Office of the Port Manager (OPM)', action: 'Endorsed (Physical + Digital via EDMS)', date: '2026-03-10', time: '09:00', user: 'Records Section', status: 'done' },
    ],
  },
  {
    id: 'DOC-DEMO-004',
    trackingNumber: 'REC-2026-00104',
    subject: 'Security Incident Report – Gate 4 Access Breach',
    type: 'Report',
    sender: 'Capt. Ramon Flores',
    senderAddress: 'Port Police Division (PPD)',
    dateReceived: '2026-03-10',
    timeReceived: '11:20',
    receivedBy: 'Records Section',
    deliveryMode: 'Hand-delivered',
    status: 'Registered',
    currentLocation: 'Records Section',
    targetDivision: 'Office of the Port Manager (OPM)',
    pages: 2,
    hasAttachments: false,
    attachmentCount: 0,
    remarks: 'For immediate attention',
    routingHistory: [
      { office: 'Records Section', action: 'Received & Timestamped', date: '2026-03-10', time: '11:20', user: 'Records Section', status: 'done' },
      { office: 'EDMS', action: 'Scanned, PDF/OCR Processed, Control # Assigned', date: '2026-03-10', time: '11:22', user: 'System', status: 'done' },
      { office: 'Records Section', action: 'Transmittal Slip & Sticker Printed', date: '2026-03-10', time: '11:23', user: 'Records Section', status: 'done' },
    ],
  },
  {
    id: 'DOC-DEMO-005',
    trackingNumber: 'REC-2026-00105',
    subject: 'Request for Office Supplies – Administrative Division',
    type: 'Request',
    sender: 'Anna Lim',
    senderAddress: 'Administrative Division',
    dateReceived: '2026-03-10',
    timeReceived: '14:00',
    receivedBy: 'Records Section',
    deliveryMode: 'Hand-delivered',
    status: 'Registered',
    currentLocation: 'Records Section',
    targetDivision: 'Office of the Port Manager (OPM)',
    pages: 1,
    hasAttachments: false,
    attachmentCount: 0,
    remarks: '',
    routingHistory: [
      { office: 'Records Section', action: 'Received & Timestamped', date: '2026-03-10', time: '14:00', user: 'Records Section', status: 'done' },
      { office: 'EDMS', action: 'Scanned, PDF/OCR Processed, Control # Assigned', date: '2026-03-10', time: '14:02', user: 'System', status: 'done' },
      { office: 'Records Section', action: 'Transmittal Slip & Sticker Printed', date: '2026-03-10', time: '14:03', user: 'Records Section', status: 'done' },
    ],
  },
]

export const OUTGOING_DOCUMENTS = []

// Recent activity feed for dashboard
export const RECENT_ACTIVITY = [
  { id: 1, action: 'Document received & timestamped', doc: 'REC-2026-00105', user: 'Records Section', time: '2:00 PM', icon: 'bi-clock-fill' },
  { id: 2, action: 'Scanned & uploaded to EDMS', doc: 'REC-2026-00105', user: 'System', time: '2:02 PM', icon: 'bi-cloud-upload' },
  { id: 3, action: 'Endorsed to OPM (Physical + Digital)', doc: 'REC-2026-00103', user: 'Records Section', time: '9:00 AM', icon: 'bi-send-fill' },
  { id: 4, action: 'Routed to Finance Division by PM', doc: 'REC-2026-00102', user: 'OPM Staff', time: 'Yesterday', icon: 'bi-diagram-3' },
  { id: 5, action: 'Acknowledged by PPD', doc: 'REC-2026-00101', user: 'PPD Staff', time: 'Mar 8', icon: 'bi-check-circle-fill' },
]

// Monitoring log data (for Excel-style reports view)
export const MONITORING_LOG = [
  ...INCOMING_DOCUMENTS.map(doc => ({
    trackingNumber: doc.trackingNumber,
    dateReceived: doc.dateReceived,
    subject: doc.subject,
    sender: doc.sender,
    type: doc.type,
    targetDivision: doc.targetDivision,
    status: doc.status,
    remarks: doc.remarks,
    direction: 'Incoming',
  })),
  ...OUTGOING_DOCUMENTS.map(doc => ({
    trackingNumber: doc.trackingNumber,
    dateReceived: doc.dateReleased || 'Pending',
    subject: doc.subject,
    sender: doc.recipient,
    type: doc.type,
    targetDivision: doc.originDivision,
    status: doc.status,
    remarks: doc.remarks,
    direction: 'Outgoing',
  })),
]
