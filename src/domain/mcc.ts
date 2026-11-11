/**
 * Категория по коду продавца (MCC) — для операций, пришедших из банка без разметки.
 * Названия совпадают с категориями старой таблицы, чтобы конверты и правила работали одинаково.
 */
type Target = { category: string; subcategory: string }

const TABLE: [Target, number[]][] = [
  [{ category: 'Продукты', subcategory: 'Супермаркеты' }, [5411, 5412, 5422, 5441, 5451, 5462, 5499, 5300, 5331]],
  [{ category: 'Кафе и рестораны', subcategory: 'Кафе и рестораны' }, [5811, 5812, 5814]],
  [{ category: 'Алкоголь и напитки', subcategory: 'Бары и алкоголь' }, [5813, 5921]],
  [{ category: 'Транспорт', subcategory: 'Такси' }, [4121]],
  [{ category: 'Транспорт', subcategory: 'Общественный транспорт' }, [4111, 4112, 4131, 4789, 4784]],
  [{ category: 'Транспорт', subcategory: 'Авто' }, [5541, 5542, 5983, 7523, 7538, 7542, 5533]],
  [{ category: 'Здоровье', subcategory: 'Аптеки' }, [5912, 5122]],
  [{ category: 'Здоровье', subcategory: 'Медицина' }, [8011, 8021, 8031, 8041, 8042, 8043, 8049, 8050, 8062, 8071, 8099, 5975, 5976]],
  [{ category: 'Питомцы', subcategory: 'Питомцы' }, [5995, 742]],
  [{ category: 'Связь', subcategory: 'Мобильная связь' }, [4812, 4814]],
  [{ category: 'Связь', subcategory: 'Интернет и ТВ' }, [4899, 4816]],
  [{ category: 'Подписки и сервисы', subcategory: 'Цифровые сервисы' }, [5815, 5817, 5818, 7372, 5968]],
  [{ category: 'Игры и развлечения', subcategory: 'Игры' }, [5816, 5945, 7993, 7994]],
  [{ category: 'Игры и развлечения', subcategory: 'Досуг' }, [7832, 7841, 7922, 7929, 7932, 7933, 7941, 7991, 7996, 7997, 7998, 7999]],
  [{ category: 'Покупки', subcategory: 'Одежда' }, [5137, 5139, 5611, 5621, 5631, 5641, 5651, 5655, 5661, 5691, 5699, 5948]],
  [{ category: 'Покупки', subcategory: 'Техника' }, [5045, 5722, 5732, 5734, 5946]],
  [{ category: 'Покупки', subcategory: 'Маркетплейсы' }, [5262, 5310, 5311, 5399, 5964, 5969]],
  [{ category: 'Покупки', subcategory: 'Красота' }, [5977, 7230, 7298]],
  [{ category: 'Дом', subcategory: 'Товары для дома' }, [5200, 5211, 5231, 5251, 5261, 5712, 5713, 5714, 5719]],
  [{ category: 'Дом', subcategory: 'Коммунальные платежи' }, [4900]],
]

const BY_MCC = new Map<string, Target>()
for (const [target, codes] of TABLE) for (const code of codes) BY_MCC.set(String(code), target)

/** Сборная категория: сюда попадает всё нераспознанное, её потом разбирают правила и ручная разметка. */
export const UNSORTED: Target = { category: 'Покупки и разное', subcategory: 'Общие расходы' }

export function categoryByMcc(mcc: string): Target {
  return BY_MCC.get(String(Number(mcc))) ?? UNSORTED
}
