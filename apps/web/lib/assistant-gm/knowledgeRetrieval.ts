import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { basename, join, relative } from 'node:path';

export type KnowledgeRetrievalResult = {
  source: string;
  title: string;
  score: number;
  excerpt: string;
};

function knowledgeRoot() {
  const candidates = [
    join(process.cwd(), 'docs', 'assistant-gm', 'knowledge-base'),
    join(process.cwd(), '..', '..', 'docs', 'assistant-gm', 'knowledge-base')
  ];
  const found = candidates.find(existsSync);
  if (!found) throw new Error('Front Office Advisor knowledge base not found.');
  return found;
}

function markdownTitle(source: string, text: string) {
  return text.split('\n').find(line => line.startsWith('# '))?.replace(/^#\s+/, '').trim() || basename(source, '.md');
}

function tokenize(query: string) {
  return query
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter(term => term.length >= 3);
}

function files(root: string) {
  const faqDir = join(root, 'faq');
  return [
    join(root, '00_READ_THIS_FIRST.md'),
    join(root, '01_ROUTING_INDEX.md'),
    ...readdirSync(faqDir)
      .filter(name => name.endsWith('.md'))
      .sort()
      .map(name => join(faqDir, name))
  ];
}

function excerptFor(text: string, terms: string[]) {
  const normalized = text.replace(/\s+/g, ' ').trim();
  const lower = normalized.toLowerCase();
  const index = terms.map(term => lower.indexOf(term)).filter(value => value >= 0).sort((a, b) => a - b)[0] ?? 0;
  const start = Math.max(0, index - 140);
  return normalized.slice(start, start + 420);
}

export function searchAssistantGmKnowledgeBase(query: string, limit = 5): KnowledgeRetrievalResult[] {
  const terms = tokenize(query);
  if (!terms.length) return [];
  const root = knowledgeRoot();

  return files(root)
    .map(file => {
      const text = readFileSync(file, 'utf8');
      const lower = text.toLowerCase();
      const score = terms.reduce((sum, term) => {
        const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return sum + (lower.match(new RegExp(`\\b${escaped}`, 'g'))?.length ?? 0);
      }, 0);
      return {
        source: relative(join(root, '..', '..', '..'), file),
        title: markdownTitle(file, text),
        score,
        excerpt: excerptFor(text, terms)
      };
    })
    .filter(result => result.score > 0)
    .sort((a, b) => b.score - a.score || a.source.localeCompare(b.source))
    .slice(0, Math.max(1, Math.min(limit, 8)));
}
