export const CANVAS_IMAGE_DROP_MIME = "application/x-canvas-drop-images";

type DragDataReader = Pick<DataTransfer, "getData">;
type DragDataDebug = Partial<Pick<DataTransfer, "types" | "effectAllowed" | "dropEffect">>;
type DragDataWriter = Pick<DataTransfer, "setData"> & DragDataDebug;

export function debugCanvasImageDrag(
  stage: string,
  dataTransfer: DragDataDebug,
  details?: Record<string, unknown>,
): void {
  console.debug("[DEBUG-image-drop]", {
    stage,
    types: Array.from(dataTransfer.types || []),
    effectAllowed: dataTransfer.effectAllowed,
    dropEffect: dataTransfer.dropEffect,
    ...details,
  });
}

export function getCanvasImageDropUrls(dataTransfer: DragDataReader): string[] {
  const raw = dataTransfer.getData(CANVAS_IMAGE_DROP_MIME);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    const values = typeof parsed === "string"
      ? [parsed]
      : Array.isArray((parsed as { urls?: unknown })?.urls)
        ? (parsed as { urls: unknown[] }).urls
        : [];
    return values.filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  } catch {
    return [];
  }
}

export function setCanvasImageDragData(dataTransfer: DragDataWriter, urls: unknown[]): boolean {
  const validUrls = urls.filter((url): url is string => typeof url === "string" && url.trim().length > 0);
  if (validUrls.length === 0) return false;
  dataTransfer.setData(CANVAS_IMAGE_DROP_MIME, JSON.stringify({ urls: validUrls }));
  debugCanvasImageDrag("payload:write", dataTransfer, { urls: validUrls });
  return true;
}
