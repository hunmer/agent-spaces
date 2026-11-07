import type * as Monaco from 'monaco-editor';

export interface MobileReadonlyMenuState {
  x: number;
  y: number;
  selectedText: string;
  canNavigate?: boolean;
}

export interface MobileLongPressState {
  x: number;
  y: number;
  timer: number;
}

export interface MobileSelectionPreMetrics {
  scrollLeft: number;
  scrollTop: number;
  contentLeft: number;
  contentRight: number;
  fontFamily: string;
  fontWeight: string;
  fontSize: number;
  lineHeight: number;
  letterSpacing: number;
  fontFeatureSettings: string;
  fontVariationSettings: string;
}

export function blurEditorActiveElement(editor: Monaco.editor.IStandaloneCodeEditor | null) {
  const editorNode = editor?.getDomNode();
  const activeElement = document.activeElement;
  if (editorNode && activeElement instanceof HTMLElement && editorNode.contains(activeElement)) {
    activeElement.blur();
  }
}

export function hasSingleWordSelection(editor: Monaco.editor.IStandaloneCodeEditor | null) {
  const model = editor?.getModel();
  const selection = editor?.getSelection();
  if (!model || !selection || selection.isEmpty()) return false;
  if (selection.startLineNumber !== selection.endLineNumber) return false;

  const selectedText = model.getValueInRange(selection);
  if (!selectedText || /\s/.test(selectedText)) return false;

  const word = model.getWordAtPosition({
    lineNumber: selection.startLineNumber,
    column: selection.startColumn,
  });
  if (!word || word.word !== selectedText) return false;

  return selection.startColumn === word.startColumn && selection.endColumn === word.endColumn;
}

export function getSingleWordSelectionMenuState(editor: Monaco.editor.IStandaloneCodeEditor | null): MobileReadonlyMenuState | null {
  const model = editor?.getModel();
  const selection = editor?.getSelection();
  const editorNode = editor?.getDomNode();
  if (!editor || !model || !selection || !editorNode || !hasSingleWordSelection(editor)) return null;

  const visiblePosition = editor.getScrolledVisiblePosition({
    lineNumber: selection.endLineNumber,
    column: selection.endColumn,
  });
  const editorRect = editorNode.getBoundingClientRect();
  const selectedText = model.getValueInRange(selection);

  return {
    x: visiblePosition ? editorRect.left + visiblePosition.left : editorRect.left + editorRect.width / 2,
    y: visiblePosition ? editorRect.top + visiblePosition.top + visiblePosition.height : editorRect.top + editorRect.height / 2,
    selectedText,
    canNavigate: true,
  };
}

export function collapseEditorSelection(editor: Monaco.editor.IStandaloneCodeEditor | null) {
  const position = editor?.getPosition();
  if (!editor || !position) return;
  editor.setSelections([{
    selectionStartLineNumber: position.lineNumber,
    selectionStartColumn: position.column,
    positionLineNumber: position.lineNumber,
    positionColumn: position.column,
  }], 'agentSpaces.mobileContextMenu');
}
