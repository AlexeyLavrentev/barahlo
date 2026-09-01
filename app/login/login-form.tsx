'use client'

import { useActionState } from 'react'
import { login } from './actions'

// Normalized to the UI-SPEC contract (02-03) without touching copy:
// weights 400/600 only (labels 14/400, button text 14/600), spacing on the
// 4px scale (no half-steps), inputs at 16px body size, accent focus ring and
// accent primary button with press feedback. Error strings unchanged.
export function LoginForm() {
  const [state, formAction, pending] = useActionState(login, {})

  return (
    <form action={formAction} className="mt-6 space-y-4">
      <div>
        <label htmlFor="login" className="block text-sm text-ink-secondary">
          Логин
        </label>
        <input
          id="login"
          name="login"
          type="text"
          autoComplete="username"
          required
          className="mt-2 block w-full rounded-lg border border-hairline bg-white px-3 py-2 text-base text-ink placeholder:text-ink-secondary outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </div>
      <div>
        <label htmlFor="password" className="block text-sm text-ink-secondary">
          Пароль
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="mt-2 block w-full rounded-lg border border-hairline bg-white px-3 py-2 text-base text-ink placeholder:text-ink-secondary outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
      </div>

      {state.error ? (
        <p className="text-sm text-[#D70015]" role="alert">
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-accent px-4 py-2 text-sm font-semibold text-white transition duration-100 ease-out hover:bg-[#0077ED] active:scale-[0.97] disabled:opacity-50"
      >
        {pending ? 'Вход…' : 'Войти'}
      </button>
    </form>
  )
}
