import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
if (!scripts.length) throw new Error('index.html contains no inline script');
for (const [, source] of scripts) {
  // Compile only. Browser globals are intentionally not executed in Node.
  Function(source);
}
console.log(`index.html: ${scripts.length} inline script(s) parsed successfully`);
