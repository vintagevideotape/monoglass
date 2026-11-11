import { useEffect, useState } from 'react'
import { Budget } from './components/Budget'
import { Data } from './components/Data'
import { Lava } from './components/Lava'
import { Nav } from './components/Nav'
import type { Screen } from './components/Nav'
import { Ops } from './components/Ops'
import { PerfPanel } from './components/PerfPanel'
import type { GlassMode, LavaMode } from './components/PerfPanel'
import { Today } from './components/Today'
import { StoreProvider } from './state/store'

function screenFromHash(): Screen {
  const name = window.location.hash.replace('#', '')
  return name === 'ops' || name === 'budget' || name === 'data' ? name : 'today'
}

export default function App() {
  const [lava, setLava] = useState<LavaMode>('flow')
  const [glass, setGlass] = useState<GlassMode>('blur')
  const [screen, setScreen] = useState<Screen>(screenFromHash)

  useEffect(() => {
    document.documentElement.dataset.lava = lava
    document.documentElement.dataset.glass = glass
  }, [lava, glass])

  useEffect(() => {
    const onHash = () => {
      setScreen(screenFromHash())
      window.scrollTo(0, 0)
    }
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  return (
    <StoreProvider>
      <div className="app" data-screen={screen}>
        <Lava />
        <Nav screen={screen} />
        {screen === 'today' && <Today />}
        {screen === 'ops' && <Ops />}
        {screen === 'budget' && <Budget />}
        {screen === 'data' && <Data />}
        <PerfPanel lava={lava} glass={glass} onLava={setLava} onGlass={setGlass} />
      </div>
    </StoreProvider>
  )
}
