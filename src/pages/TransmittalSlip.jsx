import { useParams, Link } from 'react-router-dom'
import { Button, Row, Col } from 'react-bootstrap'
import { QRCodeSVG } from 'qrcode.react'
import { OUTGOING_DOCUMENTS } from '../data/mockData'
import { useDocuments } from '../context/DocumentContext'

const VALID_DIVISION_CODES = ['ADM', 'PSD', 'FIN', 'PPD', 'ESD', 'OTHER']

const DIVISION_CODE_MAP = {
  'Administrative Division': 'ADM',
  'Port Services Division (PSD)': 'PSD',
  'Finance Division': 'FIN',
  'Port Police Division (PPD)': 'PPD',
  'Engineering Services Division (ESD)': 'ESD',
  ADM: 'ADM',
  PSD: 'PSD',
  FIN: 'FIN',
  PPD: 'PPD',
  ESD: 'ESD',
}

function mapDivisionToCode(value) {
  const raw = String(value || '').trim()
  if (!raw) return null
  if (DIVISION_CODE_MAP[raw]) return DIVISION_CODE_MAP[raw]

  const normalized = raw.toUpperCase()
  return VALID_DIVISION_CODES.includes(normalized) ? normalized : null
}

function getSelectedDivisionCodes(doc) {
  const raw = Array.isArray(doc.targetDivisions) && doc.targetDivisions.length > 0
    ? doc.targetDivisions
    : (doc.targetDivision ? [doc.targetDivision] : [])

  const mapped = raw
    .map((item) => mapDivisionToCode(item))
    .filter(Boolean)
    .filter((code, idx, arr) => arr.indexOf(code) === idx)

  const hasStrictSelection = mapped.some((code) => code !== 'OTHER')
  return hasStrictSelection ? mapped : []
}

function getMainDivisionCode(doc, selectedDivisionCodes) {
  if (!Array.isArray(selectedDivisionCodes) || selectedDivisionCodes.length === 0) return ''

  const raw = doc?.mainDivision || doc?.targetDivision || ''
  const mapped = mapDivisionToCode(raw)

  if (!mapped || mapped === 'OTHER') return ''
  if (!selectedDivisionCodes.includes(mapped)) return ''

  return mapped
}

export default function TransmittalSlip() {
  const { id } = useParams()
  const { documents } = useDocuments()
  const doc = documents.find(d => String(d.id) === String(id)) ||
              OUTGOING_DOCUMENTS.find(d => String(d.id) === String(id))
  const selectedDivisionCodes = doc ? getSelectedDivisionCodes(doc) : []
  const mainDivisionCode = doc ? getMainDivisionCode(doc, selectedDivisionCodes) : ''
  const divisionCodes = ['ADM', 'PSD', 'FIN', 'PPD', 'ESD', 'OTHER']
  const instructionComments = Array.isArray(doc?.instructionComments)
    ? doc.instructionComments.filter((entry) => String(entry?.comment || '').trim().length > 0)
    : []
  const pmInstructionComments = instructionComments.filter((entry) => String(entry?.roleLabel || '').trim().toUpperCase() === 'PM')
  const recordsInstructionComments = instructionComments.filter((entry) => String(entry?.roleLabel || '').trim().toUpperCase() === 'RECORDS')
  const recordsRegistrationRemarks = String(doc?.remarks || '').trim()

  if (!doc) {
    return (
      <div className="empty-state">
        <i className="bi bi-file-earmark-x d-block"></i>
        <h5>Document Not Found</h5>
        <Link to="/" className="btn btn-primary">Back to Dashboard</Link>
      </div>
    )
  }

  const slipStyle = {
    width: '4.25in',
    background: '#fff',
    border: '2px solid #000',
    fontFamily: 'Arial, sans-serif',
    fontSize: 8.5,
    lineHeight: 1.25,
    boxSizing: 'border-box',
  }
  const typeScale = {
    title: 11,
    subtitle: 9,
    sectionLabel: 8.4,
    label: 8.1,
    value: 8.2,
    tiny: 7.2,
    emphasis: 10,
    instructions: 8.4,
  }
  const labelCell = {
    width: 84,
    padding: '3px 4px',
    fontWeight: 700,
    fontSize: typeScale.label,
    borderRight: '1px solid #000',
    background: '#f0f0f0',
  }
  const valueCell = { flex: 1, padding: '3px 4px', fontSize: typeScale.value }

  return (
    <div className="transmittal-slip-page">
      <div className="no-print mb-3 d-flex justify-content-between align-items-center">
        <div>
          <h5 className="mb-1">Transmittal Slips</h5>
          <span className="text-muted" style={{ fontSize: 13 }}>
            Generated for {doc.trackingNumber} — Incoming + Outgoing on one page
          </span>
        </div>
        <div className="d-flex gap-2">
          <Link to={`/document/${doc.id}`} className="btn btn-outline-secondary btn-sm">
            <i className="bi bi-arrow-left me-1"></i>Back
          </Link>
          <Button size="sm" variant="primary" onClick={() => window.print()}>
            <i className="bi bi-printer me-1"></i>Print
          </Button>
        </div>
      </div>

      <div className="transmittal-slip transmittal-slip-screen" style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
        {/* ===== INCOMING TRANSMITTAL SLIP ===== */}
        <div style={slipStyle}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 8px 4px', borderBottom: '2px solid #000' }}>
            <div style={{ width: 80, textAlign: 'center', lineHeight: 1, flexShrink: 0 }}>
              <QRCodeSVG value={`PPA|${doc.trackingNumber}`} size={64} level="M" />
              <div style={{ fontSize: typeScale.tiny, color: '#555', marginTop: 2, fontFamily: 'monospace', fontWeight: 700 }}>
                {doc.trackingNumber}
              </div>
            </div>
            <div style={{ flex: 1, textAlign: 'center', paddingTop: 4 }}>
              <div style={{ fontSize: typeScale.title, fontWeight: 700 }}>Incoming Transmittal Slip</div>
              <div style={{ fontSize: typeScale.subtitle, fontWeight: 700 }}>PORT MANAGEMENT OFFICE OF NEGROS OCC/BBB</div>
            </div>
          </div>

          {/* To: Division checkboxes (full width row) */}
          <div style={{ borderBottom: '1px solid #000', padding: '3px 4px' }}>
            <div style={{ fontWeight: 700, fontSize: typeScale.sectionLabel, marginBottom: 2 }}>To:</div>
            <div className="transmittal-to-grid" style={{ fontSize: typeScale.tiny }}>
              {divisionCodes.map(div => (
                <label key={div} style={{ display: 'inline-flex', alignItems: 'center', gap: 1.5, whiteSpace: 'nowrap' }}>
                  <span style={{ width: 9, height: 9, border: '1px solid #000', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: typeScale.tiny, fontWeight: 700, background: '#fff', color: '#000' }}>
                    {selectedDivisionCodes.includes(div) ? '✓' : ''}
                  </span>
                  <span style={{ fontWeight: 600 }}>{div}</span>
                </label>
              ))}
            </div>
            <div className="transmittal-main-marker-grid" style={{ marginTop: 1 }}>
              {divisionCodes.map(div => (
                <span className="main-division-marker" key={`main-${div}`} style={{ textAlign: 'center', minHeight: 10, fontSize: typeScale.tiny, fontWeight: 700, color: '#dc3545' }}>
                  {mainDivisionCode && mainDivisionCode !== 'OTHER' && mainDivisionCode === div ? 'M' : ''}
                </span>
              ))}
            </div>
          </div>

          {/* Action Request (full width row, below divisions) */}
          <div style={{ borderBottom: '1px solid #000', padding: '3px 4px' }}>
            <div style={{ fontWeight: 700, fontSize: 7, marginBottom: 2 }}>ACTION REQUEST</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1px 12px', fontSize: 7 }}>
              {['AS APPROPRIATE', 'NOTE', 'RETURN', 'FORWARD', 'FILE'].map(act => (
                <label key={act} style={{ display: 'flex', alignItems: 'center', gap: 2, lineHeight: 1.5 }}>
                  <span style={{ width: 8, height: 8, border: '1px solid #000', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: typeScale.tiny, fontWeight: 700, flexShrink: 0, background: '#fff', color: '#000' }}>
                    {doc.action === act ? '✓' : ''}
                  </span>
                  <span>{act}</span>
                </label>
              ))}
            </div>
          </div>

          {/* PREPARE REPLY + DUE DATE */}
          <div style={{ display: 'flex', borderBottom: '1px solid #000' }}>
            <div style={{ flex: 1, padding: '2px 4px', borderRight: '1px solid #000', display: 'flex', alignItems: 'center', gap: 2 }}>
              <span style={{ width: 8, height: 8, border: '1px solid #000', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: typeScale.tiny, fontWeight: 700, flexShrink: 0, background: '#fff', color: '#000' }}>
                {doc.action === 'PREPARE REPLY' ? '✓' : ''}
              </span>
              <span style={{ fontSize: 7.8, fontWeight: 600 }}>PREPARE REPLY</span>
            </div>
            <div style={{ width: 120, padding: '2px 4px', display: 'flex', alignItems: 'center', gap: 2, color: doc.dueDate ? '#dc3545' : 'inherit' }}>
              <span style={{ fontSize: 7.8, fontWeight: 700 }}>DUE DATE</span>
              <span style={{ fontSize: 7.8, flex: 1, borderBottom: '1px solid #999', paddingLeft: 2, minHeight: 10, color: 'inherit', fontWeight: doc.dueDate ? 700 : 400 }}>{doc.dueDate || ''}</span>
            </div>
          </div>

          <div style={{ display: 'flex', borderBottom: '1px solid #000' }}><div style={labelCell}>PMO Ref No:</div><div style={{ ...valueCell, fontFamily: 'monospace', fontWeight: 700, fontSize: typeScale.emphasis, color: '#002868' }}>{doc.trackingNumber}</div></div>
          <div style={{ display: 'flex', borderBottom: '1px solid #000' }}><div style={labelCell}>Sender :</div><div style={valueCell}><div>{doc.sender || ''}</div>{doc.senderAddress ? <div>{doc.senderAddress}</div> : null}</div></div>
          <div style={{ display: 'flex', borderBottom: '1px solid #000' }}><div style={labelCell}>Sender Ref. No.</div><div style={valueCell}>{doc.senderRefNo || ''}</div></div>
          <div style={{ display: 'flex', borderBottom: '1px solid #000' }}><div style={labelCell}>Date of Comm.</div><div style={valueCell}>{doc.dateOfComm || ''}</div></div>
          <div style={{ display: 'flex', borderBottom: '1px solid #000' }}><div style={labelCell}>Subject</div><div style={{ ...valueCell, fontWeight: 700 }}>{doc.subject}</div></div>

          <div style={{ borderBottom: '1px solid #000' }}>
            <div style={{ display: 'flex' }}>
              <div style={{ width: 84, padding: '8px 4px 4px 4px', fontWeight: 700, fontSize: typeScale.sectionLabel, borderRight: '1px solid #000', background: '#f0f0f0' }}>PM's<br/>INSTRUCTIONS</div>
              <div style={{ flex: 1, padding: '6px 6px', fontSize: typeScale.instructions, minHeight: 130, lineHeight: 1.35 }}>
                {doc.pmTransmittalInstructions && <div style={{ marginBottom: 4 }}>{doc.pmTransmittalInstructions}</div>}
                {pmInstructionComments.length > 0 && (
                  <div>
                    {pmInstructionComments.map((entry) => (
                      <div key={entry.id || `${entry.roleLabel}-${entry.name}-${entry.createdAt}`} style={{ marginTop: 2 }}>
                        <strong>{entry.roleLabel}{entry.name ? ` (${entry.name})` : ''}:</strong> {entry.comment}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Comments/Remarks (shares border with PM's Instructions) */}
            <div style={{ borderTop: '1px solid #000', padding: '8px 10px', minHeight: 150 }}>
              <div style={{ fontWeight: 700, fontSize: 7.5, marginBottom: 2, color: '#000' }}>COMMENTS / REMARKS:</div>
              <div style={{ fontSize: typeScale.instructions, minHeight: 130 }}>
                {recordsRegistrationRemarks && <div style={{ marginBottom: 4 }}>{recordsRegistrationRemarks}</div>}
                {recordsInstructionComments.map((entry) => (
                  <div key={entry.id || `${entry.roleLabel}-${entry.name}-${entry.createdAt}`} style={{ marginTop: 2 }}>
                    <strong>{entry.roleLabel}{entry.name ? ` (${entry.name})` : ''}:</strong> {entry.comment}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* ===== OUTGOING TRANSMITTAL SLIP ===== */}
        <div style={slipStyle}>
          <div style={{ textAlign: 'center', padding: '6px 6px 4px', borderBottom: '2px solid #000' }}>
            <div style={{ fontSize: typeScale.title, fontWeight: 700 }}>Outgoing Transmittal Slip</div>
            <div style={{ fontSize: typeScale.subtitle, fontWeight: 700 }}>PORT MANAGEMENT OFFICE OF NEGROS OCC/BBB</div>
          </div>

          <div style={{ display: 'flex', borderBottom: '1px solid #000' }}><div style={labelCell}>Incoming Ref</div><div style={{ ...valueCell, fontFamily: 'monospace', fontWeight: 700, fontSize: typeScale.emphasis, color: '#002868' }}>{doc.trackingNumber}</div></div>
          <div style={{ display: 'flex', borderBottom: '1px solid #000' }}><div style={labelCell}>SenderName</div><div style={valueCell}>{doc.sender}</div></div>
          <div style={{ display: 'flex', borderBottom: '1px solid #000' }}><div style={labelCell}>Date of Comm.</div><div style={valueCell}>{doc.dateOfComm || ''}</div></div>
          <div style={{ display: 'flex', borderBottom: '1px solid #000' }}><div style={labelCell}>Subject</div><div style={{ ...valueCell, fontWeight: 700 }}>{doc.subject}</div></div>
          <div style={{ display: 'flex', borderBottom: '1px solid #000' }}><div style={labelCell}>Outgoing Ref:</div><div style={valueCell}></div></div>

          <div style={{ padding: '2px 4px', fontWeight: 700, fontSize: typeScale.sectionLabel, textAlign: 'center', borderBottom: '1px solid #000', background: '#f0f0f0' }}>Action Made</div>
          <div style={{ borderBottom: '1px solid #000' }}>
            {Array.from({ length: 15 }, (_, i) => (
              <div key={i} style={{ display: 'flex', borderBottom: i < 14 ? '1px solid #ddd' : 'none', fontSize: 7.4 }}>
                <div style={{ width: 18, padding: '1px 3px', textAlign: 'right', fontWeight: 600, color: '#666', borderRight: '1px solid #ddd' }}>{i + 1}.</div>
                <div style={{ flex: 1, padding: '1px 4px', minHeight: 12 }}></div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex' }}>
            <div style={{ flex: 1, padding: '3px 4px', borderRight: '1px solid #000' }}><div style={{ fontSize: 7.8, fontWeight: 700, marginBottom: 12 }}>From :</div></div>
            <div style={{ flex: 1, padding: '3px 4px', borderRight: '1px solid #000' }}><div style={{ fontSize: 7.8, fontWeight: 700, marginBottom: 12 }}>RECEIVED BY:</div></div>
            <div style={{ width: 70, padding: '3px 4px' }}><div style={{ fontSize: 7.8, fontWeight: 700, marginBottom: 12 }}>DATE</div></div>
          </div>
        </div>
      </div>
    </div>
  )
}
