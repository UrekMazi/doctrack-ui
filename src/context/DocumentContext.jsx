import { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { loadAllDocuments } from '../utils/db'
import { useAuth } from './AuthContext'

const DocumentContext = createContext()

const API_BASE = '/api'

export function DocumentProvider({ children }) {
  const { authFetch, token } = useAuth()
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)

  const fetchDocuments = useCallback(async () => {
    if (!token) {
      setDocuments([])
      setLoading(false)
      return null
    }
    try {
      const res = await authFetch(`${API_BASE}/documents`)
      if (res.ok) {
        const data = await res.json()
        setDocuments(data.documents)
        return data.documents
      }
      const errorData = await res.json().catch(() => ({}))
      console.error('Failed to fetch documents:', errorData.error || res.statusText)
    } catch (err) {
      console.error('Failed to fetch documents:', err)
    } finally {
      setLoading(false)
    }
    return null
  }, [authFetch, token])

  useEffect(() => {
    if (!token) return
    let isCancelled = false

    const initAndMigrate = async () => {
      // 1. Fetch from backend
      const backendDocs = await fetchDocuments()
      if (isCancelled) return

      // 2. Perform one-time migration from Dexie if data exists
      try {
        const localDocs = await loadAllDocuments()
        if (localDocs && localDocs.length > 0) {
          console.log(`Migrating ${localDocs.length} documents from Dexie to Flask...`)
          
          for (const doc of localDocs) {
            // Check if backend already has this document by tracking number
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
          const { default: db } = await import('../utils/db')
          await db.documents.clear()
          console.log('Dexie local data cleared. Migration to Flask complete.')

          // 4. Refetch fresh from backend
          if (!isCancelled) await fetchDocuments()
        }
      } catch (err) {
        console.warn('Dexie migration checked but no local DB found or it failed:', err)
      }
    }

    initAndMigrate()

    return () => { isCancelled = true }
  }, [token, fetchDocuments, authFetch])

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

      setDocuments(prev => [data.document, ...prev])
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
    setDocuments(prev =>
      prev.map(doc =>
        String(doc.id) === String(docId) || doc.trackingNumber === docId
          ? { ...doc, status: newStatus, ...extras }
          : doc
      )
    )
    
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
