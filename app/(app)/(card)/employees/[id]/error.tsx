'use client'

import { useEffect } from 'react'
import { Button } from '@/components/ui/button'

// Error boundary for the card route — same contract as the list boundary:
// this Next version's props are { error, retry } (never `reset`, RESEARCH
// Pitfall 2), details go to the console only (V7), UI shows the agreed copy.
export default function EmployeeCardError({
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
    <div className="max-w-2xl rounded-2xl bg-white p-6 shadow-sm ring-1 ring-hairline">
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
