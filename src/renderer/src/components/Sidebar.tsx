import React from 'react'
import { NavLink } from 'react-router-dom'
import { Tv2, FolderOpen, CalendarClock, LayoutGrid } from 'lucide-react'

const NAV_ITEMS = [
  { to: '/', label: 'Live Preview', end: true, Icon: Tv2 },
  { to: '/library', label: 'Media Library', Icon: FolderOpen },
  { to: '/scheduler', label: 'Scheduler', Icon: CalendarClock },
  { to: '/guide', label: 'TV Guide', Icon: LayoutGrid }
]

export function Sidebar(): React.JSX.Element {
  return (
    <nav
      className="cc-sidebar"
      style={{
        background: 'var(--cc-surface)',
        borderRight: '1px solid var(--cc-border)',
        padding: '18px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 3
      }}
    >
      {NAV_ITEMS.map(({ to, label, end, Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          style={({ isActive }) => ({
            display: 'flex',
            alignItems: 'center',
            gap: 11,
            padding: '10px 14px',
            borderRadius: 'var(--cc-radius)',
            fontFamily: 'var(--cc-font-display)',
            fontWeight: 600,
            fontSize: 15,
            letterSpacing: '0.01em',
            textDecoration: 'none',
            color: isActive ? 'var(--cc-text)' : 'var(--cc-text-dim)',
            background: isActive ? 'var(--cc-surface-raised)' : 'transparent',
            boxShadow: isActive ? 'inset 2px 0 0 0 var(--cc-standby)' : 'none',
            transition: 'background 150ms ease, color 150ms ease'
          })}
        >
          {({ isActive }: { isActive: boolean }) => (
            <>
              <Icon size={17} strokeWidth={2} color={isActive ? 'var(--cc-standby)' : 'currentColor'} />
              {label}
            </>
          )}
        </NavLink>
      ))}
    </nav>
  )
}
