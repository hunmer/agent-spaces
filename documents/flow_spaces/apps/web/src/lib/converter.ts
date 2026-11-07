export function htmlToMarkdown(html: string): string {
  if (!html) return '';
  if (typeof window !== 'undefined') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');

    const parseNode = (node: Node): string => {
      if (node.nodeType === Node.TEXT_NODE) return node.nodeValue || '';
      if (node.nodeType === Node.ELEMENT_NODE) {
        const el = node as HTMLElement;
        const tagName = el.tagName.toLowerCase();
        const content = Array.from(el.childNodes).map(parseNode).join('');
        switch (tagName) {
          case 'h1': return `\n# ${content}\n`;
          case 'h2': return `\n## ${content}\n`;
          case 'h3': return `\n### ${content}\n`;
          case 'h4': return `\n#### ${content}\n`;
          case 'p': return `\n${content}\n`;
          case 'strong': case 'b': return `**${content}**`;
          case 'em': case 'i': return `*${content}*`;
          case 's': case 'del': return `~~${content}~~`;
          case 'code':
            if (el.parentElement?.tagName.toLowerCase() === 'pre') return content;
            return `\`${content}\``;
          case 'pre': {
            const codeEl = el.querySelector('code');
            const lang = codeEl?.getAttribute('class')?.replace('language-', '') || '';
            const codeContent = codeEl ? codeEl.textContent || '' : el.textContent || '';
            return `\n\`\`\`${lang}\n${codeContent.trim()}\n\`\`\`\n`;
          }
          case 'blockquote': return `\n> ${content.replace(/\n/g, '\n> ')}\n`;
          case 'li': {
            if (el.hasAttribute('data-checked') || el.querySelector('input[type="checkbox"]')) {
              const checked = el.getAttribute('data-checked') === 'true' ||
                (el.querySelector('input[type="checkbox"]') as HTMLInputElement)?.checked;
              return `${checked ? '[x]' : '[ ]'} ${content}\n`;
            }
            return `${content}\n`;
          }
          case 'ul': {
            const items = Array.from(el.childNodes)
              .filter(n => n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).tagName.toLowerCase() === 'li')
              .map(n => `- ${parseNode(n)}`).join('');
            return `\n${items}`;
          }
          case 'ol': {
            let index = 1;
            const items = Array.from(el.childNodes)
              .filter(n => n.nodeType === Node.ELEMENT_NODE && (n as HTMLElement).tagName.toLowerCase() === 'li')
              .map(n => `${index++}. ${parseNode(n)}`).join('');
            return `\n${items}`;
          }
          case 'hr': return `\n---\n`;
          case 'br': return `\n`;
          default: return content;
        }
      }
      return '';
    };

    return Array.from(doc.body.childNodes).map(parseNode).join('')
      .replace(/\n{3,}/g, '\n\n').trim();
  }

  // Server fallback
  return html
    .replace(/<h1>(.*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h2>(.*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3>(.*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<p>(.*?)<\/p>/gi, '\n$1\n')
    .replace(/<strong>(.*?)<\/strong>/gi, '**$1**')
    .replace(/<em>(.*?)<\/em>/gi, '*$1*')
    .replace(/<code>(.*?)<\/code>/gi, '`$1`')
    .replace(/<blockquote>(.*?)<\/blockquote>/gi, '\n> $1\n')
    .replace(/<hr\s*\/?>/gi, '\n---\n')
    .replace(/<br\s*\/?>/gi, '\n').trim();
}

export function markdownToHtml(md: string): string {
  if (!md) return '';
  let html = md;

  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_, lang, content) =>
    `<pre><code class="language-${lang}">${escapeHtml(content.trim())}</code></pre>`
  );
  html = html.replace(/^---$/gm, '<hr />');

  const lines = html.split('\n');
  const result: string[] = [];
  let inUl = false, inOl = false, inQuote = false, inTaskList = false;

  const closeLists = () => {
    if (inUl) { result.push('</ul>'); inUl = false; }
    if (inOl) { result.push('</ol>'); inOl = false; }
    if (inTaskList) { result.push('</ul>'); inTaskList = false; }
  };
  const closeQuote = () => {
    if (inQuote) { result.push('</blockquote>'); inQuote = false; }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('>')) {
      closeLists();
      if (!inQuote) { result.push('<blockquote>'); inQuote = true; }
      result.push(`<p>${parseInline(trimmed.replace(/^>\s*/, ''))}</p>`);
    } else {
      closeQuote();
      if (trimmed.startsWith('# ')) { closeLists(); result.push(`<h1>${parseInline(trimmed.substring(2))}</h1>`); }
      else if (trimmed.startsWith('## ')) { closeLists(); result.push(`<h2>${parseInline(trimmed.substring(3))}</h2>`); }
      else if (trimmed.startsWith('### ')) { closeLists(); result.push(`<h3>${parseInline(trimmed.substring(4))}</h3>`); }
      else if (trimmed.startsWith('#### ')) { closeLists(); result.push(`<h4>${parseInline(trimmed.substring(5))}</h4>`); }
      else {
        const taskMatch = line.match(/^(\s*)-\s+\[([ x])\]\s+(.*)$/i);
        const ulMatch = line.match(/^(\s*)[-*]\s+(.*)$/);
        const olMatch = line.match(/^(\s*)\d+\.\s+(.*)$/);
        if (taskMatch) {
          if (inUl) { result.push('</ul>'); inUl = false; }
          if (inOl) { result.push('</ol>'); inOl = false; }
          if (!inTaskList) { result.push('<ul data-type="taskList">'); inTaskList = true; }
          const checked = taskMatch[2].toLowerCase() === 'x';
          result.push(`<li data-type="taskItem" data-checked="${checked}">${parseInline(taskMatch[3])}</li>`);
        } else if (ulMatch) {
          if (inTaskList) { result.push('</ul>'); inTaskList = false; }
          if (inOl) { result.push('</ol>'); inOl = false; }
          if (!inUl) { result.push('<ul>'); inUl = true; }
          result.push(`<li>${parseInline(ulMatch[2])}</li>`);
        } else if (olMatch) {
          if (inTaskList) { result.push('</ul>'); inTaskList = false; }
          if (inUl) { result.push('</ul>'); inUl = false; }
          if (!inOl) { result.push('<ol>'); inOl = true; }
          result.push(`<li>${parseInline(olMatch[2])}</li>`);
        } else if (trimmed === '') {
          closeLists(); closeQuote();
        } else if (line.includes('<pre>') || line.includes('</pre>') || line.includes('<code>') || line.includes('</code>')) {
          result.push(line);
        } else {
          closeLists(); closeQuote();
          result.push(`<p>${parseInline(line)}</p>`);
        }
      }
    }
  }
  closeLists(); closeQuote();
  return result.join('\n');
}

function parseInline(text: string): string {
  let r = escapeHtml(text);
  r = r.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  r = r.replace(/__(.*?)__/g, '<strong>$1</strong>');
  r = r.replace(/\*(.*?)\*/g, '<em>$1</em>');
  r = r.replace(/_(.*?)_/g, '<em>$1</em>');
  r = r.replace(/~~(.*?)~~/g, '<s>$1</s>');
  r = r.replace(/`(.*?)`/g, '<code>$1</code>');
  return r;
}

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
