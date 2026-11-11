import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { monthSummary } from './calc'
import { importSheet } from './importSheet'
import { sum } from './money'

// Проверка на личной выгрузке. Файл лежит вне git (private-data/); без него тест пропускается.
const FILE = 'private-data/transactions.csv'

describe.skipIf(!existsSync(FILE))('реальная выгрузка', () => {
  const ops = existsSync(FILE) ? importSheet(readFileSync(FILE, 'utf8')) : []

  it('читается целиком и без потерь', () => {
    expect(ops.length).toBeGreaterThan(0)
    expect(new Set(ops.map((op) => op.id)).size).toBe(ops.length)
    expect(ops.every((op) => Number.isInteger(op.amount) && op.amount !== 0)).toBe(true)
  })

  it('переводы между своими счетами сходятся в ноль', () => {
    expect(sum(ops.filter((op) => op.kind === 'transfer').map((op) => op.amount))).toBe(0)
  })

  it('Apple не попадает в проектные, терминалы — в доход', () => {
    expect(ops.some((op) => op.kind === 'project' && op.mcc === '5818')).toBe(false)
    expect(ops.some((op) => op.kind === 'income' && /^Термінал/.test(op.description))).toBe(false)
  })

  it('сумма по видам за каждый месяц равна сумме операций', () => {
    const months = new Set(ops.map((op) => `${op.at.getFullYear()}-${op.at.getMonth()}`))
    for (const key of months) {
      const [year, month] = key.split('-').map(Number)
      const summary = monthSummary(ops, year, month)
      const direct = sum(ops.filter((op) => op.at.getFullYear() === year && op.at.getMonth() === month).map((op) => op.amount))
      expect(sum(Object.values(summary.byKind))).toBe(direct)
    }
  })
})
