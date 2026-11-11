import type { Operation } from '../domain/types'
import { clock, money } from '../lib/format'

const NOTES: Partial<Record<Operation['kind'], string>> = {
  project: 'Проект',
  transfer: 'Перевод между своими счетами',
  jar: 'Банка',
  cashTopUp: 'Пополнение наличными',
  personIncoming: 'Перевод от человека · не разобран',
  support: 'От близких',
  refund: 'Возврат',
}

/** Личные расходы — ярко; всё, что не входит в личные расходы, — приглушённо. */
export function OpRow({ op }: { op: Operation }) {
  const personal = op.kind === 'expense' || op.kind === 'refund'
  const note = op.kind === 'expense' ? op.category : [NOTES[op.kind], op.kind === 'refund' ? op.category : ''].filter(Boolean).join(' · ')
  return (
    <li className={personal ? 'op' : 'op op-dim'}>
      <span className="op-time">{clock(op.at)}</span>
      <span className="op-main">
        <span className="op-title">{op.description}</span>
        <span className="muted">{note}</span>
      </span>
      <span className="op-amount">{money(op.amount, { sign: true })}</span>
    </li>
  )
}
