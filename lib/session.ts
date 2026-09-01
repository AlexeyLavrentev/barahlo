import 'server-only'
import { SignJWT, jwtVerify } from 'jose'

export const SESSION_COOKIE = 'session'
export const SESSION_TTL_DAYS = 30 // D-01: «запомнить меня» — one login per month

// HS256-ключ из AUTH_SECRET. Валидация — при первом использовании ключа, а не
// при загрузке модуля: next build вычисляет модули экшенов без рантайм-секретов
// (в Docker-стадии builder .env недоступен — .dockerignore), падать должен
// сервер при первом входе, а не сборка образа. Без проверки пустой секрет
// падал бы поздно и криптично (DataError на первом sign), а короткий
// (например, «abc») принимался бы молча — токены подделываемы.
const MIN_SECRET_LENGTH = 32 // ≈ openssl rand -base64 32
let encodedKey: Uint8Array | null = null
function getEncodedKey(): Uint8Array {
  if (encodedKey) return encodedKey
  const secret = process.env.AUTH_SECRET
  if (!secret || secret.length < MIN_SECRET_LENGTH) {
    throw new Error(
      `AUTH_SECRET не задан или короче ${MIN_SECRET_LENGTH} символов — сгенерируйте его (openssl rand -base64 32) и перезапустите приложение`,
    )
  }
  encodedKey = new TextEncoder().encode(secret)
  return encodedKey
}

export async function createSession(userId: number) {
  const expiresAt = new Date(Date.now() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000)
  const token = await new SignJWT({ userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_DAYS}d`)
    .sign(getEncodedKey())

  // next/headers is imported lazily so this module also loads in vitest
  // (cookies() only exists inside a request/action scope).
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    // No Secure attribute on purpose (D-04: plain HTTP in LAN — browsers
    // drop Secure cookies over http). Persistent cookie survives restarts.
    expires: expiresAt,
    path: '/',
  })
}

export async function verifySession(token?: string) {
  if (!token) return null
  try {
    const { payload } = await jwtVerify(token, getEncodedKey(), { algorithms: ['HS256'] })
    return payload as { userId: number }
  } catch {
    // missing / tampered / expired token — never throws. Сюда же попадает
    // невалидный AUTH_SECRET: fail-closed в «не залогинен», а не 500 на
    // каждый запрос; явную ошибку конфигурации увидит первый вход (sign).
    return null
  }
}

export async function destroySession() {
  // Legal only inside a Server Action / Route Handler (cookie writes are
  // forbidden during Server Component render).
  const { cookies } = await import('next/headers')
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}
