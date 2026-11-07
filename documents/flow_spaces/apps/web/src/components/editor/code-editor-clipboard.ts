// Clipboard polyfill for embedded browsers (Tauri WebView, etc.)
// Some environments expose clipboard API but fail on write operations.
if (typeof window !== "undefined") {
  const currentClipboard = navigator.clipboard;
  const originalWriteText = currentClipboard?.writeText?.bind(currentClipboard);
  const originalWrite = currentClipboard?.write?.bind(currentClipboard);

  Object.defineProperty(navigator, "clipboard", {
    value: {
      ...currentClipboard,
      writeText: (text: string) =>
        (originalWriteText?.(text) ?? Promise.resolve()).catch(() => undefined),
      write: async (items: ClipboardItem[]) => {
        try {
          if (originalWrite) {
            await originalWrite(items);
            return;
          }
        } catch {
          // Some embedded browsers expose Clipboard.write but disallow it.
        }

        const textItem = items[0]?.getType("text/plain");
        if (!textItem) return;
        const text = await textItem.then((blob) => blob.text());
        await (originalWriteText?.(text) ?? Promise.resolve()).catch(() => undefined);
      },
    },
    writable: true,
    configurable: true,
  });
}
