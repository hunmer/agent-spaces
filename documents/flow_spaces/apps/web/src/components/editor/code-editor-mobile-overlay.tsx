"use client";

import { monacoBuiltinActions } from "@/lib/monaco-builtin-actions";
import type { MobileReadonlyMenuState, MobileSelectionPreMetrics } from "./code-editor-mobile";

interface MobileReadonlyOverlayProps {
  activeContent: string;
  wordWrap: boolean;
  mobileSelectionMode: boolean;
  mobileReadonlyMenu: MobileReadonlyMenuState | null;
  mobileSelectionPreMetrics: MobileSelectionPreMetrics | null;
  mobileSelectionPreRef: React.RefObject<HTMLPreElement | null>;
  mobileReadonlyMenuRef: React.RefObject<HTMLDivElement | null>;
  onContextMenu: (event: React.MouseEvent<HTMLPreElement>) => void;
  onEnterSelectionMode: () => void;
  onCloseSelectionMode: () => void;
  onCopySelection: () => void;
  onRunEditorAction: (actionId: string) => void;
  onRunBuiltinAction: (actionId: string) => void;
}

export function MobileReadonlyOverlay({
  activeContent,
  wordWrap,
  mobileSelectionMode,
  mobileReadonlyMenu,
  mobileSelectionPreMetrics,
  mobileSelectionPreRef,
  mobileReadonlyMenuRef,
  onContextMenu,
  onEnterSelectionMode,
  onCloseSelectionMode,
  onCopySelection,
  onRunEditorAction,
  onRunBuiltinAction,
}: MobileReadonlyOverlayProps) {
  return (
    <>
      {mobileSelectionMode ? (
        <pre
          ref={mobileSelectionPreRef}
          className="absolute inset-0 z-20 m-0 overflow-auto bg-background py-2 text-foreground select-text"
          style={{
            paddingLeft: mobileSelectionPreMetrics?.contentLeft ?? 0,
            paddingRight: mobileSelectionPreMetrics?.contentRight ?? 0,
            fontFamily: mobileSelectionPreMetrics?.fontFamily,
            fontWeight: mobileSelectionPreMetrics?.fontWeight,
            fontSize: mobileSelectionPreMetrics?.fontSize,
            lineHeight: mobileSelectionPreMetrics ? `${mobileSelectionPreMetrics.lineHeight}px` : undefined,
            letterSpacing: mobileSelectionPreMetrics?.letterSpacing,
            fontFeatureSettings: mobileSelectionPreMetrics?.fontFeatureSettings,
            fontVariationSettings: mobileSelectionPreMetrics?.fontVariationSettings,
            whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
            overflowWrap: wordWrap ? 'anywhere' : 'normal',
          }}
          onContextMenu={onContextMenu}
        >
          {activeContent}
        </pre>
      ) : null}
      {mobileReadonlyMenu ? (
        <div
          ref={mobileReadonlyMenuRef}
          className="fixed z-[80] min-w-40 select-none rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
          style={{
            left: Math.min(Math.max(8, mobileReadonlyMenu.x), window.innerWidth - 168),
            top: Math.min(Math.max(8, mobileReadonlyMenu.y), window.innerHeight - 180),
          }}
          onPointerDown={(event) => event.stopPropagation()}
        >
          {!mobileSelectionMode ? (
            <button
              type="button"
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent cursor-pointer"
              onClick={onEnterSelectionMode}
            >
              选择模式
            </button>
          ) : null}
          <button
            type="button"
            className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent cursor-pointer"
            onClick={onCopySelection}
          >
            复制代码
          </button>
          {mobileReadonlyMenu.canNavigate ? (
            <>
              <button
                type="button"
                className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent cursor-pointer"
                onClick={() => onRunEditorAction('editor.action.revealDefinition')}
              >
                Go to Definition
              </button>
              <button
                type="button"
                className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent cursor-pointer"
                onClick={() => onRunEditorAction('editor.action.goToReferences')}
              >
                Go to References
              </button>
            </>
          ) : null}
          {monacoBuiltinActions.map((action) => (
            <button
              key={action.id}
              type="button"
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent cursor-pointer"
              onClick={() => onRunBuiltinAction(action.id)}
            >
              {action.label}
            </button>
          ))}
          {mobileSelectionMode ? (
            <button
              type="button"
              className="flex w-full items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent cursor-pointer"
              onClick={onCloseSelectionMode}
            >
              完成
            </button>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
