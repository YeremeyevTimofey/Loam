#!/usr/bin/env node
// Static checks for the rules of the spec that code review would otherwise have to remember (§0, §12C, §15, §16).
// Each rule names the acceptance criterion it backs. Run with `npm run check:rules`.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const rel = (p) => path.relative(root, p).split(path.sep).join('/');
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    if (['node_modules', 'dist', '.vite', 'coverage'].includes(name)) return [];
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
const read = (p) => readFileSync(p, 'utf8');
const stripComments = (code) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1').replace(/<!--[\s\S]*?-->/g, '');

import { execFileSync } from 'node:child_process';
import { site } from './lib/site-node.mjs';

const failures = [];
let checks = 0;
const rule = (name, backs, violations) => {
  checks += 1;
  if (violations.length) failures.push({ name, backs, violations });
  console.log(`${violations.length ? '✗' : '✓'} ${name}  [${backs}]`);
};
const scan = (files, test) => files.flatMap((f) => {
  const code = read(f);
  return test(code, f).map((hit) => `${rel(f)}: ${hit}`);
});
const grep = (code, re) => [...code.matchAll(re)].map((m) => m[0].slice(0, 80));

const under = (dir, exts) => (existsSync(path.join(root, dir)) ? walk(path.join(root, dir)).filter((f) => exts.some((e) => f.endsWith(e))) : []);
const webSrc = under('apps/web/src', ['.ts', '.tsx', '.css']).filter((f) => !/demo-data|starter-skills/.test(f));
const appCode = under('apps/web/src/app', ['.ts', '.tsx']);
const coreCode = under('packages/loam-core/src', ['.ts']);
const serverCode = under('apps/mcp-server/src', ['.ts']);
const allProductCode = [...appCode, ...coreCode, ...serverCode];

// --- §12C / acceptance 6: colours live in tokens.css only
rule('no hard-coded colours outside tokens.css', '6', scan(
  [...webSrc.filter((f) => !f.endsWith('tokens.css')), ...['index.html', 'install.html', 'app/index.html'].map((f) => path.join(root, 'apps/web', f))],
  (code, f) => grep(code.split('\n').filter((l) => !/theme-color/.test(l)).join('\n'), /#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])|\brgba?\(|\bhsla?\(|\boklch\(|\bcolor\(/g),
));

// --- acceptance 4: the File System Access API is used by FsStore only
rule('File System Access API only inside store/', '4', scan(
  appCode.filter((f) => !rel(f).startsWith('apps/web/src/app/store/')),
  (code) => grep(stripComments(code), /showDirectoryPicker|FileSystemDirectoryHandle|FileSystemFileHandle|getDirectoryHandle|getFileHandle|createWritable|requestPermission|queryPermission/g),
));

// --- §15 / acceptance 28: no outgoing network calls anywhere in the product
// scanner.ts is exempt: it lists these words as patterns to detect in other people's skills; it calls none of them.
rule('no network calls in the app, the MCP server or the core', '28', scan(
  allProductCode.filter((f) => !f.endsWith('loam-core/src/scanner.ts')),
  (code) => grep(stripComments(code), /\bfetch\s*\(|XMLHttpRequest|\bWebSocket\b|EventSource|sendBeacon|node:(https?|net|dgram|dns|tls|http2)\b|require\(['"](https?|net|dgram|dns|tls)['"]\)|child_process|\bnavigator\.connection\b/g),
));
const URL_ALLOWED = new Set(['apps/web/src/app/lib/links.ts', 'packages/loam-core/src/constants.ts']);
rule('URLs in code are only links shown to people (allow-listed files)', '28', scan(
  allProductCode.filter((f) => !URL_ALLOWED.has(rel(f))),
  (code) => grep(stripComments(code), /https?:\/\/[^\s'"`)]+/g),
));

// The same promise, checked on what is actually shipped (needs `npm run build`).
const dist = path.join(root, 'apps/web/dist');
const shipped = existsSync(dist) ? walk(dist).filter((f) => f.endsWith('.js')) : [];
rule('built files make no requests: no fetch, WebSocket, EventSource or beacon', '28', shipped.length === 0 ? ['apps/web/dist is missing (run `npm run build`)'] : scan(
  shipped,
  (code) => grep(code, /\bfetch\(|new WebSocket\(|new EventSource\(|sendBeacon\(/g),
));

// --- §0 / §15: no storage of user data outside their folder, no cookies, no accounts
rule('no localStorage, sessionStorage or cookies', '§0', scan(appCode, (code) => grep(stripComments(code), /localStorage|sessionStorage|document\.cookie|indexedDB\.open/g)));

// --- acceptance 38 / §15: analytics on / and /install only, never in /app
const html = (f) => read(path.join(root, 'apps/web', f));
const ANALYTICS = /plausible|cloudflareinsights|googletagmanager|google-analytics|gtag\(|matomo|segment\.|mixpanel|hotjar/i;
rule('no analytics in the app (entry page and source)', '38', [
  ...(ANALYTICS.test(stripComments(html('app/index.html'))) ? ['apps/web/app/index.html'] : []),
  ...scan(appCode, (code) => (ANALYTICS.test(stripComments(code)) ? ['mentions an analytics service'] : [])),
]);
const rendered = (f) => (existsSync(path.join(root, 'apps/web/dist', f)) ? read(path.join(root, 'apps/web/dist', f)) : null);
rule('analytics script present on / and /install (rendered pages)', '38', ['index.html', 'install.html'].filter((f) => {
  const page = rendered(f);
  return page === null || !new RegExp(`<script defer data-domain="${site.analytics.domain.replace(/\./g, '\\.')}" src="${site.analytics.script.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}"`).test(page);
}));
rule('analytics is the only external resource on the landing page and /install (rendered pages)', '33', ['index.html', 'install.html'].flatMap((f) => {
  const page = rendered(f);
  if (page === null) return [`${f}: apps/web/dist is missing (run \`npm run build\`)`];
  return [...stripComments(page).matchAll(/<(script|link|img|iframe|source|video|audio)\b[^>]*\b(?:src|href)="(https?:)?\/\/([^"/]+)[^"]*"[^>]*>/g)]
    .filter((m) => !(m[1] === 'link' && /rel="(canonical|alternate)"/.test(m[0])) && m[3] !== new URL(site.analytics.origin).host)
    .map((m) => `${f}: ${m[0].slice(0, 90)}`);
}));
rule('no placeholder was left unfilled in the built pages, _headers or _redirects', '§15', ['index.html', 'install.html', '404.html', '_headers', '_redirects'].flatMap((f) => {
  const text = rendered(f);
  return text === null ? [`${f}: missing (run \`npm run build\`)`] : (text.match(/\{\{\w+\}\}/g) ?? []).map((m) => `${f}: ${m}`);
}));
rule('no external fonts, scripts, stylesheets or images referenced from CSS or TS', '§0', scan(
  [...webSrc, ...under('apps/web/src/styles', ['.css'])],
  (code) => grep(code, /@import\s+url\(\s*['"]?https?:|url\(\s*['"]?https?:|fonts\.googleapis|fonts\.gstatic|cdn\.|unpkg\.com|jsdelivr/g),
));
rule('the app page ships a Content-Security-Policy that blocks connections', '§15', existsSync(path.join(root, 'apps/web/dist/app/index.html')) && /connect-src &#39;none&#39;|connect-src 'none'/.test(read(path.join(root, 'apps/web/dist/app/index.html'))) ? [] : ['dist/app/index.html has no connect-src \'none\' (run `npm run build` first)']);

// --- acceptance 12: tool names
rule('every MCP tool is called loam_*', '12', scan(under('apps/mcp-server/src', ['.ts']), (code) =>
  [...code.matchAll(/\bname:\s*'([a-z_]+)',\s*\n\s*title:/g)].map((m) => m[1]).filter((n) => !n.startsWith('loam_')),
));
rule('the manifest advertises only loam_* tools', '12', JSON.parse(read(path.join(root, 'apps/mcp-server/manifest.json'))).tools.map((t) => t.name).filter((n) => !n.startsWith('loam_')));

// --- acceptance 25 / §14.5: a review verdict never decides access
const VERDICT_OK = new Set([
  'packages/loam-core/src/schema.ts', 'packages/loam-core/src/skills.ts', 'packages/loam-core/src/ops-skills.ts', 'packages/loam-core/src/lint.ts',
  'apps/web/src/app/screens/Skills.tsx', 'apps/web/src/app/components/SkillDialogs.tsx',
]);
rule('review verdicts are only recorded and shown, never used for access', '25', scan(
  [...allProductCode],
  (code, f) => (VERDICT_OK.has(rel(f)) ? [] : grep(stripComments(code), /review_verdict|\.reviewed\b/g)),
));
rule('the code says why a verdict grants nothing', '25', /must never be used as an access check/.test(read(path.join(root, 'packages/loam-core/src/ops-skills.ts'))) ? [] : ['comment missing in ops-skills.ts']);
rule('verdict and reviewed are not read inside the scanner, the write policy or the stores', '25', scan(
  ['scanner.ts', 'policy.ts', 'store-base.ts'].map((f) => path.join(root, 'packages/loam-core/src', f)).concat(under('apps/mcp-server/src', ['node-store.ts'])),
  (code) => grep(stripComments(code), /review_verdict|reviewed/g),
));

// --- §4.2: one scanner, one lint, in loam-core only
rule('the scanner and the lint rules exist only in loam-core', '§4.2', scan(
  [...appCode, ...serverCode],
  (code) => grep(stripComments(code), /ignore (all )?previous|BULK_READ|INCLUDE_CONTENTS|const RULES\b|function scanSkill|function runLint/g),
));

// --- §0: nothing added that the spec forbids
const pkg = (p) => JSON.parse(read(path.join(root, p)));
const forbidden = /openai|@anthropic-ai\/sdk|express|fastify|firebase|supabase|auth0|clerk|next-auth|axios|socket\.io|mixpanel|posthog|@sentry/;
rule('no LLM SDK, backend framework, auth or tracking dependency', '§0', ['apps/web/package.json', 'apps/mcp-server/package.json', 'packages/loam-core/package.json']
  .flatMap((p) => Object.keys({ ...pkg(p).dependencies, ...pkg(p).devDependencies }).filter((d) => forbidden.test(d)).map((d) => `${p}: ${d}`)));

// --- §7: writes are fenced
rule('writes outside the base are impossible: NodeStore checks real paths', '§7', /realpath/.test(read(path.join(root, 'apps/mcp-server/src/node-store.ts'))) && /normalizeRelPath/.test(read(path.join(root, 'packages/loam-core/src/store-base.ts'))) ? [] : ['path guard missing']);

// --- addresses live in site.config.json only
const ADDRESS_FILES = [
  ...under('apps/web/src', ['.ts', '.tsx']).filter((f) => !/demo-data|starter-skills/.test(f)),
  ...under('apps/mcp-server/src', ['.ts']),
  ...under('apps/mcp-server/scripts', ['.mjs']),
  ...under('packages/loam-core/src', ['.ts']).filter((f) => !f.endsWith('constants.ts')),
  ...['index.html', 'install.html', '404.html', 'app/index.html', '_headers.template'].map((f) => path.join(root, 'apps/web', f)),
  path.join(root, 'apps/mcp-server/manifest.json'),
];
rule('no domain, repository or package address typed outside site.config.json', '§0', scan(
  ADDRESS_FILES,
  (code) => grep(code, new RegExp(`github\\.com/${site.github.owner}|${site.host.replace(/\./g, '\\.')}|npmjs\\.com/package|plausible\\.io`, 'g')),
));
rule('the address the core quotes in messages matches the site address', '§0', new RegExp(`'${site.appUrl.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&')}'`).test(read(path.join(root, 'packages/loam-core/src/constants.ts'))) ? [] : [`APP_URL in constants.ts is not ${site.appUrl}`]);
const versions = ['package.json', 'apps/mcp-server/package.json', 'apps/mcp-server/manifest.json'].map((f) => [f, JSON.parse(read(path.join(root, f))).version]);
rule('the root, the server package and the extension manifest carry one version', '§0', new Set(versions.map(([, v]) => v)).size === 1 ? [] : versions.map(([f, v]) => `${f}: ${v}`));
rule('README.md is generated from its template and up to date', '§0', (() => {
  try {
    execFileSync('node', [path.join(root, 'scripts/readme.mjs'), '--check'], { stdio: 'pipe' });
    return [];
  } catch (error) {
    return [String(error.stderr ?? error.message).trim()];
  }
})());
rule('the server package name is the one in site.config.json', '§0', JSON.parse(read(path.join(root, 'apps/mcp-server/scripts/npm-pack.mjs').replace('npm-pack.mjs', '../package.json'))).name === '@loam/mcp-server' && /site\.npmPackage/.test(read(path.join(root, 'apps/mcp-server/scripts/npm-pack.mjs'))) ? [] : ['npm-pack.mjs does not use site.npmPackage']);

console.log(`\n${checks - failures.length}/${checks} rules hold.`);
if (failures.length) {
  for (const f of failures) {
    console.error(`\n✗ ${f.name} [${f.backs}]`);
    for (const v of f.violations.slice(0, 12)) console.error(`    ${v}`);
  }
  process.exit(1);
}
