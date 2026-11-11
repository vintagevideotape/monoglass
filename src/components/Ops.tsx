import { useState } from 'react'
import { monthSummary } from '../domain/calc'
import { sum } from '../domain/money'
import type { Operation } from '../domain/types'
import { dayStamp, money, monthName, sameDay } from '../lib/format'
import { useStore } from '../state/store'
import { OpRow } from './OpRow'

type Group = { day: Date; ops: Operation[] }

function groupByDay(ops: Operation[]): Group[] {
  const groups: Group[] = []
  for (const op of ops) {
    const last = groups.at(-1)
    if (last && sameDay(last.day, op.at)) last.ops.push(op)
    else groups.push({ day: op.at, ops: [op] })
  }
  return groups
}

export function Ops() {
  const { now, operations, plans } = useStore()
  const [filter, setFilter] = useState('all')
  const summary = monthSummary(operations, now.getFullYear(), now.getMonth())

  const month = operations.filter((op) => op.at.getFullYear() === now.getFullYear() && op.at.getMonth() === now.getMonth())
  const plan = plans.find((p) => p.id === filter)
  const visible = month.filter((op) => {
    if (filter === 'all') return true
    if (filter === 'project') return op.kind === 'project'
    return (op.kind === 'expense' || op.kind === 'refund') && plan?.categories.includes(op.category)
  })
  const filters = [
    { id: 'all', label: 'Все' },
    ...plans.filter((p) => p.categories.length > 0).map((p) => ({ id: p.id, label: p.name })),
    { id: 'project', label: 'Проекты' },
  ]

  return (
    <main className="screen">
      <header className="meta label">
        {monthName(now)} {now.getFullYear()}
      </header>

      <section className="hero hero-right">
        <div className="label">Расходы за месяц, ₴</div>
        <h1 className="hero-number">{money(summary.spent)}</h1>
      </section>

      <div className="chips" role="group" aria-label="Фильтр">
        {filters.map((item) => (
          <button key={item.id} type="button" className="chip glass label" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)}>
            {item.label}
          </button>
        ))}
      </div>

      <div className="day-list">
        {visible.length === 0 && <p className="muted empty">В этом месяце таких операций нет</p>}
        {groupByDay(visible).map((group) => (
          <section className="card glass ops" key={group.day.toDateString()}>
            <div className="card-head label">
              <h2>{sameDay(group.day, now) ? `Сегодня · ${dayStamp(group.day)}` : dayStamp(group.day)}</h2>
              <span>{money(sum(group.ops.filter((op) => op.kind === 'expense' || op.kind === 'refund').map((op) => op.amount)))}</span>
            </div>
            <ul className="op-list">
              {group.ops.map((op) => (
                <OpRow key={op.id} op={op} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </main>
  )
}
