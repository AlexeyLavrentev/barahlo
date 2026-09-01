import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: 'Страница не найдена',
}

// Root 404 boundary (UI-01: интерфейс полностью на русском). Renders for
// notFound() in any segment (e.g. /employees/abc) and for unmatched URLs.
// Mirrors the login screen's quiet centered card on the design tokens; the
// back link copies the card page's «← Сотрудники» style — secondary ink, NOT
// the accent (UI-SPEC reserves #0071E3 for CTA, focus rings, combobox).
export default function NotFound() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-page px-6">
      <div className="rounded-2xl bg-white p-8 shadow-sm ring-1 ring-hairline">
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          Страница не найдена
        </h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Проверьте адрес или вернитесь к списку.
        </p>
        <div className="mt-6">
          <Link
            href="/employees"
            className="text-sm text-ink-secondary transition-colors hover:text-ink"
          >
            ← Сотрудники
          </Link>
        </div>
      </div>
    </main>
  )
}
