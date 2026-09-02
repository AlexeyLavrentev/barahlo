'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

// Error boundary for the list route. This Next version hands the boundary
// { error, retry } — `reset` is the pre-16 name and does not exist here
// (RESEARCH Pitfall 2). Internal details stay in the console (V7); the UI
// shows only the agreed copy from the UI-SPEC contract.
export default function DevicesError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-hairline">
      <p className="text-base text-ink">Не удалось загрузить список</p>
      <Button
        variant="secondary"
        size="xl"
        className="mt-4"
        onClick={() => retry()}
      >
        Попробовать снова
      </Button>
    </div>
  )
}
