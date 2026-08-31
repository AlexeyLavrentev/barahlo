'use server'

import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { redirect } from 'next/navigation'
import { createSession } from '@/lib/session'
import { checkRateLimit, recordFailure, resetFailures } from '@/lib/rate-limit'
import { db } from '@/db'
import { users } from '@/db/schema'
import { eq } from 'drizzle-orm'

const LoginSchema = z.object({
  login: z.string().min(1),
  password: z.string().min(1),
})

// Fixed check order (ASVS V2, no user enumeration):
// zod → rate limit → DB lookup → bcrypt.compare. The rate limit runs BEFORE
// any DB/bcrypt work so flooding never reaches the expensive paths.
export async function login(
  _prev: unknown,
  formData: FormData,
): Promise<{ error?: string }> {
  const parsed = LoginSchema.safeParse({
    login: formData.get('login'),
    password: formData.get('password'),
  })
  if (!parsed.success) return { error: 'Введите логин и пароль' }

  const blocked = checkRateLimit()
  if (blocked) return { error: 'Слишком много попыток. Попробуйте позже.' }

  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.login, parsed.data.login))
    .limit(1)

  const valid = user && (await bcrypt.compare(parsed.data.password, user.passwordHash))
  if (!valid) {
    recordFailure()
    // Single generic message for both unknown login and wrong password.
    return { error: 'Неверный логин или пароль' }
  }

  resetFailures()
  await createSession(user.id)
  redirect('/') // throws NEXT_REDIRECT — fine under useActionState
}
