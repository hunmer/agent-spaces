"use client"

import { useEffect } from 'react'

import { useWorkspaceStore } from '@/stores/workspace'
import type { Workspace } from '@agent-spaces/shared'

import { UsageDashboard } from '@/components/home/usage-dashboard'

export function HomePage({ initialWorkspaces }: { initialWorkspaces: Workspace[] }) {
  const setWorkspaces = useWorkspaceStore((store) => store.setWorkspaces)

  useEffect(() => {
    setWorkspaces(initialWorkspaces)
  }, [initialWorkspaces, setWorkspaces])

  return (
    <div className='flex h-full w-full flex-col overflow-auto'>
      <main className='w-full flex-1 px-4 py-6 sm:px-6'>
        <UsageDashboard />
      </main>
    </div>
  )
}
