// Подставной Monobank для локальной проверки синхронизации. Данные выдуманные и детерминированные.
// Запуск: node scripts/mock-mono.mjs [порт]. Тот же генератор отдаёт CSV «старой таблицы»: GET /legacy.csv
import { createServer } from 'node:http'

const PORT = Number(process.argv[2] ?? 8799)
const NOW = Math.floor(Date.now() / 1000)
const DAY = 86400

let seed = 42
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff), seed / 0x7fffffff)
const pick = (list) => list[Math.floor(rnd() * list.length)]

const SHOPS = [
  ['Сільпо', 5411, 'Продукты', 'Супермаркеты'],
  ['АТБ', 5411, 'Продукты', 'Супермаркеты'],
  ['Aroma Kava', 5814, 'Кафе и рестораны', 'Кофейни'],
  ['Bolt', 4121, 'Транспорт', 'Такси'],
  ['Аптека', 5912, 'Здоровье', 'Аптеки'],
  ['Apple', 5818, 'Подписки и сервисы', 'Подписки Apple'],
  ['Нова пошта', 4215, 'Покупки и разное', 'Общие расходы'],
]

function history(accountId, perDay, days) {
  const items = []
  let balance = 5_000_000
  for (let d = days; d >= 0; d -= 1) {
    for (let i = 0; i < perDay; i += 1) {
      const [description, mcc, category, subcategory] = pick(SHOPS)
      const amount = -Math.floor(2000 + rnd() * 90000)
      balance += amount
      const time = NOW - d * DAY - Math.floor(rnd() * 80000) - 100
      items.push({ id: `${accountId}-${d}-${i}`, time, description, mcc, amount, operationAmount: amount, currencyCode: 980, balance, hold: d === 0, category, subcategory })
    }
    if (d % 9 === 0) {
      balance += 2_000_000
      items.push({ id: `${accountId}-top-${d}`, time: NOW - d * DAY - 90000, description: 'Термінал City24', mcc: 6012, amount: 2_000_000, operationAmount: 2_000_000, currencyCode: 980, balance, category: 'Покупки и разное', subcategory: 'Общие расходы' })
    }
  }
  return items.filter((item) => item.time < NOW).sort((a, b) => b.time - a.time)
}

// На чёрной карте за последний месяц больше 500 операций — проверка постраничной загрузки.
const ACCOUNTS = [
  { id: 'acc-black', currencyCode: 980, balance: 5_400_000, creditLimit: 1_000_000, type: 'black', maskedPan: ['537541******1234'], items: [...history('acc-black', 2, 390), ...history('acc-black-burst', 22, 27)].sort((a, b) => b.time - a.time) },
  { id: 'acc-white', currencyCode: 980, balance: 620_000, creditLimit: 0, type: 'white', maskedPan: ['444111******9876'], items: history('acc-white', 1, 390) },
  { id: 'acc-usd', currencyCode: 840, balance: 40_000, creditLimit: 0, type: 'black', maskedPan: ['537541******5555'], items: [] },
]

const pad = (n) => String(n).padStart(2, '0')
const KYIV = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Kiev', hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
function sheetDate(epoch) {
  const p = Object.fromEntries(KYIV.formatToParts(new Date(epoch * 1000)).map((x) => [x.type, x.value]))
  return `${p.day}.${p.month}.${p.year} ${p.hour}:${p.minute}`
}
const money = (kopecks) => `"${(kopecks / 100).toFixed(2).replace('.', ',')}"`

/** Старая таблица: часть строк с ID банка, часть с собственными ID (как после импорта CSV), плюс строки, которых в банке нет. */
function legacyCsv() {
  const lines = ['ID,Date and time,Description,MCC,Amount UAH,Account,Category,Subcategory,IsProject,IsTransfer']
  let n = 0
  for (const account of ACCOUNTS) {
    for (const item of account.items) {
      if (item.hold) continue
      n += 1
      const id = n % 2 === 0 ? item.id : `csv-${n}`
      const project = item.description === 'Bolt' || item.description === 'Apple'
      lines.push([id, sheetDate(item.time), item.description, item.mcc, money(item.amount), account.type === 'black' ? 'Чёрная' : 'Monobank UAH', item.category, item.subcategory, project ? 'TRUE' : 'FALSE', 'FALSE'].join(','))
    }
  }
  for (let i = 0; i < 7; i += 1) lines.push([`only-sheet-${i}`, sheetDate(NOW - (30 + i) * DAY), 'Рынок', 5411, money(-12345 - i), 'Чёрная', 'Продукты', 'Рынок', 'FALSE', 'FALSE'].join(','))
  return lines.join('\n')
}

const stats = { requests: 0, tooFast: 0, lastAt: 0 }

createServer((req, res) => {
  const url = new URL(req.url, 'http://x')
  const send = (status, body) => {
    res.writeHead(status, { 'content-type': 'application/json' })
    res.end(JSON.stringify(body))
  }
  if (url.pathname === '/legacy.csv') return res.writeHead(200, { 'content-type': 'text/csv' }).end(legacyCsv())
  if (url.pathname === '/stats') return send(200, { ...stats, total: ACCOUNTS.reduce((t, a) => t + a.items.length, 0), settled: ACCOUNTS.reduce((t, a) => t + a.items.filter((i) => !i.hold).length, 0) })
  if (req.headers['x-token'] !== 'test-token-test-token-test') return send(403, { errorDescription: 'Unknown X-Token' })
  stats.requests += 1
  if (url.pathname === '/personal/client-info') {
    return send(200, { name: 'Тест', accounts: ACCOUNTS.map(({ items, ...account }) => account), jars: [{ id: 'jar-1', title: 'На ціль', currencyCode: 980, balance: 1_500_000, goal: 5_000_000 }] })
  }
  const match = /^\/personal\/statement\/([^/]+)\/(\d+)\/(\d+)$/.exec(url.pathname)
  if (match) {
    const [, id, from, to] = match
    if (Number(to) - Number(from) > 2_682_000) return send(400, { errorDescription: 'Period must be no more than 31 days' })
    const account = ACCOUNTS.find((a) => a.id === decodeURIComponent(id))
    if (!account) return send(400, { errorDescription: 'invalid account' })
    const items = account.items.filter((item) => item.time >= Number(from) && item.time <= Number(to)).slice(0, 500)
    return send(200, items.map((item) => ({ ...item, category: undefined, subcategory: undefined })))
  }
  send(404, {})
}).listen(PORT, () => console.log(`mock monobank on ${PORT}`))
