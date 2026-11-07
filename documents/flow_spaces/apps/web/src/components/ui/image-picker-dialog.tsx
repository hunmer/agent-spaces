"use client"

import { useState } from "react"
import { useTranslations } from "next-intl"
import { ImageCropper } from "@/components/ui/image-cropper"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const ASPECTS = [
  { label: "aspectCircle", value: 1 },
  { label: "aspect3x4", value: 3 / 4 },
  { label: "aspect16x9", value: 16 / 9 },
] as const

interface ImagePickerDialogProps {
  src: string
  open: boolean
  onOpenChange: (open: boolean) => void
  /** 裁剪完成回调，返回裁剪后的 dataUrl */
  onCropComplete: (dataUrl: string) => void
  /** 默认宽高比，默认 1 (圆形) */
  defaultAspect?: number
  /** 对话框标题，默认取 i18n settings.cropAvatar */
  title?: string
}

export function ImagePickerDialog({
  src,
  open,
  onOpenChange,
  onCropComplete,
  defaultAspect = 1,
  title,
}: ImagePickerDialogProps) {
  const t = useTranslations("settings")
  const [aspect, setAspect] = useState<number>(defaultAspect)

  function handleCrop(dataUrl: string) {
    onCropComplete(dataUrl)
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onOpenChange(false) }}>
      <DialogContent className="sm:max-w-md" showCloseButton>
        <DialogHeader>
          <DialogTitle>{title || t("cropAvatar")}</DialogTitle>
        </DialogHeader>
        <div className="flex gap-1">
          {ASPECTS.map((a) => (
            <button
              key={a.label}
              type="button"
              className={`px-2.5 py-1 text-xs rounded-md cursor-pointer transition-colors ${
                aspect === a.value
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
              onClick={() => setAspect(a.value)}
            >
              {t(a.label)}
            </button>
          ))}
        </div>
        <ImageCropper
          src={src}
          aspect={aspect}
          onCropComplete={handleCrop}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
