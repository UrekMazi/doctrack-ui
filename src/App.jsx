import { Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import { DocumentProvider } from './context/DocumentContext'
import { AuthProvider, useAuth } from './context/AuthContext'
import Layout from './components/Layout'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import IncomingCommunications from './pages/IncomingCommunications'
import OutgoingDocuments from './pages/OutgoingDocuments'
import DocumentUpload from './pages/DocumentUpload'
import ScanRegister from './pages/ScanRegister'
import DocumentDetail from './pages/DocumentDetail'
import TransmittalSlip from './pages/TransmittalSlip'
import QRScanner from './pages/QRScanner'
import Tracking from './pages/Tracking'
import Reports from './pages/Reports'
import OPMEndorsed from './pages/OPMEndorsed'
import DivisionDocuments from './pages/DivisionDocuments'
import AdminUsers from './pages/AdminUsers'

function AppRoutes() {
  const { user, logout, loading } = useAuth()

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
        <Toaster position="top-right" />
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
  const role = currentUser.systemRole

  const canAccess = (allowedRoles) => allowedRoles.includes(role)
  const guardRoute = (allowedRoles, element) => (
    canAccess(allowedRoles) ? element : <Navigate to="/" replace />
  )

  return (
    <>
      <Toaster position="top-right" />
      <DocumentProvider>
      <Layout currentUser={currentUser} onLogout={logout}>
        <Routes>
          <Route path="/" element={<Dashboard currentUser={currentUser} />} />
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
