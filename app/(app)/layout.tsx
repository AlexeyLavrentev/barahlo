import Link from 'next/link'
import { requireSession } from '@/lib/auth'
import { logout } from './actions'

// Shell of the protected zone (UI-SPEC «App shell», D-06): sticky 48px bar
// in translucent material (apple-design §12), content column beneath it.
// Inherited as-is by phases 3–6 screens.
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  await requireSession() // defense-in-depth: proxy + in-app guard

  return (
    <div className="min-h-svh">
      <header className="app-bar sticky top-0 z-40 h-12 border-b border-black/5 bg-white/70 backdrop-blur-md">
        <div className="flex h-full items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-4">
            <span className="text-sm font-semibold text-ink">Учёт техники</span>
            <Link
              href="/employees"
              className="text-sm text-ink-secondary transition-colors hover:text-ink"
            >
              Сотрудники
            </Link>
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="text-sm text-ink-secondary transition duration-100 ease-out hover:text-ink active:scale-[0.97]"
            >
              Выйти
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-8 md:px-6">{children}</main>
    </div>
  )
}
