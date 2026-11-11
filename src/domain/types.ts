/** Деньги храним целыми копейками: никаких дробей и ошибок округления. */
export type Kopecks = number

/**
 * Что операция значит для личных финансов.
 * - expense / refund — личный расход и его возврат (возврат уменьшает расходы, а не увеличивает доход)
 * - income — доход (кешбэк, зачисления)
 * - personIncoming — перевод от человека; доход это или нет, решает правило контрагента
 * - cashTopUp — пополнение карты наличными через терминал: перевод из своих наличных
 * - jar — пополнение и снятие «банки» Monobank: движение внутри своих денег
 * - transfer — перевод между своими счетами
 * - project — проектные деньги: в личные доходы и расходы не входят
 */
export type OperationKind =
  | 'expense'
  | 'refund'
  | 'income'
  | 'personIncoming'
  | 'cashTopUp'
  | 'jar'
  | 'transfer'
  | 'project'

export type Operation = {
  id: string
  at: Date
  description: string
  mcc: string
  /** Со знаком: расход отрицательный. */
  amount: Kopecks
  account: string
  category: string
  subcategory: string
  kind: OperationKind
}

export type Envelope = {
  id: string
  name: string
  kind: 'spend' | 'save'
  limit: Kopecks
  /** Потрачено (spend) или отложено (save) с начала месяца. */
  used: Kopecks
  /** Сравнивать ли с темпом месяца. Для фиксированных платежей — нет. */
  paced: boolean
}

export type AccountBalance = {
  id: string
  /** Собственные деньги на счёте, без кредитного лимита. */
  balance: Kopecks
}

export type ProjectWallet = {
  id: string
  /** Остаток проектных денег, который лежит на личных счетах или в наличных. */
  remainder: Kopecks
}
