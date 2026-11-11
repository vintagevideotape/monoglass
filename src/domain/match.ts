import { isRepeatedHour } from './kyiv'

/** Минимум, по которому операцию из старой таблицы можно узнать в выписке банка. */
export type Stamp = { id: string; at: number; amount: number; description: string }

export type Pair = { monoId: string; legacyId: string; by: 'id' | 'fingerprint' }

/**
 * Таблица хранит время с точностью до минуты, банк — до секунды.
 * Запас в обе стороны покрывает округление и небольшое расхождение часов.
 */
const BEFORE = 60
const AFTER = 120

/**
 * Сопоставляет операции банка со строками старой таблицы, один к одному.
 * Сначала по совпадающему ID, затем по отпечатку: та же сумма и почти то же время.
 * Из нескольких кандидатов выигрывает совпавшее описание, затем ближайший по времени.
 */
export function matchLegacy(mono: Stamp[], legacy: Stamp[]): Pair[] {
  const pairs: Pair[] = []
  const legacyById = new Map(legacy.map((row) => [row.id, row]))
  const taken = new Set<string>()
  const rest: Stamp[] = []

  for (const item of mono) {
    if (legacyById.has(item.id)) {
      pairs.push({ monoId: item.id, legacyId: item.id, by: 'id' })
      taken.add(item.id)
    } else rest.push(item)
  }

  const byAmount = new Map<number, Stamp[]>()
  for (const row of legacy) {
    if (taken.has(row.id)) continue
    const list = byAmount.get(row.amount)
    if (list) list.push(row)
    else byAmount.set(row.amount, [row])
  }

  for (const item of [...rest].sort((a, b) => a.at - b.at)) {
    let best: Stamp | null = null
    let bestScore = Infinity
    for (const row of byAmount.get(item.amount) ?? []) {
      if (taken.has(row.id)) continue
      let delta = item.at - row.at
      // Ночь перевода часов: время из таблицы может относиться к любому из двух одинаковых часов.
      if ((delta < -BEFORE || delta > AFTER) && isRepeatedHour(row.at)) {
        if (delta + 3600 >= -BEFORE && delta + 3600 <= AFTER) delta += 3600
        else if (delta - 3600 >= -BEFORE && delta - 3600 <= AFTER) delta -= 3600
      }
      if (delta < -BEFORE || delta > AFTER) continue
      const score = (row.description.trim() === item.description.trim() ? 0 : 1000) + Math.abs(delta - 30)
      if (score < bestScore) {
        best = row
        bestScore = score
      }
    }
    if (best) {
      taken.add(best.id)
      pairs.push({ monoId: item.id, legacyId: best.id, by: 'fingerprint' })
    }
  }
  return pairs
}
