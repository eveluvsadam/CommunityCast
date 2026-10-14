import React from 'react'

type TallyState = 'on-air' | 'standby' | 'off'

const COLORS: Record<TallyState, string> = {
  'on-air': 'var(--cc-on-air)',
  standby: 'var(--cc-standby)',
  off: 'var(--cc-border-strong)'
}

const LABELS: Record<TallyState, string> = {
  'on-air': 'ON AIR',
  standby: 'STANDBY',
  off: 'OFF'
}

export function TallyDot({
  state,
  showLabel = true,
  size = 9
}: {
  state: TallyState
  showLabel?: boolean
  size?: number
}): React.JSX.Element {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        fontFamily: 'var(--cc-font-mono)',
        fontSize: 12,
        letterSpacing: '0.08em',
        color: state === 'off' ? 'var(--cc-text-faint)' : 'var(--cc-text-dim)'
      }}
    >
      <span
        aria-hidden
        style={{
          width: size,
          height: size,
          borderRadius: '50%',
          background: COLORS[state],
          boxShadow:
            state === 'on-air'
              ? '0 0 0 4px var(--cc-on-air-dim), 0 0 12px 1px var(--cc-on-air-glow)'
              : state === 'standby'
                ? '0 0 0 3px var(--cc-standby-dim)'
                : 'none',
          animation: state === 'on-air' ? 'cc-pulse 2.2s ease-in-out infinite' : 'none',
          flexShrink: 0
        }}
      />
      {showLabel && LABELS[state]}
      <style>{`
        @keyframes cc-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </span>
  )
}
