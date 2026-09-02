'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

// Shell nav (UI-SPEC «App shell change»): «Устройства» · «Сотрудники», core
// entity first. Active route = text-ink, inactive = text-ink-secondary with a
// hover → ink — the active/inactive rule phase 2 declared but only one item
// could express. RSC owns no pathname, so this is a client island.
const NAV_ITEMS = [
  { href: '/devices', label: 'Устройства' },
  { href: '/employees', label: 'Сотрудники' },
] as const

export function AppNav() {
  const pathname = usePathname()
  return (
    <nav aria-label="Разделы" className="flex items-center gap-4">
      {NAV_ITEMS.map((item) => {
        const active =
          pathname === item.href || pathname.startsWith(`${item.href}/`)
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? 'text-sm text-ink'
                : 'text-sm text-ink-secondary transition-colors hover:text-ink'
            }
          >
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
