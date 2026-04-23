import { getStatusDisplayLabel } from '../utils/workflowLabels'

export default function StatusBadge({ status, compact = false }) {
  const statusKey = String(status || '').trim()
  const displayStatus = getStatusDisplayLabel(statusKey)
  const compactDisplayMap = {
    'Endorsed to OPM (Office of the Port Manager)': 'Endorsed to OPM',
    'Under PM Review/Evaluation': 'Under PM Review',
  }
  const resolvedDisplayStatus = compact
    ? (compactDisplayMap[displayStatus] || displayStatus)
    : displayStatus

  const classMap = {
    'Registered': 'status-received',
    'For OPM Assistant Review': 'status-processing',
    'Endorsed to OPM': 'status-processing',
    'Routed to Division': 'status-routing',
    'Endorsed to OPM (Office of the Port Manager)': 'status-processing',
    'Under PM Review/Evaluation': 'status-processing',
    'Routed to RC/s Concerned': 'status-routing',
    'Received & Acknowledged': 'status-completed',
    'Pending': 'status-pending',
    'Released': 'status-released',
    'Completed': 'status-completed',
  }

  const iconMap = {
    'Registered': 'bi-check-circle',
    'For OPM Assistant Review': 'bi-person-check',
    'Endorsed to OPM': 'bi-send',
    'Routed to Division': 'bi-arrow-right-circle',
    'Endorsed to OPM (Office of the Port Manager)': 'bi-send',
    'Under PM Review/Evaluation': 'bi-person-check',
    'Routed to RC/s Concerned': 'bi-arrow-right-circle',
    'Received & Acknowledged': 'bi-check-circle-fill',
    'Pending': 'bi-clock',
    'Released': 'bi-box-arrow-up-right',
    'Completed': 'bi-check-circle-fill',
  }

  const cssClass = classMap[statusKey] || classMap[displayStatus] || 'status-pending'
  const icon = iconMap[statusKey] || iconMap[displayStatus] || 'bi-circle'

  return (
    <span className={`status-badge ${cssClass}`}>
      <i className={`bi ${icon}`}></i>
      <span className="status-badge-label" title={displayStatus}>{resolvedDisplayStatus}</span>
    </span>
  )
}
