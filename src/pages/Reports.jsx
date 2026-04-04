import { useState } from 'react'
import { Row, Col, Form, Button } from 'react-bootstrap'
import StatusBadge from '../components/StatusBadge'
import { DOCUMENT_TYPES, DIVISIONS } from '../data/mockData'
import { useDocuments } from '../context/DocumentContext'
import { useAuth } from '../context/AuthContext'
import { inferDocumentDirection } from '../utils/documentDirection'

function formatDurationReadable(minsDecimal) {
  if (minsDecimal === null || minsDecimal === undefined || isNaN(minsDecimal)) return '—'
  const tempMins = Math.floor(minsDecimal)
  const secs = Math.round((minsDecimal - tempMins) * 60)
  const finalMins = tempMins + Math.floor(secs / 60)
  const finalSecs = secs % 60
  
  if (finalMins === 0) {
    return `${finalSecs} sec`
  }
  return `${finalMins} min ${finalSecs} sec`
}

export default function Reports() {
  const { documents } = useDocuments()
  const { authFetch } = useAuth()
  const [directionFilter, setDirectionFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')

  // Build monitoring log from live document context
  const monitoringLog = documents.map(doc => {
    const direction = inferDocumentDirection(doc)
    const isIncoming = direction === 'Incoming'

    return {
      trackingNumber: doc.trackingNumber,
      dateReceived: isIncoming ? doc.dateReceived : (doc.dateReleased || doc.dateReceived || ''),
      timeReceived: isIncoming ? (doc.timeReceived || '') : (doc.timeReleased || ''),
      subject: doc.subject,
      sender: isIncoming ? doc.sender : (doc.recipient || doc.sender || ''),
      senderAddress: isIncoming ? (doc.senderAddress || '') : (doc.originDivision || doc.senderAddress || ''),
      type: doc.type,
      targetDivision: isIncoming
        ? (Array.isArray(doc.targetDivisions) && doc.targetDivisions.length > 0
          ? doc.targetDivisions.join(' | ')
          : doc.targetDivision)
        : (doc.originDivision || doc.targetDivision || ''),
      status: doc.status,
      remarks: doc.remarks || '',
      registrationDurationMs: Number(doc.registrationDurationMs || 0),
      registrationDurationSeconds: Number(doc.registrationDurationSeconds || 0),
      controlAssignedAt: doc.controlAssignedAt || '',
      registeredAt: doc.registeredAt || '',
      processingTimeMinutes: typeof doc.processingTimeMinutes === 'number' ? doc.processingTimeMinutes : null,
      outTime: Array.isArray(doc.routingHistory) 
        ? (doc.routingHistory.find(h => h.office === 'OPM Assistant Desk' || String(h.action).includes('Endorsed to OPM'))?.time || '') 
        : '',
      direction,
    }
  })

  const processedFiltered = monitoringLog.filter(e => e.processingTimeMinutes !== null && e.processingTimeMinutes > 0)
  const totalMins = processedFiltered.reduce((sum, e) => sum + e.processingTimeMinutes, 0)
  let avgLabel = '—'
  if (processedFiltered.length > 0) {
    const avgDecimal = totalMins / processedFiltered.length
    avgLabel = formatDurationReadable(avgDecimal)
  }

  const filtered = monitoringLog.filter(entry => {
    if (directionFilter && entry.direction !== directionFilter) return false
    if (statusFilter && entry.status !== statusFilter) return false
    if (dateFrom && entry.dateReceived < dateFrom) return false
    if (dateTo && entry.dateReceived > dateTo) return false
    return true
  })

  const handleExport = () => {
    // Build CSV content
    const headers = ['DATE/CONTROL-REF NO.', 'Time', 'FROM', 'Address', 'SUBJECT', 'TO OPM', 'Date Received', 'Time Received', 'Status', 'Remarks']
    const rows = filtered.map(e => [
      e.trackingNumber, e.timeReceived,
      `"${e.sender}"`, `"${e.senderAddress || ''}"`, `"${e.subject}"`, e.targetDivision, e.dateReceived, e.timeReceived, e.status, `"${e.remarks}"`
    ])
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `PPA_MonitoringLog_${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <div className="page-header d-flex justify-content-between align-items-start">
        <div>
          <h4>Monitoring Log / Reports</h4>
          <p>Spreadsheet view — dense layout for printing and Excel export</p>
        </div>
        <div className="d-flex gap-2">
          <Button variant="outline-primary" onClick={() => window.print()}>
            <i className="bi bi-printer me-1"></i>Print Report
          </Button>
          <Button variant="success" onClick={async () => {
            try {
              const res = await authFetch('/api/reports/export-xlsx')
              if (!res.ok) throw new Error('Export endpoint unavailable')

              const blob = await res.blob()
              const url = URL.createObjectURL(blob)
              const a = document.createElement('a')
              a.href = url
              a.download = `PPA_RECORDS_INCOMING_LOGBOOK_${new Date().toISOString().split('T')[0]}.xlsx`
              a.click()
              URL.revokeObjectURL(url)
            } catch {
              handleExport()
            }
          }}>
            <i className="bi bi-file-earmark-spreadsheet me-1"></i>Export to Excel
          </Button>
          <Button variant="outline-secondary" onClick={handleExport}>
            <i className="bi bi-filetype-csv me-1"></i>CSV
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="content-card mb-3">
        <div className="content-card-body py-3">
          <Row className="g-2 align-items-end">
            <Col md={2}>
              <Form.Label style={{ fontSize: 12 }}>Direction</Form.Label>
              <Form.Select size="sm" value={directionFilter} onChange={e => setDirectionFilter(e.target.value)}>
                <option value="">All</option>
                <option value="Incoming">Incoming</option>
                <option value="Outgoing">Outgoing</option>
              </Form.Select>
            </Col>
            <Col md={2}>
              <Form.Label style={{ fontSize: 12 }}>Status</Form.Label>
              <Form.Select size="sm" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
                <option value="">All Statuses</option>
                <option value="Registered">Registered</option>
                <option value="Endorsed to OPM">Endorsed to OPM</option>
                <option value="Routed to Division">Routed to Division</option>
                <option value="Received & Acknowledged">Received & Acknowledged</option>
              </Form.Select>
            </Col>
            <Col md={2}>
              <Form.Label style={{ fontSize: 12 }}>Date From</Form.Label>
              <Form.Control size="sm" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            </Col>
            <Col md={2}>
              <Form.Label style={{ fontSize: 12 }}>Date To</Form.Label>
              <Form.Control size="sm" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
            </Col>
            <Col md={2}>
              <Button size="sm" variant="outline-secondary" onClick={() => { setDirectionFilter(''); setStatusFilter(''); setDateFrom(''); setDateTo('') }}>
                <i className="bi bi-x-lg me-1"></i>Clear
              </Button>
            </Col>
          </Row>
        </div>
      </div>

      {/* Summary Stats */}
      <Row className="g-3 mb-3">
        {[
          { label: 'Total Records', value: filtered.length, color: '#002868' },
          { label: 'Incoming', value: filtered.filter(e => e.direction === 'Incoming').length, color: '#0dcaf0' },
          { label: 'Outgoing', value: filtered.filter(e => e.direction === 'Outgoing').length, color: '#198754' },
          { label: 'Completed', value: filtered.filter(e => e.status === 'Received & Acknowledged' || e.status === 'Completed' || e.status === 'Released').length, color: '#6f42c1' },
        ].map((s, i) => (
          <Col key={i} sm={3}>
            <div className="p-3 rounded text-center" style={{ background: '#fff', border: '1px solid #e9ecef' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: s.color }}>{s.value}</div>
              <div style={{ fontSize: 12, color: '#6c757d' }}>{s.label}</div>
            </div>
          </Col>
        ))}
      </Row>

      {/* Table — RECORDS INCOMING LOGBOOK */}
      <div className="content-card reports-print-area">
        <div className="content-card-header" style={{ background: '#002868', color: '#fff', textAlign: 'center' }}>
          <h6 style={{ color: '#fff', margin: 0, width: '100%', textAlign: 'center', fontSize: 14, letterSpacing: 1 }}>
            <i className="bi bi-journal-bookmark-fill me-2"></i>RECORDS INCOMING LOGBOOK
          </h6>
        </div>
        <div className="table-responsive">
          <table className="excel-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th style={{ width: 130 }}>DATE / CONTROL-REF NO.</th>
                <th style={{ width: 160 }}>FROM</th>
                <th style={{ minWidth: 220 }}>SUBJECT</th>
                <th style={{ width: 130 }}>TO OPM</th>
                <th style={{ width: 60 }}>IN</th>
                <th style={{ width: 60 }}>OUT</th>
                <th style={{ width: 60 }}>DURATION</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((entry, i) => (
                <tr key={i}>
                  <td style={{ color: '#65676b', textAlign: 'center' }}>{i + 1}</td>
                  <td>
                    <div className="tracking-number" style={{ fontSize: 11 }}>{entry.trackingNumber}</div>
                    <div style={{ fontSize: 10, color: '#65676b' }}>{entry.timeReceived || ''}</div>
                  </td>
                  <td style={{ wordBreak: 'break-word' }}>
                    <div style={{ fontWeight: 600 }}>{entry.sender}</div>
                    {entry.senderAddress && <div style={{ fontSize: 10, color: '#65676b' }}>{entry.senderAddress}</div>}
                  </td>
                  <td style={{ wordBreak: 'break-word' }}>{entry.subject}</td>
                  <td style={{ fontSize: 10 }}>
                    <div><strong>OPM:</strong> {entry.targetDivision || ''}</div>
                    <div><strong>Date:</strong> {entry.dateReceived}</div>
                    <div><strong>Time:</strong> {entry.timeReceived || ''}</div>
                  </td>
                  <td style={{ textAlign: 'center', fontSize: 10 }}>{entry.timeReceived || '—'}</td>
                  <td style={{ textAlign: 'center', fontSize: 10 }}>{entry.outTime || '—'}</td>
                  <td style={{ textAlign: 'center', fontSize: 10 }}>
                    {formatDurationReadable(entry.processingTimeMinutes)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {/* Summary row — matches the yellow box in the PDF */}
        <div style={{ background: '#fef9c3', border: '1px solid #d4a017', padding: '10px 16px', fontSize: 12 }}>
          <div className="d-flex justify-content-between">
            <div>
              <strong>Summary</strong>
            </div>
          </div>
          <div className="d-flex gap-4 mt-1">
            <div># of Transactions: <strong>{filtered.length}</strong></div>
            <div>Total Average: <strong>{avgLabel}</strong></div>
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: '#65676b' }}>
            <em>Showing {filtered.length} of {monitoringLog.length} records</em>
          </div>
        </div>
      </div>
    </>
  )
}
