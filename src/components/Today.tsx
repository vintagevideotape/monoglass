import type { CSSProperties } from 'react'
import { accounts, dailyLimit, envelopes, operations, project, today } from '../data/mock'
import type { Envelope } from '../data/mock'
import { dayStamp, daysInMonth, money } from '../lib/format'

const dayOfMonth = today.getDate()
const monthLength = daysInMonth(today)
/** Доля месяца, прошедшая к сегодняшнему дню: с ней сравниваем расход конвертов. */
const pace = dayOfMonth / monthLength

const honestBalance = accounts.reduce((sum, account) => sum + account.amount, 0)
const spentToday = operations.filter((op) => op.personal).reduce((sum, op) => sum - op.amount, 0)
const dayTotal = operations.reduce((sum, op) => sum + op.amount, 0)

/** Запас, в пределах которого опережение темпа не считается проблемой (10 п.п. лимита). */
const PACE_TOLERANCE = 0.1

function isAhead(envelope: Envelope): boolean {
  return envelope.paced && envelope.used / envelope.limit > pace + PACE_TOLERANCE
}

function envelopeValue(envelope: Envelope): string {
  return envelope.kind === 'save'
    ? money(envelope.used, { sign: true })
    : money(envelope.limit - envelope.used)
}

function AccountsGroup({ hidden }: { hidden?: boolean }) {
  return (
    <div className="accounts-group" aria-hidden={hidden || undefined}>
      {accounts.map((account) => (
        <div className="account" key={account.id}>
          <span className="label">{account.label}</span>
          <span className="account-value">
            {account.approx ? '≈ ' : ''}
            {money(account.amount)}
          </span>
        </div>
      ))}
    </div>
  )
}

export function Today() {
  return (
    <main className="today">
      <header className="meta label">
        {dayStamp(today)} · ДЕНЬ {dayOfMonth}/{monthLength}
      </header>

      <section className="hero">
        <div className="label">Честный баланс, ₴</div>
        <h1 className="hero-number">{money(honestBalance)}</h1>
      </section>

      <section className="accounts glass" aria-label="Счета">
        <div className="accounts-track">
          <AccountsGroup />
          <AccountsGroup hidden />
        </div>
      </section>

      <div className="widgets">
        <div className="pair">
          <section className="card glass">
            <div className="label">На сегодня</div>
            <div className="card-number">{money(dailyLimit - spentToday)}</div>
            <div className="muted">осталось из {money(dailyLimit)} ₴</div>
          </section>
          <section className="card glass card-project">
            <div className="label">Проектные</div>
            <div className="card-number card-number-small">{money(project.balance)}</div>
            <div className="muted">{project.name} · остаток</div>
          </section>
        </div>

        <section className="card glass envelopes">
          <div className="card-head label">
            <h2>Конверты</h2>
            <span className="legend">
              <i aria-hidden="true" />
              Темп месяца
            </span>
          </div>
          <div className="capsules" style={{ '--pace': pace } as CSSProperties}>
            {envelopes.map((envelope, index) => (
              <div className="capsule-cell" key={envelope.id}>
                <div
                  className="capsule"
                  role="img"
                  aria-label={`${envelope.name}: ${Math.round((envelope.used / envelope.limit) * 100)}%`}
                >
                  <div
                    className={isAhead(envelope) ? 'capsule-fill ahead' : 'capsule-fill'}
                    style={{ height: `${(envelope.used / envelope.limit) * 100}%`, animationDelay: `${index * 80}ms` }}
                  />
                </div>
              </div>
            ))}
            <div className="pace-line" aria-hidden="true" />
          </div>
          <div className="capsule-labels">
            {envelopes.map((envelope) => (
              <div key={envelope.id}>
                <div className="capsule-name">{envelope.name}</div>
                <div className="capsule-value">{envelopeValue(envelope)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="card glass ops">
          <div className="card-head label">
            <h2>Операции за день</h2>
            <span>{money(dayTotal)} ₴</span>
          </div>
          <ul className="op-list">
            {operations.map((op) => (
              <li className={op.personal ? 'op' : 'op op-dim'} key={op.id}>
                <span className="op-time">{op.time}</span>
                <span className="op-main">
                  <span className="op-title">{op.title}</span>
                  <span className="muted">{op.note}</span>
                </span>
                <span className="op-amount">{money(op.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  )
}
