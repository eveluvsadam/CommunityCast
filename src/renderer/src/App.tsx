import React, { useEffect, useState } from 'react'
import { HashRouter, Routes, Route } from 'react-router-dom'
import { Sidebar } from './components/Sidebar'
import { TopBar } from './components/TopBar'
import { LivePreview } from './pages/LivePreview'
import { MediaLibrary } from './pages/MediaLibrary'
import { Scheduler } from './pages/Scheduler'
import { Guide } from './pages/Guide'
import { api } from './lib/apiClient'

export function App(): React.JSX.Element {
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    let cancelled = false
    let timer: ReturnType<typeof setTimeout>

    async function poll(): Promise<void> {
      try {
        const health = await api.health()
        if (!cancelled) {
          setConnected(health.ok)
          console.log(`[renderer] connected — db at ${health.dbPath}`)
        }
      } catch {
        if (!cancelled) setConnected(false)
      } finally {
        if (!cancelled) timer = setTimeout(poll, 5000)
      }
    }

    void poll()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [])

  return (
    <HashRouter>
      <div className="cc-app">
        <TopBar connected={connected} />
        <Sidebar />
        <main className="cc-main">
          <Routes>
            <Route path="/" element={<LivePreview />} />
            <Route path="/library" element={<MediaLibrary />} />
            <Route path="/scheduler" element={<Scheduler />} />
            <Route path="/guide" element={<Guide />} />
          </Routes>
        </main>
      </div>
    </HashRouter>
  )
}
