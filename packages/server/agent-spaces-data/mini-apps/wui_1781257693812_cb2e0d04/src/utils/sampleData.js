// 批量导入用的示例数据，演示 db.transaction 的原子批量写入。
// 一条失败则整体回滚。
export const SAMPLE_SNIPPETS = [
  {
    title: '防抖函数 debounce',
    language: 'javascript',
    tags: 'utils,前端',
    code: 'function debounce(fn, wait = 200) {\n  let t;\n  return (...args) => {\n    clearTimeout(t);\n    t = setTimeout(() => fn(...args), wait);\n  };\n}',
  },
  {
    title: '快速排序',
    language: 'python',
    tags: '算法',
    code: 'def quicksort(a):\n    if len(a) < 2:\n        return a\n    pivot = a[0]\n    less = [x for x in a[1:] if x < pivot]\n    more = [x for x in a[1:] if x >= pivot]\n    return quicksort(less) + [pivot] + quicksort(more)',
  },
  {
    title: '类型安全的 fetch',
    language: 'typescript',
    tags: '网络,前端',
    code: 'async function getJson<T>(url: string): Promise<T> {\n  const res = await fetch(url);\n  if (!res.ok) throw new Error(`HTTP ${res.status}`);\n  return res.json() as Promise<T>;\n}',
  },
  {
    title: 'Flex 居中',
    language: 'css',
    tags: '布局,前端',
    code: '.center {\n  display: flex;\n  align-items: center;\n  justify-content: center;\n}',
  },
];
