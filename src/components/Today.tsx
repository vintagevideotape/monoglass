import type { CSSProperties } from 'react'
import { demoAccounts, demoProject } from '../data/demo'
import { dailyAllowance, daysInMonth, honestBalance, monthSummary } from '../domain/calc'
import { sum } from '../domain/money'
import { cashBalance, ownBalance } from '../domain/raw'
import { dayStamp, money, monthName, sameDay } from '../lib/format'
import { envelopeViews } from '../state/budget'
import { useStore } from '../state/store'
import type { Cloud } from '../state/store'
import { OpRow } from './OpRow'

type AccountView = { id: string; label: string; balance: number; approx?: boolean }

/** Счета из базы: карты без кредитного лимита, наличные; валюта пересчитана в гривну по курсу НБУ. */
function cloudAccounts(cloud: Cloud): AccountView[] {
  const feeder = cloud.accounts.find((account) => account.source === 'cash' && account.currency === 980 && !account.archived)?.id
  const rate = (currency: number) => (currency === 980 ? 1 : currency === 840 ? cloud.fx?.USD : currency === 978 ? cloud.fx?.EUR : null)
  return cloud.accounts
    .filter((account) => !account.archived && (account.source === 'cash' || account.sync === 1))
    .flatMap((account) => {
      const own = account.source === 'cash' ? cashBalance(account, cloud.rows, account.id === feeder) : ownBalance(account)
      const k = rate(account.currency)
      if (!k) return []
      return [{ id: account.id, label: account.name, balance: Math.round(own * k), approx: account.currency !== 980 }]
    })
}

function AccountsGroup({ accounts, hidden }: { accounts: AccountView[]; hidden?: boolean }) {
  return (
    <div className="accounts-group" aria-hidden={hidden || undefined}>
      {accounts.map((account) => (
        <div className="account" key={account.id}>
          <span className="label">{account.label}</span>
          <span className="account-value">
            {account.approx ? '≈ ' : ''}
            {money(account.balance)}
          </span>
        </div>
      ))}
    </div>
  )
}

export function Today() {
  const { now, source, operations, plans, income, cloud } = useStore()
  const demo = source === 'demo'
  const accounts = cloud ? cloudAccounts(cloud) : demo ? demoAccounts : []
  const summary = monthSummary(operations, now.getFullYear(), now.getMonth())
  const { views, pace } = envelopeViews(operations, plans, income, now)

  const todayOps = operations.filter((op) => sameDay(op.at, now))
  const spentToday = 0 - sum(todayOps.filter((op) => op.kind === 'expense' || op.kind === 'refund').map((op) => op.amount))
  const pacedLeft = sum(views.filter((v) => v.kind === 'spend' && v.paced).map((v) => v.limit - v.used))
  const dayLimit = dailyAllowance(pacedLeft + spentToday, now)

  // Остатки счетов появятся после подключения банка; до тех пор на своих данных показываем расход месяца.
  // Проектные кошельки ещё не заведены, поэтому в базе пока показываем сумму своих денег на счетах, без вычета проектных.
  const hero = demo
    ? { label: 'Честный баланс, ₴', value: honestBalance(demoAccounts, [demoProject]) }
    : cloud
      ? { label: 'На счетах и в наличных, ₴', value: sum(accounts.map((account) => account.balance)) }
      : { label: `Расходы за ${monthName(now)}, ₴`, value: summary.spent }
  const project = demo
    ? { value: demoProject.remainder, note: `${demoProject.name} · остаток` }
    : { value: summary.projectOut - summary.projectIn, note: 'расход за месяц' }

  return (
    <main className="screen">
      <header className="meta label">
        {dayStamp(now)} · ДЕНЬ {now.getDate()}/{daysInMonth(now)}
      </header>

      <section className="hero">
        <div className="label">{hero.label}</div>
        <h1 className="hero-number">{money(hero.value)}</h1>
      </section>

      {accounts.length > 0 && (
        <section className="accounts glass" aria-label="Счета">
          <div className="accounts-track">
            <AccountsGroup accounts={accounts} />
            <AccountsGroup accounts={accounts} hidden />
          </div>
        </section>
      )}

      <div className="widgets">
        <div className="pair">
          <section className="card glass">
            <div className="label">На сегодня</div>
            <div className="card-number">{money(dayLimit - spentToday)}</div>
            <div className="muted">осталось из {money(dayLimit)} ₴</div>
          </section>
          <section className="card glass card-project">
            <div className="label">Проектные</div>
            <div className="card-number card-number-small">{money(project.value)}</div>
            <div className="muted">{project.note}</div>
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
          <div className="capsules" style={{ '--pace': pace, '--count': views.length } as CSSProperties}>
            {views.map((view, index) => (
              <div className="capsule-cell" key={view.id}>
                <div className="capsule" role="img" aria-label={`${view.name}: ${Math.round(view.share * 100)}%`}>
                  <div
                    className={view.ahead ? 'capsule-fill ahead' : 'capsule-fill'}
                    style={{ height: `${view.share * 100}%`, animationDelay: `${index * 80}ms` }}
                  />
                </div>
              </div>
            ))}
            <div className="pace-line" aria-hidden="true" />
          </div>
          <div className="capsule-labels" style={{ '--count': views.length } as CSSProperties}>
            {views.map((view) => (
              <div key={view.id}>
                <div className="capsule-name">{view.name}</div>
                <div className="capsule-value">{money(view.limit - view.used)}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="card glass ops">
          <div className="card-head label">
            <h2>Операции за день</h2>
            <span>{money(sum(todayOps.map((op) => op.amount)))} ₴</span>
          </div>
          {todayOps.length === 0 ? (
            <p className="muted empty">Сегодня операций нет</p>
          ) : (
            <ul className="op-list">
              {todayOps.map((op) => (
                <OpRow key={op.id} op={op} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  )
}
