import { requireSession } from '@/lib/auth'
import { logout } from './actions'

export default async function AppPage() {
  await requireSession() // defense-in-depth: proxy + in-app guard

  return (
    <main className="flex min-h-svh items-center justify-center bg-neutral-50 px-6">
      <div className="w-full max-w-md rounded-2xl bg-white p-10 text-center shadow-sm ring-1 ring-neutral-200">
        <h1 className="text-2xl font-semibold tracking-tight text-neutral-900">
          Учёт техники
        </h1>
        <p className="mt-2 text-sm text-neutral-500">
          Экраны появятся в фазах 2–6
        </p>
        <form action={logout} className="mt-8">
          <button
            type="submit"
            className="rounded-lg bg-neutral-900 px-5 py-2.5 text-sm font-medium text-white transition hover:bg-neutral-700"
          >
            Выйти
          </button>
        </form>
      </div>
    </main>
  )
}
