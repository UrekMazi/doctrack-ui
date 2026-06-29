import WorkflowDashboard from './WorkflowDashboard'

export default function PMDashboard({ documents = [] }) {
  return (
    <WorkflowDashboard
      documents={documents}
      title="PM Dashboard"
      accent="#ce1126"
    />
  )
}
