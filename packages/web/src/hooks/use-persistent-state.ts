'use client';

import { useState, type Dispatch, type SetStateAction } from 'react';

/**
 * 同 useState，但当 key 非空时会把值同步持久化到 localStorage，并在初始化时恢复。
 *
 * - 传入 undefined key 时完全等价于 useState（用于不需要持久化的场景，如选择弹窗）。
 * - SSR 安全：服务端渲染阶段忽略 localStorage，直接使用 initialValue。
 * - 容错：localStorage 读取/解析失败时回退到 initialValue，不抛错。
 */
export function usePersistentState<T>(
  key: string | undefined,
  initialValue: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    if (!key || typeof window === 'undefined') return initialValue;
    try {
      const raw = window.localStorage.getItem(key);
      if (raw == null) return initialValue;
      return JSON.parse(raw) as T;
    } catch {
      return initialValue;
    }
  });

  if (!key) {
    return [value, setValue];
  }

  const setAndPersist: Dispatch<SetStateAction<T>> = (next) => {
    setValue((prev) => {
      const resolved = next instanceof Function ? next(prev) : next;
      try {
        window.localStorage.setItem(key, JSON.stringify(resolved));
      } catch {
        /* 忽略写入失败（配额/隐私模式） */
      }
      return resolved;
    });
  };

  return [value, setAndPersist];
}
