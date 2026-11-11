import { useEffect, useState } from 'react'
import { Lava } from './components/Lava'
import { Nav } from './components/Nav'
import { PerfPanel } from './components/PerfPanel'
import type { GlassMode, LavaMode } from './components/PerfPanel'
import { Today } from './components/Today'

export default function App() {
  const [lava, setLava] = useState<LavaMode>('flow')
  const [glass, setGlass] = useState<GlassMode>('blur')

  useEffect(() => {
    document.documentElement.dataset.lava = lava
    document.documentElement.dataset.glass = glass
  }, [lava, glass])

  return (
    <div className="app">
      <Lava />
      <Nav />
      <Today />
      <PerfPanel lava={lava} glass={glass} onLava={setLava} onGlass={setGlass} />
    </div>
  )
}
