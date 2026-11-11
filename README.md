# MonoGlass

Личный трекер финансов: PWA для iPhone и Mac. Дизайн-система «Лавовая лампа».

Интерфейс и сервер живут в одном воркере Cloudflare: приложение, API, база D1 и фоновая синхронизация с Monobank.
Без сервера (локальный просмотр, прототип) приложение показывает выдуманные демо-данные.

## Команды

- `npm install` — зависимости
- `npm run dev` — локальный запуск
- `npm run build` — сборка в `dist/`
- `npx vite build --mode single` — всё в один `dist-single/index.html`

## Структура

- `src/styles/tokens.css` — токены дизайн-системы
- `src/styles/app.css` — стили экрана, телефон и широкий экран
- `src/components/` — `Today`, `Nav`, `Lava`, `PerfPanel`
- `src/data/demo.ts` — выдуманные данные для демо-режима
- `src/api/`, `src/state/` — связь с сервером и состояние приложения
- `worker/` — сервер: вход, API, синхронизация с Monobank
- `migrations/` — схема базы D1

## Расчётное ядро

`src/domain/` — чистые функции без интерфейса: импорт старой таблицы, классификация операций, сводка месяца, темп, честный баланс.

- `npm test` — тесты. Проверка на личной выгрузке запускается, только если есть `private-data/transactions.csv`.
- `private-data/` в git не попадает. Личные данные в репозиторий не кладём.

## Данные и синхронизация

- `worker/sync.ts` — раз в две минуты один запрос к Monobank: список счетов, очередь истории (окна по 31 дню), затем свежая выписка по картам по кругу.
- Перенос старой таблицы — на экране «Данные». Строки склеиваются с выпиской по ID, затем по сумме и времени; повторная загрузка дублей не создаёт.
- Наличные, ручные операции и регулярные платежи (аренда, коммуналка) настраиваются там же.

### Развёртывание в своём Cloudflare

```
npm install
npx wrangler login
npm run db:migrate        # таблицы в базе monoglass (она уже создана, её ID записан в wrangler.jsonc)
npm run deploy            # сборка и воркер
npm run setup:key         # случайный ключ шифрования токенов; на экран не выводится
```

Затем в панели Cloudflare: Workers & Pages → monoglass → Settings → Domains & Routes → workers.dev → Enable Cloudflare Access.
В появившемся окне будут два значения — их кладём секретами:

```
npx wrangler secret put TEAM_DOMAIN    # https://<команда>.cloudflareaccess.com
npx wrangler secret put POLICY_AUD
```

Пока `TEAM_DOMAIN` и `POLICY_AUD` не заданы, API не отвечает никому. Первый вошедший становится владельцем.

Токен Monobank вводится в самом приложении: «Данные и ввод» → Monobank. Он проверяется запросом к банку, шифруется ключом `TOKEN_KEY`
и хранится за профилем того, кто его ввёл; обратно не показывается. Если `TOKEN_KEY` сменить, токен нужно ввести заново.

### Локальная проверка

```
node scripts/mock-mono.mjs          # подставной банк с выдуманными данными
npm run db:migrate:local
npm run build && npm run dev:api    # воркер на :8787; .dev.vars: DEV_EMAIL, TOKEN_KEY, MONO_BASE=http://127.0.0.1:8799, MONO_GAP=0
npm run e2e                         # перенос таблицы, загрузка истории, сверка
```
