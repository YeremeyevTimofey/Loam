#!/usr/bin/env node
// Writes README.md from docs/templates/README.md.tmpl. Addresses come from site.config.json and the numbers from the sample
// knowledge base's summary.json, so the README cannot disagree with the site or the product.
//   node scripts/readme.mjs           write README.md
//   node scripts/readme.mjs --check   fail if README.md is out of date
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { root, site } from './lib/site-node.mjs';

const summary = JSON.parse(readFileSync(path.join(root, 'apps/web/src/demo-data/summary.json'), 'utf8'));
const n = (x) => x.toLocaleString('en-US');
const values = {
  siteUrl: site.siteUrl,
  siteHost: site.host,
  githubUrl: site.githubUrl,
  githubOwner: site.github.owner,
  githubRepo: site.github.repo,
  downloadUrl: site.downloadUrl,
  releaseDownloadUrl: site.releaseDownloadUrl,
  npmPackage: site.npmPackage,
  npmUrl: site.npmUrl,
  processCount: String(summary.processes.length),
  readyCount: String(summary.numbers.readyCount),
  readyHours: String(summary.numbers.readyHours),
  typicalBefore: n(summary.numbers.typicalBefore),
  typicalAfter: n(summary.numbers.typicalAfter),
  typicalPercent: String(summary.numbers.typicalPercent),
};

const template = readFileSync(path.join(root, 'docs/templates/README.md.tmpl'), 'utf8');
const missing = new Set();
const out = template.replace(/\{\{(\w+)\}\}/g, (m, key) => {
  if (!(key in values)) missing.add(key);
  return values[key] ?? m;
});
if (missing.size) {
  console.error(`README template uses unknown placeholders: ${[...missing].join(', ')}`);
  process.exit(1);
}

const target = path.join(root, 'README.md');
if (process.argv.includes('--check')) {
  if (readFileSync(target, 'utf8') !== out) {
    console.error('README.md is out of date. Run `npm run readme`.');
    process.exit(1);
  }
  console.log('README.md is up to date.');
} else {
  writeFileSync(target, out);
  console.log('README.md written.');
}
