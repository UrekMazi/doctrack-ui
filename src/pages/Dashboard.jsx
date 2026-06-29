import RecordsDashboard from '../components/RecordsDashboard'
import OPMDashboard from '../components/OPMDashboard'
import PMDashboard from '../components/PMDashboard'
import OICDashboard from '../components/OICDashboard'
import DivisionDashboard from '../components/DivisionDashboard'
import { useDocuments } from '../context/DocumentContext'
import { WORKFLOW_STATUS, OPM_ROLE_DISPLAY, isOpmRole, isPMRole, normalizeRole } from '../utils/workflowLabels'

const formatDateInManila = (dateInput) => {
  const date = dateInput instanceof Date ? dateInput : new Date(dateInput)
  if (Number.isNaN(date.getTime())) return ''

  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  const parts = formatter.formatToParts(date)
  const year = parts.find(p => p.type === 'year')?.value
  const month = parts.find(p => p.type === 'month')?.value
  const day = parts.find(p => p.type === 'day')?.value
  return year && month && day ? `${year}-${month}-${day}` : ''
}

const getOperationalDate = (doc) => {
  if (typeof doc?.createdAt === 'string' && doc.createdAt.trim()) {
    return formatDateInManila(doc.createdAt)
  }
  if (typeof doc?.dateReceived === 'string' && doc.dateReceived.trim()) {
    return doc.dateReceived.slice(0, 10)
  }
  return ''
}
export default function Dashboard({ currentUser }) {
  const { documents } = useDocuments()
  const role = normalizeRole(currentUser?.systemRole || currentUser?.role || 'Operator')
  const isOpm = isOpmRole(role)
  const todayKey = formatDateInManila(new Date())
  const dailyDocuments = documents.filter(doc => getOperationalDate(doc) === todayKey)

  // Division documents are now handled inside DivisionDashboard
  const roleLabels = {
    Operator: { title: 'Operator Dashboard', desc: 'Records Section — Scan, Register & Endorse documents' },
    'OPM Secretary': { title: `${OPM_ROLE_DISPLAY} Dashboard`, desc: 'Initial OPM review and verification before forwarding to PM.' },
    PM: { title: 'PM Dashboard', desc: 'Port Manager — Route endorsed documents to divisions' },
    Division: { title: 'Division Dashboard', desc: `${currentUser?.division || 'Division'} — Receive & acknowledge routed documents` },
  }

  return (
    <div className="dashboard-page">
      <div className="page-header dashboard-header">
        <h4>{roleLabels[role]?.title || 'Dashboard'}</h4>
        <p>{roleLabels[role]?.desc || 'Overview'}</p>
      </div>

      {/* OPERATOR Dashboard - Reworked Records view */}
      {role === 'Operator' && (
        <RecordsDashboard documents={documents} currentUser={currentUser} />
      )}

      {/* OPM Secretary Dashboard — full Kanban layout */}
      {isOpm && (
        <OPMDashboard documents={documents} />
      )}

      {/* PM Dashboard — full Kanban layout */}
      {role === 'PM' && (
        <PMDashboard documents={documents} />
      )}

      {/* OIC Dashboard */}
      {role === 'OIC' && (
        <OICDashboard documents={documents.filter(doc => doc.targetDivision === 'Officer-in-Charge (OIC)' || doc.currentLocation === 'Officer-in-Charge (OIC)' || doc.targetDivision === 'OIC')} />
      )}

      {/* DIVISION Dashboard */}
      {role === 'Division' && (
        <DivisionDashboard documents={documents} currentUser={currentUser} />
      )}
    </div>
  )
}
