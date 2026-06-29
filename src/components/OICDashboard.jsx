import WorkflowDashboard from './WorkflowDashboard'

export default function OICDashboard({ documents = [] }) {
  return (
    <WorkflowDashboard
      documents={documents}
      title="OIC Dashboard"
      accent="#17a2b8"
      dashboardType="OIC"
    />
  )
}
