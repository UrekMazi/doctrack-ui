import { useEffect, useMemo, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Row, Col, Form, Button, Alert } from 'react-bootstrap'
import StatusBadge from '../components/StatusBadge'
import { OUTGOING_DOCUMENTS } from '../data/mockData'
import { useDocuments } from '../context/DocumentContext'
import { useAuth } from '../context/AuthContext'
import { inferDocumentDirection } from '../utils/documentDirection'
import { normalizeRole, isOpmRole, isOpmInitialReviewStatus, WORKFLOW_STATUS } from '../utils/workflowLabels'

export default function Tracking() {
  const { documents } = useDocuments()
  const { user } = useAuth()
  const [searchParams] = useSearchParams()
  const initialQuery = searchParams.get('q') || ''
  const normalizeText = (value) => String(value || '').trim().toLowerCase()
  const role = normalizeRole(user?.role || user?.systemRole || '')
  const userDivision = String(user?.division || '').trim()
  const normalizedUserDivision = normalizeText(userDivision)
  const userPosition = String(user?.position || '').trim()
  const normalizedUserPosition = normalizeText(userPosition)
  const isDivisionManager = role === 'Division' && normalizedUserPosition.includes('division manager')
  const isOperator = role === 'Operator'
  const isOpm = isOpmRole(role)
  const [accomplishedVisibleCount, setAccomplishedVisibleCount] = useState(20)

  const parseTimestamp = (value) => {
    const parsed = Date.parse(String(value || '').trim())
    return Number.isNaN(parsed) ? 0 : parsed
  }

  const getDocumentTargetDivisions = (doc) => {
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

  const isTrackableForDivisionManager = (doc) => {
    if (!normalizedUserDivision) return false

    const targetDivisions = getDocumentTargetDivisions(doc)
    const routedToDivision = targetDivisions.some(
      (division) => normalizeText(division) === normalizedUserDivision
    )

    const delegatedDivision = normalizeText(doc?.assignedDivision)
    const delegatedToDivision = delegatedDivision && delegatedDivision === normalizedUserDivision

    const assignments = doc?.routeAssignments
    const hasRouteAssignment = assignments && typeof assignments === 'object'
      ? Object.keys(assignments).some((key) => normalizeText(key) === normalizedUserDivision)
      : false

    return routedToDivision || delegatedToDivision || hasRouteAssignment
  }

  const isRelevantForOpmPm = (doc) => {
    const kw = (v) => String(v || '').toLowerCase()
    const history = Array.isArray(doc?.routingHistory) ? doc.routingHistory : []
    const hit = history.some((entry) => {
      const action = kw(entry?.action)
      const office = kw(entry?.office)
      if (office.includes('office of the port manager') || office.includes('opm')) return true
      if (/endorse|endorsed|endorsed to opm|endorsed to pm|routed by pm|opm assistant|opm secretary|pm review/i.test(entry?.action || '')) return true
      return false
    })
    if (hit) return true
    const currentStatus = String(doc?.status || '')
    if (isOpmInitialReviewStatus(currentStatus) || currentStatus === WORKFLOW_STATUS.PM_REVIEW || currentStatus === WORKFLOW_STATUS.PENDING_OPM_FINALIZATION || currentStatus === WORKFLOW_STATUS.REROUTED) return true
    const targetDivs = getDocumentTargetDivisions(doc)
    if (targetDivs.some(d => kw(d).includes('office of the port manager') || kw(d).includes('opm'))) return true
    if (kw(doc?.currentLocation).includes('office of the port manager') || kw(doc?.senderAddress).includes('office of the port manager')) return true
    return false
  }

  const getSupportingDivisions = (doc, normalizedMainDivision) => {
    const explicitSupporting = Array.isArray(doc?.supportingDivisions)
      ? doc.supportingDivisions.filter((division) => String(division || '').trim().length > 0)
      : []
    const fallbackSupporting = Array.isArray(doc?.targetDivisions) && doc.targetDivisions.length > 0
      ? doc.targetDivisions.filter((division) => {
          const normalizedDivision = normalizeText(division)
          return normalizedDivision.length > 0 && normalizedDivision !== normalizedMainDivision
        })
      : []

    const rawList = explicitSupporting.length > 0 ? explicitSupporting : fallbackSupporting
    const normalized = rawList
      .map((division) => String(division || '').trim())
      .filter((division) => division.length > 0)
      .map((division) => normalizeText(division))
      .filter((division) => division.length > 0 && division !== normalizedMainDivision)

    return [...new Set(normalized)]
  }

  const getCompletionTimestamp = (doc) => {
    const completedAt = parseTimestamp(doc?.completedAt)
    if (completedAt) return completedAt

    const history = Array.isArray(doc?.routingHistory) ? doc.routingHistory : []
    let fallback = 0

    history.forEach((entry) => {
      const action = String(entry?.action || '')
      if (!/task completed/i.test(action)) return

      const date = String(entry?.date || '').trim()
      const time = String(entry?.time || '').trim()
      let stamp = 0

      if (date && time) {
        const parsed = Date.parse(`${date} ${time}`)
        if (!Number.isNaN(parsed)) stamp = parsed
      }

      if (!stamp && date) {
        const parsed = Date.parse(date)
        if (!Number.isNaN(parsed)) stamp = parsed
      }

      if (stamp > fallback) fallback = stamp
    })

    return fallback
  }

  const formatCompletionTimestamp = (timestamp) => {
    if (!timestamp) return ''
    return new Date(timestamp).toLocaleString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const accomplishedDocs = useMemo(() => {
    // Operator: show all completed documents (records see everything)
    if (isOperator) {
      return documents
        .filter((doc) => normalizeText(doc?.status) === 'completed')
        .map((doc) => ({ ...doc, _completionTimestamp: getCompletionTimestamp(doc) }))
        .sort((a, b) => b._completionTimestamp - a._completionTimestamp)
    }

    // Division manager: show completed docs routed/delegated to their division
    if (isDivisionManager && normalizedUserDivision) {
      return documents
        .filter((doc) => normalizeText(doc?.status) === 'completed')
        .filter((doc) => {
          const mainDivision = String(doc?.oprDivision || doc?.mainDivision || doc?.targetDivision || '').trim()
          const normalizedMain = normalizeText(mainDivision)
          const supportingDivisions = getSupportingDivisions(doc, normalizedMain)
          const isMain = normalizedMain && normalizedMain === normalizedUserDivision
          const isSupporting = supportingDivisions.includes(normalizedUserDivision)
          const delegatedDivision = normalizeText(doc?.assignedDivision)
          const delegatedToDivision = delegatedDivision && delegatedDivision === normalizedUserDivision
          const assignments = doc?.routeAssignments
          const hasRouteAssignment = assignments && typeof assignments === 'object'
            ? Object.keys(assignments).some((key) => normalizeText(key) === normalizedUserDivision)
            : false
          return isMain || isSupporting || delegatedToDivision || hasRouteAssignment
        })
        .map((doc) => ({ ...doc, _completionTimestamp: getCompletionTimestamp(doc) }))
        .sort((a, b) => b._completionTimestamp - a._completionTimestamp)
    }

    // OPM / PM: show completed docs that went through OPM/PM endorsement/review
    if (isOpm || role === 'PM') {
      const hadOpmPmReview = (doc) => {
        const history = Array.isArray(doc?.routingHistory) ? doc.routingHistory : []
        const kw = (v) => String(v || '').toLowerCase()
        const hit = history.some((entry) => {
          const action = kw(entry?.action)
          const office = kw(entry?.office)
          if (office.includes('office of the port manager') || office.includes('opm')) return true
          if (/endorse|endorsed|endorsed to opm|endorsed to pm|routed by pm|opm assistant|opm secretary|pm review/i.test(entry?.action || '')) return true
          return false
        })
        if (hit) return true
        const currentStatus = String(doc?.status || '')
        if (isOpmInitialReviewStatus(currentStatus) || currentStatus === WORKFLOW_STATUS.PM_REVIEW || currentStatus === WORKFLOW_STATUS.PENDING_OPM_FINALIZATION || currentStatus === WORKFLOW_STATUS.REROUTED) return true
        const targetDivs = getDocumentTargetDivisions(doc)
        if (targetDivs.some(d => kw(d).includes('office of the port manager') || kw(d).includes('opm'))) return true
        if (kw(doc?.currentLocation).includes('office of the port manager') || kw(doc?.senderAddress).includes('office of the port manager')) return true
        return false
      }

      return documents
        .filter((doc) => normalizeText(doc?.status) === 'completed')
        .filter(hadOpmPmReview)
        .map((doc) => ({ ...doc, _completionTimestamp: getCompletionTimestamp(doc) }))
        .sort((a, b) => b._completionTimestamp - a._completionTimestamp)
    }

    return []
  }, [documents, isDivisionManager, normalizedUserDivision, isOperator, isOpm, role])

  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState(() => {
    if (initialQuery) return search(initialQuery)
    return null
  })

  useEffect(() => {
    if (results === null) {
      setAccomplishedVisibleCount(20)
    }
  }, [results])

  useEffect(() => {
    if (initialQuery) {
      setResults(search(initialQuery))
    }
  }, [documents, initialQuery, isDivisionManager, normalizedUserDivision])

  function search(q) {
    const term = q.toLowerCase().trim()
    if (!term) return null
    const allDocs = [...documents, ...OUTGOING_DOCUMENTS].filter(
      (doc, idx, arr) => arr.findIndex((d) => d.trackingNumber === doc.trackingNumber) === idx
    )
    const scopedDocs = isDivisionManager
      ? allDocs.filter(isTrackableForDivisionManager)
      : (isOpm || role === 'PM')
        ? allDocs.filter(isRelevantForOpmPm)
        : allDocs
    return scopedDocs.filter(d =>
      String(d.trackingNumber || '').toLowerCase().includes(term) ||
      String(d.subject || '').toLowerCase().includes(term) ||
      String(d.sender || '').toLowerCase().includes(term) ||
      String(d.recipient || '').toLowerCase().includes(term)
    )
  }

  const handleSearch = (e) => {
    e.preventDefault()
    setResults(search(query))
  }

  return (
    <>
      <div className="page-header">
        <h4>{isOperator ? 'Track Document' : 'Accomplished'}</h4>
      </div>

      <div className="content-card mb-4">
        <div className="content-card-body">
          <form onSubmit={handleSearch}>
            <Row className="g-2 align-items-end">
              <Col md={8}>
                <Form.Control
                  size="lg"
                  placeholder="Enter control/reference number, subject, or sender..."
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  style={{ fontSize: 15 }}
                />
              </Col>
              <Col md={2}>
                <Button type="submit" variant="primary" size="lg" className="w-100">
                  <i className="bi bi-search me-2"></i>Search
                </Button>
              </Col>
              <Col md={2}>
                <Link to="/qr-scanner" className="btn btn-outline-primary btn-lg w-100">
                  <i className="bi bi-qr-code-scan me-2"></i>Scan QR
                </Link>
              </Col>
            </Row>
          </form>
        </div>
      </div>

      {results !== null && (
        <>
          {results.length === 0 ? (
            <Alert variant="warning">
              <i className="bi bi-exclamation-triangle me-2"></i>
              No documents found matching "<strong>{query}</strong>"
            </Alert>
          ) : (
            <>
              <div className="mb-3" style={{ fontSize: 14, color: '#6c757d' }}>
                Found <strong>{results.length}</strong> document(s) matching "<strong>{query}</strong>"
              </div>
              {results.map(doc => {
                const isIncoming = inferDocumentDirection(doc) === 'Incoming'
                const docLinkId = doc.id ?? doc.trackingNumber
                return (
                  <div key={docLinkId} className="content-card mb-3">
                    <div className="content-card-body">
                      <Row className="align-items-center">
                        <Col md={2}>
                          <Link to={`/document/${docLinkId}`} className="tracking-number text-decoration-none" style={{ fontSize: 15 }}>
                            {doc.trackingNumber}
                          </Link>
                          <div className="mt-1">
                            <span className={`badge ${isIncoming ? 'bg-primary' : 'bg-success'}`} style={{ fontSize: 10 }}>
                              {isIncoming ? 'INCOMING' : 'OUTGOING'}
                            </span>
                          </div>
                        </Col>
                        <Col md={4}>
                          <div className="fw-semibold" style={{ fontSize: 14 }}>{doc.subject}</div>
                          <div style={{ fontSize: 12, color: '#6c757d' }}>
                            {isIncoming
                              ? `From: ${doc.sender || 'N/A'}`
                              : `To: ${doc.recipient || doc.sender || 'N/A'}`}
                          </div>
                        </Col>
                        <Col md={2}>
                          <small className="text-muted d-block">Type</small>
                          <span className="badge bg-light text-dark border">{doc.type}</span>
                        </Col>
                        <Col md={2}>
                          <small className="text-muted d-block">Status</small>
                          <StatusBadge status={doc.status} />
                        </Col>
                        <Col md={2} className="text-end">
                          <Link to={`/document/${docLinkId}`} className="btn btn-sm btn-outline-primary">
                            <i className="bi bi-eye me-1"></i>View
                          </Link>
                        </Col>
                      </Row>
                    </div>
                  </div>
                )
              })}
            </>
          )}
        </>
      )}

      {results === null && (
        (isDivisionManager || isOpm || role === 'PM') ? (
          <>
            <div className="mb-3">
              <h5 className="mb-1">Recent Accomplished Tasks</h5>
              <div style={{ fontSize: 13, color: '#6c757d' }}>
                Showing {Math.min(accomplishedVisibleCount, accomplishedDocs.length)} of {accomplishedDocs.length} completed tasks
              </div>
            </div>

            {accomplishedDocs.length === 0 ? (
              <div className="content-card">
                <div className="content-card-body text-center py-4 text-muted">
                  No completed tasks found for your division yet.
                </div>
              </div>
            ) : (
              <>
                {accomplishedDocs.slice(0, accomplishedVisibleCount).map((doc) => {
                  const isIncoming = inferDocumentDirection(doc) === 'Incoming'
                  const docLinkId = doc.id ?? doc.trackingNumber
                  const completedAtLabel = formatCompletionTimestamp(doc._completionTimestamp)
                  return (
                    <div key={docLinkId} className="content-card mb-3">
                      <div className="content-card-body">
                        <Row className="align-items-center">
                          <Col md={2}>
                            <Link to={`/document/${docLinkId}`} className="tracking-number text-decoration-none" style={{ fontSize: 15 }}>
                              {doc.trackingNumber}
                            </Link>
                            <div className="mt-1">
                              <span className={`badge ${isIncoming ? 'bg-primary' : 'bg-success'}`} style={{ fontSize: 10 }}>
                                {isIncoming ? 'INCOMING' : 'OUTGOING'}
                              </span>
                            </div>
                          </Col>
                          <Col md={4}>
                            <div className="fw-semibold" style={{ fontSize: 14 }}>{doc.subject}</div>
                            <div style={{ fontSize: 12, color: '#6c757d' }}>
                              {isIncoming
                                ? `From: ${doc.sender || 'N/A'}`
                                : `To: ${doc.recipient || doc.sender || 'N/A'}`}
                            </div>
                          </Col>
                          <Col md={2}>
                            <small className="text-muted d-block">Type</small>
                            <span className="badge bg-light text-dark border">{doc.type}</span>
                          </Col>
                          <Col md={2}>
                            <small className="text-muted d-block">Status</small>
                            <StatusBadge status={doc.status} />
                            {completedAtLabel && (
                              <div style={{ fontSize: 11, color: '#6c757d' }}>
                                {completedAtLabel}
                              </div>
                            )}
                          </Col>
                          <Col md={2} className="text-end">
                            <Link to={`/document/${docLinkId}`} className="btn btn-sm btn-outline-primary">
                              <i className="bi bi-eye me-1"></i>View
                            </Link>
                          </Col>
                        </Row>
                      </div>
                    </div>
                  )
                })}
                {accomplishedDocs.length > accomplishedVisibleCount && (
                  <div className="text-center mt-3">
                    <Button
                      variant="outline-secondary"
                      size="sm"
                      onClick={() => setAccomplishedVisibleCount((prev) => Math.min(prev + 20, accomplishedDocs.length))}
                    >
                      Show more
                    </Button>
                  </div>
                )}
              </>
            )}
          </>
        ) : (
          <div className="content-card">
            <div className="content-card-body text-center py-5">
              <i className="bi bi-search" style={{ fontSize: 48, color: '#dee2e6', display: 'block', marginBottom: 16 }}></i>
              <h5 className="text-muted">Search for a Document</h5>
            </div>
          </div>
        )
      )}
    </>
  )
}
