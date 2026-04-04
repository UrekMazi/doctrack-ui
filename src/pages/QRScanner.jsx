import { useState, useRef, useEffect } from 'react'
import { Row, Col, Form, Button, Alert } from 'react-bootstrap'
import { Link } from 'react-router-dom'
import { QRCodeSVG } from 'qrcode.react'
import { Html5Qrcode } from 'html5-qrcode'
import StatusBadge from '../components/StatusBadge'
import { OUTGOING_DOCUMENTS } from '../data/mockData'
import { useDocuments } from '../context/DocumentContext'
import { inferDocumentDirection } from '../utils/documentDirection'

export default function QRScanner() {
  const { documents } = useDocuments()
  const [scanInput, setScanInput] = useState('')
  const [scannedDoc, setScannedDoc] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState('')
  const qrScannerRef = useRef(null)
  const [cameraActive, setCameraActive] = useState(false)
  const qrScannerElementId = 'main-qr-reader'

  const stopCamera = async () => {
    if (qrScannerRef.current) {
      try {
        await qrScannerRef.current.stop()
      } catch {}
      try {
        await qrScannerRef.current.clear()
      } catch {}
      qrScannerRef.current = null
    }
    setCameraActive(false)
  }

  const startCamera = async () => {
    setError('')
    setCameraActive(false)

    // Wait for DOM
    await new Promise((resolve) => setTimeout(resolve, 400))
    
    if (!document.getElementById(qrScannerElementId)) {
      setError('Scanner element not ready. Please try again.')
      return
    }

    try {
      const scanner = new Html5Qrcode(qrScannerElementId)
      qrScannerRef.current = scanner

      const onSuccess = (decodedText) => {
        setScanInput(decodedText)
        handleLookupRaw(decodedText)
        // Auto-stop on success (optional, but good for feedback)
        stopCamera()
      }
      const onError = () => {}

      try {
        await scanner.start(
          { facingMode: 'environment' },
          { fps: 10, qrbox: { width: 220, height: 220 } },
          onSuccess,
          onError
        )
        setCameraActive(true)
        return
      } catch {
        // Fallback to enumerate
      }

      try {
        const cameras = await Html5Qrcode.getCameras()
        if (cameras && cameras.length > 0) {
          await scanner.start(
            cameras[0].id,
            { fps: 10, qrbox: { width: 220, height: 220 } },
            onSuccess,
            onError
          )
          setCameraActive(true)
          return
        }
      } catch {}

      setError('No camera found. Please connect a camera and try again.')
    } catch {
      setError('Unable to open camera. Please allow permissions.')
    }
  }

  useEffect(() => {
    return () => {
      stopCamera()
    }
  }, [])

  const handleLookupRaw = (rawCode) => {
    setError('')
    setScannedDoc(null)
    const parts = rawCode.split('|')
    const searchTerm = parts.length >= 2 ? parts[1] : rawCode.trim()

    const allDocs = [...documents, ...OUTGOING_DOCUMENTS]
    const found = allDocs.find(d =>
      d.trackingNumber === searchTerm || d.trackingNumber.includes(searchTerm)
    )

    if (found) {
      setScannedDoc(found)
    } else {
      setError(`No document found for: ${searchTerm}`)
    }
  }

  const handleManualLookup = (e) => {
    e.preventDefault()
    if (!scanInput.trim()) return
    handleLookupRaw(scanInput)
  }

  const isIncoming = scannedDoc ? inferDocumentDirection(scannedDoc) === 'Incoming' : true

  return (
    <>
      <div className="page-header">
        <h4>QR Code Scanner</h4>
      </div>

      <Row className="g-4">
        <Col lg={5}>
          <div className="content-card">
            <div className="content-card-header">
              <h6><i className="bi bi-qr-code-scan me-2"></i>Scanner Input</h6>
            </div>
            <div className="content-card-body">
              {/* Real Camera Scanner */}
              <style>{`#${qrScannerElementId} video { transform: scaleX(-1); }`}</style>
              <div className="text-center mb-4 p-4 rounded" style={{ background: '#1a1d29', borderRadius: 12 }}>
                <div style={{
                  width: '100%', minHeight: 240, margin: '0 auto 16px',
                  border: '2px solid #002868',
                  borderRadius: 12,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  position: 'relative', overflow: 'hidden', background: '#fff'
                }}>
                  <div id={qrScannerElementId} style={{ width: '100%', height: '100%' }}></div>
                  
                  {!cameraActive && (
                    <div className="text-muted" style={{ position: 'absolute' }}>
                      <i className="bi bi-qr-code" style={{ fontSize: 48, opacity: 0.3 }}></i>
                      <div style={{ fontSize: 12, marginTop: 8 }}>Camera inactive</div>
                    </div>
                  )}
                </div>

                {!cameraActive ? (
                  <Button variant="primary" onClick={startCamera}>
                    <i className="bi bi-camera-video me-2"></i>Start Camera Scanner
                  </Button>
                ) : (
                  <Button variant="danger" onClick={stopCamera}>
                    <i className="bi bi-camera-video-off me-2"></i>Stop Camera
                  </Button>
                )}
              </div>

              {/* Manual Input */}
              <div className="mb-3">
                <small className="text-muted fw-semibold">Or enter control/reference number:</small>
              </div>
              <form onSubmit={handleManualLookup}>
                <div className="d-flex gap-2">
                  <Form.Control
                    placeholder="e.g., REC-2026-00142 or scan QR data"
                    value={scanInput}
                    onChange={e => setScanInput(e.target.value)}
                  />
                  <Button type="submit" variant="outline-primary">
                    <i className="bi bi-search"></i>
                  </Button>
                </div>
              </form>

              {error && (
                <Alert variant="danger" className="mt-3 mb-0" style={{ fontSize: 13 }}>
                  <i className="bi bi-exclamation-circle me-1"></i>{error}
                </Alert>
              )}

              {/* USB Scanner Info — hidden for now */}
            </div>
          </div>
        </Col>

        {/* Scan Result */}
        <Col lg={7}>
          {scannedDoc ? (
            <div className="content-card">
              <div className="content-card-header">
                <h6><i className="bi bi-check-circle text-success me-2"></i>Document Found</h6>
                <Link to={`/document/${scannedDoc.id}`} className="btn btn-sm btn-primary">
                  View Full Details
                </Link>
              </div>
              <div className="content-card-body">
                <Row className="g-3">
                  <Col md={8}>
                    <Row className="g-2">
                      <Col sm={6}>
                        <small className="text-muted d-block">Control/Reference Number</small>
                        <strong className="tracking-number">{scannedDoc.trackingNumber}</strong>
                      </Col>
                      <Col sm={12} className="mt-3">
                        <small className="text-muted d-block">Subject</small>
                        <strong>{scannedDoc.subject}</strong>
                      </Col>
                      <Col sm={6} className="mt-2">
                        <small className="text-muted d-block">{isIncoming ? 'Sender' : 'Recipient'}</small>
                        <span>{isIncoming ? scannedDoc.sender : scannedDoc.recipient}</span>
                      </Col>
                      <Col sm={6} className="mt-2">
                        <small className="text-muted d-block">Type</small>
                        <span>{scannedDoc.type}</span>
                      </Col>
                      <Col sm={6} className="mt-2">
                        <small className="text-muted d-block">Status</small>
                        <StatusBadge status={scannedDoc.status} />
                      </Col>
                      <Col sm={6} className="mt-2">
                        <small className="text-muted d-block">Current Location</small>
                        <span className="fw-semibold">{scannedDoc.currentLocation || scannedDoc.originDivision}</span>
                      </Col>
                    </Row>

                    {/* Routing history summary */}
                    <div className="mt-4">
                      <small className="text-muted fw-semibold d-block mb-2">Routing History</small>
                      <div className="routing-timeline">
                        {(scannedDoc.routingHistory || []).map((step, i) => (
                          <div key={i} className="routing-step">
                            <div className={`routing-dot ${step.status === 'pending' ? 'pending' : ''}`}></div>
                            <div>
                              <div className="fw-semibold" style={{ fontSize: 13 }}>{step.office}</div>
                              <div style={{ fontSize: 12, color: '#6c757d' }}>
                                {step.action} {step.date && `· ${step.date} ${step.time}`}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Col>

                  <Col md={4} className="text-center">
                    <QRCodeSVG
                      value={`PPA-PMO-NOB|${scannedDoc.trackingNumber}`}
                      size={140}
                      level="M"
                      includeMargin
                    />
                    <div className="tracking-number mt-2" style={{ fontSize: 12 }}>{scannedDoc.trackingNumber}</div>
                  </Col>
                </Row>
              </div>
            </div>
          ) : (
            <div className="content-card">
              <div className="content-card-body text-center py-5">
                <i className="bi bi-qr-code" style={{ fontSize: 64, color: '#dee2e6', display: 'block', marginBottom: 16 }}></i>
                <h5 className="text-muted">Scan a QR Code</h5>
              </div>
            </div>
          )}
        </Col>
      </Row>
    </>
  )
}
