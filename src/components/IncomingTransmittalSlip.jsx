import { forwardRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'

const DIVISION_CODES = ['ADM', 'PSD', 'FIN', 'PPD', 'ESD', 'OPM', 'TMO-San Carlos', 'TMO-Pulupandan', 'TMO-Danao', 'TMO-Hinoba-an']

const TYPE_SCALE = {
  title: 10,
  subtitle: 9,
  sectionLabel: 8.4,
  label: 8.1,
  value: 8.2,
  tiny: 7.2,
  emphasis: 10,
  tableBody: 8.4,
}

const ROOT_STYLE = {
  width: 'var(--transmittal-slip-width, 340px)',
  background: '#fff',
  border: '2px solid #000',
  fontFamily: 'Arial, sans-serif',
  fontSize: 'var(--transmittal-slip-font-size, 8.5px)',
  lineHeight: 'var(--transmittal-slip-line-height, 1.25)',
  display: 'flex',
  flexDirection: 'column',
}

const IncomingTransmittalSlip = forwardRef(function IncomingTransmittalSlip(
  {
    trackingNumber,
    sender,
    senderAddress,
    dateOfComm,
    subject,
    action,
    dueDate,
    selectedDivisionCodes = [],
    mainDivisionCode = '',
    pmInstructionsContent = null,
    commentsRemarksContent = null,
    className = '',
    isPrint = false,
  },
  ref,
) {
  const slipClassName = className
    ? `incoming-transmittal-slip ${className}`
    : 'incoming-transmittal-slip'
  const qrSize = isPrint ? 80 : 50
  const qrWrapperWidth = isPrint ? 120 : 100

  return (
    <div ref={ref} className={slipClassName} style={ROOT_STYLE}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8, padding: '6px 8px', borderBottom: '2px solid #002868', minHeight: 56 }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', width: `${qrWrapperWidth}px`, margin: '0 auto', flexShrink: 0 }}>
          <div style={{ width: `${qrSize}px`, height: `${qrSize}px`, display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
            <QRCodeSVG value={`PPA-PMO-NOB|${trackingNumber}`} size={qrSize} level="M" />
          </div>
          <span style={{ fontSize: '10px', marginTop: '4px', color: '#555', lineHeight: 1 }}>
            {trackingNumber}
          </span>
        </div>
        <div style={{ flex: 1, textAlign: 'center', paddingTop: 6 }}>
          <div style={{ fontSize: TYPE_SCALE.title, fontWeight: 700 }}>Incoming Transmittal Slip</div>
          <div style={{ fontSize: TYPE_SCALE.subtitle, fontWeight: 700, border: '1.5px solid #002868', padding: '2px 8px', display: 'inline-block', marginTop: 3 }}>
            PORT MANAGEMENT OFFICE OF NEGROS OCCIDENTAL/ BACOLOD/ BANAGO
          </div>
        </div>
      </div>

      <div style={{ borderBottom: '1px solid #000', padding: '3px 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 2, marginBottom: 2 }}>
          <span style={{ fontWeight: 700, fontSize: TYPE_SCALE.sectionLabel }}>To:</span>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, minmax(0, 1fr))', columnGap: 4, rowGap: 1, fontSize: TYPE_SCALE.tiny }}>
          {DIVISION_CODES.map((div) => {
            const isMain = mainDivisionCode && mainDivisionCode !== 'OTHER' && mainDivisionCode === div;
            return (
              <div key={div} style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                <label style={{ display: 'inline-flex', alignItems: 'center', gap: 1.5, cursor: 'default', whiteSpace: 'nowrap', marginBottom: 1 }}>
                  <span style={{ width: 9, height: 9, border: '1px solid #000', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: TYPE_SCALE.tiny, fontWeight: 700, background: '#fff', color: '#000' }}>
                    {selectedDivisionCodes.includes(div) ? '✓' : ''}
                  </span>
                  <span style={{ fontWeight: 600 }}>{div}</span>
                </label>
                <div className="main-division-marker" style={{ visibility: isMain ? 'visible' : 'hidden', minHeight: 10, fontSize: TYPE_SCALE.tiny, fontWeight: 700, color: '#dc3545', width: 9, textAlign: 'center' }}>
                  M
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div style={{ borderBottom: '1px solid #000', padding: '3px 4px' }}>
        <div style={{ fontSize: 7, fontWeight: 700, marginBottom: 2 }}>ACTION REQUIRED:</div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 12px', fontSize: 7 }}>
          {['As appropriate', 'Prepare Reply', 'Give comments/recommendations', 'For information/reference/file', 'Disseminate', 'For evaluation/review', 'For monitoring', 'For coordination'].map((act) => (
            <label key={act} style={{ display: 'flex', alignItems: 'center', gap: 2, cursor: 'default', lineHeight: 1.5 }}>
              <span style={{ width: 8, height: 8, border: '1px solid #000', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontSize: TYPE_SCALE.tiny, fontWeight: 700, flexShrink: 0, background: '#fff', color: '#000' }}>
                {action === act ? '✓' : ''}
              </span>
              <span>{act}</span>
            </label>
          ))}
        </div>
      </div>


      <div style={{ display: 'flex', borderBottom: '1px solid #000' }}>
        <div style={{ width: 84, padding: '3px 4px', fontWeight: 700, fontSize: TYPE_SCALE.label, borderRight: '1px solid #000', background: '#f0f0f0' }}>Control/Reference #:</div>
        <div style={{ flex: 1, padding: '3px 4px', fontFamily: 'monospace', fontWeight: 700, fontSize: TYPE_SCALE.emphasis, color: '#002868' }}>{trackingNumber}</div>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #000' }}>
        <div style={{ width: 84, padding: '3px 4px', fontWeight: 700, fontSize: TYPE_SCALE.label, borderRight: '1px solid #000', background: '#f0f0f0' }}>Sender :</div>
        <div style={{ flex: 1, padding: '3px 4px', fontSize: TYPE_SCALE.value }}>
          <div>{sender || ''}</div>
          {senderAddress ? <div>{senderAddress}</div> : null}
        </div>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #000', color: dueDate ? '#dc3545' : 'inherit' }}>
        <div style={{ width: 84, padding: '3px 4px', fontWeight: 700, fontSize: TYPE_SCALE.label, borderRight: '1px solid #000', background: '#f0f0f0', color: '#000' }}>DUE DATE :</div>
        <div style={{ flex: 1, padding: '3px 4px', fontSize: TYPE_SCALE.value, fontWeight: dueDate ? 700 : 400 }}>{dueDate || ''}</div>
      </div>

      <div style={{ display: 'flex', borderBottom: '1px solid #000' }}>
        <div style={{ width: 84, padding: '3px 4px', fontWeight: 700, fontSize: TYPE_SCALE.label, borderRight: '1px solid #000', background: '#f0f0f0' }}>Subject</div>
        <div style={{ flex: 1, padding: '3px 4px', fontSize: TYPE_SCALE.value, fontWeight: 700 }}>{subject || ''}</div>
      </div>

      <div style={{ borderBottom: '1px solid #000' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <tbody>
            <tr>
              <td className="label" style={{ width: 84, padding: '8px 4px 4px 4px', fontWeight: 700, fontSize: TYPE_SCALE.sectionLabel, borderRight: '1px solid #000', background: '#f0f0f0', verticalAlign: 'top' }}>
                PM's<br />INSTRUCTIONS
              </td>
              <td style={{ padding: '4px', minHeight: 60, fontSize: TYPE_SCALE.tableBody, verticalAlign: 'top' }}>
                {pmInstructionsContent || <span>&nbsp;</span>}
              </td>
            </tr>
            <tr>
              <td className="label" style={{ width: 84, padding: '8px 4px 4px 4px', fontWeight: 700, fontSize: 7.5, borderTop: '1px solid #000', borderRight: '1px solid #000', background: '#f0f0f0', verticalAlign: 'top', height: 100 }}>
                COMMENTS / REMARKS:
              </td>
              <td style={{ borderTop: '1px solid #000', padding: '4px', margin: 0, textAlign: 'left', verticalAlign: 'top', minHeight: 100, height: 100, fontSize: TYPE_SCALE.tableBody }}>
                {commentsRemarksContent || <span>&nbsp;</span>}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  )
})

export default IncomingTransmittalSlip
