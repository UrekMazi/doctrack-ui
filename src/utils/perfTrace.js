const PERF_FLAG_KEY = 'doctrack_perf'

const flowState = {
  counter: 0,
  active: null,
}

function hasWindow() {
  return typeof window !== 'undefined'
}

function nowMs() {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now()
  }
  return Date.now()
}

function roundMs(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function syncFlagFromUrl() {
  if (!hasWindow()) return

  try {
    const params = new URLSearchParams(window.location.search || '')
    if (params.get('perf') === '1') {
      localStorage.setItem(PERF_FLAG_KEY, '1')
    }
    if (params.get('perf') === '0') {
      localStorage.removeItem(PERF_FLAG_KEY)
    }
  } catch {
    // no-op
  }
}

export function isPerfEnabled() {
  if (!hasWindow()) return false

  syncFlagFromUrl()

  try {
    return localStorage.getItem(PERF_FLAG_KEY) === '1'
  } catch {
    return false
  }
}

export function beginFlow(name, meta = {}) {
  if (!isPerfEnabled()) return null

  const startedAt = nowMs()
  flowState.counter += 1
  flowState.active = {
    id: `${name}-${flowState.counter}`,
    name,
    startedAt,
    events: [{ step: 'flow:begin', at: startedAt, meta }],
  }

  console.info(`[Perf] ${name} started`, meta)
  return flowState.active.id
}

export function markFlow(step, meta = {}) {
  if (!isPerfEnabled()) return
  if (!flowState.active) return

  flowState.active.events.push({
    step,
    at: nowMs(),
    meta,
  })
}

export function endFlow(status = 'done', meta = {}) {
  if (!isPerfEnabled()) return
  if (!flowState.active) return

  const flow = flowState.active
  const finishedAt = nowMs()

  flow.events.push({
    step: `flow:${status}`,
    at: finishedAt,
    meta,
  })

  const rows = flow.events.map((event, index) => {
    const previous = index === 0 ? event : flow.events[index - 1]
    return {
      step: event.step,
      msFromPrev: index === 0 ? 0 : roundMs(event.at - previous.at),
      msFromStart: roundMs(event.at - flow.startedAt),
    }
  })

  console.groupCollapsed(`[Perf] ${flow.name} ${status} ${roundMs(finishedAt - flow.startedAt)}ms`)
  console.table(rows)
  if (Object.keys(meta).length > 0) {
    console.log('final', meta)
  }
  console.groupEnd()

  flowState.active = null
}
