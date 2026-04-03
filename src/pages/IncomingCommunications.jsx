import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Row, Col, Form, Button, Alert } from 'react-bootstrap'
import StatusBadge from '../components/StatusBadge'
import { DOCUMENT_TYPES } from '../data/mockData'
import { useDocuments } from '../context/DocumentContext'

export default function IncomingCommunications() {
  const { documents } = useDocuments()
  const [statusFilter, setStatusFilter] = useState('')
  const [typeFilter, setTypeFilter] = useState('')
  const [searchTerm, setSearchTerm] = useState('')

  const filtered = documents.filter(doc => {
    if (statusFilter && doc.status !== statusFilter) return false
    if (typeFilter && doc.type !== typeFilter) return false
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

  const countByStatus = (status) => documents.filter(d => d.status === status).length

  return (
    <>
      <div className="page-header d-flex justify-content-between align-items-start">
        <div>
          <h4>Incoming Communications</h4>
          <p>Proposed Flow: Receive → Scan/EDMS → OCR → Assign # → Print → OPM Assistant Review → OPM → Route to RC</p>
        </div>
        <Link to="/scan" className="btn btn-primary">
          <i className="bi bi-plus-lg me-1"></i> New Document
        </Link>
      </div>

      {/* Proposed Flow Steps Overview */}
      <div className="content-card mb-3">
        <div className="content-card-body py-3">
          <div className="d-flex justify-content-between align-items-center flex-wrap gap-2" style={{ fontSize: 11 }}>
            {[
              { label: 'Registered', count: countByStatus('Registered'), icon: 'bi-inbox-fill', color: '#0d6efd' },
              { label: 'For OPM Assistant Review', count: countByStatus('For OPM Assistant Review'), icon: 'bi-person-check-fill', color: '#6f42c1' },
              { label: 'Endorsed to OPM', count: countByStatus('Endorsed to OPM'), icon: 'bi-send-fill', color: '#6f42c1' },
              { label: 'Routed to Division', count: countByStatus('Routed to Division'), icon: 'bi-diagram-3-fill', color: '#fd7e14' },
              { label: 'Received & Acknowledged', count: countByStatus('Received & Acknowledged'), icon: 'bi-check-circle-fill', color: '#198754' },
            ].map((s, i, arr) => (
              <div key={i} className="d-flex align-items-center" style={{ flex: i < arr.length - 1 ? 1 : 'none' }}>
                <div className="d-flex align-items-center gap-2 cursor-pointer" onClick={() => setStatusFilter(s.label)} style={{ cursor: 'pointer' }}>
                  <div style={{
                    width: 32, height: 32, borderRadius: '50%',
                    background: statusFilter === s.label ? s.color : '#f0f0f0',
                    color: statusFilter === s.label ? '#fff' : s.color,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 14, fontWeight: 700, flexShrink: 0,
                  }}>
                    {s.count}
                  </div>
                  <span style={{ fontWeight: statusFilter === s.label ? 600 : 400, color: statusFilter === s.label ? s.color : '#6c757d', whiteSpace: 'nowrap' }}>
                    {s.label}
                  </span>
                </div>
                {i < arr.length - 1 && (
                  <div style={{ flex: 1, height: 2, background: '#e9ecef', margin: '0 8px' }}>
                    <i className="bi bi-arrow-right" style={{ fontSize: 10, color: '#adb5bd', position: 'relative', top: -8, left: '40%' }}></i>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
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
                <option value="Registered">Registered</option>
                <option value="For OPM Assistant Review">For OPM Assistant Review</option>
                <option value="Endorsed to OPM">Endorsed to OPM</option>
                <option value="Routed to Division">Routed to Division</option>
                <option value="Received & Acknowledged">Received & Acknowledged</option>
              </Form.Select>
            </Col>
            <Col md={2}>
              <Form.Select size="sm" value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
                <option value="">All Types</option>
                {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </Form.Select>
            </Col>
            <Col md={2}>
              <Button size="sm" variant="outline-secondary" onClick={() => { setStatusFilter(''); setTypeFilter(''); setSearchTerm('') }}>
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
                <th>Sender</th>
                <th>Address</th>
                <th>Status</th>
                <th>Date / Time</th>
                <th style={{ width: 100 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-5 text-muted">
                    <i className="bi bi-inbox" style={{ fontSize: 32, display: 'block', marginBottom: 8, opacity: 0.3 }}></i>
                    {documents.length === 0
                      ? <span>No documents yet. <Link to="/scan">Scan & Register</Link> a new incoming document.</span>
                      : 'No documents match filters'
                    }
                  </td>
                </tr>
              ) : (
                filtered.map(doc => (
                  <tr key={doc.id}>
                    <td>
                      <Link to={`/document/${doc.id}`} className="tracking-number text-decoration-none">
                        {doc.trackingNumber}
                      </Link>
                    </td>
                    <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.subject}>
                      {doc.subject}
                    </td>
                    <td><span className="badge bg-light text-dark border">{doc.type}</span></td>
                    <td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={doc.sender}>
                      {doc.sender}
                    </td>
                    <td style={{ fontSize: 12 }}>{doc.senderAddress}</td>
                    <td><StatusBadge status={doc.status} /></td>
                    <td style={{ whiteSpace: 'nowrap', fontSize: 13 }}>
                      {doc.dateReceived}
                      {doc.timeReceived && <div style={{ fontSize: 11, color: '#6c757d' }}>{doc.timeReceived}</div>}
                    </td>
                    <td>
                      <div className="d-flex gap-1">
                        <Link to={`/document/${doc.id}`} className="action-btn" title="View Details">
                          <i className="bi bi-eye"></i>
                        </Link>
                        {doc.status === 'Registered' && (
                          <Link to={`/document/${doc.id}`} className="action-btn" title="Open document to endorse to OPM">
                            <i className="bi bi-send"></i>
                          </Link>
                        )}
                        <Link to={`/transmittal/${doc.id}`} className="action-btn" title="Transmittal Slip">
                          <i className="bi bi-printer"></i>
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
          <div className="content-card-body border-top d-flex justify-content-between align-items-center py-2">
            <span style={{ fontSize: 13, color: '#6c757d' }}>
              Showing {filtered.length} of {documents.length} communications
            </span>
          </div>
        )}
      </div>
    </>
  )
}
