import { create } from "zustand";

export interface ConfirmOptions {
  message: string;
  title?: string;
  /** 危险操作：确认按钮渲染为 destructive 变体 */
  destructive?: boolean;
  /** 确认按钮文案，默认用 common.confirm */
  action?: string;
  /** 取消按钮文案，默认用 common.cancel */
  cancel?: string;
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
  resolve?: (ok: boolean) => void;
  _open: (opts: ConfirmOptions, resolve: (ok: boolean) => void) => void;
  _close: (ok: boolean) => void;
}

/**
 * 全局确认弹窗 store。
 * 组件内：const confirmDialog = useConfirmDialog();
 * 组件外：直接 import { confirmDialog } 使用。
 * 返回 Promise<boolean>，可 await。
 */
export const useConfirmStore = create<ConfirmState>((set) => ({
  open: false,
  message: "",
  _open: (opts, resolve) => set({ ...opts, open: true, resolve }),
  _close: (ok) =>
    set((state) => {
      state.resolve?.(ok);
      return { open: false, resolve: undefined };
    }),
}));

/** 组件外 / 组件内均可调用的便利函数 */
export function confirmDialog(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => useConfirmStore.getState()._open(opts, resolve));
}
