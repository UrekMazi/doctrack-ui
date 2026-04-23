import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Row, Col, Form, Button } from 'react-bootstrap'
import StatusBadge from '../components/StatusBadge'
import { DIVISIONS } from '../data/mockData'
import { useAuth } from '../context/AuthContext'
import { useDocuments } from '../context/DocumentContext'
import toast from 'react-hot-toast'
import { WORKFLOW_STATUS, getStatusDisplayLabel } from '../utils/workflowLabels'
import {
  OPM_DIVISION,
  buildPmRouteAssignments,
  buildRouteAssignments,
  getAssignedPosition,
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

const LEGACY_TRANSMITTAL_ACTION_MAP = {
  'For review and appropriate action': 'As appropriate',
  'For information': 'For information/reference/file',
  'For approval / signature': 'For evaluation/review',
  'For compliance': 'For monitoring',
  'For comment / recommendation': 'Give comments/recommendations',
}

function normalizeTransmittalAction(value) {
  const raw = String(value || '').trim()
  if (!raw) return TRANSMITTAL_ACTION_OPTIONS[0]
  const normalized = LEGACY_TRANSMITTAL_ACTION_MAP[raw] || raw
  return TRANSMITTAL_ACTION_OPTIONS.includes(normalized) ? normalized : TRANSMITTAL_ACTION_OPTIONS[0]
}

export default function OPMEndorsed({ currentUser }) {
  const { token } = useAuth()
  const { documents, updateDocumentStatus } = useDocuments()
  const role = currentUser?.systemRole || 'PM'
  const isAssistant = role === 'OPM Assistant'
  const isPM = role === 'PM'
  const [statusFilter, setStatusFilter] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [routingDoc, setRoutingDoc] = useState(null)
  const [mainRouteDivision, setMainRouteDivision] = useState('')
  const [routeToDivisions, setRouteToDivisions] = useState([])
  const [routeAction, setRouteAction] = useState(TRANSMITTAL_ACTION_OPTIONS[0])
  const [routeInstructions, setRouteInstructions] = useState('')
  const [routeAssignmentDraft, setRouteAssignmentDraft] = useState({})
  const [divisionPositionCatalog, setDivisionPositionCatalog] = useState({})
  const [opmAssignee, setOpmAssignee] = useState('')
  const selectedRouteDivisions = [
    mainRouteDivision,
    ...routeToDivisions.filter((division) => division !== mainRouteDivision),
  ].filter(Boolean)
  const hasOpmSelection = selectedRouteDivisions.includes(OPM_DIVISION)

  useEffect(() => {
    if (!isPM || !routingDoc || !token) return

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
  }, [isPM, routingDoc, token])

  // Role-specific queue: assistant reviews then forwards; PM routes to divisions.
  const opmDocs = documents.filter(doc =>
    isAssistant
      ? doc.status === WORKFLOW_STATUS.OPM_INITIAL_REVIEW || doc.status === WORKFLOW_STATUS.PM_REVIEW
      : doc.status === WORKFLOW_STATUS.PM_REVIEW || doc.status === WORKFLOW_STATUS.ROUTED_CONCERNED || doc.status === WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED
  )

  const filtered = opmDocs.filter(doc => {
    if (statusFilter && doc.status !== statusFilter) return false
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

  const handleRouteToDiv = (doc) => {
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
    setRouteAction(normalizeTransmittalAction(doc.action))
    setRouteInstructions(doc.pmTransmittalInstructions || '')
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
    }
  }

  const selectMainDivision = (division) => {
    setMainRouteDivision(division)
    setRouteToDivisions(prev => prev.filter(d => d !== division))
    setRouteAssignmentDraft((prev) => {
      if (!division || Object.prototype.hasOwnProperty.call(prev, division)) return prev
      return {
        ...prev,
        [division]: { position: division === OPM_DIVISION ? String(opmAssignee || '') : '' },
      }
    })
  }

  const submitRoute = async (method) => {
    const normalizedMethod = method === 'digital' ? 'digital' : method === 'both' ? 'both' : ''
    if (!normalizedMethod) {
      toast.error('PM routing supports only Physical + Digital or Digital Only.')
      return
    }

    if (!mainRouteDivision) {
      toast.error('Please select one main division.')
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
    const updateOk = await updateDocumentStatus(routingDoc.id, WORKFLOW_STATUS.ROUTED_CONCERNED, {
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
      action: routeAction,
      pmTransmittalInstructions: routeInstructions,
      opmAssignee: resolvedOpmAssignee || '',
      routingHistory: [
        ...(routingDoc.routingHistory || []),
        {
          office: routedDivisionLabel,
          action: `Routed by PM (${normalizedMethod === 'both' ? 'Physical + Digital' : 'Digital assignment'}) — OPR/Main: ${mainRouteDivision}; Action: ${routeAction}${routeInstructions ? `; Instructions: ${routeInstructions}` : ''}${assignmentSummary ? `; Assignments: ${assignmentSummary}` : ''}`,
          date: new Date().toISOString().split('T')[0],
          time: new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
          user: 'PM',
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
        <strong>Routed to RC/s Concerned: {finalDivisions.length > 1 ? `${finalDivisions.length} divisions` : mainRouteDivision}!</strong><br />
        {routingDoc.trackingNumber} ({normalizedMethod === 'both' ? 'Physical + Digital' : 'Digital assignment'})
      </div>,
      { duration: 4000 }
    )
    setRoutingDoc(null)
    setRouteAssignmentDraft({})
    setOpmAssignee('')
  }

  // Division options (exclude Records Section only)
  const targetDivisions = DIVISIONS.filter(d =>
    d !== 'Records Section'
  )

  const getRoutedDivisions = (doc) => {
    if (!(doc.status === WORKFLOW_STATUS.ROUTED_CONCERNED || doc.status === WORKFLOW_STATUS.RECEIVED_ACKNOWLEDGED)) {
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

  return (
    <div className="opm-queue-page">
      <div className="page-header opm-queue-header">
        <h4>{isAssistant ? 'Office of the Port Manager Review Queue' : 'PM Routing Queue'}</h4>
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
                  </>
                ) : (
                  <>
                    <option value={WORKFLOW_STATUS.PM_REVIEW}>{getStatusDisplayLabel(WORKFLOW_STATUS.PM_REVIEW)}</option>
                    <option value={WORKFLOW_STATUS.ROUTED_CONCERNED}>{getStatusDisplayLabel(WORKFLOW_STATUS.ROUTED_CONCERNED)}</option>
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
      {routingDoc && isPM && (
        <div className="content-card mb-3 opm-route-editor-card" style={{ borderLeft: '4px solid #002868' }}>
          <div className="content-card-header opm-route-editor-header">
            <h6><i className="bi bi-send me-2 text-primary"></i>Edit Transmittal Slip & Route to Division</h6>
            <Button
              size="sm"
              variant="outline-secondary"
              onClick={() => {
                setRoutingDoc(null)
                setRouteAssignmentDraft({})
                setOpmAssignee('')
              }}
            >
              <i className="bi bi-x-lg"></i>
            </Button>
          </div>
          <div className="content-card-body opm-route-editor-body">
            <div className="mb-3" style={{ fontSize: 13 }}>
              <strong>{routingDoc.trackingNumber}</strong> — {routingDoc.subject}
              <br /><span className="text-muted">From: {routingDoc.sender} ({routingDoc.senderAddress})</span>
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
                  <Form.Select value={routeAction} onChange={e => setRouteAction(e.target.value)}>
                    {TRANSMITTAL_ACTION_OPTIONS.map((option) => (
                      <option key={option} value={option}>{option}</option>
                    ))}
                  </Form.Select>
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
            <div className="d-flex gap-2 mt-3 justify-content-end opm-route-editor-actions">
              <Button variant="primary" onClick={() => submitRoute('both')}>
                <i className="bi bi-send-check me-1"></i>Route (Physical + Digital)
              </Button>
              <Button variant="outline-secondary" onClick={() => submitRoute('digital')}>
                <i className="bi bi-cloud-check me-1"></i>Digital Only
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Documents Table */}
      <div className="content-card opm-queue-table-card">
        <div className="table-responsive opm-queue-table-wrap">
          <table className={`table doc-table opm-queue-table mb-0 ${isPM ? 'pm-routing-table' : ''}`}>
            <thead>
              <tr>
                <th className="pm-col-control">{isPM ? 'Control/Tracking #' : 'Control/Reference #'}</th>
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
                    const receivedCount = routed.length > 0
                      ? routed.filter((division) => receipts.some((entry) => entry.division === division)).length
                      : 0
                    return (
                  <tr key={doc.id} className="opm-queue-row">
                    <td>
                      <Link to={`/document/${doc.id}`} className="tracking-number text-decoration-none">
                        {doc.trackingNumber}
                      </Link>
                    </td>
                    <td className={isPM ? 'pm-cell-subject' : ''} style={isPM ? undefined : { maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.subject}>
                      {doc.subject}
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
                        {isPM && doc.status === WORKFLOW_STATUS.PM_REVIEW && (
                          <button className="action-btn pm-action-btn" title="Route to Division" onClick={() => handleRouteToDiv(doc)}>
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
