import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Row, Col, Form, Button, Dropdown } from 'react-bootstrap'
import StatusBadge from '../components/StatusBadge'
import { DIVISIONS } from '../data/mockData'
import { useAuth } from '../context/AuthContext'
import { useDocuments } from '../context/DocumentContext'
import toast from 'react-hot-toast'
import { WORKFLOW_STATUS, getStatusDisplayLabel, isPMRole, isOpmRole, normalizeRole, normalizeStatus } from '../utils/workflowLabels'
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
  buildPmRouteAssignments,
  buildRouteAssignments,
  getAssignedPosition,
  getDivisionPositionOptionsFromCatalog,
} from '../utils/divisionPositionAssignments'

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

function normalizeDivisionValue(value) {
  return String(value || '').trim().toLowerCase()
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

export default function OPMEndorsed({ currentUser }) {
  const { token } = useAuth()
  const { documents, updateDocumentStatus } = useDocuments()
  const role = normalizeRole(currentUser?.systemRole || currentUser?.role || 'PM')
  const isPM = isPMRole(role)
  const isAssistant = isOpmRole(role)
  const isSpecificPM = String(currentUser?.systemRole || currentUser?.role || '').trim().toUpperCase() === 'PM'
  const isSpecificOIC = String(currentUser?.systemRole || currentUser?.role || '').trim().toUpperCase() === 'OIC'
  const [statusFilter, setStatusFilter] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [routingDoc, setRoutingDoc] = useState(null)
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
  const [finalizingDocId, setFinalizingDocId] = useState(null)
  const [divisionPositionCatalog, setDivisionPositionCatalog] = useState({})
  const [opmAssignee, setOpmAssignee] = useState('')
  const resolvedStatusFilter = normalizeStatus(statusFilter)
  const opmPositionOptions = getDivisionPositionOptionsFromCatalog(OPM_DIVISION, divisionPositionCatalog)
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

  useEffect(() => {
    if (!routingDoc || !token || (!isPM && !isAssistant)) return

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
  }, [isPM, isAssistant, routingDoc, token])

  // Role-specific queue: assistant reviews then forwards; PM routes to divisions.
  const assistantStatuses = new Set([
    WORKFLOW_STATUS.OPM_INITIAL_REVIEW,
    WORKFLOW_STATUS.PM_REVIEW,
    WORKFLOW_STATUS.PENDING_OPM_FINALIZATION,
    WORKFLOW_STATUS.ROUTED_CONCERNED,
    WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED,
    WORKFLOW_STATUS.REROUTED,
  ])
  if (resolvedStatusFilter) {
    assistantStatuses.add(resolvedStatusFilter)
  }
  const pmStatuses = new Set([
    WORKFLOW_STATUS.PM_REVIEW,
    WORKFLOW_STATUS.PENDING_OPM_FINALIZATION,
    WORKFLOW_STATUS.ROUTED_CONCERNED,
    WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED,
    WORKFLOW_STATUS.REROUTED,
  ])
  const opmDocs = documents.filter(doc => {
    if (isSpecificOIC && doc.targetDivision !== 'Officer-in-Charge (OIC)' && doc.targetDivision !== 'OIC') return false

    const docStatus = normalizeStatus(doc.status)
    return isAssistant
      ? assistantStatuses.has(docStatus)
      : pmStatuses.has(docStatus)
  })

  const filtered = opmDocs.filter(doc => {
    if (resolvedStatusFilter && normalizeStatus(doc.status) !== resolvedStatusFilter) return false
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      return (
        doc.trackingNumber.toLowerCase().includes(q) ||
        doc.subject.toLowerCase().includes(q) ||
        doc.sender.toLowerCase().includes(q)
      )
    }
    return true
  })

  const handleRouteToDiv = (doc, mode = 'pm') => {
    setRoutingMode(mode)
    setRoutingDoc(doc)
    const selected = Array.isArray(doc.targetDivisions)
      ? doc.targetDivisions
      : (doc.targetDivision ? [doc.targetDivision] : [])
    const docMain = doc.mainDivision || selected[0] || ''
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
    setRouteToDivisions(selected.filter((d) => d && d !== docMain))
    setRouteActions(normalizeTransmittalActions(doc.action))
    setRouteInstructions(doc.pmTransmittalInstructions || '')
    const { presetKeys, customTag } = splitRouteTags(doc.routeTags)
    setRouteTagKeys(presetKeys)
    setCustomTagLabel(customTag?.label || '')
    setCustomTagColor(customTag?.color || DEFAULT_CUSTOM_TAG_COLOR)
    setRouteDeliveryMethod((mode === 'opm-finalize-edit' || mode === 'opm-outgoing-edit') ? inferInitialRoutingMethod(doc) : 'both')
    setRouteAssignmentDraft(initialDraftAssignments)
    setOpmAssignee(resolvedOpmAssignee)
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
    const manager = options.find((position) => String(position || '').trim().toLowerCase() === 'division manager a')
    return manager || options[0] || ''
  }

  const toggleRouteDivision = (division) => {
    if (division === mainRouteDivision) return

    const isSelected = routeToDivisions.includes(division)
    setRouteToDivisions(prev =>
      prev.includes(division)
        ? prev.filter(d => d !== division)
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

  const selectMainDivision = (division) => {
    const opmAsCfParty = division !== OPM_DIVISION && routeToDivisions.includes(OPM_DIVISION)
    setMainRouteDivision(division)
    setRouteToDivisions(prev => prev.filter(d => d !== division))
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

  const submitRoute = async (method) => {
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

    const finalDivisions = [mainRouteDivision, ...routeToDivisions.filter((d) => d !== mainRouteDivision)]
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
    const normalizedFinalDivisions = finalDivisions.map(normalizeDivisionValue)
    const divisionSet = new Set(normalizedFinalDivisions)
    const existingReceipts = Array.isArray(routingDoc.divisionReceipts)
      ? routingDoc.divisionReceipts.filter((entry) => entry?.division)
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
    const updateOk = await updateDocumentStatus(routingDoc.id, statusLabel, {
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
        ...(routingDoc.routingHistory || []),
        {
          office: routedDivisionLabel,
          action: `${actionLabel} (${normalizedMethod === 'both' ? 'Physical + Digital' : 'Digital assignment'}) — OPR/Main: ${mainRouteDivision}; Action: ${routeActionSummary}${routeInstructions ? `; Instructions: ${routeInstructions}` : ''}${assignmentSummary ? `; Assignments: ${assignmentSummary}` : ''}`,
          date: new Date().toISOString().split('T')[0],
          time: new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
          user: currentUser?.name || (isOpmReroute ? 'OPM Secretary' : 'PM'),
          status: 'done',
        },
      ],
    })

    if (!updateOk) {
      toast.error('Failed to route document. Please try again.')
      return
    }

    toast.success(
      <div>
        <strong>{
          isOpmReroute
            ? 'Re-routed to RC/s Concerned:'
            : isOpmOutgoingEdit
              ? 'Updated OPM Outgoing (OPM Outgoing Review):'
              : 'Routed to RC/s Concerned (OPM Outgoing Review):'
        } {finalDivisions.length > 1 ? `${finalDivisions.length} divisions` : mainRouteDivision}!</strong><br />
        {routingDoc.trackingNumber} ({normalizedMethod === 'both' ? 'Physical + Digital' : 'Digital assignment'})
      </div>,
      { duration: 4000 }
    )
    setRoutingDoc(null)
    setRouteAssignmentDraft({})
    setOpmAssignee('')
    setRouteTagKeys([])
    setCustomTagLabel('')
    setCustomTagColor(DEFAULT_CUSTOM_TAG_COLOR)
    setRoutingMode('pm')
    setRouteDeliveryMethod('both')
    setRouteActions([TRANSMITTAL_ACTION_OPTIONS[0]])
  }

  const handleFinalizeRoute = async (doc) => {
    if (!doc || finalizingDocId) return

    setFinalizingDocId(doc.id)
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
      setFinalizingDocId(null)
      return
    }

    toast.success('Routing finalized. Divisions can now view the document.')
    setFinalizingDocId(null)
  }

  // Division options (exclude Records Section only)
  const targetDivisions = DIVISIONS.filter(d =>
    d !== 'Records Section'
  )

  const getRoutedDivisions = (doc) => {
    if (!(doc.status === WORKFLOW_STATUS.ROUTED_CONCERNED || doc.status === WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED || doc.status === WORKFLOW_STATUS.REROUTED || doc.status === WORKFLOW_STATUS.PENDING_OPM_FINALIZATION)) {
      return []
    }
    const raw = Array.isArray(doc.targetDivisions) && doc.targetDivisions.length > 0
      ? doc.targetDivisions
      : (doc.targetDivision ? [doc.targetDivision] : [])
    return raw
      .map((d) => String(d || '').trim())
      .filter(Boolean)
      .filter((d, idx, arr) => arr.indexOf(d) === idx)
  }

  const getDivisionReceipts = (doc) => {
    return Array.isArray(doc.divisionReceipts)
      ? doc.divisionReceipts.filter((entry) => entry?.division)
      : []
  }

  const isReceiptAcknowledged = (entry) => Boolean(entry?.verifiedAt || entry?.acknowledgedAt)

  return (
    <div className="opm-queue-page">
      <div className="page-header opm-queue-header">
        <h4>{isAssistant ? 'OPM Secretary Review Queue' : 'PM Routing Queue'}</h4>
        <p>
          {isAssistant
            ? 'Verify files, transmittal details, and all attachments at OPM before forwarding to PM.'
            : 'Route PM-reviewed communications to the concerned division/s for appropriate action.'}
        </p>
      </div>

      {/* Filters */}
      <div className="content-card mb-3 opm-queue-filter-card">
        <div className="content-card-body py-3 opm-queue-filter-body">
          <Row className="g-2 align-items-end opm-queue-filter-row">
            <Col md={4}>
              <Form.Control
                size="sm"
                placeholder="Search control/reference #, subject, sender..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </Col>
            <Col md={2}>
              <Form.Select size="sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">All Statuses</option>
                {isAssistant ? (
                  <>
                    <option value={WORKFLOW_STATUS.OPM_INITIAL_REVIEW}>{getStatusDisplayLabel(WORKFLOW_STATUS.OPM_INITIAL_REVIEW)}</option>
                    <option value={WORKFLOW_STATUS.PM_REVIEW}>{getStatusDisplayLabel(WORKFLOW_STATUS.PM_REVIEW)}</option>
                    <option value={WORKFLOW_STATUS.PENDING_OPM_FINALIZATION}>{getStatusDisplayLabel(WORKFLOW_STATUS.PENDING_OPM_FINALIZATION)}</option>
                    <option value={WORKFLOW_STATUS.REROUTED}>{getStatusDisplayLabel(WORKFLOW_STATUS.REROUTED)}</option>
                    <option value={WORKFLOW_STATUS.ROUTED_CONCERNED}>{getStatusDisplayLabel(WORKFLOW_STATUS.ROUTED_CONCERNED)}</option>
                    <option value={WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED}>{getStatusDisplayLabel(WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED)}</option>
                  </>
                ) : (
                  <>
                    <option value={WORKFLOW_STATUS.PM_REVIEW}>{getStatusDisplayLabel(WORKFLOW_STATUS.PM_REVIEW)}</option>
                    <option value={WORKFLOW_STATUS.PENDING_OPM_FINALIZATION}>{getStatusDisplayLabel(WORKFLOW_STATUS.PENDING_OPM_FINALIZATION)}</option>
                    <option value={WORKFLOW_STATUS.ROUTED_CONCERNED}>{getStatusDisplayLabel(WORKFLOW_STATUS.ROUTED_CONCERNED)}</option>
                    <option value={WORKFLOW_STATUS.REROUTED}>{getStatusDisplayLabel(WORKFLOW_STATUS.REROUTED)}</option>
                    <option value={WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED}>{getStatusDisplayLabel(WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED)}</option>
                  </>
                )}
              </Form.Select>
            </Col>
            <Col md={2}>
              <Button size="sm" variant="outline-secondary" onClick={() => { setStatusFilter(''); setSearchTerm('') }}>
                <i className="bi bi-x-lg me-1"></i>Clear
              </Button>
            </Col>
          </Row>
        </div>
      </div>

      {/* Route Modal */}
        {routingDoc && (isPM || isAssistant) && (
        <div className="content-card mb-3 opm-route-editor-card" style={{ borderLeft: '4px solid #002868' }}>
          <div className="content-card-header opm-route-editor-header">
              <h6><i className="bi bi-send me-2 text-primary"></i>{routeEditorTitle}</h6>
            <Button
              size="sm"
              variant="outline-secondary"
              onClick={() => {
                setRoutingDoc(null)
                setRouteAssignmentDraft({})
                setOpmAssignee('')
                setRouteTagKeys([])
                setCustomTagLabel('')
                setCustomTagColor(DEFAULT_CUSTOM_TAG_COLOR)
                setRoutingMode('pm')
                setRouteDeliveryMethod('both')
                setRouteActions([TRANSMITTAL_ACTION_OPTIONS[0]])
              }}
            >
              <i className="bi bi-x-lg"></i>
            </Button>
          </div>
          <div className="content-card-body opm-route-editor-body">
            <div className="mb-3" style={{ fontSize: 13 }}>
              <div className="d-flex flex-wrap align-items-center gap-2">
                <strong>{routingDoc.trackingNumber}</strong>
                {renderDocTags(draftRouteTags, 'doc-tag-group-inline')}
                <span>— {routingDoc.subject}</span>
              </div>
              <span className="text-muted">From: {routingDoc.sender} ({routingDoc.senderAddress})</span>
            </div>
            <Row className="g-3 opm-route-editor-grid">
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label className="fw-semibold" style={{ fontSize: 13 }}>Main Division *</Form.Label>
                  <Form.Select value={mainRouteDivision} onChange={e => selectMainDivision(e.target.value)}>
                    <option value="">Select main division...</option>
                    {targetDivisions.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </Form.Select>
                </Form.Group>
                {mainRouteDivision === OPM_DIVISION && (
                  <Form.Group className="mb-3">
                    <Form.Label className="fw-semibold" style={{ fontSize: 13 }}>OPM Delegate *</Form.Label>
                    <Form.Select
                      value={opmAssignee}
                      onChange={(e) => setDivisionAssignment(OPM_DIVISION, e.target.value)}
                    >
                      <option value="">Select OPM delegate...</option>
                      {opmPositionOptions.map((position) => (
                        <option key={position} value={position}>{position}</option>
                      ))}
                    </Form.Select>
                  </Form.Group>
                )}
                <Form.Group>
                  <div className="d-flex justify-content-between align-items-center mb-1">
                    <Form.Label className="fw-semibold mb-0" style={{ fontSize: 13 }}>CF Party(ies)</Form.Label>
                    <Button 
                      variant="link" 
                      className="p-0 text-decoration-none" 
                      style={{ fontSize: 12 }}
                      onClick={() => {
                        const available = targetDivisions.filter(d => d !== mainRouteDivision)
                        if (routeToDivisions.length === available.length) {
                          setRouteToDivisions([])
                        } else {
                          setRouteToDivisions(available)
                        }
                      }}
                    >
                      {routeToDivisions.length === targetDivisions.filter(d => d !== mainRouteDivision).length && targetDivisions.length > 1 ? 'Deselect All' : 'Select All'}
                    </Button>
                  </div>
                  <div style={{ border: '1px solid #dee2e6', borderRadius: 6, padding: 10, maxHeight: 140, overflowY: 'auto' }}>
                    {targetDivisions.map(d => (
                      <Form.Check
                        key={d}
                        type="checkbox"
                        id={`route-div-${d}`}
                        label={d === mainRouteDivision ? `${d} (Main)` : d}
                        checked={routeToDivisions.includes(d)}
                        onChange={() => toggleRouteDivision(d)}
                        className="mb-1"
                        style={{ fontSize: 13, opacity: d === mainRouteDivision ? 0.6 : 1 }}
                        disabled={d === mainRouteDivision}
                      />
                    ))}
                  </div>
                  <div className="mt-2 text-muted" style={{ fontSize: 12 }}>
                    Main: {mainRouteDivision || 'None'}
                    {routeToDivisions.length > 0 ? ` · CF Party(ies): ${routeToDivisions.join(', ')}` : ' · CF Party(ies): None'}
                  </div>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label className="fw-semibold" style={{ fontSize: 13 }}>Required Action</Form.Label>
                  <Dropdown autoClose="outside">
                    <Dropdown.Toggle
                      variant="outline-secondary"
                      className="w-100 text-start d-flex justify-content-between align-items-center"
                    >
                      <span>{routeActionToggleLabel}</span>
                    </Dropdown.Toggle>
                    <Dropdown.Menu className="w-100 p-2" style={{ maxHeight: 220, overflowY: 'auto' }}>
                      {TRANSMITTAL_ACTION_OPTIONS.map((option) => (
                        <Form.Check
                          key={option}
                          type="checkbox"
                          id={`route-action-${option}`}
                          label={option}
                          checked={routeActions.includes(option)}
                          onChange={() => toggleRouteAction(option)}
                          className="mb-1"
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
                        id={`route-tag-${tag.key}`}
                        label={<span className={getTagClassName(tag)}>{tag.label}</span>}
                        checked={routeTagKeys.includes(tag.key)}
                        onChange={() => toggleRouteTag(tag.key)}
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
                    />
                    <Form.Control
                      type="text"
                      value={customTagLabel}
                      onChange={(e) => setCustomTagLabel(e.target.value)}
                      placeholder="Custom tag (max 15 chars)"
                      maxLength={15}
                      className="doc-tag-label-input"
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
                  <Form.Label className="fw-semibold" style={{ fontSize: 13 }}>PM's Instructions</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    placeholder="Add PM instructions..."
                    value={routeInstructions}
                    onChange={e => setRouteInstructions(e.target.value)}
                  />
                </Form.Group>
              </Col>
            </Row>
            {isOpmOutgoingEdit ? (
              <div className="d-flex flex-wrap gap-3 mt-3 justify-content-between align-items-center opm-route-editor-actions">
                <div>
                  <div className="fw-semibold text-muted" style={{ fontSize: 12 }}>Current Selected:</div>
                  <div className="d-flex flex-column gap-1 mt-1">
                    <Form.Check
                      type="radio"
                      id="opm-update-method-both"
                      name="opm-update-method"
                      label={routePrimaryLabel}
                      checked={routeDeliveryMethod === 'both'}
                      onChange={() => setRouteDeliveryMethod('both')}
                    />
                    <Form.Check
                      type="radio"
                      id="opm-update-method-digital"
                      name="opm-update-method"
                      label={routeSecondaryLabel}
                      checked={routeDeliveryMethod === 'digital'}
                      onChange={() => setRouteDeliveryMethod('digital')}
                    />
                  </div>
                </div>
                <Button variant="primary" onClick={() => submitRoute(routeDeliveryMethod)}>
                  <i className="bi bi-save me-1"></i>Save and Proceed
                </Button>
              </div>
            ) : (
              <div className="d-flex gap-2 mt-3 justify-content-end opm-route-editor-actions">
                <Button variant="primary" onClick={() => submitRoute('both')}>
                  <i className="bi bi-send-check me-1"></i>{routePrimaryLabel}
                </Button>
                <Button variant="outline-secondary" onClick={() => submitRoute('digital')}>
                  <i className="bi bi-cloud-check me-1"></i>{routeSecondaryLabel}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Documents Table */}
      <div className="content-card opm-queue-table-card">
        <div className="table-responsive opm-queue-table-wrap">
          <table className={`table doc-table opm-queue-table mb-0 ${isPM ? 'pm-routing-table' : ''}`}>
            <thead>
              <tr>
                <th className="pm-col-control">Control/Reference #</th>
                <th className="pm-col-subject">Subject</th>
                {isPM ? (
                  <th className="pm-col-from">From</th>
                ) : (
                  <>
                    <th>Sender</th>
                    <th>Address</th>
                  </>
                )}
                {isPM && <th className="pm-col-receipts">Division Receipts</th>}
                <th className="pm-col-status">Status</th>
                <th className="pm-col-date">Date</th>
                <th className="pm-col-actions" style={{ width: isPM ? 92 : 120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-5 text-muted">
                    <i className="bi bi-inbox" style={{ fontSize: 32, display: 'block', marginBottom: 8, opacity: 0.3 }}></i>
                    {isAssistant ? 'No documents for OPM review' : 'No PM review documents for routing'}
                  </td>
                </tr>
              ) : (
                filtered.map(doc => (
                  (() => {
                    const routed = getRoutedDivisions(doc)
                    const receipts = getDivisionReceipts(doc)
                    const acknowledgedReceipts = receipts.filter((entry) => isReceiptAcknowledged(entry))
                    const receivedCount = routed.length > 0
                      ? routed.filter((division) => acknowledgedReceipts.some((entry) => entry.division === division)).length
                      : 0
                    return (
                  <tr key={doc.id} className="opm-queue-row">
                    <td>
                      <Link to={`/document/${doc.id}`} className="tracking-number text-decoration-none">
                        {doc.trackingNumber}
                      </Link>
                    </td>
                    <td className={isPM ? 'pm-cell-subject' : ''} title={doc.subject}>
                      {renderDocTags(doc.routeTags, 'doc-tag-group-table')}
                      <div
                        className="doc-subject-text"
                        style={isPM ? undefined : { maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                      >
                        {doc.subject}
                      </div>
                    </td>
                    {isPM ? (
                      <td className="pm-cell-from">
                        <div className="pm-cell-from-sender" title={doc.sender}>{doc.sender || '—'}</div>
                        <div className="pm-cell-from-address" title={doc.senderAddress}>{doc.senderAddress || '—'}</div>
                      </td>
                    ) : (
                      <>
                        <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {doc.sender}
                        </td>
                        <td style={{ fontSize: 12 }}>{doc.senderAddress}</td>
                      </>
                    )}
                    {isPM && (
                      <td className="pm-cell-receipts" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                        {routed.length === 0 ? (
                          <span className="badge bg-secondary">For Routing</span>
                        ) : (
                          <span className={`badge ${receivedCount === routed.length ? 'bg-success' : 'bg-warning text-dark'}`}>
                            {receivedCount}/{routed.length} received
                          </span>
                        )}
                      </td>
                    )}
                    <td style={{ whiteSpace: 'nowrap' }}><StatusBadge status={doc.status} compact /></td>
                    <td className={isPM ? 'pm-cell-date' : ''} style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{doc.dateReceived}</td>
                    <td className={isPM ? 'pm-cell-actions' : ''}>
                      <div className="d-flex gap-1 pm-actions-row opm-queue-actions">
                        <Link to={`/document/${doc.id}`} className="action-btn pm-action-btn" title="View Details">
                          <i className="bi bi-eye"></i>
                        </Link>
                        {isAssistant && (doc.status === WORKFLOW_STATUS.PENDING_OPM_FINALIZATION || doc.status === WORKFLOW_STATUS.ROUTED_CONCERNED) && (
                          <button
                            className="action-btn pm-action-btn"
                            title="Edit OPM Outgoing"
                            onClick={() => handleRouteToDiv(
                              doc,
                              doc.status === WORKFLOW_STATUS.PENDING_OPM_FINALIZATION ? 'opm-finalize-edit' : 'opm-outgoing-edit'
                            )}
                          >
                            <i className="bi bi-pencil-square"></i>
                          </button>
                        )}
                        {isAssistant && doc.status === WORKFLOW_STATUS.PENDING_OPM_FINALIZATION && (
                          <button
                            className="action-btn pm-action-btn"
                            title="Proceed to OPR/s"
                            onClick={() => handleFinalizeRoute(doc)}
                            disabled={finalizingDocId === doc.id}
                          >
                            <i className={finalizingDocId === doc.id ? 'bi bi-hourglass-split' : 'bi bi-check2-circle'}></i>
                          </button>
                        )}
                        {isPM && doc.status === WORKFLOW_STATUS.PM_REVIEW && (
                          <button className="action-btn pm-action-btn" title="Route to Division" onClick={() => handleRouteToDiv(doc, 'pm')}>
                            <i className="bi bi-send"></i>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                    )
                  })()
                ))
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="content-card-body border-top d-flex justify-content-between align-items-center py-2 opm-queue-footer-meta">
            <span style={{ fontSize: 13, color: '#6c757d' }}>
              Showing {filtered.length} of {opmDocs.length} documents
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
