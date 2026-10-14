import React, { useEffect, useState } from 'react'
import { Radio } from 'lucide-react'
import { TallyDot } from './TallyDot'

export function TopBar({ connected }: { connected: boolean }): React.JSX.Element {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const time = now.toLocaleTimeString('en-US', { hour12: false })
  const date = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })

  return (
    <header
      className="cc-topbar"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 22px',
        borderBottom: '1px solid var(--cc-border)',
        background: 'var(--cc-surface)',
        WebkitAppRegion: 'drag'
      } as React.CSSProperties}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div
          style={{
            width: 30,
            height: 30,
            borderRadius: 7,
            background: 'linear-gradient(155deg, var(--cc-surface-raised), var(--cc-bg-well))',
            border: '1px solid var(--cc-border-strong)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
        >
          <Radio size={16} color="var(--cc-standby)" strokeWidth={2.25} />
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <span
            style={{
              fontFamily: 'var(--cc-font-display)',
              fontWeight: 700,
              fontSize: 18,
              letterSpacing: '0.02em'
            }}
          >
            COMMUNITYCAST
          </span>
          <span style={{ color: 'var(--cc-text-faint)', fontSize: 12 }}>Channel Control</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 22 }}>
        <TallyDot state={connected ? 'standby' : 'off'} showLabel={false} size={7} />
        <span style={{ fontSize: 12, color: 'var(--cc-text-faint)' }}>
          {connected ? 'Backend connected' : 'Backend unreachable'}
        </span>
        <div
          style={{
            width: 1,
            height: 20,
            background: 'var(--cc-border-strong)'
          }}
        />
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
          <span style={{ fontFamily: 'var(--cc-font-mono)', fontSize: 11, color: 'var(--cc-text-faint)' }}>
            {date}
          </span>
          <span style={{ fontFamily: 'var(--cc-font-mono)', fontSize: 15, letterSpacing: '0.04em' }}>
            {time}
          </span>
        </div>
      </div>
    </header>
  )
}
