import React from 'react'
import { Clapperboard, Megaphone, Sparkles, Bell, Film, type LucideIcon } from 'lucide-react'
import type { MediaType } from '@shared/types'

const LABELS: Record<MediaType, string> = {
  program: 'PROGRAM',
  commercial: 'COMMERCIAL',
  promo: 'PROMO',
  announcement: 'ANNOUNCEMENT',
  bumper: 'BUMPER'
}

const COLORS: Record<MediaType, string> = {
  program: 'var(--cc-standby)',
  commercial: 'var(--cc-caution)',
  promo: 'var(--cc-on-air)',
  announcement: 'var(--cc-info)',
  bumper: 'var(--cc-text-dim)'
}

const ICONS: Record<MediaType, LucideIcon> = {
  program: Clapperboard,
  commercial: Megaphone,
  promo: Sparkles,
  announcement: Bell,
  bumper: Film
}

export function MediaTypeBadge({ type }: { type: MediaType }): React.JSX.Element {
  const Icon = ICONS[type]
  return (
    <span className="cc-badge" style={{ color: COLORS[type] }}>
      <Icon size={10} />
      {LABELS[type]}
    </span>
  )
}
