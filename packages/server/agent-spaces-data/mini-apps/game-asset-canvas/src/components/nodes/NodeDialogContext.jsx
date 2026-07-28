import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import PromptPickerDialog from '../PromptPickerDialog';
import PromptOptimizeDialog from '../PromptOptimizeDialog';

/**
 * 节点 Dialog 统一管理：把 PromptPickerDialog / PromptOptimizeDialog 提升到 Canvas 层，
 * 脱离 NodeShell 分支（避免预览态切换卸载 children 导致 Dialog 消失）。
 *
 * 节点不再自己渲染 Dialog，而是调用 useNodeDialog().openPicker(opts) / openOptimize(opts)。
 * onPick / onApply 回调由节点传入闭包（保留各节点特殊写入逻辑）。
 */
const NodeDialogContext = createContext(null);

export function useNodeDialog() {
  const ctx = useContext(NodeDialogContext);
  if (!ctx) throw new Error('useNodeDialog 必须在 NodeDialogProvider 内使用');
  return ctx;
}

export function NodeDialogProvider({ children }) {
  // picker: { open, scene, onPick, onClose } | null
  const [picker, setPicker] = useState(null);
  // optimize: { open, prompt, agentConfig, onApply, onClose } | null
  const [optimize, setOptimize] = useState(null);

  const openPicker = useCallback((opts) => {
    setPicker({ open: true, scene: opts.scene || 'text', onPick: opts.onPick });
  }, []);

  const closePicker = useCallback(() => {
    setPicker((prev) => (prev ? { ...prev, open: false } : null));
    // 动画结束后清理（Radix onAnimationEnd 兜底在 PromptPickerDialog 的 onOpenChange 处理）
    setTimeout(() => setPicker(null), 300);
  }, []);

  const openOptimize = useCallback((opts) => {
    setOptimize({
      open: true,
      prompt: opts.prompt || '',
      agentConfig: opts.agentConfig,
      onApply: opts.onApply,
    });
  }, []);

  const closeOptimize = useCallback(() => {
    setOptimize((prev) => (prev ? { ...prev, open: false } : null));
    setTimeout(() => setOptimize(null), 300);
  }, []);

  const value = useMemo(
    () => ({ openPicker, openOptimize, closePicker, closeOptimize }),
    [openPicker, openOptimize, closePicker, closeOptimize],
  );

  return (
    <NodeDialogContext.Provider value={value}>
      {children}
      {/* Dialog 提升到 Provider 层，渲染一次，不受节点分支切换影响 */}
      {picker && (
        <PromptPickerDialog
          open={picker.open}
          scene={picker.scene}
          onClose={closePicker}
          onPick={(item) => {
            picker.onPick?.(item);
            closePicker();
          }}
        />
      )}
      {optimize && (
        <PromptOptimizeDialog
          open={optimize.open}
          prompt={optimize.prompt}
          agentConfig={optimize.agentConfig}
          onClose={closeOptimize}
          onApply={(newPrompt) => {
            optimize.onApply?.(newPrompt);
            closeOptimize();
          }}
        />
      )}
    </NodeDialogContext.Provider>
  );
}
