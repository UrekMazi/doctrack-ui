/**
 * Division / RC summary table — shows WIP, Completed, Overdue, Total
 * per division (Main OPR only).
 *
 * @param {{ data: Array<{ division: string, wip: number, completed: number, overdue: number, total: number }> }} props
 */
export default function DivisionSummaryTable({ data = [] }) {
  if (!data.length) return null

  const totals = data.reduce(
    (acc, row) => ({
      wip: acc.wip + row.wip,
      completed: acc.completed + row.completed,
      overdue: acc.overdue + row.overdue,
      total: acc.total + row.total,
    }),
    { wip: 0, completed: 0, overdue: 0, total: 0 }
  )

  return (
    <div className="records-summary-box division-summary-table-box">
      <div className="records-summary-box-title">Division / RCs Summary</div>
      <div className="division-summary-scroll">
        <table className="division-summary-table">
          <thead>
            <tr>
              <th className="division-summary-th-name">DIVISIONS/RCs</th>
              <th className="division-summary-th-num">WIP</th>
              <th className="division-summary-th-num">Completed</th>
              <th className="division-summary-th-num">Overdue</th>
              <th className="division-summary-th-num">Total</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.division} className={row.overdue > 0 ? 'has-overdue' : ''}>
                <td className="division-summary-name">{row.division}</td>
                <td className="division-summary-num">{row.wip}</td>
                <td className="division-summary-num">{row.completed}</td>
                <td className="division-summary-num division-summary-overdue">{row.overdue}</td>
                <td className="division-summary-num division-summary-total">{row.total}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className="division-summary-name division-summary-footer-label">TOTAL</td>
              <td className="division-summary-num division-summary-footer-val">{totals.wip}</td>
              <td className="division-summary-num division-summary-footer-val">{totals.completed}</td>
              <td className="division-summary-num division-summary-footer-val division-summary-overdue">{totals.overdue}</td>
              <td className="division-summary-num division-summary-footer-val division-summary-total">{totals.total}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  )
}
