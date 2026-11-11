/** Деньги храним целыми копейками: никаких дробей и ошибок округления. */
export type Kopecks = number

/**
 * Что операция значит для личных финансов.
 * - expense / refund — личный расход и его возврат (возврат уменьшает расходы, а не увеличивает доход)
 * - income — доход (кешбэк, зачисления)
 * - personIncoming — перевод от человека без правила: ждёт решения
 * - support — деньги от близких: не заработок, но и не проектные
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
  | 'support'
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

/**
 * Правило контрагента: чем считать переводы от конкретного человека.
 * Это личные данные — правила хранятся вместе с операциями, не в коде.
 */
export type CounterpartyRule = {
  /** Имя отправителя, как в выписке после «Від: ». */
  sender: string
  as: 'project' | 'support' | 'income'
}

/** Как конверт получает деньги: фиксированной суммой или долей дохода. */
export type Allocation = { type: 'fixed'; amount: Kopecks } | { type: 'percent'; percent: number }

export type EnvelopePlan = {
  id: string
  name: string
  kind: 'spend' | 'save'
  allocation: Allocation
  /** Категории операций, которые списываются из этого конверта. */
  categories: string[]
  paced: boolean
}
