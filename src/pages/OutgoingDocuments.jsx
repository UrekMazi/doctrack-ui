import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Row, Col, Form, Button } from 'react-bootstrap'
import StatusBadge from '../components/StatusBadge'
import { OUTGOING_DOCUMENTS, DOCUMENT_TYPES } from '../data/mockData'
import { useDocuments } from '../context/DocumentContext'
import { inferDocumentDirection } from '../utils/documentDirection'

export default function OutgoingDocuments() {
  const { documents } = useDocuments()
  const [statusFilter, setStatusFilter] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  const backendOutgoing = documents.filter((doc) => inferDocumentDirection(doc) === 'Outgoing')
  const mergedOutgoing = [
    ...backendOutgoing,
    ...OUTGOING_DOCUMENTS.filter(
      (doc) => !backendOutgoing.some((item) => item.trackingNumber === doc.trackingNumber)
    ),
  ]

  const filtered = mergedOutgoing.filter(doc => {
    if (statusFilter && doc.status !== statusFilter) return false
    if (searchTerm) {
      const q = searchTerm.toLowerCase()
      return (
        String(doc.trackingNumber || '').toLowerCase().includes(q) ||
        String(doc.subject || '').toLowerCase().includes(q) ||
        String(doc.recipient || doc.sender || '').toLowerCase().includes(q)
      )
    }
    return true
  })

  return (
    <>
      <div className="page-header d-flex justify-content-between align-items-start">
        <div>
          <h4>Outgoing Documents</h4>
          <p>Documents released to external recipients — Division → OPM → Records → Released</p>
        </div>
        <Link to="/upload" className="btn btn-success">
          <i className="bi bi-plus-lg me-1"></i> New Outgoing
        </Link>
      </div>

      {/* Filters */}
      <div className="content-card mb-3">
        <div className="content-card-body py-3">
          <Row className="g-2 align-items-end">
            <Col md={4}>
              <Form.Control
                size="sm"
                placeholder="Search tracking #, subject, recipient..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </Col>
            <Col md={2}>
              <Form.Select size="sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">All Statuses</option>
                <option value="Pending">Pending</option>
                <option value="Released">Released</option>
                <option value="Completed">Completed</option>
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
                <th>Type</th>
                <th>Recipient</th>
                <th>Origin</th>
                <th>Status</th>
                <th>Delivery</th>
                <th>Date Released</th>
                <th style={{ width: 80 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={9} className="text-center py-5 text-muted">
                    <i className="bi bi-send" style={{ fontSize: 32, display: 'block', marginBottom: 8, opacity: 0.3 }}></i>
                    No documents found
                  </td>
                </tr>
              ) : (
                filtered.map(doc => (
                  <tr key={doc.id ?? doc.trackingNumber}>
                    <td>
                      <Link to={`/document/${doc.id ?? doc.trackingNumber}`} className="tracking-number text-decoration-none">
                        {doc.trackingNumber}
                      </Link>
                    </td>
                    <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.subject}>
                      {doc.subject}
                    </td>
                    <td><span className="badge bg-light text-dark border">{doc.type}</span></td>
                    <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.recipient || doc.sender || '—'}>
                      {doc.recipient || doc.sender || '—'}
                    </td>
                    <td style={{ fontSize: 12 }}>{doc.originDivision || doc.currentLocation || doc.targetDivision || '—'}</td>
                    <td><StatusBadge status={doc.status} /></td>
                    <td style={{ fontSize: 12 }}>{doc.deliveryMode || '—'}</td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>{doc.dateReleased || doc.dateReceived || '—'}</td>
                    <td>
                      <div className="d-flex gap-1">
                        <Link to={`/document/${doc.id ?? doc.trackingNumber}`} className="action-btn" title="View">
                          <i className="bi bi-eye"></i>
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > 0 && (
          <div className="content-card-body border-top py-2">
            <span style={{ fontSize: 13, color: '#6c757d' }}>
              Showing {filtered.length} of {mergedOutgoing.length} documents
            </span>
          </div>
        )}
      </div>
    </>
  )
}
