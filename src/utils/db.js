/**
 * Dexie.js IndexedDB database for DocTrack
 * Replaces localStorage — unlimited storage, async, no quota errors.
 */
import Dexie from 'dexie'

const db = new Dexie('doctrackDB')

// Schema: documents table keyed by id, with indexes for common lookups
db.version(1).stores({
  documents: 'id, trackingNumber, status, dateReceived',
})

/**
 * Load all documents from IndexedDB.
 * @returns {Promise<Array>} array of document objects
 */
export async function loadAllDocuments() {
  try {
    const docs = await db.documents.toArray()
    return docs.length > 0 ? docs : null
  } catch (err) {
    console.warn('[db] Failed to load from IndexedDB:', err)
    return null
  }
}

/**
 * Save the full documents array to IndexedDB (bulk replace).
 * @param {Array} documents
 */
export async function saveAllDocuments(documents) {
  try {
    await db.documents.clear()
    if (documents.length > 0) {
      await db.documents.bulkPut(documents)
    }
  } catch (err) {
    console.warn('[db] Failed to save to IndexedDB:', err)
  }
}

/**
 * Add a single document to IndexedDB.
 * @param {Object} doc
 */
export async function addDocumentToDB(doc) {
  try {
    await db.documents.put(doc)
  } catch (err) {
    console.warn('[db] Failed to add document:', err)
  }
}

/**
 * Update a single document in IndexedDB.
 * @param {string} docId
 * @param {Object} changes - fields to update
 */
export async function updateDocumentInDB(docId, changes) {
  try {
    await db.documents.update(docId, changes)
  } catch (err) {
    console.warn('[db] Failed to update document:', err)
  }
}

export default db
