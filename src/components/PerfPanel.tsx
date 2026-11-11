import { useEffect, useRef, useState } from 'react'
import { useStore } from '../state/store'

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
  const [error, setError] = useState<string | null>(null)
  const fps = useFps()
  const { source, operations, importCsv, clearData } = useStore()

  const onFile = async (file: File | undefined) => {
    if (!file) return
    setError(importCsv(await file.text()))
  }

  return (
    <aside className="perf glass" aria-label="Данные и проверка плавности">
      <button type="button" className="perf-toggle" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{source === 'demo' ? 'Демо' : 'Мои данные'}</span>
        <span className="perf-min">FPS {fps.avg || '…'}</span>
      </button>
      {open && (
        <div className="perf-body">
          <div className="perf-row">
            <span className="label">Данные · {operations.length} операций</span>
            <div className="perf-seg">
              <label className="perf-file">
                Загрузить CSV
                <input type="file" accept=".csv,text/csv" onChange={(event) => void onFile(event.target.files?.[0])} />
              </label>
              {source === 'mine' && (
                <button type="button" onClick={clearData}>
                  Удалить
                </button>
              )}
            </div>
            <span className="perf-note">Файл остаётся в этом браузере и никуда не отправляется.</span>
            {error && <span className="perf-note perf-error">{error}</span>}
          </div>
          <div className="perf-row">
            <span className="label">Плавность · мин {fps.min || '…'} FPS</span>
          </div>
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
