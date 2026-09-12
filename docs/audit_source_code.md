# Комплексный аудит исходного кода и безопасности: Print-on-Demand Design Studio

**Проект:** Print-on-Demand Design Studio (`design-studio`)  
**Дата проведения аудита:** 12 сентября 2026 г.  
**Целевой стек:** Next.js 16.1.6 (App Router), React 19.2.4, TypeScript 5, Tailwind CSS 3.4.1, Playwright 1.52.0, Supabase JS 2.47.1, MySQL2 3.4.0, Zustand 5.0.2, Vitest 3.2.4  
**Методология:** OWASP Top 10 (2021), Next.js 16 / React 19 Architecture Standard, Static & Dynamic Source Code Analysis, Defense-in-Depth Assessment  
**Статус ревью:** ❌ **Требуются критические исправления (Request Changes)**

---

## 1. Исполнительное резюме (Executive Summary)

В ходе углубленного анализа кодовой базы сервиса витрины и синхронизации товаров Print-on-Demand Design Studio был проведен построчный аудит всех модулей: серверной логики, абстракции баз данных, скрейпинг-пайплайна Redbubble, клиентских и серверных компонентов App Router, а также конфигураций сборки и тестирования.

Архитектура проекта демонстрирует продуманное разделение на слои (фасад БД `utils/database.ts`, управление состоянием `lib/store.ts`, пайплайн сбора данных `lib/sync/redbubble.ts`), однако в текущей реализации выявлен ряд **критических дефектов функциональности, архитектурных расхождений и опасных уязвимостей безопасности**, блокирующих стабильную и безопасную эксплуатацию в производственной среде (Production).

### 1.1. Ключевые риски и критические выводы:

1. **Полная компрометация БД и удаленное загрязнение прототипа (Remote Prototype Pollution):**
   - В PostgreSQL (Supabase) отсутствуют политики Row-Level Security (RLS). Публичный ключ `anon`, зашитый в `.env`, дает анонимным пользователям прямой доступ на чтение, запись и удаление всех таблиц (`studio`, `designs`).
   - Функция `mapDataToConfig` в `lib/config.ts` парсит ключи с точечной нотацией без фильтрации прототипных свойств (`__proto__`, `constructor`), что в комбинации с открытой БД позволяет отравить `Object.prototype` в среде Node.js и вызвать DoS или RCE. Кроме того, мутируется импортированный синглтон `baseConfig` в оперативной памяти процесса.
2. **100% отказ скрейпинга Redbubble из-за дефектного регулярного выражения:**
   - Регулярное выражение извлечения `externalId` в `lib/sync/redbubble.ts` не учитывает реальную структуру URL товаров Redbubble вида `/i/{category}/{slug}/{id}.{variant}`. Функция возвращает `null` для всех карточек, в результате чего 100% найденных товаров отбрасываются и не сохраняются в БД.
3. **SSRF и утечка серверных сессионных кук (`REDBUBBLE_COOKIE`):**
   - Валидация URL магазина в `normalizeShopUrl` не привязана к границам домена (`/redbubble\.com/i`). Злоумышленник может передать сторонний домен, куда Playwright перейдет в контексте Chromium и автоматически передаст приватные сессионные куки администратора в HTTP-заголовке `Cookie`.
4. **Недетерминированная пагинация и крах пакетных вставок (Batch Upsert Crash):**
   - Запросы выборки каталога в Supabase и MySQL лишены секции `ORDER BY`, из-за чего строки при пагинации дублируются или пропадают.
   - Пакетная вставка `upsert` в Supabase падает с ошибкой PostgreSQL `21000`, если в пакете присутствуют дубликаты `externalId`, а фатальные ошибки записи регистрируются в метриках как «пропущенные» (skipped).
5. **Сбои рендеринга Next.js 16 / React 19 и Tailwind CSS:**
   - В `DesignCard.tsx` использована динамическая интерполяция класса Tailwind `h-[${designCardWidth}px]`, которая не компилируется Tailwind компилятором, ломая верстку карточек.
   - Шесть компонентов иконок магазинов (`Amazon`, `RedBubble` и др.) используют хук `useState` и события мыши, но не имеют директивы `"use client"`.
   - Несуществующий дизайн на странице `/designs/[id]` возвращает статус HTTP 200 (Soft 404) вместо `notFound()`, а функции `formatDate` и `decodeURIComponent` падают с необработанными исключениями при некорректных входных данных.

### 1.2. Распределение дефектов по категориям и критичности

```
Категория                   Критический (C)   Высокий (H)   Средний (M)   Низкий (L)   Всего
-----------------------------------------------------------------------------------------
Безопасность (Security)           2               3             4            1          10
Бэкенд и Базы данных (Backend)    3               6             4            0          13
Фронтенд и UI/UX (Frontend)       2               7             8            2          19
Конфигурация и Тесты (Tooling)    0               2             2            0           4
-----------------------------------------------------------------------------------------
ИТОГО                             7              18            18            3          46
```

---

## 2. Сводная матрица дефектов и уязвимостей

| ID | Заголовок дефекта | Модуль / Компонент | Файл и строки | Критичность | Статус |
|---|---|---|---|---|---|
| **VULN-001** | Отсутствие Supabase RLS (Несанкционированное удаление/модификация БД) | Security / DB | `init/postgres_tables.sql:1-31`, `utils/database.ts:13-21` | 🔴 Critical | Открыт |
| **VULN-002** | Remote Prototype Pollution и мутация синглтона в `mapDataToConfig` | Security / Core | `lib/config.ts:5-23` | 🔴 Critical | Открыт |
| **VULN-003** | SSRF и кража учетных кук Redbubble через нестрогий regex в URL | Security / Scraper | `lib/sync/redbubble.ts:86-104, 266-289` | 🟠 High | Открыт |
| **VULN-004** | Небезопасная аутентификация API (Timing Attack, секрет в URL, GET мутация) | Security / API | `app/api/sync/redbubble/route.ts:5-29, 107-113` | 🟠 High | Открыт |
| **VULN-005** | DoS через неконтролируемый запуск процессов Chromium (Fork Bomb) | Security / API | `app/api/sync/redbubble/route.ts:89-105`, `lib/sync/redbubble.ts:271-414` | 🟠 High | Открыт |
| **VULN-006** | Внедрение произвольных внешних стилей через несанкционированный `themeLink` | Security / Frontend | `app/layout.tsx:36-38` | 🟡 Medium | Открыт |
| **VULN-007** | Stored XSS через неподтвержденные протоколы в `externalLink` и соцсетях | Security / Frontend | `app/designs/[id]/page.tsx:144-150`, `app/components/Footer.tsx:52-106` | 🟡 Medium | Открыт |
| **VULN-008** | Открытая передача учетных данных MySQL (Missing SSL/TLS Encryption) | Security / DB | `utils/database.ts:29-35` | 🟡 Medium | Открыт |
| **VULN-009** | Отсутствие базовых заголовков безопасности (CSP, HSTS, X-Frame-Options) | Security / Config | `next.config.mjs:1-27` | 🔵 Low | Открыт |
| **VULN-010** | Уязвимость Prototype Pollution в зависимости `mysql2` (CVE-2024-21508) | Security / Deps | `package.json:26` | 🟡 Medium | Открыт |
| **BE-001** | Ошибка регулярного выражения `extractExternalIdFromUrl` (100% потеря данных) | Backend / Scraper | `lib/sync/redbubble.ts:112-117` | 🔴 Critical | Открыт |
| **BE-002** | Сбой батч-апсерта при дубликатах ID и сокрытии ошибок под видом «skipped» | Backend / DB | `lib/sync/redbubble.ts:566-599` | 🔴 Critical | Открыт |
| **BE-003** | Фатальный сбой SSR при обходе несуществующих вложенных свойств конфигурации | Backend / Core | `lib/config.ts:11-17` | 🔴 Critical | Открыт |
| **BE-004** | Утечка процессов Chromium при сбое сохранения `storageState` в Playwright | Backend / Scraper | `lib/sync/redbubble.ts:404-415` | 🟠 High | Открыт |
| **BE-005** | Состояние гонки в `RequestPacer` при параллельной работе воркеров | Backend / Scraper | `lib/sync/redbubble.ts:63-84, 450` | 🟠 High | Открыт |
| **BE-006** | Недетерминированная пагинация из-за отсутствия `ORDER BY` в SQL и Supabase | Backend / DB | `utils/database.ts:60-68, 114-117` | 🟠 High | Открыт |
| **BE-007** | Падение сборки `next build` при неинициализированных переменных БД | Backend / Build | `utils/database.ts:13-38` | 🟠 High | Открыт |
| **BE-008** | Утечка пула соединений MySQL при Hot Reload и отсутствие лимитов | Backend / DB | `utils/database.ts:29-35` | 🟠 High | Открыт |
| **BE-009** | Зависание CLI-скрипта синхронизации из-за незакрытого пула соединений MySQL | Backend / CLI | `scripts/sync-redbubble.ts:5-75` | 🟠 High | Открыт |
| **BE-010** | Полная неработоспособность API синхронизации при `DATABASE_PROVIDER=mysql` | Backend / API | `app/api/sync/redbubble/route.ts:45-56` | 🟠 High | Открыт |
| **BE-011** | Крах синтаксиса MySQL при отрицательном или нулевом номере страницы | Backend / DB | `utils/database.ts:57-58, 101` | 🟡 Medium | Открыт |
| **BE-012** | Неэффективная in-memory агрегация коллекций и отсутствие фильтрации пустых | Backend / DB | `utils/database.ts:295-318` | 🟡 Medium | Открыт |
| **BE-013** | Рассинхронизация типов данных между MySQL и Supabase (`boolean`, `Date`) | Backend / DB | `utils/database.ts:125-145` | 🟡 Medium | Открыт |
| **FE-001** | Динамическая интерполяция в классе Tailwind (`h-[${designCardWidth}px]`) | Frontend / UI | `app/components/DesignCard.tsx:27` | 🔴 Critical | Открыт |
| **FE-002** | Разрыв поисковой формы и фильтра коллекций + полный релоад страницы | Frontend / UX | `app/components/CatalogSearchBar.tsx:18, 37-54` | 🔴 Critical | Открыт |
| **FE-003** | Отсутствие `"use client"` в интерактивных компонентах иконок магазинов | Frontend / React 19 | `app/components/Icons/*.tsx:1-28` | 🟠 High | Открыт |
| **FE-004** | Soft 404: возврат статуса 200 OK вместо вызова `notFound()` для несуществующих дизайнов | Frontend / SEO | `app/designs/[id]/page.tsx:63-71` | 🟠 High | Открыт |
| **FE-005** | Уязвимость обратного табнаббинга (`target="_blank"` без `rel="noopener noreferrer"`) | Frontend / Security | `app/designs/[id]/page.tsx:144-150` | 🟠 High | Открыт |
| **FE-006** | Фатальный краш рендеринга страницы при пустой или невалидной дате в `formatDate` | Frontend / Core | `app/designs/[id]/page.tsx:141`, `lib/utils.ts:6-8` | 🟠 High | Открыт |
| **FE-007** | Нефункциональная форма обратной связи без отправки и уведомлений | Frontend / UX | `app/components/ContactForm.tsx:18-24` | 🟠 High | Открыт |
| **FE-008** | Инвертированный серверный снимок в `CookieBanner` и сбои гидратации | Frontend / Hydration | `app/components/CookieBanner.tsx:11-24` | 🟠 High | Открыт |
| **FE-009** | Ошибочное имя свойства `changeFreq` в `sitemap.ts` и пропуск маршрута `/designs` | Frontend / SEO | `app/sitemap.ts:14, 20, 26, 32, 38, 48` | 🟠 High | Открыт |
| **FE-010** | Крах `decodeURIComponent` на URL с символом `%` и 404 на плейсхолдере изображения | Frontend / UI | `app/components/DesignCard.tsx:21-23` | 🟠 High | Открыт |
| **FE-011** | Избыточная загрузка 1000 записей на главной странице ради 3 случайных элементов | Frontend / Perf | `app/page.tsx:35-40` | 🟠 High | Открыт |
| **FE-012** | Неэкранированные параметры в ссылках пагинации ломают составные фильтры | Frontend / URLs | `app/designs/page.tsx:76, 87`, `app/designs/[id]/page.tsx:135`| 🟡 Medium | Открыт |
| **FE-013** | Импорт приватных путей Next.js, ручной `<head>` и некорректный GoogleAnalytics | Frontend / Next.js | `app/layout.tsx:4, 26-40` | 🟡 Medium | Открыт |
| **FE-014** | Отсутствие `priority` на первом слайде карусели (деградация LCP) и `sizes` | Frontend / Web Vitals | `app/components/Carousel.tsx:34-39` | 🟡 Medium | Открыт |
| **FE-015** | Недоступная мобильная кнопка меню (отсутствие атрибутов ARIA и фокус-ринга) | Frontend / A11y | `app/components/Header.tsx:50-55` | 🟡 Medium | Открыт |
| **FE-016** | Лишняя директива `"use client"` на статической странице `services` и нет метаданных | Frontend / Bundle | `app/services/page.tsx:1-59` | 🟡 Medium | Открыт |
| **FE-017** | Опечатка в регистре ключа конфигурации (`tostaDora` vs `tostadora`) | Frontend / Config | `app/contact/page.tsx:45` | 🟡 Medium | Открыт |
| **FE-018** | Использование классов `prose` без плагина `@tailwindcss/typography` | Frontend / CSS | `app/privacy-policy/page.tsx:30`, `app/terms-of-service/page.tsx:30` | 🟡 Medium | Открыт |
| **FE-019** | Конфликт форматов дизайн-токенов: HSL в `tailwind.config.ts` vs RGB в `globals.css` | Frontend / Design | `app/globals.css:5-11`, `tailwind.config.ts:14-40` | 🟡 Medium | Открыт |
| **FE-020** | Невалидный класс `justify-left` и исчезновение иконок при наведении | Frontend / CSS | `app/components/ShopLinks.tsx:25`, `SocialLinks.tsx:21` | 🔵 Low | Открыт |
| **FE-021** | Лишний `"use client"` и небезопасная проверка `designs.length` в `FeaturedDesigns` | Frontend / Architecture | `app/components/FeaturedDesigns.tsx:1, 16` | 🔵 Low | Открыт |
| **TOOL-001**| Невозможное пересечение типов в `ConfigValue = string & SocialMedia` | Tooling / Types | `lib/store.ts:20` | 🟠 High | Открыт |
| **TOOL-002**| Ошибка `truncateText`: возвращает `"undefined..."` для `null`/`undefined` значений | Tooling / Utils | `lib/utils.ts:17-20` | 🟠 High | Открыт |
| **TOOL-003**| Искажение слагов в `generateSlug` (лишние дефисы) и рассинхронизация тестов | Tooling / Tests | `lib/utils.ts:22-33`, `lib/utils.test.ts:31-41` | 🟡 Medium | Открыт |
| **TOOL-004**| Отсутствие алиаса `@/*` в `vitest.config.ts`, блокирующее запуск тестов | Tooling / Vitest | `vitest.config.ts:1-10` | 🟡 Medium | Открыт |

---

## 3. Глубокий разбор: Безопасность и соответствие OWASP (Deep-Dive Section 1)

### [VULN-001] Отсутствие Row-Level Security (RLS) в Supabase (Полный доступ к модификации/удалению БД)
- **Файл и строки:** `init/postgres_tables.sql:1-31`, `utils/database.ts:13-21`
- **Классификация:** **Critical** (CVSS: 9.8 — `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`)
- **Категория OWASP:** A01:2021 – Broken Access Control
- **Описание проблемы:** В скрипте инициализации PostgreSQL `init/postgres_tables.sql` таблицы `public.studio` и `public.designs` создаются без включения политик безопасности на уровне строк (`ENABLE ROW LEVEL SECURITY`). Supabase по умолчанию открывает REST API через PostgREST. Переменная `NEXT_PUBLIC_SUPABASE_ANON_KEY` по спецификации доступна в браузере любого посетителя. Поскольку RLS выключен, публичный анонимный токен обладает неограниченными правами на выполнение операций `INSERT`, `UPDATE` и `DELETE`.
- **Сценарий атаки:**
  1. Атакующий инспектирует сетевые запросы на фронтенде или читает `.env` и получает `NEXT_PUBLIC_SUPABASE_URL` и `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  2. Выполняется простой HTTP-запрос:
     ```bash
     curl -X DELETE "https://<project-id>.supabase.co/rest/v1/designs?id=neq.0" \
       -H "apikey: <ANON_KEY>" \
       -H "Authorization: Bearer <ANON_KEY>"
     ```
  3. Все дизайны и настройки магазина удаляются. Атакующий также может перезаписать настройки в таблице `studio`, подставив вредоносный URL магазина или сторонний CSS.
- **Исправление:** Применить миграцию с включением RLS и созданием строгих политик:
```sql
-- init/postgres_tables.sql (миграция RLS)
ALTER TABLE public.studio ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.designs ENABLE ROW LEVEL SECURITY;

-- Разрешить анонимное чтение (публичный каталог и конфигурация)
CREATE POLICY "Public Read Studio" 
    ON public.studio FOR SELECT 
    TO anon, authenticated 
    USING (true);

CREATE POLICY "Public Read Designs" 
    ON public.designs FOR SELECT 
    TO anon, authenticated 
    USING (true);

-- Запретить прямую модификацию анонимным клиентам.
-- Модификация разрешена исключительно роли service_role
CREATE POLICY "Service Role Studio All" 
    ON public.studio FOR ALL 
    TO service_role 
    USING (true) 
    WITH CHECK (true);

CREATE POLICY "Service Role Designs All" 
    ON public.designs FOR ALL 
    TO service_role 
    USING (true) 
    WITH CHECK (true);
```

---

### [VULN-002] Remote Prototype Pollution и мутация синглтона в `mapDataToConfig`
- **Файл и строки:** `lib/config.ts:5-23`
- **Классификация:** **Critical** (CVSS: 9.8 — `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:H/I:H/A:H`)
- **Категория OWASP:** A03:2021 – Injection / Prototype Pollution
- **Описание проблемы:** В функции `mapDataToConfig` происходит прямое присваивание импортированного JSON-модуля: `const config: SiteConfig = baseConfig;`. В Node.js импортированный объект кэшируется загрузчиком модулей как глобальный синглтон. Каждое выполнение `mapDataToConfig` перманентно мутирует память процесса. При обработке точечных ключей (например, `social.facebook`) не выполняется валидация на запрещенные свойства прототипа (`__proto__`, `constructor`, `prototype`).
- **Сценарий атаки:** В комбинации с VULN-001 злоумышленник вставляет в таблицу `studio` запись:
  `key = "__proto__.isAdmin"`, `value = "true"`. При первом запросе SSR сервер выполняет обход ключа и устанавливает свойство `isAdmin` прямо на `Object.prototype`, что приводит к компрометации логики авторизации и возможности DoS-атаки на весь сервер Node.js.
- **Исправление:** Изолировать базовую конфигурацию через глубокое клонирование и блокировать прототипные ключи:
```typescript
// lib/config.ts
import { ConfigProp } from "@/types/config";
import { ConfigValue, SiteConfig } from "@/lib/store";
import baseConfig from "@/config/config.json";

const DANGEROUS_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export function mapDataToConfig(props: ConfigProp[]): SiteConfig {
  // Защита от мутации синглтона: глубокое клонирование через structuredClone
  const config: SiteConfig = structuredClone(baseConfig) as SiteConfig;

  for (const prop of props) {
    if (!prop.key || typeof prop.key !== "string") continue;

    if (/\./.test(prop.key)) {
      const keys = prop.key.split(".");
      
      // Защита от Prototype Pollution
      if (keys.some((k) => DANGEROUS_KEYS.has(k))) {
        continue;
      }

      const lastKey = keys.pop()!;
      let obj: Record<string, unknown> = config as unknown as Record<string, unknown>;

      for (const key of keys) {
        if (typeof obj[key] !== "object" || obj[key] === null) {
          obj[key] = {};
        }
        obj = obj[key] as Record<string, unknown>;
      }

      if (lastKey && !DANGEROUS_KEYS.has(lastKey)) {
        obj[lastKey] = prop.value as ConfigValue;
      }
      continue;
    }

    if (!DANGEROUS_KEYS.has(prop.key)) {
      (config as unknown as Record<string, unknown>)[prop.key] = prop.value as ConfigValue;
    }
  }

  return config;
}
```

---

### [VULN-003] SSRF и утечка сессионных кук через нестрогую проверку Redbubble URL
- **Файл и строки:** `lib/sync/redbubble.ts:86-104, 266-289`
- **Классификация:** **High** (CVSS: 8.6 — `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:C/C:H/I:N/A:N`)
- **Категория OWASP:** A10:2021 – Server-Side Request Forgery (SSRF)
- **Описание проблемы:** В функции `normalizeShopUrl` валидация домена выполнена через `/redbubble\.com/i.test(trimmed)`. Регулярное выражение не привязано к хосту. Любой URL вида `https://attacker-redbubble.com` или `https://redbubble.com.attacker.com` или `http://169.254.169.254/#redbubble.com` успешно проходит проверку. Затем Playwright запускает Chromium и передает в заголовках конфиденциальную куку сессии `process.env.REDBUBBLE_COOKIE` на указанный адрес.
- **Исправление:** Валидировать хост через белый список и принудительно требовать HTTPS:
```typescript
// lib/sync/redbubble.ts
const TRUSTED_HOSTS = new Set(["www.redbubble.com", "redbubble.com"]);

export function normalizeShopUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return "";

  // Если передано имя пользователя напрямую (например, "ThreadQuirk" или "@ThreadQuirk")
  if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://")) {
    const username = trimmed.replace(/^@/, "").replace(/[^a-zA-Z0-9_-]/g, "");
    if (!username) return "";
    return `https://www.redbubble.com/people/${username}/shop`;
  }

  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol !== "https:") {
      return "";
    }
    if (!TRUSTED_HOSTS.has(parsed.hostname.toLowerCase())) {
      return "";
    }
    if (parsed.pathname.includes("/explore")) {
      parsed.pathname = parsed.pathname.replace("/explore", "/shop");
    }
    return `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`;
  } catch {
    return "";
  }
}
```

---

### [VULN-004] Небезопасная аутентификация API эндпоинта синхронизации
- **Файл и строки:** `app/api/sync/redbubble/route.ts:5-29, 107-113`
- **Классификация:** **High** (CVSS: 7.5 — `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:L/I:H/A:N`)
- **Категория OWASP:** A07:2021 – Identification and Authentication Failures
- **Описание проблемы:**
  1. Функция `getSecretFromRequest` извлекает токен авторизации из параметров адресной строки (`?secret=...`). Это приводит к утечке секретов в серверные access-логи, историю браузера, рефереры и внешние прокси.
  2. Проверка токена `provided !== expected` использует стандартное сравнение строк, подверженное атакам по времени (timing attacks).
  3. Обработчик `GET` вызывает ту же логику синхронизации, что и `POST`, нарушая идемпотентность HTTP GET и позволяя веб-краулерам и предзагрузчикам ссылок запускать тяжелый скрейпинг.
- **Исправление:** Применять `crypto.timingSafeEqual`, принимать токен только в заголовке `Authorization: Bearer` и удалить обработчик `GET`:
```typescript
// app/api/sync/redbubble/route.ts
import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { syncRedbubbleToSupabase } from "@/lib/sync/redbubble";
import { getSiteConfig } from "@/utils/database";

function constantTimeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

function getSecretFromRequest(request: Request): string | null {
  const authHeader = request.headers.get("authorization");
  if (authHeader?.startsWith("Bearer ")) {
    return authHeader.slice(7).trim();
  }
  return request.headers.get("x-sync-secret");
}

export async function POST(request: Request) {
  const expectedSecret = process.env.SYNC_SECRET;
  if (!expectedSecret || expectedSecret.trim().length === 0) {
    return NextResponse.json({ error: "SYNC_SECRET is not configured" }, { status: 503 });
  }

  const providedSecret = getSecretFromRequest(request);
  if (!providedSecret || !constantTimeCompare(providedSecret, expectedSecret)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return handleSync(request);
}

// GET-обработчик полностью удален во избежание CSRF и несанкционированного запуска
```

---

### [VULN-005] Неконтролируемое потребление ресурсов (Headless Browser DoS)
- **Файл и строки:** `app/api/sync/redbubble/route.ts:89-105`, `lib/sync/redbubble.ts:271-414`
- **Классификация:** **High** (CVSS: 7.5 — `CVSS:3.1/AV:N/AC:L/PR:N/UI:N/S:U/C:N/I:N/A:H`)
- **Категория OWASP:** A04:2021 – Insecure Design / Denial of Service
- **Описание проблемы:** В маршруте синхронизации отсутствует мьютекс (взаимная блокировка) и рейт-лимитинг. Каждый запрос инициирует порождение нового экземпляра браузера Chromium через Playwright, который выполняет циклы скроллинга страницы и потребляет от 300 до 800 МБ RAM. Несколько одновременных запросов приводят к исчерпанию оперативной памяти хоста (OOM) и падению Node.js.
- **Исправление:** Добавить атомарный флаг выполнения (мьютекс) с возвратом HTTP 409 Conflict:
```typescript
// app/api/sync/redbubble/route.ts
let isSyncInProgress = false;

async function handleSync(request: Request) {
  if (isSyncInProgress) {
    return NextResponse.json(
      { error: "Sync operation is already in progress. Please retry later." },
      { status: 409 }
    );
  }

  isSyncInProgress = true;
  try {
    // Выполнение логики синхронизации
    const result = await syncRedbubbleToSupabase({ /* ... */ });
    return NextResponse.json(result);
  } finally {
    isSyncInProgress = false;
  }
}
```

---

### [VULN-006] Внедрение сторонних стилей через невалидированный `themeLink`
- **Файл и строки:** `app/layout.tsx:36-38`
- **Классификация:** **Medium** (CVSS: 6.5 — `CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:U/C:H/I:N/A:N`)
- **Категория OWASP:** A03:2021 – Injection
- **Описание проблемы:** В `app/layout.tsx` значение `themeLink` из настроек монтируется в тег `<link rel="stylesheet">` без валидации протокола и домена. Атакующий, получивший доступ к БД через VULN-001, может внедрить ссылку на вредоносный CSS для кражи чувствительных данных через селекторы атрибутов (CSS Exfiltration) или фишинговой дефейсации.
- **Исправление:** Разрешать подключение стилей только из доверенных CDN:
```tsx
// app/layout.tsx
function isAllowedThemeUrl(urlStr?: string): boolean {
  if (!urlStr) return false;
  try {
    const url = new URL(urlStr);
    const ALLOWED_CDN = ["fonts.googleapis.com", "cdn.jsdelivr.net", "cdnjs.cloudflare.com"];
    return url.protocol === "https:" && ALLOWED_CDN.includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

// В RootLayout:
{isAllowedThemeUrl(newConfig.themeLink) ? (
  <link rel="stylesheet" crossOrigin="anonymous" href={newConfig.themeLink} />
) : null}
```

---

### [VULN-007] Stored XSS через неподтвержденные протоколы внешних ссылок
- **Файл и строки:** `app/designs/[id]/page.tsx:144-150`, `app/components/Footer.tsx:52-106`
- **Классификация:** **Medium** (CVSS: 6.1 — `CVSS:3.1/AV:N/AC:L/PR:N/UI:R/S:C/C:L/I:L/A:N`)
- **Категория OWASP:** A03:2021 – Injection (XSS)
- **Описание проблемы:** В карточке товара и футере ссылки формируются напрямую из свойств БД: `<a href={design?.externalLink}>` и `<a href={config.social.facebook}>`. Если свойство содержит псевдопротокол `javascript:...`, клик пользователя приводит к исполнению произвольного JavaScript в браузере жертвы.
- **Исправление:** Санитизировать URL, допуская только схемы `http:` и `https:`:
```typescript
// lib/utils.ts
export function sanitizeUrl(url?: string | null): string {
  if (!url) return "#";
  try {
    const parsed = new URL(url.trim());
    if (parsed.protocol === "https:" || parsed.protocol === "http:") {
      return parsed.toString();
    }
  } catch {
    // Ошибочный URL
  }
  return "#";
}
```

---

### [VULN-008] Открытая передача учетных данных MySQL (Missing TLS/SSL)
- **Файл и строки:** `utils/database.ts:29-35`
- **Классификация:** **Medium** (CVSS: 5.9 — `CVSS:3.1/AV:N/AC:H/PR:N/UI:N/S:U/C:H/I:N/A:N`)
- **Категория OWASP:** A02:2021 – Cryptographic Failures
- **Описание проблемы:** При использовании драйвера `mysql2` пул соединений создается без опции `ssl`. В облачных средах (AWS RDS, DigitalOcean, PlanetScale) трафик к базе данных передается в открытом виде, допуская перехват паролей и данных каталога.
- **Исправление:** Добавить принудительную конфигурацию SSL в production:
```typescript
// utils/database.ts
pool = mysql.createPool({
  host: MYSQL_HOST,
  port: MYSQL_PORT ? Number(MYSQL_PORT) : 3306,
  user: MYSQL_USER,
  password: MYSQL_PASSWORD,
  database: MYSQL_DATABASE,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: true } : undefined,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});
```

---

### [VULN-009] Отсутствие заголовков безопасности в Next.js
- **Файл и строки:** `next.config.mjs:1-27`
- **Классификация:** **Low** (CVSS: 3.7)
- **Категория OWASP:** A05:2021 – Security Misconfiguration
- **Описание проблемы:** В конфигурации `next.config.mjs` не объявлены HTTP-заголовки защиты (Content Security Policy, X-Frame-Options, X-Content-Type-Options, Strict-Transport-Security), что увеличивает риск Clickjacking и MIME-sniffing.
- **Исправление:** Добавить метод `headers()`:
```javascript
// next.config.mjs
const nextConfig = {
  // ...
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};
export default nextConfig;
```

---

### [VULN-010] Уязвимость Prototype Pollution в зависимости `mysql2` (CVE-2024-21508)
- **Файл и строки:** `package.json:26`
- **Классификация:** **Medium** (CVSS: 6.5)
- **Категория OWASP:** A06:2021 – Vulnerable and Outdated Components
- **Описание проблемы:** В `package.json` зафиксирована версия `"mysql2": "^3.4.0"`. Версии `mysql2` до 3.9.4 содержат критическую уязвимость Prototype Pollution в парсере параметров запросов.
- **Исправление:** Обновить `mysql2` до версии `^3.11.0` в `package.json` и выполнить `npm install`.

---

## 4. Глубокий разбор: Бэкенд, База данных и Пайплайн скрейпинга (Deep-Dive Section 2)

### [BE-001] Ошибка регулярного выражения `extractExternalIdFromUrl` (100% отказ сохранения данных)
- **Файл и строки:** `lib/sync/redbubble.ts:112-117`
- **Критичность:** 🔴 Critical
- **Симптомы:** При выполнении скрейпинга `syncRedbubbleToSupabase` консоль сообщает о найденных ссылках, но ни один дизайн не добавляется в базу данных.
- **Причина:**
  - В Redbubble стандартный URL товара строится по схеме: `/i/{product-type}/{title-slug}/{id}.{variant-code}` (например, `/i/t-shirt/Space-Cat/15923841.1YY3`) либо `/people/{artist}/works/{id}-{title-slug}`.
  - Регулярное выражение `/\/(?:shop\/ap|i)\/[^\/]+\/([0-9]{5,})/i` ожидает, что цифры ID идут сразу после типа продукта (`/i/category/12345`), тогда как в реальном URL третьим сегментом является `{title-slug}`.
  - Запасное выражение `/\/([0-9]{5,})(?:\?|$)/` требует, чтобы ID заканчивался концом строки или знаком `?`. Наличие точки суффикса `.1YY3` или тире приводит к несовпадению. В результате функция всегда возвращает `null`, и строка 200 отбрасывает товар: `if (!item.externalId) continue;`.
- **Исправление:**
```typescript
// lib/sync/redbubble.ts
function extractExternalIdFromUrl(url: string): number | null {
  // Поддерживает форматы:
  // 1. /i/t-shirt/Slug-Name/12345678.1YY3
  // 2. /works/12345678-slug-name
  // 3. /shop/ap/12345678
  const match = url.match(
    /(?:\/shop\/ap\/|\/works\/|\/i\/[^\/]+\/[^\/]+\/|[\/-])([0-9]{5,})(?:\.[a-z0-9]+|-[^\/?#]+|\/|\?|#|$)/i
  );
  if (match && match[1]) {
    return Number(match[1]);
  }

  // Общий фоллбэк: ищем последовательность от 6 цифр подряд
  const fallback = url.match(/([0-9]{6,})/);
  return fallback ? Number(fallback[1]) : null;
}
```

---

### [BE-002] Сбой батч-апсерта при дубликатах ID и сокрытии ошибок под видом «skipped»
- **Файл и строки:** `lib/sync/redbubble.ts:566-599`
- **Критичность:** 🔴 Critical
- **Симптомы:** Пакетная синхронизация завершается аварийно при повторном нахождении того же товара; метрика `inserted` всегда равна `0`, а ошибки БД рапортуются как «пропущенные» (skipped).
- **Причина:**
  1. Переменная `inserted` жестко закодирована в 0.
  2. Если разные ссылки ведут на один и тот же товар (дубликаты по `externalId` в рамках одного батча), PostgreSQL возвращает ошибку `21000: ON CONFLICT DO UPDATE command cannot affect row a second time`, полностью откатывая весь пакет из 50 строк.
  3. В случае ошибки `supabase.upsert()` возвращает `error`, а код устанавливает `skipped = rows.length`, скрывая ошибку от оператора.
- **Исправление:** Выполнять предварительную дедупликацию в памяти по `externalId` и корректно обрабатывать результат:
```typescript
// lib/sync/redbubble.ts (внутри батч-обработки)
// Дедупликация массива строк перед вставкой
const uniqueRowsMap = new Map<number, typeof rows[0]>();
for (const row of rows) {
  uniqueRowsMap.set(row.externalId, row);
}
const dedupedRows = Array.from(uniqueRowsMap.values());

const { data, error } = await supabase
  .from("designs")
  .upsert(dedupedRows, {
    onConflict: "externalId",
    ignoreDuplicates: false,
  })
  .select("id, externalId");

if (error) {
  errorsCount += dedupedRows.length;
  errorMessages.push(`Batch upsert error: ${error.message}`);
} else {
  // data содержит обновленные или вставленные записи
  updated += data?.length || 0;
}
```

---

### [BE-003] Фатальный сбой SSR при обходе несуществующих вложенных свойств конфигурации
- **Файл и строки:** `lib/config.ts:11-17`
- **Критичность:** 🔴 Critical
- **Симптомы:** Серверный рендеринг страниц Next.js завершается 500 ошибкой: `TypeError: Cannot read properties of undefined (reading '...')`.
- **Причина:** При обработке ключей вида `custom.banner.title` код выполняет цикл:
  ```typescript
  for (const key of keys) {
    obj = obj[key as keyof typeof obj] as unknown as typeof obj;
  }
  ```
  Если ключ `custom` или `banner` отсутствует в базовом объекте, `obj[key]` становится `undefined`. На следующей итерации `undefined[key]` вызывает неперехватываемое исключение.
- **Исправление:** Автоматически инициализировать пустые промежуточные объекты (см. листинг `lib/config.ts` в [VULN-002]).

---

### [BE-004] Утечка процессов Chromium при сбое сохранения `storageState` в Playwright
- **Файл и строки:** `lib/sync/redbubble.ts:404-415`
- **Критичность:** 🟠 High
- **Симптомы:** На сервере накапливаются «зомби»-процессы Chromium, оперативная память забивается до 100%.
- **Причина:** В функции `createPlaywrightSession.close()` вызов `await context.storageState(...)` происходит до закрытия контекста и браузера. Если директории `.cache/` не существует или диск недоступен для записи, вызов выбрасывает ошибку, а последующие `context.close()` и `browser.close()` не вызываются.
- **Исправление:** Обернуть финализацию сессии в гарантированный блок `finally`:
```typescript
// lib/sync/redbubble.ts
async close(): Promise<void> {
  try {
    if (options.storageStatePath) {
      const dir = path.dirname(options.storageStatePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      await context.storageState({ path: options.storageStatePath }).catch(() => {});
    }
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }
}
```

---

### [BE-005] Состояние гонки в `RequestPacer` при параллельной работе воркеров
- **Файл и строки:** `lib/sync/redbubble.ts:63-84, 450`
- **Критичность:** 🟠 High
- **Симптомы:** Скрейпинг моментально блокируется защитой Cloudflare при установке `concurrency > 1`.
- **Причина:** Метод `waitTurn()` проверяет разницу `Date.now() - this.lastRequestAt`. При конкурентном вызове несколько воркеров одновременно читают старую временную метку до ее обновления. В результате задержка не применяется, и запросы отправляются пачкой в одну и ту же миллисекунду.
- **Исправление:** Сериализовать вызовы через цепочку промисов (Promise Mutex):
```typescript
// lib/sync/redbubble.ts
class RequestPacer {
  private lastRequestAt = 0;
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly minIntervalMs: number,
    private readonly jitterMs: number
  ) {}

  async waitTurn(): Promise<void> {
    this.queue = this.queue.then(async () => {
      const now = Date.now();
      const elapsed = now - this.lastRequestAt;
      const baseWait = Math.max(0, this.minIntervalMs - elapsed);
      const jitter = this.jitterMs > 0 ? Math.floor(Math.random() * this.jitterMs) : 0;
      const totalWait = baseWait + jitter;

      if (totalWait > 0) {
        await sleep(totalWait);
      }
      this.lastRequestAt = Date.now();
    });

    return this.queue;
  }
}
```

---

### [BE-006] Недетерминированная пагинация из-за отсутствия `ORDER BY` в SQL и Supabase
- **Файл и строки:** `utils/database.ts:60-68, 114-117`
- **Критичность:** 🟠 High
- **Симптомы:** При переключении страниц в каталоге (`/designs?page=2`) одни и те же товары отображаются на разных страницах, а часть товаров исчезает из выдачи.
- **Причина:** По стандарту реляционных СУБД (PostgreSQL и MySQL) порядок строк при выборке с `LIMIT / OFFSET` или `range()` без явного указания `ORDER BY` не гарантируется. При параллельных операциях вставки/обновления порядок выборки изменяется спонтанно.
- **Исправление:** Добавить явную сортировку по `createdAt DESC`:
```typescript
// utils/database.ts (Supabase)
let query = supabase!
  .from("designs")
  .select("*", { count: "exact" })
  .order("createdAt", { ascending: false });

// utils/database.ts (MySQL)
const [rows] = await pool!.query<mysql.RowDataPacket[]>(
  `SELECT * ${base} ORDER BY createdAt DESC LIMIT ? OFFSET ?`,
  [...params, itemsPerPage, offset]
);
```

---

### [BE-007] Падение сборки `next build` при неинициализированных переменных БД
- **Файл и строки:** `utils/database.ts:13-38`
- **Критичность:** 🟠 High
- **Симптомы:** Сборка проекта в CI/CD (`npm run build`) падает с фатальной ошибкой: `Error: Missing Supabase environment variables`.
- **Причина:** Валидация переменных окружения и инициализация клиентов `createClient` и `mysql.createPool` вызываются синхронно в корне модуля при его первом импорте сборщиком.
- **Исправление:** Использовать ленивую (lazy) инициализацию клиентов внутри функций доступа:
```typescript
// utils/database.ts
let supabaseClient: ReturnType<typeof createClient> | null = null;

function getSupabase() {
  if (!supabaseClient) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
      throw new Error("Database is not configured: Missing Supabase environment variables");
    }
    supabaseClient = createClient(url, key);
  }
  return supabaseClient;
}
```

---

### [BE-008] Утечка пула соединений MySQL при Hot Reload и отсутствие лимитов
- **Файл и строки:** `utils/database.ts:29-35`
- **Критичность:** 🟠 High
- **Симптомы:** В процессе локальной разработки или при релоаде страниц сервер MySQL выбрасывает ошибку: `ER_CON_COUNT_ERROR: Too many connections`.
- **Причина:** Модуль `utils/database.ts` переоценивается при каждом HMR-триггере, создавая новый экземпляр `mysql.createPool` без переиспользования старого.
- **Исправление:** Сохранять пул в `globalThis`:
```typescript
// utils/database.ts
const globalForMySQL = globalThis as unknown as { mysqlPool?: mysql.Pool };

export function getMySQLPool(): mysql.Pool {
  if (!globalForMySQL.mysqlPool) {
    globalForMySQL.mysqlPool = mysql.createPool({
      host: process.env.MYSQL_HOST,
      port: Number(process.env.MYSQL_PORT) || 3306,
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      dateStrings: true,
    });
  }
  return globalForMySQL.mysqlPool;
}
```

---

### [BE-009] Зависание CLI-скрипта синхронизации из-за незакрытого пула соединений MySQL
- **Файл и строки:** `scripts/sync-redbubble.ts:5-75`
- **Критичность:** 🟠 High
- **Симптомы:** Команда `npm run sync:redbubble` выполняет синхронизацию, но не возвращает управление в терминал, зависая навсегда.
- **Причина:** Вызов `getSiteConfig()` открывает дескрипторы сокетов в пуле `mysql2`. Поскольку явный метод закрытия пула отсутствует, Event Loop Node.js остается активным.
- **Исправление:** Добавить экспорт функции `closeDatabaseConnections()` из `utils/database.ts` и вызвать ее в `scripts/sync-redbubble.ts` перед `process.exit(0)`:
```typescript
// utils/database.ts
export async function closeDatabaseConnections(): Promise<void> {
  if (globalForMySQL.mysqlPool) {
    await globalForMySQL.mysqlPool.end();
    globalForMySQL.mysqlPool = undefined;
  }
}

// scripts/sync-redbubble.ts
try {
  // ... run sync ...
} finally {
  await closeDatabaseConnections();
  process.exit(0);
}
```

---

### [BE-010] Полная неработоспособность API синхронизации при `DATABASE_PROVIDER=mysql`
- **Файл и строки:** `app/api/sync/redbubble/route.ts:45-56`
- **Критичность:** 🟠 High
- **Симптомы:** Если проект настроен на работу с MySQL, вызов `/api/sync/redbubble` завершается ошибкой `500 Missing Supabase environment variables`.
- **Причина:** Маршрут жестко завязан на функцию `syncRedbubbleToSupabase`. Абстракция для сохранения данных в MySQL отсутствует в пайплайне скрейпера.
- **Исправление:** Внедрить обобщенный интерфейс сохранения `upsertDesigns(designs: Design[])` в `utils/database.ts`, поддерживающий и Supabase, и MySQL через `INSERT INTO designs ... ON DUPLICATE KEY UPDATE`.

---

### [BE-011] Крах синтаксиса MySQL при отрицательном или нулевом номере страницы
- **Файл и строки:** `utils/database.ts:57-58, 101`
- **Критичность:** 🟡 Medium
- **Симптомы:** Запрос вида `/designs?page=-1` роняет бэкенд с ошибкой `Query error: near '-24'`.
- **Причина:** Формула `offset = (page - 1) * itemsPerPage` не проверяет минимальное значение. При `page = -1` и `itemsPerPage = 12` получается `OFFSET -24`, что является синтаксической ошибкой SQL.
- **Исправление:**
```typescript
const safePage = Math.max(1, Number.isInteger(page) ? page : 1);
const safeLimit = Math.max(1, Math.min(100, Number.isInteger(itemsPerPage) ? itemsPerPage : 12));
const offset = (safePage - 1) * safeLimit;
```

---

### [BE-012] Неэффективная in-memory агрегация коллекций
- **Файл и строки:** `utils/database.ts:295-318`
- **Критичность:** 🟡 Medium
- **Симптомы:** Загрузка страницы каталога тормозит при росте числа товаров; в списке фильтров появляются пустые строки и `"no_collection"`.
- **Причина:** Выборка выгружает поле `collection` для всех строк таблицы в оперативную память Node.js и фильтрует дубли через `Set`, упираясь в лимит PostgREST (1000 строк).
- **Исправление:** Использовать фильтрацию на уровне СУБД:
```typescript
// Supabase:
const { data, error } = await supabase!
  .from("designs")
  .select("collection")
  .not("collection", "is", null)
  .neq("collection", "")
  .neq("collection", "no_collection");

// MySQL:
const [rows] = await pool!.query<mysql.RowDataPacket[]>(
  "SELECT DISTINCT collection FROM designs WHERE collection IS NOT NULL AND collection != '' AND collection != 'no_collection'"
);
```

---

### [BE-013] Рассинхронизация типов данных между MySQL и Supabase
- **Файл и строки:** `utils/database.ts:125-145`
- **Критичность:** 🟡 Medium
- **Симптомы:** Проверки вида `design.shared === true` на фронтенде не срабатывают при переключении на MySQL.
- **Причина:** Поле `shared` в MySQL хранится как `TINYINT(1)` (возвращает `0` или `1`). Простое приведение TypeScript `row.shared as boolean` не конвертирует значение во время выполнения. Поле `createdAt` в `mysql2` возвращается как объект `Date`, а в Supabase — как строка ISO.
- **Исправление:** Применять явное runtime-преобразование типов:
```typescript
shared: Boolean(row.shared),
createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt || new Date().toISOString()),
```

---

## 5. Глубокий разбор: Фронтенд, Next.js 16 и UI/UX (Deep-Dive Section 3)

### [FE-001] Динамическая интерполяция в классе Tailwind (`h-[${designCardWidth}px]`)
- **Файл и строки:** `app/components/DesignCard.tsx:27`
- **Критичность:** 🔴 Critical
- **Симптомы:** Картинки в карточках каталога и на главной странице рендерятся без ограничения высоты либо схлопываются.
- **Причина:** Tailwind CSS производит статический анализ исходных файлов на этапе сборки. Конструкция вида `className={`w-full h-[${designCardWidth}px] object-cover`}` не распознается сканером, и класс `h-[600px]` не включается в сгенерированный файл `globals.css`.
- **Исправление:** Использовать контейнер с фиксированным соотношением сторон `aspect-[3/2]` и свойство `fill`:
```tsx
// app/components/DesignCard.tsx
<div className="relative w-full aspect-[3/2] overflow-hidden bg-gray-100">
  <Image
    src={imageUrl}
    alt={design.title}
    fill
    sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
    className="object-cover transition-transform duration-300 hover:scale-105"
  />
</div>
```

---

### [FE-002] Разрыв поисковой формы и фильтра коллекций + полный релоад страницы
- **Файл и строки:** `app/components/CatalogSearchBar.tsx:18, 37-54`
- **Критичность:** 🔴 Critical
- **Симптомы:** Ввод поискового запроса сбрасывает выбранную коллекцию. Выбор коллекции из выпадающего списка вызывает полную перезагрузку вкладки браузера через `window.location.href`.
- **Причина:** Селект `<select name="collection">` расположен вне тега `<form action="/designs">`. При нажатии Enter отправляется стандартный GET-запрос только с полем `search`. В свою очередь обработчик `onChange` у селекта перетирает `window.location.href`.
- **Исправление:** Объединить состояние через `useRouter` и `useSearchParams` с поддержкой SPA-навигации:
```tsx
// app/components/CatalogSearchBar.tsx
"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { useTransition } from "react";

type CatalogSearchBarProps = {
  searchQuery: string;
  selectedCollection: string;
  collections: string[];
};

export function CatalogSearchBar({
  searchQuery,
  collections,
  selectedCollection,
}: CatalogSearchBarProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const updateQueryParams = (newSearch?: string, newCollection?: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", "1");

    const search = newSearch !== undefined ? newSearch : (params.get("search") || "");
    const collection = newCollection !== undefined ? newCollection : (params.get("collection") || "");

    if (search.trim()) {
      params.set("search", search.trim());
    } else {
      params.delete("search");
    }

    if (collection) {
      params.set("collection", collection);
    } else {
      params.delete("collection");
    }

    startTransition(() => {
      router.push(`/designs?${params.toString()}`);
    });
  };

  return (
    <div className="flex flex-col md:flex-row gap-4 mb-8">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const target = e.currentTarget.elements.namedItem("search") as HTMLInputElement;
          updateQueryParams(target.value, undefined);
        }}
        className="flex-grow"
      >
        <div className="relative">
          <input
            type="text"
            name="search"
            placeholder="Search designs..."
            defaultValue={searchQuery}
            className="w-full px-4 py-2 pr-10 rounded-md border border-[#748D92] focus:outline-none focus:ring-2 focus:ring-[#124E66]"
            aria-label="Search designs"
          />
          <button
            type="submit"
            disabled={isPending}
            className="absolute right-2 top-1/2 transform -translate-y-1/2 text-[#748D92] hover:text-[#124E66]"
            aria-label="Submit search"
          >
            <Search size={20} />
          </button>
        </div>
      </form>

      <select
        name="collection"
        aria-label="Filter by collection"
        value={selectedCollection}
        onChange={(e) => updateQueryParams(undefined, e.target.value)}
        className="px-4 py-2 rounded-md border border-[#748D92] focus:outline-none focus:ring-2 focus:ring-[#124E66] bg-white text-[#212A31]"
      >
        <option value="">All Collections</option>
        {collections.map((col) => (
          <option key={col} value={col}>
            {col}
          </option>
        ))}
      </select>
    </div>
  );
}
```

---

### [FE-003] Отсутствие `"use client"` в интерактивных компонентах иконок
- **Файл и строки:** `app/components/Icons/*.tsx:1-28` (`Amazon`, `RedBubble`, `TeePublic`, `Temu`, `TostaDora`, `Zazzle`)
- **Критичность:** 🟠 High
- **Симптомы:** Сборка Next.js падает с ошибкой: `You're importing a component that needs useState. It only works in a Client Component but none of its parents are marked with "use client"`.
- **Причина:** Все 6 файлов иконок импортируют `useState` для отслеживания ховера (`isHovered`) и динамического изменения цвета SVG `fill`. При этом директива `"use client"` отсутствует. Использование JavaScript состояния для ховера SVG — грубый антипаттерн, вызывающий лишние ре-рендеры React 19.
- **Исправление:** Удалить `useState` и реализовать ховер через чистый CSS/Tailwind с `fill="currentColor"`:
```tsx
// app/components/Icons/RedBubble.tsx (аналогично для остальных 5 иконок)
import React from "react";

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

export function RedBubble({ size = 24, className, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="currentColor"
      aria-hidden="true"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      {...props}
    >
      <path d="M22.177 21.766h-4.266c-0.234 0-0.427-0.193-0.427-0.427v-10.708c0-0.234 0.193-0.427 0.427-0.427h3.953c2.969 0 3.594 1.75 3.594 3.214 0 0.849-0.224 1.521-0.672 2.016 1.089 0.448 1.672 1.458 1.672 2.922 0 2.135-1.599 3.411-4.281 3.411zM15.984 21.766h-8.859c-0.234 0-0.427-0.193-0.427-0.427v-10.708c0-0.234 0.193-0.427 0.427-0.427h4.141c2.583 0 4.125 1.391 4.125 3.724 0 1.552-0.776 2.771-2.036 3.266l2.948 3.859c0.24 0.276 0.047 0.708-0.318 0.714zM16 0c-8.839 0-16 7.161-16 16s7.161 16 16 16c8.839 0 16-7.161 16-16s-7.161-16-16-16z" />
    </svg>
  );
}
```

---

### [FE-004] Soft 404: возврат 200 OK вместо вызова `notFound()`
- **Файл и строки:** `app/designs/[id]/page.tsx:63-71`
- **Критичность:** 🟠 High
- **Симптомы:** Поисковые системы индексируют битые URL как существующие страницы, ухудшая ранжирование домена (Soft 404).
- **Причина:** Если товар не найден в БД, компонент возвращает `<div>Design not found</div>` с кодом ответа 200 OK.
- **Исправление:** Вызывать стандартный метод `notFound()` из `next/navigation`:
```tsx
// app/designs/[id]/page.tsx
import { notFound } from "next/navigation";

export default async function DesignDetails({ params }: DesignPageProps) {
  const resolvedParams = await params;
  const data = await getDesignById(resolvedParams.id);

  if (!data || !data.design) {
    notFound();
  }

  const { design, relatedDesigns = [] } = data;
  // ...
}
```

---

### [FE-005] Уязвимость обратного табнаббинга в `externalLink`
- **Файл и строки:** `app/designs/[id]/page.tsx:144-150`
- **Критичность:** 🟠 High
- **Симптомы:** Пользователь переходит в магазин на внешний сайт, а исходная вкладка может быть перенаправлена на фишинговый сайт через `window.opener`.
- **Причина:** Использование `target="_blank"` без защитного атрибута `rel="noopener noreferrer"`.
- **Исправление:** Добавить защитный атрибут и проверку наличия ссылки:
```tsx
{design.externalLink && (
  <a
    href={sanitizeUrl(design.externalLink)}
    target="_blank"
    rel="noopener noreferrer"
    className="w-full block text-center bg-[#124E66] text-white px-6 py-2 rounded-md hover:bg-[#2E3944] transition-colors font-medium shadow-sm"
  >
    Shop products with this design
  </a>
)}
```

---

### [FE-006] Фатальный краш рендеринга страницы в `formatDate`
- **Файл и строки:** `app/designs/[id]/page.tsx:141`, `lib/utils.ts:6-8`
- **Критичность:** 🟠 High
- **Симптомы:** Если у дизайна отсутствует или повреждена дата `createdAt`, открытие карточки падает с ошибкой: `Error: Invalid date`.
- **Причина:** Функция `formatDate` в `lib/utils.ts` принудительно выбрасывает исключение `throw new Error('Invalid date')`, которое нигде не перехватывается.
- **Исправление:** Обеспечить безопасный возврат фоллбэка:
```typescript
// lib/utils.ts
export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "Date unavailable";
  const parsed = typeof date === "string" ? new Date(date) : date;
  if (!(parsed instanceof Date) || isNaN(parsed.getTime())) {
    return "Date unavailable";
  }
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC", // Фиксация часового пояса устраняет Hydration Mismatch
  }).format(parsed);
}
```

---

### [FE-007] Нефункциональная форма обратной связи
- **Файл и строки:** `app/components/ContactForm.tsx:18-24`
- **Критичность:** 🟠 High
- **Симптомы:** Пользователи отправляют сообщения через форму контактов, но письма никуда не уходят, а на экране нет никакого подтверждения.
- **Причина:** Обработчик формы содержит лишь заглушку `console.log("Form submitted:", formData)`.
- **Исправление:** Добавить состояние отправки (индикатор загрузки, баннер успешной отправки или ошибки) и связать с серверным эндпоинтом `/api/contact` или Server Action.

---

### [FE-008] Инвертированный серверный снимок в `CookieBanner` и сбои гидратации
- **Файл и строки:** `app/components/CookieBanner.tsx:11-24`
- **Критичность:** 🟠 High
- **Симптомы:** Баннер куки внезапно появляется с задержкой после загрузки страницы, вызывая сдвиг макета (CLS). В приватном режиме Safari страница падает из-за `DOMException` при чтении `localStorage`.
- **Причина:** `getServerSnapshot()` возвращает `true` (считая, что куки уже приняты), а клиентский снимок возвращает `false`. Отсутствует `try/catch` вокруг чтения `localStorage`.
- **Исправление:** Использовать безопасный эффект монтирования компонента:
```tsx
// app/components/CookieBanner.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

export function CookieBanner() {
  const [showBanner, setShowBanner] = useState(false);

  useEffect(() => {
    try {
      const accepted = localStorage.getItem("cookiesAccepted");
      if (accepted !== "true") {
        setShowBanner(true);
      }
    } catch {
      // Игнорируем ошибку при заблокированном доступе к storage
    }
  }, []);

  const handleAccept = () => {
    try {
      localStorage.setItem("cookiesAccepted", "true");
    } catch {}
    setShowBanner(false);
  };

  if (!showBanner) return null;

  return (
    <div
      role="region"
      aria-label="Cookie consent"
      className="fixed bottom-0 left-0 right-0 bg-[#212A31] text-[#D3D9D4] p-4 shadow-lg z-50"
    >
      <div className="container mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-sm">
          We use cookies to enhance your experience. By continuing to visit this site you agree to our use of cookies.{" "}
          <Link href="/privacy-policy" className="underline hover:text-[#748D92]">
            Learn more
          </Link>
        </p>
        <button
          onClick={handleAccept}
          className="bg-[#124E66] text-[#D3D9D4] px-4 py-2 rounded-md hover:bg-[#2E3944] transition-colors text-sm font-medium whitespace-nowrap"
        >
          Accept
        </button>
      </div>
    </div>
  );
}
```

---

### [FE-009] Ошибочное свойство `changeFreq` в `sitemap.ts` и пропуск маршрута `/designs`
- **Файл и строки:** `app/sitemap.ts:14, 20, 26, 32, 38, 48`
- **Критичность:** 🟠 High
- **Симптомы:** Сгенерированная карта сайта `sitemap.xml` игнорирует указанную частоту обновления, а основной каталог товаров вообще отсутствует в поисковом индексе.
- **Причина:** В Next.js поле типа `MetadataRoute.Sitemap` называется `changeFrequency`, а в коде ошибочно указано `changeFreq`. Маршрут `/designs` забыт в массиве `staticRoutes`.
- **Исправление:**
```typescript
// app/sitemap.ts
import { MetadataRoute } from "next";
import { getSiteConfig, fetchDesigns } from "@/utils/database";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const config = await getSiteConfig();
  const lastModified = new Date();

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `https://${config.domain}/`, lastModified, priority: 1.0, changeFrequency: "weekly" },
    { url: `https://${config.domain}/designs`, lastModified, priority: 0.9, changeFrequency: "daily" },
    { url: `https://${config.domain}/about`, lastModified, priority: 0.7, changeFrequency: "monthly" },
    { url: `https://${config.domain}/services`, lastModified, priority: 0.7, changeFrequency: "monthly" },
    { url: `https://${config.domain}/contact`, lastModified, priority: 0.6, changeFrequency: "monthly" },
    { url: `https://${config.domain}/terms-of-service`, lastModified, priority: 0.4, changeFrequency: "yearly" },
    { url: `https://${config.domain}/privacy-policy`, lastModified, priority: 0.4, changeFrequency: "yearly" },
  ];

  const { designs } = await fetchDesigns(1, "", "", 1000);
  const designEntries: MetadataRoute.Sitemap = (designs || []).map((design) => ({
    url: `https://${config.domain}/designs/${design.id}`,
    lastModified: design.updatedAt ? new Date(design.updatedAt) : lastModified,
    priority: 0.6,
    changeFrequency: "weekly",
  }));

  return [...staticRoutes, ...designEntries];
}
```

---

### [FE-010] Крах `decodeURIComponent` на URL с символом `%` и 404 на плейсхолдере
- **Файл и строки:** `app/components/DesignCard.tsx:21-23`
- **Критичность:** 🟠 High
- **Симптомы:** Каталог падает с ошибкой `URIError: URI malformed`. Если изображение отсутствует, браузер запрашивает `/placeholder.svg`, отдавая 404 Not Found.
- **Причина:** Если URL изображения уже содержит процентное кодирование или спецсимвол `%`, `decodeURIComponent` выбрасывает исключение. Файла `placeholder.svg` в папке `public/` не существует (там лежит `public/images/no_image_available.svg`).
- **Исправление:** Использовать прямой URL без ручного декодирования и корректный плейсхолдер:
```tsx
const imageUrl = design.externalImageUrl?.trim() || "/images/no_image_available.svg";
```

---

### [FE-011] Избыточная загрузка 1000 записей на главной странице ради 3 элементов
- **Файл и строки:** `app/page.tsx:35-40`
- **Критичность:** 🟠 High
- **Симптомы:** Главная страница загружается медленно и потребляет чрезмерный объем памяти Node.js.
- **Причина:** Код запрашивает 1000 строк из БД: `const { designs } = await fetchDesigns(1, "", "", 1000);`, затем сортирует их в памяти через `designs.sort(() => 0.5 - Math.random()).slice(0, 3)`.
- **Исправление:** Выбирать 3 записи на уровне базы данных (`fetchFeaturedDesigns(3)`).

---

### [FE-012] Неэкранированные параметры в ссылках пагинации
- **Файл и строки:** `app/designs/page.tsx:76, 87`, `app/designs/[id]/page.tsx:135`
- **Критичность:** 🟡 Medium
- **Симптомы:** При наличии спецсимволов (`&`, пробелы) в названии коллекции пагинация ломается (например, `collection=Art & Craft` превращается в `collection=Art` и паразитный параметр `Craft`).
- **Исправление:** Формировать query string через `URLSearchParams`:
```tsx
const createPageUrl = (targetPage: number) => {
  const p = new URLSearchParams();
  p.set("page", targetPage.toString());
  if (searchQuery) p.set("search", searchQuery);
  if (selectedCollection) p.set("collection", selectedCollection);
  return `/designs?${p.toString()}`;
};
```

---

### [FE-013] Импорт приватных путей Next.js и ручной `<head>` в `app/layout.tsx`
- **Файл и строки:** `app/layout.tsx:4, 26-40`
- **Критичность:** 🟡 Medium
- **Симптомы:** Предупреждения компилятора при сборке, потенциальные ошибки гидратации.
- **Причина:** `import { NextFont } from "next/dist/compiled/@next/font"` обращается к приватным внутренностям Next.js; ручной тег `<head>` дублирует функционал App Router; `<GoogleAnalytics>` смонтирован внутри `<head>` вместо `<body>`.
- **Исправление:** Удалить приватный импорт, мигрировать метатеги в `generateMetadata()` и перенести `<GoogleAnalytics>` внутрь `<body>`.

---

### [FE-014] Отсутствие `priority` на первом слайде карусели (деградация LCP)
- **Файл и строки:** `app/components/Carousel.tsx:34-39`
- **Критичность:** 🟡 Medium
- **Симптомы:** Низкая оценка Google Core Web Vitals (метрика Largest Contentful Paint).
- **Причина:** Первый слайдер карусели является основным визуальным элементом на первом экране, но компонент `<Image>` не имеет пропса `priority` и загружается с ленивой задержкой.
- **Исправление:** Добавить `priority={index === 0}` и `sizes="100vw"`.

---

### [FE-015] Недоступная мобильная кнопка меню (Accessibility A11y)
- **Файл и строки:** `app/components/Header.tsx:50-55`
- **Критичность:** 🟡 Medium
- **Симптомы:** Невозможность навигации для пользователей скринридеров; потеря фокуса с клавиатуры.
- **Причина:** Кнопка меню не имеет `aria-label`, `aria-expanded`, а класс `focus:outline-none` подавляет стандартный индикатор фокуса.
- **Исправление:** Добавить `aria-label={isMenuOpen ? "Close menu" : "Open menu"}`, `aria-expanded={isMenuOpen}` и класс `focus-visible:ring-2 focus-visible:ring-[#124E66]`.

---

### [FE-016] Лишняя директива `"use client"` на статической странице `services`
- **Файл и строки:** `app/services/page.tsx:1-59`
- **Критичность:** 🟡 Medium
- **Симптомы:** Увеличение размера клиентского JS-бандла, невозможность экспорта `generateMetadata`.
- **Причина:** Полностью статическая страница размечена как клиентский компонент.
- **Исправление:** Удалить директиву `"use client"`, экспортировать `generateMetadata` и сделать страницу серверным компонентом.

---

### [FE-017] Опечатка в регистре ключа конфигурации (`tostaDora` vs `tostadora`)
- **Файл и строки:** `app/contact/page.tsx:45`
- **Критичность:** 🟡 Medium
- **Симптомы:** Ссылка на магазин Tostadora никогда не отображается на странице контактов.
- **Причина:** В коде запрашивается `config.representation.tostaDora`, а в `config.json` ключ записан в нижнем регистре: `"tostadora"`.
- **Исправление:** `tostaDora={config.representation?.tostaDora || config.representation?.tostadora}`.

---

### [FE-018] Использование классов `prose` без плагина `@tailwindcss/typography`
- **Файл и строки:** `app/privacy-policy/page.tsx:30`, `app/terms-of-service/page.tsx:30`
- **Критичность:** 🟡 Medium
- **Симптомы:** Стили оформления текстовых блоков `prose prose-lg` не применяются к правовым документам.
- **Причина:** Плагин `@tailwindcss/typography` не установлен в `package.json` и не подключен в `tailwind.config.ts`.
- **Исправление:** Установить `@tailwindcss/typography` и добавить в массив `plugins` в `tailwind.config.ts`.

---

### [FE-019] Конфликт форматов дизайн-токенов: HSL в конфиге vs RGB в CSS
- **Файл и строки:** `app/globals.css:5-11`, `tailwind.config.ts:14-40`
- **Критичность:** 🟡 Medium
- **Симптомы:** Стандартные утилиты Tailwind `bg-primary`, `text-muted` генерируют некорректные цвета; разработчики вынуждены везде использовать жестко закодированные hex-значения `#212A31`.
- **Причина:** `tailwind.config.ts` ожидает формат HSL: `hsl(var(--primary))`, а в `globals.css` прописаны каналы RGB: `--primary: 33 42 49;`.
- **Исправление:** Задать в `globals.css` корректные значения в градусах и процентах HSL:
```css
:root {
  --primary: 206 20% 16%;       /* #212A31 */
  --secondary: 210 19% 22%;     /* #2E3944 */
  --accent: 197 70% 24%;        /* #124E66 */
  --muted: 190 12% 43%;         /* #748D92 */
  --background: 132 8% 84%;     /* #D3D9D4 */
  --foreground: 206 20% 16%;
}
```

---

## 6. Глубокий разбор: Конфигурация, Типизация и Инструменты тестирования (Deep-Dive Section 4)

### [TOOL-001] Невозможное пересечение типов в `ConfigValue`
- **Файл и строки:** `lib/store.ts:20`
- **Критичность:** 🟠 High
- **Описание:** `export type ConfigValue = string & SocialMedia;`.
  Тип `string` (примитив) пересекается с объектом `SocialMedia`. В системе типов TypeScript результатом пересечения несовместимых типов является `never`. Любая операция присвоения значения данному типу формально невалидна.
- **Исправление:** Заменить оператор пересечения `&` на объединение `|`:
```typescript
// lib/store.ts
export type ConfigValue = string | SocialMedia | Record<string, string>;
```

---

### [TOOL-002] Ошибка `truncateText`: возвращает `"undefined..."` для `null` / `undefined`
- **Файл и строки:** `lib/utils.ts:17-20`
- **Критичность:** 🟠 High
- **Описание:**
  ```typescript
  export function truncateText(text: string, maxLength: number): string {
    if (text?.length <= maxLength) return text;
    return text?.slice(0, maxLength) + "...";
  }
  ```
  Если передать `null` или `undefined`, выражение `text?.length <= maxLength` вернет `false`. Далее выполнится `text?.slice(...) + "..."`, что в JavaScript при конкатенации превращается в строку `"undefined..."`.
- **Исправление:**
```typescript
export function truncateText(text: string | null | undefined, maxLength: number): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, Math.max(0, maxLength)) + "...";
}
```

---

### [TOOL-003] Искажение слагов в `generateSlug` и рассинхронизация тестов
- **Файл и строки:** `lib/utils.ts:22-33`, `lib/utils.test.ts:31-41`
- **Критичность:** 🟡 Medium
- **Описание:**
  В `lib/utils.ts` функция `generateSlug` намеренно подставляет ведущие и хвостовые дефисы, если в строке были пробелы (`-hello-world-`). В юнит-тестах `lib/utils.test.ts` это ошибочное поведение зафиксировано как эталон:
  `expect(generateSlug(" hello world ")).toBe("-hello-world-")`.
  Кроме того, регулярное выражение `replace(/[^\w\s-]/g, "")` удаляет все символы Unicode (кириллицу, диакритику).
- **Исправление:**
```typescript
// lib/utils.ts
export function generateSlug(text: string): string {
  if (!text) return "";
  return text
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "") // Удаление диакритических знаков
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/[\s_-]+/g, "-")
    .replace(/^-+|-+$/g, ""); // Обрезка краевых дефисов
}
```

---

### [TOOL-004] Отсутствие алиаса `@/*` в `vitest.config.ts`
- **Файл и строки:** `vitest.config.ts:1-10`
- **Критичность:** 🟡 Medium
- **Описание:** В `tsconfig.json` объявлен путь `"@/*": ["./*"]`. Однако в `vitest.config.ts` плагин разрешения путей отсутствует. При добавлении тестов, импортирующих `@/lib/...` или `@/utils/...`, Vitest завершается ошибкой разрешения модулей: `Failed to resolve import "@/..."`.
- **Исправление:** Добавить секцию `resolve.alias` в конфигурацию Vitest:
```typescript
// vitest.config.ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    coverage: {
      provider: "v8",
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./"),
    },
  },
});
```

---

## 7. Приоритетный план исправления (Remediation Roadmap)

### Фаза 1: Экстренные исправления (P0 — Emergency Hotfixes)
*Срок реализации: 1–2 рабочих дня. Блокирует развертывание в Production.*

1. **Включение RLS в Supabase ([VULN-001]):**
   - Применить миграцию SQL с активацией RLS и ограничением прав на запись исключительно для `service_role`.
2. **Устранение Prototype Pollution и мутации синглтона ([VULN-002], [BE-003]):**
   - Переписать `mapDataToConfig` в `lib/config.ts` с глубоким клонированием и фильтром опасных ключей.
3. **Исправление скрейпера Redbubble ([BE-001], [BE-002]):**
   - Обновить regex извлечения ID в `extractExternalIdFromUrl`.
   - Внедрить дедупликацию записей перед операцией `upsert` в Supabase.
4. **Устранение критических UI-багов ([FE-001], [FE-003], [FE-006]):**
   - Заменить неработающий класс `h-[${designCardWidth}px]` на `aspect-[3/2]`.
   - Удалить `useState` и добавить `fill="currentColor"` в компонентах иконок.
   - Защитить функцию `formatDate` от падений на пустых датах.

---

### Фаза 2: Функциональность ядра и безопасность (P1 — Core Security & Backend)
*Срок реализации: 3–4 рабочих дня.*

1. **Безопасность API синхронизации ([VULN-003], [VULN-004], [VULN-005]):**
   - Строгая валидация хостов в `normalizeShopUrl`.
   - Переход на постоянное время сравнения секретов `crypto.timingSafeEqual`, запрет GET-запросов и добавление мьютекса.
2. **Надежность базы данных и пагинации ([BE-006], [BE-007], [BE-008], [BE-011]):**
   - Добавить принудительный `ORDER BY createdAt DESC` в пагинацию.
   - Реализовать ленивую инициализацию клиентов БД во избежание сбоев `next build`.
   - Кэшировать пул MySQL в `globalThis` и валидировать неотрицательный номер страницы.
3. **Корректность навигации и SEO ([FE-002], [FE-004], [FE-009], [FE-012]):**
   - Связать поисковую строку и фильтр коллекций через Next.js Router в `CatalogSearchBar`.
   - Возвращать 404 через `notFound()` на несуществующих карточках товаров.
   - Исправить свойство `changeFrequency` и добавить `/designs` в `sitemap.ts`.

---

### Фаза 3: UX, Производительность и Качество кода (P2 — Polish & Optimization)
*Срок реализации: 2–3 рабочих дня.*

1. **Оптимизация производительности (LCP & Memory) ([FE-011], [FE-014]):**
   - Запрашивать только 3 случайные записи на главной странице вместо 1000.
   - Добавить `priority` для первого баннера в `Carousel.tsx`.
2. **Дизайн-система и верстка ([FE-018], [FE-019], [FE-020]):**
   - Синхронизировать значения HSL между `globals.css` и `tailwind.config.ts`.
   - Установить `@tailwindcss/typography` и исправить невалидный класс `justify-left`.
3. **Инструментарий и типизация ([TOOL-001], [TOOL-002], [TOOL-003], [TOOL-004]):**
   - Исправить тип `ConfigValue` на `union`.
   - Добавить алиас путей `@/*` в `vitest.config.ts` и скорректировать юнит-тесты слагов.

---

## 8. Чек-лист верификации и план тестирования (Verification Checklist)

Для контроля качества после внесения изменений команда тестирования должна выполнить следующие сценарии:

- [ ] **Безопасность БД:** Попытка анонимного удаления строки из `designs` через cURL с публичным ключом завершается ошибкой `401 Unauthorized / 403 Forbidden`.
- [ ] **Защита от Prototype Pollution:** Передача в функцию `mapDataToConfig` объекта с ключом `__proto__.isAdmin` не приводит к появлению свойства `isAdmin` на пустом объекте `{}`.
- [ ] **Скрейпинг Redbubble:** Запуск `npm run sync:redbubble` на тестовом магазине корректно извлекает числовой `externalId` для товаров вида `/i/t-shirt/.../12345678.1YY3` и успешно сохраняет их в БД без сбоев уникальности.
- [ ] **Утечки процессов:** Запуск 5 параллельных процессов синхронизации не оставляет зомби-процессов Chromium в диспетчере задач ОС.
- [ ] **UI и Рендеринг:** Карточки каталога корректно сохраняют пропорции на экранах смартфонов и десктопов без динамических классов Tailwind.
- [ ] **Поиск и фильтры:** Ввод поисковой строки при выбранной коллекции выполняет SPA-переход на `/designs?search=...&collection=...` без перезагрузки страницы.
- [ ] **SEO и Карта сайта:** Запрос `/sitemap.xml` возвращает валидный XML, содержащий путь `/designs` и корректные теги `<changefreq>`.
- [ ] **Статус 404:** Переход по адресу `/designs/00000000-0000-0000-0000-000000000000` возвращает HTTP статус 404 с рендерингом страницы `not-found.tsx`.
- [ ] **Юнит-тестирование:** Команда `npm run test` успешно отрабатывает без ошибок разрешения путей `@/*` и проходит все тесты в `lib/utils.test.ts`.

---
*Отчет подготовлен ведущим техническим писателем и специалистом по QA-синтезу на основе верифицированных данных аудита.*
