import React from 'react'

export default function RoutedTaskSummary({ summary }) {
  return (
    <div className="records-summary-box">
      <div className="records-summary-box-title">Routed Task Summary</div>

      <div className="records-summary-grid">
        <div className="records-summary-cell">
          <div className="records-summary-label">Total:</div>
          <div className="records-summary-value">{summary.total}</div>
        </div>
        <div className="records-summary-cell">
          <div className="records-summary-label">Completed:</div>
          <div className="records-summary-value">{summary.completed}</div>
        </div>
        <div className="records-summary-cell">
          <div className="records-summary-label">WIP:</div>
          <div className="records-summary-value">{summary.wip}</div>
        </div>
        <div className="records-summary-cell">
          <div className="records-summary-label">Overdue:</div>
          <div className="records-summary-value is-danger">{summary.overdue}</div>
        </div>
      </div>

      <div className="records-summary-footnote">
        <span>WIP from previous months:</span>
        <strong>{summary.wipPrev}</strong>
      </div>
    </div>
  )
}
