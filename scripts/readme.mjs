#!/usr/bin/env node
// Writes README.md and llms-install.md (twice: for GitHub and for the site) from docs/templates/*.tmpl. Addresses come from site.config.json and the numbers
// from the sample knowledge base's summary.json, so neither file can disagree with the site or the product.
//   node scripts/readme.mjs           write the files
//   node scripts/readme.mjs --check   fail if one of them is out of date
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { root, site } from './lib/site-node.mjs';

const summary = JSON.parse(readFileSync(path.join(root, 'apps/web/src/demo-data/summary.json'), 'utf8'));
const n = (x) => x.toLocaleString('en-US');
// The "Add to Cursor" button. GitHub drops cursor:// links from a README, so it goes through Cursor's https address. The folder
// is ~/Loam (the server expands "~"); other folders and Windows are set up from the app's Connect screen.
const cursorServer = JSON.stringify({ command: 'npx', args: ['-y', site.npmPackage, '--folder', '~/Loam'] });
const values = {
  cursorInstallUrl: `https://cursor.com/install-mcp?name=loam&config=${encodeURIComponent(Buffer.from(cursorServer).toString('base64'))}`,
  appUrl: site.appUrl,
  installUrl: site.installUrl,
  llmsInstallUrl: site.llmsInstallUrl,
  siteUrl: site.siteUrl,
  siteHost: site.host,
  githubUrl: site.githubUrl,
  issuesUrl: site.issuesUrl,
  releasesUrl: site.releasesUrl,
  securityUrl: site.securityUrl,
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

const FILES = [
  { template: 'docs/templates/README.md.tmpl', target: 'README.md' },
  { template: 'docs/templates/llms-install.md.tmpl', target: 'llms-install.md' },
  // The same text, served by the site at /llms-install.md: the message a person sends their agent points there.
  { template: 'docs/templates/llms-install.md.tmpl', target: 'apps/web/public/llms-install.md' },
];

const missing = new Set();
const render = (templatePath) =>
  readFileSync(path.join(root, templatePath), 'utf8').replace(/\{\{(\w+)\}\}/g, (m, key) => {
    if (!(key in values)) missing.add(`${templatePath}: ${key}`);
    return values[key] ?? m;
  });
const outputs = FILES.map((f) => ({ ...f, out: render(f.template) }));
if (missing.size) {
  console.error(`A template uses unknown placeholders: ${[...missing].join(', ')}`);
  process.exit(1);
}

if (process.argv.includes('--check')) {
  const stale = outputs.filter((f) => !existsSync(path.join(root, f.target)) || readFileSync(path.join(root, f.target), 'utf8') !== f.out);
  if (stale.length) {
    console.error(`${stale.map((f) => f.target).join(' and ')} ${stale.length === 1 ? 'is' : 'are'} out of date. Run \`npm run readme\`.`);
    process.exit(1);
  }
  console.log(`${FILES.map((f) => f.target).join(' and ')} are up to date.`);
} else {
  for (const f of outputs) writeFileSync(path.join(root, f.target), f.out);
  console.log(`${FILES.map((f) => f.target).join(' and ')} written.`);
}
