"use client"

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

import { Bot, GitBranch } from 'lucide-react'

import { ExpandableTabs } from '@/components/ui/expandable-tabs'
import { UsageDashboard } from '@/components/home/usage-dashboard'
import { WorkflowExecutionPanel } from '@/components/home/workflow-execution-panel'
import { useWorkspaceStore } from '@/stores/workspace'
import type { Workspace } from '@agent-spaces/shared'

const TABS = [
  { title: 'Agent', icon: Bot, value: 'Agent' },
  { title: 'Workflow', icon: GitBranch, value: 'Workflow' },
]

export function HomePage({ initialWorkspaces }: { initialWorkspaces: Workspace[] }) {
  const setWorkspaces = useWorkspaceStore((store) => store.setWorkspaces)
  const router = useRouter()
  const searchParams = useSearchParams()
  const tabParam = searchParams.get('tab')
  const activeTab = tabParam ? TABS.find(t => t.value.toLowerCase() === tabParam)?.value ?? TABS[0].value : TABS[0].value

  useEffect(() => {
    setWorkspaces(initialWorkspaces)
  }, [initialWorkspaces, setWorkspaces])

  const handleTabChange = (value: string) => {
    router.replace(value === TABS[0].value ? '?' : `?tab=${value.toLowerCase()}`)
  }

  return (
    <div className='flex h-full w-full flex-col overflow-auto'>
      <div className='px-4 pt-4 sm:px-6'>
        <ExpandableTabs tabs={TABS} value={activeTab} onValueChange={handleTabChange} />
      </div>
      <main className='w-full flex-1 px-4 py-6 sm:px-6'>
        {activeTab === 'Agent' && <UsageDashboard />}
        {activeTab === 'Workflow' && <WorkflowExecutionPanel />}
      </main>
    </div>
  )
}
