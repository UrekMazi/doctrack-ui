import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react'
import db, { loadAllDocuments } from '../utils/db'
import { useAuth } from './AuthContext'
import { markFlow, endFlow } from '../utils/perfTrace'

const DocumentContext = createContext()

const API_BASE = '/api'
const DEXIE_MIGRATION_CHECKED_KEY = 'doctrack_dexie_migration_checked_v1'

function getDocumentsCacheKey(user) {
  const identity = user?.username || user?.id || 'anon'
  return `doctrack_docs_cache_v1_${identity}`
}

function readDocumentsCache(user) {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(getDocumentsCacheKey(user))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

function writeDocumentsCache(user, documents) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem(getDocumentsCacheKey(user), JSON.stringify(Array.isArray(documents) ? documents : []))
  } catch {
    // no-op
  }
}

function hasMigrationBeenChecked() {
  if (typeof window === 'undefined') return false
  try {
    return localStorage.getItem(DEXIE_MIGRATION_CHECKED_KEY) === '1'
  } catch {
    return false
  }
}

function setMigrationChecked() {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(DEXIE_MIGRATION_CHECKED_KEY, '1')
  } catch {
    // no-op
  }
}

export function DocumentProvider({ children }) {
  const { authFetch, token, user } = useAuth()
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const fetchInFlightRef = useRef(false)
  const lastRealtimeRefreshAtRef = useRef(0)
  const initialBootProfileClosedRef = useRef(false)

  useEffect(() => {
    if (!token) {
      initialBootProfileClosedRef.current = false
    }
  }, [token])

  const fetchDocuments = useCallback(async () => {
    if (fetchInFlightRef.current) {
      markFlow('docs:request:skipped-in-flight')
      return null
    }

    fetchInFlightRef.current = true

    if (!token) {
      setDocuments([])
      setLoading(false)
      fetchInFlightRef.current = false
      markFlow('docs:request:skipped-no-token')
      return null
    }
    try {
      markFlow('docs:request:start')
      const res = await authFetch(`${API_BASE}/documents`)
      if (res.ok) {
        const data = await res.json()
        setDocuments(data.documents)
        const docCount = Array.isArray(data.documents) ? data.documents.length : 0
        writeDocumentsCache(user, data.documents)
        markFlow('docs:response:ok', { count: docCount })
        markFlow('docs:cache:updated', { count: docCount })
        if (!initialBootProfileClosedRef.current) {
          initialBootProfileClosedRef.current = true
          endFlow('ready', { documents: docCount })
        }
        return data.documents
      }
      markFlow('docs:response:error', { status: res.status })
      const errorData = await res.json().catch(() => ({}))
      console.error('Failed to fetch documents:', errorData.error || res.statusText)
    } catch (err) {
      markFlow('docs:request:exception', { message: err?.message || 'unknown' })
      console.error('Failed to fetch documents:', err)
    } finally {
      setLoading(false)
      fetchInFlightRef.current = false
      markFlow('docs:request:finish')
    }
    return null
  }, [authFetch, token, user])

  useEffect(() => {
    if (!token) return
    let isCancelled = false

    const initAndMigrate = async () => {
      const cachedDocs = readDocumentsCache(user)
      if (cachedDocs && cachedDocs.length > 0) {
        setDocuments(cachedDocs)
        setLoading(false)
        markFlow('docs:cache:hydrated', { count: cachedDocs.length })
        if (!initialBootProfileClosedRef.current) {
          initialBootProfileClosedRef.current = true
          endFlow('ready-cached', { documents: cachedDocs.length })
        }
      } else {
        markFlow('docs:cache:empty')
      }

      // 1. Fetch from backend
      const backendDocs = await fetchDocuments()
      markFlow('docs:init:fetched')
      if (isCancelled) return

      if (hasMigrationBeenChecked()) {
        markFlow('docs:migration:skip-checked')
        return
      }

      // 2. Perform one-time migration from Dexie if data exists
      try {
        const localDocs = await loadAllDocuments()
        if (localDocs && localDocs.length > 0) {
          markFlow('docs:migration:start', { count: localDocs.length })
          console.log(`Migrating ${localDocs.length} documents from Dexie to Flask...`)
          
          for (const doc of localDocs) {
            // Check if backend already has this document by control/reference number
            const exists = backendDocs?.find(bd => bd.trackingNumber === doc.trackingNumber)
            
            if (exists) {
              // Update existing backend doc to inject all the rich local fields into extra_data
              await authFetch(`${API_BASE}/documents/${exists.id}`, {
                method: 'PUT',
                body: JSON.stringify(doc)
              })
            } else {
              // Create new backend doc
              await authFetch(`${API_BASE}/documents`, {
                method: 'POST',
                body: JSON.stringify(doc)
              })
            }
          }

          // 3. Clear Dexie database so migration never runs again
          await db.documents.clear()
          console.log('Dexie local data cleared. Migration to Flask complete.')

          // 4. Refetch fresh from backend
          if (!isCancelled) await fetchDocuments()
          markFlow('docs:migration:done')
          setMigrationChecked()
        } else {
          setMigrationChecked()
          markFlow('docs:migration:skip')
        }
      } catch (err) {
        markFlow('docs:migration:error', { message: err?.message || 'unknown' })
        console.warn('Dexie migration checked but no local DB found or it failed:', err)
      }
    }

    initAndMigrate()

    return () => { isCancelled = true }
  }, [token, user, fetchDocuments, authFetch])

  useEffect(() => {
    if (!token) return
    if (typeof window === 'undefined' || typeof window.EventSource === 'undefined') return

    let eventSource = null
    let reconnectTimerId = null
    let isDisposed = false

    const refreshFromRealtime = () => {
      const now = Date.now()
      if (now - lastRealtimeRefreshAtRef.current < 900) return
      lastRealtimeRefreshAtRef.current = now
      fetchDocuments()
    }

    const connect = () => {
      if (isDisposed) return

      const streamUrl = `${API_BASE}/realtime/stream?token=${encodeURIComponent(token)}`
      eventSource = new EventSource(streamUrl)

      eventSource.addEventListener('documents-updated', refreshFromRealtime)
      eventSource.onmessage = refreshFromRealtime

      eventSource.onerror = () => {
        if (eventSource) {
          eventSource.close()
          eventSource = null
        }

        if (!isDisposed) {
          reconnectTimerId = window.setTimeout(connect, 3000)
        }
      }
    }

    connect()

    return () => {
      isDisposed = true

      if (reconnectTimerId) {
        window.clearTimeout(reconnectTimerId)
      }

      if (eventSource) {
        eventSource.close()
      }
    }
  }, [token, fetchDocuments])

  useEffect(() => {
    if (!token) return

    const intervalMs = 20000

    const refreshIfVisible = () => {
      if (document.visibilityState === 'hidden') return
      fetchDocuments()
    }

    const pollId = window.setInterval(refreshIfVisible, intervalMs)
    const onFocus = () => fetchDocuments()
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        fetchDocuments()
      }
    }

    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.clearInterval(pollId)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [token, fetchDocuments])

  const addDocument = async (doc) => {
    try {
      const res = await authFetch(`${API_BASE}/documents`, {
        method: 'POST',
        body: JSON.stringify(doc),
      })
      const responseText = await res.text()
      let data = {}
      try {
        data = responseText ? JSON.parse(responseText) : {}
      } catch {
        data = {}
      }

      if (!res.ok) {
        const error = new Error(data.error || `Failed to save document (HTTP ${res.status})`)
        error.details = {
          status: res.status,
          statusText: res.statusText,
          responseBody: responseText,
          responseJson: data,
        }
        throw error
      }

      if (!data.document) {
        const error = new Error('Save request succeeded but response document is missing')
        error.details = {
          status: res.status,
          statusText: res.statusText,
          responseBody: responseText,
          responseJson: data,
        }
        throw error
      }

      setDocuments(prev => {
        const nextDocs = [data.document, ...prev]
        writeDocumentsCache(user, nextDocs)
        return nextDocs
      })
      return data.document
    } catch (err) {
      console.error('Failed to add document:', {
        errorMessage: err?.message,
        errorStack: err?.stack,
        errorDetails: err?.details || null,
        trackingNumber: doc?.trackingNumber,
        payload: doc,
      })
      throw err
    }
  }

  const updateDocumentStatus = async (docId, newStatus, extras = {}) => {
    // optimistic update
    setDocuments(prev => {
      const nextDocs = prev.map(doc =>
        String(doc.id) === String(docId) || doc.trackingNumber === docId
          ? { ...doc, status: newStatus, ...extras }
          : doc
      )
      writeDocumentsCache(user, nextDocs)
      return nextDocs
    })
    
    const actualDoc = documents.find(d => String(d.id) === String(docId) || d.trackingNumber === docId)
    const backendId = actualDoc ? actualDoc.id : docId

    try {
      const res = await authFetch(`${API_BASE}/documents/${backendId}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus, ...extras }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'Failed to update document')
      }
      // Refetch to cleanly get any extra_data updates
      await fetchDocuments()
      return true
    } catch (err) {
      console.error('Failed to update document:', err)
      await fetchDocuments()
      return false
    }
  }

  return (
    <DocumentContext.Provider value={{ documents, addDocument, updateDocumentStatus, loading, refreshDocuments: fetchDocuments }}>
      {children}
    </DocumentContext.Provider>
  )
}

export function useDocuments() {
  return useContext(DocumentContext)
}
