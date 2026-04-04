import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Row, Col, Form, Button } from 'react-bootstrap'
import StatusBadge from '../components/StatusBadge'
import { DIVISIONS } from '../data/mockData'
import { useDocuments } from '../context/DocumentContext'
import toast from 'react-hot-toast'

export default function OPMEndorsed({ currentUser }) {
  const { documents, updateDocumentStatus } = useDocuments()
  const role = currentUser?.systemRole || 'PM'
  const isAssistant = role === 'OPM Assistant'
  const isPM = role === 'PM'
  const [statusFilter, setStatusFilter] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [routingDoc, setRoutingDoc] = useState(null)
  const [mainRouteDivision, setMainRouteDivision] = useState('')
  const [routeToDivisions, setRouteToDivisions] = useState([])
  const [routeAction, setRouteAction] = useState('For review and appropriate action')
  const [routeInstructions, setRouteInstructions] = useState('')

  // Role-specific queue: assistant reviews then forwards; PM routes to divisions.
  const opmDocs = documents.filter(doc =>
    isAssistant
      ? doc.status === 'For OPM Assistant Review' || doc.status === 'Endorsed to OPM'
      : doc.status === 'Endorsed to OPM' || doc.status === 'Routed to Division' || doc.status === 'Received & Acknowledged'
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
      : (doc.targetDivision && doc.targetDivision !== 'Office of the Port Manager (OPM)' ? [doc.targetDivision] : [])
    const docMain = doc.mainDivision || selected[0] || ''
    setMainRouteDivision(docMain)
    setRouteToDivisions(selected.filter((d) => d && d !== docMain))
    setRouteAction(doc.action || 'For review and appropriate action')
    setRouteInstructions(doc.pmTransmittalInstructions || '')
  }

  const toggleRouteDivision = (division) => {
    if (division === mainRouteDivision) return
    setRouteToDivisions(prev =>
      prev.includes(division)
        ? prev.filter(d => d !== division)
        : [...prev, division]
    )
  }

  const selectMainDivision = (division) => {
    setMainRouteDivision(division)
    setRouteToDivisions(prev => prev.filter(d => d !== division))
  }

  const submitRoute = (method) => {
    if (!mainRouteDivision) {
      toast.error('Please select one main division.')
      return
    }
    const finalDivisions = [mainRouteDivision, ...routeToDivisions.filter((d) => d !== mainRouteDivision)]
    const routedDivisionLabel = finalDivisions.join(', ')
    updateDocumentStatus(routingDoc.id, 'Routed to Division', {
      targetDivision: mainRouteDivision,
      mainDivision: mainRouteDivision,
      oprDivision: mainRouteDivision,
      targetDivisions: finalDivisions,
      supportingDivisions: routeToDivisions,
      currentLocation: finalDivisions.length > 1 ? 'Multiple Divisions' : mainRouteDivision,
      action: routeAction,
      pmTransmittalInstructions: routeInstructions,
      routingHistory: [
        ...(routingDoc.routingHistory || []),
        {
          office: routedDivisionLabel,
          action: `Routed by PM (${method === 'both' ? 'Physical + Digital' : method === 'physical' ? 'Physical handover' : 'Digital assignment'}) — OPR/Main: ${mainRouteDivision}; Action: ${routeAction}${routeInstructions ? `; Instructions: ${routeInstructions}` : ''}`,
          date: new Date().toISOString().split('T')[0],
          time: new Date().toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' }),
          user: 'PM',
          status: 'done',
        },
      ],
    })
    toast.success(
      <div>
        <strong>Routed to {finalDivisions.length > 1 ? `${finalDivisions.length} divisions` : mainRouteDivision}!</strong><br />
        {routingDoc.trackingNumber} ({method === 'both' ? 'Physical + Digital' : method === 'physical' ? 'Physical handover' : 'Digital assignment'})
      </div>,
      { duration: 4000 }
    )
    setRoutingDoc(null)
  }

  // Division options (exclude Records and Office of the Port Manager)
  const targetDivisions = DIVISIONS.filter(d =>
    d !== 'Records Section' && d !== 'Office of the Port Manager (OPM)'
  )

  const getRoutedDivisions = (doc) => {
    if (!(doc.status === 'Routed to Division' || doc.status === 'Received & Acknowledged')) {
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
    <>
      <div className="page-header">
        <h4>{isAssistant ? 'OPM Assistant Review Queue' : 'PM Routing Queue'}</h4>
        <p>
          {isAssistant
            ? 'Verify files, transmittal details, and whole record before forwarding to PM.'
            : 'Route PM-approved documents to the proper division and finalize transmittal details.'}
        </p>
      </div>

      {/* Filters */}
      <div className="content-card mb-3">
        <div className="content-card-body py-3">
          <Row className="g-2 align-items-end">
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
                    <option value="For OPM Assistant Review">For OPM Assistant Review</option>
                    <option value="Endorsed to OPM">Endorsed to OPM</option>
                  </>
                ) : (
                  <>
                    <option value="Endorsed to OPM">Endorsed to OPM</option>
                    <option value="Routed to Division">Routed to Division</option>
                    <option value="Received & Acknowledged">Received & Acknowledged</option>
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
        <div className="content-card mb-3" style={{ borderLeft: '4px solid #002868' }}>
          <div className="content-card-header">
            <h6><i className="bi bi-send me-2 text-primary"></i>Edit Transmittal Slip & Route to Division</h6>
            <Button size="sm" variant="outline-secondary" onClick={() => setRoutingDoc(null)}>
              <i className="bi bi-x-lg"></i>
            </Button>
          </div>
          <div className="content-card-body">
            <div className="mb-3" style={{ fontSize: 13 }}>
              <strong>{routingDoc.trackingNumber}</strong> — {routingDoc.subject}
              <br /><span className="text-muted">From: {routingDoc.sender} ({routingDoc.senderAddress})</span>
            </div>
            <Row className="g-3">
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
                    <Form.Label className="fw-semibold mb-0" style={{ fontSize: 13 }}>Supporting Division(s)</Form.Label>
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
                    {routeToDivisions.length > 0 ? ` · Supporting: ${routeToDivisions.join(', ')}` : ' · Supporting: None'}
                  </div>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label className="fw-semibold" style={{ fontSize: 13 }}>Transmittal Action</Form.Label>
                  <Form.Select value={routeAction} onChange={e => setRouteAction(e.target.value)}>
                    <option>For review and appropriate action</option>
                    <option>For information</option>
                    <option>For approval / signature</option>
                    <option>For compliance</option>
                    <option>For comment / recommendation</option>
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={12}>
                <Form.Group>
                  <Form.Label className="fw-semibold" style={{ fontSize: 13 }}>Transmittal Slip Comments</Form.Label>
                  <Form.Control
                    as="textarea"
                    rows={3}
                    placeholder="Add comments for the transmittal slip..."
                    value={routeInstructions}
                    onChange={e => setRouteInstructions(e.target.value)}
                  />
                </Form.Group>
              </Col>
            </Row>
            <div className="d-flex gap-2 mt-3 justify-content-end">
              <Button variant="primary" onClick={() => submitRoute('both')}>
                <i className="bi bi-send-check me-1"></i>Route (Physical + Digital)
              </Button>
              <Button variant="outline-primary" onClick={() => submitRoute('physical')}>
                <i className="bi bi-person-walking me-1"></i>Physical Only
              </Button>
              <Button variant="outline-secondary" onClick={() => submitRoute('digital')}>
                <i className="bi bi-cloud-check me-1"></i>Digital Only
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Documents Table */}
      <div className="content-card">
        <div className="table-responsive">
          <table className="table doc-table mb-0">
            <thead>
              <tr>
                <th>Control/Reference #</th>
                <th>Subject</th>
                <th>Sender</th>
                <th>Address</th>
                {isPM && <th>Division Receipts</th>}
                <th>Status</th>
                <th>Date</th>
                <th style={{ width: 120 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-5 text-muted">
                    <i className="bi bi-inbox" style={{ fontSize: 32, display: 'block', marginBottom: 8, opacity: 0.3 }}></i>
                    {isAssistant ? 'No documents for assistant review' : 'No endorsed documents for PM routing'}
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
                  <tr key={doc.id}>
                    <td>
                      <Link to={`/document/${doc.id}`} className="tracking-number text-decoration-none">
                        {doc.trackingNumber}
                      </Link>
                    </td>
                    <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.subject}>
                      {doc.subject}
                    </td>
                    <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {doc.sender}
                    </td>
                    <td style={{ fontSize: 12 }}>{doc.senderAddress}</td>
                    {isPM && (
                      <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>
                        {routed.length === 0 ? (
                          <span className="badge bg-secondary">Not routed yet</span>
                        ) : (
                          <span className={`badge ${receivedCount === routed.length ? 'bg-success' : 'bg-warning text-dark'}`}>
                            {receivedCount}/{routed.length} received
                          </span>
                        )}
                      </td>
                    )}
                    <td><StatusBadge status={doc.status} /></td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{doc.dateReceived}</td>
                    <td>
                      <div className="d-flex gap-1">
                        <Link to={`/document/${doc.id}`} className="action-btn" title="View Details">
                          <i className="bi bi-eye"></i>
                        </Link>
                        {isPM && doc.status === 'Endorsed to OPM' && (
                          <button className="action-btn" title="Route to Division" onClick={() => handleRouteToDiv(doc)}>
                            <i className="bi bi-send text-primary"></i>
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
          <div className="content-card-body border-top d-flex justify-content-between align-items-center py-2">
            <span style={{ fontSize: 13, color: '#6c757d' }}>
              Showing {filtered.length} of {opmDocs.length} documents
            </span>
          </div>
        )}
      </div>
    </>
  )
}
