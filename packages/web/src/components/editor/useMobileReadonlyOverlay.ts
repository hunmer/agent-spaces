import { useEffect, useRef, useCallback, useState } from "react";
import { monacoBuiltinActions } from "@/lib/monaco-builtin-actions";
import { toast } from "sonner";
import {
  blurEditorActiveElement,
  hasSingleWordSelection,
  getSingleWordSelectionMenuState,
  collapseEditorSelection,
} from "./code-editor-mobile";
import type { MobileReadonlyMenuState, MobileLongPressState, MobileSelectionPreMetrics } from "./code-editor-mobile";
import type * as Monaco from 'monaco-editor';
import { copyToClipboard } from '@/lib/utils';

interface UseMobileReadonlyOverlayParams {
  editorRef: React.RefObject<Monaco.editor.IStandaloneCodeEditor | null>;
  monacoRef: React.RefObject<typeof Monaco | null>;
  activeContent: string;
  workspaceId: string;
  workspaceRoot: string | undefined;
  isMobile: boolean;
  isReadOnly: boolean;
  isCommitDiff: boolean;
  hasActiveFile: boolean;
  editorReadyTick: number;
  wordWrap: boolean;
}

export function useMobileReadonlyOverlay({
  editorRef,
  monacoRef,
  activeContent,
  workspaceId,
  workspaceRoot,
  isMobile,
  isReadOnly,
  isCommitDiff,
  hasActiveFile,
  editorReadyTick,
  wordWrap: _wordWrap,
}: UseMobileReadonlyOverlayParams) {
  const mobileSelectionPreRef = useRef<HTMLPreElement | null>(null);
  const mobileReadonlyMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileLongPressRef = useRef<MobileLongPressState | null>(null);
  const mobileSelectionMenuTimerRef = useRef<number | null>(null);
  const mobileMonacoSelectionMenuTimerRef = useRef<number | null>(null);
  const allowMobileEditorFocusRef = useRef(false);
  const suppressMobileSelectionMenuRef = useRef(false);
  const pendingNavigationSelectionCleanupRef = useRef(false);

  const [mobileSelectionMode, setMobileSelectionMode] = useState(false);
  const [mobileReadonlyMenu, setMobileReadonlyMenu] = useState<MobileReadonlyMenuState | null>(null);
  const [mobileSelectionPreMetrics, setMobileSelectionPreMetrics] = useState<MobileSelectionPreMetrics | null>(null);

  const showMobileReadonlyOverlay = isMobile && isReadOnly && !isCommitDiff && hasActiveFile;

  const closeMobileSelectionMode = useCallback(() => {
    if (mobileSelectionMenuTimerRef.current != null) {
      window.clearTimeout(mobileSelectionMenuTimerRef.current);
      mobileSelectionMenuTimerRef.current = null;
    }
    if (mobileMonacoSelectionMenuTimerRef.current != null) {
      window.clearTimeout(mobileMonacoSelectionMenuTimerRef.current);
      mobileMonacoSelectionMenuTimerRef.current = null;
    }
    setMobileSelectionMode(false);
    setMobileReadonlyMenu(null);
    setMobileSelectionPreMetrics(null);
    window.getSelection()?.removeAllRanges();
  }, []);

  const clearMobileLongPress = useCallback(() => {
    const longPress = mobileLongPressRef.current;
    if (longPress) {
      window.clearTimeout(longPress.timer);
      mobileLongPressRef.current = null;
    }
  }, []);

  const clearMobileSelectionMenuTimer = useCallback(() => {
    if (mobileSelectionMenuTimerRef.current != null) {
      window.clearTimeout(mobileSelectionMenuTimerRef.current);
      mobileSelectionMenuTimerRef.current = null;
    }
  }, []);

  const clearMobileMonacoSelectionMenuTimer = useCallback(() => {
    if (mobileMonacoSelectionMenuTimerRef.current != null) {
      window.clearTimeout(mobileMonacoSelectionMenuTimerRef.current);
      mobileMonacoSelectionMenuTimerRef.current = null;
    }
  }, []);

  const handleMobileReadonlyContextMenu = useCallback((event: React.MouseEvent<HTMLDivElement>) => {
    if (!showMobileReadonlyOverlay || mobileSelectionMode) return;
    event.preventDefault();
    event.stopPropagation();
    blurEditorActiveElement(editorRef.current);
    setMobileReadonlyMenu({
      x: event.clientX,
      y: event.clientY,
      selectedText: '',
      canNavigate: hasSingleWordSelection(editorRef.current),
    });
  }, [editorRef, mobileSelectionMode, showMobileReadonlyOverlay]);

  const handleMobileReadonlyFocus = useCallback(() => {
    if (allowMobileEditorFocusRef.current) return;
    if (!showMobileReadonlyOverlay || mobileSelectionMode) return;
    blurEditorActiveElement(editorRef.current);
  }, [editorRef, mobileSelectionMode, showMobileReadonlyOverlay]);

  const handleMobileReadonlyPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!showMobileReadonlyOverlay || mobileSelectionMode || event.pointerType === 'mouse') return;
    if (mobileReadonlyMenuRef.current?.contains(event.target as Node)) return;
    const editor = editorRef.current;
    const target = editor?.getTargetAtClientPoint(event.clientX, event.clientY);
    const selection = editor?.getSelection();
    if (selection && target?.position && !selection.isEmpty() && selection.containsPosition(target.position)) {
      event.preventDefault();
      event.stopPropagation();
      const menuState = getSingleWordSelectionMenuState(editor);
      if (menuState) {
        setMobileReadonlyMenu(menuState);
      }
      return;
    }
    setMobileReadonlyMenu(null);
    clearMobileLongPress();
    const x = event.clientX;
    const y = event.clientY;
    mobileLongPressRef.current = {
      x,
      y,
      timer: window.setTimeout(() => {
        blurEditorActiveElement(editorRef.current);
        setMobileReadonlyMenu({
          x,
          y,
          selectedText: '',
          canNavigate: hasSingleWordSelection(editor),
        });
        mobileLongPressRef.current = null;
      }, 520),
    };
  }, [clearMobileLongPress, editorRef, mobileSelectionMode, showMobileReadonlyOverlay]);

  const handleMobileContainerPointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!showMobileReadonlyOverlay) return;
    if (mobileReadonlyMenuRef.current?.contains(event.target as Node)) return;
    setMobileReadonlyMenu(null);
    handleMobileReadonlyPointerDown(event);
  }, [handleMobileReadonlyPointerDown, showMobileReadonlyOverlay]);

  const handleMobileReadonlyPointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const longPress = mobileLongPressRef.current;
    if (!longPress) return;
    const moved = Math.hypot(event.clientX - longPress.x, event.clientY - longPress.y);
    if (moved > 10) {
      clearMobileLongPress();
    }
  }, [clearMobileLongPress]);

  const handleMobileReadonlyPointerEnd = useCallback(() => {
    clearMobileLongPress();
  }, [clearMobileLongPress]);

  const syncMobilePreSelection = useCallback((showMenu: boolean) => {
    if (!mobileSelectionMode) return;
    const selection = window.getSelection();
    const selectedText = selection?.toString() ?? '';
    if (!selectedText) {
      setMobileReadonlyMenu(null);
      return;
    }

    const pre = mobileSelectionPreRef.current;
    const range = selection?.rangeCount
      ? selection.getRangeAt(0)
      : null;
    if (pre && range && pre.contains(range.commonAncestorContainer)) {
      const beforeSelection = document.createRange();
      beforeSelection.selectNodeContents(pre);
      beforeSelection.setEnd(range.startContainer, range.startOffset);

      const selectedRange = document.createRange();
      selectedRange.selectNodeContents(pre);
      selectedRange.setEnd(range.endContainer, range.endOffset);

      const startOffset = beforeSelection.toString().length;
      const endOffset = selectedRange.toString().length;
      const model = editorRef.current?.getModel();
      if (model) {
        const startPosition = model.getPositionAt(startOffset);
        const endPosition = model.getPositionAt(endOffset);
        editorRef.current?.setSelection({
          startLineNumber: startPosition.lineNumber,
          startColumn: startPosition.column,
          endLineNumber: endPosition.lineNumber,
          endColumn: endPosition.column,
        });
      }
    }

    if (!showMenu) return;
    const rect = range?.getBoundingClientRect();
    setMobileReadonlyMenu({
      x: rect ? rect.left + rect.width / 2 : window.innerWidth / 2,
      y: rect ? rect.bottom : window.innerHeight / 2,
      selectedText,
      canNavigate: hasSingleWordSelection(editorRef.current),
    });
  }, [editorRef, mobileSelectionMode]);

  const scheduleMobileSelectionMenu = useCallback(() => {
    clearMobileSelectionMenuTimer();
    setMobileReadonlyMenu(null);
    mobileSelectionMenuTimerRef.current = window.setTimeout(() => {
      mobileSelectionMenuTimerRef.current = null;
      syncMobilePreSelection(true);
    }, 1400);
  }, [clearMobileSelectionMenuTimer, syncMobilePreSelection]);

  const handleMobileSelectionContextMenu = useCallback((event: React.MouseEvent<HTMLPreElement>) => {
    if (!mobileSelectionMode) return;
    event.preventDefault();
    event.stopPropagation();
    scheduleMobileSelectionMenu();
  }, [mobileSelectionMode, scheduleMobileSelectionMenu]);

  const enterMobileSelectionMode = useCallback(() => {
    const editor = editorRef.current;
    if (editor && monacoRef.current) {
      const layout = editor.getLayoutInfo();
      const fontInfo = editor.getOption(monacoRef.current.editor.EditorOption.fontInfo);
      setMobileSelectionPreMetrics({
        scrollLeft: editor.getScrollLeft(),
        scrollTop: editor.getScrollTop(),
        contentLeft: layout.contentLeft,
        contentRight: Math.max(0, layout.width - layout.contentLeft - layout.contentWidth),
        fontFamily: fontInfo.fontFamily,
        fontWeight: fontInfo.fontWeight,
        fontSize: fontInfo.fontSize,
        lineHeight: fontInfo.lineHeight,
        letterSpacing: fontInfo.letterSpacing,
        fontFeatureSettings: fontInfo.fontFeatureSettings,
        fontVariationSettings: fontInfo.fontVariationSettings,
      });
    } else {
      setMobileSelectionPreMetrics(null);
    }
    setMobileSelectionMode(true);
    setMobileReadonlyMenu(null);
  }, [editorRef, monacoRef]);

  const copyMobileSelection = useCallback(async () => {
    const text = mobileReadonlyMenu?.selectedText || activeContent;
    if (!text) return;
    await copyToClipboard(text);
    toast.success(mobileReadonlyMenu?.selectedText ? '已复制选中文本' : '已复制代码');
    closeMobileSelectionMode();
  }, [activeContent, closeMobileSelectionMode, mobileReadonlyMenu]);

  const runMobileBuiltinAction = useCallback((actionId: string) => {
    const editor = editorRef.current;
    const action = monacoBuiltinActions.find((item) => item.id === actionId);
    if (!editor || !action) return;
    action.run(editor, { workspaceId, workspaceRoot });
    closeMobileSelectionMode();
  }, [closeMobileSelectionMode, editorRef, workspaceId, workspaceRoot]);

  const runMobileEditorAction = useCallback((actionId: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.getSelection();
    const position = selection?.getStartPosition() ?? editor.getPosition();
    setMobileReadonlyMenu(null);
    clearMobileMonacoSelectionMenuTimer();
    suppressMobileSelectionMenuRef.current = true;
    pendingNavigationSelectionCleanupRef.current = true;
    allowMobileEditorFocusRef.current = true;
    if (position) {
      editor.setSelections([{
        selectionStartLineNumber: position.lineNumber,
        selectionStartColumn: position.column,
        positionLineNumber: position.lineNumber,
        positionColumn: position.column,
      }], 'agentSpaces.mobileContextMenu');
      editor.setPosition(position);
    }
    editor.focus();
    requestAnimationFrame(() => {
      editor.trigger('agentSpaces.mobileContextMenu', actionId, undefined);
      for (const delay of [250, 700, 1200]) {
        window.setTimeout(() => {
          collapseEditorSelection(editorRef.current);
          setMobileReadonlyMenu(null);
        }, delay);
      }
      window.setTimeout(() => {
        collapseEditorSelection(editorRef.current);
        setMobileReadonlyMenu(null);
        allowMobileEditorFocusRef.current = false;
        suppressMobileSelectionMenuRef.current = false;
        pendingNavigationSelectionCleanupRef.current = false;
        blurEditorActiveElement(editorRef.current);
      }, 1600);
    });
  }, [clearMobileMonacoSelectionMenuTimer, editorRef]);

  // Effects

  useEffect(() => {
    if (!showMobileReadonlyOverlay) {
      closeMobileSelectionMode();
      clearMobileLongPress();
    }
  }, [clearMobileLongPress, closeMobileSelectionMode, showMobileReadonlyOverlay]);

  useEffect(() => {
    if (!mobileSelectionMode) return;

    const handleSelectionChange = () => {
      window.setTimeout(() => {
        syncMobilePreSelection(false);
        scheduleMobileSelectionMenu();
      }, 0);
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [mobileSelectionMode, scheduleMobileSelectionMenu, syncMobilePreSelection]);

  useEffect(() => {
    if (!mobileSelectionMode) return;
    const pre = mobileSelectionPreRef.current;
    if (!pre || !mobileSelectionPreMetrics) return;
    pre.scrollLeft = mobileSelectionPreMetrics.scrollLeft;
    pre.scrollTop = mobileSelectionPreMetrics.scrollTop;
  }, [mobileSelectionMode, mobileSelectionPreMetrics]);

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !showMobileReadonlyOverlay || mobileSelectionMode) {
      clearMobileMonacoSelectionMenuTimer();
      return;
    }

    const disposable = editor.onDidChangeCursorSelection(() => {
      clearMobileMonacoSelectionMenuTimer();
      if (suppressMobileSelectionMenuRef.current) {
        setMobileReadonlyMenu(null);
        return;
      }
      if (!hasSingleWordSelection(editor)) {
        setMobileReadonlyMenu((menu) => (menu?.canNavigate ? null : menu));
        return;
      }

      mobileMonacoSelectionMenuTimerRef.current = window.setTimeout(() => {
        mobileMonacoSelectionMenuTimerRef.current = null;
        const menuState = getSingleWordSelectionMenuState(editor);
        if (menuState) {
          setMobileReadonlyMenu(menuState);
        }
      }, 500);
    });

    return () => {
      disposable.dispose();
      clearMobileMonacoSelectionMenuTimer();
    };
  }, [clearMobileMonacoSelectionMenuTimer, editorReadyTick, editorRef, mobileSelectionMode, showMobileReadonlyOverlay]);

  const pendingNavigationSelectionCleanup = pendingNavigationSelectionCleanupRef;

  return {
    showMobileReadonlyOverlay,
    mobileSelectionMode,
    mobileReadonlyMenu,
    mobileSelectionPreMetrics,
    mobileSelectionPreRef,
    mobileReadonlyMenuRef,
    pendingNavigationSelectionCleanup,
    containerProps: {
      onContextMenuCapture: handleMobileReadonlyContextMenu,
      onFocusCapture: handleMobileReadonlyFocus,
      onPointerDownCapture: handleMobileContainerPointerDown,
      onPointerMoveCapture: handleMobileReadonlyPointerMove,
      onPointerUpCapture: handleMobileReadonlyPointerEnd,
      onPointerCancelCapture: handleMobileReadonlyPointerEnd,
    },
    enterMobileSelectionMode,
    closeMobileSelectionMode,
    copyMobileSelection,
    runMobileEditorAction,
    runMobileBuiltinAction,
    handleMobileSelectionContextMenu,
  };
}
