"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from 'next-intl'
import {
  CheckCircle2, Clock, GitBranch, Loader2, Play, XCircle,
  AlertTriangle, Pause, ChevronRight,
} from "lucide-react"
import type { ExecutionLog } from "@agent-spaces/shared"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { executionLogApi } from "@/lib/workflow-api"
import { formatDuration } from "./usage-dashboard-utils"

// ---- Status badge ----

function StatusBadge({ status }: { status: ExecutionLog['status'] }) {
  const t = useTranslations('home.workflowExecutions.status')
  const map = {
    running:   { icon: Loader2, variant: "default" as const },
    completed: { icon: CheckCircle2, variant: "secondary" as const },
    paused:    { icon: Pause, variant: "outline" as const },
    error:     { icon: XCircle, variant: "destructive" as const },
  }
  const cfg = map[status] ?? map.error
  const Icon = cfg.icon
  return (
    <Badge variant={cfg.variant} className="gap-1 text-[10px] font-normal">
      <Icon className={`h-3 w-3 ${status === 'running' ? 'animate-spin' : ''}`} />
      {t(status)}
    </Badge>
  )
}

// ---- Stats cards ----

function StatsCards({ logs }: { logs: (ExecutionLog & { workflowName?: string })[] }) {
  const t = useTranslations('home.workflowExecutions.stats')
  const total = logs.length
  const running = logs.filter(l => l.status === 'running').length
  const completed = logs.filter(l => l.status === 'completed').length
  const failed = logs.filter(l => l.status === 'error').length
  const successRate = total > 0 ? Math.round((completed / total) * 100) : 0

  const cards = [
    { labelKey: "totalRuns" as const, value: total, icon: Play },
    { labelKey: "running" as const, value: running, icon: Loader2 },
    { labelKey: "successRate" as const, value: `${successRate}%`, icon: CheckCircle2 },
    { labelKey: "failed" as const, value: failed, icon: AlertTriangle },
  ]

  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map(c => (
        <Card key={c.labelKey} className="gap-2 py-3">
          <CardContent className="flex items-center gap-3 px-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
              <c.icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs text-muted-foreground">{t(c.labelKey)}</p>
              <p className="text-lg font-semibold">{c.value}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

// ---- Execution history table ----

function formatTime(ts: number) {
  if (!ts) return null
  return new Date(ts).toLocaleString(undefined, {
    month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  })
}

function getDuration(log: ExecutionLog) {
  if (!log.startedAt) return null
  const end = log.finishedAt || Date.now()
  const ms = end - log.startedAt
  return formatDuration(ms)
}

// ---- Main component ----

export function WorkflowExecutionPanel() {
  const t = useTranslations('home.workflowExecutions')
  const [logs, setLogs] = useState<(ExecutionLog & { workflowName?: string })[] | null>(null)

  const fetchLogs = useCallback(async () => {
    try {
      const data = await executionLogApi.listAll(50)
      setLogs(data)
    } catch {
      setLogs([])
    }
  }, [])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  if (logs === null) {
    return (
      <Card className="gap-0 overflow-hidden rounded-lg py-0">
        <CardHeader className="border-b px-4 py-3">
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent className="p-4">
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="gap-0 overflow-hidden rounded-lg py-0 mt-2">
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2">
          <GitBranch className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium">{t("title")}</span>
        </div>
        <Button variant="ghost" size="sm" onClick={fetchLogs}>
          <Clock className="mr-1 h-3 w-3" /> {t("refresh")}
        </Button>
      </div>

      <div className="border-b p-4">
        <StatsCards logs={logs} />
      </div>

      {logs.length === 0 ? (
        <div className="p-6 text-center text-xs text-muted-foreground">
          {t("empty")}
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">{t("table.workflow")}</TableHead>
              <TableHead className="text-xs">{t("table.status")}</TableHead>
              <TableHead className="text-xs">{t("table.started")}</TableHead>
              <TableHead className="text-xs">{t("table.duration")}</TableHead>
              <TableHead className="text-xs">{t("table.steps")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id} className="group cursor-pointer">
                <TableCell className="max-w-[200px] truncate text-xs font-medium">
                  <div className="flex items-center gap-1">
                    <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                    {log.workflowName || log.workflowId}
                  </div>
                </TableCell>
                <TableCell className="text-xs"><StatusBadge status={log.status} /></TableCell>
                <TableCell className="text-xs text-muted-foreground">{formatTime(log.startedAt) ?? t("timePlaceholder")}</TableCell>
                <TableCell className="text-xs text-muted-foreground">{getDuration(log) ?? t("timePlaceholder")}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {log.steps?.length ?? 0}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}
