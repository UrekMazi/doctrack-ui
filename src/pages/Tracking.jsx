import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Row, Col, Form, Button, Alert } from 'react-bootstrap'
import StatusBadge from '../components/StatusBadge'
import { OUTGOING_DOCUMENTS } from '../data/mockData'
import { useDocuments } from '../context/DocumentContext'
import { inferDocumentDirection } from '../utils/documentDirection'

export default function Tracking() {
  const { documents } = useDocuments()
  const [searchParams] = useSearchParams()
  const initialQuery = searchParams.get('q') || ''
  const [query, setQuery] = useState(initialQuery)
  const [results, setResults] = useState(() => {
    if (initialQuery) return search(initialQuery)
    return null
  })

  useEffect(() => {
    if (initialQuery) {
      setResults(search(initialQuery))
    }
  }, [documents, initialQuery])

  function search(q) {
    const term = q.toLowerCase().trim()
    if (!term) return null
    const allDocs = [...documents, ...OUTGOING_DOCUMENTS].filter(
      (doc, idx, arr) => arr.findIndex((d) => d.trackingNumber === doc.trackingNumber) === idx
    )
    return allDocs.filter(d =>
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
        <h4>Track Document</h4>
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
        <div className="content-card">
          <div className="content-card-body text-center py-5">
            <i className="bi bi-search" style={{ fontSize: 48, color: '#dee2e6', display: 'block', marginBottom: 16 }}></i>
            <h5 className="text-muted">Search for a Document</h5>
          </div>
        </div>
      )}
    </>
  )
}
