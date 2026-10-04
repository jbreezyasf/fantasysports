// Announcement bodies are plain text with a small, safe set of formatting:
//   blank line        -> new paragraph
//   "## Heading"      -> a real heading
//   "- item"          -> list item
//   "**bold**"        -> strong text
// Everything else is escaped. There is no raw HTML, no links and no images in a body; the one
// link of an announcement is its separate `link` field.

export type Block =
  | { type: 'heading'; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'list'; items: string[] };

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[character] ?? character));
}

export function parseBody(body: string): Block[] {
  const blocks: Block[] = [];
  let paragraph: string[] = [];
  let list: string[] = [];
  const flush = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', text: paragraph.join(' ') });
    if (list.length) blocks.push({ type: 'list', items: list });
    paragraph = [];
    list = [];
  };
  for (const raw of body.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (!line) { flush(); continue; }
    if (line.startsWith('## ')) { flush(); blocks.push({ type: 'heading', text: line.slice(3).trim() }); continue; }
    if (line.startsWith('- ')) {
      if (paragraph.length) flush();
      list.push(line.slice(2).trim());
      continue;
    }
    if (list.length) flush();
    paragraph.push(line);
  }
  flush();
  return blocks;
}

// A bold run is split into parts: odd parts were inside ** **.
export function splitBold(text: string): Array<{ text: string; bold: boolean }> {
  return text.split(/\*\*([^*]+)\*\*/g).map((part, index) => ({ text: part, bold: index % 2 === 1 })).filter(part => part.text);
}

function inlineHtml(text: string, strongStyle: string) {
  return splitBold(text).map(part => (part.bold ? `<strong style="${strongStyle}">${escapeHtml(part.text)}</strong>` : escapeHtml(part.text))).join('');
}

function inlineText(text: string) {
  return splitBold(text).map(part => part.text).join('');
}

export type HtmlStyles = { heading: string; paragraph: string; list: string; item: string; strong: string };

export function bodyToHtml(body: string, styles: HtmlStyles) {
  return parseBody(body).map(block => {
    if (block.type === 'heading') return `<h2 style="${styles.heading}">${inlineHtml(block.text, styles.strong)}</h2>`;
    if (block.type === 'paragraph') return `<p style="${styles.paragraph}">${inlineHtml(block.text, styles.strong)}</p>`;
    return `<ul style="${styles.list}">${block.items.map(item => `<li style="${styles.item}">${inlineHtml(item, styles.strong)}</li>`).join('')}</ul>`;
  }).join('');
}

export function bodyToText(body: string) {
  return parseBody(body).map(block => {
    if (block.type === 'heading') return inlineText(block.text).toUpperCase();
    if (block.type === 'paragraph') return inlineText(block.text);
    return block.items.map(item => `- ${inlineText(item)}`).join('\n');
  }).join('\n\n');
}
