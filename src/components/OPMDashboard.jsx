import WorkflowDashboard from './WorkflowDashboard'
import { OPM_ROLE_DISPLAY } from '../utils/workflowLabels'

export default function OPMDashboard({ documents = [] }) {
  return (
    <WorkflowDashboard
      documents={documents}
      title={`${OPM_ROLE_DISPLAY} Dashboard`}
      accent="#6f42c1"
    />
  )
}
