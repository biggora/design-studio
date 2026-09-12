# Развертывание, Конфигурация и Эксплуатация

## 1. Справочник переменных окружения

Все настройки окружения конфигурируются в файле `.env` (шаблон доступен в `.env.example`).

### 1.1 Переменные базы данных (Supabase / PostgreSQL)
| Переменная | Обязательна | Значение по умолчанию | Описание |
|---|---|---|---|
| `DATABASE_PROVIDER` | Нет | `supabase` | Выбор движка базы данных: `supabase` или `mysql`. |
| `NEXT_PUBLIC_SUPABASE_URL` | Да (при Supabase) | — | URL проекта Supabase (например: `https://xyzproject.supabase.co`). |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Да (при Supabase) | — | Публичный анонимный ключ Supabase для клиентских и серверных операций чтения. |
| `SUPABASE_SERVICE_ROLE_KEY` | Да (для sync) | — | Секретный сервисный ключ с правами обхода RLS для записи/upsert спарсенных данных. |

### 1.2 Переменные базы данных (MySQL)
| Переменная | Обязательна | Значение по умолчанию | Описание |
|---|---|---|---|
| `MYSQL_HOST` | Да (при MySQL) | — | Хост сервера MySQL (например, `127.0.0.1` или `db.production.internal`). |
| `MYSQL_PORT` | Нет | `3306` | Порт подключения к MySQL. |
| `MYSQL_USER` | Да (при MySQL) | — | Имя пользователя базы данных. |
| `MYSQL_PASSWORD` | Да (при MySQL) | — | Пароль пользователя. |
| `MYSQL_DATABASE` | Да (при MySQL) | — | Имя базы данных проекта. |

### 1.3 Переменные подсистемы синхронизации
| Переменная | Обязательна | Значение по умолчанию | Описание |
|---|---|---|---|
| `SYNC_SECRET` | Да (для API) | — | Секретный токен для авторизации вызовов `/api/sync/redbubble`. |
| `REDBUBBLE_SHOP_URL` | Да | — | URL магазина (например: `https://www.redbubble.com/people/yourname/shop`). |
| `SYNC_MAX_PAGES` | Нет | `5` | Максимальное количество сканируемых страниц каталога. |
| `SYNC_PAGE_DELAY_MS` | Нет | `3000` | Пауза (в мс) между обработкой страниц витрины. |
| `SYNC_MIN_REQUEST_INTERVAL_MS`| Нет | `2500`| Минимальный интервал между последовательными сетевыми запросами. |
| `SYNC_REQUEST_JITTER_MS` | Нет | `700` | Максимальный рандомизированный джиттер к задержке запросов. |
| `SYNC_CONCURRENCY` | Нет | `1` | Степень параллелизма при Cheerio-парсинге карточек товаров. |
| `SYNC_USE_PLAYWRIGHT` | Нет | `true` | Использовать ли браузер Chromium для парсинга (true) или Cheerio (false). |
| `SYNC_PLAYWRIGHT_HEADLESS` | Нет | `true` | Запуск Chromium в фоновом режиме (false для ручного прохождения капчи). |
| `SYNC_PLAYWRIGHT_STORAGE_STATE_PATH` | Нет | `.cache/redbubble-storage-state.json` | Путь к файлу сохранения сессии (cookies, localStorage). |
| `REDBUBBLE_USER_AGENT` | Нет | — | Кастомный User-Agent реального браузера для обхода фильтрации. |
| `REDBUBBLE_COOKIE` | Нет | — | Строка cookie из реальной сессии браузера (для обхода Cloudflare). |

---

## 2. Развертывание на платформе Vercel

Vercel является рекомендуемой платформой для хостинга веб-приложения благодаря нативной поддержке Next.js 16 и встроенному планировщику Cron Jobs.

### 2.1 Шаги развертывания
1. Запушьте репозиторий в GitHub / GitLab / Bitbucket.
2. В панели [Vercel Dashboard](https://vercel.com) нажмите **Add New... -> Project** и импортируйте репозиторий.
3. В блоке **Environment Variables** добавьте все необходимые переменные:
   - `DATABASE_PROVIDER=supabase`
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SYNC_SECRET`
   - `REDBUBBLE_SHOP_URL`
   - `SYNC_USE_PLAYWRIGHT=false` *(критически важно для Vercel Serverless Functions)*
4. Нажмите **Deploy**.

### 2.2 Настройка автоматической синхронизации через Vercel Cron
Для запуска синхронизации по расписанию добавьте файл конфигурации `vercel.json` в корень проекта:

```json
{
  "crons": [
    {
      "path": "/api/sync/redbubble?secret=YOUR_LONG_RANDOM_SYNC_SECRET",
      "schedule": "0 4 * * *"
    }
  ]
}
```
*Расписание `0 4 * * *` означает ежедневный запуск в 04:00 утра UTC.*

> **ВАЖНО**: В среде Vercel Serverless Function размер бинарного пакета Chromium превышает стандартный лимит бессерверной функции (50 МБ). Поэтому на Vercel синхронизация через эндпоинт `/api/sync/redbubble` должна работать в режиме Cheerio (`SYNC_USE_PLAYWRIGHT=false`).

---

## 3. Развертывание постоянного Playwright Sync Runner (Docker / VM)

Если Redbubble блокирует прямые HTTP-запросы Cheerio, рекомендуется вынести процесс синхронизации на выделенный контейнер или виртуальную машину (DigitalOcean, Hetzner, AWS EC2), где запущен полноценный headless-браузер Chromium.

### 3.1 Dockerfile для автономного синхронизатора

Создайте файл `Dockerfile.sync` в корне репозитория:

```dockerfile
FROM mcr.microsoft.com/playwright:v1.52.0-jammy

WORKDIR /app

# Копирование манифестов зависимостей
COPY package*.json ./

# Установка зависимостей проекта и бинарников Playwright
RUN npm ci
RUN npx playwright install chromium --with-deps

# Копирование исходного кода
COPY . .

# Создание директории для кеширования сессии
RUN mkdir -p .cache

# Команда запуска синхронизации по умолчанию
CMD ["npm", "run", "sync:redbubble"]
```

### 3.2 Запуск через Docker Compose с cron-планировщиком

Пример `docker-compose.yml`:
```yaml
version: '3.8'

services:
  redbubble-sync:
    build:
      context: .
      dockerfile: Dockerfile.sync
    environment:
      - DATABASE_PROVIDER=supabase
      - NEXT_PUBLIC_SUPABASE_URL=${NEXT_PUBLIC_SUPABASE_URL}
      - NEXT_PUBLIC_SUPABASE_ANON_KEY=${NEXT_PUBLIC_SUPABASE_ANON_KEY}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - REDBUBBLE_SHOP_URL=${REDBUBBLE_SHOP_URL}
      - SYNC_USE_PLAYWRIGHT=true
      - SYNC_PLAYWRIGHT_HEADLESS=true
      - SYNC_PLAYWRIGHT_STORAGE_STATE_PATH=/app/.cache/session.json
    volumes:
      - ./sync-cache:/app/.cache
    restart: "no"
```

Для запуска раз в сутки добавьте запись в системный crontab сервера (`crontab -e`):
```bash
0 3 * * * cd /opt/design-studio && docker compose run --rm redbubble-sync
```

---

## 4. Диагностика и устранение неполадок (Troubleshooting)

### 4.1 Ошибка: `Redbubble blocked automated access with Cloudflare challenge`
- **Причина**: Системы защиты Cloudflare зафиксировали подозрительную активность с вашего IP или дефолтные заголовки бота.
- **Решение**:
  1. Запустите скрипт синхронизации локально с открытым окном браузера:
     ```bash
     SYNC_PLAYWRIGHT_HEADLESS=false SYNC_PLAYWRIGHT_STORAGE_STATE_PATH=.cache/session.json npm run sync:redbubble
     ```
  2. При появлении окна Cloudflare («Just a moment» / «Verify you are human») пройдите проверку вручную.
  3. После успешного прохода файл сессии `.cache/session.json` сохранит валидные cookies `cf_clearance`.
  4. Скопируйте этот файл на рабочий сервер или используйте значения из него в переменной `REDBUBBLE_COOKIE`.

### 4.2 Ошибка: `Missing Supabase environment variables` или `new row violates row-level security policy`
- **Причина**:
  - Не задан `SUPABASE_SERVICE_ROLE_KEY`.
  - Либо скрипт использует только `NEXT_PUBLIC_SUPABASE_ANON_KEY`, а для таблицы `designs` в Supabase включен RLS без разрешающей политики на `INSERT/UPDATE`.
- **Решение**: Укажите сервисный ключ `SUPABASE_SERVICE_ROLE_KEY` в `.env`. Сервисный ключ обладает правами суперпользователя и игнорирует RLS.

### 4.3 Ошибка: `Too many connections` в MySQL
- **Причина**: При частом перезапуске бессерверных функций Next.js создается множество независимых пулов соединений `mysql.createPool`.
- **Решение**:
  - Настройте лимиты пула в `utils/database.ts`:
    ```typescript
    pool = mysql.createPool({
      host: MYSQL_HOST,
      connectionLimit: 10,
      queueLimit: 0,
      waitForConnections: true,
    });
    ```
  - При высокой нагрузке используйте прокси пулов, например **ProxySQL** или **AWS RDS Proxy**.
