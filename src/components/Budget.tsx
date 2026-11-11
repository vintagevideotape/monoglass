import { useState } from 'react'
import type { CSSProperties } from 'react'
import { unassignedCategories } from '../domain/budget'
import { dailyAllowance, daysInMonth } from '../domain/calc'
import { sum } from '../domain/money'
import type { Allocation, EnvelopePlan } from '../domain/types'
import { money, monthName } from '../lib/format'
import { envelopeViews } from '../state/budget'
import type { EnvelopeView } from '../state/budget'
import { useStore } from '../state/store'

function EnvelopeCard({ view, pace, index, onChange }: { view: EnvelopeView; pace: number; index: number; onChange: (allocation: Allocation) => void }) {
  const [open, setOpen] = useState(false)
  const { now } = useStore()
  const { plan } = view
  const left = view.limit - view.used
  const isPercent = plan.allocation.type === 'percent'
  const value = plan.allocation.type === 'percent' ? plan.allocation.percent : plan.allocation.amount / 100

  const status =
    view.kind === 'save'
      ? `План на месяц ${money(view.limit)} ₴`
      : `Осталось ${money(left)} ₴${view.paced && left > 0 ? ` · ${money(dailyAllowance(left, now))} ₴ в день` : ''}${view.ahead ? ' · быстрее темпа' : ''}`

  const setValue = (raw: string) => {
    const number = Math.max(0, Number(raw.replace(',', '.')) || 0)
    onChange(isPercent ? { type: 'percent', percent: Math.min(100, number) } : { type: 'fixed', amount: Math.round(number * 100) })
  }

  return (
    <section className="card glass envelope">
      <div className="envelope-head">
        <h2 className="envelope-name">{view.name}</h2>
        <span className="envelope-sum">
          {money(view.used)} / {money(view.limit)}
        </span>
      </div>
      <div className="tube" role="img" aria-label={`${view.name}: ${Math.round(view.share * 100)}%`}>
        <div className={view.ahead ? 'tube-fill ahead' : 'tube-fill'} style={{ width: `${view.share * 100}%`, animationDelay: `${index * 70}ms` }} />
        {view.paced && <div className="tube-pace" style={{ left: `${pace * 100}%` }} aria-hidden="true" />}
      </div>
      <div className="envelope-foot">
        <span className="muted">{status}</span>
        <button type="button" className="label link" aria-expanded={open} onClick={() => setOpen(!open)}>
          {isPercent ? `${plan.allocation.type === 'percent' ? plan.allocation.percent : 0}%` : 'сумма'} · настроить
        </button>
      </div>
      {open && (
        <div className="envelope-edit">
          <div className="seg" role="group" aria-label="Как считать лимит">
            <button type="button" aria-pressed={isPercent} onClick={() => onChange({ type: 'percent', percent: 10 })}>
              Процент
            </button>
            <button type="button" aria-pressed={!isPercent} onClick={() => onChange({ type: 'fixed', amount: view.limit })}>
              Сумма
            </button>
          </div>
          <label className="field">
            <span className="label">{isPercent ? 'Процент от остатка дохода' : 'Сумма в месяц, ₴'}</span>
            <input inputMode="decimal" value={String(value)} onChange={(event) => setValue(event.target.value)} />
          </label>
          <p className="muted">{plan.categories.length > 0 ? `Категории: ${plan.categories.join(', ')}` : 'Накопительный конверт: категории расходов не привязаны'}</p>
        </div>
      )}
    </section>
  )
}

export function Budget() {
  const { now, operations, plans, income, setPlans, setIncome } = useStore()
  const { views, allocation, pace } = envelopeViews(operations, plans, income, now)
  const daysLeft = daysInMonth(now) - now.getDate() + 1
  const spendLeft = sum(views.filter((v) => v.kind === 'spend').map((v) => Math.max(0, v.limit - v.used)))
  const loose = unassignedCategories(
    operations.filter((op) => op.at.getFullYear() === now.getFullYear() && op.at.getMonth() === now.getMonth()),
    plans,
  )

  const update = (id: string, next: Allocation) => setPlans(plans.map((p: EnvelopePlan) => (p.id === id ? { ...p, allocation: next } : p)))

  return (
    <main className="screen">
      <header className="meta label">
        {monthName(now)} · ДЕНЬ {now.getDate()}/{daysInMonth(now)}
      </header>

      <section className="hero">
        <div className="label">
          Осталось на {daysLeft} {daysLeft === 1 ? 'день' : daysLeft < 5 ? 'дня' : 'дней'}, ₴
        </div>
        <h1 className="hero-number">{money(spendLeft)}</h1>
      </section>

      <section className="plan glass">
        <label className="field field-inline">
          <span className="label">Доход месяца, ₴</span>
          <input inputMode="decimal" value={String(income / 100)} onChange={(event) => setIncome(Math.round((Number(event.target.value.replace(',', '.')) || 0) * 100))} />
        </label>
        <div className="plan-rest label">
          <span>Не распределено</span>
          <span>{money(allocation.unallocated)}</span>
        </div>
      </section>

      {allocation.problems.map((problem) => (
        <p className="notice" key={problem}>
          {problem}
        </p>
      ))}
      {loose.length > 0 && <p className="notice notice-soft">Без конверта: {loose.join(', ')}</p>}

      <div className="envelope-list" style={{ '--pace': pace } as CSSProperties}>
        {views.map((view, index) => (
          <EnvelopeCard key={view.id} view={view} pace={pace} index={index} onChange={(next) => update(view.id, next)} />
        ))}
      </div>
    </main>
  )
}
