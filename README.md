# flowertalker

Небольшой scrapbook/digital-garden сайт со серверной модерацией гостевых стикеров.

## Локальный запуск

Требуется Node.js 20+.

```powershell
Copy-Item .env.example .env
# замените ADMIN_PASSWORD в .env на длинный случайный секрет
node --env-file=.env server.mjs
```

Или:

```powershell
$env:ADMIN_PASSWORD = "your-local-secret"
npm start
```

Тесты:

```powershell
npm test
```

## Деплой в Railway

1. Создайте проект Railway и подключите GitHub-репозиторий.
2. Railway автоматически использует `railway.toml` и команду `npm start`.
3. В **Variables** добавьте `ADMIN_PASSWORD` — длинный уникальный секрет. Не добавляйте его в Git.
4. Добавьте **Volume**, смонтированный в `/app/data`. Файл `data/stickers.json` создаётся сервером автоматически.
5. После деплоя откройте выданный Railway-домен и проверьте `/`.
6. Для модерации используйте раскрывающуюся панель владельца на странице. Пароль хранится только в памяти браузера.

`PORT` Railway задаёт автоматически; вручную его указывать не нужно. Один Volume должен обслуживаться одним экземпляром приложения: JSON-хранилище сериализует записи только внутри одного процесса.

## API

- `GET /api/stickers` — только одобренные стикеры.
- `POST /api/stickers` — отправка `{ "text": "..." }` на модерацию.
- `GET /api/admin/stickers` — очередь, требует `Authorization: Bearer <ADMIN_PASSWORD>`.
- `POST /api/admin/stickers/:id/approve` — одобрить.
- `POST /api/admin/stickers/:id/reject` — отклонить.

Не логируйте заголовок `Authorization` и не передавайте пароль в URL.
