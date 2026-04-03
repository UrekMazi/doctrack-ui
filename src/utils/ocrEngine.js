/**
 * Frontend OCR client for backend PaddleOCR service.
 *
 * This module keeps the same contract consumed by ScanRegister:
 * - processDocument(file, onProgress)
 * - processBatch(files, onOverallProgress, onFileStatus)
 */
import * as pdfjsLib from 'pdfjs-dist'

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url
).toString()

function normalizeSpace(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim()
}

function normalizeDateToIso(rawValue = '') {
  const raw = normalizeSpace(rawValue)
  if (!raw) return ''

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw

  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().slice(0, 10)
  }

  return raw
}

function buildFieldConfidence(fields) {
  const confidence = {
    type: fields.type ? 'high' : 'none',
    sender: fields.sender ? 'high' : 'none',
    senderAddress: fields.senderAddress ? 'high' : 'none',
    subject: fields.subject ? 'high' : 'none',
    dateOfComm: fields.dateOfComm ? 'high' : 'none',
  }

  return confidence
}

function estimateOcrConfidence(fields) {
  const keys = ['subject', 'sender', 'dateOfComm']
  const found = keys.filter((key) => normalizeSpace(fields[key]).length > 0).length
  return Math.round((found / keys.length) * 100)
}

async function getPageCount(file) {
  if (!file || file.type !== 'application/pdf') return 1

  try {
    const arrayBuffer = await file.arrayBuffer()
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise
    return Math.max(1, pdf.numPages || 1)
  } catch {
    return 1
  }
}

async function callBackendPaddleOCR(file) {
  const formData = new FormData()
  formData.append('file', file)

  const token = localStorage.getItem('doctrack_token') || ''
  const headers = {}
  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  const response = await fetch('/api/ocr/extract', {
    method: 'POST',
    headers,
    body: formData,
  })

  let payload = {}
  try {
    payload = await response.json()
  } catch {
    payload = {}
  }

  if (!response.ok) {
    const message = payload.error || payload.details || `OCR request failed (HTTP ${response.status})`
    throw new Error(message)
  }

  return payload
}

function buildResultFromBackend(payload, pageCount) {
  const fields = {
    subject: normalizeSpace(payload.subject),
    type: normalizeSpace(payload.docType),
    sender: normalizeSpace(payload.sender),
    senderAddress: normalizeSpace(payload.senderDivision),
    senderRefNo: '',
    dateOfComm: normalizeDateToIso(payload.dateOfComm),
    pages: String(Math.max(1, pageCount || 1)),
  }

  const fieldConfidence = buildFieldConfidence(fields)
  const ocrConfidence = estimateOcrConfidence(fields)

  return {
    fields,
    fieldConfidence,
    rawText: '',
    ocrConfidence,
    pageCount: Math.max(1, pageCount || 1),
    templateType: 'PaddleOCR Extraction',
    paperSize: pageCount > 1 ? 'Legal (8.5" x 14")' : 'Letter (8.5" x 11")',
    extractionMethod: 'backend-paddleocr',
  }
}

/**
 * Process a single uploaded file using backend PaddleOCR.
 */
export async function processDocument(file, onProgress = () => {}, _options = {}) {
  if (!file) {
    return {
      fields: {},
      fieldConfidence: {},
      rawText: '',
      ocrConfidence: 0,
      pageCount: 1,
      templateType: 'Unknown',
      paperSize: 'Letter (8.5" x 11")',
    }
  }

  onProgress(5)
  const pageCount = await getPageCount(file)

  onProgress(25)
  const payload = await callBackendPaddleOCR(file)

  onProgress(90)
  const result = buildResultFromBackend(payload, pageCount)
  onProgress(100)

  return result
}

/**
 * Process multiple uploaded files.
 *
 * Strategy:
 * - Extract metadata from the first file via PaddleOCR endpoint.
 * - Count pages of remaining files client-side to preserve existing page counter behavior.
 */
export async function processBatch(files, onOverallProgress = () => {}, onFileStatus = () => {}) {
  if (!files || files.length === 0) {
    return {
      result: {
        fields: {},
        fieldConfidence: {},
        rawText: '',
        ocrConfidence: 0,
        pageCount: 0,
        templateType: 'Unknown',
        paperSize: 'Letter (8.5" x 11")',
      },
      totalPages: 0,
    }
  }

  if (files.length === 1) {
    const result = await processDocument(files[0], onOverallProgress)
    return { result, totalPages: result.pageCount || 1 }
  }

  onFileStatus(0, 'Uploading first page for PaddleOCR extraction...')
  const firstResult = await processDocument(files[0], (progress) => {
    onOverallProgress(Math.round(progress * 0.75))
  })
  onFileStatus(0, 'PaddleOCR extraction complete')

  let totalPages = Math.max(1, firstResult.pageCount || 1)
  const remaining = files.slice(1)

  if (remaining.length > 0) {
    let completed = 0
    const counts = await Promise.all(
      remaining.map(async (file, index) => {
        onFileStatus(index + 1, 'Counting pages...')
        const count = await getPageCount(file)
        completed += 1
        const progress = 75 + Math.round((completed / remaining.length) * 25)
        onOverallProgress(progress)
        onFileStatus(index + 1, `Done (${count} page${count > 1 ? 's' : ''})`)
        return count
      })
    )

    totalPages += counts.reduce((sum, value) => sum + Math.max(1, value || 1), 0)
  }

  const result = {
    ...firstResult,
    pageCount: totalPages,
    fields: {
      ...firstResult.fields,
      pages: String(totalPages),
    },
    paperSize: totalPages > 1 ? 'Legal (8.5" x 14")' : 'Letter (8.5" x 11")',
  }

  onOverallProgress(100)
  return { result, totalPages }
}
