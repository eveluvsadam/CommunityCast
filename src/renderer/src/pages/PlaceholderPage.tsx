import React from 'react'

export function PlaceholderPage({
  title,
  phase,
  description
}: {
  title: string
  phase: string
  description: string
}): React.JSX.Element {
  return (
    <div>
      <div className="cc-eyebrow">Roadmap</div>
      <h1>{title}</h1>
      <span className="cc-badge" style={{ color: 'var(--cc-caution)', marginBottom: 16, display: 'inline-flex' }}>
        {phase.toUpperCase()}
      </span>
      <p className="cc-subtitle" style={{ marginTop: 14 }}>
        {description}
      </p>
    </div>
  )
}
