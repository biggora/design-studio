# Портал технической документации Design Studio

Добро пожаловать в техническую документацию проекта **Design Studio** — современной веб-витрины и агрегатора портфолио для print-on-demand артистов и студий графического дизайна.

---

## 1. Навигатор по разделам документации

Для детального изучения архитектуры, базы данных, интерфейсов и подсистем воспользуйтесь соответствующими разделами:

| Документ | Описание | Основные темы |
|---|---|---|
| [**Системная архитектура**](./ARCHITECTURE.md) | Концептуальная архитектура и устройство приложения | Next.js 16 App Router, React 19, Server Components vs Client Components, абстракция Dual DB, слияние конфигурации (`lib/config.ts`), управление состоянием (Context + Zustand). |
| [**База данных и модели**](./DATABASE.md) | Спецификация хранилищ данных | Схемы таблиц `studio` и `designs` для PostgreSQL (Supabase) и MySQL, хранимые процедуры выборки случайных дизайнов, API модуля `utils/database.ts`, инструкции по миграциям. |
| [**Подсистема синхронизации**](./SYNC_SYSTEM.md) | Конвейер автоматического парсинга Redbubble | Двухрежимный парсинг (Playwright Chromium vs Cheerio JSON-LD), обход Cloudflare, алгоритм `RequestPacer` с джиттером, защита API через `SYNC_SECRET`, логика Upsert. |
| [**Фронтенд и UI-компоненты**](./FRONTEND_AND_UI.md) | Пользовательский интерфейс и стили | Карта маршрутов, компоненты `DesignCard`, `CatalogSearchBar`, `CookieBanner` (`useSyncExternalStore`), SEO-оптимизация, динамический `sitemap.ts`, цветовая палитра Tailwind. |
| [**Развертывание и эксплуатация**](./DEPLOYMENT_AND_CONFIGURATION.md) | Руководство по настройке и деплою | Справочник переменных `.env`, деплой на Vercel с Cron Jobs, запуск Playwright Sync Runner в Docker, решение проблем с капчей и подключениями к БД. |

---

## 2. Краткий обзор технологического стека

- **Фреймворк**: [Next.js](https://nextjs.org/) `16.1.6` (App Router, React Server Components, Route Handlers).
- **Библиотека UI**: [React](https://react.dev/) `19.2.4` + [Zustand](https://zustand-demo.pmnd.rs/) `5.0.2`.
- **Стилизация**: [Tailwind CSS](https://tailwindcss.com/) `3.4.1` + `tailwindcss-animate`.
- **Базы данных**:
  - [Supabase](https://supabase.com/) (`@supabase/supabase-js` `2.47.1`) — PostgreSQL по умолчанию.
  - [MySQL](https://www.mysql.com/) (`mysql2` `3.4.0`) — альтернативный реляционный провайдер.
- **Парсинг и автоматизация**:
  - [Playwright](https://playwright.dev/) `1.52.0` — Chromium браузер с инъекцией антидетект-скриптов.
  - [Cheerio](https://cheerio.js.org/) `1.0.0-rc.12` — легковесный парсинг микроразметки JSON-LD Schema.org.
- **Тестирование**: [Vitest](https://vitest.dev/) `3.2.4` с покрытием v8.
- **Интеграции**: Google Analytics (`@next/third-parties`), Simple Icons (`@icons-pack/react-simple-icons`), Slick Carousel.

---

## 3. Быстрый старт для разработчика

### 3.1 Клонирование и установка зависимостей
```bash
# Установка пакетов проекта
npm install

# Установка браузерных бинарников для Playwright (при использовании синхронизации)
npx playwright install chromium
```

### 3.2 Настройка переменных окружения
Скопируйте файл примера и настройте параметры доступа:
```bash
cp .env.example .env
```
Минимальный набор для локального запуска с Supabase:
```env
DATABASE_PROVIDER=supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key
REDBUBBLE_SHOP_URL=https://www.redbubble.com/people/your-username/shop
```

### 3.3 Запуск сервера разработки
```bash
npm run dev
```
Приложение откроется по адресу [http://localhost:3000](http://localhost:3000).

### 3.4 Запуск тестов
```bash
# Однократный прогон unit-тестов
npm test

# Режим наблюдения за тестами (watch mode)
npm run test:watch
```

### 3.5 Запуск синхронизации каталога
```bash
# Фоновый импорт товаров из магазина Redbubble в базу данных
npm run sync:redbubble
```

---

## 4. Архитектурные принципы кодовой базы

1. **Серверный рендеринг по умолчанию**: Любой новый компонент создается как Server Component (RSC), если ему явно не требуется хук состояния (`useState`, `useEffect`) или доступ к браузерному API.
2. **Изоляция базы данных**: Запросы к БД запрещено писать напрямую в страницах — все операции осуществляются строго через методы фасада `utils/database.ts`.
3. **Безопасность синхронизации**: Эндпоинты синхронизации всегда должны быть защищены строгой сверкой токена `SYNC_SECRET`.
