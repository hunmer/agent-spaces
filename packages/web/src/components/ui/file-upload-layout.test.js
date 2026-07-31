import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const source = fs.readFileSync(new URL("./file-upload.tsx", import.meta.url), "utf8");

test("FileUpload switches from the full dropzone to a compact row after the first file", () => {
  assert.match(source, /!hideDropzone && files\.length === 0/);
  assert.match(source, /!hideDropzone && files\.length > 0/);
  const fileMapIndex = source.indexOf("files.map((item)");
  const compactIndex = source.indexOf("data-compact-upload-trigger");
  assert.ok(fileMapIndex >= 0 && compactIndex > fileMapIndex);
});

test("image thumbnails open MediaGallery and delete actions are hover-only", () => {
  assert.match(source, /openMediaGallery\(imageGalleryEntries\.map\(\(entry\) => entry\.media\), index\)/);
  assert.match(source, /title="查看大图"[\s\S]*openImagePreview\(item\.id\)/);
  assert.match(source, /opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100/);
  assert.match(source, /group\/preview relative[\s\S]*bg-black\/40 opacity-0 transition-opacity group-hover\/preview:opacity-100[\s\S]*<Eye/);
});
