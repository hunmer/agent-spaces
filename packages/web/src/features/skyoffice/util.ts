/** 把 sessionId 等含特殊字符的字符串清理为安全的 key（字母数字）。 */
export function sanitizeId(id: string): string {
  let sanitized = id
  if (sanitized.length > 9 && sanitized.endsWith('-ss')) {
    sanitized = sanitized.substring(0, sanitized.length - 3)
  }
  return sanitized.replace(/[^0-9a-z]/gi, 'G')
}

const colorArr = [
  '#7bf1a8', '#ff7e50', '#9acd32', '#daa520',
  '#ff69b4', '#c085f6', '#1e90ff', '#5f9da0',
]

/** 由字符串稳定地取一个颜色（头像背景色）。 */
export function getColorByString(string: string): string {
  return colorArr[Math.floor(string.charCodeAt(0) % colorArr.length)]
}

/** 取名字的首字母（单词取前两个单词首字母）作为头像 fallback 文本。 */
export function getAvatarString(name: string): string {
  const part = name.split(' ')
  return part.length < 2 ? part[0][0] : part[0][0] + part[1][0]
}
