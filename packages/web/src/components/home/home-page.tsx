"use client"

import { useState } from 'react'
import Link from 'next/link'
import { FolderOpen, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { WorkspaceDialog } from '@/components/workspace/workspace-dialog'
import type { Workspace } from '@agent-spaces/shared'

export function HomePage({ initialWorkspaces }: { initialWorkspaces: Workspace[] }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(initialWorkspaces)
  const [dialogOpen, setDialogOpen] = useState(false)

  const handleWsSubmit = async (data: { name: string; boundDirs: string[] }) => {
    const res = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    const ws = await res.json()
    setWorkspaces((prev) => [...prev, ws])
  }

  return (
    <div className='flex min-h-dvh w-full flex-col'>
      <main className='mx-auto size-full max-w-7xl flex-1 px-4 py-6 sm:px-6'>
        <div className='mb-6 flex items-center justify-between'>
          <h1 className='text-2xl font-semibold'>Workspaces</h1>
          <Button onClick={() => setDialogOpen(true)} size='sm' className='rounded-full px-4'>
            <Plus className='size-3.5' />
            New Workspace
          </Button>
        </div>
        {workspaces.length === 0 ? (
          <div className='rounded-2xl border border-dashed border-border p-16 text-center'>
            <FolderOpen className='size-10 mx-auto text-muted-foreground/40 mb-4' />
            <p className='text-muted-foreground text-sm'>
              No workspaces yet. Create one to get started.
            </p>
          </div>
        ) : (
          <div className='grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4'>
            {workspaces.map((ws) => (
              <Link
                key={ws.id}
                href={`/workspace/${ws.id}`}
                className='group rounded-2xl border border-border bg-card p-5 hover:shadow-card-hover transition-all duration-200 block'
              >
                <div className='flex items-start justify-between'>
                  <div className='w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center'>
                    <FolderOpen className='size-5 text-primary' />
                  </div>
                </div>
                <h3 className='font-heading text-lg font-semibold mt-3'>{ws.name}</h3>
                <p className='text-sm text-muted-foreground mt-1 truncate'>
                  {ws.boundDirs.join(', ')}
                </p>
              </Link>
            ))}
          </div>
        )}
      </main>

      <WorkspaceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleWsSubmit}
      />
    </div>
  )
}
