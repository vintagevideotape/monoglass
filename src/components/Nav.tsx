export type Screen = 'today' | 'ops' | 'budget' | 'data'

const TABS: { id: string; label: string; short: string; ready: boolean }[] = [
  { id: 'today', label: 'Сегодня', short: 'Сегодня', ready: true },
  { id: 'ops', label: 'Операции', short: 'Операции', ready: true },
  { id: 'budget', label: 'Бюджет', short: 'Бюджет', ready: true },
  { id: 'calendar', label: 'Календарь', short: 'Календ.', ready: false },
  { id: 'goals', label: 'Цели', short: 'Цели', ready: false },
]

/** Одна навигация на оба формата: капсула внизу на телефоне, колонка слева на широком экране. */
export function Nav({ screen }: { screen: Screen }) {
  return (
    <nav className="nav" aria-label="Разделы">
      <div className="nav-brand">MonoGlass</div>
      <div className="nav-tabs glass">
        {TABS.map((tab) =>
          tab.ready ? (
            <a key={tab.id} href={`#${tab.id}`} className="nav-tab" aria-current={tab.id === screen ? 'page' : undefined}>
              <span className="nav-tab-full">{tab.label}</span>
              <span className="nav-tab-short">{tab.short}</span>
            </a>
          ) : (
            <span key={tab.id} className="nav-tab nav-tab-off" aria-disabled="true" title="Скоро">
              <span className="nav-tab-full">{tab.label}</span>
              <span className="nav-tab-short">{tab.short}</span>
            </span>
          ),
        )}
      </div>
      {/* Ручной ввод, наличные, регулярные платежи и синхронизация живут на экране «Данные». */}
      <a href="#data" className="nav-add" aria-label="Данные и ручной ввод" aria-current={screen === 'data' ? 'page' : undefined}>
        <span className="nav-add-label">Данные и ввод</span>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
          <path d="M12 4v16M4 12h16" />
        </svg>
      </a>
    </nav>
  )
}
