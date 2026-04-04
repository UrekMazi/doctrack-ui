import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Row, Col, Form, Button } from 'react-bootstrap'
import toast from 'react-hot-toast'
import { DOCUMENT_TYPES, DIVISIONS, generateTrackingNumber } from '../data/mockData'
import { useDocuments } from '../context/DocumentContext'

export default function DocumentUpload() {
  const navigate = useNavigate()
  const { addDocument } = useDocuments()
  const [direction, setDirection] = useState('incoming')
  const [dragOver, setDragOver] = useState(false)
  const [files, setFiles] = useState([])
  const [formData, setFormData] = useState({
    subject: '',
    type: '',
    senderRecipient: '',
    targetDivision: '',
    pages: '',
    remarks: '',
    deliveryMode: 'Hand Delivery',
  })

  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = Array.from(e.dataTransfer.files)
    setFiles(prev => [...prev, ...dropped])
  }

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files)
    setFiles(prev => [...prev, ...selected])
  }

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
  }

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    let tracking = ''
    try {
      tracking = generateTrackingNumber()
    } catch (err) {
      toast.error(err?.message || 'Unable to generate control/reference number.')
      return
    }

    const now = new Date()
    const dateStr = now.toISOString().split('T')[0]
    const timeStr = now.toLocaleTimeString('en-PH', { hour: '2-digit', minute: '2-digit' })
    const attachmentMeta = files.map((file, i) => ({
      id: `UPL-${Date.now()}-${i}`,
      name: file.name,
      type: file.type,
      size: file.size,
    }))

    const commonPayload = {
      trackingNumber: tracking,
      subject: formData.subject,
      type: formData.type,
      pages: Number(formData.pages) || 1,
      remarks: formData.remarks,
      attachments: attachmentMeta,
      hasAttachments: attachmentMeta.length > 0,
      attachmentCount: attachmentMeta.length,
      direction: direction === 'outgoing' ? 'Outgoing' : 'Incoming',
    }

    const payload = direction === 'outgoing'
      ? {
          ...commonPayload,
          recipient: formData.senderRecipient,
          originDivision: formData.targetDivision,
          deliveryMode: formData.deliveryMode,
          status: 'Pending',
          currentLocation: formData.targetDivision,
          dateReleased: dateStr,
          timeReleased: timeStr,
          releasedBy: 'Records Section',
          routingHistory: [
            {
              office: formData.targetDivision,
              action: `Outgoing document registered (${formData.deliveryMode})`,
              date: dateStr,
              time: timeStr,
              user: 'Records Section',
              status: 'done',
            },
          ],
        }
      : {
          ...commonPayload,
          sender: formData.senderRecipient,
          targetDivision: formData.targetDivision,
          status: 'Registered',
          currentLocation: 'Records Section',
          dateReceived: dateStr,
          timeReceived: timeStr,
          receivedBy: 'Records Section',
          routingHistory: [
            {
              office: 'Records Section',
              action: 'Received & registered through manual upload',
              date: dateStr,
              time: timeStr,
              user: 'Records Section',
              status: 'done',
            },
          ],
        }

    try {
      await addDocument(payload)
    } catch (err) {
      toast.error(err?.message || 'Failed to register document.')
      return
    }

    toast.success(
      <div>
        <strong>Document Registered!</strong><br />
        Control/Reference #: {tracking}
      </div>,
      { duration: 5000 }
    )

    setTimeout(() => navigate(direction === 'outgoing' ? '/outgoing' : '/incoming'), 1200)
  }

  return (
    <>
      <div className="page-header">
        <h4>Upload / Register Document</h4>
      </div>

      <form onSubmit={handleSubmit}>
        <Row className="g-4">
          {/* Left: Upload Area */}
          <Col lg={5}>
            <div className="content-card">
              <div className="content-card-header">
                <h6><i className="bi bi-cloud-arrow-up me-2"></i>Document Upload</h6>
              </div>
              <div className="content-card-body">
                <div
                  className={`upload-zone ${dragOver ? 'drag-over' : ''}`}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('file-input').click()}
                >
                  <i className="bi bi-cloud-arrow-up d-block"></i>
                  <h6 className="mb-1">Drag & drop files here</h6>
                  <p className="text-muted mb-0" style={{ fontSize: 13 }}>
                    or click to browse from your computer
                  </p>
                  <p className="text-muted mb-0" style={{ fontSize: 12 }}>
                    PDF, PNG, JPG, TIFF — Max 50 MB
                  </p>
                </div>
                <input
                  id="file-input"
                  type="file"
                  multiple
                  accept=".pdf,.png,.jpg,.jpeg,.tiff,.tif"
                  style={{ display: 'none' }}
                  onChange={handleFileSelect}
                />

                {/* File List */}
                {files.length > 0 && (
                  <div className="mt-3">
                    <small className="text-muted fw-semibold">Uploaded Files ({files.length})</small>
                    {files.map((file, i) => (
                      <div key={i} className="d-flex align-items-center gap-2 mt-2 p-2 rounded" style={{ background: '#f8f9fa', fontSize: 13 }}>
                        <i className={`bi ${file.name.endsWith('.pdf') ? 'bi-file-pdf text-danger' : 'bi-file-image text-primary'}`}></i>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {file.name}
                        </span>
                        <small className="text-muted">{(file.size / 1024).toFixed(0)} KB</small>
                        <button type="button" className="btn btn-sm p-0" onClick={() => removeFile(i)}>
                          <i className="bi bi-x-lg text-muted"></i>
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Network Folder Monitor — hidden for now */}
              </div>
            </div>
          </Col>

          {/* Right: Document Details Form */}
          <Col lg={7}>
            <div className="content-card">
              <div className="content-card-header">
                <h6><i className="bi bi-pencil-square me-2"></i>Document Details</h6>
                <div className="btn-group btn-group-sm">
                  <button
                    type="button"
                    className={`btn ${direction === 'incoming' ? 'btn-primary' : 'btn-outline-primary'}`}
                    onClick={() => setDirection('incoming')}
                  >
                    Incoming
                  </button>
                  <button
                    type="button"
                    className={`btn ${direction === 'outgoing' ? 'btn-success' : 'btn-outline-success'}`}
                    onClick={() => setDirection('outgoing')}
                  >
                    Outgoing
                  </button>
                </div>
              </div>
              <div className="content-card-body">
                <Row className="g-3">
                  <Col md={12}>
                    <Form.Group>
                      <Form.Label className="fw-semibold" style={{ fontSize: 13 }}>Subject / Description *</Form.Label>
                      <Form.Control
                        required
                        placeholder="Enter document subject or description"
                        value={formData.subject}
                        onChange={e => handleChange('subject', e.target.value)}
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold" style={{ fontSize: 13 }}>Document Type *</Form.Label>
                      <Form.Select required value={formData.type} onChange={e => handleChange('type', e.target.value)}>
                        <option value="">Select type...</option>
                        {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold" style={{ fontSize: 13 }}>
                        {direction === 'incoming' ? 'Sender / Source *' : 'Recipient *'}
                      </Form.Label>
                      <Form.Control
                        required
                        placeholder={direction === 'incoming' ? 'e.g., DILG Regional Office' : 'e.g., Department of Budget'}
                        value={formData.senderRecipient}
                        onChange={e => handleChange('senderRecipient', e.target.value)}
                      />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold" style={{ fontSize: 13 }}>
                        {direction === 'incoming' ? 'Target Division *' : 'Origin Division *'}
                      </Form.Label>
                      <Form.Select required value={formData.targetDivision} onChange={e => handleChange('targetDivision', e.target.value)}>
                        <option value="">Select division...</option>
                        {DIVISIONS.map(d => <option key={d} value={d}>{d}</option>)}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col md={3}>
                    <Form.Group>
                      <Form.Label className="fw-semibold" style={{ fontSize: 13 }}>Pages</Form.Label>
                      <Form.Control
                        type="number"
                        min="1"
                        placeholder="#"
                        value={formData.pages}
                        onChange={e => handleChange('pages', e.target.value)}
                      />
                    </Form.Group>
                  </Col>
                  {direction === 'outgoing' && (
                    <Col md={6}>
                      <Form.Group>
                        <Form.Label className="fw-semibold" style={{ fontSize: 13 }}>Delivery Mode</Form.Label>
                        <Form.Select value={formData.deliveryMode} onChange={e => handleChange('deliveryMode', e.target.value)}>
                          <option>Hand Delivery</option>
                          <option>Registered Mail</option>
                          <option>Courier</option>
                          <option>Internal Distribution</option>
                          <option>Email</option>
                        </Form.Select>
                      </Form.Group>
                    </Col>
                  )}
                  <Col md={12}>
                    <Form.Group>
                      <Form.Label className="fw-semibold" style={{ fontSize: 13 }}>Remarks</Form.Label>
                      <Form.Control
                        as="textarea"
                        rows={2}
                        placeholder="Optional remarks or instructions"
                        value={formData.remarks}
                        onChange={e => handleChange('remarks', e.target.value)}
                      />
                    </Form.Group>
                  </Col>
                </Row>

                <hr />
                <div className="d-flex justify-content-between align-items-center">
                  <div></div>
                  <div className="d-flex gap-2">
                    <Button variant="outline-secondary" onClick={() => navigate(-1)}>Cancel</Button>
                    <Button type="submit" variant={direction === 'incoming' ? 'primary' : 'success'}>
                      <i className="bi bi-check-lg me-1"></i>
                      Register & Generate QR
                    </Button>
                  </div>
                </div>
              </div>
            </div>
          </Col>
        </Row>
      </form>
    </>
  )
}
