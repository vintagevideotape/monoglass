import { useEffect, useRef, useState } from 'react'

export type LavaMode = 'flow' | 'frozen' | 'off'
export type GlassMode = 'blur' | 'flat'

type Props = {
  lava: LavaMode
  glass: GlassMode
  onLava: (mode: LavaMode) => void
  onGlass: (mode: GlassMode) => void
}

/** Средний и худший FPS за последние секунды. Нужен только на время проверки плавности. */
function useFps() {
  const [fps, setFps] = useState({ avg: 0, min: 0 })
  const samples = useRef<number[]>([])

  useEffect(() => {
    let raf = 0
    let frames = 0
    let last = performance.now()
    const tick = (now: number) => {
      frames += 1
      if (now - last >= 1000) {
        const value = Math.round((frames * 1000) / (now - last))
        samples.current = [...samples.current.slice(-4), value]
        const avg = Math.round(samples.current.reduce((a, b) => a + b, 0) / samples.current.length)
        setFps({ avg, min: Math.min(...samples.current) })
        frames = 0
        last = now
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  return fps
}

const LAVA: { id: LavaMode; label: string }[] = [
  { id: 'flow', label: 'Плывут' },
  { id: 'frozen', label: 'Замерли' },
  { id: 'off', label: 'Выкл' },
]

const GLASS: { id: GlassMode; label: string }[] = [
  { id: 'blur', label: 'Размытие' },
  { id: 'flat', label: 'Без' },
]

export function PerfPanel({ lava, glass, onLava, onGlass }: Props) {
  const [open, setOpen] = useState(false)
  const fps = useFps()

  return (
    <aside className="perf glass" aria-label="Проверка плавности">
      <button type="button" className="perf-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>FPS {fps.avg || '…'}</span>
        <span className="perf-min">мин {fps.min || '…'}</span>
      </button>
      {open && (
        <div className="perf-body">
          <div className="perf-row">
            <span className="label">Капли</span>
            <div className="perf-seg">
              {LAVA.map((item) => (
                <button key={item.id} type="button" aria-pressed={lava === item.id} onClick={() => onLava(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
          <div className="perf-row">
            <span className="label">Стекло</span>
            <div className="perf-seg">
              {GLASS.map((item) => (
                <button key={item.id} type="button" aria-pressed={glass === item.id} onClick={() => onGlass(item.id)}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </aside>
  )
}
