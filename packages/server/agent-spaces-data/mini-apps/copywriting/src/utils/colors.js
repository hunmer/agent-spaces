// 确定性浅色：基于种子（结果 id）推出稳定色相，高亮度低饱和，每次渲染颜色一致。
// 用于创作结果卡片的背景 / 边框 / 圆点。
export function softColorFromSeed(seed) {
  let hash = 0;
  const str = String(seed);
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  return {
    bg: `hsl(${hue} 75% 95%)`,
    border: `hsl(${hue} 55% 82%)`,
    dot: `hsl(${hue} 55% 55%)`,
  };
}
