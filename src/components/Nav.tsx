const TABS = [
  { id: 'today', label: 'Сегодня', short: 'Сегодня' },
  { id: 'ops', label: 'Операции', short: 'Операции' },
  { id: 'budget', label: 'Бюджет', short: 'Бюджет' },
  { id: 'calendar', label: 'Календарь', short: 'Календ.' },
  { id: 'goals', label: 'Цели', short: 'Цели' },
]

/** Одна навигация на оба формата: капсула внизу на телефоне, колонка слева на широком экране. */
export function Nav() {
  return (
    <nav className="nav" aria-label="Разделы">
      <div className="nav-brand">MonoGlass</div>
      <div className="nav-tabs glass">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className="nav-tab"
            aria-current={tab.id === 'today' ? 'page' : undefined}
          >
            <span className="nav-tab-full">{tab.label}</span>
            <span className="nav-tab-short">{tab.short}</span>
          </button>
        ))}
      </div>
      <button type="button" className="nav-add" aria-label="Добавить операцию">
        <span className="nav-add-label">Добавить операцию</span>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" aria-hidden="true">
          <path d="M12 4v16M4 12h16" />
        </svg>
      </button>
    </nav>
  )
}
