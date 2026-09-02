import axe from 'axe-core';
import { JSDOM } from 'jsdom';

type AxeRunOptions = Parameters<typeof axe.run>[1];

export type AxeViolation = {
  id: string;
  impact: string | null;
  description: string;
  nodes: string[];
};

export async function runAxeOnHtml(html: string, options?: AxeRunOptions): Promise<AxeViolation[]> {
  const dom = new JSDOM(
    `<!doctype html><html lang="en"><head><title>Accessibility Test Fixture</title></head><body>${html}</body></html>`,
    { runScripts: 'outside-only' }
  );
  const runOptions = {
    ...options,
    rules: {
      'color-contrast': { enabled: false },
      ...options?.rules
    }
  };

  dom.window.eval(axe.source);
  const result: axe.AxeResults = await dom.window.axe.run(dom.window.document, runOptions);

  return result.violations.map((violation) => ({
    id: violation.id,
    impact: violation.impact ?? null,
    description: violation.description,
    nodes: violation.nodes.map((node) => node.target.join(' '))
  }));
}

export async function expectNoAxeViolations(html: string, options?: AxeRunOptions) {
  const violations = await runAxeOnHtml(html, options);

  if (violations.length > 0) {
    throw new Error(
      violations
        .map((violation) => `${violation.id}: ${violation.description} (${violation.nodes.join(', ')})`)
        .join('\n')
    );
  }
}
