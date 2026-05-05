"use client"

import { useEffect, useState } from 'react'

import { UsageDashboard } from '@/components/home/usage-dashboard'
import type { AgentUsageDashboard as AgentUsageDashboardData, Workspace } from '@agent-spaces/shared'

export function HomePage({ initialWorkspaces }: { initialWorkspaces: Workspace[] }) {
  const [usage, setUsage] = useState<AgentUsageDashboardData | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/agents/usage/dashboard?days=30', { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setUsage(data))
      .catch(() => setUsage(null))
    return () => controller.abort()
  }, [])

  return (
    <div className='flex min-h-dvh w-full flex-col'>
      <main className='mx-auto size-full max-w-7xl flex-1 px-4 py-6 sm:px-6'>
        <UsageDashboard data={usage} />
      </main>
    </div>
  )
}
