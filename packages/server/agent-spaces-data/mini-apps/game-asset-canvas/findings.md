# Findings

- `runReskin` currently generates and consumes the edited composite in one call.
- `workflowRedraw` returns `{ url, durationMs }`; the UI cannot observe the URL before segmentation.
- `openMediaGallery([{ src, type: 'image' }], 0)` is exported by `@agent-spaces/ui` and already used in this mini-app.
- `ReskinPanel` catches pipeline failures, so a generated-image callback must run before segmentation to preserve the image after later failures.
- Generation controls should be disabled while a cached image exists, preventing prompt/method/model/size changes from silently mismatching the reused image.
- SAM loads successful plugin output as `HTMLImageElement`; `erodeAlpha` accepts only `HTMLCanvasElement`. Convert every successful mask through `drawToCanvas` before optional erosion.
- Pixi 7 `BaseTexture.setResource` throws whenever a resource is already bound. Hot preview must update the existing image resource source instead.
- Form content currently has intrinsic height while logs consume remaining flex height; Gallery therefore shrinks logs. Form must become the scrollable flex region and logs must be fixed-height.
