import { useMemo } from 'react'
import RecordsKanban from './RecordsKanban'
import RoutedTaskSummary from './RoutedTaskSummary'
import DivisionSummaryTable from './DivisionSummaryTable'
import TaskMonitoringTable from './TaskMonitoringTable'
import StatusOverviewChart from './StatusOverviewChart'
import { WORKFLOW_STATUS, getStatusDisplayLabel, isOpmInitialReviewStatus } from '../utils/workflowLabels'

const DAY_MS = 24 * 60 * 60 * 1000

const normalizeText = (value) => String(value || '').trim().toLowerCase()

const formatMonthKey = (value) => {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return ''

  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
  }).formatToParts(date)

  const year = parts.find((part) => part.type === 'year')?.value || ''
  const month = parts.find((part) => part.type === 'month')?.value || ''
  return year && month ? `${year}-${month}` : ''
}

const getHistoryEntries = (doc) => (Array.isArray(doc?.routingHistory) ? doc.routingHistory : [])

const getHistoryText = (doc) => getHistoryEntries(doc)
  .map((entry) => `${entry?.office || ''} ${entry?.action || ''}`.trim())
  .join(' | ')
  .toLowerCase()

const parseTimestamp = (value) => {
  if (!value) return 0
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

const parseStepTimestamp = (entry) => {
  if (!entry) return 0

  const direct = parseTimestamp(entry.createdAt || entry.timestamp || '')
  if (direct) return direct

  const dateText = String(entry.date || '').trim()
  const timeText = String(entry.time || '').trim()
  if (dateText && timeText) {
    const combined = new Date(`${dateText} ${timeText}`)
    if (!Number.isNaN(combined.getTime())) return combined.getTime()
  }

  if (dateText) {
    const fallback = new Date(dateText)
    if (!Number.isNaN(fallback.getTime())) return fallback.getTime()
  }

  return 0
}

const getRouteTimestamp = (doc) => {
  const history = getHistoryEntries(doc)
  const historyText = getHistoryText(doc)
  const routeEntry = [...history].reverse().find((entry) => (
    /released to divisions|routed to rc\/s concerned|re-routed by opm|finalized by opm secretary|routed by pm|opm outgoing review|endorsed to opm/i.test(`${entry?.action || ''} ${entry?.office || ''}`)
      || historyText.includes('released to divisions')
  ))

  return (
    parseStepTimestamp(routeEntry)
    || parseTimestamp(doc?.assignedAt)
    || parseTimestamp(doc?.updatedAt)
    || parseTimestamp(doc?.createdAt)
    || parseTimestamp(doc?.dateReceived)
  )
}

const getCompletionTimestamp = (doc) => {
  if (doc?.completedAt) return parseTimestamp(doc.completedAt)

  const history = getHistoryEntries(doc)
  const completionEntry = [...history].reverse().find((entry) => /task completed|received\s*&\s*acknowledged|acknowledged|completed/i.test(String(entry?.action || '')))
  return parseStepTimestamp(completionEntry) || parseTimestamp(doc?.updatedAt)
}

const isCompletedDoc = (doc) => {
  const status = normalizeText(doc?.status)
  return status === 'received & acknowledged' || status === 'completed'
}

/* Classify documents into Kanban lanes — OPM/PM pipeline (no "registered" lane) */
const getLaneKey = (doc) => {
  const status = normalizeText(doc?.status)
  const historyText = getHistoryText(doc)

  if (isCompletedDoc(doc)) return 'completed'
  if (status === normalizeText(WORKFLOW_STATUS.ROUTED_CONCERNED) || status === normalizeText(WORKFLOW_STATUS.REROUTED) || /released to divisions|routed to rc\/s concerned|re-routed by opm/i.test(historyText)) {
    return 'assigned'
  }
  if (status === normalizeText(WORKFLOW_STATUS.PENDING_OPM_FINALIZATION) || /opm outgoing review|routed by pm/i.test(historyText)) {
    return 'outgoing'
  }
  if (status === normalizeText(WORKFLOW_STATUS.PM_REVIEW) || /endorsed to opm/i.test(historyText)) {
    return 'under-review'
  }
  if (isOpmInitialReviewStatus(doc?.status)) {
    return 'endorsed'
  }
  // Documents still at "Registered" status don't appear in the OPM/PM pipeline
  return null
}

const isDivisionRoutedDoc = (doc) => {
  const laneKey = getLaneKey(doc)
  return laneKey === 'assigned' || laneKey === 'completed'
}

const getDivisionLabel = (doc) => {
  const divisions = Array.isArray(doc?.targetDivisions) ? doc.targetDivisions.filter(Boolean) : []
  return (
    doc?.oprDivision
    || doc?.mainDivision
    || doc?.targetDivision
    || divisions[0]
    || doc?.senderAddress
    || 'Unassigned'
  )
}

const getSortTimestamp = (doc) => {
  const laneKey = getLaneKey(doc)
  if (laneKey === 'completed') return getCompletionTimestamp(doc) || getRouteTimestamp(doc)
  return getRouteTimestamp(doc) || parseTimestamp(doc?.updatedAt) || parseTimestamp(doc?.createdAt)
}

/**
 * Shared Kanban-style dashboard for OPM Secretary and PM roles.
 *
 * @param {Object}  props
 * @param {Array}   props.documents  — full document list from context
 * @param {string}  props.title      — dashboard title (e.g. "OPM Secretary Dashboard")
 * @param {string}  [props.accent]   — CSS accent color for the title strip
 */
export default function WorkflowDashboard({ documents = [], title = 'Workflow Dashboard', accent, dashboardType = 'PM' }) {
  const dashboardView = useMemo(() => {
    const docs = Array.isArray(documents) ? documents : []
    const currentMonthKey = formatMonthKey(new Date())

    const enrichedDocs = docs
      .map((doc) => {
        const laneKey = getLaneKey(doc)
        if (!laneKey) return null // skip "Registered" — not in OPM/PM pipeline

        const routeTimestamp = getRouteTimestamp(doc)
        const completionTimestamp = getCompletionTimestamp(doc)
        const divisionLabel = getDivisionLabel(doc)
        const dueDateTimestamp = parseTimestamp(doc?.dueDate)
        const isCompleted = isCompletedDoc(doc)
        const isRouted = isDivisionRoutedDoc(doc)
        const resolvedTimestamp = laneKey === 'completed' ? (completionTimestamp || routeTimestamp) : routeTimestamp
        const daysElapsed = routeTimestamp ? Math.max(0, Math.floor(((isCompleted ? resolvedTimestamp || routeTimestamp : Date.now()) - routeTimestamp) / DAY_MS)) : null
        const isOverdue = Boolean(!isCompleted && dueDateTimestamp && isRouted && Date.now() > dueDateTimestamp)
        const overdueDays = isOverdue ? Math.max(0, Math.floor((Date.now() - dueDateTimestamp) / DAY_MS)) : null

        return {
          ...doc,
          laneKey,
          divisionLabel,
          routeTimestamp,
          completionTimestamp,
          dueDateTimestamp,
          isCompleted,
          isRouted,
          daysElapsed,
          isOverdue,
          overdueDays,
          sortTimestamp: getSortTimestamp(doc),
        }
      })
      .filter(Boolean)

    /* ---- Kanban lanes (5 stages matching the image) ---- */
    const laneDefinitions = [
      { id: 'endorsed', title: 'Endorsed to OPM', subtitle: 'Initial OPM review', accent: '#7c5cff' },
      { id: 'under-review', title: `Under ${dashboardType} Review/Evaluation`, subtitle: `${dashboardType} evaluating document`, accent: '#f59e0b' },
      { id: 'outgoing', title: 'OPM Outgoing Review', subtitle: 'Pending OPM finalization', accent: '#0ea5e9' },
      { id: 'assigned', title: 'Assigned / WIP', subtitle: 'Routed to divisions', accent: '#d97706' },
      { id: 'completed', title: 'Completed', subtitle: 'Received & acknowledged', accent: '#16a34a' },
    ]

    const lanes = laneDefinitions.map((lane) => ({
      ...lane,
      items: enrichedDocs
        .filter((doc) => doc.laneKey === lane.id)
        .sort((a, b) => b.sortTimestamp - a.sortTimestamp)
        .slice(0, 4),
    }))

    /* ---- Routed Task Summary (division-routed docs only) ---- */
    const routedDocs = enrichedDocs.filter((doc) => doc.isRouted)
    const total = routedDocs.length
    const completed = routedDocs.filter((doc) => doc.isCompleted).length
    const wip = routedDocs.length - completed
    const wipPrev = routedDocs.filter((doc) => !doc.isCompleted && doc.routeTimestamp && formatMonthKey(doc.routeTimestamp) < currentMonthKey).length
    const overdue = routedDocs.filter((doc) => doc.isOverdue).length

    /* ---- Task Monitoring table rows ---- */
    const summaryRows = routedDocs
      .slice()
      .sort((a, b) => b.sortTimestamp - a.sortTimestamp)
      .map((doc) => ({
        id: doc.id,
        trackingNumber: doc.trackingNumber,
        division: doc.divisionLabel,
        status: doc.isCompleted ? 'Completed' : 'WIP',
        statusDetail: getStatusDisplayLabel(doc.status),
        dateRouted: doc.routeTimestamp ? new Date(doc.routeTimestamp).toISOString() : '',
        dateCompleted: doc.isCompleted && doc.completionTimestamp ? new Date(doc.completionTimestamp).toISOString() : '',
        daysElapsed: doc.daysElapsed,
        dueDate: doc.dueDateTimestamp ? new Date(doc.dueDateTimestamp).toISOString() : '',
        isOverdue: doc.isOverdue,
        overdueDays: doc.overdueDays,
      }))

    /* ---- Status Overview chart data (by division) ---- */
    const divisionMap = new Map()
    routedDocs.forEach((doc) => {
      const key = doc.divisionLabel
      const current = divisionMap.get(key) || { division: key, wip: 0, completed: 0, overdue: 0, total: 0 }
      current.total += 1
      if (doc.isCompleted) current.completed += 1
      else current.wip += 1
      if (doc.isOverdue) current.overdue += 1
      divisionMap.set(key, current)
    })

    const divisionOverview = Array.from(divisionMap.values()).sort((a, b) => b.total - a.total)

    return {
      lanes,
      summary: { total, wip, wipPrev, completed, overdue },
      summaryRows,
      divisionOverview,
    }
  }, [documents])

  return (
    <div className="records-dashboard-shell">
      <div className="records-title-strip">
        <div className="records-title-strip-notes">
          <div className="records-title-note" style={accent ? { color: accent } : undefined}>{title}</div>
        </div>
        <div className="records-title-strip-board">KANBAN BOARD</div>
      </div>

      <section className="records-band records-band-top">
        <div className="records-top-grid">
          <div className="records-board-pane">
            <RecordsKanban lanes={dashboardView.lanes} />
          </div>

          <aside className="records-summary-pane">
            <RoutedTaskSummary summary={dashboardView.summary} />
            <DivisionSummaryTable data={dashboardView.divisionOverview} />
          </aside>
        </div>
      </section>

      <section className="records-band records-band-bottom">
        <div className="records-bottom-band">
          <div className="records-task-monitor-panel">
            <TaskMonitoringTable rows={dashboardView.summaryRows} />
          </div>

          <div className="records-chart-panel">
            <StatusOverviewChart data={dashboardView.divisionOverview} />
          </div>
        </div>
      </section>
    </div>
  )
}
