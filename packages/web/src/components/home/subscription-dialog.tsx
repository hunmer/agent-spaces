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

interface FormData {
  provider: SubscriptionProvider
  label: string
  cookie: string
}

export function SubscriptionDialog() {
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
    const res = await fetch('/api/subscriptions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(editing),
    })
    if (res.ok) {
      setEditing(null)
      await load()
    }
  }

  const handleDelete = async (id: string) => {
    await fetch(`/api/subscriptions/${id}`, { method: 'DELETE' })
    await load()
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger nativeButton={false} render={
        <Button variant="outline" size="sm" className="h-7 gap-1.5 text-xs">
          <Plus className="size-3.5" />
          {t('subscription.addPlatform')}
        </Button>
      } />
      <DialogContent className="sm:max-w-md">
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
                      onClick={() => setEditing({ ...editing, provider: p.value })}
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
                <Label className="text-xs">Cookie / Token</Label>
                <Input
                  className="h-8 text-xs font-mono"
                  value={editing.cookie}
                  onChange={e => setEditing({ ...editing, cookie: e.target.value })}
                  placeholder={t('subscription.cookiePlaceholder')}
                />
              </div>

              <div className="flex justify-end gap-2">
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditing(null)}>
                  {t('subscription.cancel')}
                </Button>
                <Button size="sm" className="h-7 text-xs" onClick={handleSave} disabled={!editing.cookie}>
                  {t('subscription.save')}
                </Button>
              </div>
            </div>
          )}

          {!editing && (
            <Button size="sm" variant="outline" className="w-full h-7 text-xs gap-1" onClick={() => setEditing({ provider: 'zhipu', label: '', cookie: '' })}>
              <Plus className="size-3" />
              {t('subscription.add')}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
