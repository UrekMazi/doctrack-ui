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

function mergeDocumentOptimisticState(localDoc, incomingDoc, isUpdating = false) {
  if (!localDoc) return incomingDoc
  const merged = { ...incomingDoc }
  
  if (Array.isArray(localDoc.replyComments) && Array.isArray(merged.replyComments)) {
    const combined = [...merged.replyComments]
    const incomingIds = new Set(merged.replyComments.map(c => c.id || `${c.roleLabel}-${c.name}-${c.createdAt}`))
    for (const c of localDoc.replyComments) {
      const key = c.id || `${c.roleLabel}-${c.name}-${c.createdAt}`
      if (!incomingIds.has(key)) {
        combined.push(c)
      }
    }
    // Sort combined by createdAt to guarantee order
    combined.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
    merged.replyComments = combined
  }

  if (Array.isArray(localDoc.instructionComments) && Array.isArray(merged.instructionComments)) {
    const combined = [...merged.instructionComments]
    const incomingIds = new Set(merged.instructionComments.map(c => c.id || `${c.roleLabel}-${c.name}-${c.createdAt}`))
    for (const c of localDoc.instructionComments) {
      const key = c.id || `${c.roleLabel}-${c.name}-${c.createdAt}`
      if (!incomingIds.has(key)) {
        combined.push(c)
      }
    }
    combined.sort((a, b) => new Date(a.createdAt || 0) - new Date(b.createdAt || 0))
    merged.instructionComments = combined
  }

  if (isUpdating) {
    // If localDoc has an optimistic update in flight, PRESERVE its scalar fields
    // by overlaying localDoc over the incomingDoc (except for the merged arrays)
    const result = { ...merged, ...localDoc }
    result.replyComments = merged.replyComments
    result.instructionComments = merged.instructionComments
    return result
  }

  return { ...localDoc, ...merged }
}

function setMigrationChecked() {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(DEXIE_MIGRATION_CHECKED_KEY, '1')
  } catch {
    // no-op
  }
}

let globalUpdateQueue = Promise.resolve()

export function DocumentProvider({ children }) {
  const { authFetch, token, user } = useAuth()
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const fetchInFlightRef = useRef(false)
  const fetchQueuedRef = useRef(false)
  const initialBootProfileClosedRef = useRef(false)
  const lastUpdateCompleteRef = useRef(0)
  const updateInProgressRef = useRef(0)
  const updatingDocsRef = useRef(new Set())

  useEffect(() => {
    if (!token) {
      initialBootProfileClosedRef.current = false
    }
  }, [token])

  const fetchDocuments = useCallback(async () => {
    if (fetchInFlightRef.current) {
      fetchQueuedRef.current = true
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
      const fetchInitTime = Date.now()
      const res = await authFetch(`${API_BASE}/documents?_t=${fetchInitTime}`)
      if (res.ok) {
        const data = await res.json()
        
        // Race condition guard: If an update completed AFTER this fetch was initiated,
        // this fetch might contain stale data from the database. Discard it.
        // Also discard if an update is currently in progress.
        if (fetchInitTime < lastUpdateCompleteRef.current || updateInProgressRef.current > 0) {
          console.log('[DocTrack] Discarding stale fetch response (an update completed during fetch, or an update is currently in progress).')
        } else {
          setDocuments(prev => {
            const nextDocs = (data.documents || []).map(fetchedDoc => {
              const localDoc = prev.find(d => String(d.id) === String(fetchedDoc.id) || d.trackingNumber === fetchedDoc.trackingNumber)
              return mergeDocumentOptimisticState(localDoc, fetchedDoc)
            })
            writeDocumentsCache(user, nextDocs)
            return nextDocs
          })
          const docCount = Array.isArray(data.documents) ? data.documents.length : 0
          markFlow('docs:response:ok', { count: docCount })
          markFlow('docs:cache:updated', { count: docCount })
          if (!initialBootProfileClosedRef.current) {
            initialBootProfileClosedRef.current = true
            endFlow('ready', { documents: docCount })
          }
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
      if (fetchQueuedRef.current) {
        fetchQueuedRef.current = false
        fetchDocuments()
      }
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

    let debounceTimerId = null

    const refreshFromRealtime = () => {
      if (debounceTimerId) window.clearTimeout(debounceTimerId)
      debounceTimerId = window.setTimeout(() => {
        fetchDocuments()
      }, 300)
    }

    const connect = () => {
      if (isDisposed || document.visibilityState === 'hidden') return

      const streamUrl = `${API_BASE}/realtime/stream?token=${encodeURIComponent(token)}`
      eventSource = new EventSource(streamUrl)

      eventSource.addEventListener('documents-updated', (e) => {
        try {
          const parsed = JSON.parse(e.data)
          const docPayload = parsed?.document || parsed?.payload?.document
          if (docPayload) {
            const isUpdating = updatingDocsRef.current.has(String(docPayload.id))
            lastUpdateCompleteRef.current = Date.now()
            setDocuments(prev => {
              const idx = prev.findIndex(d => String(d.id) === String(docPayload.id) || d.trackingNumber === docPayload.trackingNumber)
              if (idx >= 0) {
                const nextDocs = [...prev]
                nextDocs[idx] = mergeDocumentOptimisticState(nextDocs[idx], docPayload, isUpdating)
                return nextDocs
              }
              if (!isUpdating) {
                return [docPayload, ...prev]
              }
              return prev
            })
            return // Skip network refetch because we injected it directly!
          }
        } catch {}
        refreshFromRealtime()
      })
      eventSource.onmessage = refreshFromRealtime

      eventSource.onerror = () => {
        if (eventSource) {
          eventSource.close()
          eventSource = null
        }

        if (!isDisposed && document.visibilityState === 'visible') {
          reconnectTimerId = window.setTimeout(connect, 3000)
        }
      }
    }

    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        if (!eventSource) connect()
        fetchDocuments()
      } else {
        if (eventSource) {
          eventSource.close()
          eventSource = null
        }
        if (reconnectTimerId) {
          window.clearTimeout(reconnectTimerId)
          reconnectTimerId = null
        }
      }
    }

    document.addEventListener('visibilitychange', onVisible)
    if (document.visibilityState === 'visible') connect()

    return () => {
      isDisposed = true
      document.removeEventListener('visibilitychange', onVisible)

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
          ? { ...doc, status: newStatus, ...extras, updatedAt: new Date().toISOString() }
          : doc
      )
      writeDocumentsCache(user, nextDocs)
      return nextDocs
    })
    
    const actualDoc = documents.find(d => String(d.id) === String(docId) || d.trackingNumber === docId)
    const backendId = actualDoc ? actualDoc.id : docId

    if (!backendId) return false

    updateInProgressRef.current += 1
    updatingDocsRef.current.add(String(backendId))

    return new Promise((resolve) => {
      globalUpdateQueue = globalUpdateQueue.then(async () => {
        try {
          const res = await authFetch(`${API_BASE}/documents/${backendId}`, {
            method: 'PUT',
            body: JSON.stringify({ status: newStatus, ...extras }),
          })
          if (!res.ok) {
            const errData = await res.json().catch(() => ({}))
            throw new Error(errData.error || 'Failed to update document')
          }
          const data = await res.json()
          lastUpdateCompleteRef.current = Date.now()
          if (data.document) {
            setDocuments(prev => {
              const idx = prev.findIndex(d => String(d.id) === String(data.document.id) || d.trackingNumber === data.document.trackingNumber)
              if (idx >= 0) {
                const nextDocs = [...prev]
                const mergedDoc = mergeDocumentOptimisticState(nextDocs[idx], data.document)
                // Explicitly protect the exact extras payload we just sent
                if (extras.replyComments && Array.isArray(mergedDoc.replyComments)) {
                  if (extras.replyComments.length > mergedDoc.replyComments.length) {
                    mergedDoc.replyComments = extras.replyComments
                  }
                }
                nextDocs[idx] = mergedDoc
                return nextDocs
              }
              return [data.document, ...prev]
            })
          }
          resolve(true)
        } catch (err) {
          console.error('Failed to update document:', err)
          lastUpdateCompleteRef.current = Date.now()
          resolve(false)
        } finally {
          updateInProgressRef.current = Math.max(0, updateInProgressRef.current - 1)
          updatingDocsRef.current.delete(String(backendId))
        }
      })
    })
  }

  const sendChatMessage = async (docId, newCommentObj, fieldName = 'replyComments') => {
    // optimistic update
    setDocuments(prev => {
      const nextDocs = prev.map(doc => {
        if (String(doc.id) === String(docId) || doc.trackingNumber === docId) {
          const existing = Array.isArray(doc[fieldName]) ? doc[fieldName] : []
          if (!existing.find(c => c.id === newCommentObj.id)) {
            return { ...doc, [fieldName]: [...existing, newCommentObj] }
          }
        }
        return doc
      })
      writeDocumentsCache(user, nextDocs)
      return nextDocs
    })

    const actualDoc = documents.find(d => String(d.id) === String(docId) || d.trackingNumber === docId)
    const backendId = actualDoc ? actualDoc.id : docId
    if (!backendId) return false

    try {
      const res = await authFetch(`${API_BASE}/documents/${backendId}`, {
        method: 'PUT',
        body: JSON.stringify({ [fieldName]: [newCommentObj] }),
      })
      if (!res.ok) throw new Error('Failed to send chat message')
      const data = await res.json()
      lastUpdateCompleteRef.current = Date.now()
      if (data.document) {
        setDocuments(prev => {
          const idx = prev.findIndex(d => String(d.id) === String(data.document.id) || d.trackingNumber === data.document.trackingNumber)
          if (idx >= 0) {
            const nextDocs = [...prev]
            nextDocs[idx] = mergeDocumentOptimisticState(nextDocs[idx], data.document)
            return nextDocs
          }
          return [data.document, ...prev]
        })
      }
      return true
    } catch (err) {
      console.error('sendChatMessage error:', err)
      return false
    }
  }

  return (
    <DocumentContext.Provider value={{ documents, addDocument, updateDocumentStatus, sendChatMessage, loading, refreshDocuments: fetchDocuments }}>
      {children}
    </DocumentContext.Provider>
  )
}

export function useDocuments() {
  return useContext(DocumentContext)
}
