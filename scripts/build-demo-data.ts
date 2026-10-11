import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { buildDemoBase, buildDemoSummary, isAuthored, KB_DIR, SUMMARY_FILE, walkDir } from './lib/demo';

// Derived files are rebuilt from scratch: delete them, then write the fresh set.
for (const rel of walkDir(KB_DIR).filter((p) => !isAuthored(p))) rmSync(path.join(KB_DIR, rel));
const base = await buildDemoBase();
for (const [rel, content] of base) {
  if (isAuthored(rel)) continue;
  mkdirSync(path.dirname(path.join(KB_DIR, rel)), { recursive: true });
  writeFileSync(path.join(KB_DIR, rel), content);
}
writeFileSync(SUMMARY_FILE, `${JSON.stringify(await buildDemoSummary(base), null, 2)}\n`);
const report = JSON.parse(base.get('.loam/lint-report.json') ?? '{}');
console.log(`Demo base rebuilt: ${base.size} files.`);
console.log(`Health: ${report.findings?.length} findings; context ${report.savings?.beforeTokens} → ${report.savings?.afterTokens} tokens (${report.savings?.percent}% less).`);
