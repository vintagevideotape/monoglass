import { useEffect, useState } from 'react'
import type { LegacyReport } from '../api/client'
import { ApiError } from '../api/client'
import { kyivPeriod } from '../domain/kyiv'
import { cashBalance, ownBalance } from '../domain/raw'
import type { AccountRow } from '../domain/raw'
import { recurringStatus } from '../domain/recurring'
import type { Recurring, RecurringStatus } from '../domain/recurring'
import { money, monthName, stamp } from '../lib/format'
import { useStore } from '../state/store'
import type { Cloud } from '../state/store'

const SIGN: Record<number, string> = { 980: '₴', 840: '$', 978: '€' }

function toKopecks(raw: string): number {
  return Math.round((Number(raw.replace(/\s/g, '').replace(',', '.')) || 0) * 100)
}

function message(failure: unknown): string {
  return failure instanceof ApiError || failure instanceof Error ? failure.message : 'Не получилось'
}

/** Поле, которое сохраняет значение при выходе из него или по Enter, а не на каждую букву. */
function Commit({ label, value, onCommit, numeric, narrow }: { label: string; value: string; onCommit: (next: string) => void; numeric?: boolean; narrow?: boolean }) {
  const [draft, setDraft] = useState(value)
  const [seen, setSeen] = useState(value)
  if (seen !== value) {
    setSeen(value)
    setDraft(value)
  }
  const commit = () => {
    if (draft !== value) onCommit(draft)
  }
  return (
    <label className={narrow ? 'field field-narrow' : 'field'}>
      <span className="label">{label}</span>
      <input
        inputMode={numeric ? 'decimal' : undefined}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.currentTarget.blur()
        }}
      />
    </label>
  )
}

function SyncCard({ cloud, onError }: { cloud: Cloud; onError: (text: string | null) => void }) {
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')
  const { sync } = cloud
  const cards = cloud.accounts.filter((account) => account.source === 'mono' && !account.archived)
  const status = !sync.hasToken
    ? 'Токен Monobank не задан'
    : sync.accountsAt === 0
      ? 'Ждёт первого запроса к банку'
      : sync.jobs.pending > 0
        ? `Загружается история: осталось ${sync.jobs.pending} из ${sync.jobs.pending + sync.jobs.done} запросов, по одному раз в две минуты`
        : sync.okAt > 0
          ? `Обновлено ${stamp(sync.okAt)}`
          : 'История загружена, ждёт свежей выписки'

  const run = async () => {
    setBusy(true)
    try {
      setNote(await cloud.syncNow())
      onError(null)
    } catch (failure) {
      onError(message(failure))
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="card glass">
      <div className="card-head label">
        <h2>Monobank</h2>
        <span>{sync.jobs.failed > 0 ? `сбоев: ${sync.jobs.failed}` : ''}</span>
      </div>
      <p className="muted data-status">{status}</p>
      {sync.error !== '' && <p className="notice">{sync.error}</p>}
      <ul className="data-list">
        {cards.map((account) => (
          <li className="data-row" key={account.id}>
            <span className="data-main">
              <span className="data-title">{account.name}</span>
              <span className="muted">{account.sync ? (account.synced_to > 0 ? `выписка до ${stamp(account.synced_to)}` : 'в очереди') : 'не загружается'}</span>
            </span>
            <span className="data-value">
              {money(ownBalance(account))} {SIGN[account.currency] ?? ''}
            </span>
            <button type="button" className="pill" aria-pressed={account.sync === 1} onClick={() => cloud.patchAccount(account.id, { sync: account.sync !== 1 }).catch((failure) => onError(message(failure)))}>
              {account.sync ? 'Вкл' : 'Выкл'}
            </button>
          </li>
        ))}
        {cards.length === 0 && <li className="muted">Счета появятся после первого запроса к банку</li>}
      </ul>
      <div className="data-actions">
        <button type="button" className="pill pill-wide" disabled={busy || !sync.hasToken} onClick={run}>
          {busy ? 'Запрос…' : 'Обновить сейчас'}
        </button>
        <span className="muted">{note}</span>
      </div>
    </section>
  )
}

function CashCard({ cloud, categories, onError }: { cloud: Cloud; categories: string[]; onError: (text: string | null) => void }) {
  const cash = cloud.accounts.filter((account) => account.source === 'cash' && !account.archived).sort((a, b) => Number(b.currency === 980) - Number(a.currency === 980))
  const feeder = cash.find((account) => account.currency === 980)?.id
  const balanceOf = (account: AccountRow) => cashBalance(account, cloud.rows, account.id === feeder)
  const [direction, setDirection] = useState<'out' | 'in'>('out')
  const [accountId, setAccountId] = useState('')
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const target = cash.find((account) => account.id === accountId) ?? cash[0]

  /** «Сейчас на руках 3 000» → стартовая сумма пересчитывается так, чтобы остаток стал таким. */
  const setNow = (account: AccountRow, raw: string) => {
    const manual = cloud.rows.filter((row) => row.account_id === account.id && !row.deleted).reduce((total, row) => total + row.amount, 0)
    cloud.patchAccount(account.id, { opening_balance: toKopecks(raw) - manual }).catch((failure) => onError(message(failure)))
  }

  const add = async () => {
    const value = toKopecks(amount)
    if (!target || value <= 0) return onError('Укажите сумму')
    try {
      await cloud.addOp({
        account_id: target.id,
        amount: direction === 'out' ? -value : value,
        description: description.trim() || (direction === 'out' ? 'Наличные' : 'Доход наличными'),
        kind: direction === 'out' ? 'expense' : 'income',
        category: direction === 'out' ? category : '',
      })
      setAmount('')
      setDescription('')
      onError(null)
    } catch (failure) {
      onError(message(failure))
    }
  }

  const recent = cloud.rows.filter((row) => row.source === 'manual').slice(0, 5)

  return (
    <section className="card glass" id="cash">
      <div className="card-head label">
        <h2>Наличные</h2>
        <span>{cloud.fx?.USD ? `$ = ${cloud.fx.USD.toFixed(2)} ₴` : ''}</span>
      </div>
      <div className="data-grid">
        {cash.map((account) => (
          <Commit key={account.id} label={`${account.name} — сейчас на руках`} numeric value={String(balanceOf(account) / 100)} onCommit={(raw) => setNow(account, raw)} />
        ))}
      </div>
      <p className="muted data-status">Пополнения карты через терминал сами уменьшают гривневые наличные.</p>

      <div className="data-form">
        <div className="seg" role="group" aria-label="Тип операции">
          <button type="button" aria-pressed={direction === 'out'} onClick={() => setDirection('out')}>
            Расход
          </button>
          <button type="button" aria-pressed={direction === 'in'} onClick={() => setDirection('in')}>
            Доход
          </button>
        </div>
        <div className="seg" role="group" aria-label="Счёт">
          {cash.map((account) => (
            <button type="button" key={account.id} aria-pressed={target?.id === account.id} onClick={() => setAccountId(account.id)}>
              {account.name}
            </button>
          ))}
        </div>
        <div className="data-grid">
          <label className="field">
            <span className="label">Сумма, {SIGN[target?.currency ?? 980] ?? ''}</span>
            <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </label>
          <label className="field">
            <span className="label">Описание</span>
            <input value={description} onChange={(event) => setDescription(event.target.value)} />
          </label>
        </div>
        {direction === 'out' && (
          <label className="field">
            <span className="label">Категория</span>
            <select value={category} onChange={(event) => setCategory(event.target.value)}>
              <option value="">Без категории</option>
              {categories.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
        )}
        <button type="button" className="pill pill-wide pill-accent" onClick={add}>
          Добавить операцию
        </button>
      </div>

      {recent.length > 0 && (
        <ul className="data-list">
          {recent.map((row) => (
            <li className="data-row" key={row.id}>
              <span className="data-main">
                <span className="data-title">{row.description}</span>
                <span className="muted">{stamp(row.at)}</span>
              </span>
              <span className="data-value">
                {money(row.amount, { sign: true })} {SIGN[row.currency] ?? ''}
              </span>
              <button type="button" className="label link" onClick={() => cloud.removeOp(row.id).catch((failure) => onError(message(failure)))}>
                удалить
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function RecurringRow({ item, cloud, onError }: { item: RecurringStatus; cloud: Cloud; onError: (text: string | null) => void }) {
  const { recurring } = item
  const [paying, setPaying] = useState(false)
  const [amount, setAmount] = useState(String(recurring.amount / 100))
  const [planned, setPlanned] = useState(recurring.amount)
  if (planned !== recurring.amount) {
    setPlanned(recurring.amount)
    setAmount(String(recurring.amount / 100))
  }
  const save = (patch: Partial<Recurring>) => cloud.saveRecurring({ ...recurring, ...patch }).catch((failure) => onError(message(failure)))
  const state: Record<RecurringStatus['state'], string> = {
    unset: 'сумма не задана',
    paid: `оплачено ${money(item.paid)} ₴`,
    due: item.daysLeft === 0 ? 'срок сегодня' : `срок через ${item.daysLeft} дн.`,
    overdue: `просрочено на ${-item.daysLeft} дн.`,
    upcoming: `до ${recurring.day}-го числа`,
  }

  const pay = async () => {
    const value = toKopecks(amount)
    if (value <= 0 || !recurring.account_id) return onError('Укажите сумму платежа')
    try {
      await cloud.addOp({ account_id: recurring.account_id, amount: -value, description: recurring.name, kind: 'expense', category: recurring.category, recurring_id: recurring.id, period: item.period })
      setPaying(false)
      onError(null)
    } catch (failure) {
      onError(message(failure))
    }
  }

  return (
    <li className="data-recurring">
      <div className="data-grid data-grid-3">
        <Commit label="Название" value={recurring.name} onCommit={(name) => save({ name: name.trim() || recurring.name })} />
        <Commit label={recurring.variable ? 'Обычно в месяц, ₴' : 'В месяц, ₴'} numeric value={String(recurring.amount / 100)} onCommit={(raw) => save({ amount: Math.max(0, toKopecks(raw)) })} />
        <Commit label="День" numeric narrow value={String(recurring.day)} onCommit={(raw) => save({ day: Math.min(31, Math.max(1, Math.round(Number(raw)) || 1)) })} />
      </div>
      <div className="data-actions">
        <span className={item.state === 'overdue' ? 'data-state data-state-hot' : 'data-state'}>{state[item.state]}</span>
        <button type="button" className="pill" aria-pressed={recurring.variable === 1} onClick={() => save({ variable: recurring.variable ? 0 : 1 })} title="Сумма меняется от месяца к месяцу">
          {recurring.variable ? 'Сумма плавает' : 'Сумма постоянная'}
        </button>
        {item.state !== 'paid' && (
          <button type="button" className="pill" onClick={() => setPaying(!paying)}>
            Отметить оплату
          </button>
        )}
        <button type="button" className="label link" onClick={() => cloud.removeRecurring(recurring.id).catch((failure) => onError(message(failure)))}>
          убрать
        </button>
      </div>
      {paying && (
        <div className="data-actions">
          <label className="field field-narrow">
            <span className="label">Заплачено, ₴</span>
            <input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
          </label>
          <button type="button" className="pill pill-accent" onClick={pay}>
            Записать
          </button>
        </div>
      )}
    </li>
  )
}

function RecurringCard({ cloud, onError }: { cloud: Cloud; onError: (text: string | null) => void }) {
  const { now } = useStore()
  const statuses = recurringStatus(cloud.recurring, cloud.rows, Math.floor(now.getTime() / 1000))
  const total = cloud.recurring.filter((item) => item.active).reduce((sum, item) => sum + item.amount, 0)
  const cashUah = cloud.accounts.find((account) => account.source === 'cash' && account.currency === 980)?.id ?? null
  const add = () =>
    cloud
      .saveRecurring({ id: `r_${crypto.randomUUID()}`, name: 'Новый платёж', amount: 0, currency: 980, day: 1, category: 'Жильё', account_id: cashUah, variable: 0, active: 1 })
      .catch((failure) => onError(message(failure)))

  return (
    <section className="card glass">
      <div className="card-head label">
        <h2>Регулярные платежи · {monthName(now)}</h2>
        <span>{money(total)} ₴ / мес</span>
      </div>
      <p className="muted data-status">То, чего нет в выписке банка: аренда, коммуналка. Платятся наличными, входят в конверт «Фикс».</p>
      <ul className="data-list">
        {statuses.map((item) => (
          <RecurringRow key={item.recurring.id} item={item} cloud={cloud} onError={onError} />
        ))}
      </ul>
      <button type="button" className="pill pill-wide" onClick={add}>
        Добавить платёж
      </button>
    </section>
  )
}

function LegacyCard({ cloud, onError }: { cloud: Cloud; onError: (text: string | null) => void }) {
  const [progress, setProgress] = useState<string | null>(null)
  const [report, setReport] = useState<LegacyReport | null>(null)

  useEffect(() => {
    cloud.legacyReport().then(setReport, () => undefined)
    // Сверка перечитывается, когда меняется число операций.
  }, [cloud.rows.length]) // eslint-disable-line react-hooks/exhaustive-deps

  const pick = async (file: File | undefined) => {
    if (!file) return
    try {
      setProgress('Читаю файл…')
      setReport(await cloud.importLegacy(await file.text(), (done, total) => setProgress(`Перенесено ${done} из ${total}`)))
      setProgress(null)
      onError(null)
    } catch (failure) {
      setProgress(null)
      onError(message(failure))
    }
  }

  const lines: [string, string][] = report
    ? [
        ['Строк из таблицы', String(report.legacyTotal)],
        ['Нашли пару в выписке банка', `${report.matchedById + report.matchedByFingerprint} (по ID ${report.matchedById}, по сумме и времени ${report.matchedByFingerprint})`],
        ['Пока без пары', `${report.unmatched}${report.unmatchedInsideBankPeriod > 0 ? ` (из них ${report.unmatchedInsideBankPeriod} в уже загруженном периоде)` : ''}`],
        ['Операций банка без строки в таблице', String(report.bankOnly)],
        ['Возможные дубли', String(report.possibleDuplicates)],
        ['Приход / расход по строкам таблицы, ₴', `${money(report.legacyIn)} / ${money(report.legacyOut)}`],
        ['Период', report.legacyFrom && report.legacyTo ? `${kyivPeriod(report.legacyFrom)} — ${kyivPeriod(report.legacyTo)}` : '—'],
      ]
    : []

  return (
    <section className="card glass">
      <div className="card-head label">
        <h2>История из старой таблицы</h2>
      </div>
      <p className="muted data-status">Лист Transactions, сохранённый как CSV. Можно загружать повторно: дублей не будет. Файл уходит только в вашу базу.</p>
      <label className="pill pill-wide data-file">
        {progress ?? 'Выбрать CSV'}
        <input type="file" accept=".csv,text/csv" disabled={progress !== null} onChange={(event) => void pick(event.target.files?.[0])} />
      </label>
      {report && report.legacyTotal > 0 && (
        <dl className="data-report">
          {lines.map(([name, value]) => (
            <div key={name}>
              <dt className="muted">{name}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  )
}

export function Data() {
  const { cloud, loading, plans } = useStore()
  const [error, setError] = useState<string | null>(null)

  if (!cloud) {
    return (
      <main className="screen">
        <header className="meta label">Данные</header>
        <section className="card glass">
          <p className="muted empty">{loading ? 'Подключаюсь к базе…' : 'База не подключена: приложение показывает демо-данные. После развёртывания на Cloudflare здесь появятся синхронизация, наличные и регулярные платежи.'}</p>
        </section>
      </main>
    )
  }

  const categories = [...new Set([...plans.flatMap((plan) => plan.categories), 'Жильё'])].sort((a, b) => a.localeCompare(b, 'ru'))
  const shown = error ?? cloud.error

  return (
    <main className="screen">
      <header className="meta label">Данные · {cloud.email}</header>
      <section className="hero">
        <div className="label">Операций в базе</div>
        <h1 className="hero-number">{money(cloud.rows.length * 100)}</h1>
      </section>
      {shown && <p className="notice">{shown}</p>}
      <div className="data-columns">
        <SyncCard cloud={cloud} onError={setError} />
        <CashCard cloud={cloud} categories={categories} onError={setError} />
        <RecurringCard cloud={cloud} onError={setError} />
        <LegacyCard cloud={cloud} onError={setError} />
      </div>
    </main>
  )
}
