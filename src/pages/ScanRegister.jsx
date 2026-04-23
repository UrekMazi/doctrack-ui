import { useState, useRef, useEffect, useCallback, useMemo } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { useReactToPrint } from 'react-to-print'
import { useNavigate } from 'react-router-dom'
import { Row, Col, Form, Button, Alert, ProgressBar } from 'react-bootstrap'
import { QRCodeSVG } from 'qrcode.react'
import toast from 'react-hot-toast'
import * as pdfjsLib from 'pdfjs-dist'
import { jsPDF } from 'jspdf'
import { DOCUMENT_TYPES, generateTrackingNumber } from '../data/mockData'
import IncomingTransmittalSlip from '../components/IncomingTransmittalSlip'
import { useDocuments } from '../context/DocumentContext'
import { useAuth } from '../context/AuthContext'
import { processDocument, processBatch } from '../utils/ocrEngine'
import { openIncomingTransmittalPrintWindow } from '../utils/incomingTransmittalPrint'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

const SCAN_STEPS = [
  'Scan & Upload to EDMS',
  'PDF Conversion & OCR',
  'Assign Control/Reference # & Auto-fill Details',
  'Print Transmittal Slip & Sticker',
]

const STORAGE_TARGET = (import.meta.env.VITE_STORAGE_TARGET || (import.meta.env.PROD ? 'onedrive' : 'seagate-d')).toLowerCase()
const STORAGE_DEST_LABEL = STORAGE_TARGET === 'onedrive' ? 'OneDrive' : 'Seagate (D:)' 
const DEFAULT_STORAGE_FOLDER = (import.meta.env.VITE_STORAGE_BASE_FOLDER || 'DocTrack Files').trim()

const getCurrentDateInputValue = () => new Date().toISOString().split('T')[0]
const getCurrentTimeInputValue = () => new Date().toLocaleTimeString('en-PH', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
const createDefaultReceiveInfo = () => ({
  receivedDate: getCurrentDateInputValue(),
  receivedTime: getCurrentTimeInputValue(),
  receivedBy: 'Records Section',
  deliveryMode: 'Hand-delivered',
})

const RECEIVED_STAMP_PREFIX = String(import.meta.env.VITE_RECEIVED_STAMP_PREFIX || 'PPA-PMO-NBB').trim().toUpperCase() || 'PPA-PMO-NBB'
const STAMP_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const RECEIVED_STAMP_WIDTH = 120
const RECEIVED_STAMP_HEIGHT = 30
const RECEIVED_STAMP_TOP_FONT = 7
const RECEIVED_STAMP_BOTTOM_FONT = 12

const formatReceivedStampDate = (dateValue) => {
  const raw = String(dateValue || '').trim() || getCurrentDateInputValue()
  const directMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (directMatch) {
    const year = directMatch[1]
    const monthIndex = Number(directMatch[2]) - 1
    const day = directMatch[3]
    if (monthIndex >= 0 && monthIndex < STAMP_MONTHS.length) {
      return `${day}${STAMP_MONTHS[monthIndex]}${year.slice(-2)}`
    }
  }

  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) {
    const day = String(parsed.getDate()).padStart(2, '0')
    const month = STAMP_MONTHS[parsed.getMonth()] || 'JAN'
    const year = String(parsed.getFullYear()).slice(-2)
    return `${day}${month}${year}`
  }

  return '01JAN00'
}

const formatReceivedStampTime = (timeValue) => {
  const raw = String(timeValue || '').trim() || getCurrentTimeInputValue()
  const directMatch = raw.match(/^(\d{1,2}):(\d{2})/)
  if (directMatch) {
    return `${directMatch[1].padStart(2, '0')}:${directMatch[2]}`
  }

  const parsed = new Date(`1970-01-01T${raw}`)
  if (!Number.isNaN(parsed.getTime())) {
    const hh = String(parsed.getHours()).padStart(2, '0')
    const mm = String(parsed.getMinutes()).padStart(2, '0')
    return `${hh}:${mm}`
  }

  return '00:00'
}

const getReceivedStampTextLines = (dateValue, timeValue) => {
  const headerLine = `${RECEIVED_STAMP_PREFIX} RECEIVED`
  const dateTimeLine = `${formatReceivedStampDate(dateValue)} ${formatReceivedStampTime(timeValue)}`
  return { headerLine, dateTimeLine }
}

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

function toDivisionCodes(targetDivision, targetDivisions) {
  const raw = Array.isArray(targetDivisions) && targetDivisions.length > 0
    ? targetDivisions
    : (targetDivision ? [targetDivision] : [])

  return raw
    .map(item => DIVISION_CODE_MAP[item] || 'OTHER')
    .filter((code, idx, arr) => arr.indexOf(code) === idx)
}

function isLikelyOfficeText(text = '') {
  return /(division|office|department|section|unit|pmo|port|negros|bacolod|banago|region)/i.test(text)
}

function splitPersonAndOffice(rawValue = '') {
  const raw = String(rawValue || '').trim()
  if (!raw) return { person: '', office: '' }

  const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean)
  if (lines.length >= 2) {
    return {
      person: lines[0],
      office: lines.slice(1).join(' '),
    }
  }

  const value = raw.replace(/\s+/g, ' ').trim()

  const dashSplit = value.split(/\s[-–—]\s/, 2)
  if (dashSplit.length === 2) {
    return { person: dashSplit[0].trim(), office: dashSplit[1].trim() }
  }

  const pipeSplit = value.split(/\s\|\s/, 2)
  if (pipeSplit.length === 2) {
    return { person: pipeSplit[0].trim(), office: pipeSplit[1].trim() }
  }

  const parenMatch = value.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  if (parenMatch) {
    return { person: parenMatch[1].trim(), office: parenMatch[2].trim() }
  }

  const commaIndex = value.indexOf(',')
  if (commaIndex > 0) {
    const person = value.slice(0, commaIndex).trim()
    const office = value.slice(commaIndex + 1).trim()
    if (isLikelyOfficeText(office)) {
      return { person, office }
    }
  }

  return { person: value, office: '' }
}

// OCR confidence badge for individual fields
function FieldBadge({ conf }) {
  if (conf === 'high') return <span className="badge bg-success" style={{ fontSize: 9, fontWeight: 500 }}>OCR ✓</span>
  if (conf === 'partial') return <span className="badge bg-warning text-dark" style={{ fontSize: 9, fontWeight: 500 }}>Partial</span>
  return <span className="badge bg-danger" style={{ fontSize: 9, fontWeight: 500 }}>Not detected</span>
}

export default function ScanRegister() {
  const navigate = useNavigate()
  const { addDocument } = useDocuments()
  const { authFetch } = useAuth()
  const [step, setStep] = useState(0)
  const [dragOver, setDragOver] = useState(false)
  const [files, setFiles] = useState([])
  const [filePreviewUrl, setFilePreviewUrl] = useState('') // object URL of the scanned file
  const [previewSlides, setPreviewSlides] = useState([]) // flattened pages across uploaded files
  const [activePreviewIndex, setActivePreviewIndex] = useState(0)
  const [ocrProgress, setOcrProgress] = useState(0)
  const [ocrStatus, setOcrStatus] = useState('') // status message during OCR
  const [ocrDone, setOcrDone] = useState(false)
  const [trackingNumber, setTrackingNumber] = useState('')
  const [registered, setRegistered] = useState(false)
  const transmittalRef = useRef(null)
  const stickerRef = useRef(null)
  const docPreviewRef = useRef(null)
  const saveDirHandleRef = useRef(null)
  const preparedPagesRef = useRef([])
  const preparedOriginalPdfRef = useRef('')
  const prepareAssetsPromiseRef = useRef(null)
  const controlAssignedAtRef = useRef(null)
  const [savePrepStatus, setSavePrepStatus] = useState('idle') // idle | preparing | ready | error
  const [storageFolderName, setStorageFolderName] = useState(DEFAULT_STORAGE_FOLDER)
  const [saveDirLabel, setSaveDirLabel] = useState('No folder selected')
  const effectiveStorageRoot = (storageFolderName || DEFAULT_STORAGE_FOLDER).trim() || DEFAULT_STORAGE_FOLDER
  const secureContextReady = typeof window !== 'undefined' && !!window.isSecureContext
  const hasFolderPickerApi = typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function'
  const folderPickerSupported = secureContextReady && hasFolderPickerApi
  const folderPickerUnavailableReason = !secureContextReady
    ? `Secure context required (https or localhost). Current origin: ${typeof window !== 'undefined' ? window.location.origin : 'unknown'}`
    : !hasFolderPickerApi
      ? 'This Chrome session does not expose the folder picker API (may be blocked by browser policy or extension).'
      : ''

  // Control/Reference # stamp state
  const [ctrlStampPos, setCtrlStampPos] = useState({ x: 0, y: 0 })
  const [ctrlStampVisible, setCtrlStampVisible] = useState(true)
  const ctrlStampElRef = useRef(null)
  const [receivedStampPos, setReceivedStampPos] = useState({ x: 0, y: 0 })
  const [receivedStampVisible, setReceivedStampVisible] = useState(true)
  const receivedStampElRef = useRef(null)

  // Track whether any stamp was just dragged (to suppress container onClick)
  const justDraggedRef = useRef(false)

  // Center stamps when document preview mounts
  const centerStamps = useCallback(() => {
    const el = docPreviewRef.current
    if (!el) return
    const w = el.offsetWidth
    const h = el.offsetHeight
    // Place control number overlay near center-bottom for easy drag adjustment.
    setCtrlStampPos({ x: Math.max(0, (w - 130) / 2), y: Math.max(0, h - 70) })
    // Place received stamp near bottom-left by default.
    setReceivedStampPos({ x: 16, y: Math.max(0, h - (RECEIVED_STAMP_HEIGHT + 18)) })
  }, [])

  // Seiko timestamp fields default to now, but remain editable to match physical stamp.
  const [receiveInfo, setReceiveInfo] = useState(() => createDefaultReceiveInfo())

  // Scan detection info
  const [scanInfo, setScanInfo] = useState({
    paperSize: '',
    pageCount: 0,
    missingFields: [],
    templateType: '',    // detected document template
    ocrConfidence: 0,    // overall OCR confidence %
  })

  const activePreview = previewSlides[activePreviewIndex] || null
  const receivedStampLines = useMemo(
    () => getReceivedStampTextLines(receiveInfo.receivedDate, receiveInfo.receivedTime),
    [receiveInfo.receivedDate, receiveInfo.receivedTime]
  )

  // Per-field OCR confidence: 'high' | 'partial' | 'none'
  const [fieldConfidence, setFieldConfidence] = useState({})

  // Generic stamp drag — attaches listeners directly, no React state in the loop
  const makeStampDragHandler = useCallback((posStateSetter, elRef, minW, minH) => {
    return (e) => {
      if (e.button !== 0) return
      e.preventDefault()
      e.stopPropagation()
      const container = docPreviewRef.current
      const stampEl = elRef.current
      if (!container || !stampEl) return

      const containerRect = container.getBoundingClientRect()
      const stampRect = stampEl.getBoundingClientRect()
      // Offset from mouse click position to the stamp element's top-left
      const offsetX = e.clientX - stampRect.left
      const offsetY = e.clientY - stampRect.top

      const handleMove = (ev) => {
        // Stop dragging if primary mouse button is no longer pressed.
        if (ev.buttons !== 1) {
          handleUp()
          return
        }
        const rect = container.getBoundingClientRect()
        const x = Math.max(0, Math.min(ev.clientX - rect.left - offsetX, rect.width - minW))
        const y = Math.max(0, Math.min(ev.clientY - rect.top - offsetY, rect.height - minH))
        // Direct DOM update for zero-lag movement
        stampEl.style.left = x + 'px'
        stampEl.style.top = y + 'px'
        // Store for final sync
        stampEl._pos = { x, y }
      }

      const handleUp = () => {
        window.removeEventListener('mousemove', handleMove)
        window.removeEventListener('mouseup', handleUp)
        window.removeEventListener('blur', handleUp)
        // Sync final position to React state
        if (stampEl._pos) {
          posStateSetter(stampEl._pos)
          delete stampEl._pos
        }
        justDraggedRef.current = true
        setTimeout(() => { justDraggedRef.current = false }, 50)
      }

      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleUp)
      window.addEventListener('blur', handleUp)
    }
  }, [])

  const handleCtrlStampMouseDown = useCallback(
    (e) => makeStampDragHandler(setCtrlStampPos, ctrlStampElRef, 120, 30)(e),
    [makeStampDragHandler]
  )

  const handleReceivedStampMouseDown = useCallback(
    (e) => makeStampDragHandler(setReceivedStampPos, receivedStampElRef, RECEIVED_STAMP_WIDTH, RECEIVED_STAMP_HEIGHT)(e),
    [makeStampDragHandler]
  )

  // Cleanup object URL on unmount or when preview changes
  useEffect(() => {
    return () => {
      if (filePreviewUrl && filePreviewUrl.startsWith('blob:')) {
        URL.revokeObjectURL(filePreviewUrl)
      }
    }
  }, [filePreviewUrl])

  // Extracted / editable fields
  const [extracted, setExtracted] = useState({
    subject: '',
    type: '',
    sender: '',
    senderAddress: '',
    senderRefNo: '',
    dateOfComm: '',
    dueDate: '',
    pages: '1',
    remarks: '',
    targetDivision: '',
    addressedTo: '',
    addressedToDivision: '',
    thru: '',
    thruDivision: '',
  })
  const transmittalDivisionCodes = []
  const transmittalMainDivisionCode = ''
  const transmittalRemarksContent = extracted.remarks
    ? <div style={{ marginBottom: 4 }}>{extracted.remarks}</div>
    : null
  const transmittalSlipProps = {
    trackingNumber,
    sender: extracted.sender,
    senderAddress: extracted.senderAddress,
    dateOfComm: extracted.dateOfComm,
    subject: extracted.subject,
    dueDate: extracted.dueDate,
    selectedDivisionCodes: transmittalDivisionCodes,
    mainDivisionCode: transmittalMainDivisionCode,
    commentsRemarksContent: transmittalRemarksContent,
  }

  const registerReadiness = useMemo(() => {
    const metadataMissing = []

    if (!String(extracted.subject || '').trim()) metadataMissing.push('Subject')
    if (!String(extracted.sender || '').trim()) metadataMissing.push('Sender Name')
    if (!String(receiveInfo.receivedDate || '').trim()) metadataMissing.push('Stamped Date Received')
    if (!String(receiveInfo.receivedTime || '').trim()) metadataMissing.push('Stamped Time Received')

    const metadataReady = metadataMissing.length === 0

    return {
      metadataMissing,
      metadataReady,
      ready: metadataReady,
    }
  }, [
    extracted.sender,
    extracted.subject,
    receiveInfo.receivedDate,
    receiveInfo.receivedTime,
  ])

  const clearPreparedAssets = () => {
    preparedPagesRef.current = []
    preparedOriginalPdfRef.current = ''
    prepareAssetsPromiseRef.current = null
    setSavePrepStatus('idle')
  }



  const handleDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    const dropped = Array.from(e.dataTransfer.files)
    setFiles(prev => [...prev, ...dropped])
    clearPreparedAssets()
  }

  const handleFileSelect = (e) => {
    const selected = Array.from(e.target.files)
    setFiles(prev => [...prev, ...selected])
    clearPreparedAssets()
  }

  const removeFile = (index) => {
    setFiles(prev => prev.filter((_, i) => i !== index))
    clearPreparedAssets()
  }

  const fileToDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })

  const renderPdfPageToDataUrl = async (file, pageNumber, scale = 1.5) => {
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    const page = await pdf.getPage(pageNumber)
    const viewport = page.getViewport({ scale })
    const canvas = document.createElement('canvas')
    canvas.width = viewport.width
    canvas.height = viewport.height
    const ctx = canvas.getContext('2d')
    await page.render({ canvasContext: ctx, viewport }).promise
    return canvas.toDataURL('image/png')
  }

  const buildPreviewSlidesFromFiles = async (uploadedFiles) => {
    const slides = []
    const maxSlides = 40

    for (let fileIndex = 0; fileIndex < uploadedFiles.length; fileIndex++) {
      const f = uploadedFiles[fileIndex]
      if (slides.length >= maxSlides) break

      try {
        if (f.type === 'application/pdf') {
          const arrayBuffer = await f.arrayBuffer()
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
          const totalPages = pdf.numPages
          for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
            if (slides.length >= maxSlides) break
            const page = await pdf.getPage(pageNum)
            const viewport = page.getViewport({ scale: 1.5 })
            const canvas = document.createElement('canvas')
            canvas.width = viewport.width
            canvas.height = viewport.height
            const ctx = canvas.getContext('2d')
            await page.render({ canvasContext: ctx, viewport }).promise
            slides.push({
              src: canvas.toDataURL('image/png'),
              fileName: f.name,
              fileIndex,
              page: pageNum,
              totalPages,
            })
          }
        } else {
          const src = await fileToDataUrl(f)
          slides.push({
            src,
            fileName: f.name,
            fileIndex,
            page: 1,
            totalPages: 1,
          })
        }
      } catch {
        const src = await fileToDataUrl(f)
        slides.push({
          src,
          fileName: f.name,
          fileIndex,
          page: 1,
          totalPages: 1,
        })
      }
    }

    if (uploadedFiles.length > 0 && slides.length >= maxSlides) {
      toast('Preview capped at first 40 pages for performance.', { icon: 'i' })
    }

    return slides
  }

  // Step 0 → 1: Upload to EDMS, then run OCR. Preserve operator-edited stamped date/time.
  const uploadToEDMS = async () => {
    setReceiveInfo(prev => ({
      ...prev,
      receivedDate: prev.receivedDate || getCurrentDateInputValue(),
      receivedTime: prev.receivedTime || getCurrentTimeInputValue(),
    }))

    // Defer preview rendering — don't block OCR with heavy canvas work.
    // Only render page 1 of file 0 as a quick preview for stamp placement.
    let slides = []
    if (files.length > 0) {
      try {
        // Quick preview: only first page of first file
        const firstFile = files[0]
        let quickSrc = ''
        if (firstFile.type === 'application/pdf') {
          quickSrc = await renderPdfPageToDataUrl(firstFile, 1, 1.5)
        } else {
          quickSrc = await fileToDataUrl(firstFile)
        }
        slides = [{ src: quickSrc, fileName: firstFile.name, fileIndex: 0, page: 1, totalPages: 1 }]
        setPreviewSlides(slides)
        setActivePreviewIndex(0)
        setFilePreviewUrl(quickSrc)
      } catch {
        // Preview failed — continue without it
      }
    }

    setStep(1)
    setOcrProgress(0)
    setOcrDone(false)
    setOcrStatus('Initializing OCR engine...')

    try {
      let ocrResult
      let detectedPages = 1

      if (files.length <= 1) {
        // Single file: use full-accuracy processDocument directly
        const result = await processDocument(files[0], (progress) => {
          setOcrProgress(Math.round(progress))
          if (progress < 10)       setOcrStatus('Initializing OCR engine...')
          else if (progress < 25)  setOcrStatus('Converting document to images...')
          else if (progress < 40)  setOcrStatus('Preprocessing image (contrast & grayscale)...')
          else if (progress < 85)  setOcrStatus('Running PaddleOCR AI — analyzing document...')
          else if (progress < 92)  setOcrStatus('Parsing document fields...')
          else                     setOcrStatus('Finalizing results...')
        }, { mode: 'full', includeAllPages: false })
        ocrResult = result
        detectedPages = result?.pageCount || 1
      } else {
        // Multi-file batch: parallel processing with processBatch()
        // All files are pages of the same document — OCR file 0 header,
        // count pages from remaining files in parallel.
        setOcrStatus(`Batch processing ${files.length} files (parallel)...`)
        const batchResult = await processBatch(
          files,
          (progress) => {
            setOcrProgress(Math.round(progress))
            if (progress < 5)        setOcrStatus(`Initializing ${files.length}-file batch...`)
            else if (progress < 60)  setOcrStatus(`OCR: extracting header fields from page 1 (full accuracy)...`)
            else if (progress < 95)  setOcrStatus(`Counting pages from ${files.length - 1} remaining files (parallel)...`)
            else                     setOcrStatus('Finalizing batch results...')
          },
          (fileIdx, statusText) => {
            // Per-file status — could be used for detailed UI in the future
            console.log(`File ${fileIdx + 1}/${files.length}: ${statusText}`)
          }
        )
        ocrResult = batchResult.result
        detectedPages = batchResult.totalPages
        toast.success(
          <div>
            <strong>Batch complete!</strong><br />
            {files.length} files processed — {detectedPages} total pages detected.
          </div>,
          { duration: 3000 }
        )
      }

      setOcrProgress(100)
      setOcrDone(true)
      setOcrStatus('')

      // Extract fields from the OCR result
      const mergedFields = ocrResult?.fields || {}
      const { action: _ignoredPmAction, ...mergedFieldsWithoutAction } = mergedFields
      const mergedConfidence = ocrResult?.fieldConfidence || {}

      const addressedToSplit = splitPersonAndOffice(mergedFields.addressedTo)
      const thruSplit = splitPersonAndOffice(mergedFields.thru)
      const senderSplit = splitPersonAndOffice(mergedFields.sender)
      const resolvedSenderAddress = (() => {
        const splitOffice = senderSplit.office.trim()
        const rawAddress = (mergedFields.senderAddress || '').trim()

        if (!splitOffice) return rawAddress
        if (!rawAddress) return splitOffice

        if (addressedToSplit.office && rawAddress === addressedToSplit.office && splitOffice !== rawAddress) {
          return splitOffice
        }

        const rawLooksOffice = isLikelyOfficeText(rawAddress)
        const splitLooksOffice = isLikelyOfficeText(splitOffice)
        if (splitLooksOffice && !rawLooksOffice) {
          return splitOffice
        }

        return rawAddress
      })()
      const ocrData = {
        ...mergedFieldsWithoutAction,
        sender: senderSplit.person,
        senderAddress: resolvedSenderAddress,
        addressedTo: addressedToSplit.person,
        addressedToDivision: addressedToSplit.office || mergedFieldsWithoutAction.addressedToDivision || '',
        thru: thruSplit.person,
        thruDivision: thruSplit.office || mergedFieldsWithoutAction.thruDivision || '',
      }

      // Upgrade senderAddress confidence if sender split provided an office
      const confidenceRank = { high: 2, partial: 1, none: 0 }
      if (senderSplit.office) {
        const senderRank = confidenceRank[mergedConfidence.sender || 'none']
        const senderAddressRank = confidenceRank[mergedConfidence.senderAddress || 'none']
        if (senderRank > senderAddressRank || !mergedFields.senderAddress) {
          mergedConfidence.senderAddress = mergedConfidence.sender
        }
      }
      mergedConfidence.addressedToDivision = mergedConfidence.addressedTo
      mergedConfidence.thruDivision = mergedConfidence.thru
      setFieldConfidence(mergedConfidence)

      // Detect missing fields
      const missing = []
      if (!ocrData.subject) missing.push('Subject')
      if (!ocrData.sender) missing.push('Sender / FROM')
      if (!ocrData.senderAddress) missing.push('FROM Division / Address')

      const finalPageCount = detectedPages || (slides.length > 0 ? slides.length : 1)
      const avgOcr = ocrResult?.ocrConfidence || 0
      const templateType = ocrResult?.templateType || ''
      const paperSize = ocrResult?.paperSize || ''

      setScanInfo({
        paperSize: paperSize || '',
        pageCount: finalPageCount,
        missingFields: missing,
        templateType: templateType || '',
        ocrConfidence: avgOcr,
      })

      setExtracted({
        ...ocrData,
        pages: String(finalPageCount),
      })

      // Deferred: build full preview slides in background after OCR is done.
      // Run for both single-PDF and multi-file uploads so page navigation stays correct.
      if (files.length > 0) {
        buildPreviewSlidesFromFiles(files).then(fullSlides => {
          setPreviewSlides(fullSlides)
          setActivePreviewIndex((prev) => {
            const next = Math.min(Math.max(0, prev), Math.max(0, fullSlides.length - 1))
            if (fullSlides[next]?.src) {
              setFilePreviewUrl(fullSlides[next].src)
            }
            return next
          })
        }).catch(() => { /* preview build failed — not critical */ })
      }

    } catch (err) {
      console.error('OCR Error:', err)
      setOcrProgress(100)
      setOcrDone(true)
      setOcrStatus('')
      const fallbackPages = Math.max(1, slides.length || files.length || 1)
      setScanInfo({
        paperSize: 'Letter (8.5" x 11")',
        pageCount: fallbackPages,
        missingFields: ['All fields — OCR failed'],
        templateType: 'Unknown (OCR Error)',
        ocrConfidence: 0,
      })
      setExtracted(prev => ({ ...prev, pages: String(fallbackPages) }))
      toast.error(err?.message || 'OCR processing failed — please fill in the details manually')
    }
  }

  const handleChange = (field, value) => {
    setExtracted(prev => ({ ...prev, [field]: value }))
  }

  const normalizeDateInput = (value) => {
    const raw = String(value || '').trim()
    if (!raw) return ''
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

    const parsed = new Date(raw)
    if (Number.isNaN(parsed.getTime())) return ''
    return parsed.toISOString().slice(0, 10)
  }

  // Step 1 → 2: EDMS assigns control/reference # and extracts details to transmittal slip
  const assignControlNumber = () => {
    try {
      const tn = generateTrackingNumber()
      setTrackingNumber(tn)
      controlAssignedAtRef.current = Date.now()
      setStep(2)
      if (files.length > 0) {
        setTimeout(() => {
          prepareAttachmentAssets(files)
        }, 0)
      }
    } catch (err) {
      toast.error(err?.message || 'Unable to generate control/reference number.')
    }
  }

  const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = (e) => resolve(e.target.result)
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })

  const getFileExtension = (filename = '') => {
    const idx = filename.lastIndexOf('.')
    return idx >= 0 ? filename.slice(idx).toLowerCase() : ''
  }

  const renderPagesFromFiles = async (uploadedFiles, pdfScale = 1.5) => {
    const pages = []
    for (const file of uploadedFiles) {
      if (file.type === 'application/pdf') {
        const arrayBuffer = await file.arrayBuffer()
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
        for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
          const page = await pdf.getPage(pageNum)
          const viewport = page.getViewport({ scale: pdfScale })
          const canvas = document.createElement('canvas')
          canvas.width = viewport.width
          canvas.height = viewport.height
          const ctx = canvas.getContext('2d')
          await page.render({ canvasContext: ctx, viewport }).promise
          pages.push(canvas)
        }
      } else {
        const dataUrl = await readFileAsDataUrl(file)
        const img = new Image()
        await new Promise((resolve, reject) => {
          img.onload = resolve
          img.onerror = reject
          img.src = dataUrl
        })
        const canvas = document.createElement('canvas')
        const w = img.naturalWidth || img.width
        const h = img.naturalHeight || img.height
        const maxDim = 2200
        const ratio = Math.min(1, maxDim / Math.max(w, h))
        canvas.width = Math.round(w * ratio)
        canvas.height = Math.round(h * ratio)
        canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
        pages.push(canvas)
      }
    }
    return pages
  }

  const prepareAttachmentAssets = async (uploadedFiles) => {
    if (!uploadedFiles?.length) {
      clearPreparedAssets()
      return
    }
    if (prepareAssetsPromiseRef.current) return prepareAssetsPromiseRef.current

    setSavePrepStatus('preparing')
    const task = (async () => {
      try {
        const pages = await renderPagesFromFiles(uploadedFiles, 1.35)
        if (!pages.length) throw new Error('No pages rendered')
        preparedPagesRef.current = pages
        preparedOriginalPdfRef.current = buildPdfFromCanvases(pages)
        setSavePrepStatus('ready')
      } catch (err) {
        console.error('Asset prebuild error:', err)
        preparedPagesRef.current = []
        preparedOriginalPdfRef.current = ''
        setSavePrepStatus('error')
      } finally {
        prepareAssetsPromiseRef.current = null
      }
    })()

    prepareAssetsPromiseRef.current = task
    return task
  }

  const applyStampsToCanvas = async (canvas) => {
    const ctx = canvas.getContext('2d')
    const previewEl = docPreviewRef.current
    if (!previewEl) return canvas

    const previewW = previewEl.offsetWidth || 1
    const previewH = previewEl.offsetHeight || 1
    const scaleX = canvas.width / previewW
    const scaleY = canvas.height / previewH
    const scale = (scaleX + scaleY) / 2

    if (ctrlStampVisible) {
      const ctrlX = ctrlStampPos.x * scaleX
      const ctrlY = ctrlStampPos.y * scaleY
      const ctrlStampW = 120 * scaleX

      ctx.fillStyle = '#dc3545'
      ctx.textBaseline = 'top'
      ctx.textAlign = 'center'
      ctx.font = `600 ${Math.max(8, 7 * scale)}px Arial`
      ctx.fillText('CONTROL / REFERENCE #', ctrlX + ctrlStampW / 2, ctrlY)
      ctx.font = `800 ${Math.max(11, 12 * scale)}px monospace`
      ctx.fillText(trackingNumber, ctrlX + ctrlStampW / 2, ctrlY + Math.max(8, 8 * scale))
      ctx.textAlign = 'start'
    }

    if (receivedStampVisible) {
      const receivedX = receivedStampPos.x * scaleX
      const receivedY = receivedStampPos.y * scaleY
      const { headerLine, dateTimeLine } = receivedStampLines

      ctx.fillStyle = '#0b2f6f'
      ctx.textBaseline = 'top'
      ctx.textAlign = 'left'
      ctx.shadowColor = 'rgba(255,255,255,0.88)'
      ctx.shadowBlur = Math.max(0.8, 1.4 * scale)
      ctx.font = `800 ${Math.max(8, 7 * scale)}px Arial`
      ctx.fillText(headerLine, receivedX + (1 * scaleX), receivedY)
      ctx.font = `800 ${Math.max(11, 12 * scale)}px Arial`
      ctx.fillText(dateTimeLine, receivedX + (1 * scaleX), receivedY + Math.max(8, 8 * scale))
      ctx.shadowColor = 'transparent'
      ctx.shadowBlur = 0
    }

    const pngDataUrl = canvas.toDataURL('image/png')
    return { canvas, pngDataUrl }
  }

  const buildPdfFromCanvases = (canvases) => {
    if (!canvases.length) return ''
    const first = canvases[0]
    const pdf = new jsPDF({
      orientation: first.width >= first.height ? 'landscape' : 'portrait',
      unit: 'pt',
      format: [first.width, first.height],
      compress: true,
    })
    pdf.addImage(first.toDataURL('image/png'), 'PNG', 0, 0, first.width, first.height)

    for (let i = 1; i < canvases.length; i++) {
      const pageCanvas = canvases[i]
      pdf.addPage([pageCanvas.width, pageCanvas.height], pageCanvas.width >= pageCanvas.height ? 'landscape' : 'portrait')
      pdf.addImage(pageCanvas.toDataURL('image/png'), 'PNG', 0, 0, pageCanvas.width, pageCanvas.height)
    }

    return pdf.output('datauristring')
  }

  const buildAttachmentsFromFiles = async (uploadedFiles, preparedAssets = null) => {
    const pages = preparedAssets?.pages?.length
      ? preparedAssets.pages
      : await renderPagesFromFiles(uploadedFiles)
    if (!pages.length) return { attachments: [], pageCount: 0 }

    const originalPdfDataUrl = preparedAssets?.originalPdfDataUrl || buildPdfFromCanvases(pages)

    const stampedPages = []
    for (let i = 0; i < pages.length; i++) {
      const clone = document.createElement('canvas')
      clone.width = pages[i].width
      clone.height = pages[i].height
      clone.getContext('2d').drawImage(pages[i], 0, 0)
      
      // Apply stamps only on the selected preview page where the operator positioned them.
      if (i === activePreviewIndex && (ctrlStampVisible || receivedStampVisible)) {
        const stamped = await applyStampsToCanvas(clone)
        stampedPages.push(stamped.canvas)
      } else {
        stampedPages.push(clone)
      }
    }
    const stampedPdfDataUrl = buildPdfFromCanvases(stampedPages)

    return {
      pageCount: pages.length,
      attachments: [
      {
        id: `ATT-ORIG-${Date.now()}`,
        name: 'scanned_document.pdf',
        type: 'application/pdf',
        kind: 'original',
        dataUrl: originalPdfDataUrl,
      },
      {
        id: `ATT-STAMP-PDF-${Date.now()}`,
        name: `${trackingNumber}.pdf`,
        type: 'application/pdf',
        kind: 'stamped-pdf',
        dataUrl: stampedPdfDataUrl,
      },
    ],
    }
  }

  const dataUrlToBlob = async (dataUrl) => {
    const res = await fetch(dataUrl)
    return res.blob()
  }

  const getAttachmentTargetName = (attachment, controlNumber) => {
    if (attachment?.kind === 'original') {
      const ext = getFileExtension(attachment?.name) || '.pdf'
      return `scanned_document${ext}`
    }
    if (attachment?.kind === 'stamped-image') {
      return `${controlNumber}.png`
    }
    if (attachment?.kind === 'stamped-pdf') {
      return `${controlNumber}.pdf`
    }
    return attachment?.name || `attachment-${Date.now()}`
  }

  const sanitizeSubjectForFolder = (value) => {
    const raw = String(value || '').replace(/\r|\n/g, ' ').replace(/\s+/g, ' ').trim()
    if (!raw) return ''
    const cleaned = raw.replace(/[<>:"/\\|?*]/g, '').trim().replace(/[.\s]+$/g, '')
    return cleaned.slice(0, 140).replace(/[.\s]+$/g, '')
  }

  const buildExternalDocumentFolderName = (controlNumber, subjectText = '') => {
    const tracking = String(controlNumber || '').trim()
    if (!tracking) return ''

    const safeSubject = sanitizeSubjectForFolder(subjectText)
    if (!safeSubject) return tracking

    const maxSubjectLength = Math.max(20, 150 - tracking.length - 3)
    const clipped = safeSubject.slice(0, maxSubjectLength).replace(/[.\s]+$/g, '')
    if (!clipped) return tracking

    return `${tracking}.[${clipped}]`
  }

  const pickExternalSaveFolder = async () => {
    if (!folderPickerSupported) {
      toast.error(`${folderPickerUnavailableReason} Server auto-save will be used instead.`)
      return
    }

    try {
      const dirHandle = await window.showDirectoryPicker({ mode: 'readwrite' })

      let permissionState = 'granted'
      if (typeof dirHandle.queryPermission === 'function') {
        permissionState = await dirHandle.queryPermission({ mode: 'readwrite' })
      }
      if (permissionState !== 'granted' && typeof dirHandle.requestPermission === 'function') {
        permissionState = await dirHandle.requestPermission({ mode: 'readwrite' })
      }
      if (permissionState !== 'granted') {
        toast.error('Write permission denied for selected folder.')
        return
      }

      saveDirHandleRef.current = dirHandle
      setSaveDirLabel(dirHandle.name || 'Selected folder')
      toast.success(`Save folder linked: ${dirHandle.name || 'Selected folder'}`)
    } catch (err) {
      if (err?.name !== 'AbortError') {
        toast.error('Could not link selected folder.')
      }
    }
  }

  const saveAttachmentsViaFolderPicker = async (attachmentsToSave, controlNumber, subjectText = '') => {
    const baseHandle = saveDirHandleRef.current
    if (!baseHandle) {
      return {
        ok: false,
        error: 'Please choose an external save folder first.',
      }
    }

    try {
      const targetFolderName = buildExternalDocumentFolderName(controlNumber, subjectText)
      const targetDirHandle = await baseHandle.getDirectoryHandle(targetFolderName, { create: true })

      for (const attachment of attachmentsToSave) {
        if (!attachment?.dataUrl) continue
        const targetName = getAttachmentTargetName(attachment, controlNumber)
        const fileHandle = await targetDirHandle.getFileHandle(targetName, { create: true })
        const writable = await fileHandle.createWritable()
        const blob = await dataUrlToBlob(attachment.dataUrl)
        await writable.write(blob)
        await writable.close()
      }

      return {
        ok: true,
        directory: `${saveDirLabel}\\${targetFolderName}`,
        documentFolder: targetFolderName,
        storageFolder: '',
        mode: 'folder-picker',
      }
    } catch (err) {
      console.error('Folder-picker save error:', err)
      return {
        ok: false,
        error: 'Could not write files to the selected folder. Re-link the folder and try again.',
      }
    }
  }

  // Function to save attachments directly via Python backend API (Solves browser restrictions)
  const saveAttachmentsToDirectory = async (attachmentsToSave, controlNumber, subjectText = '') => {
    if (folderPickerSupported && saveDirHandleRef.current) {
      return saveAttachmentsViaFolderPicker(attachmentsToSave, controlNumber, subjectText)
    }

    const requestedStorageFolder = (storageFolderName || DEFAULT_STORAGE_FOLDER).trim() || DEFAULT_STORAGE_FOLDER
    try {
      const response = await authFetch(`/api/documents/${controlNumber}/files`, {
        method: 'POST',
        body: JSON.stringify({
          attachments: attachmentsToSave,
          storageFolder: requestedStorageFolder,
          subject: subjectText,
        })
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || 'Failed to save files via backend')
      }

      const result = await response.json()
      console.log('Files saved to D: drive:', result.directory)
      return {
        ok: true,
        directory: result.directory,
        documentFolder: result.documentFolder || buildExternalDocumentFolderName(controlNumber, subjectText),
        storageFolder: result.storageFolder || requestedStorageFolder,
      }
    } catch (err) {
      console.error('Error saving files via backend:', err)
      return {
        ok: false,
        error: err?.message || 'Could not save files automatically to D: drive. Make sure the backend is running.',
      }
    }
  }

  // Step 3: Register — save to monitoring log and add to context
  const handleRegister = async () => {
    if (!registerReadiness.ready) {
      const previewMissing = registerReadiness.metadataMissing.slice(0, 3).join(', ')
      const remainingMissing = registerReadiness.metadataMissing.length - 3
      const metadataMsg = registerReadiness.metadataMissing.length > 0
        ? `Metadata missing: ${previewMissing}${remainingMissing > 0 ? ` (+${remainingMissing} more)` : ''}.`
        : ''

      toast.error(metadataMsg)
      return
    }

    if (!trackingNumber) {
      toast.error('Control/Reference number is required before registration.')
      return
    }

    const now = new Date()
    const dateStr = receiveInfo.receivedDate
    const timeStr = receiveInfo.receivedTime
    const normalizedDateOfComm = normalizeDateInput(extracted.dateOfComm)
    const rawDueDate = String(extracted.dueDate || '').trim()
    const normalizedDueDate = rawDueDate ? normalizeDateInput(rawDueDate) : ''
    const routingTargetDivisions = []
    const resolvedTargetDivision = ''

    if (!dateStr || !timeStr) {
      toast.error('Date Received and Time Received are required to match the Seiko stamp.')
      return
    }

    if (!normalizedDateOfComm) {
      toast.error('Date of Comm. must be a valid date in YYYY-MM-DD format.')
      return
    }

    if (rawDueDate && !normalizedDueDate) {
      toast.error('Due Date must be a valid date in YYYY-MM-DD format when provided.')
      return
    }

    // Note: Target Division routing is handled by the PM role, not the operator

    const assignedAtMs = controlAssignedAtRef.current || now.getTime()
    const registeredAtMs = now.getTime()
    const registrationDurationMs = Math.max(0, registeredAtMs - assignedAtMs)
    const registrationDurationSeconds = Math.round(registrationDurationMs / 1000)
    const controlAssignedAtIso = new Date(assignedAtMs).toISOString()
    const registeredAtIso = now.toISOString()

    let attachments = []
    let attachmentsForRecord = []
    let registeredPageCount = parseInt(extracted.pages) || 1

    if (files.length > 0) {
      try {
        if (prepareAssetsPromiseRef.current) {
          toast('Finalizing prepared document files...', { icon: 'i' })
          await prepareAssetsPromiseRef.current
        }
        const preparedAssets = preparedPagesRef.current.length > 0
          ? { pages: preparedPagesRef.current, originalPdfDataUrl: preparedOriginalPdfRef.current }
          : null
        const built = await buildAttachmentsFromFiles(files, preparedAssets)
        attachments = built.attachments || []
        if (built.pageCount > 0) registeredPageCount = built.pageCount
      } catch (err) {
        console.error('Attachment generation error:', err)
        toast.error('Saved document, but failed to generate one attachment preview.')
      }
    }

    if (attachments.length > 0) {
      try {
        const externalSaveResult = await saveAttachmentsToDirectory(attachments, trackingNumber, extracted.subject)
        if (!externalSaveResult.ok) {
          toast.error(externalSaveResult.error || `Save canceled. Could not write files to ${STORAGE_DEST_LABEL}.`)
          return
        }

        // Keep document state lightweight: store metadata only; files are in external folder.
        attachmentsForRecord = attachments.map(att => ({
          id: att.id,
          name: att.name,
          type: att.type,
          kind: att.kind,
          savedToExternal: true,
          externalFolder: externalSaveResult.documentFolder || trackingNumber,
          externalBaseFolder: externalSaveResult.storageFolder,
        }))
      } catch (err) {
        console.error('External save error:', err)
        toast.error('Save canceled. Could not write files to external folder.')
        return
      }
    }

    const documentPayload = {
        id: `DOC-${Date.now()}`,
        trackingNumber,
        subject: extracted.subject,
        type: extracted.type,
        sender: extracted.sender,
        senderAddress: extracted.senderAddress,
        senderRefNo: extracted.senderRefNo,
        addressedTo: extracted.addressedTo,
        addressedToDivision: extracted.addressedToDivision,
        thru: extracted.thru,
        thruDivision: extracted.thruDivision,
        dateOfComm: normalizedDateOfComm,
        dueDate: normalizedDueDate,
        targetDivision: resolvedTargetDivision,
        targetDivisions: routingTargetDivisions,
        stampedDate: dateStr,
        stampedTime: timeStr,
        dateReceived: dateStr,
        timeReceived: timeStr,
        receivedBy: receiveInfo.receivedBy,
        deliveryMode: receiveInfo.deliveryMode,
        controlAssignedAt: controlAssignedAtIso,
        registeredAt: registeredAtIso,
        registrationDurationMs,
        registrationDurationSeconds,
        status: 'Registered',
        currentLocation: 'Records Section',
        pages: registeredPageCount,
        hasAttachments: attachmentsForRecord.length > 0,
        attachmentCount: attachmentsForRecord.length,
        attachments: attachmentsForRecord,
        remarks: extracted.remarks,
        routingHistory: [
          { office: 'Records Section', action: 'Received & Timestamped', date: dateStr, time: timeStr, user: receiveInfo.receivedBy, status: 'done' },
          { office: 'EDMS', action: 'Scanned, PDF/OCR Processed, Control/Reference # Assigned', date: dateStr, time: timeStr, user: 'System', status: 'done' },
          { office: 'Records Section', action: 'Transmittal Slip & Sticker Printed', date: dateStr, time: timeStr, user: receiveInfo.receivedBy, status: 'done' },
        ],
      }

    let savedDocument = null
    try {
      savedDocument = await addDocument(documentPayload)
    } catch (err) {
      console.error('Failed to save document to backend', {
        errorMessage: err?.message,
        errorStack: err?.stack,
        errorDetails: err?.details || null,
        payload: documentPayload,
        context: {
          selectedDivisionCodes: routingTargetDivisions,
          savePrepStatus,
          dateOfCommRaw: extracted.dateOfComm,
          dueDateRaw: extracted.dueDate,
          dateOfCommNormalized: normalizedDateOfComm,
          dueDateNormalized: normalizedDueDate,
          targetDivisionNormalized: resolvedTargetDivision,
        },
      })
      toast.error(err?.message || 'Failed to save document to backend.')
      return
    }

    if (savedDocument?.trackingNumber && savedDocument.trackingNumber !== trackingNumber) {
      setTrackingNumber(savedDocument.trackingNumber)
    }

    console.info('[EDMS_METRIC] register_duration', {
      trackingNumber,
      controlAssignedAt: controlAssignedAtIso,
      registeredAt: registeredAtIso,
      registrationDurationMs,
      registrationDurationSeconds,
    })

    setRegistered(true)
    setStep(3)
    controlAssignedAtRef.current = null
    toast.success(
      <div>
        <strong>Saved to Monitoring Log!</strong><br />
        Control/Reference #: {trackingNumber}
      </div>,
      { duration: 4000 }
    )
  }

  // Print helpers — react-to-print for reliable component printing
  const handlePrintSlip = useReactToPrint({
    contentRef: transmittalRef,
    documentTitle: `Transmittal_${trackingNumber}`,
    pageStyle: `
      @page { size: letter; margin: 0.15in; }
      @media print {
        body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; margin: 0; padding: 0; }
        body > div { width: 7.85in !important; font-size: 9pt !important; line-height: 1.28 !important; }
        body > div > div { font-size: inherit !important; }
        .main-division-marker { font-size: 8.6pt !important; font-weight: 800 !important; color: #dc3545 !important; }
      }
    `,
  })

  const handlePrintSticker = useReactToPrint({
    contentRef: stickerRef,
    documentTitle: `Sticker_${trackingNumber}`,
    pageStyle: `
      @page { size: letter; margin: 0.4in; }
      @media print {
        body { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      }
    `,
  })

  const printTransmittal = () => {
    const transmittalMarkup = renderToStaticMarkup(
      <IncomingTransmittalSlip
        {...transmittalSlipProps}
        isPrint
      />,
    )

    const result = openIncomingTransmittalPrintWindow({
      trackingNumber,
      subject: extracted.subject,
      transmittalMarkup,
    })

    if (!result.ok) {
      if (result.reason === 'missing-markup') {
        toast.error('Transmittal preview is not ready yet.')
      } else if (result.reason === 'popup-blocked') {
        toast.error('Please allow pop-ups to print the transmittal slip.')
      } else {
        toast.error('Unable to open transmittal print preview.')
      }
    }
  }

  const printSticker = () => {
    const el = stickerRef.current
    if (!el) return
    const stickerSvg = el.querySelector('svg')?.outerHTML || ''
    const dateLabel = new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })

    const html = `<!DOCTYPE html>
<html>
<head>
  <title>Control/Reference # Sticker — ${trackingNumber}</title>
  <style>
    @page { size: letter; margin: 0; }
    @media print { .no-print { display: none !important; } }
    html, body { margin: 0; padding: 0; font-family: Arial, sans-serif; }
    .toolbar { background: #f5f5f5; border-bottom: 1px solid #ddd; padding: 8px 16px; display: flex; align-items: center; gap: 12px; }
    .toolbar button { padding: 6px 16px; font-size: 13px; border: 1px solid #002868; background: #002868; color: #fff; border-radius: 4px; cursor: pointer; font-weight: 600; }
    .toolbar button:hover { background: #001a4d; }
    .toolbar span { font-size: 13px; color: #555; }
    .sticker-container { padding: 0.4in; }
    .sticker { width: 2.5in; border: 2px solid #002868; border-radius: 6px; padding: 10px; box-sizing: border-box; }
    .sticker-inner { display: flex; align-items: center; gap: 12px; }
    .sticker-info { font-size: 7pt; color: #6c757d; text-transform: uppercase; letter-spacing: 1px; }
    .sticker-number { font-family: monospace; font-size: 14pt; font-weight: 700; color: #002868; }
    .sticker-date { font-size: 9pt; color: #6c757d; }
    .sticker-footer { margin-top: 8px; padding-top: 6px; border-top: 1px dashed #dee2e6; font-size: 8pt; color: #6c757d; }
  </style>
</head>
<body>
  <div class="toolbar no-print">
    <button onclick="window.print()">🖨️ Print Sticker</button>
    <span>Preview — ${trackingNumber}</span>
  </div>
  <div class="sticker-container">
    <div class="sticker">
      <div class="sticker-inner">
        ${stickerSvg}
        <div>
          <div class="sticker-info">Philippine Ports Authority</div>
          <div class="sticker-number">${trackingNumber}</div>
          <div class="sticker-date">${dateLabel}</div>
        </div>
      </div>
      <div class="sticker-footer">Attach this sticker to the physical document</div>
    </div>
  </div>
</body>
</html>`

    const w = window.open('', '_blank')
    w.document.write(html)
    w.document.close()
    w.focus()
  }

  return (
    <>
      {/* Step Indicator */}
      <div className="content-card mb-4">
        <div className="content-card-body py-3">
          <div className="d-flex justify-content-between align-items-center">
            {SCAN_STEPS.map((s, i) => (
              <div key={i} className="d-flex align-items-center" style={{ flex: i < SCAN_STEPS.length - 1 ? 1 : 'none' }}>
                <div className="d-flex align-items-center gap-2">
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%',
                    background: step >= i ? '#002868' : '#e9ecef',
                    color: step >= i ? '#fff' : '#6c757d',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 12, fontWeight: 600, flexShrink: 0,
                  }}>
                    {step > i ? <i className="bi bi-check"></i> : i + 1}
                  </div>
                  <span style={{ fontSize: 11, fontWeight: step === i ? 600 : 400, color: step >= i ? '#002868' : '#6c757d', whiteSpace: 'nowrap' }}>
                    {s}
                  </span>
                </div>
                {i < SCAN_STEPS.length - 1 && (
                  <div style={{ flex: 1, height: 2, background: step > i ? '#002868' : '#e9ecef', margin: '0 12px' }}></div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ===== STEP 0: Scan & Upload to EDMS ===== */}
      {step === 0 && (
        <Row className="g-4">
          <Col lg={8} className="mx-auto">
            <div className="content-card">
              <div className="content-card-header">
                <h6><i className="bi bi-upload me-2"></i>Step 1 — Scan & Upload to EDMS</h6>
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
                  <h6 className="mb-1">Drag & drop scanned document here</h6>
                  <p className="text-muted mb-0" style={{ fontSize: 13 }}>
                    or click to browse from your computer / scanner
                  </p>
                  <p className="text-muted mb-0" style={{ fontSize: 12 }}>
                    Supported: PDF, PNG, JPG, TIFF — Max 50 MB
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

                {files.length > 0 && (
                  <div className="mt-3">
                    <small className="text-muted fw-semibold">Scanned Files ({files.length})</small>
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

                    <Button className="mt-3 w-100" variant="primary" onClick={uploadToEDMS}>
                      <i className="bi bi-cloud-upload me-2"></i>Upload to EDMS & Process
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </Col>
        </Row>
      )}

      {/* ===== STEP 1: PDF Conversion & OCR ===== */}
      {step === 1 && (
        <Row className="g-4">
          <Col lg={8} className="mx-auto">
            <div className="content-card">
              <div className="content-card-header">
                <h6><i className="bi bi-cpu me-2"></i>Step 2 — EDMS Processing: PDF Conversion & OCR</h6>
              </div>
              <div className="content-card-body text-center py-5">
                <div className="mb-4">
                  <i className="bi bi-file-earmark-pdf" style={{ fontSize: 48, color: ocrDone ? '#198754' : '#002868' }}></i>
                </div>

                <ProgressBar
                  now={Math.min(ocrProgress, 100)}
                  variant={ocrDone ? 'success' : 'primary'}
                  animated={!ocrDone}
                  style={{ height: 8, marginBottom: 16 }}
                />

                {!ocrDone ? (
                  <div style={{ fontSize: 14 }}>
                    <i className="bi bi-gear-wide-connected me-2 text-primary" style={{ animation: 'spin 1s linear infinite' }}></i>
                    {ocrStatus || 'Processing document...'}
                  </div>
                ) : (
                  <>
                    <div className="text-success fw-semibold mb-3" style={{ fontSize: 14 }}>
                      <i className="bi bi-check-circle-fill me-2"></i>
                      PDF conversion & OCR complete — document is now searchable/editable
                    </div>

                    {/* Scan Detection Info Cards */}
                    <div className="d-flex flex-wrap gap-2 justify-content-center mb-3">
                      <div className="d-flex align-items-center gap-2 px-3 py-2 rounded" style={{ background: '#e8f4fd', fontSize: 12 }}>
                        <i className="bi bi-aspect-ratio text-primary"></i>
                        <span><strong>Paper:</strong> {scanInfo.paperSize}</span>
                      </div>
                      <div className="d-flex align-items-center gap-2 px-3 py-2 rounded" style={{ background: '#e8f4fd', fontSize: 12 }}>
                        <i className="bi bi-file-earmark-richtext text-primary"></i>
                        <span><strong>Pages:</strong> {scanInfo.pageCount}</span>
                      </div>
                      <div className="d-flex align-items-center gap-2 px-3 py-2 rounded" style={{ background: '#e8f4fd', fontSize: 12 }}>
                        <i className="bi bi-file-text text-primary"></i>
                        <span><strong>Template:</strong> {scanInfo.templateType}</span>
                      </div>
                      <div className="d-flex align-items-center gap-2 px-3 py-2 rounded" style={{
                        background: scanInfo.ocrConfidence >= 70 ? '#d1e7dd' : scanInfo.ocrConfidence >= 40 ? '#fff3cd' : '#f8d7da',
                        fontSize: 12,
                      }}>
                        <i className={`bi ${scanInfo.ocrConfidence >= 70 ? 'bi-shield-check text-success' : scanInfo.ocrConfidence >= 40 ? 'bi-shield-exclamation text-warning' : 'bi-shield-x text-danger'}`}></i>
                        <span><strong>OCR Confidence:</strong> {scanInfo.ocrConfidence}%</span>
                      </div>
                    </div>

                    {/* Missing Fields Warning */}
                    {scanInfo.missingFields.length > 0 && (
                      <Alert variant={scanInfo.ocrConfidence < 40 ? 'danger' : 'warning'} className="text-start mx-auto mb-3" style={{ maxWidth: 560, fontSize: 12 }}>
                        <div className="d-flex align-items-start gap-2">
                          <i className={`bi ${scanInfo.ocrConfidence < 40 ? 'bi-x-octagon-fill' : 'bi-exclamation-triangle-fill'} mt-1`}></i>
                          <div>
                            <strong>{scanInfo.missingFields.length} field(s) not detected:</strong> {scanInfo.missingFields.join(', ')}
                            <div className="mt-1" style={{ color: '#555' }}>
                              {scanInfo.ocrConfidence < 40
                                ? 'The document appears to have missing header details (e.g., body-only scan). Switching to Manual Entry mode.'
                                : 'These fields will need to be filled in manually in the next step.'}
                            </div>
                          </div>
                        </div>
                      </Alert>
                    )}

                    {/* Field-level OCR Results */}
                    <Alert variant="light" className="border text-start mx-auto" style={{ maxWidth: 560 }}>
                      <div className="fw-semibold mb-2"><i className="bi bi-card-text me-2"></i>OCR Extraction Results (PaddleOCR):</div>
                      <div style={{ fontSize: 12 }}>
                        {[
                          { label: 'FROM / Sender', key: 'sender' },
                          { label: 'FROM (Address)', key: 'senderAddress' },
                          { label: 'Subject', key: 'subject' },
                          { label: 'Document Type', key: 'type' },
                        ].map(({ label, key }) => {
                          const conf = fieldConfidence[key] || 'none'
                          const val = extracted[key]
                          return (
                            <div key={key} className="d-flex align-items-center gap-2 py-1" style={{ borderBottom: '1px solid #f0f0f0' }}>
                              <i className={`bi ${conf === 'high' ? 'bi-check-circle-fill text-success' : conf === 'partial' ? 'bi-dash-circle-fill text-warning' : 'bi-x-circle-fill text-danger'}`} style={{ fontSize: 11, flexShrink: 0 }}></i>
                              <span style={{ width: 130, fontWeight: 600, color: '#555', flexShrink: 0 }}>{label}:</span>
                              <span style={{ flex: 1 }}>
                                {val || <span className="text-danger fst-italic">Not detected — manual entry required</span>}
                              </span>
                            </div>
                          )
                        })}
                        <div className="d-flex align-items-center gap-2 py-1">
                          <i className="bi bi-check-circle-fill text-success" style={{ fontSize: 11, flexShrink: 0 }}></i>
                          <span style={{ width: 130, fontWeight: 600, color: '#555', flexShrink: 0 }}>Pages:</span>
                          <span>{extracted.pages}</span>
                        </div>
                      </div>
                      <div className="mt-2 pt-2 border-top d-flex align-items-center gap-2" style={{ fontSize: 11, color: '#6c757d' }}>
                        <i className="bi bi-check-circle-fill text-success"></i> Detected
                        <i className="bi bi-dash-circle-fill text-warning ms-2"></i> Partial
                        <i className="bi bi-x-circle-fill text-danger ms-2"></i> Not detected
                      </div>
                    </Alert>

                    <Button variant="primary" onClick={assignControlNumber} className="mt-2">
                      <i className="bi bi-hash me-2"></i>Assign Control/Reference Number
                    </Button>
                  </>
                )}
              </div>
            </div>
          </Col>
        </Row>
      )}

      {/* ===== STEP 2: Assign Control/Reference # & Auto-fill Details ===== */}
      {step === 2 && (
        <Row className="g-4">
          <Col lg={5}>
            {/* Document preview with control number overlay */}
            <div className="content-card mb-3">
              <div className="content-card-header">
                <div className="d-flex flex-wrap align-items-center gap-2">
                  <h6 className="mb-0 me-auto"><i className="bi bi-file-earmark-pdf me-2 text-danger"></i>Scanned Document Preview</h6>
                  <div className="btn-group btn-group-sm shadow-sm" role="group" aria-label="Stamp overlays">
                    <Button
                      size="sm"
                      variant={ctrlStampVisible ? 'primary' : 'outline-secondary'}
                      className="d-flex align-items-center text-nowrap"
                      onClick={() => setCtrlStampVisible(!ctrlStampVisible)}
                      disabled={!trackingNumber}
                      style={{ fontSize: 11 }}
                      title="Show and drag the Control/Reference stamp overlay."
                    >
                      <i className="bi bi-pin-angle me-1"></i>Control/Reference
                    </Button>
                    <Button
                      size="sm"
                      variant={receivedStampVisible ? 'primary' : 'outline-secondary'}
                      className="d-flex align-items-center text-nowrap"
                      onClick={() => setReceivedStampVisible(!receivedStampVisible)}
                      style={{ fontSize: 11 }}
                      title="Show and drag the Received stamp overlay."
                    >
                      <i className="bi bi-calendar2-check me-1"></i>Received Stamp
                    </Button>
                  </div>
                </div>
                {!trackingNumber && (
                  <div className="mt-2" style={{ fontSize: 11, color: '#6c757d' }}>
                    Assign a Control/Reference Number first to enable the Control/Reference stamp.
                  </div>
                )}
              </div>
              <div className="content-card-body" style={{ background: '#525659', padding: 12, borderRadius: '0 0 8px 8px' }}>
                {previewSlides.length > 0 && (
                  <div className="d-flex align-items-center mb-2 px-1" style={{ fontSize: 11, color: '#e9ecef' }}>
                    <span className="text-truncate" style={{ maxWidth: '100%' }} title={activePreview?.fileName || 'Scanned File'}>
                      {activePreview?.fileName || 'Scanned File'}
                    </span>
                  </div>
                )}
                {/* Scanned Document Image with stamp overlay */}
                <div
                  ref={docPreviewRef}
                  style={{
                    width: '100%',
                    position: 'relative',
                    cursor: (ctrlStampVisible || receivedStampVisible) ? 'crosshair' : 'default',
                    overflow: 'hidden',
                    userSelect: 'none',
                    boxShadow: '0 4px 24px rgba(0,0,0,0.3)',
                    background: '#fff',
                  }}
                >
                  {/* Stacked sheet effect for multi-page preview */}
                  {previewSlides.length > 1 && (
                    <>
                      <div style={{ position: 'absolute', inset: '6px 6px -6px 6px', background: '#eef1f4', border: '1px solid #d7dce1', zIndex: 0 }}></div>
                      <div style={{ position: 'absolute', inset: '3px 3px -3px 3px', background: '#f6f8fa', border: '1px solid #e1e5ea', zIndex: 0 }}></div>
                    </>
                  )}
                  {/* The actual scanned file as image */}
                  {filePreviewUrl ? (
                    <img
                      src={filePreviewUrl}
                      alt="Scanned document"
                      style={{ width: '100%', display: 'block', position: 'relative', zIndex: 1 }}
                      draggable={false}
                      onLoad={centerStamps}
                    />
                  ) : (
                    <div style={{ padding: 40, textAlign: 'center', minHeight: 420 }}>
                      <div className="text-center mb-2" style={{ fontSize: 8, color: '#999' }}>PHILIPPINE PORTS AUTHORITY</div>
                      <div className="text-center fw-bold mb-3" style={{ fontSize: 13 }}>{extracted.type?.toUpperCase() || 'MEMORANDUM'}</div>
                      <div style={{ fontSize: 11, textAlign: 'left', padding: '0 20px' }}>
                        <div><strong>FOR</strong> : {extracted.addressedTo || '—'}</div>
                        {extracted.addressedToDivision && <div style={{ paddingLeft: 34 }}>{extracted.addressedToDivision}</div>}
                        {extracted.thru && <div><strong>THRU</strong> : {extracted.thru}</div>}
                        {extracted.thruDivision && <div style={{ paddingLeft: 42 }}>{extracted.thruDivision}</div>}
                        <div><strong>FROM</strong> : {extracted.sender || '—'}</div>
                        {extracted.senderAddress && <div style={{ paddingLeft: 42 }}>{extracted.senderAddress}</div>}
                        <div><strong>SUBJECT</strong> : {extracted.subject || '—'}</div>
                      </div>
                      <hr />
                      <div style={{ color: '#999', fontSize: 10 }}>[Document body text]</div>
                    </div>
                  )}

                  {/* Draggable Control/Reference # Stamp */}
                  {ctrlStampVisible && (
                    <div
                      ref={ctrlStampElRef}
                      onMouseDown={handleCtrlStampMouseDown}
                      style={{
                        position: 'absolute',
                        left: ctrlStampPos.x,
                        top: ctrlStampPos.y,
                        cursor: 'grab',
                        zIndex: 8,
                        textAlign: 'center',
                        lineHeight: 1.1,
                        userSelect: 'none',
                      }}
                    >
                      <div style={{
                        fontSize: 7, fontWeight: 600, color: '#dc3545',
                        letterSpacing: 0.3, marginBottom: 1,
                        textShadow: '0 0 2px rgba(255,255,255,0.9)',
                      }}>
                        CONTROL / REFERENCE #
                      </div>
                      <div style={{
                        fontFamily: 'monospace', fontSize: 12, fontWeight: 800,
                        color: '#dc3545', letterSpacing: 0.5,
                        textShadow: '0 0 3px rgba(255,255,255,0.9)',
                      }}>
                        {trackingNumber}
                      </div>
                    </div>
                  )}

                  {/* Draggable Received Stamp */}
                  {receivedStampVisible && (
                    <div
                      ref={receivedStampElRef}
                      onMouseDown={handleReceivedStampMouseDown}
                      style={{
                        position: 'absolute',
                        left: receivedStampPos.x,
                        top: receivedStampPos.y,
                        cursor: 'grab',
                        zIndex: 8,
                        userSelect: 'none',
                      }}
                    >
                      <div style={{
                        width: RECEIVED_STAMP_WIDTH,
                        minHeight: RECEIVED_STAMP_HEIGHT,
                        color: '#0b2f6f',
                        lineHeight: 1.08,
                        textShadow: '0 0 2px rgba(255,255,255,0.95)',
                        letterSpacing: 0.3,
                      }}>
                        <div style={{ fontWeight: 800, fontSize: RECEIVED_STAMP_TOP_FONT, whiteSpace: 'nowrap' }}>{receivedStampLines.headerLine}</div>
                        <div style={{ fontWeight: 800, fontSize: RECEIVED_STAMP_BOTTOM_FONT, whiteSpace: 'nowrap' }}>{receivedStampLines.dateTimeLine}</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer Controls */}
                <div className="mt-3 d-flex flex-wrap justify-content-between align-items-center gap-2">
                  <div>
                    {(ctrlStampVisible || receivedStampVisible) && (
                      <div className="d-flex align-items-center gap-2" style={{ fontSize: 11 }}>
                        <i className="bi bi-arrows-move" style={{ color: '#adb5bd' }}></i>
                        <span style={{ color: '#adb5bd' }}>Drag visible stamps to position. Selected stamps are included in final PDF.</span>
                      </div>
                    )}
                  </div>

                  {previewSlides.length > 1 && (
                    <div className="btn-group flex-shrink-0 shadow-sm">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="d-flex align-items-center text-nowrap"
                        onClick={() => {
                          setActivePreviewIndex(prev => {
                            const next = Math.max(0, prev - 1)
                            if (previewSlides[next]?.src) setFilePreviewUrl(previewSlides[next].src)
                            return next
                          })
                        }}
                        disabled={activePreviewIndex === 0}
                        style={{ fontSize: 11, background: '#6c757d', borderColor: '#6c757d' }}
                      >
                        <i className="bi bi-chevron-left me-1"></i>Previous Page
                      </Button>
                      <span className="btn btn-secondary disabled d-flex align-items-center" style={{ fontSize: 11, padding: '0 10px', background: '#5a6268', borderColor: '#5a6268', opacity: 1, color: '#fff' }}>
                        {activePreviewIndex + 1} / {previewSlides.length}
                      </span>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="d-flex align-items-center text-nowrap"
                        onClick={() => {
                          setActivePreviewIndex(prev => {
                            const next = Math.min(previewSlides.length - 1, prev + 1)
                            if (previewSlides[next]?.src) setFilePreviewUrl(previewSlides[next].src)
                            return next
                          })
                        }}
                        disabled={activePreviewIndex >= previewSlides.length - 1}
                        style={{ fontSize: 11, background: '#6c757d', borderColor: '#6c757d' }}
                      >
                        Next Page<i className="bi bi-chevron-right ms-1"></i>
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Col>

          <Col lg={7}>
            <div className="content-card mb-3">
              <div className="content-card-header">
                <h6><i className="bi bi-hash me-2 text-primary"></i>Step 3a — Control/Reference # Assigned</h6>
              </div>
              <div className="content-card-body">
                <Alert variant="info" className="d-flex align-items-center gap-3 mb-0">
                  <i className="bi bi-bookmark-check-fill" style={{ fontSize: 24 }}></i>
                  <div>
                    <div style={{ fontFamily: 'monospace', fontSize: 18, fontWeight: 700, color: '#002868' }}>{trackingNumber}</div>
                    <div style={{ fontSize: 12, color: '#6c757d' }}>Assigned by EDMS and embedded in the scanned PDF</div>
                  </div>
                </Alert>
              </div>
            </div>

            <div className="content-card">
              <div className="content-card-header">
                <h6><i className="bi bi-pencil-square me-2"></i>Step 3b — Verify Auto-filled Details (from OCR)</h6>
                <div className="d-flex align-items-center gap-2">
                  <span className="badge bg-primary" style={{ fontSize: 10 }}><i className="bi bi-cpu me-1"></i>OCR-assisted</span>
                  <span className="badge bg-success" style={{ fontSize: 10 }}>→ Transmittal Slip</span>
                </div>
              </div>
              <div className="content-card-body">
                {/* Mode Info */}
                {scanInfo.missingFields.length > 0 && (
                  <Alert variant="warning" className="py-2 mb-3" style={{ fontSize: 12 }}>
                    <i className="bi bi-exclamation-triangle me-2"></i>
                    <strong>{scanInfo.missingFields.length} field(s) need manual input</strong> — highlighted fields below were not detected by OCR.
                  </Alert>
                )}

                <Row className="g-3">
                  <Col md={12}>
                    <Form.Group>
                      <Form.Label className="fw-semibold d-flex align-items-center gap-1" style={{ fontSize: 13 }}>
                        Subject / Description *
                        <FieldBadge conf={fieldConfidence.subject} />
                      </Form.Label>
                      <Form.Control value={extracted.subject} onChange={e => handleChange('subject', e.target.value)} className={!extracted.subject ? 'border-warning' : ''} placeholder="Type the document subject here" />
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label className="fw-semibold d-flex align-items-center gap-1" style={{ fontSize: 13 }}>
                        Document Type
                        <FieldBadge conf={fieldConfidence.type} />
                      </Form.Label>
                      <Form.Select value={extracted.type} onChange={e => handleChange('type', e.target.value)}>
                        <option value="">Select type...</option>
                        {DOCUMENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </Form.Select>
                    </Form.Group>
                  </Col>
                  <Col md={2}>
                    <Form.Group>
                      <Form.Label className="fw-semibold" style={{ fontSize: 13 }}>Pages</Form.Label>
                      <Form.Control type="number" min="1" value={extracted.pages} onChange={e => handleChange('pages', e.target.value)} />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold d-flex align-items-center gap-1" style={{ fontSize: 13 }}>
                        FROM / Sender Name *
                        <FieldBadge conf={fieldConfidence.sender} />
                      </Form.Label>
                      <Form.Control value={extracted.sender} onChange={e => handleChange('sender', e.target.value)} className={!extracted.sender ? 'border-warning' : ''} placeholder="e.g., The Acting Division Manager A" />
                    </Form.Group>
                    <Form.Group className="mt-2">
                      <Form.Label className="fw-semibold d-flex align-items-center gap-1" style={{ fontSize: 13 }}>
                        FROM (Address)
                        <FieldBadge conf={fieldConfidence.senderAddress} />
                      </Form.Label>
                      <Form.Control value={extracted.senderAddress} onChange={e => handleChange('senderAddress', e.target.value)} placeholder="e.g., Administrative Division" />
                    </Form.Group>
                  </Col>
                  <Col md={6}>
                    <Form.Group>
                      <Form.Label className="fw-semibold" style={{ fontSize: 13 }}>Sender Ref. No.</Form.Label>
                      <Form.Control value={extracted.senderRefNo} onChange={e => handleChange('senderRefNo', e.target.value)} placeholder="Optional" />
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label className="fw-semibold" style={{ fontSize: 13 }}>Due Date</Form.Label>
                      <Form.Control
                        type="date"
                        value={extracted.dueDate}
                        onChange={e => handleChange('dueDate', e.target.value)}
                      />
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label className="fw-semibold" style={{ fontSize: 13 }}>Date Received *</Form.Label>
                      <Form.Control
                        type="date"
                        value={receiveInfo.receivedDate}
                        onChange={e => setReceiveInfo(prev => ({ ...prev, receivedDate: e.target.value }))}
                      />
                    </Form.Group>
                  </Col>
                  <Col md={4}>
                    <Form.Group>
                      <Form.Label className="fw-semibold" style={{ fontSize: 13 }}>Time Received *</Form.Label>
                      <Form.Control
                        type="time"
                        value={receiveInfo.receivedTime}
                        onChange={e => setReceiveInfo(prev => ({ ...prev, receivedTime: e.target.value }))}
                      />
                    </Form.Group>
                  </Col>
                  <Col md={12}>
                    <Form.Group>
                      <Form.Label className="fw-semibold" style={{ fontSize: 13 }}>Comments / Instructions</Form.Label>
                      <Form.Control as="textarea" rows={5} placeholder="Optional" value={extracted.remarks} onChange={e => handleChange('remarks', e.target.value)} />
                    </Form.Group>
                  </Col>
                </Row>

                <div className="d-flex flex-wrap gap-2 mb-2">
                  <span className="badge bg-success" style={{ fontSize: 11 }}>
                    <i className="bi bi-hdd-network-fill me-1"></i>
                    Storage Mode: {folderPickerSupported && saveDirHandleRef.current
                      ? `Folder Override (${saveDirLabel})`
                      : `Auto-save Default (Server -> D:\\${effectiveStorageRoot})`}
                  </span>
                  <span className={`badge ${savePrepStatus === 'ready' ? 'bg-success' : savePrepStatus === 'preparing' ? 'bg-warning text-dark' : savePrepStatus === 'error' ? 'bg-danger' : 'bg-secondary'}`} style={{ fontSize: 11 }}>
                    <i className={`bi ${savePrepStatus === 'ready' ? 'bi-lightning-charge-fill' : savePrepStatus === 'preparing' ? 'bi-hourglass-split' : savePrepStatus === 'error' ? 'bi-exclamation-triangle-fill' : 'bi-clock'} me-1`}></i>
                    Save Prep: {savePrepStatus === 'ready' ? 'Ready (fast save)' : savePrepStatus === 'preparing' ? 'Preparing files...' : savePrepStatus === 'error' ? 'Retry on Save' : 'Pending'}
                  </span>
                  <span className={`badge ${registerReadiness.metadataReady ? 'bg-success' : 'bg-warning text-dark'}`} style={{ fontSize: 11 }}>
                    <i className={`bi ${registerReadiness.metadataReady ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'} me-1`}></i>
                    Metadata: {registerReadiness.metadataReady ? 'Ready' : `${registerReadiness.metadataMissing.length} field(s) missing`}
                  </span>

                </div>

                <hr />
                <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                  <div className="d-flex align-items-center gap-2 flex-wrap">
                    <Button variant="outline-secondary" onClick={() => setStep(1)}>
                      <i className="bi bi-arrow-left me-1"></i>Back
                    </Button>

                    {folderPickerSupported ? (
                      <div className="d-flex align-items-center gap-2 px-2 py-1 rounded" style={{ background: '#f8f9fa', border: '1px solid #e9ecef' }}>
                        <Button size="sm" variant={saveDirHandleRef.current ? 'outline-success' : 'outline-primary'} onClick={pickExternalSaveFolder}>
                          <i className="bi bi-folder2-open me-1"></i>{saveDirHandleRef.current ? 'Change Override' : 'Folder Override'}
                        </Button>
                        <span className="text-muted" style={{ fontSize: 11, maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {saveDirHandleRef.current
                            ? `Active: ${saveDirLabel}`
                            : 'No override selected'}
                        </span>
                      </div>
                    ) : (
                      <div className="d-flex align-items-center gap-2 px-2 py-1 rounded" style={{ background: '#f8f9fa', border: '1px solid #e9ecef' }}>
                        <span className="text-muted" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>External Storage Root:</span>
                        <Form.Control
                          size="sm"
                          value={storageFolderName}
                          onChange={(e) => setStorageFolderName(e.target.value)}
                          placeholder="DocTrack Files"
                          style={{ width: 180 }}
                        />
                      </div>
                    )}
                  </div>

                  <Button
                    variant="primary"
                    onClick={handleRegister}
                    disabled={savePrepStatus !== 'ready' || !registerReadiness.ready}
                    style={{ whiteSpace: 'nowrap', minHeight: 38 }}
                  >
                    <i className="bi bi-printer me-1"></i>Register & Print Transmittal Slip
                  </Button>
                </div>
              </div>
            </div>
          </Col>
        </Row>
      )}

      {/* ===== STEP 3: Print Transmittal Slip & Control/Reference # Sticker ===== */}
      {step === 3 && (
        <>
          <Alert variant="success" className="d-flex align-items-center gap-3 mb-4">
            <i className="bi bi-check-circle-fill" style={{ fontSize: 24 }}></i>
            <div>
              <strong>Document Registered Successfully</strong><br />
              <span style={{ fontSize: 13 }}>Control/Reference #: <strong>{trackingNumber}</strong> — {extracted.subject}</span>
            </div>
          </Alert>

          <Row className="g-4">
            {/* Incoming Transmittal Slip — matches PMO layout exactly */}
            <Col lg={6}>
              <div className="content-card">
                <div className="content-card-header">
                  <h6><i className="bi bi-file-earmark-text me-2"></i>Incoming Transmittal Slip</h6>
                  <Button size="sm" variant="outline-primary" onClick={printTransmittal}>
                    <i className="bi bi-printer me-1"></i>Print
                  </Button>
                </div>
                <div className="content-card-body d-flex justify-content-center" style={{ background: '#f0f0f0', padding: 16 }}>
                  <IncomingTransmittalSlip
                    ref={transmittalRef}
                    {...transmittalSlipProps}
                  />
                </div>
                <div className="content-card-body border-top py-2">
                  <small className="text-muted"><i className="bi bi-info-circle me-1"></i>Matches PMO transmittal layout — Scan: {scanInfo.paperSize || 'N/A'}, {scanInfo.pageCount} page(s)</small>
                </div>
              </div>

            </Col>

            {/* Control/Reference # Sticker */}
            <Col lg={6}>
              <div className="content-card mb-3">
                <div className="content-card-header">
                  <h6><i className="bi bi-stickies me-2"></i>Control/Reference # Sticker</h6>
                  <Button size="sm" variant="outline-primary" onClick={printSticker}>
                    <i className="bi bi-printer me-1"></i>Print Sticker
                  </Button>
                </div>
                <div className="content-card-body d-flex justify-content-center" style={{ background: '#f0f0f0', padding: 24 }}>
                  <div ref={stickerRef} style={{
                    width: 260, background: '#fff',
                    border: '2px solid #002868', borderRadius: 6,
                    padding: 12,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <QRCodeSVG value={`PPA-PMO-NOB|${trackingNumber}`} size={64} level="M" />
                      <div>
                        <div style={{ fontSize: 7, color: '#6c757d', textTransform: 'uppercase', letterSpacing: 1 }}>Philippine Ports Authority</div>
                        <div style={{ fontFamily: 'monospace', fontSize: 14, fontWeight: 700, color: '#002868' }}>{trackingNumber}</div>
                        <div style={{ fontSize: 9, color: '#6c757d' }}>{new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'long', day: 'numeric' })}</div>
                      </div>
                    </div>
                    <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px dashed #dee2e6', fontSize: 8, color: '#6c757d' }}>
                      Attach this sticker to the physical document
                    </div>
                  </div>
                </div>
                <div className="content-card-body border-top py-2">
                  <small className="text-muted"><i className="bi bi-info-circle me-1"></i>Print on sticker paper and attach to document</small>
                </div>
              </div>

              {/* Actions */}
              <div className="content-card">
                <div className="content-card-header">
                  <h6><i className="bi bi-clipboard-check me-2 text-success"></i>What to do next</h6>
                </div>
                <div className="content-card-body">
                  <div className="d-flex flex-column gap-2" style={{ fontSize: 13 }}>
                    <div className="d-flex align-items-start gap-2">
                      <i className="bi bi-printer-fill text-primary mt-1" style={{ fontSize: 16 }}></i>
                      <span><strong>Print & Attach:</strong> Print the <strong>Transmittal Slip</strong> and <strong>Control/Reference # Sticker</strong>, then attach them to the physical document.</span>
                    </div>
                    <div className="d-flex align-items-start gap-2">
                      <i className="bi bi-send-fill text-warning mt-1" style={{ fontSize: 16 }}></i>
                      <span><strong>Endorse to OPM:</strong> Head over to the <strong>Incoming Communications</strong> tab to endorse this document to the Office of the Port Manager.</span>
                    </div>
                  </div>

                  <hr />
                  <div className="d-grid gap-2">
                    <Button variant="outline-primary" onClick={() => navigate('/incoming')}>
                      <i className="bi bi-inbox me-2"></i>Go to Incoming Communications
                    </Button>
                    <Button variant="outline-secondary" size="sm" onClick={() => { setStep(0); setFiles([]); clearPreparedAssets(); setFilePreviewUrl(''); setPreviewSlides([]); setActivePreviewIndex(0); setTrackingNumber(''); setRegistered(false); setOcrDone(false); setFieldConfidence({}); setCtrlStampPos({ x: 0, y: 0 }); setCtrlStampVisible(true); setReceivedStampPos({ x: 0, y: 0 }); setReceivedStampVisible(true); setReceiveInfo(createDefaultReceiveInfo()); setScanInfo({ paperSize: '', pageCount: 0, missingFields: [], templateType: '', ocrConfidence: 0 }); setExtracted({ subject: '', type: '', sender: '', senderAddress: '', senderRefNo: '', dateOfComm: '', dueDate: '', pages: '1', remarks: '', targetDivision: '', addressedTo: '', addressedToDivision: '', thru: '', thruDivision: '' }) }}>
                      <i className="bi bi-plus-lg me-1"></i>Scan Another Document
                    </Button>
                  </div>
                </div>
              </div>
            </Col>
          </Row>
        </>
      )}

    </>
  )
}
