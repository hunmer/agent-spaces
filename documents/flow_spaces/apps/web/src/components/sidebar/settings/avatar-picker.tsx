"use client"

import { setCachedUserAvatarUrl } from "@/hooks/use-user-avatar"
import { sdk } from "@/lib/sdk"
import { ImagePickerDialog } from "@/components/ui/image-picker-dialog"

interface AvatarPickerProps {
  src: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onUploaded: (url: string) => void
  /** 为 true 时跳过写入用户设置（agent 头像等场景） */
  skipUserSettings?: boolean
}

export function AvatarPicker({ src, open, onOpenChange, onUploaded, skipUserSettings }: AvatarPickerProps) {
  async function handleCropComplete(dataUrl: string) {
    try {
      const data = await sdk.http.post<{ url?: string }>("/api/upload/avatar", { dataUrl })
      if (data.url) {
        const url = `${data.url}?t=${Date.now()}`
        if (!skipUserSettings) {
          setCachedUserAvatarUrl(url)
          sdk.http.putVoid("/api/user/settings", { avatarUrl: data.url }).catch(() => {})
        }
        onUploaded(url)
      }
    } catch {
      /* ignore */
    }
    onOpenChange(false)
  }

  return (
    <ImagePickerDialog
      src={src}
      open={open}
      onOpenChange={onOpenChange}
      onCropComplete={handleCropComplete}
    />
  )
}
