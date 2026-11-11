import type { CounterpartyRule, OperationKind } from './types'

type Raw = {
  description: string
  mcc: string
  amount: number
  isProject: boolean
  isTransfer: boolean
}

const TERMINAL = /^(Термінал|City24|EasyPay)/i
const JAR = /^(Поповнення «|Виплата банки|Часткове зняття банки)/i
const REFUND = /^Скасування\./i
const FROM_PERSON = /^Від:/i
/** MCC 5818 — цифровые товары; так приходят списания Apple. */
const APPLE = (raw: Raw) => raw.mcc === '5818' || /Apple/i.test(raw.description)

/**
 * Определяет смысл операции по строке старой таблицы.
 * Исправляет известные ошибки старых правил: Apple не проектный расход,
 * пополнения через терминал — не доход.
 */
export function classify(raw: Raw): OperationKind {
  if (raw.isTransfer) return 'transfer'
  if (JAR.test(raw.description)) return 'jar'
  if (raw.isProject && !APPLE(raw)) return 'project'
  if (raw.amount > 0) {
    if (TERMINAL.test(raw.description)) return 'cashTopUp'
    if (REFUND.test(raw.description)) return 'refund'
    if (FROM_PERSON.test(raw.description)) return 'personIncoming'
    return 'income'
  }
  return 'expense'
}

/** Имя отправителя из «Від: Имя Фамилия». */
export function senderOf(description: string): string | null {
  const match = /^Від:\s*(.+)$/i.exec(description.trim())
  return match ? match[1].trim() : null
}

/** Переводы от людей без правила остаются personIncoming и ждут решения. */
export function applyCounterpartyRule(kind: OperationKind, description: string, rules: CounterpartyRule[]): OperationKind {
  if (kind !== 'personIncoming') return kind
  const sender = senderOf(description)
  const rule = rules.find((r) => r.sender.toLowerCase() === sender?.toLowerCase())
  return rule ? rule.as : kind
}
