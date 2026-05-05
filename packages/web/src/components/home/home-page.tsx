"use client"

import { useEffect, useState } from 'react'
import Link from 'next/link'
import {
  CalendarX2Icon,
  FolderOpen,
  Plus,
  TriangleAlertIcon,
  TruckIcon
} from 'lucide-react'

import { UsageDashboard } from '@/components/home/usage-dashboard'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import ProductInsightsCard from '@/components/shadcn-studio/blocks/widget-product-insights'
import SalesMetricsCard from '@/components/shadcn-studio/blocks/chart-sales-metrics'
import TotalEarningCard from '@/components/shadcn-studio/blocks/widget-total-earning'
import TransactionDatatable, { type Item } from '@/components/shadcn-studio/blocks/datatable-transaction'
import { WorkspaceDialog } from '@/components/workspace/workspace-dialog'
import { useWorkspaceStore } from '@/stores/workspace'
import type { AgentUsageDashboard as AgentUsageDashboardData, Workspace } from '@agent-spaces/shared'

const earningData = [
  {
    img: 'https://cdn.shadcnstudio.com/ss-assets/blocks/dashboard-application/widgets/zipcar.png',
    platform: 'Zipcar',
    technologies: 'Vuejs & HTML',
    earnings: '-$23,569.26',
    progressPercentage: 75
  },
  {
    img: 'https://cdn.shadcnstudio.com/ss-assets/blocks/dashboard-application/widgets/bitbank.png',
    platform: 'Bitbank',
    technologies: 'Figma & React',
    earnings: '-$12,650.31',
    progressPercentage: 25
  }
]

const transactionData: Item[] = [
  {
    id: '1',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-1.png',
    avatarFallback: 'JA',
    name: 'Jack Alfredo',
    amount: 316.0,
    status: 'paid',
    email: 'jack@shadcnstudio.com',
    paidBy: 'mastercard'
  },
  {
    id: '2',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-2.png',
    avatarFallback: 'MG',
    name: 'Maria Gonzalez',
    amount: 253.4,
    status: 'pending',
    email: 'maria.g@shadcnstudio.com',
    paidBy: 'visa'
  },
  {
    id: '3',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-3.png',
    avatarFallback: 'JD',
    name: 'John Doe',
    amount: 852.0,
    status: 'paid',
    email: 'john.doe@shadcnstudio.com',
    paidBy: 'mastercard'
  },
  {
    id: '4',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-4.png',
    avatarFallback: 'EC',
    name: 'Emily Carter',
    amount: 889.0,
    status: 'pending',
    email: 'emily.carter@shadcnstudio.com',
    paidBy: 'visa'
  },
  {
    id: '5',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-5.png',
    avatarFallback: 'DL',
    name: 'David Lee',
    amount: 723.16,
    status: 'paid',
    email: 'david.lee@shadcnstudio.com',
    paidBy: 'mastercard'
  },
  {
    id: '6',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-6.png',
    avatarFallback: 'SP',
    name: 'Sophia Patel',
    amount: 612.0,
    status: 'failed',
    email: 'sophia.patel@shadcnstudio.com',
    paidBy: 'mastercard'
  },
  {
    id: '7',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-7.png',
    avatarFallback: 'RW',
    name: 'Robert Wilson',
    amount: 445.25,
    status: 'paid',
    email: 'robert.wilson@shadcnstudio.com',
    paidBy: 'visa'
  },
  {
    id: '8',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-8.png',
    avatarFallback: 'LM',
    name: 'Lisa Martinez',
    amount: 297.8,
    status: 'processing',
    email: 'lisa.martinez@shadcnstudio.com',
    paidBy: 'mastercard'
  },
  {
    id: '9',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-9.png',
    avatarFallback: 'MT',
    name: 'Michael Thompson',
    amount: 756.9,
    status: 'paid',
    email: 'michael.thompson@shadcnstudio.com',
    paidBy: 'visa'
  },
  {
    id: '10',
    avatar: 'https://cdn.shadcnstudio.com/ss-assets/avatar/avatar-10.png',
    avatarFallback: 'AJ',
    name: 'Amanda Johnson',
    amount: 189.5,
    status: 'pending',
    email: 'amanda.johnson@shadcnstudio.com',
    paidBy: 'mastercard'
  }
]

export function HomePage({ initialWorkspaces }: { initialWorkspaces: Workspace[] }) {
  const workspaces = useWorkspaceStore((store) => store.workspaces)
  const setWorkspaces = useWorkspaceStore((store) => store.setWorkspaces)
  const upsertWorkspace = useWorkspaceStore((store) => store.upsertWorkspace)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [usage, setUsage] = useState<AgentUsageDashboardData | null>(null)

  useEffect(() => {
    setWorkspaces(initialWorkspaces)
  }, [initialWorkspaces, setWorkspaces])

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/agents/usage/dashboard?days=30', { signal: controller.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setUsage(data))
      .catch(() => setUsage(null))
    return () => controller.abort()
  }, [])

  const handleWsSubmit = async (data: { name: string; boundDirs: string[] }) => {
    const res = await fetch('/api/workspaces', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    })
    const ws = await res.json()
    upsertWorkspace(ws)
  }

  return (
    <div className='flex min-h-dvh w-full flex-col'>
      <main className='mx-auto size-full max-w-7xl flex-1 px-4 py-6 sm:px-6'>
        <div className='grid grid-cols-2 gap-6 lg:grid-cols-3'>
          <UsageDashboard data={usage} />

          <div className='grid gap-6 max-xl:col-span-full lg:max-xl:grid-cols-2'>
            <ProductInsightsCard className='justify-between gap-3 [&>[data-slot=card-content]]:space-y-5' />
            <TotalEarningCard
              title='Total Earning'
              earning={24650}
              trend='up'
              percentage={10}
              comparisonText='Compare to last year ($84,325)'
              earningData={earningData}
              className='justify-between gap-5 sm:min-w-0 [&>[data-slot=card-content]]:space-y-7'
            />
          </div>

          <SalesMetricsCard className='col-span-full xl:col-span-2 [&>[data-slot=card-content]]:space-y-6' />

          <Card className='col-span-full w-full py-0'>
            <TransactionDatatable data={transactionData} />
          </Card>

        </div>
      </main>

      <WorkspaceDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onSubmit={handleWsSubmit}
      />
    </div>
  )
}
