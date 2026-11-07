"use client"

import React, { type SyntheticEvent } from "react"
import ReactCrop, {
  centerCrop,
  makeAspectCrop,
  type Crop,
  type PixelCrop,
} from "react-image-crop"
import "react-image-crop/dist/ReactCrop.css"

interface ImageCropperProps {
  src: string
  aspect: number | undefined
  onCropComplete: (dataUrl: string) => void
  onCancel: () => void
}

const imgRef = React.createRef<HTMLImageElement>()

function onImageLoad(e: SyntheticEvent<HTMLImageElement>, aspect: number | undefined) {
  const { width, height } = e.currentTarget
  const crop = aspect
    ? centerCrop(makeAspectCrop({ unit: "%", width: 50 }, aspect, width, height), width, height)
    : centerCrop(makeAspectCrop({ unit: "%", width: 50, height: 50 }, 1, width, height), width, height)
  return crop
}

function getCroppedImg(image: HTMLImageElement, crop: PixelCrop, circular?: boolean): string {
  const canvas = document.createElement("canvas")
  const scaleX = image.naturalWidth / image.width
  const scaleY = image.naturalHeight / image.height
  const w = crop.width * scaleX
  const h = crop.height * scaleY

  canvas.width = w
  canvas.height = h

  const ctx = canvas.getContext("2d")!
  ctx.imageSmoothingEnabled = false

  if (circular) {
    ctx.beginPath()
    ctx.arc(w / 2, h / 2, Math.min(w, h) / 2, 0, 2 * Math.PI)
    ctx.closePath()
    ctx.clip()
  }

  ctx.drawImage(
    image,
    crop.x * scaleX,
    crop.y * scaleY,
    crop.width * scaleX,
    crop.height * scaleY,
    0,
    0,
    w,
    h,
  )

  return canvas.toDataURL("image/png", 1.0)
}

export function ImageCropper({ src, aspect, onCropComplete, onCancel }: ImageCropperProps) {
  const [crop, setCrop] = React.useState<Crop>()
  const [completedCrop, setCompletedCrop] = React.useState<PixelCrop>()

  function handleImageLoad(e: SyntheticEvent<HTMLImageElement>) {
    const c = onImageLoad(e, aspect)
    setCrop(c)
    setCompletedCrop(undefined)
  }

  function handleComplete(c: PixelCrop) {
    setCompletedCrop(c)
  }

  function handleCrop() {
    if (!imgRef.current || !completedCrop?.width || !completedCrop?.height) return
    const dataUrl = getCroppedImg(imgRef.current, completedCrop, aspect === 1)
    onCropComplete(dataUrl)
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <ReactCrop
        crop={crop}
        onChange={(_, percentCrop) => setCrop(percentCrop)}
        onComplete={handleComplete}
        aspect={aspect}
        circularCrop={aspect === 1}
        className="max-h-[60vh]"
      >
        <img
          ref={imgRef}
          alt="Crop"
          src={src}
          onLoad={handleImageLoad}
          className="max-h-[60vh] max-w-full"
        />
      </ReactCrop>
      <div className="flex gap-2 w-full justify-end">
        <button
          type="button"
          className="text-xs text-muted-foreground hover:text-foreground cursor-pointer"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="text-xs text-primary hover:underline cursor-pointer font-medium"
          onClick={handleCrop}
        >
          Crop
        </button>
      </div>
    </div>
  )
}
