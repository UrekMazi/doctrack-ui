import { useLocation, useNavigate } from 'react-router-dom'
import { Dropdown } from 'react-bootstrap'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import toast from 'react-hot-toast'
import { useDocuments } from '../context/DocumentContext'
import { getRoleDisplayLabel, getStatusDisplayLabel } from '../utils/workflowLabels'
import { getPendingDocumentsForUser, getRoleQueuePath } from '../utils/pendingWork'

const REMINDER_DELAY_MS = 60 * 1000
const REMINDER_SNOOZE_MS = 15 * 60 * 1000
const PENDING_TOAST_DELAY_MS = 5 * 60 * 1000
const MAX_STORED_NOTIFICATIONS = 100
const REMINDER_SOUND_SRC = encodeURI('/audios/Microsoft Teams incoming call sound.mp3')
const REMINDER_SOUND_PULSES_MS = [0, 420, 860]
const NEW_DOC_SOUND_PULSES_MS = [0, 620]
const SWIPE_DISMISS_THRESHOLD_PX = 108
const SWIPE_MAX_TRANSLATE_PX = 420

function getDocumentKey(doc) {
  return String(doc?.id || doc?.trackingNumber || '').trim()
}

function formatDueDate(value) {
  const raw = String(value || '').trim()
  return raw || 'No due date'
}

function formatRelativeTime(timestamp) {
  const ms = Number(timestamp) || 0
  if (!ms) return 'just now'

  const diffSeconds = Math.max(1, Math.floor((Date.now() - ms) / 1000))
  if (diffSeconds < 60) return `${diffSeconds}s ago`

  const diffMinutes = Math.floor(diffSeconds / 60)
  if (diffMinutes < 60) return `${diffMinutes}m ago`

  const diffHours = Math.floor(diffMinutes / 60)
  if (diffHours < 24) return `${diffHours}h ago`

  const diffDays = Math.floor(diffHours / 24)
  return `${diffDays}d ago`
}

function parseDateToMs(value) {
  const raw = String(value || '').trim()
  if (!raw) return 0

  const parsed = new Date(raw)
  if (!Number.isNaN(parsed.getTime())) return parsed.getTime()

  return 0
}

function parseDateTimeToMs(dateValue, timeValue = '') {
  const dateText = String(dateValue || '').trim()
  const timeText = String(timeValue || '').trim()
  if (!dateText && !timeText) return 0

  const parsed = new Date([dateText, timeText].filter(Boolean).join(' '))
  if (!Number.isNaN(parsed.getTime())) return parsed.getTime()

  return 0
}

function getPendingDocumentAgeMs(doc) {
  const updatedAtMs = parseDateToMs(doc?.updatedAt)
  if (updatedAtMs > 0) return Math.max(0, Date.now() - updatedAtMs)

  const createdAtMs = parseDateToMs(doc?.createdAt)
  if (createdAtMs > 0) return Math.max(0, Date.now() - createdAtMs)

  const receivedAtMs = parseDateTimeToMs(doc?.dateReceived, doc?.timeReceived)
  if (receivedAtMs > 0) return Math.max(0, Date.now() - receivedAtMs)

  return 0
}

function getStorageKey({ role, division, position, name }) {
  const parts = [role, division, position, name]
    .map((value) => String(value || '').trim().toLowerCase().replace(/\s+/g, '_'))
  return `doctrack_notifications_${parts.join('__') || 'default'}`
}

function buildNotificationFromDocument(doc, kind = 'new') {
  const docKey = getDocumentKey(doc)
  if (!docKey) return null

  const now = Date.now()
  const message = kind === 'reminder'
    ? 'Reminder: please check notifications now and complete this document.'
    : kind === 'pending'
      ? 'Document currently pending in your queue.'
      : 'New document requires your action.'

  return {
    id: `notif-${docKey}`,
    docKey,
    docId: doc?.id || null,
    trackingNumber: String(doc?.trackingNumber || '').trim(),
    subject: String(doc?.subject || '').trim(),
    statusLabel: getStatusDisplayLabel(doc?.status),
    dueDateLabel: formatDueDate(doc?.dueDate),
    message,
    kind,
    read: false,
    createdAt: now,
    updatedAt: now,
  }
}

function parseStoredNotifications(rawValue) {
  if (!rawValue) return []

  try {
    const parsed = JSON.parse(rawValue)
    if (!Array.isArray(parsed)) return []

    return parsed
      .filter((item) => item && typeof item === 'object' && String(item.docKey || '').trim())
      .map((item) => ({
        id: String(item.id || `notif-${item.docKey}`),
        docKey: String(item.docKey || ''),
        docId: item.docId || null,
        trackingNumber: String(item.trackingNumber || ''),
        subject: String(item.subject || ''),
        statusLabel: String(item.statusLabel || ''),
        dueDateLabel: String(item.dueDateLabel || 'No due date'),
        message: String(item.message || 'Document requires your action.'),
        kind: String(item.kind || 'new'),
        read: Boolean(item.read),
        createdAt: Number(item.createdAt) || Date.now(),
        updatedAt: Number(item.updatedAt) || Date.now(),
      }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_STORED_NOTIFICATIONS)
  } catch {
    return []
  }
}

function parseStoredPreferences(rawValue) {
  const fallback = {
    soundEnabled: true,
    reminderPausedUntil: 0,
  }

  if (!rawValue) return fallback

  try {
    const parsed = JSON.parse(rawValue)
    if (!parsed || typeof parsed !== 'object') return fallback

    return {
      soundEnabled: parsed.soundEnabled !== false,
      reminderPausedUntil: Number(parsed.reminderPausedUntil) || 0,
    }
  } catch {
    return fallback
  }
}

function SwipeDismissToast({ toastId, className = '', children, onClick, style: customStyle }) {
  const [dragX, setDragX] = useState(0)
  const [isDragging, setIsDragging] = useState(false)
  const startXRef = useRef(0)
  const pointerIdRef = useRef(null)
  const movedRef = useRef(false)
  const suppressClickRef = useRef(false)

  const handlePointerDown = (event) => {
    if (typeof event.button === 'number' && event.button !== 0) return

    pointerIdRef.current = event.pointerId
    startXRef.current = event.clientX
    movedRef.current = false
    setIsDragging(true)

    if (typeof event.currentTarget?.setPointerCapture === 'function') {
      event.currentTarget.setPointerCapture(event.pointerId)
    }
  }

  const handlePointerMove = (event) => {
    if (!isDragging || pointerIdRef.current !== event.pointerId) return

    const nextX = event.clientX - startXRef.current
    const clampedX = Math.max(-SWIPE_MAX_TRANSLATE_PX, Math.min(SWIPE_MAX_TRANSLATE_PX, nextX))

    if (Math.abs(clampedX) > 6) {
      movedRef.current = true
    }

    setDragX(clampedX)
  }

  const handlePointerUp = (event) => {
    if (!isDragging || pointerIdRef.current !== event.pointerId) return

    if (typeof event.currentTarget?.releasePointerCapture === 'function') {
      try {
        event.currentTarget.releasePointerCapture(event.pointerId)
      } catch {
        // no-op
      }
    }

    const dismissedBySwipe = Math.abs(dragX) >= SWIPE_DISMISS_THRESHOLD_PX

    setIsDragging(false)
    pointerIdRef.current = null

    if (movedRef.current) {
      suppressClickRef.current = true
      window.setTimeout(() => {
        suppressClickRef.current = false
      }, 260)
    }

    if (dismissedBySwipe) {
      setDragX(dragX >= 0 ? SWIPE_MAX_TRANSLATE_PX : -SWIPE_MAX_TRANSLATE_PX)
      window.setTimeout(() => {
        toast.dismiss(toastId)
      }, 120)
      return
    }

    setDragX(0)
  }

  const handlePointerCancel = (event) => {
    if (!isDragging || pointerIdRef.current !== event.pointerId) return

    setIsDragging(false)
    pointerIdRef.current = null
    setDragX(0)
  }

  const handleClickCapture = (event) => {
    if (!suppressClickRef.current) return
    event.preventDefault()
    event.stopPropagation()
  }

  const opacity = 1 - Math.min(Math.abs(dragX) / 260, 0.55)
  const hasHorizontalOffset = isDragging || Math.abs(dragX) > 0

  return (
    <div
      className={`${className} task-swipe-toast ${isDragging ? 'is-dragging' : ''}`}
      style={{
        ...customStyle,
        transform: `translateX(${dragX}px)`,
        opacity: hasHorizontalOffset ? opacity : undefined,
        transition: isDragging ? 'none' : 'transform 180ms ease, opacity 180ms ease',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onClickCapture={handleClickCapture}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

export default function TopNav({ currentUser, onLogout }) {
  const location = useLocation()
  const navigate = useNavigate()
  const [searchQuery, setSearchQuery] = useState('')
  const [showNotificationMenu, setShowNotificationMenu] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [notificationPrefs, setNotificationPrefs] = useState({
    soundEnabled: true,
    reminderPausedUntil: 0,
  })
  const { documents } = useDocuments()
  const role = currentUser?.systemRole || currentUser?.role || ''
  const division = currentUser?.division || ''
  const position = currentUser?.position || ''
  const name = currentUser?.name || ''
  const storageKey = useMemo(
    () => getStorageKey({ role, division, position, name }),
    [role, division, position, name]
  )
  const prefsStorageKey = useMemo(() => `${storageKey}_prefs`, [storageKey])
  const pendingDocumentsRef = useRef([])
  const previousPendingKeysRef = useRef(new Set())
  const pendingInitRef = useRef(false)
  const pendingSeedRef = useRef(false)
  const audioRef = useRef(null)
  const audioReplayTimeoutIdsRef = useRef([])

  const handleSearch = (e) => {
    e.preventDefault()
    if (searchQuery.trim()) {
      navigate(`/tracking?q=${encodeURIComponent(searchQuery.trim())}`)
      setSearchQuery('')
    }
  }

  const initials = currentUser?.name
    ? currentUser.name.split(' ').map(n => n[0]).join('')
    : 'U'
  const displayedRole = getRoleDisplayLabel(role)
  const pendingDocuments = useMemo(
    () => getPendingDocumentsForUser(documents, {
      systemRole: role,
      division,
      position,
      name,
    }),
    [documents, role, division, position, name]
  )
  const pendingCount = pendingDocuments.length
  const unreadCount = useMemo(
    () => notifications.reduce((count, item) => count + (item.read ? 0 : 1), 0),
    [notifications]
  )
  const soundEnabled = notificationPrefs?.soundEnabled !== false
  const reminderPausedUntil = Number(notificationPrefs?.reminderPausedUntil) || 0
  const remindersPaused = reminderPausedUntil > Date.now()
  const pausedMinutesLeft = remindersPaused
    ? Math.ceil((reminderPausedUntil - Date.now()) / 60000)
    : 0
  const bellCount = unreadCount > 0 ? unreadCount : pendingCount
  const activeDocumentId = useMemo(() => {
    const path = String(location?.pathname || '')
    const match = path.match(/^\/document\/([^/?#]+)/i)
    return match ? String(match[1] || '').trim() : ''
  }, [location?.pathname])

  const isViewingNotifiedDocument = useCallback((recordLike) => {
    if (!activeDocumentId) return false

    const recordId = String(recordLike?.docId || recordLike?.id || '').trim()
    return Boolean(recordId) && recordId === activeDocumentId
  }, [activeDocumentId])

  useEffect(() => {
    pendingDocumentsRef.current = pendingDocuments
  }, [pendingDocuments])

  useEffect(() => {
    setShowNotificationMenu(false)
    previousPendingKeysRef.current = new Set()
    pendingInitRef.current = false
    pendingSeedRef.current = false
    setNotifications(parseStoredNotifications(localStorage.getItem(storageKey)))
    setNotificationPrefs(parseStoredPreferences(localStorage.getItem(prefsStorageKey)))
  }, [storageKey, prefsStorageKey])

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(notifications.slice(0, MAX_STORED_NOTIFICATIONS)))
    } catch {
      // Ignore storage errors.
    }
  }, [notifications, storageKey])

  useEffect(() => {
    try {
      localStorage.setItem(prefsStorageKey, JSON.stringify({
        soundEnabled,
        reminderPausedUntil,
      }))
    } catch {
      // Ignore storage errors.
    }
  }, [prefsStorageKey, reminderPausedUntil, soundEnabled])

  useEffect(() => {
    if (!remindersPaused) return

    const timeoutMs = Math.max(1000, reminderPausedUntil - Date.now())
    const timeoutId = window.setTimeout(() => {
      setNotificationPrefs((prev) => ({ ...prev, reminderPausedUntil: 0 }))
    }, timeoutMs)

    return () => {
      window.clearTimeout(timeoutId)
    }
  }, [reminderPausedUntil, remindersPaused])

  const clearAudioReplayTimeouts = useCallback(() => {
    if (!Array.isArray(audioReplayTimeoutIdsRef.current)) {
      audioReplayTimeoutIdsRef.current = []
      return
    }

    audioReplayTimeoutIdsRef.current.forEach((timeoutId) => {
      window.clearTimeout(timeoutId)
    })
    audioReplayTimeoutIdsRef.current = []
  }, [])

  const playReminderSound = useCallback((kind = 'new') => {
    try {
      if (!audioRef.current) {
        audioRef.current = new Audio(REMINDER_SOUND_SRC)
        audioRef.current.preload = 'auto'
      }

      clearAudioReplayTimeouts()

      const pulseOffsets = kind === 'reminder'
        ? REMINDER_SOUND_PULSES_MS
        : NEW_DOC_SOUND_PULSES_MS

      pulseOffsets.forEach((offsetMs) => {
        const timeoutId = window.setTimeout(() => {
          if (!audioRef.current) return
          audioRef.current.volume = 1
          audioRef.current.currentTime = 0
          audioRef.current.play().catch(() => {})
        }, offsetMs)

        audioReplayTimeoutIdsRef.current.push(timeoutId)
      })
    } catch {
      // no-op
    }
  }, [clearAudioReplayTimeouts])

  const openRecord = useCallback((record) => {
    if (record?.docId) {
      navigate(`/document/${record.docId}`)
      return
    }

    if (record?.trackingNumber) {
      navigate(`/tracking?q=${encodeURIComponent(record.trackingNumber)}`)
      return
    }

    navigate(getRoleQueuePath(role))
  }, [navigate, role])

  const upsertNotification = useCallback((doc, kind = 'new') => {
    const incoming = buildNotificationFromDocument(doc, kind)
    if (!incoming) return null

    setNotifications((prev) => {
      const idx = prev.findIndex((item) => item.docKey === incoming.docKey)
      const now = Date.now()
      const nextIncoming = {
        ...incoming,
        updatedAt: now,
      }

      let next = []
      if (idx >= 0) {
        const existing = prev[idx]
        const merged = {
          ...existing,
          ...nextIncoming,
          createdAt: existing.createdAt || nextIncoming.createdAt,
          read: false,
        }
        next = [...prev]
        next[idx] = merged
      } else {
        next = [{ ...nextIncoming, read: false }, ...prev]
      }

      return next
        .sort((a, b) => b.updatedAt - a.updatedAt)
        .slice(0, MAX_STORED_NOTIFICATIONS)
    })

    return incoming
  }, [])

  const showDocumentToast = useCallback((doc, kind = 'new') => {
    if (kind === 'reminder' && remindersPaused) return

    const record = buildNotificationFromDocument(doc, kind)
    if (!record) return
    if (kind === 'reminder' && isViewingNotifiedDocument(record)) return
    const reminderCadenceMinutes = Math.max(1, Math.round(REMINDER_DELAY_MS / 60000))
    const toastDuration = kind === 'reminder' ? 12000 : 10000

    if (soundEnabled) {
      playReminderSound(kind)
    }

    toast.custom((toastItem) => (
      <SwipeDismissToast
        toastId={toastItem.id}
        className="task-doc-toast"
        onClick={() => {
          toast.dismiss(toastItem.id)
          openRecord(record)
        }}
        style={{ '--toast-idle-ms': `${toastDuration}ms` }}
      >
        <div className="task-nag-toast">
          <div className="task-nag-toast-head">
            <div className="task-nag-toast-head-copy">
              <div className="task-nag-toast-title">
                {kind === 'reminder' ? 'Pending Document Reminder' : 'New Document Notification'}
              </div>
              <div className="task-nag-toast-subtitle">{record.message} (every {reminderCadenceMinutes} minute)</div>
            </div>
            <button
              type="button"
              className="task-nag-toast-close"
              aria-label="Close notification"
              onClick={(event) => {
                event.preventDefault()
                event.stopPropagation()
                toast.dismiss(toastItem.id)
              }}
            >
              x
            </button>
          </div>
          <div className="task-nag-toast-list">
            <div className="task-nag-toast-item">
              <div className="task-nag-toast-item-top">
                <span className="task-nag-toast-tracking">{record.trackingNumber || 'No Tracking #'}</span>
                <span className="task-nag-toast-status">{record.statusLabel || 'Pending'}</span>
              </div>
              <div className="task-nag-toast-subject" title={record.subject}>{record.subject || 'No subject'}</div>
              <div className="task-nag-toast-due">Due: {record.dueDateLabel}</div>
            </div>
          </div>
        </div>
      </SwipeDismissToast>
    ), {
      id: `doc-toast-${record.docKey}`,
      position: 'bottom-right',
      duration: toastDuration,
      removeDelay: 650,
      style: {
        background: 'transparent',
        boxShadow: 'none',
        padding: 0,
        margin: 0,
      },
    })
  }, [isViewingNotifiedDocument, openRecord, playReminderSound, remindersPaused, soundEnabled])

  useEffect(() => {
    if (!activeDocumentId) return
    toast.dismiss(`doc-toast-${activeDocumentId}`)
  }, [activeDocumentId])

  useEffect(() => {
    if (pendingSeedRef.current) return
    if (pendingDocuments.length === 0) return

    setNotifications((prev) => {
      if (prev.length > 0) return prev
      return pendingDocuments
        .slice(0, 20)
        .map((doc) => buildNotificationFromDocument(doc, 'pending'))
        .filter(Boolean)
    })
    pendingSeedRef.current = true
  }, [pendingDocuments])

  useEffect(() => {
    const currentPendingKeys = new Set(
      pendingDocuments
        .map((doc) => getDocumentKey(doc))
        .filter(Boolean)
    )

    if (!pendingInitRef.current) {
      previousPendingKeysRef.current = currentPendingKeys
      pendingInitRef.current = true
      return
    }

    const previousPendingKeys = previousPendingKeysRef.current
    const newlyPendingDocs = pendingDocuments.filter((doc) => {
      const key = getDocumentKey(doc)
      return Boolean(key) && !previousPendingKeys.has(key)
    })

    newlyPendingDocs.forEach((doc) => {
      upsertNotification(doc, 'pending')
    })

    previousPendingKeysRef.current = currentPendingKeys
  }, [pendingDocuments, showDocumentToast, upsertNotification])

  useEffect(() => {
    if (!role) return

    let cancelled = false
    let timeoutId = null

    const scheduleReminder = () => {
      timeoutId = window.setTimeout(() => {
        if (cancelled) return

        const latestPendingDocs = pendingDocumentsRef.current
        const stalePendingDocs = latestPendingDocs.filter((doc) => getPendingDocumentAgeMs(doc) >= PENDING_TOAST_DELAY_MS)
        const alertablePendingDocs = stalePendingDocs.filter((doc) => !isViewingNotifiedDocument(doc))

        if (alertablePendingDocs.length > 0 && !remindersPaused) {
          const topDoc = alertablePendingDocs[0]
          upsertNotification(topDoc, 'reminder')
          showDocumentToast(topDoc, 'reminder')
        }

        scheduleReminder()
      }, REMINDER_DELAY_MS)
    }

    scheduleReminder()

    return () => {
      cancelled = true
      if (timeoutId) {
        window.clearTimeout(timeoutId)
      }
    }
  }, [isViewingNotifiedDocument, role, remindersPaused, showDocumentToast, upsertNotification])

  useEffect(() => {
    return () => {
      clearAudioReplayTimeouts()

      if (audioRef.current) {
        audioRef.current.pause()
        audioRef.current = null
      }
    }
  }, [clearAudioReplayTimeouts])

  const openQueueFromNotification = useCallback(() => {
    setShowNotificationMenu(false)
    navigate(getRoleQueuePath(role))
  }, [navigate, role])

  const handleNotificationClick = useCallback((item) => {
    setNotifications((prev) => prev.map((entry) => (
      entry.docKey === item.docKey
        ? { ...entry, read: true }
        : entry
    )))
    setShowNotificationMenu(false)
    openRecord(item)
  }, [openRecord])

  const handleMarkAllRead = useCallback(() => {
    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })))
  }, [])

  const handleClearNotifications = useCallback(() => {
    setNotifications([])
  }, [])

  const handleToggleSound = useCallback(() => {
    setNotificationPrefs((prev) => ({
      ...prev,
      soundEnabled: !(prev?.soundEnabled !== false),
    }))
  }, [])

  const handleToggleReminderPause = useCallback(() => {
    setNotificationPrefs((prev) => {
      const currentPausedUntil = Number(prev?.reminderPausedUntil) || 0
      const isCurrentlyPaused = currentPausedUntil > Date.now()

      return {
        ...prev,
        reminderPausedUntil: isCurrentlyPaused ? 0 : Date.now() + REMINDER_SNOOZE_MS,
      }
    })
  }, [])

  return (
    <header className="topnav">
      <form className="topnav-search" onSubmit={handleSearch}>
        <i className="bi bi-search"></i>
        <input
          type="text"
          placeholder="Search by control/reference number, subject, or sender..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </form>

      <div className="topnav-actions">
        <Dropdown align="end" show={showNotificationMenu} onToggle={(nextShow) => setShowNotificationMenu(Boolean(nextShow))}>
          <Dropdown.Toggle
            as="button"
            type="button"
            className={`topnav-btn ${bellCount > 0 ? 'topnav-btn-alert' : ''}`}
            title={bellCount > 0 ? `${bellCount} notification(s)` : 'No notifications'}
          >
            <i className="bi bi-bell"></i>
            {bellCount > 0 && (
              <span className="topnav-notif-badge">{bellCount > 99 ? '99+' : bellCount}</span>
            )}
          </Dropdown.Toggle>
          <Dropdown.Menu className="topnav-notification-menu p-0">
            <div className="topnav-notification-head">
              <div>
                <div className="topnav-notification-title">Notifications</div>
                <div className="topnav-notification-subtitle">
                  {pendingCount} pending in your queue
                  {remindersPaused ? ` · reminders paused (${pausedMinutesLeft}m left)` : ''}
                </div>
              </div>
              <div className="topnav-notification-head-actions">
                <button
                  type="button"
                  className={`topnav-notification-head-btn ${soundEnabled ? 'is-active' : ''}`}
                  onClick={handleToggleSound}
                >
                  {soundEnabled ? 'Sound On' : 'Sound Off'}
                </button>
                <button
                  type="button"
                  className={`topnav-notification-head-btn ${remindersPaused ? 'is-active' : ''}`}
                  onClick={handleToggleReminderPause}
                >
                  {remindersPaused ? 'Resume Reminders' : 'Pause 15m'}
                </button>
                <button
                  type="button"
                  className="topnav-notification-head-btn"
                  onClick={handleMarkAllRead}
                  disabled={notifications.length === 0 || unreadCount === 0}
                >
                  Mark all read
                </button>
                <button
                  type="button"
                  className="topnav-notification-head-btn"
                  onClick={handleClearNotifications}
                  disabled={notifications.length === 0}
                >
                  Clear
                </button>
              </div>
            </div>
            <div className="topnav-notification-body">
              {notifications.length === 0 ? (
                <div className="topnav-notification-empty">No notifications yet.</div>
              ) : (
                notifications.slice(0, 18).map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className={`topnav-notification-item ${item.read ? '' : 'is-unread'}`}
                    onClick={() => handleNotificationClick(item)}
                  >
                    <div className="topnav-notification-item-head">
                      <span className="topnav-notification-item-track">{item.trackingNumber || 'No Tracking #'}</span>
                      <span className="topnav-notification-item-time">{formatRelativeTime(item.updatedAt)}</span>
                    </div>
                    <div className="topnav-notification-item-subject" title={item.subject}>{item.subject || 'No subject'}</div>
                    <div className="topnav-notification-item-meta">
                      <span>{item.statusLabel || 'Pending'}</span>
                      <span>Due: {item.dueDateLabel || 'No due date'}</span>
                    </div>
                    <div className="topnav-notification-item-message">{item.message}</div>
                  </button>
                ))
              )}
            </div>
            <div className="topnav-notification-footer">
              <button
                type="button"
                className="topnav-notification-open-queue"
                onClick={openQueueFromNotification}
              >
                Open My Queue
              </button>
            </div>
          </Dropdown.Menu>
        </Dropdown>
        <button type="button" className="topnav-btn" title="Settings">
          <i className="bi bi-gear"></i>
        </button>

        <Dropdown align="end">
          <Dropdown.Toggle as="div" className="topnav-user">
            <div className="topnav-avatar">{initials}</div>
            <div className="d-none d-md-block">
              <div className="topnav-user-name">{currentUser?.name}</div>
              <div className="topnav-user-role">{displayedRole}</div>
            </div>
            <i className="bi bi-chevron-down topnav-user-chevron"></i>
          </Dropdown.Toggle>
          <Dropdown.Menu>
            <Dropdown.Item disabled>
              <small className="text-muted">{currentUser?.division}</small>
            </Dropdown.Item>
            <Dropdown.Divider />
            <Dropdown.Item onClick={onLogout}>
              <i className="bi bi-box-arrow-left me-2"></i>Sign Out
            </Dropdown.Item>
          </Dropdown.Menu>
        </Dropdown>
      </div>
    </header>
  )
}
