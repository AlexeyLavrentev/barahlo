# API Coverage — Phase 1: Foundation

No external API integration: фаза строит локальный каркас (Next.js 16 routes, Server Actions, локальный SQLite через better-sqlite3, локальные CLI-скрипты) — ни один внешний API/SDK/сервис не интегрируется; `app/api/health/route.ts` — внутренний route handler приложения, а не интеграция с внешним API.
