"use client"

import { useCallback, useEffect, useState } from "react"
import { useTranslations } from 'next-intl'
import { Plus, Trash2 } from "lucide-react"
import type { SubscriptionConfig, SubscriptionProvider } from "@agent-spaces/shared"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const PROVIDERS: Array<{ value: SubscriptionProvider; label: string }> = [
  { value: 'zhipu', label: '智谱 (ZhiPu)' },
]

const DEFAULT_HEADERS: Record<SubscriptionProvider, Array<{ key: string; value: string }>> = {
  zhipu: [{ key: 'Authorization', value: '' }],
}

interface HeaderRow {
  id: number
  key: string
  value: string
}

interface FormData {
  provider: SubscriptionProvider
  label: string
  cookie: string
  headers: HeaderRow[]
}

let nextHeaderId = 1

function headersToRows(headers?: Record<string, string>): HeaderRow[] {
  if (!headers || Object.keys(headers).length === 0) return []
  return Object.entries(headers).map(([key, value]) => ({ id: nextHeaderId++, key, value }))
}

function rowsToHeaders(rows: HeaderRow[]): Record<string, string> | undefined {
  const entries = rows.filter(r => r.key.trim()).map(r => [r.key.trim(), r.value] as [string, string])
  return entries.length > 0 ? Object.fromEntries(entries) : undefined
}

function getDefaultHeaders(provider: SubscriptionProvider): HeaderRow[] {
  return DEFAULT_HEADERS[provider]?.map(h => ({ ...h, id: nextHeaderId++ })) ?? []
}

export function SubscriptionDialog({ onChange }: { onChange?: () => void }) {
  const t = useTranslations('home')
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<SubscriptionConfig[]>([])
  const [editing, setEditing] = useState<FormData | null>(null)

  const load = useCallback(async () => {
    const res = await fetch('/api/subscriptions')
    if (res.ok) setItems(await res.json())
  }, [])

  useEffect(() => { if (open) load() }, [open, load])

  const handleSave = async () => {
    if (!editing) return
    const body = {
      provider: editing.provider,
      label: editing.label || editing.provider,
      cookie: editing.cookie,
      headers: rowsToHeaders(editing.headers),
    }
    const res = await fetch('/api/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      setEditing(null)
      await load()
      onChange?.()
    }
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/subscriptions/${id}`, { method: 'DELETE' })
    await load()
    onChange?.()
  }

  const updateHeader = (id: number, field: 'key' | 'value', val: string) => {
    if (!editing) return
    setEditing({
      ...editing,
      headers: editing.headers.map(h => h.id === id ? { ...h, [field]: val } : h),
    })
  }

  const addHeader = () => {
    if (!editing) return
    setEditing({ ...editing, headers: [...editing.headers, { id: nextHeaderId++, key: '', value: '' }] })
  }

  const removeHeader = (id: number) => {
    if (!editing) return
    setEditing({ ...editing, headers: editing.headers.filter(h => h.id !== id) })
  }

  const switchProvider = (provider: SubscriptionProvider) => {
    if (!editing) return
    setEditing({ ...editing, provider, headers: getDefaultHeaders(provider) })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger nativeButton render={
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
          <Plus className="size-3.5" />
          {t('subscription.addPlatform')}
        </Button>
      } />
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-sm">{t('subscription.title')}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {items.map(item => (
            <div key={item.id} className="flex items-center justify-between rounded-md border px-3 py-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-xs font-medium">{item.label}</span>
                <span className="text-[10px] text-muted-foreground capitalize">({item.provider})</span>
              </div>
              <Button variant="ghost" size="icon" className="size-6" onClick={() => handleDelete(item.id)}>
                <Trash2 className="size-3 text-muted-foreground" />
              </Button>
            </div>
          ))}

          {items.length === 0 && !editing && (
            <p className="text-center text-xs text-muted-foreground py-2">{t('subscription.empty')}</p>
          )}

          {editing && (
            <div className="space-y-3 rounded-md border p-3">
              <div className="space-y-1.5">
                <Label className="text-xs">{t('subscription.platform')}</Label>
                <div className="flex gap-1.5">
                  {PROVIDERS.map(p => (
                    <Button
                      key={p.value}
                      size="sm"
                      variant={editing.provider === p.value ? 'default' : 'secondary'}
                      className="h-7 text-xs"
                      onClick={() => switchProvider(p.value)}
                    >
                      {p.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs">{t('subscription.label')}</Label>
                <Input
                  className="h-8 text-xs"
                  value={editing.label}
                  onChange={e => setEditing({ ...editing, label: e.target.value })}
                  placeholder={t('subscription.labelPlaceholder')}
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs">{t('subscription.headers')}</Label>
                  <Button variant="ghost" size="sm" className="h-5 text-[10px] gap-0.5 px-1" onClick={addHeader}>
                    <Plus className="size-2.5" /> {t('subscription.addHeader')}
                  </Button>
                </div>
                <div className="space-y-1.5">
                  {editing.headers.map(h => (
                    <div key={h.id} className="flex items-center gap-1.5">
                      <Input
                        className="h-7 flex-[2] text-xs font-mono"
                        value={h.key}
                        onChange={e => updateHeader(h.id, 'key', e.target.value)}
                        placeholder="Header-Key"
                      />
                      <Input
                        className="h-7 flex-[3] text-xs font-mono"
                        value={h.value}
                        onChange={e => updateHeader(h.id, 'value', e.target.value)}
                        placeholder="value"
                      />
                      <Button variant="ghost" size="icon" className="size-6 shrink-0" onClick={() => removeHeader(h.id)}>
                        <Trash2 className="size-3 text-muted-foreground" />
                      </Button>
                    </div>
                  ))}
                  {editing.headers.length === 0 && (
                    <p className="text-[10px] text-muted-foreground text-center py-1">{t('subscription.noHeaders')}</p>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(null)}>
                  {t('subscription.cancel')}
                </Button>
                <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={!editing.headers.some(h => h.key.trim() && h.value.trim())}>
                  {t('subscription.save')}
                </Button>
              </div>
            </div>
          )}

          {!editing && (
            <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1" onClick={() => setEditing({ provider: 'zhipu', label: '', cookie: '', headers: getDefaultHeaders('zhipu') })}>
              <Plus className="size-3" />
              {t('subscription.add')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
