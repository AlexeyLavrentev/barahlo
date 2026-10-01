# Phase 15: Лайтбокс фото устройства - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-01
**Phase:** 15 — Лайтбокс фото устройства
**Mode:** `--auto` (fully autonomous — every choice is the recommended default, no user prompts)
**Areas discussed:** Навигация между фото, Зум-жесты (тонкая настройка), Композиция стейджа

---

## Навигация между фото

| Option | Description | Selected |
|--------|-------------|----------|
| Стрелки prev/next + клавиши ←/→ | in-lightbox переключение, сброс зума при переходе, инертные края (non-wrap) | ✓ |
| Без навигации | «переключение» = закрыть лайтбокс и открыть другой тумбнейл; SC 3 вырождается | |

**User's choice:** Auto-selected (recommended default) — `[auto] Навигация между фото — Q: «Как реализуется "переключение на другое фото" из SC 3?» → Selected: «Стрелки prev/next + клавиши ←/→» (recommended default)`
**Notes:** Модальный диалог блокирует грид тумбнейлов — без in-lightbox навигации «переключение» из SC 3 не существует; `lightboxIndex` уже в стейте, цена решения минимальна. D-01 CONTEXT.md.

---

## Зум-жесты (тонкая настройка)

| Option | Description | Selected |
|--------|-------------|----------|
| Одиночный клик инертен, даблклик к курсору | тоггл только двойным кликом (SC 2 «клик (двойной)»), цель = позиция курсора (паритет с колесом) | ✓ |
| Одиночный клик тоже тогглит | конфликтует с распознаванием drag-pan, случайные зумы при перетаскивании | |

**User's choice:** Auto-selected (recommended default) — `[auto] Зум-жесты — Q: «Одиночный клик и цель двойного клика?» → Selected: «Одиночный инертен, даблклик к курсору» (recommended default)`
**Notes:** Даблклик возвращает к 1x; полный список сбросов — D-02 CONTEXT.md. Множитель даблклика (~2.5x) — discretion.

---

## Композиция стейджа

| Option | Description | Selected |
|--------|-------------|----------|
| Кнопки поверх стейджа вне трансформации | «Удалить фото» и close всегда смонтированы при canMutate; drag не начинается на контролах | ✓ |
| Прятать контролы при зуме > 1 | риск потери кнопки удаления; против SC 4 «остаётся смонтированной» | |

**User's choice:** Auto-selected (recommended default) — `[auto] Композиция стейджа — Q: «Где "Удалить фото" и как убрать пустое мигание?» → Selected: «Кнопки поверх стейджа, fade-in по onLoad» (recommended default)`
**Notes:** SC 4 буквально требует смонтированную кнопку над трансформированным изображением; skeleton/fade — discretion. D-03 CONTEXT.md.

---

## Locked by roadmap (не обсуждались)

- Усиление Base UI Dialog в `photo-grid.tsx`, НЕ замена; ноль новых зависимостей (roadmap §Phase 15, D-04)
- Зум-жесты и диапазон [1,4], сброс, iOS pointercancel, ESC, скролл-лок — SC 1–3 дословно
- Delete-флоу, ⌘K-проба `data-slot="dialog-content"`, loading без мигания — SC 4 дословно
- Photo-пайплайн и роуты выдачи не трогаются — клиентский остров без write-path риска (roadmap v1.3)

## Claude's Discretion

Множитель даблклика, вид skeleton/fade, touch-action CSS, форма pointercancel-гвада, счётчик «N из M» в лайтбоксе, иконки lucide стрелок.

## Deferred Ideas

- Циклическая навигация (wrap) — вернуть по фидбеку UAT
- Повышение FULL_EDGE / ретранскод стока для резкого 4x — write-path, кандидат на v2
- Слайд-анимации перехода между фото — глянец вне требований
