import React from 'react'
import StatusBadge from './StatusBadge'

const formatDate = (value) => {
  if (!value) return '--'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '--'

  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Manila',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date)
}

export default function TaskMonitoringTable({ rows }) {
  return (
    <div className="records-monitor-sheet">
      <div className="records-monitor-title">TASK MONITORING</div>

      <div className="table-responsive records-monitor-scroll">
        <table className="table records-monitor-table mb-0">
          <thead>
            <tr>
              <th className="records-monitor-th-main">Control No.</th>
              <th className="records-monitor-th-main">Division</th>
              <th>Status</th>
              <th>Date Routed</th>
              <th>Date Completed</th>
              <th>Days Elapsed</th>
              <th>Due Date</th>
              <th>Overdue</th>
              <th>Overdue Days</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={9} className="records-monitor-empty">No routed tasks yet.</td>
              </tr>
            ) : rows.map((row) => (
              <tr key={row.id} className={row.isOverdue ? 'is-overdue' : row.dateCompleted ? 'is-completed' : ''}>
                <td className="records-monitor-control">{row.trackingNumber}</td>
                <td className="records-monitor-division" title={row.division}>{row.division || '--'}</td>
                <td><StatusBadge status={row.statusDetail || row.status} compact /></td>
                <td>{formatDate(row.dateRouted)}</td>
                <td>{row.dateCompleted ? formatDate(row.dateCompleted) : ''}</td>
                <td>{typeof row.daysElapsed === 'number' ? row.daysElapsed : ''}</td>
                <td>{row.dueDate ? formatDate(row.dueDate) : '--'}</td>
                <td>{row.isOverdue ? 'Yes' : ''}</td>
                <td>{row.isOverdue && typeof row.overdueDays === 'number' ? row.overdueDays : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
