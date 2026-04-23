const importDashboard = () => import('../pages/Dashboard')
const importIncomingCommunications = () => import('../pages/IncomingCommunications')
const importOutgoingDocuments = () => import('../pages/OutgoingDocuments')
const importDocumentUpload = () => import('../pages/DocumentUpload')
const importScanRegister = () => import('../pages/ScanRegister')
const importDocumentDetail = () => import('../pages/DocumentDetail')
const importTransmittalSlip = () => import('../pages/TransmittalSlip')
const importQRScanner = () => import('../pages/QRScanner')
const importTracking = () => import('../pages/Tracking')
const importReports = () => import('../pages/Reports')
const importOPMEndorsed = () => import('../pages/OPMEndorsed')
const importDivisionDocuments = () => import('../pages/DivisionDocuments')
const importAdminUsers = () => import('../pages/AdminUsers')

const ROUTE_LOADERS = {
  '/': [importDashboard],
  '/scan': [importScanRegister],
  '/incoming': [importIncomingCommunications],
  '/outgoing': [importOutgoingDocuments],
  '/upload': [importDocumentUpload],
  '/opm-assistant': [importOPMEndorsed],
  '/pm-routing': [importOPMEndorsed],
  '/opm-endorsed': [importOPMEndorsed],
  '/division-documents': [importDivisionDocuments],
  '/admin/users': [importAdminUsers],
  '/qr-scanner': [importQRScanner],
  '/tracking': [importTracking],
  '/reports': [importReports],
}

const PREFIX_ROUTE_LOADERS = [
  ['/document/', [importDocumentDetail]],
  ['/transmittal/', [importTransmittalSlip]],
]

const ROLE_PREFETCH_LOADERS = {
  Operator: [importDashboard, importIncomingCommunications, importDocumentDetail, importScanRegister],
  'OPM Assistant': [importOPMEndorsed, importDocumentDetail, importTracking],
  PM: [importOPMEndorsed, importDocumentDetail, importReports],
  Division: [importDivisionDocuments, importDocumentDetail, importTracking],
  Admin: [importAdminUsers, importReports, importTracking],
}

const prefetchedLoaderFns = new WeakSet()

export {
  importDashboard,
  importIncomingCommunications,
  importOutgoingDocuments,
  importDocumentUpload,
  importScanRegister,
  importDocumentDetail,
  importTransmittalSlip,
  importQRScanner,
  importTracking,
  importReports,
  importOPMEndorsed,
  importDivisionDocuments,
  importAdminUsers,
}

export function getRolePrefetchLoaders(role) {
  return ROLE_PREFETCH_LOADERS[role] || [importDashboard, importTracking]
}

export function prefetchLoader(loader) {
  if (typeof loader !== 'function') return
  if (prefetchedLoaderFns.has(loader)) return

  prefetchedLoaderFns.add(loader)
  loader().catch(() => {})
}

export function prefetchLoaders(loaders) {
  const uniqueLoaders = [...new Set(loaders || [])]
  uniqueLoaders.forEach((loader) => prefetchLoader(loader))
}

export function getLoadersForRoute(path) {
  const safePath = String(path || '').trim()
  if (!safePath) return []

  if (ROUTE_LOADERS[safePath]) {
    return ROUTE_LOADERS[safePath]
  }

  const prefixMatch = PREFIX_ROUTE_LOADERS.find(([prefix]) => safePath.startsWith(prefix))
  return prefixMatch ? prefixMatch[1] : []
}

export function prefetchRoute(path) {
  prefetchLoaders(getLoadersForRoute(path))
}
