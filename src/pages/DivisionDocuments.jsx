import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Row, Col, Form, Button } from 'react-bootstrap'
import StatusBadge from '../components/StatusBadge'
import { useDocuments } from '../context/DocumentContext'

export default function DivisionDocuments({ currentUser }) {
  const { documents } = useDocuments()
  const [statusFilter, setStatusFilter] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  const userDivision = currentUser?.division || ''
  const userPosition = String(currentUser?.position || '').trim()

  const normalizeText = (value) => String(value || '').trim().toLowerCase()

  const isRoutedToUserDivision = (doc) => {
    const explicitTargets = Array.isArray(doc.targetDivisions) ? doc.targetDivisions : []
    return doc.targetDivision === userDivision || explicitTargets.includes(userDivision)
  }

  const getDivisionAssignedPosition = (doc) => {
    const assignments = doc?.routeAssignments
    if (!assignments || typeof assignments !== 'object') return ''

    const entry = assignments[userDivision]
    if (!entry || typeof entry !== 'object') return ''

    return String(entry.position || '').trim()
  }

  const isVisibleToCurrentPersonnel = (doc) => {
    const assignedPosition = getDivisionAssignedPosition(doc)
    if (!assignedPosition) return true
    if (!userPosition) return true
    return normalizeText(assignedPosition) === normalizeText(userPosition)
  }

  // Division sees documents routed to their division or that they sent
  const divDocs = documents.filter(doc =>
    (isRoutedToUserDivision(doc) || doc.senderAddress === userDivision) &&
    isVisibleToCurrentPersonnel(doc)
  ).filter(doc =>
    doc.status === 'Routed to Division' ||
    doc.status === 'Received & Acknowledged'
  )

  const filtered = divDocs.filter(doc => {
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

  const getRoutedDivisions = (doc) => {
    const raw = Array.isArray(doc.targetDivisions) && doc.targetDivisions.length > 0
      ? doc.targetDivisions
      : (doc.targetDivision ? [doc.targetDivision] : [])
    return raw
      .map((d) => String(d || '').trim())
      .filter(Boolean)
      .filter((d, idx, arr) => arr.indexOf(d) === idx)
  }

  const getExistingDivisionReceipts = (doc) => {
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
        verifiedBy: step.user || 'Division Staff',
        verifiedAt: step.date ? `${step.date}T00:00:00` : new Date().toISOString(),
      }))
      .filter((entry) => routed.includes(entry.division))

    return inferred.filter((entry, idx, arr) => arr.findIndex((e) => e.division === entry.division) === idx)
  }

  return (
    <div className="division-page">
      <div className="page-header division-header">
        <h4>Routed Documents</h4>
        <p>Incoming Communications routed to {userDivision || 'your division'} by the PM.</p>
      </div>

      {/* Filters */}
      <div className="content-card mb-3 division-filter-card">
        <div className="content-card-body py-3 division-filter-body">
          <Row className="g-2 align-items-end division-filter-row">
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
                <option value="Routed to Division">Routed to RC/s Concerned</option>
                <option value="Received & Acknowledged">Received & Acknowledged</option>
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

      {/* Documents Table */}
      <div className="content-card division-table-card">
        <div className="table-responsive division-table-wrap">
          <table className="table doc-table division-docs-table division-page-table mb-0">
            <thead>
              <tr>
                <th className="div-col-control">Control/Tracking #</th>
                <th className="div-col-subject">Subject</th>
                <th className="div-col-sender">Sender</th>
                <th className="div-col-address">Address</th>
                <th className="div-col-status">Status</th>
                <th className="div-col-date">Date</th>
                <th className="div-col-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-5 text-muted">
                    <i className="bi bi-inbox" style={{ fontSize: 32, display: 'block', marginBottom: 8, opacity: 0.3 }}></i>
                    No documents routed to your division
                  </td>
                </tr>
              ) : (
                filtered.map(doc => (
                  (() => {
                    const routedDivisions = getRoutedDivisions(doc)
                    const receipts = getExistingDivisionReceipts(doc)
                    const myReceipt = receipts.find((entry) => entry.division === userDivision)
                    return (
                  <tr key={doc.id} className="division-row">
                    <td>
                      <Link to={`/document/${doc.id}`} className="tracking-number text-decoration-none">
                        {doc.trackingNumber}
                      </Link>
                    </td>
                    <td className="div-cell-subject" title={doc.subject}>
                      {doc.subject}
                    </td>
                    <td className="div-cell-sender">
                      {doc.sender}
                    </td>
                    <td className="div-cell-address" title={doc.senderAddress}>{doc.senderAddress}</td>
                    <td><StatusBadge status={doc.status} /></td>
                    <td className="div-cell-date">{doc.dateReceived}</td>
                    <td className="div-cell-actions">
                      <div className="division-actions-row division-row-actions">
                        <Link to={`/document/${doc.id}`} className="action-btn" title="View Details" aria-label="View Details">
                          <i className="bi bi-eye"></i>
                        </Link>
                        {!myReceipt && doc.status === 'Routed to Division' && (
                          <Link to={`/document/${doc.id}`} className="action-btn" title="Scan Transmittal QR" aria-label="Scan Transmittal QR">
                            <i className="bi bi-camera-video"></i>
                          </Link>
                        )}
                        {myReceipt && (
                          <span className="division-action-state text-success">
                            <i className="bi bi-check-circle-fill"></i>
                            Received
                          </span>
                        )}
                      </div>
                      {!myReceipt && routedDivisions.length > 1 && (
                        <div className="division-action-meta">
                          <i className="bi bi-diagram-3"></i>
                          {receipts.length}/{routedDivisions.length} received
                        </div>
                      )}
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
          <div className="content-card-body border-top d-flex justify-content-between align-items-center py-2 division-footer-meta">
            <span style={{ fontSize: 13, color: '#6c757d' }}>
              Showing {filtered.length} of {divDocs.length} documents
            </span>
          </div>
        )}
      </div>
    </div>
  )
}
