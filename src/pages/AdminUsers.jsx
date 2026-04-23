import { useState, useEffect } from 'react'
import { Row, Col, Form, Button, Modal, Badge } from 'react-bootstrap'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'
import { getRoleDisplayLabel } from '../utils/workflowLabels'

const ROLE_OPTIONS = ['Operator', 'OPM Assistant', 'PM', 'Division', 'Admin']
const DIVISION_OPTIONS = [
  'Records Section',
  'Office of the Port Manager (OPM)',
  'Administrative Division',
  'Finance Division',
  'Engineering Services Division (ESD)',
  'Port Services Division (PSD)',
  'Port Police Division (PPD)',
  'Terminal',
]

const HEAD_POSITIONS_BY_DIVISION = {
  Terminal: ['Terminal Staff', 'Terminal Head'],
}

export default function AdminUsers() {
  const { authFetch, user } = useAuth()
  const [users, setUsers] = useState([])
  const [divisionPositions, setDivisionPositions] = useState({})
  const [showModal, setShowModal] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [form, setForm] = useState({ username: '', password: '', fullName: '', role: 'Operator', division: '', position: '' })
  const [accountView, setAccountView] = useState('all')
  const [delegateDivisionFilter, setDelegateDivisionFilter] = useState('')

  const fetchUsers = async () => {
    try {
      const res = await authFetch('/api/users')
      const data = await res.json()
      if (res.ok) setUsers(data.users)
      else toast.error(data.error || 'Failed to load users')
    } catch { toast.error('Failed to connect to server') }
  }

  const fetchDivisionPositions = async () => {
    try {
      const res = await authFetch('/api/users/division-positions?includeAll=true')
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Failed to load division positions')
        return
      }
      setDivisionPositions(data.divisionPositions || {})
    } catch {
      toast.error('Failed to load division positions')
    }
  }

  useEffect(() => {
    fetchUsers()
    fetchDivisionPositions()
  }, [])

  if (user?.role !== 'Admin') {
    return (
      <div className="content-card p-4 text-center">
        <i className="bi bi-shield-x" style={{ fontSize: 48, color: '#dc3545' }}></i>
        <h5 className="mt-3">Access Denied</h5>
        <p className="text-muted">Only administrators can manage users.</p>
      </div>
    )
  }

  const openAdd = () => {
    setEditUser(null)
    setForm({ username: '', password: '', fullName: '', role: 'Operator', division: '', position: '' })
    setShowModal(true)
  }

  const openEdit = (u) => {
    setEditUser(u)
    setForm({ username: u.username, password: '', fullName: u.fullName, role: u.role, division: u.division || '', position: u.position || '' })
    setShowModal(true)
  }

  const handleSave = async () => {
    try {
      if (editUser) {
        const body = { ...form }
        if (!body.password) delete body.password
        const res = await authFetch(`/api/users/${editUser.id}`, {
          method: 'PUT', body: JSON.stringify(body),
        })
        if (!res.ok) { const d = await res.json(); toast.error(d.error); return }
        toast.success('User updated')
      } else {
        if (!form.password) { toast.error('Password is required for new users'); return }
        const res = await authFetch('/api/users', {
          method: 'POST', body: JSON.stringify(form),
        })
        if (!res.ok) { const d = await res.json(); toast.error(d.error); return }
        toast.success('User created')
      }
      setShowModal(false)
      fetchUsers()
    } catch { toast.error('Failed to save user') }
  }

  const handleToggleActive = async (u) => {
    const res = await authFetch(`/api/users/${u.id}`, {
      method: 'PUT', body: JSON.stringify({ isActive: !u.isActive }),
    })
    if (res.ok) { toast.success(u.isActive ? 'User deactivated' : 'User activated'); fetchUsers() }
    else toast.error('Failed to update user')
  }

  const roleBadgeColor = (role) => {
    switch (role) {
      case 'Admin': return 'danger'
      case 'PM': return 'primary'
      case 'OPM Assistant': return 'info'
      case 'Division': return 'success'
      case 'Operator': return 'secondary'
      default: return 'dark'
    }
  }

  const isDelegateAccount = (account) => {
    if (account?.role !== 'Division') return false

    const division = String(account?.division || '').trim()
    const position = String(account?.position || '').trim()
    if (!division || !position) return false

    const explicitHeadPositions = HEAD_POSITIONS_BY_DIVISION[division] || ['Division Manager A']
    const normalizedPosition = position.toLowerCase()
    const normalizedHeadPositions = explicitHeadPositions.map((item) => String(item || '').trim().toLowerCase())

    return !normalizedHeadPositions.includes(normalizedPosition)
  }

  const delegateDivisionOptions = Array.from(new Set(
    users
      .filter(isDelegateAccount)
      .map((account) => String(account.division || '').trim())
      .filter(Boolean)
  )).sort((a, b) => a.localeCompare(b))

  const visibleUsers = users.filter((account) => {
    if (accountView !== 'delegates') return true
    if (!isDelegateAccount(account)) return false
    if (!delegateDivisionFilter) return true
    return String(account.division || '').trim() === delegateDivisionFilter
  })

  const selectedDivisionPositionOptions = form.division
    ? (divisionPositions[form.division] || [])
    : []

  return (
    <div className="admin-users-page">
      <div className="page-header admin-users-header d-flex justify-content-between align-items-start">
        <div>
          <h4><i className="bi bi-people-fill me-2"></i>User Management</h4>
          <p>Manage system accounts, roles, and divisions</p>
        </div>
        <Button variant="primary" className="admin-users-add-btn" onClick={openAdd} style={{ background: '#002868', border: 'none', borderRadius: 12 }}>
          <i className="bi bi-person-plus me-1"></i>Add User
        </Button>
      </div>

      <div className="content-card admin-users-table-card">
        <div className="d-flex flex-wrap gap-3 align-items-end px-3 pt-3 pb-2">
          <Form.Group style={{ minWidth: 220 }}>
            <Form.Label style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Account View</Form.Label>
            <Form.Select
              value={accountView}
              onChange={(e) => {
                const nextView = e.target.value
                setAccountView(nextView)
                if (nextView !== 'delegates') {
                  setDelegateDivisionFilter('')
                }
              }}
            >
              <option value="all">All Users</option>
              <option value="delegates">Division Delegates Only</option>
            </Form.Select>
          </Form.Group>

          <Form.Group style={{ minWidth: 260 }}>
            <Form.Label style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Delegate Division</Form.Label>
            <Form.Select
              value={delegateDivisionFilter}
              onChange={(e) => setDelegateDivisionFilter(e.target.value)}
              disabled={accountView !== 'delegates'}
            >
              <option value="">All Divisions</option>
              {delegateDivisionOptions.map((division) => (
                <option key={division} value={division}>{division}</option>
              ))}
            </Form.Select>
          </Form.Group>

          <div className="text-muted" style={{ fontSize: 12, paddingBottom: 2 }}>
            Showing {visibleUsers.length} account(s)
          </div>
        </div>
        <div className="table-responsive">
          <table className="excel-table admin-users-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>#</th>
                <th>Username</th>
                <th>Full Name</th>
                <th>Role</th>
                <th>Division</th>
                <th>Position</th>
                <th style={{ width: 70 }}>Status</th>
                <th style={{ width: 100 }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {visibleUsers.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center text-muted" style={{ padding: 18 }}>
                    No accounts matched this filter.
                  </td>
                </tr>
              ) : visibleUsers.map((u, i) => (
                <tr key={u.id} className="admin-user-row" style={{ opacity: u.isActive ? 1 : 0.5 }}>
                  <td style={{ textAlign: 'center' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{u.username}</td>
                  <td>{u.fullName}</td>
                  <td><Badge bg={roleBadgeColor(u.role)}>{getRoleDisplayLabel(u.role)}</Badge></td>
                  <td style={{ fontSize: 11 }}>{u.division || '—'}</td>
                  <td style={{ fontSize: 11 }}>{u.position || '—'}</td>
                  <td style={{ textAlign: 'center' }}>
                    <Badge bg={u.isActive ? 'success' : 'secondary'}>{u.isActive ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td>
                    <Button size="sm" variant="outline-primary" className="me-1 admin-user-edit-btn" onClick={() => openEdit(u)} style={{ borderRadius: 8, fontSize: 11 }}>
                      <i className="bi bi-pencil"></i>
                    </Button>
                    <Button size="sm" className="admin-user-toggle-btn" variant={u.isActive ? 'outline-danger' : 'outline-success'} onClick={() => handleToggleActive(u)} style={{ borderRadius: 8, fontSize: 11 }}>
                      <i className={`bi bi-${u.isActive ? 'x-circle' : 'check-circle'}`}></i>
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add/Edit Modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)} className="admin-user-modal" centered>
        <Modal.Header closeButton>
          <Modal.Title style={{ fontSize: 16 }}>
            <i className={`bi bi-${editUser ? 'pencil' : 'person-plus'} me-2`}></i>
            {editUser ? 'Edit User' : 'Add New User'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form>
            <Form.Group className="mb-3">
              <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>Username</Form.Label>
              <Form.Control
                value={form.username}
                onChange={e => setForm({ ...form, username: e.target.value })}
                disabled={!!editUser}
                placeholder="e.g. jdoe"
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>
                Password {editUser && <span className="text-muted">(leave blank to keep current)</span>}
              </Form.Label>
              <Form.Control
                type="password"
                value={form.password}
                onChange={e => setForm({ ...form, password: e.target.value })}
                placeholder={editUser ? '••••••••' : 'Enter password'}
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>Full Name</Form.Label>
              <Form.Control value={form.fullName} onChange={e => setForm({ ...form, fullName: e.target.value })} placeholder="e.g. Juan Dela Cruz" />
            </Form.Group>
            <Row>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>Role</Form.Label>
                  <Form.Select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                    {ROLE_OPTIONS.map(r => <option key={r} value={r}>{getRoleDisplayLabel(r)}</option>)}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>Division</Form.Label>
                  <Form.Select value={form.division} onChange={e => setForm({ ...form, division: e.target.value, position: '' })}>
                    <option value="">— Select —</option>
                    {DIVISION_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>
            <Form.Group className="mb-3">
              <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>Position</Form.Label>
              <Form.Control
                value={form.position}
                onChange={e => setForm({ ...form, position: e.target.value })}
                placeholder={selectedDivisionPositionOptions.length > 0 ? 'Select or type position' : 'e.g. Division Head'}
                list="division-position-options"
              />
              <datalist id="division-position-options">
                {selectedDivisionPositionOptions.map((position) => (
                  <option key={position} value={position} />
                ))}
              </datalist>
              {form.division && selectedDivisionPositionOptions.length > 0 && (
                <div className="text-muted mt-1" style={{ fontSize: 11 }}>
                  {selectedDivisionPositionOptions.length} available position option(s) for {form.division}
                </div>
              )}
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer className="admin-user-modal-footer">
          <Button variant="outline-secondary" className="admin-user-modal-cancel" onClick={() => setShowModal(false)} style={{ borderRadius: 10 }}>Cancel</Button>
          <Button variant="primary" className="admin-user-modal-save" onClick={handleSave} style={{ background: '#002868', border: 'none', borderRadius: 10 }}>
            {editUser ? 'Save Changes' : 'Create User'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}
