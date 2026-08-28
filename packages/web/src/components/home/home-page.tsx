"use client"

import { useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import dynamic from 'next/dynamic'

import { Bot, GitBranch } from 'lucide-react'

import { ExpandableTabs } from '@/components/ui/expandable-tabs'
import { useWorkspaceStore } from '@/stores/workspace'
import type { Workspace } from '@agent-spaces/shared'

const TABS = [
  { title: 'Agent', icon: Bot, value: 'Agent' },
  { title: 'Workflow', icon: GitBranch, value: 'Workflow' },
]

const UsageDashboard = dynamic(
  () => import('@/components/home/usage-dashboard').then((m) => m.UsageDashboard),
  { ssr: false, loading: () => <PanelLoading /> },
)
const WorkflowExecutionPanel = dynamic(
  () => import('@/components/home/workflow-execution-panel').then((m) => m.WorkflowExecutionPanel),
  { ssr: false, loading: () => <PanelLoading /> },
)

function PanelLoading() {
  return <div className='h-32 w-full animate-pulse rounded-md bg-muted/40' aria-hidden='true' />
}

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
