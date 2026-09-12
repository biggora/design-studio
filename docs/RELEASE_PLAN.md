# План релиза: Design Studio (v0.1.0)

## 1. Резюме релиза (Release Summary)

Версия **v0.1.0** знаменует готовность первого стабильного производственного релиза платформы **Design Studio** — автономной SaaS-витрины для Print-on-Demand дизайнеров с автоматической синхронизацией каталога из Redbubble, поддержкой двух СУБД (Supabase / MySQL) и полным пакетом технической документации.

---

## 2. Ключевые возможности релиза (Scope & Changelog)

### Новые возможности (Features)
- **Конвейер синхронизации Redbubble (Playwright + Cheerio)**:
  - Автономный импорт продуктов через CLI (`npm run sync:redbubble`) и HTTP API (`/api/sync/redbubble`).
  - Умный антидетект: обход проверок Cloudflare, адаптивный джиттер (`RequestPacer`), сохранение сессионных куки в `.cache/redbubble-storage-state.json`.
  - Извлечение микроразметки Schema.org (`Product`) и метатегов OpenGraph.
- **Поддержка двух СУБД (Dual DB Provider)**:
  - Прозрачное переключение провайдера базы данных через `DATABASE_PROVIDER` (`supabase` или `mysql`).
  - Единый фасад методов выборки (`getSiteConfig`, `fetchDesigns`, `getDesignById`, `fetchCollections`).
  - SQL-схемы и процедуры для PostgreSQL и MySQL.
- **UI и витрина на Next.js 16 + React 19**:
  - Адаптивный каталог с поиском, фильтрацией по коллекциям и пагинацией.
  - Детальные карточки товаров со ссылками на внешние маркетплейсы (`ShopLinks`) и соцсети (`ShareLinks`).
  - Hero-карусель и блок рекомендуемых работ.
  - Безопасный баннер куки (`CookieBanner`) на `useSyncExternalStore`.
  - Динамический sitemap (`/sitemap.xml`) и OpenGraph метаданные.
- **Полная техническая документация (`docs/`)**:
  - `docs/ARCHITECTURE.md`, `docs/DATABASE.md`, `docs/SYNC_SYSTEM.md`, `docs/FRONTEND_AND_UI.md`, `docs/DEPLOYMENT_AND_CONFIGURATION.md`, `docs/README.md`.

---

## 3. Контрольный список готовности к релизу (Release Readiness Checklist)

| Этап | Задача | Статус | Примечание |
|---|---|:---:|---|
| **Код и тесты** | Прогон unit-тестов Vitest (`npm test`) | ✅ Пройдено | 12/12 тестов пройдены успешно |
| **Сборка** | Проверка production build (`npm run build`) | ✅ Пройдено | Успешная компиляция Turbopack (11/11 страниц) |
| **Линтинг** | Проверка ESLint 9 (`npm run lint`) | ✅ Готово | Flat-config настроен в `eslint.config.mjs` |
| **Документация** | Наличие инструкций по развертыванию | ✅ Пройдено | Описаны Vercel, Docker и MySQL |
| **Безопасность** | Проверка секретов в коде | ✅ Пройдено | Пароли и API-ключи только в `.env` / `.env.example` |
| **Версионирование** | Фиксация тега релиза `v0.1.0` в Git | ⏳ К исполнению | Создание аннотированного тега |

---

## 4. Пошаговый план развертывания (Rollout Steps)

### Шаг 1: Подготовка окружения (Pre-flight)
1. Убедиться, что в базе данных (Supabase или MySQL) применены DDL-скрипты:
   - Supabase: `init/postgres_tables.sql` и `init/postgres_functions.sql`.
   - MySQL: `init/mysql_tables.sql` и `init/mysql_functions.sql`.
2. Заполнить базовые параметры бренда в таблице `studio` (или положиться на `config/config.json`).
3. Настроить переменные окружения в панели Vercel / хостинга:
   - `DATABASE_PROVIDER`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
   - `SYNC_SECRET` (произвольная надежная строка для защиты API cron-задач).
   - `REDBUBBLE_SHOP_URL` (URL магазина).

### Шаг 2: Первичная синхронизация каталога
- Выполнить команду начального импорта товаров:
  ```bash
  npm run sync:redbubble
  ```
- Проверить появление записей в таблице `designs`.

### Шаг 3: Деплой приложения (Deployment)
- Подключить репозиторий к Vercel.
- Добавить `vercel.json` с конфигурацией Cron для ежедневного обновления каталога в 03:00 UTC:
  ```json
  {
    "crons": [
      {
        "path": "/api/sync/redbubble?secret=ВАШ_SYNC_SECRET",
        "schedule": "0 3 * * *"
      }
    ]
  }
  ```

### Шаг 4: Пострелизная валидация (Smoke Testing)
- [ ] Проверить отдачу главной страницы `/` (Hero, карусель, рандомные дизайны).
- [ ] Проверить каталог `/designs`: поиск по названию, фильтр коллекций, пагинация.
- [ ] Проверить карточку товара `/designs/[id]`: корректность ссылок на покупку и расшаривание.
- [ ] Проверить динамический `/sitemap.xml`.
- [ ] Проверить срабатывание API `/api/sync/redbubble` с передачей секретного заголовка `x-sync-secret`.

---

## 5. План отката (Rollback Strategy)
- При сбоях фронтенда: мгновенный Rollback на предыдущий deployment в панели Vercel.
- При сбоях синхронизации: отключение cron-задачи или временный возврат `SYNC_USE_PLAYWRIGHT=false` (переход на Cheerio) либо ручное обновление сессии `storageState`.
- База данных: схема не содержит деструктивных миграций; при необходимости отката данных достаточно очистить таблицу `designs`.
