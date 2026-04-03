export default function StatusBadge({ status }) {
  const classMap = {
    'Registered': 'status-received',
    'For OPM Assistant Review': 'status-processing',
    'Endorsed to OPM': 'status-processing',
    'Routed to Division': 'status-routing',
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
    'Received & Acknowledged': 'bi-check-circle-fill',
    'Pending': 'bi-clock',
    'Released': 'bi-box-arrow-up-right',
    'Completed': 'bi-check-circle-fill',
  }

  const cssClass = classMap[status] || 'status-pending'
  const icon = iconMap[status] || 'bi-circle'

  return (
    <span className={`status-badge ${cssClass}`}>
      <i className={`bi ${icon}`}></i>
      {status}
    </span>
  )
}
