# Фронтенд, Пользовательский интерфейс и Дизайн-система

## 1. Иерархия страниц и карта маршрутов

Фронтенд приложения реализован на базе **Next.js 16 App Router** и **React 19**. Все страницы по умолчанию являются серверными компонентами (RSC), что обеспечивает минимальный размер JavaScript-бандла, быструю начальную загрузку (FCP) и идеальную индексацию поисковыми роботами.

### 1.1 Карта маршрутизации
```
app/
├── layout.tsx                     # Корневой макет (Header, Footer, CookieBanner, Context)
├── page.tsx                       # "/" Главная страница (Hero, Carousel, Каталог-превью)
├── sitemap.ts                     # "/sitemap.xml" Динамическая карта сайта
├── designs/
│   ├── page.tsx                   # "/designs" Полнофункциональный каталог с поиском и фильтрацией
│   └── [id]/
│       └── page.tsx               # "/designs/[id]" Детальная страница отдельного дизайна
├── about/
│   └── page.tsx                   # "/about" О студии и творческом процессе
├── services/
│   └── page.tsx                   # "/services" Услуги кастомного дизайна и принтинга
├── contact/
│   └── page.tsx                   # "/contact" Контактная информация и форма связи
├── privacy-policy/
│   └── page.tsx                   # "/privacy-policy" Политика конфиденциальности и использование cookies
└── terms-of-service/
    └── page.tsx                   # "/terms-of-service" Пользовательское соглашение
```

---

## 2. Разбор ключевых UI-компонентов

Все визуальные компоненты изолированы в каталоге `app/components/` и построены по принципам модульности и композиции.

```mermaid
graph TD
    RootLayout["RootLayout (app/layout.tsx)"] --> ContextWrap["ContextWrapper (app/wrapper.tsx)"]
    ContextWrap --> HeaderComp["Header.tsx"]
    ContextWrap --> MainArea["<main> (Active Route)"]
    ContextWrap --> FooterComp["Footer.tsx"]
    ContextWrap --> CookieComp["CookieBanner.tsx"]

    MainArea -->|Route: /designs| CatalogPage["app/designs/page.tsx"]
    CatalogPage --> SearchBar["CatalogSearchBar.tsx"]
    CatalogPage --> DesignGrid["Grid of DesignCard.tsx"]

    MainArea -->|Route: /designs/[id]| DetailsPage["app/designs/[id]/page.tsx"]
    DetailsPage --> ShareBox["ShareLinks.tsx"]
    DetailsPage --> ShopBox["ShopLinks.tsx"]
    DetailsPage --> RelatedGrid["FeaturedDesigns.tsx"]
```

### 2.1 `DesignCard` (`app/components/DesignCard.tsx`)
Базовый строительный блок витрины:
- **Назначение**: Презентация карточки товара в сетке каталога.
- **Особенности**:
  - Использование оптимизированного компонента `next/image` с автоматическим расчетом aspect ratio и плейсхолдером.
  - Hover-эффект с анимацией масштабирования изображения (`group-hover:scale-105 transition-transform`).
  - Отображение бейджа коллекции и кнопки перехода к деталям.

### 2.2 `CatalogSearchBar` (`app/components/CatalogSearchBar.tsx`)
Клиентский интерактивный компонент управления каталогом:
- **Назначение**: Фильтрация товаров по поисковой фразе и выпадающему списку коллекций.
- **Особенности**:
  - Поддерживает локальное состояние инпутов (`searchQuery`, `selectedCollection`).
  - При отправке формы или изменении селектора коллекции программно обновляет URL через `router.push('/designs?page=1&search=...&collection=...')`, сбрасывая пагинацию на первую страницу.

### 2.3 `Carousel` (`app/components/Carousel.tsx`)
Слайдер для главной страницы на базе `react-slick`:
- **Назначение**: Демонстрация ключевых работ и баннеров в Hero-секции.
- **Особенности**:
  - Кастомизированные стрелки навигации и индикаторы-точки в фирменных цветах палитры.
  - Адаптивные брейкпоинты (1 слайд на смартфонах, до 3 слайдов на десктопах).
  - Стилизация через оверрайды в `app/globals.css`.

### 2.4 `FeaturedDesigns` (`app/components/FeaturedDesigns.tsx`)
Карусель или сетка рекомендуемых товаров:
- **Назначение**: Вывод блока *"More from this collection"* на странице дизайна и блока *"Featured Works"* на главной.
- **Особенности**: Принимает массив `designs: Design[]` и заголовок секции, плавно скрывается при пустом списке.

### 2.5 `CookieBanner` (`app/components/CookieBanner.tsx`)
Баннер информирования об использовании файлов cookie в строгом соответствии с GDPR:
- **Паттерн `useSyncExternalStore`**:
  Решает классическую проблему Next.js с расхождением гидратации (когда сервер не знает состояние `localStorage` клиента).
  ```typescript
  function subscribe(onStoreChange: () => void) {
    window.addEventListener("storage", onStoreChange);
    return () => window.removeEventListener("storage", onStoreChange);
  }

  function getSnapshot() {
    return localStorage.getItem("cookiesAccepted") === "true";
  }

  function getServerSnapshot() {
    return true; // На сервере баннер не рендерится
  }
  ```
- При нажатии кнопки «Accept» состояние сохраняется в `localStorage`, генерируется событие `storage`, и баннер мгновенно исчезает без перезагрузки страницы.

### 2.6 `ShopLinks` и `ShareLinks` (`app/components/{ShopLinks,ShareLinks}.tsx`)
Интеграционные блоки внешних сервисов:
- `ShopLinks`: ссылки с брендовыми SVG-иконками на сторонние витрины автора (Redbubble, TeePublic, Tostadora).
- `ShareLinks`: готовые кнопки для шеринга страницы дизайна в Pinterest, X (Twitter), Facebook, LinkedIn, Telegram и WhatsApp с предзаполненным текстом и ссылкой на изображение.

---

## 3. SEO-оптимизация и метаданные

Проект спроектирован с упором на максимальную поисковую видимость в нише графического дизайна и одежды.

### 3.1 Динамическая генерация метаданных (`generateMetadata`)
Каждая страница формирует уникальные метатеги на сервере на основе данных из базы:

#### Страница каталога (`app/designs/page.tsx`):
```typescript
export async function generateMetadata(): Promise<Metadata> {
  const config: SiteConfig = await getSiteConfig();
  const { designs, total } = await fetchDesigns(1, "", "", ITEMS_PER_PAGE);
  const collections = await fetchCollections();

  return {
    title: `Our Designs - ${config.name}`,
    description: `Explore our unique collection of ${total} print designs across ${collections.length} collections.`,
    keywords: `print designs, textile art, innovative designs, ${config.name} collection, ${collections.join(", ")}`,
    openGraph: {
      url: `https://${config.domain}/designs`,
      type: "website",
      title: `Our Designs - ${config.name}`,
      images: designs.slice(0, 4).map((design) => design.externalImageUrl),
    },
  };
}
```

#### Страница отдельного товара (`app/designs/[id]/page.tsx`):
- Генерирует точный `title`, включающий имя работы и название бренда.
- Генерирует `description` с обрезкой текста до 180 символов (`truncateText`).
- Внедряет превью-изображение дизайна в тег `og:image`.

### 3.2 Динамическая карта сайта (`app/sitemap.ts`)
Файл `app/sitemap.ts` компилируется в стандартный XML-формат Sitemap:
- Включает все статические маршруты (`/`, `/about`, `/contact`, `/terms-of-service`, `/privacy-policy`) с приоритетами и частотой обновления `monthly`.
- Выполняет серверный запрос `fetchDesigns(1, "", "", 1000)` и автоматически добавляет до 1000 персональных URL дизайнов с реальной датой последней модификации `lastModified`.

### 3.3 Верификация доменов и аналитика
В `app/layout.tsx` автоматически внедряются:
- Мета-тег верификации Pinterest (`p:domain_verify`), если он задан в конфиге.
- Компонент Google Analytics `@next/third-parties/google` с отложенной загрузкой для минимизации влияния на Core Web Vitals (LCP, INP, CLS).

---

## 4. Дизайн-система и стилизация

Визуальный стиль проекта базируется на концепции сдержанной элегантности с акцентом на контент (графические принты).

### 4.1 Фирменная палитра цветов
В `app/globals.css` определены CSS-переменные в формате HSL/RGB, сопоставленные с палитрой Tailwind:

```css
:root {
  --primary: 33 42 49;     /* #212A31 — Глубокий темный графит (заголовки, текст) */
  --secondary: 46 57 68;   /* #2E3944 — Холодный сланец (футер, ховеры кнопок) */
  --accent: 18 78 102;     /* #124E66 — Глубокий морской синий (кнопки, ссылки, акценты) */
  --muted: 116 141 146;    /* #748D92 — Пепельно-серый (второстепенный текст, рамки) */
  --background: 211 217 212; /* #D3D9D4 — Мягкий светлый туман (фон приложения) */
}
```

### 4.2 Конфигурация Tailwind CSS (`tailwind.config.ts`)
- Интегрирован плагин `tailwindcss-animate` для плавных переходов модальных окон и карточек.
- Поддерживается система скруглений:
  - `rounded-lg`: `var(--radius)`
  - `rounded-md`: `calc(var(--radius) - 2px)`
  - `rounded-sm`: `calc(var(--radius) - 4px)`

### 4.3 Типографика
В качестве основного шрифта используется **Inter** (`next/font/google`), оптимизированный для экранного чтения, автоматически подгружаемый и встраиваемый сервером Next.js без блокировки рендеринга внешними запросами к Google Fonts.
