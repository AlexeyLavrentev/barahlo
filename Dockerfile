# ============================================
# Stage 1: Dependencies Installation Stage
# ============================================

# IMPORTANT: Node.js Version Maintenance
# This Dockerfile uses Node.js 24.13.0-slim, which was the latest LTS version at the time of writing.
# To ensure security and compatibility, regularly update the NODE_VERSION ARG to the latest LTS version.
# Один ARG на все три стадии: одинаковый Node-мажор везде, иначе рвётся NODE_MODULE_VERSION
# у нативного модуля better-sqlite3. Никакого Alpine — musl ломает better-sqlite3.
ARG NODE_VERSION=24.13.0-slim

FROM node:${NODE_VERSION} AS dependencies

# Set working directory
WORKDIR /app

# Расширение 1 (сборка нативного модуля): python3/make/g++ ДО npm ci — страховка,
# если prebuilt-бинарник better-sqlite3 недоступен в корпоративной сети; на
# закэшированных слоях почти бесплатно.
RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ \
 && rm -rf /var/lib/apt/lists/*

# Copy package-related files first to leverage Docker's caching mechanism
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* .npmrc* ./

# Install project dependencies with frozen lockfile for reproducible builds
RUN --mount=type=cache,target=/root/.npm \
    --mount=type=cache,target=/usr/local/share/.cache/yarn \
    --mount=type=cache,target=/root/.local/share/pnpm/store \
  if [ -f package-lock.json ]; then \
    npm ci --no-audit --no-fund; \
  elif [ -f yarn.lock ]; then \
    corepack enable yarn && yarn install --frozen-lockfile --production=false; \
  elif [ -f pnpm-lock.yaml ]; then \
    corepack enable pnpm && pnpm install --frozen-lockfile; \
  else \
    echo "No lockfile found." && exit 1; \
  fi

# Сборка sharp из исходников: пребилды sharp >= 0.33 требуют CPU x86-64-v2 (SSE4.2/POPCNT),
# wasm-фолбэк — WASM SIMD; на сервере без v2 оба пути отпадают (wasm падает с codeless-ошибкой,
# которая маскируется в TypeError 'endsWith' — см. sharp/dist/sharp.mjs:115). Собранный биндинг
# ложится в src/build/Release/, откуда лоадер грузит его в первую очередь. На v2-CPU тоже
# корректно — просто медленнее (слой кэшируется по lockfile). python3/make/g++ стоят выше.
RUN --mount=type=cache,target=/root/.npm \
    npm install --no-save --no-audit --no-fund node-addon-api node-gyp @img/sharp-libvips-dev \
 && export PATH=/app/node_modules/.bin:$PATH \
 && cd node_modules/sharp && node install/build.js && cd /app

# ============================================
# Stage 2: Build Next.js application in standalone mode
# ============================================

FROM node:${NODE_VERSION} AS builder

# Set working directory
WORKDIR /app

# Copy project dependencies from dependencies stage
COPY --from=dependencies /app/node_modules ./node_modules

# Copy application source code
COPY . .

ENV NODE_ENV=production

# Next.js collects completely anonymous telemetry data about general usage.
# Learn more here: https://nextjs.org/telemetry
# Uncomment the following line in case you want to disable telemetry during the build.
# ENV NEXT_TELEMETRY_DISABLED=1

# Build Next.js application
RUN npm run build

# ============================================
# Stage 3: Run Next.js application
# ============================================

FROM node:${NODE_VERSION} AS runner

# Set working directory
WORKDIR /app

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# Copy production assets
COPY --from=builder --chown=node:node /app/public ./public

# Set the correct permission for prerender cache
RUN mkdir .next
RUN chown node:node .next

# Automatically leverage output traces to reduce image size
# https://nextjs.org/docs/advanced-features/output-file-tracing
COPY --from=builder --chown=node:node /app/.next/standalone ./
COPY --from=builder --chown=node:node /app/.next/static ./.next/static

# Расширение 2 (нативный модуль): standalone-трейсинг может терять биндинг
# better_sqlite3.node — копируем пакет целиком из builder поверх standalone-копии.
COPY --from=builder --chown=node:node /app/node_modules/better-sqlite3 ./node_modules/better-sqlite3
# bcryptjs — для create-admin.mjs внутри контейнера (собственных зависимостей нет).
COPY --from=builder --chown=node:node /app/node_modules/bcryptjs ./node_modules/bcryptjs
# sharp: сборный биндинг (src/build/*.node) и @img/* (runtime-libvips) не попадают в
# standalone-трейсинг — require там динамические (шаблонные строки в лоадере sharp).
COPY --from=builder --chown=node:node /app/node_modules/sharp ./node_modules/sharp
COPY --from=builder --chown=node:node /app/node_modules/@img ./node_modules/@img

# Расширение 3 (права тома, Pitfall 4): каталог состояния должен существовать
# и быть доступен пользователю node (uid 1000), иначе SQLITE_CANTOPEN.
RUN mkdir -p /app/data && chown node:node /app/data

# Расширение 4 (CLI внутри контейнера): standalone-трейсинг scripts/ не включает,
# а cron-строка из deploy.sh выполняет `node scripts/backup.mjs` в контейнере.
COPY --chown=node:node scripts ./scripts

# Switch to non-root user for security best practices (uid 1000 — совпадает
# с chown -R 1000:1000 data на сервере, см. README «Деплой на сервер»)
USER node

# Expose port 3000 to allow HTTP traffic
EXPOSE 3000

# Start Next.js standalone server
CMD ["node", "server.js"]
