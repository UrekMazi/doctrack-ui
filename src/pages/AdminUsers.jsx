import { useState, useEffect } from 'react'
import { Row, Col, Form, Button, Modal, Badge } from 'react-bootstrap'
import { useAuth } from '../context/AuthContext'
import toast from 'react-hot-toast'

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

export default function AdminUsers() {
  const { authFetch, user } = useAuth()
  const [users, setUsers] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [form, setForm] = useState({ username: '', password: '', fullName: '', role: 'Operator', division: '', position: '' })

  const fetchUsers = async () => {
    try {
      const res = await authFetch('/api/users')
      const data = await res.json()
      if (res.ok) setUsers(data.users)
      else toast.error(data.error || 'Failed to load users')
    } catch { toast.error('Failed to connect to server') }
  }

  useEffect(() => { fetchUsers() }, [])

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

  return (
    <>
      <div className="page-header d-flex justify-content-between align-items-start">
        <div>
          <h4><i className="bi bi-people-fill me-2"></i>User Management</h4>
          <p>Manage system accounts, roles, and divisions</p>
        </div>
        <Button variant="primary" onClick={openAdd} style={{ background: '#002868', border: 'none', borderRadius: 12 }}>
          <i className="bi bi-person-plus me-1"></i>Add User
        </Button>
      </div>

      <div className="content-card">
        <div className="table-responsive">
          <table className="excel-table">
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
              {users.map((u, i) => (
                <tr key={u.id} style={{ opacity: u.isActive ? 1 : 0.5 }}>
                  <td style={{ textAlign: 'center' }}>{i + 1}</td>
                  <td style={{ fontFamily: 'monospace', fontWeight: 600 }}>{u.username}</td>
                  <td>{u.fullName}</td>
                  <td><Badge bg={roleBadgeColor(u.role)}>{u.role}</Badge></td>
                  <td style={{ fontSize: 11 }}>{u.division || '—'}</td>
                  <td style={{ fontSize: 11 }}>{u.position || '—'}</td>
                  <td style={{ textAlign: 'center' }}>
                    <Badge bg={u.isActive ? 'success' : 'secondary'}>{u.isActive ? 'Active' : 'Inactive'}</Badge>
                  </td>
                  <td>
                    <Button size="sm" variant="outline-primary" className="me-1" onClick={() => openEdit(u)} style={{ borderRadius: 8, fontSize: 11 }}>
                      <i className="bi bi-pencil"></i>
                    </Button>
                    <Button size="sm" variant={u.isActive ? 'outline-danger' : 'outline-success'} onClick={() => handleToggleActive(u)} style={{ borderRadius: 8, fontSize: 11 }}>
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
      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
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
                    {ROLE_OPTIONS.map(r => <option key={r} value={r}>{r}</option>)}
                  </Form.Select>
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group className="mb-3">
                  <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>Division</Form.Label>
                  <Form.Select value={form.division} onChange={e => setForm({ ...form, division: e.target.value })}>
                    <option value="">— Select —</option>
                    {DIVISION_OPTIONS.map(d => <option key={d} value={d}>{d}</option>)}
                  </Form.Select>
                </Form.Group>
              </Col>
            </Row>
            <Form.Group className="mb-3">
              <Form.Label style={{ fontSize: 12, fontWeight: 600 }}>Position</Form.Label>
              <Form.Control value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} placeholder="e.g. Division Head" />
            </Form.Group>
          </Form>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="outline-secondary" onClick={() => setShowModal(false)} style={{ borderRadius: 10 }}>Cancel</Button>
          <Button variant="primary" onClick={handleSave} style={{ background: '#002868', border: 'none', borderRadius: 10 }}>
            {editUser ? 'Save Changes' : 'Create User'}
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  )
}
