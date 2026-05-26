export const TAG_PRESETS = [
  { key: 'PRIORITY', label: 'PRIORITY', color: '#1b65d7' },
  { key: 'URGENT', label: 'URGENT', color: '#ce1126' },
  { key: 'FOLLOW-UP', label: 'FOLLOW-UP', color: '#f59f00' },
]

export const DEFAULT_CUSTOM_TAG_COLOR = '#6c757d'

const TAG_PRESET_LOOKUP = TAG_PRESETS.reduce((acc, preset) => {
  acc[preset.key] = preset
  return acc
}, {})

const normalizeValue = (value) => String(value || '').trim()

export function normalizeRouteTags(routeTags) {
  if (!Array.isArray(routeTags)) return []

  return routeTags
    .map((tag) => {
      if (typeof tag === 'string') {
        const normalizedKey = normalizeValue(tag).toUpperCase()
        const preset = TAG_PRESET_LOOKUP[normalizedKey]
        if (preset) {
          return { ...preset, kind: 'preset' }
        }

        const label = normalizeValue(tag)
        if (!label) return null
        return {
          key: 'CUSTOM',
          label,
          color: DEFAULT_CUSTOM_TAG_COLOR,
          kind: 'custom',
        }
      }

      if (!tag || typeof tag !== 'object') return null

      const rawKey = normalizeValue(tag.key)
      const label = normalizeValue(tag.label || tag.key)
      const preset = TAG_PRESET_LOOKUP[rawKey.toUpperCase()] || TAG_PRESET_LOOKUP[label.toUpperCase()]
      if (preset) {
        return { ...preset, kind: 'preset' }
      }

      if (!label && !rawKey) return null

      return {
        key: rawKey || 'CUSTOM',
        label: label || rawKey || 'CUSTOM',
        color: normalizeValue(tag.color) || DEFAULT_CUSTOM_TAG_COLOR,
        kind: 'custom',
      }
    })
    .filter(Boolean)
}

export function splitRouteTags(routeTags) {
  const normalized = normalizeRouteTags(routeTags)
  const presetKeys = []
  let customTag = null

  normalized.forEach((tag) => {
    if (tag.kind === 'preset') {
      presetKeys.push(tag.key)
      return
    }

    if (!customTag) {
      customTag = { label: tag.label, color: tag.color || DEFAULT_CUSTOM_TAG_COLOR }
    }
  })

  return { presetKeys, customTag }
}

export function buildRouteTags({ presetKeys = [], customLabel = '', customColor = DEFAULT_CUSTOM_TAG_COLOR } = {}) {
  const normalizedPresetKeys = new Set(
    presetKeys.map((key) => normalizeValue(key).toUpperCase()).filter(Boolean)
  )

  const tags = TAG_PRESETS
    .filter((preset) => normalizedPresetKeys.has(preset.key))
    .map((preset) => ({
      key: preset.key,
      label: preset.label,
      color: preset.color,
      kind: 'preset',
    }))

  const cleanCustomLabel = normalizeValue(customLabel).slice(0, 15)
  if (cleanCustomLabel) {
    tags.push({
      key: 'CUSTOM',
      label: cleanCustomLabel,
      color: normalizeValue(customColor) || DEFAULT_CUSTOM_TAG_COLOR,
      kind: 'custom',
    })
  }

  return tags
}

export function getTagClassName(tag) {
  const key = normalizeValue(tag?.key || tag?.label).toUpperCase()
  if (key === 'PRIORITY') return 'doc-tag doc-tag--priority'
  if (key === 'URGENT') return 'doc-tag doc-tag--urgent'
  if (key === 'FOLLOW-UP' || key === 'FOLLOWUP') return 'doc-tag doc-tag--followup'
  return 'doc-tag doc-tag--custom'
}
