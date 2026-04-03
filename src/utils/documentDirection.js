export function inferDocumentDirection(doc = {}) {
  if (doc.direction === 'Incoming' || doc.direction === 'Outgoing') {
    return doc.direction
  }

  const hasOutgoingSignals = Boolean(
    doc.recipient ||
    doc.originDivision ||
    doc.dateReleased ||
    doc.timeReleased ||
    doc.releasedBy
  )

  return hasOutgoingSignals ? 'Outgoing' : 'Incoming'
}

export function isIncomingDocument(doc = {}) {
  return inferDocumentDirection(doc) === 'Incoming'
}
