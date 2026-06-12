'use client';

import React, { createContext, useContext, useCallback, useEffect, useMemo, useRef, useState } from 'react';

// ---- 路由状态类型 ----
export type RouteState = {
  path: string[];
  query: Record<string, string>;
};

// ---- 序列化：RouteState -> 字符串（如 /history?filter=done）----
// path 用 / 拼接（空数组 -> 空串 -> "/"）；query 非空时用 URLSearchParams 拼到后面。
export function serializeRoute(state: RouteState): string {
  const pathPart = '/' + state.path.map(encodeURIComponent).join('/');
  const entries = Object.entries(state.query || {}).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) return pathPart === '/' ? '' : pathPart;
  const qs = new URLSearchParams();
  for (const [k, v] of entries) qs.set(k, String(v));
  return `${pathPart}?${qs.toString()}`;
}

// ---- 解析：字符串 -> RouteState（容错，失败回退根路由）----
export function parseRoute(raw: string): RouteState {
  try {
    let s = (raw || '').trim();
    // 去掉前导 #（hash 形式）
    if (s.startsWith('#')) s = s.slice(1);
    // 去掉前导 ?（若整体是 query 形式如 route=/history?filter=done 解包后）
    if (s.startsWith('?')) s = s.slice(1);
    if (!s || s === '/') return { path: [], query: {} };
    if (!s.startsWith('/')) s = '/' + s;

    const [pathPart, queryPart] = s.split('?');
    const path = pathPart.split('/').filter(Boolean).map(decodeURIComponent);
    const query: Record<string, string> = {};
    if (queryPart) {
      const params = new URLSearchParams(queryPart);
      params.forEach((v, k) => { query[k] = v; });
    }
    return { path, query };
  } catch {
    return { path: [], query: {} };
  }
}

// ---- 规范化 path 输入：string | string[] -> string[] ----
function normalizePath(path: string | string[]): string[] {
  if (Array.isArray(path)) return path.filter((s) => s != null && s !== '').map(String);
  const s = String(path).trim();
  if (!s) return [];
  return s.split('/').filter(Boolean);
}

// ---- 规范化 query 输入：值非 string 时强转 ----
function normalizeQuery(query?: Record<string, unknown>): Record<string, string> {
  if (!query) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null) continue;
    out[k] = String(v);
  }
  return out;
}

// 仅 dev 自检，发布前可删（Task 6 会删）
if (typeof window !== 'undefined') {
  (window as any).__routeSelfTest = () => {
    const cases: Array<[RouteState, string]> = [
      [{ path: [], query: {} }, ''],
      [{ path: ['history'], query: {} }, '/history'],
      [{ path: ['history'], query: { filter: 'done' } }, '/history?filter=done'],
      [{ path: ['detail', '123'], query: {} }, '/detail/123'],
      [{ path: ['a b'], query: { x: '1 2' } }, '/a%20b?x=1+2'],
    ];
    for (const [state, expected] of cases) {
      const got = serializeRoute(state);
      const back = parseRoute(got);
      const okRoundtrip = got === '' ? back.path.length === 0 : JSON.stringify(back) === JSON.stringify(state);
      console.assert(got === expected, `serialize ${JSON.stringify(state)} -> "${got}" expected "${expected}"`);
      console.assert(okRoundtrip, `roundtrip ${JSON.stringify(state)} -> ${JSON.stringify(back)}`);
    }
    console.assert(JSON.stringify(parseRoute('garbage/../bad')) !== null, 'parse never throws');
    console.assert(parseRoute('').path.length === 0, 'empty -> root');
    console.log('route self-test done');
  };
}
