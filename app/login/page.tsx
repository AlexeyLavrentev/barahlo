import type { Metadata } from 'next'
import { LoginForm } from './login-form'

export const metadata: Metadata = {
  title: 'Вход',
}

// Normalized to the UI-SPEC contract (02-03): page/card on the design tokens,
// copy unchanged. The accent lives only on the primary button and the fields'
// focus rings (Color contract).
export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-page px-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-hairline">
        <h1 className="text-xl font-semibold tracking-tight text-ink">
          Учёт техники
        </h1>
        <p className="mt-1 text-sm text-ink-secondary">
          Вход для руководителя
        </p>
        <LoginForm />
      </div>
    </main>
  )
}
