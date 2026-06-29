import React from 'react'

const segmentConfig = [
  { key: 'wip', label: 'WIP', color: '#5b9bd5' },
  { key: 'completed', label: 'Completed', color: '#ed7d31' },
  { key: 'overdue', label: 'Overdue', color: '#a5a5a5' },
]

const wrapLabel = (label, maxCharsPerLine = 15, maxLines = 3) => {
  const words = String(label || '').trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return ['']

  const lines = []
  let currentLine = words.shift()

  words.forEach((word) => {
    const candidate = `${currentLine} ${word}`
    if (candidate.length <= maxCharsPerLine) {
      currentLine = candidate
      return
    }

    lines.push(currentLine)
    currentLine = word
  })

  if (currentLine) lines.push(currentLine)
  if (lines.length <= maxLines) return lines

  const merged = lines.slice(0, maxLines - 1)
  merged.push(lines.slice(maxLines - 1).join(' '))
  return merged
}

export default function StatusOverviewChart({ data, hideXAxisLabel = false }) {
  const groups = Array.isArray(data) ? data : []
  const maxValue = Math.max(1, ...groups.flatMap((group) => [group.wip || 0, group.completed || 0, group.overdue || 0]))
  const chartHeight = 240
  const leftPad = 40
  const rightPad = 20
  const groupGap = 12
  const groupWidth = 96
  const groupLayout = groups.map((group) => {
    const label = String(group.division || '').trim()
    return {
      ...group,
      label,
      labelLines: wrapLabel(label),
    }
  })
  const chartWidth = Math.max(
    520,
    leftPad + rightPad + (groupLayout.length * groupWidth) + Math.max(0, groupLayout.length - 1) * groupGap,
  )
  const barWidth = 16
  const barGap = 4
  const clusterWidth = segmentConfig.length * barWidth + (segmentConfig.length - 1) * barGap

  return (
    <div className="records-chart-sheet">
      <div className="records-chart-title">STATUS OVERVIEW</div>
      <div className="records-chart-canvas-wrap">
        {groups.length === 0 ? (
          <div className="records-chart-empty">No routed division data yet.</div>
        ) : (
          <svg
            className="records-chart-canvas"
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            preserveAspectRatio="xMidYMid meet"
            style={{ width: `${chartWidth}px`, margin: '0 auto' }}
          >
            <line x1={leftPad} y1="16" x2={`${chartWidth - rightPad}`} y2="16" className="records-chart-gridline" />
            <line x1={leftPad} y1="64" x2={`${chartWidth - rightPad}`} y2="64" className="records-chart-gridline" />
            <line x1={leftPad} y1="112" x2={`${chartWidth - rightPad}`} y2="112" className="records-chart-gridline" />
            <line x1={leftPad} y1="160" x2={`${chartWidth - rightPad}`} y2="160" className="records-chart-gridline" />
            <line x1={leftPad} y1="208" x2={`${chartWidth - rightPad}`} y2="208" className="records-chart-gridline" />

            {groupLayout.map((group, groupIndex) => {
              const groupStart = leftPad + groupIndex * (groupWidth + groupGap)
              const centerX = groupStart + (groupWidth / 2)
              const values = segmentConfig.map((segment) => Number(group[segment.key] || 0))
              const barStart = centerX - (clusterWidth / 2)

              return (
                <g key={group.division}>
                  {segmentConfig.map((segment, segmentIndex) => {
                    const value = values[segmentIndex]
                    const barHeight = Math.max(0, Math.round((value / maxValue) * 164))
                    const x = barStart + segmentIndex * (barWidth + barGap)
                    const y = 176 - barHeight

                    return (
                      <g key={segment.key}>
                        <rect x={x} y={y} width={barWidth} height={barHeight} fill={segment.color} />
                        <text x={x + (barWidth / 2)} y={Math.max(12, y - 4)} textAnchor="middle" className="records-chart-value">{value}</text>
                      </g>
                    )
                  })}
                  {!hideXAxisLabel && (
                    <text x={centerX} y={194} textAnchor="middle" className="records-chart-label">
                      {group.labelLines.map((line, lineIndex) => (
                        <tspan key={`${group.division}-${lineIndex}`} x={centerX} dy={lineIndex === 0 ? 0 : 11}>
                          {line}
                        </tspan>
                      ))}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        )}
      </div>

      <div className="records-chart-legend">
        {segmentConfig.map((segment) => (
          <span key={segment.key} className="records-chart-legend-item">
            <span className="records-chart-dot" style={{ backgroundColor: segment.color }} />
            {segment.label}
          </span>
        ))}
      </div>
    </div>
  )
}
