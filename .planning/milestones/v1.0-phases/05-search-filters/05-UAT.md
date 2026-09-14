---
status: complete
phase: 5-search-filters
source: [05-VERIFICATION.md]
started: 2026-09-04T20:45:00Z
updated: 2026-09-14T05:30:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Live-search feel
expected: Open /devices on a seeded dev DB, type a serial fragment from the first character (no Enter), retype mid-debounce, press Enter once — results update live ~300 ms after typing stops, no skeleton flash per keystroke, focus/value kept, Enter commits immediately.
result: pass
reported: "поле поиска в целом работает если вводить и удалять символы по одному с паузами. Если вводить символы или удалять их быстро то поле ведет себя странно, и либо не прописывает то что я пишу, либо не удаляет"
severity: major (закрыто)
retest: "2026-09-14 orchestrator live-verified on :3001 (fixed build 74eb0d9) via Playwright: быстрый набор 14 символов покейстроково — input=URL; 2 символа набраны В ПОЛЁТЕ эха — выжили; бёрст Backspace x3 в полёте — выжили, input=URL='lenovo thinkpa'; прямая навигация по URL адоптится в инпут; гомоглифы live: 'SN-НZHB06' (кир. Н) → 1 находка, 'а5' (кир. А) → 1 находка, 'aspire' → 35, пустой результат даёт «Найдено: 0 устройств» + D-04-состояние. Репорт юзера объяснён стейлом окружения: temp-БД :3001 была сожрана /tmp-чисткой за 9 дней (логин отдавал 500 — дойти до поиска было невозможно), а Docker-контейнер :3000 собран до фикса 74eb0d9. Ретест поймал G-5-2 (пробел), зафиксен 42ebf57."
confirmed: "pass — владелец подтвердил 2026-09-14 после фиксов G-5-1 (74eb0d9) и G-5-2 (42ebf57)"

### 2. Search-box reconciliation (CR-01)
expected: With a q active click «Сбросить фильтры», then use browser Back and Forward; also push a query with trailing spaces and let the server trim it. The input adopts the URL's q after reset/Back/Forward (empties on reset, restores on Back) and no re-push navigation loop starts.
result: pass

### 3. One-bar FilterBar on a narrow viewport
expected: Narrow the window under ~768 px; set a department with a very long name; type a 100-character query. The bar wraps to a second line without overflow, the long department name truncates with ellipsis in its sm:w-40 trigger, the long query renders in the flex-1 field without breaking the bar.
result: pass

### 4. Warranty colors on real data
expected: Open /devices, a device card with each warranty state, and an employee card with issued devices. Row line 2 « · гар. до dd.mm.yyyy» green (#248A3D) beyond 60 days / orange (#FF9500) in the inclusive window / red (#D70015) expired; card «Гарантия до» value colored, label untouched; «без гарантии» — no segment in lists, plain «—» on the card; text color only.
result: pass

### 5. CSV open test
expected: Download via «Скачать CSV» on a filtered view and open once in RU Excel or Numbers — Cyrillic intact (no mojibake), one column per field («;»), dates dd.mm.yyyy, a model starting with «=» opens as text (no formula execution).
result: pass

### 6. Reseed dev DB + felt UI-03 at scale
expected: ВНИМАНИЕ: `./data/app.db` — живая база твоего Docker-деплоя (реальные сотрудники/устройства UAT фаз 2–4, прод-пароль админа). НЕ делать `rm` вслепую. Безопасные варианты: (а) изолированный тест на отдельном порту: `DATABASE_PATH=/tmp/uat5-data/app.db npx drizzle-kit migrate && DATABASE_PATH=/tmp/uat5-data/app.db node scripts/seed.mjs` + `DATABASE_PATH=/tmp/uat5-data/app.db npx next start -p 3001` — 400 устройств (200/80/50/70), все 4 состояния гарантии, поиск/фильтры/пагинация «мгновенно» наощупь; или (б) если хочется на своей живой базе — ночной бэкап уже есть (cron), но решение и риск твои. Автоматический perf-гейт уже зелёный (0.76 мс @ 600 строк), этот пункт — про «мгновенно» наощупь.
result: pass

## Summary

total: 6
passed: 6
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

- gap_id: G-5-1
  truth: "Быстрый ввод/удаление символов в поиске не теряет keystrokes: инпут не откатывается к старому q из серверного эха, пока летит навигация"
  status: resolved
  resolved_by: "05-06-PLAN (74eb0d9) + G-5-2 inline fix (42ebf57)"
  resolved_at: 2026-09-14
  severity: major
  test: 1
  root_cause: "lastSynced.current = value пишется при взводе дебаунса (search-box.tsx:57), а не при получении эха; в окне взвод→эхо любое нажатие удовлетворяет q !== lastSynced и ветка адаптации (47–51) затирает более новый ввод setValue(q) и делает return без перевзвода (66–73). Регрессия от CR-01-фикса be80413."
  artifacts:
    - path: "app/(app)/devices/search-box.tsx"
      issue: "adoption-ветка не различает внешнюю навигацию и эхо собственного push; lastSynced пишется на 300мс раньше эха"
  missing:
    - "Адаптировать q только когда value === lastSynced.current && q !== lastSynced.current (локальный приоритет)"
    - "Иначе перевзводить debounce, чтобы более новый текст ушёл пушем"
    - "commitNow (Enter) аналогично: эхо не должно откатывать ввод, сделанный в полёте"
  debug_session: .planning/debug/search-input-keystroke-loss.md
  fixed_by: "05-06 (74eb0d9) — live-verified Playwright 2026-09-14; см. retest в Tests"
- gap_id: G-5-2
  truth: "Пробел в поисковом запросе не исчезает: «aspire 5» набирается с паузами, пробел не съедается эхом"
  status: resolved
  resolved_by: "inline orchestrator fix (42ebf57)"
  resolved_at: 2026-09-14
  reason: "User reported (2026-09-14, ретест G-5-1 на :3001): да, тут уже лучше, но в поиске нельзя поставить пробел если искать по имени например \"aspire 5\" то пробел удаляется сразу"
  severity: major
  test: 1
  root_cause: "Trim-эхо переписывало инпут: push «aspire » → сервер триммит до «aspire» → absorption-ветка делала if (value === pushed) setValue(q) — пробел, набранный на паузе между словами, съедался через ~300 мс собственным эхом. Перепись была механизмом защиты от пуш-лупа (search-box.tsx:69)."
  artifacts:
    - path: "app/(app)/devices/search-box.tsx"
      issue: "absorption переписывал инпут на триммированное эхо; adoption-гвард был strict-equal и блокировал сброс при хвостовом пробеле"
  missing:
    - "Не переписывать инпут на триммированное эхо; whitespace-only расхождение после своего эха не перевзводит пуш (иначе цикл запросов)"
    - "«Чистота» инпута для адаптации = совпадение по trim (хвостовой пробел — не несённый контент, сброс обязан очищать)"
  debug_session: .planning/debug/search-input-keystroke-loss.md (диагноз продолжен оркестратором inline — трассировка та же ветка)
  fixed_by: "inline-fix оркестратора (мид-UAT интерактив, точечный 10-строчный дифф): live-verified Playwright 2026-09-14 — «aspire » пробел выжил, «aspire 5» end-to-end (35 находок), сброс с хвостовым пробелом очистил инпут; 278/278 vitest, tsc clean"
