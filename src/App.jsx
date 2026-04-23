import { Routes, Route, Navigate } from 'react-router-dom'
import { lazy, Suspense, useEffect, useRef } from 'react'
import { Toaster } from 'react-hot-toast'
import { DocumentProvider } from './context/DocumentContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import {
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
  getRolePrefetchLoaders,
  prefetchLoader,
} from './utils/routePrefetch'

const Dashboard = lazy(importDashboard)
const IncomingCommunications = lazy(importIncomingCommunications)
const OutgoingDocuments = lazy(importOutgoingDocuments)
const DocumentUpload = lazy(importDocumentUpload)
const ScanRegister = lazy(importScanRegister)
const DocumentDetail = lazy(importDocumentDetail)
const TransmittalSlip = lazy(importTransmittalSlip)
const QRScanner = lazy(importQRScanner)
const Tracking = lazy(importTracking)
const Reports = lazy(importReports)
const OPMEndorsed = lazy(importOPMEndorsed)
const DivisionDocuments = lazy(importDivisionDocuments)
const AdminUsers = lazy(importAdminUsers)

function RouteFallback() {
  return (
    <div className="d-flex align-items-center justify-content-center py-5" style={{ minHeight: 280 }}>
      <div className="text-center" style={{ color: '#5f6f86' }}>
        <div className="spinner-border text-primary mb-2" role="status" />
        <div style={{ fontSize: 13, fontWeight: 600 }}>Loading page...</div>
      </div>
    </div>
  )
}

function AppRoutes() {
  const { user, logout, loading } = useAuth()
  const role = user?.role || ''
  const prefetchedRoleRef = useRef('')

  useEffect(() => {
    if (loading || !user) {
      prefetchedRoleRef.current = ''
      return
    }

    if (prefetchedRoleRef.current === role) return
    prefetchedRoleRef.current = role

    const loaders = getRolePrefetchLoaders(role)
    const uniqueLoaders = [...new Set(loaders)]
    const timeoutIds = []

    const scheduleIdle = (callback) => {
      if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
        return window.requestIdleCallback(callback, { timeout: 1200 })
      }
      return setTimeout(() => callback({ didTimeout: false, timeRemaining: () => 0 }), 450)
    }

    const cancelIdle = (idleId) => {
      if (typeof window !== 'undefined' && typeof window.cancelIdleCallback === 'function') {
        window.cancelIdleCallback(idleId)
        return
      }
      clearTimeout(idleId)
    }

    const idleId = scheduleIdle(() => {
      uniqueLoaders.forEach((loader, index) => {
        const timeoutId = setTimeout(() => {
          prefetchLoader(loader)
        }, index * 140)
        timeoutIds.push(timeoutId)
      })
    })

    return () => {
      cancelIdle(idleId)
      timeoutIds.forEach((timeoutId) => clearTimeout(timeoutId))
    }
  }, [loading, role, user])

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #001a4d, #002868)',
      }}>
        <div style={{ textAlign: 'center', color: '#fff' }}>
          <div className="spinner-border text-light mb-3" role="status" />
          <div style={{ fontSize: 14, opacity: 0.8 }}>Loading DocTrack...</div>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <>
        <Toaster
          position="top-right"
          gutter={14}
          containerStyle={{ right: 14, top: 72, bottom: 16 }}
        />
        <Login />
      </>
    )
  }

  // Map backend role names to the existing systemRole names used by the frontend
  const currentUser = {
    ...user,
    systemRole: user.role,
    name: user.fullName,
  }
  const defaultHomeRoute = role === 'OPM Assistant' ? '/opm-assistant' : '/'

  const canAccess = (allowedRoles) => allowedRoles.includes(role)
  const guardRoute = (allowedRoles, element) => (
    canAccess(allowedRoles) ? element : <Navigate to="/" replace />
  )

  return (
    <>
      <Toaster
        position="top-right"
        gutter={14}
        containerStyle={{ right: 14, top: 72, bottom: 16 }}
      />
      <DocumentProvider>
      <Layout currentUser={currentUser} onLogout={logout}>
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            <Route
              path="/"
              element={
                defaultHomeRoute === '/'
                  ? <Dashboard currentUser={currentUser} />
                  : <Navigate to={defaultHomeRoute} replace />
              }
            />
            {/* Operator routes */}
            <Route path="/scan" element={guardRoute(['Operator'], <ScanRegister />)} />
            <Route path="/incoming" element={guardRoute(['Operator'], <IncomingCommunications />)} />
            <Route path="/outgoing" element={guardRoute(['Operator'], <OutgoingDocuments />)} />
            <Route path="/upload" element={guardRoute(['Operator'], <DocumentUpload />)} />
            {/* OPM Assistant + PM routes */}
            <Route path="/opm-assistant" element={guardRoute(['OPM Assistant'], <OPMEndorsed currentUser={currentUser} />)} />
            <Route path="/pm-routing" element={guardRoute(['PM'], <OPMEndorsed currentUser={currentUser} />)} />
            <Route path="/opm-endorsed" element={guardRoute(['PM'], <OPMEndorsed currentUser={currentUser} />)} />
            {/* Division route */}
            <Route path="/division-documents" element={guardRoute(['Division'], <DivisionDocuments currentUser={currentUser} />)} />
            {/* Admin route */}
            <Route path="/admin/users" element={guardRoute(['Admin'], <AdminUsers />)} />
            {/* Shared routes */}
            <Route path="/document/:id" element={<DocumentDetail currentUser={currentUser} />} />
            <Route path="/transmittal/:id" element={guardRoute(['Operator', 'PM'], <TransmittalSlip />)} />
            <Route path="/qr-scanner" element={guardRoute(['Operator'], <QRScanner />)} />
            <Route path="/tracking" element={<Tracking />} />
            <Route path="/reports" element={guardRoute(['Operator', 'PM', 'Admin'], <Reports />)} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </Layout>
      </DocumentProvider>
    </>
  )
}

function App() {
  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  )
}

export default App
