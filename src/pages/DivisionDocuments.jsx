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

  const isRoutedToUserDivision = (doc) => {
    const explicitTargets = Array.isArray(doc.targetDivisions) ? doc.targetDivisions : []
    return doc.targetDivision === userDivision || explicitTargets.includes(userDivision)
  }

  // Division sees documents routed to their division or that they sent
  const divDocs = documents.filter(doc =>
    isRoutedToUserDivision(doc) ||
    doc.senderAddress === userDivision
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
    <>
      <div className="page-header">
        <h4>Routed Documents</h4>
        <p>Documents routed to {userDivision || 'your division'} by the PM</p>
      </div>

      {/* Filters */}
      <div className="content-card mb-3">
        <div className="content-card-body py-3">
          <Row className="g-2 align-items-end">
            <Col md={4}>
              <Form.Control
                size="sm"
                placeholder="Search tracking #, subject, sender..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </Col>
            <Col md={2}>
              <Form.Select size="sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">All Statuses</option>
                <option value="Routed to Division">Routed to Division</option>
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
      <div className="content-card">
        <div className="table-responsive">
          <table className="table doc-table mb-0">
            <thead>
              <tr>
                <th>Control/Reference #</th>
                <th>Subject</th>
                <th>Sender</th>
                <th>Address</th>
                <th>Status</th>
                <th>Date</th>
                <th style={{ width: 280 }}>Actions</th>
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
                    <td><StatusBadge status={doc.status} /></td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{doc.dateReceived}</td>
                    <td>
                      <div className="d-flex gap-1 flex-wrap">
                        <Link to={`/document/${doc.id}`} className="btn btn-sm btn-outline-secondary" title="View Details">
                          <i className="bi bi-eye me-1"></i>View
                        </Link>
                        {!myReceipt && doc.status === 'Routed to Division' && (
                          <Link to={`/document/${doc.id}`} className="btn btn-sm btn-outline-primary" title="Open QR Camera Receive">
                            <i className="bi bi-camera-video me-1"></i>QR Receive (Digital)
                          </Link>
                        )}
                        {myReceipt && (
                          <span style={{ fontSize: 11, color: '#198754', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <i className="bi bi-check-circle-fill"></i>
                            Received (Digital)
                          </span>
                        )}
                        {!myReceipt && routedDivisions.length > 1 && (
                          <span style={{ fontSize: 11, color: '#6c757d', display: 'flex', alignItems: 'center', gap: 4 }}>
                            <i className="bi bi-diagram-3"></i>
                            {receipts.length}/{routedDivisions.length} divisions received
                          </span>
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
              Showing {filtered.length} of {divDocs.length} documents
            </span>
          </div>
        )}
      </div>
    </>
  )
}
