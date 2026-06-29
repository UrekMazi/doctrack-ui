import { useParams, Link } from 'react-router-dom'
import { useEffect, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useReactToPrint } from 'react-to-print'
import { Row, Col, Button, Form, Modal, Dropdown } from 'react-bootstrap'
import { Html5Qrcode } from 'html5-qrcode'
import * as pdfjsLib from 'pdfjs-dist'
import toast from 'react-hot-toast'
import StatusBadge from '../components/StatusBadge'
import IncomingTransmittalSlip from '../components/IncomingTransmittalSlip'
import { DIVISIONS, OUTGOING_DOCUMENTS } from '../data/mockData'
import { useAuth } from '../context/AuthContext'
import { useDocuments } from '../context/DocumentContext'
import { inferDocumentDirection } from '../utils/documentDirection'
import { openIncomingTransmittalPrintWindow } from '../utils/incomingTransmittalPrint'
import { WORKFLOW_STATUS, getStatusDisplayLabel, isOpmInitialReviewStatus, isOpmRole, isPMRole, normalizeRole } from '../utils/workflowLabels'
import {
  TAG_PRESETS,
  DEFAULT_CUSTOM_TAG_COLOR,
  buildRouteTags,
  normalizeRouteTags,
  splitRouteTags,
  getTagClassName,
} from '../utils/docTags'
import {
  OPM_DIVISION,
  getDivisionPositionOptionsFromCatalog,
  buildPmRouteAssignments,
  buildRouteAssignments,
  getAssignedPosition,
} from '../utils/divisionPositionAssignments'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

const DIVISION_CODE_MAP = {
  'Administrative Division': 'ADM',
  'Port Services Division (PSD)': 'PSD',
  'Finance Division': 'FIN',
  'Port Police Division (PPD)': 'PPD',
  'Engineering Services Division (ESD)': 'ESD',
  ADM: 'ADM',
  PSD: 'PSD',
  FIN: 'FIN',
  PPD: 'PPD',
  ESD: 'ESD',
}

const VALID_DIVISION_CODES = ['ADM', 'PSD', 'FIN', 'PPD', 'ESD', 'OTHER']

const TRANSMITTAL_ACTION_OPTIONS = [
  'As appropriate',
  'Prepare Reply',
  'Give comments/recommendations',
  'For information/reference/file',
  'Disseminate',
  'For evaluation/review',
  'For monitoring',
  'For coordination',
]

const ACTION_SPLIT_REGEX = /\s*[;|]\s*/

const LEGACY_TRANSMITTAL_ACTION_MAP = {
  'For review and appropriate action': 'As appropriate',
  'For information': 'For information/reference/file',
  'For approval / signature': 'For evaluation/review',
  'For compliance': 'For monitoring',
  'For comment / recommendation': 'Give comments/recommendations',
}

const MAIN_OPR_VIEW_TTL_MS = 6000

function normalizeTransmittalActions(value) {
  if (Array.isArray(value)) {
    const normalized = value
      .map((entry) => LEGACY_TRANSMITTAL_ACTION_MAP[String(entry || '').trim()] || String(entry || '').trim())
      .filter((entry) => TRANSMITTAL_ACTION_OPTIONS.includes(entry))
    return normalized.length ? Array.from(new Set(normalized)) : [TRANSMITTAL_ACTION_OPTIONS[0]]
  }

  const raw = String(value || '').trim()
  if (!raw) return [TRANSMITTAL_ACTION_OPTIONS[0]]

  const parts = raw.split(ACTION_SPLIT_REGEX).map((entry) => entry.trim()).filter(Boolean)
  const normalized = parts
    .map((entry) => LEGACY_TRANSMITTAL_ACTION_MAP[entry] || entry)
    .filter((entry) => TRANSMITTAL_ACTION_OPTIONS.includes(entry))

  return normalized.length ? Array.from(new Set(normalized)) : [TRANSMITTAL_ACTION_OPTIONS[0]]
}

function getRoutingMethodFromAction(action) {
  const normalized = String(action || '').toLowerCase()
  if (normalized.includes('physical + digital')) return 'both'
  if (normalized.includes('digital assignment') || normalized.includes('digital only')) return 'digital'
  return ''
}

function inferInitialRoutingMethod(doc) {
  const history = Array.isArray(doc?.routingHistory) ? doc.routingHistory : []
  let actionToUse = ''

  for (const entry of history) {
    const action = String(entry?.action || '')
    if (/routed by pm .*(pending opm finalization|opm outgoing review)/i.test(action)) {
      actionToUse = action
      break
    }
  }

  if (!actionToUse) {
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const action = String(history[i]?.action || '')
      if (/(pending opm finalization|opm outgoing review)/i.test(action)) {
        actionToUse = action
        break
      }
    }
  }

  return getRoutingMethodFromAction(actionToUse) || 'both'
}

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = (event) => resolve(event.target?.result)
  reader.onerror = () => reject(new Error('Failed to read completion proof file.'))
  reader.readAsDataURL(file)
})

function buildCompletionProofUrl(trackingNumber, fileName, storageFolder = '') {
  const tracking = String(trackingNumber || '').trim()
  const name = String(fileName || '').trim()
  if (!tracking || !name) return ''

  const encodedTracking = encodeURIComponent(tracking)
  const encodedName = encodeURIComponent(name)
  const encodedStorageFolder = String(storageFolder || '').trim()
    ? `?storageFolder=${encodeURIComponent(String(storageFolder || '').trim())}`
    : ''
  return `/api/documents/${encodedTracking}/files/${encodedName}${encodedStorageFolder}`
}

function mapDivisionToCode(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (DIVISION_CODE_MAP[raw]) return DIVISION_CODE_MAP[raw]

  const normalized = raw.toUpperCase()
  return VALID_DIVISION_CODES.includes(normalized) ? normalized : null
}

function getSelectedDivisionCodes(doc) {
  const raw = Array.isArray(doc.targetDivisions) && doc.targetDivisions.length > 0
    ? doc.targetDivisions
    : (doc.targetDivision ? [doc.targetDivision] : [])

  const codes = raw
    .map((item) => mapDivisionToCode(item))
    .filter(Boolean)
    .filter((code, idx, arr) => arr.indexOf(code) === idx)

  const hasStrictSelection = codes.some((code) => code !== 'OTHER')
  return hasStrictSelection ? codes : []
}

function getMainDivisionCode(doc, selectedDivisionCodes) {
  if (!Array.isArray(selectedDivisionCodes) || selectedDivisionCodes.length === 0) return ''

  const mainRaw = doc.mainDivision || doc.targetDivision || ''
  const mapped = mapDivisionToCode(mainRaw)

  if (!mapped || mapped === 'OTHER') return ''
  if (!selectedDivisionCodes.includes(mapped)) return ''

  return mapped
}

function getRoutedDivisions(doc) {
  if (!(doc.status === WORKFLOW_STATUS.ROUTED_CONCERNED || doc.status === WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED || doc.status === WORKFLOW_STATUS.REROUTED || doc.status === WORKFLOW_STATUS.PENDING_OPM_FINALIZATION || doc.status === 'Completed')) {
    return []
  }
  const raw = Array.isArray(doc.targetDivisions) && doc.targetDivisions.length > 0
    ? doc.targetDivisions
    : (doc.targetDivision ? [doc.targetDivision] : [])

  return raw
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .filter((value, idx, arr) => arr.indexOf(value) === idx)
}

function getDivisionReceipts(doc) {
  if (Array.isArray(doc.divisionReceipts) && doc.divisionReceipts.length > 0) {
    return doc.divisionReceipts
  }

  const routed = getRoutedDivisions(doc)
  const history = Array.isArray(doc.routingHistory) ? doc.routingHistory : []
  const inferred = history
    .filter((step) => /received\s*&\s*acknowledged|qr-verified/i.test(String(step.action || '')))
    .map((step) => ({
      division: step.office,
      method: /digital/i.test(String(step.action || '')) ? 'digital' : 'physical',
      source: /qr-verified/i.test(String(step.action || '')) ? 'camera' : 'manual',
      verifiedBy: step.user || '',
      verifiedAt: step.date ? `${step.date}T00:00:00` : '',
    }))
    .filter((entry) => routed.includes(entry.division))

  return inferred.filter((entry, idx, arr) => arr.findIndex((e) => e.division === entry.division) === idx)
}

function isReceiptAcknowledged(entry) {
  return Boolean(entry?.verifiedAt || entry?.acknowledgedAt)
}

function isReceiptViewed(entry) {
  return Boolean(entry?.viewedAt || entry?.viewedBy || entry?.viewed)
}

function getRoleLabel(currentUser) {
  const role = normalizeRole(currentUser?.systemRole || currentUser?.role || '')
  if (role === 'Operator') return 'RECORDS'
  if (isOpmRole(role)) return 'OPM'
  if (isPMRole(role)) return role
  if (role === 'Division') return currentUser?.division || 'Division'
  return role || 'User'
}

function isPmInstructionComment(entry) {
  const role = String(entry?.roleLabel || entry?.role || '').trim().toUpperCase()
  const authorName = String(entry?.name || entry?.authorName || '').trim().toUpperCase()

  if (role === 'PM' || role === 'OIC' || role.includes('PORT MANAGER') || role.includes('OFFICER-IN-CHARGE')) return true

  // Match standalone PM token in author name (avoid classifying OPM as PM).
  return /(^|[^A-Z])PM([^A-Z]|$)/.test(authorName) || authorName.includes('PORT MANAGER')
}

function isRecordsEndorseRemark(entry) {
  const marker = String(entry?.remarkType || entry?.commentType || '').trim().toLowerCase()
  if (marker === 'records-endorse-to-opm' || marker === 'records-endorsement') return true
  return String(entry?.comment || '').startsWith('[Records endorsement remark] ')
}

function isOpmEndorseRemark(entry) {
  const marker = String(entry?.remarkType || entry?.commentType || '').trim().toLowerCase()
  if (marker === 'opm-endorse-to-pm' || marker === 'opm-endorsement') return true
  return String(entry?.comment || '').startsWith('[OPM endorsement remark] ')
}

export default function DocumentDetail({ currentUser }) {
  const { id } = useParams()
  const { token, authFetch } = useAuth()
  const { documents, updateDocumentStatus, sendChatMessage, refreshDocuments } = useDocuments()
  // useParams always returns strings; backend IDs are numbers — use loose equality
  const doc = documents.find(d => String(d.id) === String(id) || d.trackingNumber === id) ||
              OUTGOING_DOCUMENTS.find(d => String(d.id) === String(id) || d.trackingNumber === id)

  if (!doc) {
    return (
      <div className="empty-state">
        <i className="bi bi-file-earmark-x d-block"></i>
        <h5>Document Not Found</h5>
        <p>The document with ID "{id}" does not exist.</p>
        <Link to="/" className="btn btn-primary">Back to Dashboard</Link>
      </div>
    )
  }

  const oicGuardRole = normalizeRole(currentUser?.systemRole || currentUser?.role || '')
  if (oicGuardRole === 'OIC') {
    const targetDiv = String(doc.targetDivision || '').toLowerCase()
    const targetDivs = Array.isArray(doc.targetDivisions) ? doc.targetDivisions : []
    const isOicDoc = targetDiv.includes('officer-in-charge') || targetDiv === 'oic' ||
      targetDivs.some(d => String(d || '').toLowerCase().includes('officer-in-charge') || String(d || '').toLowerCase() === 'oic')
    if (!isOicDoc) {
      return (
        <div className="empty-state">
          <i className="bi bi-shield-lock d-block"></i>
          <h5>Access Denied</h5>
          <p>This document is restricted and not assigned to the Officer-in-Charge.</p>
          <Link to="/" className="btn btn-primary">Back to Dashboard</Link>
        </div>
      )
    }
  }

  const isIncoming = inferDocumentDirection(doc) === 'Incoming'
  const isDivisionLocked = isIncoming && currentUser?.systemRole === 'Division' && doc.status === WORKFLOW_STATUS.PENDING_OPM_FINALIZATION
  const history = doc.routingHistory || []
    if (isDivisionLocked) {
      return (
        <div className="empty-state">
          <i className="bi bi-lock-fill d-block"></i>
          <h5>OPM Outgoing Review</h5>
          <p>Divisions can view this document after the OPM Secretary finalizes the PM routing.</p>
          <Link to="/division-documents" className="btn btn-outline-primary">Back to Division Queue</Link>
        </div>
      )
    }
  const transmittalRef = useRef(null)
  const externalDirRef = useRef(null)
  const [externalDirLabel, setExternalDirLabel] = useState('Not linked')
  const [externalFiles, setExternalFiles] = useState({})
  const [renderedPdfPreviewUrl, setRenderedPdfPreviewUrl] = useState('')
  const [renderingPdfPreview, setRenderingPdfPreview] = useState(false)
  const [selectedPdfPage, setSelectedPdfPage] = useState(1)
  const [selectedPdfTotalPages, setSelectedPdfTotalPages] = useState(1)
  const [instructionInput, setInstructionInput] = useState('')
  const [replyInput, setReplyInput] = useState('')
  const [commentTab, setCommentTab] = useState('instructions')
  const [showEndorseModal, setShowEndorseModal] = useState(false)
  const [endorseRemarks, setEndorseRemarks] = useState('')
  const [generateTransmittal, setGenerateTransmittal] = useState(true)
  const [endorsingToOpm, setEndorsingToOpm] = useState(false)
  
  // OPM Secretary UI States
  const isOpmSecretary = isOpmRole(currentUser?.systemRole || currentUser?.role)
  const isForOpmReview = isOpmInitialReviewStatus(doc?.status)
  const canOpmReroute = isIncoming && isOpmSecretary && (
    doc.status === WORKFLOW_STATUS.ROUTED_CONCERNED ||
    doc.status === WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED ||
    doc.status === WORKFLOW_STATUS.REROUTED
  )
  const canOpmFinalize = isIncoming && isOpmSecretary && doc.status === WORKFLOW_STATUS.PENDING_OPM_FINALIZATION
  const canOpmEditOutgoing = isIncoming && isOpmSecretary && (
    doc.status === WORKFLOW_STATUS.PENDING_OPM_FINALIZATION ||
    doc.status === WORKFLOW_STATUS.ROUTED_CONCERNED
  )
  const [digitalAcknowledgeTyped, setDigitalAcknowledgeTyped] = useState('')
  const [isQrScannedOpm, setIsQrScannedOpm] = useState(false)
  const [showAssistantEndorseModal, setShowAssistantEndorseModal] = useState(false)
  const [assistantRemarks, setAssistantRemarks] = useState('')
  const [endorsingToPM, setEndorsingToPM] = useState(false)
  const [isEndorsingToOic, setIsEndorsingToOic] = useState(false)
  
  const [showQrReceiveModal, setShowQrReceiveModal] = useState(false)
  const [qrCameraError, setQrCameraError] = useState('')
  const [qrCameraActive, setQrCameraActive] = useState(false)
  const [showPMRoutingModal, setShowPMRoutingModal] = useState(false)
  const [mainRouteDivision, setMainRouteDivision] = useState('')
  const [routeToDivisions, setRouteToDivisions] = useState([])
  const [routeActions, setRouteActions] = useState([TRANSMITTAL_ACTION_OPTIONS[0]])
  const [routeInstructions, setRouteInstructions] = useState('')
  const [routeTagKeys, setRouteTagKeys] = useState([])
  const [customTagLabel, setCustomTagLabel] = useState('')
  const [customTagColor, setCustomTagColor] = useState(DEFAULT_CUSTOM_TAG_COLOR)
  const [routeDeliveryMethod, setRouteDeliveryMethod] = useState('both')
  const [routeAssignmentDraft, setRouteAssignmentDraft] = useState({})
  const [routingMode, setRoutingMode] = useState('pm')
  const [divisionPositionCatalog, setDivisionPositionCatalog] = useState({})
  const [opmAssignee, setOpmAssignee] = useState('')
  const [routingToDivision, setRoutingToDivision] = useState(false)
  const [finalizingRoute, setFinalizingRoute] = useState(false)
  const [showDelegateModal, setShowDelegateModal] = useState(false)
  const [selectedPersonnel, setSelectedPersonnel] = useState('')
  const [dmInstructions, setDmInstructions] = useState('')
  const [delegatingTask, setDelegatingTask] = useState(false)
  const [showCompleteModal, setShowCompleteModal] = useState(false)
  const [actionTaken, setActionTaken] = useState('')
  const [completionFile, setCompletionFile] = useState(null)
  const [completingTask, setCompletingTask] = useState(false)
  const qrScannerRef = useRef(null)
  const chatAreaRef = useRef(null)

  useEffect(() => {
    if (commentTab === 'replies' && chatAreaRef.current) {
      chatAreaRef.current.scrollTop = chatAreaRef.current.scrollHeight
    }
  }, [doc?.replyComments, commentTab])

  const qrScannerElementId = 'doc-detail-qr-reader'
  const shouldShowRoutingMarks = doc.status === WORKFLOW_STATUS.ROUTED_CONCERNED || doc.status === WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED || doc.status === WORKFLOW_STATUS.REROUTED || doc.status === WORKFLOW_STATUS.PENDING_OPM_FINALIZATION
  const selectedDivisionCodes = shouldShowRoutingMarks ? getSelectedDivisionCodes(doc) : []
  const mainDivisionCode = shouldShowRoutingMarks ? getMainDivisionCode(doc, selectedDivisionCodes) : ''
  const routedDivisions = getRoutedDivisions(doc)
  const divisionReceipts = getDivisionReceipts(doc)
  const mainDivision = doc.oprDivision || doc.mainDivision || doc.targetDivision || ''
  const mainOprReceipt = divisionReceipts.find((entry) => entry.division === mainDivision)
  const isMainOprAcknowledged = isReceiptAcknowledged(mainOprReceipt)
  const orderedDivisionList = [
    ...((mainDivision && routedDivisions.includes(mainDivision)) ? [mainDivision] : []),
    ...routedDivisions.filter((d) => d !== mainDivision),
  ]
  const normalizeDivisionValue = (value) => String(value || '').trim().toLowerCase()
  const normalizedMainDivision = normalizeDivisionValue(mainDivision)
  const isDivisionReceiptSatisfied = (division) => {
    const receipt = divisionReceipts.find((entry) => entry.division === division)
    const isMainDivision = normalizeDivisionValue(division) === normalizedMainDivision
    if (isMainDivision) return isReceiptAcknowledged(receipt)
    return isReceiptViewed(receipt) || isReceiptAcknowledged(receipt)
  }
  const fullyReceivedByAllDivisions = orderedDivisionList.length > 0
    ? orderedDivisionList.every((division) => isDivisionReceiptSatisfied(division))
    : false
  const isTaskCompleted = doc.status === 'Completed'
  const mainOprViewingAtRaw = String(doc.mainOprViewingAt || '').trim()
  const mainOprViewingAtMs = mainOprViewingAtRaw ? Date.parse(mainOprViewingAtRaw) : Number.NaN
  const isMainOprViewingActive = Number.isFinite(mainOprViewingAtMs)
    ? (Date.now() - mainOprViewingAtMs) < MAIN_OPR_VIEW_TTL_MS
    : false
  const receiptHeaderLabel = isTaskCompleted
    ? 'Completed'
    : (fullyReceivedByAllDivisions ? 'Fully Received' : 'Waiting for Division Receipts')
  const receiptHeaderClass = isTaskCompleted
    ? 'bg-success-subtle text-success border border-success-subtle'
    : (fullyReceivedByAllDivisions
        ? 'bg-success-subtle text-success border border-success-subtle'
        : 'bg-warning-subtle text-warning border border-warning-subtle')
  const userRole = String(currentUser?.systemRole || '').trim()
  const userDivision = String(currentUser?.division || '').trim()
  const userPosition = String(currentUser?.position || '').trim()
  const normalizedUserPosition = userPosition.toLowerCase()
  const normalizedUserDivision = normalizeDivisionValue(userDivision)
  const explicitSupportingDivisions = Array.isArray(doc.supportingDivisions)
    ? doc.supportingDivisions.filter((division) => String(division || '').trim().length > 0)
    : []
  const fallbackSupportingDivisions = Array.isArray(doc.targetDivisions) && doc.targetDivisions.length > 0
    ? doc.targetDivisions.filter((division) => {
        const normalizedDivision = normalizeDivisionValue(division)
        return normalizedDivision.length > 0 && normalizedDivision !== normalizedMainDivision
      })
    : []
  const supportingDivisionDisplayList = (explicitSupportingDivisions.length > 0
    ? explicitSupportingDivisions
    : fallbackSupportingDivisions
  )
    .map((division) => String(division || '').trim())
    .filter((division) => division.length > 0 && normalizeDivisionValue(division) !== normalizedMainDivision)
    .filter((division, idx, arr) => arr.indexOf(division) === idx)
  const supportingDivisionList = supportingDivisionDisplayList.map((division) => normalizeDivisionValue(division))
  const isCoreRoutingRole =
    isPMRole(userRole) ||
    userRole === 'Operator' ||
    userRole === 'Admin' ||
    normalizeDivisionValue(currentUser?.division) === 'records section'
  const isUserMainDivision = normalizedUserDivision.length > 0 && normalizedUserDivision === normalizedMainDivision
  const isUserSupportingDivision = normalizedUserDivision.length > 0 && supportingDivisionList.includes(normalizedUserDivision)
  const userDivisionCode = mapDivisionToCode(userDivision)
  const routedDivisionCodes = routedDivisions
    .map((division) => mapDivisionToCode(division))
    .filter(Boolean)
  const isUserInRoutedDivisionByCode = userDivisionCode ? routedDivisionCodes.includes(userDivisionCode) : false
  const isDelegationRoutedStatus = doc.status === WORKFLOW_STATUS.ROUTED_CONCERNED || doc.status === WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED || doc.status === WORKFLOW_STATUS.REROUTED
  const isCompletionRoutedStatus = doc.status === WORKFLOW_STATUS.ROUTED_CONCERNED || doc.status === WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED || doc.status === WORKFLOW_STATUS.REROUTED
  const divisionDelegateOptions = getDivisionPositionOptionsFromCatalog(userDivision, divisionPositionCatalog)
    .filter((position) => String(position || '').trim().toLowerCase() !== normalizedUserPosition)
  const existingAssignedPersonnel = String(doc.assignedTo || '').trim()
  const divisionPersonnelOptions = existingAssignedPersonnel && !divisionDelegateOptions.includes(existingAssignedPersonnel)
    ? [existingAssignedPersonnel, ...divisionDelegateOptions]
    : divisionDelegateOptions
  const isDivisionHead =
    normalizedUserPosition === 'division manager a' ||
    normalizedUserPosition === 'terminal staff' ||
    normalizedUserPosition === 'terminal head'
  const canDelegateTask =
    currentUser?.systemRole === 'Division' &&
    isDivisionHead &&
    isDelegationRoutedStatus &&
    (isUserMainDivision || isUserSupportingDivision || isUserInRoutedDivisionByCode)
  const canCompleteTask = isCompletionRoutedStatus && isUserMainDivision
  const completionAttachmentLabel = String(doc.completionAttachment || '').trim()
  const completionAttachmentFileName = String(doc.completionAttachmentFileName || '').trim()
  const completionAttachmentStorageFolder = String(doc.completionAttachmentStorageFolder || '').trim()
  const completionAttachmentUrl = String(doc.completionAttachmentUrl || '').trim()
  const resolvedCompletionAttachmentUrl = completionAttachmentUrl || buildCompletionProofUrl(
    doc.trackingNumber,
    completionAttachmentFileName,
    completionAttachmentStorageFolder
  )
  const completionDetailsText = String(doc.actionTaken || '').trim()
  const completedByText = String(doc.completedBy || '').trim()
  const completedAtText = String(doc.completedAt || '').trim()
  const hasCompletionSummary = Boolean(
    completionDetailsText ||
    completedByText ||
    completedAtText ||
    completionAttachmentLabel ||
    completionAttachmentFileName
  )
  const canPrintTransmittalSlip = isCoreRoutingRole || isUserMainDivision
  const shouldHidePrintForSupportingDivision = isUserSupportingDivision && !isCoreRoutingRole && !isUserMainDivision
  const targetDivisionRaw = Array.isArray(doc.targetDivisions) && doc.targetDivisions.length > 0
    ? doc.targetDivisions.join(', ')
    : (doc.targetDivision || '')
  const targetDivisionText = targetDivisionRaw === 'OTHER' ? 'Pending PM Routing' : targetDivisionRaw
  const instructionComments = Array.isArray(doc.instructionComments)
    ? doc.instructionComments.filter((entry) => String(entry?.comment || '').trim().length > 0)
    : []
  const pmInstructionText = String(doc.pmTransmittalInstructions || '').trim()
  const pmInstructionComments = instructionComments.filter((entry) => isPmInstructionComment(entry))
  const nonPmInstructionComments = instructionComments.filter((entry) => !isPmInstructionComment(entry))
  const recordsRegistrationRemarks = String(doc.remarks || '').trim()
  const hasPmInstructionContent = pmInstructionText.length > 0 || pmInstructionComments.length > 0
  const hasRecordsRemarksContent = recordsRegistrationRemarks.length > 0 || nonPmInstructionComments.length > 0
  const pmInstructionsContent = hasPmInstructionContent ? (
    <>
      {pmInstructionText && <div style={{ marginBottom: 4 }}>{pmInstructionText}</div>}
      {pmInstructionComments.map((entry, idx) => (
        <div key={entry.id || `${entry.createdAt || ''}-${idx}`} style={{ marginBottom: 2 }}>
          <strong>{String(entry.roleLabel || entry.role || 'User')}{entry.name ? ` (${entry.name})` : ''}:</strong> {entry.comment}
        </div>
      ))}
    </>
  ) : null
  const commentsRemarksContent = hasRecordsRemarksContent ? (
    <>
      {recordsRegistrationRemarks && <div style={{ marginBottom: 4 }}>{recordsRegistrationRemarks}</div>}
      {nonPmInstructionComments.map((entry, idx) => {
        const isOpmEndorse = isOpmEndorseRemark(entry)
        const isRecordsEndorse = isRecordsEndorseRemark(entry)
        let cleanComment = entry.comment || ''
        if (cleanComment.startsWith('[OPM Secretary remarks] ')) {
          cleanComment = cleanComment.replace('[OPM Secretary remarks] ', '')
        }
        if (cleanComment.startsWith('[OPM Assistant remarks] ')) {
          cleanComment = cleanComment.replace('[OPM Assistant remarks] ', '')
        }
        if (cleanComment.startsWith('[OPM remarks] ')) {
          cleanComment = cleanComment.replace('[OPM remarks] ', '')
        }
        if (cleanComment.startsWith('[OPM endorsement remark] ')) {
          cleanComment = cleanComment.replace('[OPM endorsement remark] ', '')
        }
        if (cleanComment.startsWith('[Records endorsement remark] ')) {
          cleanComment = cleanComment.replace('[Records endorsement remark] ', '')
        }
        return (
          <div key={entry.id || `${entry.createdAt || ''}-${idx}`} style={{ marginBottom: 2 }}>
            <strong>{isOpmEndorse ? 'Remarks by OPM to PM:' : isRecordsEndorse ? 'Remarks by Records Division:' : `${String(entry.roleLabel || entry.role || 'User')}${entry.name ? ` (${entry.name})` : ''}:`}</strong> {cleanComment}
          </div>
        )
      })}
    </>
  ) : null
  const transmittalSlipProps = {
    trackingNumber: doc.trackingNumber,
    sender: doc.sender,
    senderAddress: doc.senderAddress,
    dateOfComm: doc.dateOfComm,
    subject: doc.subject,
    action: doc.action,
    dueDate: doc.dueDate,
    selectedDivisionCodes,
    mainDivisionCode,
    pmInstructionsContent,
    commentsRemarksContent,
  }
  const roleLabel = getRoleLabel(currentUser)
  const commenterName = currentUser?.name || 'Unknown User'
  const canOperatorEndorseToOpm = isIncoming && currentUser?.systemRole === 'Operator' && doc.status === WORKFLOW_STATUS.REGISTERED
  const operatorAlreadyEndorsed = isIncoming && currentUser?.systemRole === 'Operator' && doc.status !== WORKFLOW_STATUS.REGISTERED
  const latestOperatorOpmEndorseStep = [...history]
    .reverse()
    .find((step) => /endorsed to opm/i.test(String(step?.action || '')))
  const operatorEndorseTimestamp = latestOperatorOpmEndorseStep
    ? `${String(latestOperatorOpmEndorseStep.date || '').trim()} ${String(latestOperatorOpmEndorseStep.time || '').trim()}`.trim()
    : ''
  const operatorEndorseBy = String(latestOperatorOpmEndorseStep?.user || '').trim()
  const operatorNextAction = (isIncoming && currentUser?.systemRole === 'Operator')
    ? (
        canOperatorEndorseToOpm
          ? {
              tone: 'warning',
              title: 'Next Action: Endorse to OPM',
              text: 'Review details, then send this document to OPM for initial review.',
            }
          : isOpmInitialReviewStatus(doc?.status)
            ? {
                tone: 'info',
                title: 'Next Action: Monitor OPM Review',
                text: 'Document is currently with OPM. Track updates while waiting for PM forwarding.',
              }
            : doc.status === WORKFLOW_STATUS.PM_REVIEW
              ? {
                  tone: 'info',
                  title: 'Next Action: Waiting for PM Routing',
                  text: 'OPM has forwarded this to PM. Await routing to RC/s Concerned.',
                }
              : doc.status === WORKFLOW_STATUS.PENDING_OPM_FINALIZATION
                ? {
                    tone: 'info',
                    title: 'Next Action: Await OPM Finalization',
                    text: 'PM routing is complete. OPM will finalize before divisions can view or acknowledge.',
                  }
                : (doc.status === WORKFLOW_STATUS.ROUTED_CONCERNED || doc.status === WORKFLOW_STATUS.REROUTED)
                ? {
                    tone: 'success',
                    title: 'Next Action: Monitor Division Receipt',
                    text: 'Handoff to division/s is complete. Wait for transmittal QR acknowledgement.',
                  }
                : doc.status === WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED
                  ? {
                      tone: 'success',
                      title: 'Next Action: Completed',
                      text: 'Division acknowledgement is complete. No further operator action is needed.',
                    }
                  : null
      )
    : null
  const isDivisionQrReceivable = isIncoming && currentUser?.systemRole === 'Division' && (doc.status === WORKFLOW_STATUS.ROUTED_CONCERNED || doc.status === WORKFLOW_STATUS.REROUTED)
  const statusNotification = doc.status === WORKFLOW_STATUS.REGISTERED
    ? {
        tone: 'secondary',
        title: 'Registered Only',
        text: 'Document is registered. No division QR receive is required yet.',
      }
    : (isOpmInitialReviewStatus(doc?.status) || doc.status === WORKFLOW_STATUS.PM_REVIEW)
      ? {
          tone: 'info',
          title: 'OPM/PM Review',
          text: 'Document is currently in OPM to PM review flow. Division QR receive starts after PM routes to RC/s Concerned.',
        }
      : doc.status === WORKFLOW_STATUS.PENDING_OPM_FINALIZATION
        ? {
            tone: 'warning',
            title: 'OPM Outgoing Review',
            text: 'PM routing is complete. Divisions can see the document but cannot open it until OPM finalizes.',
          }
      : null
  const routeDivisionOptions = DIVISIONS.filter((division) =>
    division !== 'Records Section'
  )
  const selectedRouteDivisions = [
    mainRouteDivision,
    ...routeToDivisions.filter((division) => division !== mainRouteDivision),
  ].filter(Boolean)
  const hasOpmSelection = selectedRouteDivisions.includes(OPM_DIVISION)
  const isOpmOutgoingEdit = routingMode === 'opm-finalize-edit' || routingMode === 'opm-outgoing-edit'
  const routeEditorTitle = routingMode === 'opm-reroute'
    ? 'Edit Transmittal Slip & Re-route to Division'
    : isOpmOutgoingEdit
      ? 'Edit OPM Outgoing (OPM Outgoing Review)'
      : 'Edit Transmittal Slip & Route to Division'
  const routePrimaryLabel = routingMode === 'opm-reroute'
    ? 'Re-route (Physical + Digital)'
    : isOpmOutgoingEdit
      ? 'Physical + Digital'
      : 'Route (Physical + Digital)'
  const routeSecondaryLabel = routingMode === 'opm-reroute'
    ? 'Re-route (Digital Only)'
    : isOpmOutgoingEdit
      ? 'Digital Only'
      : 'Digital Only'
  const draftRouteTags = buildRouteTags({
    presetKeys: routeTagKeys,
    customLabel: customTagLabel,
    customColor: customTagColor,
  })
  const routeActionSummary = routeActions.length ? routeActions.join('; ') : ''
  const routeActionToggleLabel = routeActions.length === 1
    ? routeActions[0]
    : routeActions.length > 1
      ? `${routeActions.length} actions selected`
      : 'Select required action(s)'

  const toggleRouteTag = (tagKey) => {
    const normalizedKey = String(tagKey || '').trim().toUpperCase()
    if (!normalizedKey) return

    setRouteTagKeys((prev) => (
      prev.includes(normalizedKey)
        ? prev.filter((item) => item !== normalizedKey)
        : [...prev, normalizedKey]
    ))
  }

  const toggleRouteAction = (option) => {
    const normalized = String(option || '').trim()
    if (!normalized) return

    setRouteActions((prev) => {
      const exists = prev.includes(normalized)
      if (exists && prev.length === 1) return prev
      return exists ? prev.filter((item) => item !== normalized) : [...prev, normalized]
    })
  }

  const renderDocTags = (tags, className = '') => {
    const normalized = normalizeRouteTags(tags)
    if (normalized.length === 0) return null

    return (
      <div className={`doc-tag-group ${className}`.trim()}>
        {normalized.map((tag) => (
          <span
            key={`${tag.key}-${tag.label}`}
            className={getTagClassName(tag)}
            style={tag.kind === 'custom' ? { backgroundColor: tag.color || DEFAULT_CUSTOM_TAG_COLOR } : undefined}
          >
            {tag.label}
          </span>
        ))}
      </div>
    )
  }
  const persistedRouteAssignments = doc.routeAssignments && typeof doc.routeAssignments === 'object'
    ? doc.routeAssignments
    : {}
  const routedAssignmentDivisionList = [
    doc.oprDivision || doc.mainDivision || doc.targetDivision || '',
    ...supportingDivisionDisplayList,
  ]
    .map((division) => String(division || '').trim())
    .filter(Boolean)
    .filter((division, idx, arr) => arr.indexOf(division) === idx)
  const routingAssignmentSummary = routedAssignmentDivisionList
    .map((division) => {
      const assignedPosition = getAssignedPosition(persistedRouteAssignments, division) || (division === OPM_DIVISION ? String(doc.opmAssignee || '').trim() : '')
      if (!assignedPosition) return ''
      return `${division}: ${assignedPosition}`
    })
    .filter(Boolean)

  useEffect(() => {
    if (!token || (!showPMRoutingModal && !showDelegateModal)) return

    let isCancelled = false

    const loadDivisionPositionCatalog = async () => {
      try {
        const res = await fetch('/api/users/division-positions?includeAll=true', {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return

        const data = await res.json().catch(() => ({}))
        const payload = data?.divisionPositions
        if (!payload || typeof payload !== 'object') return
        if (!isCancelled) {
          setDivisionPositionCatalog(payload)
        }
      } catch {
        // Keep static fallback options if catalog fetch fails.
      }
    }

    loadDivisionPositionCatalog()

    return () => {
      isCancelled = true
    }
  }, [showDelegateModal, showPMRoutingModal, token])

  const allAttachments = doc.attachments || []
  const attachmentPriority = {
    original: 0,
    'stamped-image': 1,
    'stamped-pdf': 2,
  }
  const orderedAttachments = [...allAttachments].sort((a, b) => {
    const pa = attachmentPriority[a?.kind] ?? 99
    const pb = attachmentPriority[b?.kind] ?? 99
    if (pa !== pb) return pa - pb
    return (a?.name || '').localeCompare(b?.name || '')
  })
  const [activeAttachmentKey, setActiveAttachmentKey] = useState('')

  useEffect(() => {
    if (orderedAttachments.length === 0) {
      setActiveAttachmentKey('')
      return
    }
    const keys = orderedAttachments.map((att, i) => att.id || att.name || String(i))
    if (!keys.includes(activeAttachmentKey)) {
      setActiveAttachmentKey(keys[0])
    }
  }, [orderedAttachments, activeAttachmentKey])

  const selectedAttachment = orderedAttachments.find((att, i) => (att.id || att.name || String(i)) === activeAttachmentKey) || orderedAttachments[0]
  const selectedAttachmentKey = selectedAttachment ? (selectedAttachment.id || selectedAttachment.name || '0') : ''
  const selectedExternal = selectedAttachment ? externalFiles[selectedAttachmentKey] : null
  const selectedPreviewUrl = selectedAttachment?.dataUrl || selectedExternal?.url
  const selectedType = selectedAttachment?.type || selectedExternal?.type || ''
  const selectedKindLabel = selectedAttachment?.kind === 'original'
    ? 'Scanned PDF'
    : selectedAttachment?.kind === 'stamped-image'
      ? 'Stamped PNG'
      : selectedAttachment?.kind === 'stamped-pdf'
        ? 'Stamped PDF'
        : (selectedAttachment?.kind || 'Attachment')
  const selectedExternalFolderRaw = selectedAttachment?.externalFolder
  const selectedExternalFolderName = selectedExternalFolderRaw === undefined || selectedExternalFolderRaw === null
    ? (doc?.trackingNumber || '')
    : String(selectedExternalFolderRaw || '').trim()
  const selectedExternalBaseFolderName = String(selectedAttachment?.externalBaseFolder || '').trim()
  const selectedExternalSourceLabel = [selectedExternalBaseFolderName, selectedExternalFolderName].filter(Boolean).join(' / ')

  useEffect(() => {
    setSelectedPdfPage(1)
    setSelectedPdfTotalPages(1)
  }, [selectedAttachmentKey])

  useEffect(() => {
    let canceled = false

    const renderPdfPreview = async () => {
      if (!selectedPreviewUrl || !selectedType.includes('pdf')) {
        setRenderedPdfPreviewUrl('')
        setSelectedPdfTotalPages(1)
        setRenderingPdfPreview(false)
        return
      }

      setRenderingPdfPreview(true)
      try {
        const pdf = await pdfjsLib.getDocument(selectedPreviewUrl).promise
        const total = Math.max(1, pdf.numPages || 1)
        const currentPage = Math.min(Math.max(1, selectedPdfPage), total)
        if (!canceled) {
          setSelectedPdfTotalPages(total)
          if (currentPage !== selectedPdfPage) setSelectedPdfPage(currentPage)
        }

        const page = await pdf.getPage(currentPage)
        const viewport = page.getViewport({ scale: 2 })
        const canvas = document.createElement('canvas')
        canvas.width = viewport.width
        canvas.height = viewport.height
        const ctx = canvas.getContext('2d')
        await page.render({ canvasContext: ctx, viewport }).promise
        if (!canceled) setRenderedPdfPreviewUrl(canvas.toDataURL('image/png'))
      } catch {
        if (!canceled) setRenderedPdfPreviewUrl('')
      } finally {
        if (!canceled) setRenderingPdfPreview(false)
      }
    }

    renderPdfPreview()
    return () => {
      canceled = true
    }
  }, [selectedPreviewUrl, selectedType, selectedPdfPage])

  const revokeExternalUrls = (map) => {
    Object.values(map || {}).forEach(entry => {
      if (entry?.url) URL.revokeObjectURL(entry.url)
    })
  }

  useEffect(() => {
    return () => revokeExternalUrls(externalFiles)
  }, [externalFiles])

  useEffect(() => {
    if (!doc || !currentUser) return
    if (!isIncoming || currentUser?.systemRole !== 'Division') return
    if (!(doc.status === WORKFLOW_STATUS.ROUTED_CONCERNED || doc.status === WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED || doc.status === WORKFLOW_STATUS.REROUTED)) return
    if (!(isUserMainDivision || isUserSupportingDivision || isUserInRoutedDivisionByCode)) return

    const userDivision = currentUser?.division
    if (!userDivision) return

    const existingReceipts = Array.isArray(doc.divisionReceipts) ? doc.divisionReceipts : []
    const existingEntry = existingReceipts.find((entry) => entry?.division === userDivision)
    if (isReceiptAcknowledged(existingEntry) || isReceiptViewed(existingEntry)) return

    const nowIso = new Date().toISOString()
    const nextReceipts = [
      ...existingReceipts.filter((entry) => entry?.division !== userDivision),
      {
        ...existingEntry,
        division: userDivision,
        viewedAt: nowIso,
        viewedBy: currentUser?.name || 'Division Staff',
      },
    ]

    const updates = { divisionReceipts: nextReceipts }

    // Add to routing history if this is a CF Party viewing for the first time
    if (isUserSupportingDivision && !isUserMainDivision) {
      const isAlreadyInRoutingHistory = Array.isArray(doc.routingHistory) && doc.routingHistory.some(entry => 
        entry.office === userDivision && String(entry.action || '').includes('Document viewed by CF Party')
      )
      
      if (!isAlreadyInRoutingHistory) {
        updates.routingHistory = [
          ...(doc.routingHistory || []),
          {
            office: userDivision,
            action: 'Document viewed by CF Party',
            date: nowIso.split('T')[0],
            time: new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
            user: currentUser?.name || 'Division Staff',
            status: 'done',
          }
        ]
      }
    }

    updateDocumentStatus(doc.id, doc.status, updates)
  }, [doc?.id, doc?.status, doc?.divisionReceipts, doc?.routingHistory, currentUser, isIncoming, isUserMainDivision, isUserSupportingDivision, isUserInRoutedDivisionByCode, updateDocumentStatus])

  useEffect(() => {
    if (!doc || !currentUser) return
    if (!isIncoming || currentUser?.systemRole !== 'Division') return
    if (!isUserMainDivision) return
    if (!(doc.status === WORKFLOW_STATUS.ROUTED_CONCERNED || doc.status === WORKFLOW_STATUS.REROUTED)) return
    if (isMainOprAcknowledged || isTaskCompleted) return

    let cancelled = false
    const updateViewing = () => {
      if (cancelled) return
      updateDocumentStatus(doc.id, doc.status, {
        mainOprViewingAt: new Date().toISOString(),
        mainOprViewingBy: currentUser?.name || 'Main OPR',
      })
    }

    updateViewing()
    const intervalId = window.setInterval(updateViewing, 20000)

    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      updateDocumentStatus(doc.id, doc.status, { mainOprViewingAt: '', mainOprViewingBy: '' })
    }
  }, [doc?.id, doc?.status, currentUser, isIncoming, isUserMainDivision, isMainOprAcknowledged, isTaskCompleted, updateDocumentStatus])

  const loadExternalAttachmentFiles = async (dirHandle) => {
    const next = {}
    for (const att of (doc.attachments || [])) {
      if (!att?.savedToExternal) continue
      const key = att.id || att.name
      try {
        const rawExternalFolder = att.externalFolder
        const folderName = rawExternalFolder === undefined || rawExternalFolder === null
          ? doc.trackingNumber
          : String(rawExternalFolder || '').trim()
        const baseFolderName = String(att.externalBaseFolder || '').trim()
        let baseHandle = dirHandle
        if (baseFolderName) {
          try {
            baseHandle = await dirHandle.getDirectoryHandle(baseFolderName)
          } catch {
            baseHandle = dirHandle
          }
        }

        let fileParentHandle = baseHandle
        if (folderName) {
          try {
            fileParentHandle = await baseHandle.getDirectoryHandle(folderName)
          } catch {
            fileParentHandle = baseHandle
          }
        }

        const fileHandle = await fileParentHandle.getFileHandle(att.name)
        const file = await fileHandle.getFile()
        next[key] = {
          name: file.name,
          type: file.type || att.type,
          url: URL.createObjectURL(file),
        }
      } catch {
        // Skip missing files to allow partial rendering.
      }
    }
    revokeExternalUrls(externalFiles)
    setExternalFiles(next)
  }

  const linkExternalFolder = async () => {
    if (!window.showDirectoryPicker) {
      toast.error('This browser does not support folder linking for external previews.')
      return
    }
    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'read' })
      externalDirRef.current = dirHandle
      setExternalDirLabel(dirHandle.name || 'Linked folder')
      await loadExternalAttachmentFiles(dirHandle)
      toast.success(`Linked folder: ${dirHandle.name}`)
    } catch {
      toast.error('Folder link canceled.')
    }
  }

  // react-to-print for reliable component printing
  const handlePrintSlip = useReactToPrint({
    contentRef: transmittalRef,
    documentTitle: `Transmittal_${doc.trackingNumber}`,
    pageStyle: `
      @page { size: letter; margin: 0.15in; }
      @media print {
        body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; margin: 0; padding: 0; }
        body > div { width: 7.85in !important; font-size: 9pt !important; line-height: 1.28 !important; }
        body > div > div { font-size: inherit !important; }
        .main-division-marker { font-size: 8.6pt !important; font-weight: 800 !important; color: #dc3545 !important; }
      }
    `,
  })

  const printTransmittal = () => {
    const transmittalMarkup = renderToStaticMarkup(
      <IncomingTransmittalSlip
        {...transmittalSlipProps}
        isPrint
      />,
    )

    const result = openIncomingTransmittalPrintWindow({
      trackingNumber: doc.trackingNumber,
      subject: doc.subject,
      transmittalMarkup,
    })

    if (!result.ok) {
      if (result.reason === 'missing-markup') {
        toast.error('Transmittal preview is not ready yet.')
      } else if (result.reason === 'popup-blocked') {
        toast.error('Please allow pop-ups to print the transmittal slip.')
      } else {
        toast.error('Unable to open transmittal print preview.')
      }
    }
  }

  const addInstructionComment = () => {
    const trimmed = instructionInput.trim()
    if (!trimmed) {
      toast.error('Please enter a comment first.')
      return
    }

    const newCommentObj = {
      id: `INS-${Date.now()}`,
      roleLabel,
      name: commenterName,
      comment: trimmed,
      createdAt: new Date().toISOString(),
    }

    sendChatMessage(doc.id, newCommentObj, 'instructionComments')

    setInstructionInput('')
    toast.success('Instruction comment added.')
  }

  const addReplyComment = () => {
    const trimmed = replyInput.trim()
    if (!trimmed) {
      toast.error('Please enter a reply first.')
      return
    }

    const newReplyObj = {
      id: `RPL-${Date.now()}`,
      roleLabel,
      name: commenterName,
      comment: trimmed,
      createdAt: new Date().toISOString(),
    }

    sendChatMessage(doc.id, newReplyObj, 'replyComments')

    setReplyInput('')
    toast.success('Reply comment added.')
  }

  const openPMRoutingModal = (mode = 'pm') => {
    const selected = Array.isArray(doc.targetDivisions)
      ? doc.targetDivisions.filter(Boolean)
      : (doc.targetDivision ? [doc.targetDivision] : [])

    const docMain = doc.mainDivision || doc.oprDivision || selected[0] || ''
    const selectedDraftDivisions = [
      docMain,
      ...selected.filter((division) => division && division !== docMain),
    ].filter(Boolean)
    const initialDraftAssignments = buildRouteAssignments({
      divisions: selectedDraftDivisions,
      routeAssignments: doc.routeAssignments,
      opmAssignee: doc.opmAssignee || '',
    })
    const resolvedOpmAssignee = getAssignedPosition(initialDraftAssignments, OPM_DIVISION) || String(doc.opmAssignee || '').trim()

    setMainRouteDivision(docMain)
    setRouteToDivisions(selected.filter((division) => division && division !== docMain))
    setRouteActions(normalizeTransmittalActions(doc.action))
    setRouteInstructions(doc.pmTransmittalInstructions || '')
    const { presetKeys, customTag } = splitRouteTags(doc.routeTags)
    setRouteTagKeys(presetKeys)
    setCustomTagLabel(customTag?.label || '')
    setCustomTagColor(customTag?.color || DEFAULT_CUSTOM_TAG_COLOR)
    setRouteDeliveryMethod((mode === 'opm-finalize-edit' || mode === 'opm-outgoing-edit') ? inferInitialRoutingMethod(doc) : 'both')
    setRouteAssignmentDraft(initialDraftAssignments)
    setOpmAssignee(resolvedOpmAssignee)
    setRoutingMode(mode)
    setShowPMRoutingModal(true)
  }

  const closePMRoutingModal = () => {
    if (routingToDivision) return
    setShowPMRoutingModal(false)
    setRouteAssignmentDraft({})
    setOpmAssignee('')
    setRouteTagKeys([])
    setCustomTagLabel('')
    setCustomTagColor(DEFAULT_CUSTOM_TAG_COLOR)
    setRoutingMode('pm')
    setRouteDeliveryMethod('both')
    setRouteActions([TRANSMITTAL_ACTION_OPTIONS[0]])
  }

  const getDivisionAssignmentValue = (division) => {
    const assignedPosition = getAssignedPosition(routeAssignmentDraft, division)
    if (assignedPosition) return assignedPosition
    if (division === OPM_DIVISION) return String(opmAssignee || '').trim()
    return ''
  }

  const setDivisionAssignment = (division, position) => {
    const cleanDivision = String(division || '').trim()
    if (!cleanDivision) return

    const nextPosition = String(position || '')
    setRouteAssignmentDraft((prev) => ({
      ...prev,
      [cleanDivision]: { position: nextPosition },
    }))

    if (cleanDivision === OPM_DIVISION) {
      setOpmAssignee(nextPosition)
    }
  }

  const getOpmDefaultAssignee = () => {
    const options = getDivisionPositionOptionsFromCatalog(OPM_DIVISION, divisionPositionCatalog)
    const manager = options.find((position) => normalizeDivisionValue(position) === 'division manager a')
    return manager || options[0] || ''
  }

  const openDelegateModal = () => {
    setSelectedPersonnel(String(doc.assignedTo || ''))
    setDmInstructions('')
    setShowDelegateModal(true)
  }

  const closeDelegateModal = () => {
    if (delegatingTask) return
    setShowDelegateModal(false)
    setSelectedPersonnel('')
    setDmInstructions('')
  }

  const handleDelegateTask = async () => {
    if (delegatingTask) return

    const assignedPersonnel = String(selectedPersonnel || '').trim()
    const localizedInstruction = String(dmInstructions || '').trim()

    if (!assignedPersonnel) {
      toast.error('Please select personnel to assign.')
      return
    }

    if (!localizedInstruction) {
      toast.error('Please add localized instructions/remarks.')
      return
    }

    setDelegatingTask(true)

    const now = new Date()
    const nowIso = now.toISOString()
    const delegatedDivision = String(currentUser?.division || '').trim()
    const nextRouteAssignments = delegatedDivision
      ? {
          ...persistedRouteAssignments,
          [delegatedDivision]: { position: assignedPersonnel },
        }
      : persistedRouteAssignments
    const delegationCommentText = '[Assigned to: ' + assignedPersonnel + '] ' + localizedInstruction
    const nextInstructionComments = [
      ...(Array.isArray(doc.instructionComments) ? doc.instructionComments : []),
      {
        id: 'INS-' + Date.now(),
        roleLabel: currentUser?.division || 'Division',
        role: currentUser?.division || 'Division',
        name: currentUser?.name || 'Division Manager',
        authorName: currentUser?.name || 'Division Manager',
        comment: delegationCommentText,
        text: delegationCommentText,
        createdAt: nowIso,
      },
    ]

    const updateOk = await updateDocumentStatus(doc.id, doc.status, {
      assignedTo: assignedPersonnel,
      assignedBy: currentUser?.name || 'Division Manager',
      assignedDivision: currentUser?.division || '',
      assignedAt: nowIso,
      routeAssignments: nextRouteAssignments,
      instructionComments: nextInstructionComments,
      routingHistory: [
        ...(doc.routingHistory || []),
        {
          office: currentUser?.division || 'Division',
          action: 'Delegated task to ' + assignedPersonnel + '; Localized instructions added',
          date: nowIso.split('T')[0],
          time: now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
          user: currentUser?.name || 'Division Manager',
          status: 'done',
        },
      ],
    })

    if (!updateOk) {
      toast.error('Failed to assign task. Please try again.')
      setDelegatingTask(false)
      return
    }

    toast.success(
      <div>
        <strong>Task delegated!</strong><br />
        {doc.trackingNumber} assigned to {assignedPersonnel}.
      </div>,
      { duration: 4000 },
    )

    setDelegatingTask(false)
    closeDelegateModal()
  }

  const openCompleteModal = () => {
    setActionTaken(String(doc.actionTaken || ''))
    setCompletionFile(null)
    setShowCompleteModal(true)
  }

  const closeCompleteModal = () => {
    if (completingTask) return
    setShowCompleteModal(false)
    setActionTaken('')
    setCompletionFile(null)
  }

  const handleCompleteTask = async () => {
    if (completingTask) return

    const completionDetails = String(actionTaken || '').trim()
    if (!completionDetails) {
      toast.error('Please provide details for action/s taken.')
      return
    }

    setCompletingTask(true)

    const now = new Date()
    const nowIso = now.toISOString()
    let completionAttachmentName = ''
    let completionAttachmentFileName = ''
    let completionAttachmentUrl = ''
    let completionAttachmentStorageFolder = ''

    if (completionFile) {
      try {
        const dataUrl = await readFileAsDataUrl(completionFile)
        const uploadResponse = await authFetch(`/api/documents/${doc.id}/completion-proof`, {
          method: 'POST',
          body: JSON.stringify({
            name: completionFile.name,
            type: completionFile.type || 'application/octet-stream',
            size: completionFile.size || 0,
            dataUrl,
          }),
        })
        const uploadData = await uploadResponse.json().catch(() => ({}))

        if (!uploadResponse.ok) {
          throw new Error(uploadData.error || 'Failed to upload completion proof.')
        }

        completionAttachmentName = String(uploadData.originalName || completionFile.name || '').trim()
        completionAttachmentFileName = String(uploadData.fileName || '').trim()
        completionAttachmentStorageFolder = String(uploadData.storageFolder || '').trim()
        completionAttachmentUrl = buildCompletionProofUrl(
          doc.trackingNumber,
          completionAttachmentFileName,
          completionAttachmentStorageFolder
        )
      } catch (err) {
        toast.error(err?.message || 'Failed to upload completion proof.')
        setCompletingTask(false)
        return
      }
    }

    const completionHistoryAction =
      'Task completed. Action taken: ' + completionDetails +
      (completionAttachmentName ? '; Proof: ' + completionAttachmentName : '')

    const updateOk = await updateDocumentStatus(doc.id, 'Completed', {
      actionTaken: completionDetails,
      completionAttachment: completionAttachmentName,
      completionAttachmentFileName,
      completionAttachmentUrl,
      completionAttachmentStorageFolder,
      completedBy: currentUser?.name || 'Division Staff',
      completedAt: nowIso,
      routingHistory: [
        ...(doc.routingHistory || []),
        {
          office: currentUser?.division || 'Division',
          action: completionHistoryAction,
          date: nowIso.split('T')[0],
          time: now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
          user: currentUser?.name || 'Division Staff',
          status: 'done',
        },
      ],
    })

    if (!updateOk) {
      toast.error('Failed to close document. Please try again.')
      setCompletingTask(false)
      return
    }

    toast.success(
      <div>
        <strong>Task completed!</strong><br />
        {doc.trackingNumber} status updated to Completed.
      </div>,
      { duration: 4000 },
    )

    setCompletingTask(false)
    closeCompleteModal()
  }

  const toggleRouteDivision = (division) => {
    if (division === mainRouteDivision) return

    const isSelected = routeToDivisions.includes(division)
    setRouteToDivisions((prev) =>
      prev.includes(division)
        ? prev.filter((item) => item !== division)
        : [...prev, division]
    )

    if (isSelected) {
      setRouteAssignmentDraft((prev) => {
        if (!Object.prototype.hasOwnProperty.call(prev, division)) return prev
        const next = { ...prev }
        delete next[division]
        return next
      })

      if (division === OPM_DIVISION) {
        setOpmAssignee('')
      }
    } else if (division === OPM_DIVISION && mainRouteDivision !== OPM_DIVISION) {
      const defaultAssignee = getOpmDefaultAssignee()
      if (defaultAssignee) {
        setDivisionAssignment(OPM_DIVISION, defaultAssignee)
      }
    }
  }

  const selectMainRouteDivision = (division) => {
    const opmAsCfParty = division !== OPM_DIVISION && routeToDivisions.includes(OPM_DIVISION)
    setMainRouteDivision(division)
    setRouteToDivisions((prev) => prev.filter((item) => item !== division))
    setRouteAssignmentDraft((prev) => {
      if (!division || Object.prototype.hasOwnProperty.call(prev, division)) return prev
      return {
        ...prev,
        [division]: { position: division === OPM_DIVISION ? String(opmAssignee || '') : '' },
      }
    })

    if (opmAsCfParty) {
      const defaultAssignee = getOpmDefaultAssignee()
      if (defaultAssignee) {
        setDivisionAssignment(OPM_DIVISION, defaultAssignee)
      }
    }
  }

  const submitPMRoute = async (method) => {
    if (routingToDivision) return
    const isOpmReroute = routingMode === 'opm-reroute'
    const isOpmFinalizeEdit = routingMode === 'opm-finalize-edit'
    const isOpmOutgoingEdit = isOpmFinalizeEdit || routingMode === 'opm-outgoing-edit'
    const isPostFinalizeEdit = routingMode === 'opm-outgoing-edit'

    const normalizedMethod = method === 'digital' ? 'digital' : method === 'both' ? 'both' : ''
    if (!normalizedMethod) {
      toast.error('PM routing supports only Physical + Digital or Digital Only.')
      return
    }

    if (!mainRouteDivision) {
      toast.error('Please select one main division.')
      return
    }

    if (!routeActionSummary) {
      toast.error('Please select at least one required action.')
      return
    }

    const finalDivisions = [mainRouteDivision, ...routeToDivisions.filter((division) => division !== mainRouteDivision)]
    const normalizedRouteAssignments = buildPmRouteAssignments({
      divisions: finalDivisions,
      runtimeCatalog: divisionPositionCatalog,
      opmAssignee,
    })
    const mainDivisionPosition = getAssignedPosition(normalizedRouteAssignments, mainRouteDivision)
    const resolvedOpmAssignee = getAssignedPosition(normalizedRouteAssignments, OPM_DIVISION)

    if (!mainDivisionPosition) {
      toast.error('Please assign a position for the Main OPR division.')
      return
    }

    if (hasOpmSelection && !resolvedOpmAssignee) {
      toast.error('Please assign an OPM position.')
      return
    }

    const assignmentSummary = finalDivisions
      .map((division) => {
        const position = getAssignedPosition(normalizedRouteAssignments, division)
        return position ? `${division} -> ${position}` : ''
      })
      .filter(Boolean)
      .join(' | ')

    const routedDivisionLabel = finalDivisions.join(', ')
    const now = new Date()
    const normalizedFinalDivisions = finalDivisions.map(normalizeDivisionValue)
    const divisionSet = new Set(normalizedFinalDivisions)
    const existingReceipts = Array.isArray(doc.divisionReceipts)
      ? doc.divisionReceipts.filter((entry) => entry?.division)
      : []
    const preservedReceipts = (isOpmReroute || isOpmOutgoingEdit)
      ? existingReceipts.filter((entry) => divisionSet.has(normalizeDivisionValue(entry.division)))
      : []
    const statusLabel = isOpmReroute
      ? WORKFLOW_STATUS.REROUTED
      : isPostFinalizeEdit
        ? WORKFLOW_STATUS.ROUTED_CONCERNED
        : WORKFLOW_STATUS.PENDING_OPM_FINALIZATION
    const actionLabel = isOpmReroute
      ? 'Re-routed by OPM Secretary'
      : isOpmOutgoingEdit
        ? 'Updated by OPM Secretary (OPM Outgoing Review)'
        : 'Routed by PM (OPM Outgoing Review)'

    setRoutingToDivision(true)
    const updateOk = await updateDocumentStatus(doc.id, statusLabel, {
      targetDivision: mainRouteDivision,
      mainDivision: mainRouteDivision,
      oprDivision: mainRouteDivision,
      targetDivisions: finalDivisions,
      supportingDivisions: routeToDivisions,
      routeAssignments: normalizedRouteAssignments,
      oprAssignment: {
        division: mainRouteDivision,
        position: mainDivisionPosition,
      },
      currentLocation: finalDivisions.length > 1 ? 'Multiple Divisions' : mainRouteDivision,
      action: routeActionSummary,
      pmTransmittalInstructions: routeInstructions,
      routeTags: draftRouteTags,
      opmAssignee: resolvedOpmAssignee || '',
      divisionReceipts: preservedReceipts,
      mainOprViewingAt: '',
      mainOprViewingBy: '',
      routingHistory: [
        ...(doc.routingHistory || []),
        {
          office: routedDivisionLabel,
          action: `${actionLabel} (${normalizedMethod === 'both' ? 'Physical + Digital' : 'Digital assignment'}) — OPR/Main: ${mainRouteDivision}; Action: ${routeActionSummary}${routeInstructions ? `; Instructions: ${routeInstructions}` : ''}${assignmentSummary ? `; Assignments: ${assignmentSummary}` : ''}`,
          date: now.toISOString().split('T')[0],
          time: now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
          user: currentUser?.name || (isOpmReroute ? 'OPM Secretary' : 'PM'),
          status: 'done',
        },
      ],
    })

    if (!updateOk) {
      toast.error('Failed to route document. Please try again.')
      setRoutingToDivision(false)
      return
    }

    toast.success(
      <div>
        <strong>{
          isOpmReroute
            ? 'Re-routed to'
            : isOpmOutgoingEdit
              ? 'Updated OPM Outgoing (OPM Outgoing Review)'
              : 'Routed to (OPM Outgoing Review)'
        } {finalDivisions.length > 1 ? `${finalDivisions.length} divisions` : mainRouteDivision}!</strong><br />
        {doc.trackingNumber} ({normalizedMethod === 'both' ? 'Physical + Digital' : 'Digital assignment'})
      </div>,
      { duration: 4000 }
    )

    setRoutingToDivision(false)
    setShowPMRoutingModal(false)
    setRouteAssignmentDraft({})
    setOpmAssignee('')
    setRouteTagKeys([])
    setCustomTagLabel('')
    setCustomTagColor(DEFAULT_CUSTOM_TAG_COLOR)
    setRoutingMode('pm')
    setRouteDeliveryMethod('both')
    setRouteActions([TRANSMITTAL_ACTION_OPTIONS[0]])
  }

  const handleFinalizeRouting = async () => {
    if (finalizingRoute) return
    setFinalizingRoute(true)

    const divisions = Array.isArray(doc.targetDivisions) && doc.targetDivisions.length > 0
      ? doc.targetDivisions.filter(Boolean)
      : (doc.targetDivision ? [doc.targetDivision] : [])
    const resolvedLocation = divisions.length > 1
      ? 'Multiple Divisions'
      : (doc.targetDivision || doc.mainDivision || divisions[0] || 'Division')
    const now = new Date()
    const updateOk = await updateDocumentStatus(doc.id, WORKFLOW_STATUS.ROUTED_CONCERNED, {
      currentLocation: resolvedLocation,
      mainOprViewingAt: '',
      mainOprViewingBy: '',
      routingHistory: [
        ...(doc.routingHistory || []),
        {
          office: resolvedLocation,
          action: 'Finalized by OPM Secretary — released to divisions',
          date: now.toISOString().split('T')[0],
          time: now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
          user: currentUser?.name || 'OPM Secretary',
          status: 'done',
        },
      ],
    })

    if (!updateOk) {
      toast.error('Failed to finalize routing. Please try again.')
      setFinalizingRoute(false)
      return
    }

    toast.success('Routing finalized. Divisions can now view the document.')
    setFinalizingRoute(false)
  }

  const closeEndorseModal = () => {
    if (endorsingToOpm) return
    setShowEndorseModal(false)
    setEndorseRemarks('')
    setGenerateTransmittal(true)
  }

  const showUndoableStatusToast = ({ title, detail, onUndo }) => {
    toast((t) => (
      <div style={{ minWidth: 280 }}>
        <div className="fw-semibold" style={{ fontSize: 13 }}>{title}</div>
        <div style={{ fontSize: 12, color: '#495057', marginTop: 2 }}>{detail}</div>
        <div style={{ fontSize: 11, color: '#6c757d', marginTop: 4 }}>
          Closing this notice keeps the endorsement. Use Undo to revert.
        </div>
        <div className="d-flex justify-content-end gap-2 mt-2">
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            onClick={() => toast.dismiss(t.id)}
          >
            Keep Endorsed
          </button>
          <button
            type="button"
            className="btn btn-sm btn-primary"
            onClick={async () => {
              toast.dismiss(t.id)
              const undoOk = await onUndo()
              if (undoOk) {
                toast.success('Last endorsement was reverted.')
              } else {
                toast.error('Undo failed. Please try again.')
              }
            }}
          >
            Undo
          </button>
        </div>
      </div>
    ), { duration: 10000 })
  }

  const handleEndorseToOpm = async () => {
    if (endorsingToOpm) return

    setEndorsingToOpm(true)

    const now = new Date()
    const nowIso = now.toISOString()

    const resolveRegistrationStart = () => {
      const registeredAtRaw = String(doc.registeredAt || '').trim()
      if (registeredAtRaw) {
        const parsed = new Date(registeredAtRaw)
        if (!Number.isNaN(parsed.getTime())) return parsed
      }

      const stampedDate = String(doc.stampedDate || doc.dateReceived || '').trim()
      const stampedTime = String(doc.stampedTime || doc.timeReceived || '').trim()
      if (stampedDate) {
        const parsed = new Date(`${stampedDate}T${stampedTime || '00:00'}`)
        if (!Number.isNaN(parsed.getTime())) return parsed
      }

      return null
    }

    const registrationStart = resolveRegistrationStart()
    const hasRegistrationStart = registrationStart instanceof Date
    const processingTimeMinutes = hasRegistrationStart
      ? Number(Math.max(0, (now.getTime() - registrationStart.getTime()) / 60000).toFixed(2))
      : 0
    const slaMet = hasRegistrationStart ? processingTimeMinutes <= 15 : false
    const processingTimeLabel = hasRegistrationStart ? `${processingTimeMinutes} mins` : 'N/A'
    const slaLabel = hasRegistrationStart ? (slaMet ? 'MET' : 'BREACHED') : 'UNKNOWN'

    const previousStatus = doc.status
    const rollbackPayload = {
      currentLocation: doc.currentLocation || 'Records Section',
      targetDivision: doc.targetDivision || '',
      processingTimeMinutes: doc.processingTimeMinutes ?? null,
      slaMet: typeof doc.slaMet === 'boolean' ? doc.slaMet : null,
      instructionComments: Array.isArray(doc.instructionComments) ? [...doc.instructionComments] : [],
      routingHistory: Array.isArray(doc.routingHistory) ? [...doc.routingHistory] : [],
    }

    const trimmedRemarks = endorseRemarks.trim()
    const nextInstructionComments = trimmedRemarks
      ? [
          ...(Array.isArray(doc.instructionComments) ? doc.instructionComments : []),
          {
            id: `INS-${Date.now()}`,
            roleLabel: 'RECORDS',
            name: currentUser?.name || 'Records Section',
            comment: trimmedRemarks,
            remarkType: 'records-endorse-to-opm',
            createdAt: nowIso,
          },
        ]
      : doc.instructionComments

    const updateOk = await updateDocumentStatus(doc.id, WORKFLOW_STATUS.OPM_INITIAL_REVIEW, {
      currentLocation: 'Office of the Port Manager (OPM)',
      targetDivision: 'Office of the Port Manager (OPM)',
      processingTimeMinutes,
      slaMet,
      instructionComments: nextInstructionComments,
      routingHistory: [
        ...(doc.routingHistory || []),
        {
          office: 'Office of the Port Manager (OPM)',
          action: `Endorsed to OPM for initial review (files, transmittal details, complete record); Processing time: ${processingTimeLabel}; SLA: ${slaLabel}`,
          date: now.toISOString().split('T')[0],
          time: now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
          user: currentUser?.name || 'Records Section',
          status: 'done',
        },
      ],
    })

    if (!updateOk) {
      toast.error('Failed to send document to OPM.')
      setEndorsingToOpm(false)
      return
    }

    showUndoableStatusToast({
      title: 'Sent to OPM!',
      detail: `${doc.trackingNumber} -> Office of the Port Manager (initial review)`,
      onUndo: async () => updateDocumentStatus(doc.id, previousStatus, rollbackPayload),
    })

    if (generateTransmittal) {
      toast('Transmittal slip remains available in this document view.', { icon: 'i' })
    }

    setShowEndorseModal(false)
    setEndorseRemarks('')
    setGenerateTransmittal(true)
    setEndorsingToOpm(false)

    // Keep UI snappy, then refresh in background to pull latest server state.
    setTimeout(() => {
      refreshDocuments()
    }, 0)
  }

  const handleEndorseToPM = async () => {
    if (endorsingToPM) return
    setEndorsingToPM(true)

    const now = new Date()
    const nowIso = now.toISOString()
    const previousStatus = doc.status
    const rollbackPayload = {
      currentLocation: doc.currentLocation || OPM_DIVISION,
      targetDivision: doc.targetDivision || OPM_DIVISION,
      instructionComments: Array.isArray(doc.instructionComments) ? [...doc.instructionComments] : [],
      routingHistory: Array.isArray(doc.routingHistory) ? [...doc.routingHistory] : [],
    }
    const trimmedRemarks = assistantRemarks.trim()

    const targetTitle = isEndorsingToOic ? 'Officer-in-Charge (OIC)' : 'Port Manager (PM)'
    const authAction = trimmedRemarks
      ? `Verified by OPM and forwarded to ${isEndorsingToOic ? 'OIC' : 'PM'}; Remarks: ${trimmedRemarks}`
      : `Verified by OPM and forwarded to ${isEndorsingToOic ? 'OIC' : 'PM'}`

    const delegationCommentText = '[OPM endorsement remark] ' + trimmedRemarks
    const nextInstructionComments = trimmedRemarks
      ? [
          ...(Array.isArray(doc.instructionComments) ? doc.instructionComments : []),
          {
            id: `INS-${Date.now()}`,
            roleLabel: 'OPM',
            name: currentUser?.name || 'OPM',
            comment: delegationCommentText,
            text: delegationCommentText,
            authorName: currentUser?.name || 'OPM',
            remarkType: 'opm-endorse-to-pm',
            createdAt: nowIso,
          },
        ]
      : doc.instructionComments

    const updateOk = await updateDocumentStatus(doc.id, WORKFLOW_STATUS.PM_REVIEW, {
      currentLocation: targetTitle,
      targetDivision: targetTitle,
      instructionComments: nextInstructionComments,
      routingHistory: [
        ...(doc.routingHistory || []),
        {
          office: targetTitle,
          action: authAction,
          date: nowIso.split('T')[0],
          time: now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
          user: currentUser?.name || 'OPM',
          status: 'done',
        },
      ],
    })

    if (!updateOk) {
      toast.error('Failed to send document to PM.')
      setEndorsingToPM(false)
      return
    }

    showUndoableStatusToast({
      title: 'Document Forwarded to PM!',
      detail: `${doc.trackingNumber} -> Port Manager (PM)`,
      onUndo: async () => updateDocumentStatus(doc.id, previousStatus, rollbackPayload),
    })

    setShowAssistantEndorseModal(false)
    setAssistantRemarks('')
    setEndorsingToPM(false)
    
    setTimeout(() => {
      refreshDocuments()
    }, 0)
  }

  const parseScannedTracking = (rawValue) => {
    const raw = String(rawValue || '').trim()
    if (!raw) return ''
    const parts = raw.split('|')
    return parts.length >= 2 ? String(parts[1] || '').trim() : raw
  }

  const stopQrCamera = async () => {
    if (qrScannerRef.current) {
      try {
        await qrScannerRef.current.stop()
      } catch {
        // Scanner may already be stopped.
      }
      try {
        await qrScannerRef.current.clear()
      } catch {
        // Clear can fail if scanner did not start.
      }
      qrScannerRef.current = null
    }
    setQrCameraActive(false)
  }

  const closeQrReceiveModal = () => {
    stopQrCamera()
    setShowQrReceiveModal(false)
    setQrCameraError('')
  }

  const completeQrReceive = (scannedRaw, source) => {
    const scannedTracking = parseScannedTracking(scannedRaw)
    if (!scannedTracking) {
      toast.error('Value is required before acknowledgement.')
      return false
    }
    if (!isUserMainDivision) {
      toast.error('Only the main OPR can acknowledge via QR scan.')
      return false
    }
    if (source !== 'camera') {
      toast.error('Scan the transmittal QR to acknowledge this document.')
      return false
    }
    if (scannedTracking !== doc.trackingNumber) {
      toast.error(`Mismatch. Expected ${doc.trackingNumber}.`)
      return false
    }

    const existingReceipts = Array.isArray(doc.divisionReceipts)
      ? doc.divisionReceipts.filter((entry) => entry?.division)
      : []
    const userDivision = currentUser?.division || 'Division'
    const existingEntry = existingReceipts.find((entry) => entry.division === userDivision)
    const nowIso = new Date().toISOString()
    const nextReceipts = [
      ...existingReceipts.filter((entry) => entry.division !== userDivision),
      {
        ...existingEntry,
        division: userDivision,
        method: 'digital',
        source,
        scannedValue: scannedRaw,
        scannedTracking,
        verifiedBy: currentUser?.name || 'Division Staff',
        verifiedAt: nowIso,
        viewedAt: existingEntry?.viewedAt || nowIso,
        viewedBy: existingEntry?.viewedBy || currentUser?.name || 'Division Staff',
      },
    ]
    const fullyAcknowledged = routedDivisions.length > 0
      ? routedDivisions.every((division) => nextReceipts.some((entry) => entry.division === division && isReceiptAcknowledged(entry)))
      : true

    const actionText = fullyAcknowledged
      ? 'QR-verified transmittal receipt recorded, then Fully Received & Acknowledged'
      : 'QR-verified transmittal receipt recorded'

    const nextStatus = fullyAcknowledged
      ? WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED
      : (doc.status === WORKFLOW_STATUS.REROUTED ? WORKFLOW_STATUS.REROUTED : WORKFLOW_STATUS.ROUTED_CONCERNED)
    updateDocumentStatus(doc.id, nextStatus, {
      qrReceipt: {
        method: 'digital',
        source,
        scannedValue: scannedRaw,
        scannedTracking,
        verifiedBy: currentUser?.name || 'Division Staff',
        verifiedAt: nowIso,
      },
      divisionReceipts: nextReceipts,
      routingHistory: [
        ...(doc.routingHistory || []),
        {
          office: currentUser?.division || 'Division',
          action: actionText,
          date: new Date().toISOString().split('T')[0],
          time: new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
          user: currentUser?.name || 'Division Staff',
          status: 'done',
        },
      ],
    })

    toast.success(
      <div>
        <strong>{fullyAcknowledged ? 'Fully Received & Acknowledged!' : 'Division Receipt Recorded!'}</strong><br />
        {doc.trackingNumber} received digitally by {currentUser?.division || 'division'}.
      </div>,
      { duration: 4000 }
    )
    return true
  }

  const openQrCameraOpm = async () => {
    setShowQrReceiveModal(true)
    setQrCameraError('')
    setQrCameraActive(false)

    await new Promise((resolve) => setTimeout(resolve, 400))
    const elementExists = document.getElementById(qrScannerElementId)
    if (!elementExists) {
      setQrCameraError('Camera preview element not ready. Please close and try again.')
      return
    }
    try {
      const scanner = new Html5Qrcode(qrScannerElementId)
      qrScannerRef.current = scanner

      const onSuccess = (decodedText) => {
        const scannedTracking = parseScannedTracking(decodedText)
        if (scannedTracking === doc.trackingNumber) {
           setIsQrScannedOpm(true)
           closeQrReceiveModal()
           toast.success('Physical QR Verified!')
        } else {
           toast.error(`QR mismatch. Expected ${doc.trackingNumber}.`)
        }
      }
      const onError = () => {} 

      try {
        await scanner.start({ facingMode: 'environment' }, { fps: 10, qrbox: { width: 220, height: 220 } }, onSuccess, onError)
        setQrCameraActive(true)
        return
      } catch {}

      try {
        const cameras = await Html5Qrcode.getCameras()
        if (cameras && cameras.length > 0) {
          await scanner.start(cameras[0].id, { fps: 10, qrbox: { width: 220, height: 220 } }, onSuccess, onError)
          setQrCameraActive(true)
          return
        }
      } catch {}

      setQrCameraError('No camera found. Please connect a camera, allow permission, and try again.')
    } catch (err) {
      setQrCameraError('Unable to open QR camera scanner. Please allow camera permission and use HTTPS/localhost.')
    }
  }

  const openQrCamera = async () => {
    setShowQrReceiveModal(true)
    setQrCameraError('')
    setQrCameraActive(false)

    // Wait for modal DOM element to render before starting scanner
    await new Promise((resolve) => setTimeout(resolve, 400))

    const elementExists = document.getElementById(qrScannerElementId)
    if (!elementExists) {
      setQrCameraError('Camera preview element not ready. Please close and try again.')
      return
    }

    try {
      const scanner = new Html5Qrcode(qrScannerElementId)
      qrScannerRef.current = scanner

      const onSuccess = (decodedText) => {
        if (completeQrReceive(decodedText, 'camera')) {
          closeQrReceiveModal()
        }
      }
      const onError = () => {} // Ignore scan-miss errors

      // Try facingMode first (avoids double permission prompt from getCameras)
      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          onSuccess,
          onError
        )
        setQrCameraActive(true)
        return
      } catch {
        // facingMode failed — fall back to camera list
      }

      // Fallback: enumerate cameras and pick the first one
      try {
        const cameras = await Html5Qrcode.getCameras()
        if (cameras && cameras.length > 0) {
          const cameraId = cameras[0].id
          await scanner.start(
            cameraId,
            { fps: 10, qrbox: { width: 220, height: 220 } },
            onSuccess,
            onError
          )
          setQrCameraActive(true)
          return
        }
      } catch {
        // Camera enumeration also failed
      }

      setQrCameraError('No camera found. Please connect a camera, allow permission, and try again.')
    } catch (err) {
      setQrCameraError('Unable to open QR camera scanner. Please allow camera permission and use HTTPS/localhost.')
    }
  }

  useEffect(() => {
    return () => {
      stopQrCamera()
    }
  }, [])

  const userReceipt = Array.isArray(doc.divisionReceipts)
    ? doc.divisionReceipts.find((entry) => entry?.division === currentUser?.division)
    : null
  const hasUserAcknowledged = Boolean(userReceipt && isReceiptAcknowledged(userReceipt))

  return (
    <div className="doc-detail-page">
      <div className="page-header doc-detail-header d-flex justify-content-between align-items-start no-print">
        <div>
          <h4>
            <span className="tracking-number" style={{ fontSize: 20 }}>{doc.trackingNumber}</span>
          </h4>
          <p>{doc.subject}</p>
        </div>
        <div className="d-flex gap-2 doc-detail-header-actions">
          {canOperatorEndorseToOpm && (
            <Button size="sm" className="doc-detail-primary-action" onClick={() => setShowEndorseModal(true)}>
              <i className="bi bi-send me-1"></i>Endorse to OPM
            </Button>
          )}
          {operatorAlreadyEndorsed && (
            <Button size="sm" variant="outline-success" className="doc-detail-pill" disabled title={`Current status: ${getStatusDisplayLabel(doc.status)}`}>
              <i className="bi bi-check2-circle me-1"></i>Already Endorsed to OPM
            </Button>
          )}
          {canOpmFinalize && (
            <Button size="sm" variant="outline-success" onClick={handleFinalizeRouting} disabled={finalizingRoute}>
              <i className={finalizingRoute ? 'bi bi-hourglass-split me-1' : 'bi bi-check2-circle me-1'}></i>
              {finalizingRoute ? 'Proceeding...' : 'Proceed to OPR/s'}
            </Button>
          )}
          {canOpmEditOutgoing && (
            <Button
              size="sm"
              variant="outline-secondary"
              onClick={() => openPMRoutingModal(
                doc.status === WORKFLOW_STATUS.PENDING_OPM_FINALIZATION ? 'opm-finalize-edit' : 'opm-outgoing-edit'
              )}
            >
              <i className="bi bi-pencil-square me-1"></i>Edit OPM Outgoing
            </Button>
          )}
          {isIncoming && currentUser?.systemRole === 'PM' && (
            <Button size="sm" variant="outline-primary" onClick={() => openPMRoutingModal('pm')}>
              <i className="bi bi-diagram-3 me-1"></i>Open PM Routing
            </Button>
          )}
          {isIncoming && currentUser?.systemRole === 'Division' && (doc.status === WORKFLOW_STATUS.ROUTED_CONCERNED || doc.status === WORKFLOW_STATUS.REROUTED) && isUserMainDivision && !hasUserAcknowledged && (
            <>
              <Button variant="primary" size="sm" onClick={openQrCamera}>
                <i className="bi bi-upc-scan me-1"></i>Scan Transmittal QR to Acknowledge
              </Button>
            </>
          )}

        </div>
      </div>

      {operatorAlreadyEndorsed && latestOperatorOpmEndorseStep && (
        <div className="alert alert-success py-2 px-3 mb-3 no-print doc-detail-banner" style={{ fontSize: 12 }}>
          <div className="fw-semibold"><i className="bi bi-check2-circle me-1"></i>Endorsement Logged</div>
          <div>
            Sent to OPM on <strong>{operatorEndorseTimestamp || 'timestamp unavailable'}</strong>
            {operatorEndorseBy ? ` by ${operatorEndorseBy}` : ''}.
          </div>
        </div>
      )}

      {operatorNextAction && (
        <div className={`alert alert-${operatorNextAction.tone} py-2 px-3 mb-3 no-print doc-detail-banner`} style={{ fontSize: 12 }}>
          <div className="fw-semibold">{operatorNextAction.title}</div>
          <div>{operatorNextAction.text}</div>
        </div>
      )}

      <Row className="g-4 doc-detail-grid">
        {/* Document Info */}
        <Col lg={8}>
          <div className="content-card mb-4 doc-detail-info-card">
            <div className="content-card-header">
              <h6><i className="bi bi-file-text me-2"></i>Document Information</h6>
              <div className="d-flex align-items-center gap-2">
                {canDelegateTask && (
                  <Button size="sm" variant="primary" onClick={openDelegateModal}>
                    <i className="bi bi-person-plus-fill me-1"></i>Delegate Task
                  </Button>
                )}
                {canCompleteTask && (
                  <Button size="sm" variant="success" onClick={openCompleteModal}>
                    <i className="bi bi-check2-circle me-1"></i>Complete Task
                  </Button>
                )}
                <StatusBadge status={doc.status} />
              </div>
            </div>
            <div className="content-card-body">
              <Row className="g-3">
                <Col sm={6}>
                  <div className="mb-3">
                    <small className="text-muted d-block">Document Type</small>
                    <span>{doc.type}</span>
                  </div>
                </Col>
                <Col sm={6}>
                  <div className="mb-3">
                    <small className="text-muted d-block">{isIncoming ? 'Sender' : 'Recipient'}</small>
                    {isIncoming ? (
                      <>
                        <div>{doc.sender || ''}</div>
                        {doc.senderAddress && <div className="text-muted">{doc.senderAddress}</div>}
                      </>
                    ) : (
                      <span>{doc.recipient}</span>
                    )}
                  </div>
                </Col>
                {!isIncoming && (
                  <Col sm={6}>
                    <div className="mb-3">
                      <small className="text-muted d-block">Origin Division</small>
                      <span>{doc.originDivision}</span>
                    </div>
                  </Col>
                )}
                {isIncoming && (doc.oprDivision || doc.mainDivision || targetDivisionText) && (
                  <Col sm={6}>
                    <div className="mb-3">
                      <small className="text-muted d-block">Routed To:</small>
                      <span className="fw-semibold">{doc.oprDivision || doc.mainDivision || targetDivisionText || 'Pending PM Routing'}</span>
                      {supportingDivisionDisplayList.length > 0 && (
                        <div className="text-muted" style={{ fontSize: 12 }}>
                          CF Party(ies): {supportingDivisionDisplayList.join(', ')}
                        </div>
                      )}
                      {routingAssignmentSummary.length > 0 && (
                        <div className="text-muted" style={{ fontSize: 12 }}>
                          Position Assignments: {routingAssignmentSummary.join(' | ')}
                        </div>
                      )}
                    </div>
                  </Col>
                )}
                <Col sm={6}>
                  <div className="mb-3">
                    <small className="text-muted d-block">{isIncoming ? 'Date Received' : 'Date Released'}</small>
                    <span>{isIncoming ? `${doc.dateReceived} ${doc.timeReceived}` : `${doc.dateReleased || 'Pending'} ${doc.timeReleased || ''}`}</span>
                  </div>
                </Col>
                {!isIncoming && (
                  <Col sm={6}>
                    <div className="mb-3">
                      <small className="text-muted d-block">Released By</small>
                      <span>{doc.releasedBy || 'Pending'}</span>
                    </div>
                  </Col>
                )}
                <Col sm={6}>
                  <div className="mb-3">
                    <small className="text-muted d-block">Pages</small>
                    <span>{doc.pages}</span>
                  </div>
                </Col>
                <Col sm={6}>
                  <div className="mb-3">
                    <small className="text-muted d-block">Current Location</small>
                    <span className="fw-semibold">{doc.currentLocation || doc.originDivision}</span>
                  </div>
                </Col>
                {hasCompletionSummary && (
                  <Col sm={12}>
                    <div className="mb-3 p-2 rounded" style={{ background: '#f8fff5', border: '1px solid #d7ebdd' }}>
                      <small className="text-muted d-block">Closure Details</small>
                      {completionDetailsText && (
                        <div style={{ fontSize: 13 }}>
                          <strong>Action/s Taken:</strong> {completionDetailsText}
                        </div>
                      )}
                      {(completedByText || completedAtText) && (
                        <div style={{ fontSize: 13 }}>
                          <strong>Closed By:</strong> {completedByText || 'N/A'}
                          {completedAtText ? ` · ${completedAtText}` : ''}
                        </div>
                      )}
                      {(completionAttachmentLabel || completionAttachmentFileName) && (
                        <div style={{ fontSize: 13 }}>
                          <strong>Proof:</strong>{' '}
                          {resolvedCompletionAttachmentUrl ? (
                            <a href={resolvedCompletionAttachmentUrl} target="_blank" rel="noreferrer">
                              {completionAttachmentLabel || completionAttachmentFileName}
                            </a>
                          ) : (
                            <span>{completionAttachmentLabel || completionAttachmentFileName}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </Col>
                )}
                {doc.remarks && (
                  <Col sm={12}>
                    <div className="mb-0">
                      <small className="text-muted d-block">Remarks</small>
                      <span>{doc.remarks}</span>
                    </div>
                  </Col>
                )}
              </Row>
            </div>
          </div>

          {/* Attachments (larger area) */}
          <div className="content-card">
            <div className="content-card-header">
              <h6><i className="bi bi-paperclip me-2"></i>File Attachments</h6>
              <Button size="sm" variant="outline-secondary" onClick={linkExternalFolder}>
                <i className="bi bi-hdd-network me-1"></i>Link Seagate Folder ({externalDirLabel})
              </Button>
            </div>
            <div className="content-card-body">
              {orderedAttachments.length > 0 ? (
                <Row className="g-2">
                  <Col md={3}>
                    <div className="p-2 rounded h-100" style={{ background: '#f8f9fa', border: '1px solid #e9ecef' }}>
                      <div className="fw-semibold mb-2" style={{ fontSize: 12, color: '#495057' }}>Attachment Bookmarks</div>
                      <div className="d-grid gap-1">
                        {orderedAttachments.map((att, i) => {
                          const key = att.id || att.name || String(i)
                          const isActive = key === selectedAttachmentKey
                          const label = att.kind === 'original'
                            ? 'Scanned PDF'
                            : att.kind === 'stamped-image'
                              ? 'Stamped PNG'
                              : att.kind === 'stamped-pdf'
                                ? 'Stamped PDF'
                                : (att.name || `Attachment ${i + 1}`)
                          return (
                            <button
                              key={key}
                              type="button"
                              className={`btn btn-sm text-start ${isActive ? 'btn-primary' : 'btn-outline-secondary'}`}
                              onClick={() => setActiveAttachmentKey(key)}
                              style={{ fontSize: 12, whiteSpace: 'normal' }}
                              title={att.name || label}
                            >
                              <i className={`bi ${att.type?.includes('pdf') ? 'bi-file-pdf' : att.type?.startsWith('image/') ? 'bi-file-image' : 'bi-file-earmark'} me-1`}></i>
                              {label}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  </Col>
                  <Col md={9}>
                    <div className="p-2 rounded" style={{ background: '#f8f9fa', border: '1px solid #e9ecef' }}>
                      <div className="d-flex align-items-center gap-2 mb-2" style={{ fontSize: 13 }}>
                        <i className={`bi ${selectedType.includes('pdf') ? 'bi-file-pdf text-danger' : selectedType.startsWith('image/') ? 'bi-file-image text-primary' : 'bi-file-earmark text-secondary'}`}></i>
                        <span className="fw-semibold" style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {selectedAttachment?.name || selectedKindLabel}
                        </span>
                        {selectedAttachment?.kind && <span className="badge bg-light text-dark border" style={{ fontSize: 10 }}>{selectedKindLabel}</span>}
                        {selectedType.includes('pdf') && (
                          <>
                            <Button
                              size="sm"
                              variant="outline-secondary"
                              onClick={() => setSelectedPdfPage(p => Math.max(1, p - 1))}
                              disabled={selectedPdfPage <= 1 || renderingPdfPreview}
                              title="Previous page"
                            >
                              <i className="bi bi-chevron-left"></i>
                            </Button>
                            <span className="badge bg-dark-subtle text-dark border" style={{ fontSize: 10 }}>
                              {selectedPdfPage} / {selectedPdfTotalPages}
                            </span>
                            <Button
                              size="sm"
                              variant="outline-secondary"
                              onClick={() => setSelectedPdfPage(p => Math.min(selectedPdfTotalPages, p + 1))}
                              disabled={selectedPdfPage >= selectedPdfTotalPages || renderingPdfPreview}
                              title="Next page"
                            >
                              <i className="bi bi-chevron-right"></i>
                            </Button>
                          </>
                        )}
                        {selectedPreviewUrl && (
                          <a href={selectedPreviewUrl} download={selectedAttachment?.name || 'attachment'} className="btn btn-sm btn-outline-primary">
                            <i className="bi bi-download"></i>
                          </a>
                        )}
                      </div>

                      {selectedAttachment?.savedToExternal && (
                        <div className="mb-2" style={{ fontSize: 11, color: '#6c757d' }}>
                          Source: Seagate folder{selectedExternalSourceLabel ? ` / ${selectedExternalSourceLabel}` : ''}
                        </div>
                      )}

                      <div style={{ background: '#525659', borderRadius: 6, padding: 10 }}>
                        <div style={{ width: '100%', minHeight: 620, background: '#fff', border: '1px solid #dee2e6', borderRadius: 4, overflow: 'hidden', boxShadow: '0 4px 24px rgba(0,0,0,0.2)' }}>
                          {selectedPreviewUrl && selectedType.startsWith('image/') ? (
                            <img src={selectedPreviewUrl} alt={selectedAttachment?.name || 'Attachment'} style={{ width: '100%', display: 'block', minHeight: 620, objectFit: 'contain', background: '#fff' }} />
                          ) : selectedPreviewUrl && selectedType.includes('pdf') ? (
                            renderingPdfPreview ? (
                              <div className="d-flex justify-content-center align-items-center" style={{ width: '100%', height: 620, color: '#6c757d', fontSize: 13 }}>
                                Rendering PDF preview...
                              </div>
                            ) : renderedPdfPreviewUrl ? (
                              <img src={renderedPdfPreviewUrl} alt={selectedAttachment?.name || 'PDF Preview'} style={{ width: '100%', display: 'block', minHeight: 620, objectFit: 'contain', background: '#fff' }} />
                            ) : (
                              <div className="p-3 text-center text-muted" style={{ fontSize: 12, minHeight: 620 }}>
                                PDF preview not available in this browser.
                              </div>
                            )
                          ) : (
                            <div className="p-3 text-center text-muted" style={{ fontSize: 12 }}>
                              Preview unavailable. Link your Seagate folder to load this file.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </Col>
                </Row>
              ) : (
                <div className="text-muted" style={{ fontSize: 13 }}>No saved attachments for this document.</div>
              )}
            </div>
          </div>
        </Col>

        {/* Right: Control/Reference # Sticker + Transmittal + Attachments */}
        <Col lg={4}>
          {isOpmSecretary && isForOpmReview && (
            <div className="content-card mb-4 doc-detail-security-card" style={{ border: '2px solid #0d6efd', boxShadow: '0 4px 12px rgba(13,110,253,0.15)' }}>
              <div className="content-card-header bg-primary text-white border-bottom-0">
                <h6 className="mb-0 text-white"><i className="bi bi-shield-lock-fill me-2"></i>OPM Security Verification</h6>
              </div>
              <div className="content-card-body p-3">
                <div className="text-secondary small mb-3">
                  Please verify digital and physical copies to unlock endorsement.
                </div>
                
                <Form.Group className="mb-3">
                  <Form.Label className="fw-semibold" style={{ fontSize: 13 }}>
                    <i className={`bi bi-keyboard me-2 ${digitalAcknowledgeTyped === doc.trackingNumber ? 'text-success' : 'text-danger'}`}></i>
                    1. Digital Acknowledgement
                  </Form.Label>
                  <Form.Control
                    type="text"
                    size="sm"
                    placeholder="Type control/reference number exactly..."
                    value={digitalAcknowledgeTyped}
                    onChange={(e) => setDigitalAcknowledgeTyped(String(e.target.value).trim())}
                    isInvalid={digitalAcknowledgeTyped.length > 0 && digitalAcknowledgeTyped !== doc.trackingNumber}
                    isValid={digitalAcknowledgeTyped === doc.trackingNumber}
                  />
                  {digitalAcknowledgeTyped === doc.trackingNumber && (
                    <Form.Text className="text-success"><i className="bi bi-check-circle-fill me-1"></i>Digital verification matched.</Form.Text>
                  )}
                </Form.Group>

                <Form.Group className="mb-4">
                  <Form.Label className="fw-semibold" style={{ fontSize: 13 }}>
                    <i className={`bi bi-camera-video me-2 ${isQrScannedOpm ? 'text-success' : 'text-danger'}`}></i>
                    2. Physical Acknowledgement
                  </Form.Label>
                  <div className="d-flex gap-2">
                    <Button 
                      variant={isQrScannedOpm ? "success" : "outline-primary"} 
                      size="sm" 
                      className="w-100"
                      onClick={() => {
                        if (isQrScannedOpm) return
                        openQrCameraOpm()
                      }}
                    >
                      {isQrScannedOpm ? <><i className="bi bi-check-circle-fill me-1"></i>Physical QR Verified</> : <><i className="bi bi-upc-scan me-1"></i>Scan Transmittal QR</>}
                    </Button>
                    {!isQrScannedOpm && (
                      <Button variant="outline-secondary" size="sm" onClick={() => setIsQrScannedOpm(true)} title="Manual Override">
                        <i className="bi bi-keyboard"></i>
                      </Button>
                    )}
                  </div>
                </Form.Group>
                
                <Button 
                  variant="primary" 
                  className="w-100 fw-bold" 
                  size="lg"
                  disabled={digitalAcknowledgeTyped !== doc.trackingNumber || !isQrScannedOpm}
                  onClick={() => setShowAssistantEndorseModal(true)}
                >
                  <i className="bi bi-send-check me-2"></i>Endorse to PM
                </Button>
              </div>
            </div>
          )}

          {/* Division Receipt Tracker */}
          <div className="content-card mb-4 doc-detail-receipt-card">
            <div className="content-card-header">
              <h6><i className="bi bi-bell me-2"></i>Division Receipt Notifications</h6>
              <span className={`badge ${receiptHeaderClass}`} style={{ fontSize: 11 }}>
                {receiptHeaderLabel}
              </span>
            </div>
            <div className="content-card-body" style={{ background: '#f8f9fa', padding: 12 }}>
              {statusNotification ? (
                <div className={`alert alert-${statusNotification.tone} mb-0`} style={{ fontSize: 12 }}>
                  <div className="fw-semibold">{statusNotification.title}</div>
                  <div>{statusNotification.text}</div>
                </div>
              ) : orderedDivisionList.length === 0 ? (
                <div className="text-muted" style={{ fontSize: 12 }}>No routed divisions yet.</div>
              ) : (
                <div className="d-grid gap-2">
                  {orderedDivisionList.map((division, idx) => {
                    const receipt = divisionReceipts.find((entry) => entry.division === division)
                    const isMain = division === mainDivision
                    const isAcknowledged = isReceiptAcknowledged(receipt)
                    const isViewed = Boolean(receipt && (isReceiptViewed(receipt) || isAcknowledged))
                    const isSupporting = !isMain
                    const shouldMarkCompleted = isTaskCompleted
                    const shouldShowViewed = isSupporting && isViewed && !isTaskCompleted
                    const shouldShowAcknowledged = isMain && isAcknowledged && !isTaskCompleted
                    const isMainPendingActive = isMain && !isTaskCompleted && !isAcknowledged && doc.status === WORKFLOW_STATUS.ROUTED_CONCERNED && isMainOprViewingActive
                    const receiptSourceLabel = receipt?.source === 'manual'
                      ? 'Manual Entry'
                      : receipt?.source === 'system'
                        ? 'Digital'
                        : 'QR Scan'
                    const receiptStatusLabel = shouldMarkCompleted
                      ? 'Completed'
                      : shouldShowAcknowledged
                        ? 'Acknowledged'
                        : shouldShowViewed
                          ? 'Viewed'
                          : 'Pending'
                    const receiptSummary = shouldMarkCompleted
                      ? (isMain ? 'Task completed' : 'Completed by Main OPR')
                      : shouldShowAcknowledged
                        ? `Acknowledged (${receiptSourceLabel})`
                        : shouldShowViewed
                          ? 'Viewed'
                          : (isMain ? 'Pending completion' : 'Pending view')
                    const receiptBy = shouldShowAcknowledged
                      ? receipt?.verifiedBy
                      : shouldShowViewed
                        ? receipt?.viewedBy
                        : ''
                    const pendingBadgeClass = isMainPendingActive ? 'bg-warning text-dark' : 'bg-secondary'
                    const badgeClass = receiptStatusLabel === 'Completed'
                      ? 'bg-success'
                      : receiptStatusLabel === 'Acknowledged'
                        ? 'bg-info text-dark'
                        : receiptStatusLabel === 'Viewed'
                          ? 'bg-primary-subtle text-primary border border-primary-subtle'
                          : pendingBadgeClass
                    return (
                      <div key={division} className="p-2 rounded" style={{ background: '#fff', border: `1px solid ${receiptStatusLabel === 'Completed' || receiptStatusLabel === 'Acknowledged' ? '#c3e6cb' : receiptStatusLabel === 'Viewed' ? '#cfe2ff' : isMainPendingActive ? '#ffe69c' : '#dee2e6'}` }}>
                        <div className="d-flex justify-content-between align-items-start gap-2">
                          <div>
                            <div className="fw-semibold" style={{ fontSize: 13 }}>
                              {isMain ? 'Main OPR: ' : ''}{division}
                              {isMain && <span className="badge bg-danger ms-2" style={{ fontSize: 10 }}>M</span>}
                            </div>
                            <div style={{ fontSize: 11, color: '#6c757d' }}>
                              {receiptSummary}
                            </div>
                            {receiptBy && (
                              <div style={{ fontSize: 11, color: '#6c757d' }}>
                                By: {receiptBy}
                              </div>
                            )}
                          </div>
                          <span className={`badge ${badgeClass}`} style={{ fontSize: 10, alignSelf: 'center' }}>
                            {receiptStatusLabel}
                          </span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Incoming Transmittal Slip */}
          <div className="content-card mb-4 doc-detail-transmittal-card">
            <div className="content-card-header">
              <h6><i className="bi bi-file-earmark-text me-2"></i>Incoming Transmittal Slip</h6>
              {canPrintTransmittalSlip && !shouldHidePrintForSupportingDivision && (
                <Button size="sm" variant="outline-primary" onClick={printTransmittal}>
                  <i className="bi bi-printer me-1"></i>Print Slip
                </Button>
              )}
            </div>
            <div className="content-card-body d-flex justify-content-center" style={{ background: '#f0f0f0', padding: 16 }}>
              <IncomingTransmittalSlip
                ref={transmittalRef}
                {...transmittalSlipProps}
              />
            </div>
          </div>

          <div className="content-card mb-4 no-print doc-detail-comments-card">
            <div className="content-card-header" style={{ paddingBottom: 0 }}>
              <div className="d-flex align-items-center gap-2 w-100">
                <button
                  className={`comment-tab-btn${commentTab === 'instructions' ? ' active' : ''}`}
                  onClick={() => setCommentTab('instructions')}
                >
                  <i className="bi bi-chat-left-text me-1"></i>Instruction Comments
                  {instructionComments.length > 0 && <span className="comment-tab-badge">{instructionComments.length}</span>}
                </button>
                <button
                  className={`comment-tab-btn${commentTab === 'replies' ? ' active' : ''}`}
                  onClick={() => setCommentTab('replies')}
                >
                  <i className="bi bi-chat-dots me-1"></i>Chats
                  {(Array.isArray(doc.replyComments) && doc.replyComments.length > 0) && <span className="comment-tab-badge reply">{doc.replyComments.length}</span>}
                </button>
              </div>
            </div>
            <div className="content-card-body">
              {/* ── Instruction Comments Tab ── */}
              {commentTab === 'instructions' && (
                <>
                  <div className="text-muted mb-2" style={{ fontSize: 12 }}>
                    Add comment as <strong>{roleLabel}</strong> ({commenterName})
                    <span className="ms-2 text-info" style={{ fontSize: 11 }}><i className="bi bi-info-circle me-1"></i>Visible on Transmittal Slip</span>
                  </div>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    placeholder="Type your instruction/comment..."
                    value={instructionInput}
                    onChange={(e) => setInstructionInput(e.target.value)}
                  />
                  <div className="d-flex justify-content-end mt-2">
                    <Button size="sm" onClick={addInstructionComment}>
                      <i className="bi bi-plus-lg me-1"></i>Add Comment
                    </Button>
                  </div>
                  {instructionComments.length > 0 && (
                    <div className="mt-3 comment-thread" style={{ fontSize: 12 }}>
                      {[...instructionComments]
                        .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
                        .map((entry) => {
                        let text = entry.comment || ''
                        const isOpmEndorse = isOpmEndorseRemark(entry)
                        const isRecordsEndorse = isRecordsEndorseRemark(entry)
                        if (text.startsWith('[OPM Secretary remarks] ')) {
                          text = text.replace('[OPM Secretary remarks] ', '')
                        }
                        if (text.startsWith('[OPM Assistant remarks] ')) {
                          text = text.replace('[OPM Assistant remarks] ', '')
                        }
                        if (text.startsWith('[OPM remarks] ')) {
                          text = text.replace('[OPM remarks] ', '')
                        }
                        if (text.startsWith('[OPM endorsement remark] ')) {
                          text = text.replace('[OPM endorsement remark] ', '')
                        }
                        if (text.startsWith('[Records endorsement remark] ')) {
                          text = text.replace('[Records endorsement remark] ', '')
                        }
                        return (
                          <div key={entry.id || `${entry.roleLabel}-${entry.name}-${entry.createdAt}`} className="p-2 rounded mb-2" style={{ background: '#f8f9fa', border: '1px solid #e9ecef' }}>
                            <div className="fw-semibold">{isOpmEndorse ? 'Remarks by OPM to PM:' : isRecordsEndorse ? 'Remarks by Records Division' : `${entry.roleLabel}${entry.name ? ` (${entry.name})` : ''}`}</div>
                            <div>{text}</div>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </>
              )}

              {/* ── Reply Comments Tab (Messenger-style) ── */}
              {commentTab === 'replies' && (
                <>
                  <div className="text-muted mb-2 d-flex align-items-center justify-content-between" style={{ fontSize: 12 }}>
                    <span>
                      Chatting as <strong>{roleLabel}</strong> ({commenterName})
                    </span>
                    <span className="text-warning" style={{ fontSize: 11 }}><i className="bi bi-eye-slash me-1"></i>Not on Transmittal Slip</span>
                  </div>

                  {/* ── Chat messages area ── */}
                  <div className="reply-chat-area" ref={chatAreaRef}>
                    {Array.isArray(doc.replyComments) && doc.replyComments.length > 0 ? (
                      [...doc.replyComments]
                        .sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
                        .map((entry) => {
                        const isMine = entry.name === commenterName && entry.roleLabel === roleLabel
                        return (
                          <div key={entry.id || `${entry.roleLabel}-${entry.name}-${entry.createdAt}`} className={`reply-msg-row ${isMine ? 'mine' : 'theirs'}`}>
                            {!isMine && (
                              <div className="reply-msg-avatar">
                                {(entry.name || entry.roleLabel || '?').charAt(0).toUpperCase()}
                              </div>
                            )}
                            <div className={`reply-msg-bubble ${isMine ? 'mine' : 'theirs'}`}>
                              {!isMine && (
                                <div className="reply-msg-sender">{entry.roleLabel}{entry.name ? ` (${entry.name})` : ''}</div>
                              )}
                              <div className="reply-msg-text">{entry.comment}</div>
                              {entry.createdAt && (
                                <div className="reply-msg-time">
                                  {new Date(entry.createdAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}{' '}
                                  {new Date(entry.createdAt).toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })
                    ) : (
                      <div className="text-muted text-center py-4" style={{ fontSize: 12 }}>
                        <i className="bi bi-chat-dots d-block mb-1" style={{ fontSize: 24, opacity: 0.3 }}></i>
                        No messages yet. Start the conversation.
                      </div>
                    )}
                  </div>

                  {/* ── Chat composer bar ── */}
                  <div className="reply-chat-composer">
                    <Form.Control
                      as="textarea"
                      rows={1}
                      className="reply-chat-input"
                      placeholder="Type a message..."
                      value={replyInput}
                      onChange={(e) => setReplyInput(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault()
                          addReplyComment()
                        }
                      }}
                    />
                    <button className="reply-chat-send-btn" onClick={addReplyComment} title="Send">
                      <i className="bi bi-send-fill"></i>
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Routing History (smaller area) */}
          <div className="content-card">
            <div className="content-card-header">
              <h6><i className="bi bi-clock-history me-2"></i>Routing History</h6>
            </div>
            <div className="content-card-body" style={{ maxHeight: 360, overflowY: 'auto' }}>
              <div className="routing-timeline">
                {history.map((step, i) => (
                  <div key={i} className="routing-step">
                    <div className={`routing-dot ${step.status === 'pending' ? 'pending' : ''}`}></div>
                    <div>
                      <div className="fw-semibold" style={{ fontSize: 13 }}>{step.office}</div>
                      <div style={{ fontSize: 12 }}>{step.action}</div>
                      <div style={{ fontSize: 11.5, color: '#6c757d', marginTop: 2 }}>
                        {step.date ? (
                          <>
                            <i className="bi bi-calendar3 me-1"></i>{step.date} {step.time}
                            {step.user && <><span className="mx-1">·</span><i className="bi bi-person me-1"></i>{step.user}</>}
                          </>
                        ) : (
                          <span className="text-warning"><i className="bi bi-clock me-1"></i>Pending</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Col>
      </Row>

      <Modal show={showQrReceiveModal} onHide={closeQrReceiveModal} centered>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: 16 }}>QR Receive (Camera)</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <style>{`#${qrScannerElementId} video { transform: scaleX(-1); }`}</style>
          <div className="text-muted mb-2" style={{ fontSize: 12 }}>
            Scan QR for <strong>{doc.trackingNumber}</strong>. This will auto-acknowledge once matched.
          </div>
          <div id={qrScannerElementId} style={{ border: '1px solid #dee2e6', borderRadius: 8, overflow: 'hidden', background: '#fff', minHeight: 280 }}>
          </div>
          {qrCameraError && (
            <div className="text-danger mt-2" style={{ fontSize: 12 }}>{qrCameraError}</div>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" size="sm" onClick={closeQrReceiveModal}>Close</Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={showDelegateModal}
        onHide={closeDelegateModal}
        centered
        backdrop="static"
        keyboard={!delegatingTask}
      >
        <Modal.Header closeButton={!delegatingTask}>
          <Modal.Title style={{ fontSize: 18 }}>
            <i className="bi bi-person-workspace me-2"></i>Delegate Task / Assign Personnel
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="small text-muted mb-3">
            Assign <strong>{doc.trackingNumber}</strong> to personnel in <strong>{currentUser?.division || 'your division'}</strong> and record localized instructions.
          </div>

          <Form.Group className="mb-3">
            <Form.Label className="fw-semibold" style={{ fontSize: 13 }}>Assign To (Division Delegate Position)</Form.Label>
            <Form.Select
              value={selectedPersonnel}
              onChange={(e) => setSelectedPersonnel(e.target.value)}
              disabled={delegatingTask || divisionPersonnelOptions.length === 0}
            >
              <option value="">
                {divisionPersonnelOptions.length > 0
                  ? 'Select delegate position...'
                  : 'No delegate positions found for this division'}
              </option>
              {divisionPersonnelOptions.map((person) => (
                <option key={person} value={person}>{person}</option>
              ))}
            </Form.Select>
          </Form.Group>

          <Form.Group>
            <Form.Label className="fw-semibold" style={{ fontSize: 13 }}>Localized Instructions/Remarks</Form.Label>
            <Form.Control
              as="textarea"
              rows={4}
              placeholder="Enter localized instructions for assigned personnel..."
              value={dmInstructions}
              onChange={(e) => setDmInstructions(e.target.value)}
              disabled={delegatingTask}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={closeDelegateModal} disabled={delegatingTask}>
            Cancel
          </Button>
          <Button
            variant="primary"
            onClick={handleDelegateTask}
            disabled={delegatingTask || divisionPersonnelOptions.length === 0}
          >
            {delegatingTask ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Assigning...
              </>
            ) : (
              <>
                <i className="bi bi-check2-circle me-1"></i>Assign Task
              </>
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={showCompleteModal}
        onHide={closeCompleteModal}
        centered
        backdrop="static"
        keyboard={!completingTask}
      >
        <Modal.Header closeButton={!completingTask}>
          <Modal.Title style={{ fontSize: 18 }}>
            <i className="bi bi-check2-square me-2"></i>Complete Task & Close Document
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="small text-muted mb-3">
            Complete and close <strong>{doc.trackingNumber}</strong>. Only the main division can submit closure.
          </div>

          <Form.Group className="mb-3">
            <Form.Label className="fw-semibold" style={{ fontSize: 13 }}>Action/s Taken (Details of completion)</Form.Label>
            <Form.Control
              as="textarea"
              rows={4}
              placeholder="Describe what was completed and the resulting action..."
              value={actionTaken}
              onChange={(e) => setActionTaken(e.target.value)}
              disabled={completingTask}
            />
          </Form.Group>

          <Form.Group>
            <Form.Label className="fw-semibold" style={{ fontSize: 13 }}>Upload Proof of Action (e.g., Drafted Reply, Signed Memo)</Form.Label>
            <Form.Control
              type="file"
              accept=".pdf,image/*"
              onChange={(e) => setCompletionFile(e.target.files?.[0] || null)}
              disabled={completingTask}
            />
            {completionFile?.name && (
              <div className="text-muted mt-1" style={{ fontSize: 12 }}>
                Selected file: {completionFile.name}
              </div>
            )}
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={closeCompleteModal} disabled={completingTask}>
            Cancel
          </Button>
          <Button variant="success" onClick={handleCompleteTask} disabled={completingTask}>
            {completingTask ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Closing...
              </>
            ) : (
              <>
                <i className="bi bi-check2-circle me-1"></i>Submit & Close Document
              </>
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={showPMRoutingModal}
        onHide={closePMRoutingModal}
        size="lg"
        centered
        backdrop="static"
        keyboard={!routingToDivision}
      >
        <Modal.Header closeButton={!routingToDivision}>
          <Modal.Title style={{ fontSize: 18 }}>
            <i className="bi bi-send me-2"></i>{routeEditorTitle}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="mb-3" style={{ fontSize: 13 }}>
            <div className="d-flex flex-wrap align-items-center gap-2">
              <strong>{doc.trackingNumber}</strong>
              {renderDocTags(draftRouteTags, 'doc-tag-group-inline')}
              <span>— {doc.subject}</span>
            </div>
          </div>

          <Row className="g-3">
            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label className="fw-semibold" style={{ fontSize: 13 }}>Main Division</Form.Label>
                <Form.Select
                  value={mainRouteDivision}
                  onChange={(e) => selectMainRouteDivision(e.target.value)}
                  disabled={routingToDivision}
                >
                  <option value="">Select main division...</option>
                  {routeDivisionOptions.map((division) => (
                    <option key={division} value={division}>{division}</option>
                  ))}
                </Form.Select>
              </Form.Group>
              {mainRouteDivision === OPM_DIVISION && (
                <Form.Group className="mb-3">
                  <Form.Label className="fw-semibold" style={{ fontSize: 13 }}>OPM Delegate *</Form.Label>
                  <Form.Select
                    value={opmAssignee}
                    onChange={(e) => setDivisionAssignment(OPM_DIVISION, e.target.value)}
                    disabled={routingToDivision}
                  >
                    <option value="">Select OPM delegate...</option>
                    {getDivisionPositionOptionsFromCatalog(OPM_DIVISION, divisionPositionCatalog).map((position) => (
                      <option key={position} value={position}>{position}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
              )}
            </Col>

            <Col md={6}>
              <Form.Group className="mb-3">
                <Form.Label className="fw-semibold" style={{ fontSize: 13 }}>Required Action</Form.Label>
                  <Dropdown autoClose="outside">
                    <Dropdown.Toggle
                      variant="outline-secondary"
                      className="w-100 text-start d-flex justify-content-between align-items-center"
                      disabled={routingToDivision}
                    >
                      <span>{routeActionToggleLabel}</span>
                    </Dropdown.Toggle>
                    <Dropdown.Menu className="w-100 p-2" style={{ maxHeight: 220, overflowY: 'auto' }}>
                      {TRANSMITTAL_ACTION_OPTIONS.map((option) => (
                        <Form.Check
                          key={option}
                          type="checkbox"
                          id={`doc-route-action-${option}`}
                          label={option}
                          checked={routeActions.includes(option)}
                          onChange={() => toggleRouteAction(option)}
                          className="mb-1"
                          disabled={routingToDivision}
                        />
                      ))}
                    </Dropdown.Menu>
                  </Dropdown>
                  <div className="mt-2 text-muted" style={{ fontSize: 12 }}>
                    Selected: {routeActionSummary || 'None'}
                  </div>
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label className="fw-semibold" style={{ fontSize: 13 }}>Tags</Form.Label>
                <div className="doc-tag-picker">
                  {TAG_PRESETS.map((tag) => (
                    <Form.Check
                      key={tag.key}
                      type="checkbox"
                      id={`doc-route-tag-${tag.key}`}
                      label={<span className={getTagClassName(tag)}>{tag.label}</span>}
                      checked={routeTagKeys.includes(tag.key)}
                      onChange={() => toggleRouteTag(tag.key)}
                      disabled={routingToDivision}
                      className="doc-tag-toggle"
                    />
                  ))}
                </div>
                <div className="doc-tag-custom-row">
                  <Form.Control
                    type="color"
                    value={customTagColor}
                    onChange={(e) => setCustomTagColor(e.target.value)}
                    className="doc-tag-color-input"
                    title="Custom tag color"
                    disabled={routingToDivision}
                  />
                  <Form.Control
                    type="text"
                    value={customTagLabel}
                    onChange={(e) => setCustomTagLabel(e.target.value)}
                    placeholder="Custom tag (max 15 chars)"
                    maxLength={15}
                    className="doc-tag-label-input"
                    disabled={routingToDivision}
                  />
                  <span className="doc-tag-count">{customTagLabel.trim().length}/15</span>
                  {customTagLabel.trim() && (
                    <span
                      className="doc-tag doc-tag--custom"
                      style={{ backgroundColor: customTagColor || DEFAULT_CUSTOM_TAG_COLOR }}
                    >
                      {customTagLabel.trim()}
                    </span>
                  )}
                </div>
              </Form.Group>
            </Col>

            <Col md={12}>
              <Form.Group>
                <Form.Label className="fw-semibold mb-1" style={{ fontSize: 13 }}>CF Party(ies)</Form.Label>
                <div style={{ border: '1px solid #dee2e6', borderRadius: 6, padding: 10, maxHeight: 160, overflowY: 'auto' }}>
                  {routeDivisionOptions.map((division) => {
                    const isMain = division === mainRouteDivision
                    return (
                      <Form.Check
                        key={division}
                        type="checkbox"
                        id={`pm-route-div-${division}`}
                        label={isMain ? `${division} (Main)` : division}
                        checked={routeToDivisions.includes(division)}
                        onChange={() => toggleRouteDivision(division)}
                        className="mb-1"
                        style={{ fontSize: 13, opacity: isMain ? 0.6 : 1 }}
                        disabled={routingToDivision || isMain}
                      />
                    )
                  })}
                </div>
                <div className="mt-2 text-muted" style={{ fontSize: 12 }}>
                  Main: {mainRouteDivision || 'None'}
                  {routeToDivisions.length > 0 ? ` · CF Party(ies): ${routeToDivisions.join(', ')}` : ' · CF Party(ies): None'}
                </div>
              </Form.Group>
            </Col>

            <Col md={12}>
              <Form.Group>
                <Form.Label className="fw-semibold" style={{ fontSize: 13 }}>PM's Instructions</Form.Label>
                <Form.Control
                  as="textarea"
                  rows={3}
                  placeholder="Add PM instructions..."
                  value={routeInstructions}
                  onChange={(e) => setRouteInstructions(e.target.value)}
                  disabled={routingToDivision}
                />
              </Form.Group>
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer>
          {isOpmOutgoingEdit ? (
            <div className="d-flex flex-wrap gap-3 w-100 justify-content-between align-items-center">
              <div>
                <div className="fw-semibold text-muted" style={{ fontSize: 12 }}>Current Selected:</div>
                <div className="d-flex flex-column gap-1 mt-1">
                  <Form.Check
                    type="radio"
                    id="doc-update-method-both"
                    name="doc-update-method"
                    label={routePrimaryLabel}
                    checked={routeDeliveryMethod === 'both'}
                    onChange={() => setRouteDeliveryMethod('both')}
                    disabled={routingToDivision}
                  />
                  <Form.Check
                    type="radio"
                    id="doc-update-method-digital"
                    name="doc-update-method"
                    label={routeSecondaryLabel}
                    checked={routeDeliveryMethod === 'digital'}
                    onChange={() => setRouteDeliveryMethod('digital')}
                    disabled={routingToDivision}
                  />
                </div>
              </div>
              <Button variant="primary" onClick={() => submitPMRoute(routeDeliveryMethod)} disabled={routingToDivision}>
                <i className="bi bi-save me-1"></i>Save and Proceed
              </Button>
            </div>
          ) : (
            <>
              <Button variant="primary" onClick={() => submitPMRoute('both')} disabled={routingToDivision}>
                <i className="bi bi-send-check me-1"></i>{routePrimaryLabel}
              </Button>
              <Button variant="outline-secondary" onClick={() => submitPMRoute('digital')} disabled={routingToDivision}>
                <i className="bi bi-cloud-check me-1"></i>{routeSecondaryLabel}
              </Button>
            </>
          )}
        </Modal.Footer>
      </Modal>

      <Modal
        show={showAssistantEndorseModal}
        onHide={() => !endorsingToPM && setShowAssistantEndorseModal(false)}
        centered
        backdrop="static"
        keyboard={!endorsingToPM}
      >
        <Modal.Header closeButton={!endorsingToPM}>
          <Modal.Title style={{ fontSize: 18 }}>
            <i className="bi bi-send-check me-2 text-primary"></i>Endorse Document to PM / OIC
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="text-secondary small mb-3">
            Digital and physical verification completed for <strong>{doc.trackingNumber}</strong>. You are now endorsing this document to the Port Manager or Officer-in-Charge for action.
          </div>
          <div className="alert alert-light border py-2 px-3" style={{ fontSize: 12 }}>
            <i className="bi bi-arrow-counterclockwise me-1"></i>
            You can undo this endorsement for a few seconds right after confirmation.
          </div>
          
          <Form.Group className="mb-3 p-3 bg-light border rounded">
            <Form.Label className="fw-semibold d-block" style={{ fontSize: 13 }}>Route to:*</Form.Label>
            <Form.Check
              type="radio"
              id="route-pm"
              label="Port Manager (PM)"
              checked={!isEndorsingToOic}
              onChange={() => setIsEndorsingToOic(false)}
              disabled={endorsingToPM}
              className="mb-2"
            />
            <Form.Check
              type="radio"
              id="route-oic"
              label="Officer-in-Charge (OIC)"
              checked={isEndorsingToOic}
              onChange={() => setIsEndorsingToOic(true)}
              disabled={endorsingToPM}
            />
          </Form.Group>
          
          <Form.Group className="mb-3">
            <Form.Label className="fw-semibold" style={{ fontSize: 13 }}>Remarks for PM / OIC <span className="text-muted fw-normal">(Optional)</span></Form.Label>
            <Form.Control
              as="textarea"
              rows={3}
              placeholder="Add summary or specific notes for the PM here..."
              value={assistantRemarks}
              onChange={(e) => setAssistantRemarks(e.target.value)}
              disabled={endorsingToPM}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowAssistantEndorseModal(false)} disabled={endorsingToPM}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleEndorseToPM} disabled={endorsingToPM}>
            {endorsingToPM ? (
              <><span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>Routing...</>
            ) : (
              <><i className="bi bi-check2-circle me-1"></i>Confirm Endorsement</>
            )}
          </Button>
        </Modal.Footer>
      </Modal>

      <Modal
        show={showEndorseModal}
        onHide={closeEndorseModal}
        size="lg"
        className="doc-detail-endorse-modal"
        centered
        backdrop="static"
        keyboard={!endorsingToOpm}
      >
        <Modal.Header closeButton={!endorsingToOpm}>
          <Modal.Title style={{ fontSize: 18 }}>
            <i className="bi bi-send me-2"></i>Endorse to OPM
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <div className="small text-muted mb-4">
            Submit <span className="tracking-number">{doc.trackingNumber}</span> to Office of the Port Manager (OPM) for initial review before PM evaluation.
          </div>
          <div className="alert alert-light border py-2 px-3 doc-detail-endorse-note" style={{ fontSize: 12 }}>
            <i className="bi bi-arrow-counterclockwise me-1"></i>
            You can undo this endorsement for a few seconds right after sending.
          </div>

          <Row className="g-3">
            <Col lg={7}>
              <div className="border rounded p-3 endorse-detail-panel" style={{ background: '#fff' }}>
                <div className="fw-semibold mb-2" style={{ fontSize: 14 }}>
                  <i className="bi bi-file-earmark-text me-2"></i>Endorsement Details
                </div>

                <div className="border rounded-3 bg-light p-3 p-md-4 mb-4 endorse-summary-block">
                  <div className="d-flex flex-wrap justify-content-between align-items-start gap-3">
                    <div style={{ minWidth: 220, flex: '1 1 220px' }}>
                      <small className="text-secondary fw-normal d-block mb-1">Subject</small>
                      <div className="fw-bold text-dark" style={{ fontSize: 13, lineHeight: 1.3 }} title={doc.subject}>{doc.subject}</div>
                    </div>
                    <div style={{ minWidth: 150, flex: '0 0 auto' }}>
                      <small className="text-secondary fw-normal d-block mb-1">Current Location</small>
                      <div className="fw-bold text-dark text-nowrap" style={{ fontSize: 13 }} title={doc.currentLocation || 'Records Section'}>{doc.currentLocation || 'Records Section'}</div>
                    </div>
                    <div style={{ minWidth: 120, flex: '0 0 auto' }}>
                      <small className="text-secondary fw-normal d-block mb-1">Status</small>
                      <div className="fw-bold text-dark text-nowrap" style={{ fontSize: 13 }} title={getStatusDisplayLabel(doc.status)}>{getStatusDisplayLabel(doc.status)}</div>
                    </div>
                  </div>
                </div>

                <Form.Group className="mb-4">
                  <Form.Label className="fw-normal text-secondary">Endorse To</Form.Label>
                  <Form.Control plaintext readOnly value="Office of the Port Manager (OPM initial review)" className="fw-bold text-dark" />
                </Form.Group>

                <Form.Group className="mb-4">
                  <Form.Label className="fw-normal text-secondary">Remarks</Form.Label>
                  <Form.Control
                    className="endorse-remarks-input"
                    as="textarea"
                    rows={3}
                    placeholder="Additional instructions..."
                    value={endorseRemarks}
                    onChange={(e) => setEndorseRemarks(e.target.value)}
                    disabled={endorsingToOpm}
                  />
                </Form.Group>

                <Form.Check
                  className="mb-3"
                  type="checkbox"
                  label="Generate transmittal slip after endorsement"
                  checked={generateTransmittal}
                  onChange={(e) => setGenerateTransmittal(e.target.checked)}
                  disabled={endorsingToOpm}
                />
              </div>
            </Col>

            <Col lg={5}>
              <div className="border rounded p-3 endorse-flow-panel" style={{ background: '#fff' }}>
                <div className="fw-semibold mb-2" style={{ fontSize: 14 }}>
                  <i className="bi bi-diagram-3 me-2"></i>Routing Flow
                </div>
                {[
                  { name: 'Records Section', icon: 'bi-inbox-fill', done: true },
                  {
                    name: 'Office of the Port Manager (OPM)',
                    icon: 'bi-building',
                    done: endorsingToOpm || isOpmInitialReviewStatus(doc?.status) || doc.status === WORKFLOW_STATUS.PM_REVIEW || doc.status === WORKFLOW_STATUS.ROUTED_CONCERNED || doc.status === WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED,
                  },
                  {
                    name: 'Port Manager (PM)',
                    icon: 'bi-briefcase-fill',
                    done: doc.status === WORKFLOW_STATUS.PM_REVIEW || doc.status === WORKFLOW_STATUS.ROUTED_CONCERNED || doc.status === WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED,
                  },
                  {
                    name: targetDivisionText || 'RC/s Concerned',
                    icon: 'bi-people-fill',
                    done: doc.status === WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED,
                  },
                ].map((step, i, arr) => (
                  <div key={step.name}>
                    <div
                      className={`endorse-flow-step d-flex align-items-center gap-3 p-3 p-md-4 rounded border shadow-sm ${step.done ? 'border-start border-3 border-primary' : 'border-light'}`}
                      style={{ background: step.done ? '#e7f1ff' : '#f8f9fa' }}
                    >
                      <i className={`bi ${step.icon} ${step.done ? 'text-primary' : 'text-muted'}`} style={{ fontSize: 20 }}></i>
                      <div>
                        <div className="fw-bold text-dark" style={{ fontSize: 13 }}>{step.name}</div>
                        <small className={step.done ? 'text-success' : 'text-muted'}>
                          {step.done ? '✓ Completed' : 'Pending'}
                        </small>
                      </div>
                    </div>
                    {i < arr.length - 1 && (
                      <div className="text-center py-1">
                        <i className="bi bi-arrow-down text-muted"></i>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </Col>
          </Row>
        </Modal.Body>
        <Modal.Footer className="doc-detail-endorse-footer">
          <Button variant="outline-secondary" onClick={closeEndorseModal} disabled={endorsingToOpm}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleEndorseToOpm} disabled={endorsingToOpm}>
            {endorsingToOpm ? (
              <>
                <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                Sending...
              </>
            ) : (
              <>
                <i className="bi bi-send-check me-1"></i>Send to OPM
              </>
            )}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}
