'use client';

import type { useImport } from './use-import';

/** Props are the ref + handler outputs of {@link useImport}. */
interface ImportFileInputsProps {
  mdInputRef: ReturnType<typeof useImport>['mdInputRef'];
  folderInputRef: ReturnType<typeof useImport>['folderInputRef'];
  zipInputRef: ReturnType<typeof useImport>['zipInputRef'];
  handleMdSelect: ReturnType<typeof useImport>['handleMdSelect'];
  handleFolderSelect: ReturnType<typeof useImport>['handleFolderSelect'];
  handleZipSelect: ReturnType<typeof useImport>['handleZipSelect'];
}

/**
 * Hidden <input type="file"> elements driven by useImport's refs.
 * Render once near the import menu.
 */
export function ImportFileInputs({
  mdInputRef,
  folderInputRef,
  zipInputRef,
  handleMdSelect,
  handleFolderSelect,
  handleZipSelect,
}: ImportFileInputsProps) {
  return (
    <>
      <input
        ref={mdInputRef}
        type="file"
        accept=".md"
        multiple
        className="hidden"
        onChange={handleMdSelect}
      />
      <input
        ref={folderInputRef}
        type="file"
        className="hidden"
        onChange={handleFolderSelect}
        // @ts-expect-error webkitdirectory is not in React types
        webkitdirectory=""
        directory=""
      />
      <input
        ref={zipInputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={handleZipSelect}
      />
    </>
  );
}
