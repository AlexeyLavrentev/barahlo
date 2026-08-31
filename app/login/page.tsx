import type { Metadata } from 'next'
import { LoginForm } from './login-form'

export const metadata: Metadata = {
  title: 'Вход',
}

export default function LoginPage() {
  return (
    <main className="flex min-h-svh items-center justify-center bg-neutral-50 px-6">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-sm ring-1 ring-neutral-200">
        <h1 className="text-xl font-semibold tracking-tight text-neutral-900">
          Учёт техники
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Вход для руководителя
        </p>
        <LoginForm />
      </div>
    </main>
  )
}
