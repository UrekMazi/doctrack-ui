import { useMemo } from 'react'
import RecordsKanban from './RecordsKanban'
import RoutedTaskSummary from './RoutedTaskSummary'
import TaskMonitoringTable from './TaskMonitoringTable'
import StatusOverviewChart from './StatusOverviewChart'
import { WORKFLOW_STATUS, getStatusDisplayLabel } from '../utils/workflowLabels'

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

const parseTimestamp = (value) => {
  if (!value) return 0
  const date = value instanceof Date ? value : new Date(value)
  return Number.isNaN(date.getTime()) ? 0 : date.getTime()
}

const getHistoryEntries = (doc) => (Array.isArray(doc?.routingHistory) ? doc.routingHistory : [])
const getHistoryText = (doc) => getHistoryEntries(doc)
  .map((entry) => `${entry?.office || ''} ${entry?.action || ''}`.trim())
  .join(' | ')
  .toLowerCase()

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

/* Kanban lanes for Divisions */
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
  return null
}

const getSortTimestamp = (doc) => {
  const laneKey = getLaneKey(doc)
  if (laneKey === 'completed') return getCompletionTimestamp(doc) || getRouteTimestamp(doc)
  return getRouteTimestamp(doc) || parseTimestamp(doc?.updatedAt) || parseTimestamp(doc?.createdAt)
}

/**
 * Shared Kanban-style dashboard for Division Managers.
 */
export default function DivisionDashboard({ documents = [], currentUser }) {
  const dashboardView = useMemo(() => {
    const docs = Array.isArray(documents) ? documents : []
    const currentMonthKey = formatMonthKey(new Date())
    const myDivision = normalizeText(currentUser?.division)

    // 1. Filter documents relevant to this division
    const divisionDocs = docs.map((doc) => {
      const explicitTargets = Array.isArray(doc.targetDivisions) ? doc.targetDivisions : []
      const isTarget = normalizeText(doc.targetDivision) === myDivision || explicitTargets.some(d => normalizeText(d) === myDivision)
      const isSender = normalizeText(doc.senderAddress) === myDivision
      
      if (!isTarget && !isSender) return null

      const mainDivisionRaw = doc.oprDivision || doc.mainDivision || doc.targetDivision || ''
      const isMainOPR = normalizeText(mainDivisionRaw) === myDivision || (isSender && !mainDivisionRaw)

      const laneKey = getLaneKey(doc)
      if (!laneKey) return null

      const routeTimestamp = getRouteTimestamp(doc)
      const completionTimestamp = getCompletionTimestamp(doc)
      const dueDateTimestamp = parseTimestamp(doc?.dueDate)
      const isCompleted = isCompletedDoc(doc)
      const resolvedTimestamp = laneKey === 'completed' ? (completionTimestamp || routeTimestamp) : routeTimestamp
      const daysElapsed = routeTimestamp ? Math.max(0, Math.floor(((isCompleted ? resolvedTimestamp || routeTimestamp : Date.now()) - routeTimestamp) / DAY_MS)) : null
      const isOverdue = Boolean(!isCompleted && dueDateTimestamp && Date.now() > dueDateTimestamp)
      const overdueDays = isOverdue ? Math.max(0, Math.floor((Date.now() - dueDateTimestamp) / DAY_MS)) : null

      return {
        ...doc,
        laneKey,
        isMainOPR,
        routeTimestamp,
        completionTimestamp,
        dueDateTimestamp,
        isCompleted,
        daysElapsed,
        isOverdue,
        overdueDays,
        sortTimestamp: getSortTimestamp(doc),
      }
    }).filter(Boolean)

    // 2. Kanban Board Data (Main OPR + CF Party)
    const laneDefinitions = [
      { id: 'outgoing', title: 'OPM Outgoing Review', subtitle: 'Pending OPM finalization', accent: '#0ea5e9' },
      { id: 'assigned', title: 'Assigned / WIP', subtitle: 'Routed to division', accent: '#d97706' },
      { id: 'completed', title: 'Completed', subtitle: 'Received & acknowledged', accent: '#16a34a' },
    ]

    const lanes = laneDefinitions.map((lane) => ({
      ...lane,
      items: divisionDocs
        .filter((doc) => doc.laneKey === lane.id)
        .sort((a, b) => b.sortTimestamp - a.sortTimestamp)
        .slice(0, 5),
    }))

    // 3. Summaries, Tables, Charts (Main OPR ONLY)
    const mainOprDocs = divisionDocs.filter(doc => doc.isMainOPR)
    const total = mainOprDocs.length
    const completed = mainOprDocs.filter((doc) => doc.isCompleted).length
    const wip = total - completed
    const wipPrev = mainOprDocs.filter((doc) => !doc.isCompleted && doc.routeTimestamp && formatMonthKey(doc.routeTimestamp) < currentMonthKey).length
    const overdue = mainOprDocs.filter((doc) => doc.isOverdue).length

    const summaryRows = mainOprDocs
      .slice()
      .sort((a, b) => b.sortTimestamp - a.sortTimestamp)
      .map((doc) => ({
        id: doc.id,
        trackingNumber: doc.trackingNumber,
        division: doc.isMainOPR ? (currentUser?.division || doc.divisionLabel) : doc.divisionLabel,
        status: doc.isCompleted ? 'Completed' : 'WIP',
        statusDetail: getStatusDisplayLabel(doc.status),
        dateRouted: doc.routeTimestamp ? new Date(doc.routeTimestamp).toISOString() : '',
        dateCompleted: doc.isCompleted && doc.completionTimestamp ? new Date(doc.completionTimestamp).toISOString() : '',
        daysElapsed: doc.daysElapsed,
        dueDate: doc.dueDateTimestamp ? new Date(doc.dueDateTimestamp).toISOString() : '',
        isOverdue: doc.isOverdue,
        overdueDays: doc.overdueDays,
      }))

    const divisionOverview = [{
      division: currentUser?.division || 'Division',
      wip,
      completed,
      overdue,
      total,
    }]

    return {
      lanes,
      summary: { total, wip, wipPrev, completed, overdue },
      summaryRows,
      divisionOverview,
    }
  }, [documents, currentUser])

  return (
    <div className="records-dashboard-shell">
      <div className="records-title-strip">
        <div className="records-title-strip-notes">
          <div className="records-title-note" style={{ color: '#0b4fb3' }}>{currentUser?.division} Dashboard</div>
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
          </aside>
        </div>
      </section>

      <section className="records-band records-band-bottom">
        <div className="records-bottom-band">
          <div className="records-task-monitor-panel">
            <div className="records-monitor-title">{currentUser?.division} DIVISION TASK MONITORING</div>
            <TaskMonitoringTable rows={dashboardView.summaryRows} hideDivisionColumn />
          </div>

          <div className="records-chart-panel">
            <div className="records-chart-title" style={{ borderBottom: 'none' }}>{currentUser?.division} DIVISION OVERVIEW</div>
            <StatusOverviewChart data={dashboardView.divisionOverview} hideXAxisLabel />
          </div>
        </div>
      </section>
    </div>
  )
}
