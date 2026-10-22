# Предварительная сборка Pinterest-картинок

Генератор находится в **pod-uploader**, пакет `@pod/pinterest-renderer`.
Design Studio получает его как локальный архив `vendor/pod-pinterest-renderer-1.0.0.tgz`.
Сайт не получает R2 SDK или ключи записи в облако.

## Постоянное назначение

`designs.pinterestImage` — nullable JSONB/Postgres или JSON/MySQL:

- `assignment`: `schemaVersion`, `rendererVersion`, `designId`, `templateId`,
  `paletteId`, конкретная `palette`, `title`, `brand`, `typography`, `sources`, `hash`.
- `asset`: `null` либо `{key, sha256, width:1000, height:1500, bytes}`.

Название, переносы, размер и семейство шрифта, цвета, источники и обрезка
замораживаются при первом назначении. Никакие последующие изменения каталога
не пересоздают картинку. Выбор — независимо хешируемые UUID + template-v1 и
UUID + palette-v1, только среди шаблонов с доступными товарами.

Хеш считается по JSON с рекурсивно отсортированными ключами. Он не зависит от
порядка ключей JSONB. Изменение `updatedAt` не меняет URL назначенной картинки.
`cdnImage` сохраняет прежний смысл: массив товарных мокапов, без Pinterest JPEG.

## Авторизованный API

`GET/PUT /api/v1/designs/pinterest-image`, `Authorization: Bearer LISTINGS_API_TOKEN`.
Ответы не кешируются. Ни один метод не создаёт новый принт.

GET без идентификатора: `?page=1&limit=50` (limit 1–100), ответ `{items,total}`.
Каждый item — `{designId,sha256,sourceImageId,redbubbleId,active,title,brand,sources,pinterestImage}`.
`sources` содержит доступные `tee`, `hat`, `mug`, `mousepad` из исходных Redbubble props.
GET одного принта: `?id=<UUID>`, `?sha256=<hex>`, `?sourceImageId=<integer>` или
`?redbubbleId=<digits>`. Несколько согласованных идентификаторов допустимы,
противоречащие дают 409; смешивать поиск с пагинацией нельзя. Неактивные исключены.

PUT первого назначения:
`{designId, operation:"assign", assignment}`.
Запись атомарная: первая выигрывает, повтор идентичного значения — `unchanged`,
другое назначение — 409 `conflict` с уже сохранённым `pinterestImage`.

PUT готового файла:
`{designId, operation:"ready", assignmentHash, asset}`.
Принимает файл только для сохранённого назначения, никогда не заменяет другой
уже зарегистрированный файл. Статусы: `created`, `unchanged`, `ready`,
`conflict`, `not_found`; ответ `{status,pinterestImage}`.

Доступ к PostgreSQL-функции `set_design_pinterest_image` только у service_role;
MySQL использует транзакцию с блокировкой строки. Обе реализации не меняют
`updatedAt`, товарные props, active и остальные метаданные.

## Выдача и отказ облака

RSS сохраняет прежние GUID и ровно один media:content на принт.
URL остаётся на домене витрины: `/p/<slug>/pin.jpg?v=<assignment.hash>`.
Маршрут возвращает JPEG, не редирект на сторонний домен.

При наличии asset проверяет готовый JPEG в `NEXT_PUBLIC_IMAGES_CDN`: таймаут
3 секунды, размер ≤1 MiB, SHA-256, формат и размеры. При ошибке использует
тот же сохранённый генератор и исходные Redbubble URL, ограничивая каждый
ответ 12 MiB и 10 секундами. Редиректы запрещены. Контрольные суммы исходников
обязательны: изменившийся товар не подставляется молча.

Резервный ответ кешируется 60 секунд, облачный — по существующей политике
pin-маршрута. Если исходники также недоступны или изменились — 503/no-store.
Для принтов без назначения работает прежний генератор. Неактивные дают 404.

XML самих RSS-лент сохраняет существующий часовой CDN-кеш. После первоначальной
подготовки новые хеши изображений появятся в уже закешированных лентах при
следующем обновлении XML. Сами картинки с новым хешем доступны сразу.

## Включение

1. Применить миграцию 009 через существующий `npm run db:migrate`.
2. Развернуть сайт с установленным архивом генератора. Next tracing включает
   WOFF и лицензии в серверный пакет.
3. В аплоудере сначала `pod pinterest preview` и `pod pinterest publish --dry-run`.
4. Добавить в config.yaml аплоудера `pinterest: { enabled: true }` и использовать
   существующие `designStudio.url`, `LISTINGS_API_TOKEN`, `cdn.url` и R2-секреты.
5. Выполнить `pod pinterest publish --limit 5`, проверить JPEG и сохранённые
   назначения; затем `pod pinterest publish` для остальных активных принтов.

Сам факт наличия кода ничего не публикует. Отключение `pinterest.enabled`
останавливает подготовку; сохранённые назначения и выдача продолжают работать.
Безопасный откат кода не требует удаления колонки или облачных файлов.

## Локальная проверка без производственной БД

```powershell
docker compose -p pinterest-images-test -f compose.pinterest-test.yml up -d --wait
$env:PINTEREST_TEST_DATABASES='1'
npx vitest run utils/pinterest-image-database.integration.test.ts
```

Тест использует только фиксированные локальные порты 35439/35440 и
одноразовые БД `pinterest_test`. Он пересоздаёт их содержимое.
На стороне аплоудера `PINTEREST_TEST_S3=1` включает проверку публикации через
MinIO на порту 35441, включая восстановление после сбоя финальной API-записи.
Остановка: `docker compose -p pinterest-images-test -f compose.pinterest-test.yml down -v`.
