import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { site } from '../../../scripts/lib/site-node.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '../..');
const stage = path.join(root, 'dist/mcpb');
const out = path.join(root, 'dist/loam.mcpb');
const run = (cmd, args, cwd = root) => execFileSync(cmd, args, { cwd, stdio: 'inherit' });

run('node', [path.join(root, 'scripts/build.mjs')]);

rmSync(stage, { recursive: true, force: true });
mkdirSync(path.join(stage, 'server'), { recursive: true });
cpSync(path.join(root, 'dist/server/index.mjs'), path.join(stage, 'server/index.mjs'));
cpSync(path.join(repo, 'LICENSE'), path.join(stage, 'LICENSE'));
const icon = path.join(repo, 'apps/web/public/icon-512.png');
if (existsSync(icon)) cpSync(icon, path.join(stage, 'icon.png'));

// Addresses come from site.config.json, so the extension and the site always agree.
const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
manifest.author = { name: manifest.author?.name ?? site.name, url: site.siteUrl };
manifest.homepage = site.siteUrl;
manifest.documentation = site.installUrl;
manifest.support = site.issuesUrl;
manifest.repository = { type: 'git', url: site.githubUrl };
// The description Claude Desktop shows below its install warning carries the same addresses.
manifest.long_description = manifest.long_description.replaceAll('{{githubUrl}}', site.githubUrl).replaceAll('{{installUrl}}', site.installUrl);
if (/\{\{\w+\}\}/.test(manifest.long_description)) throw new Error('manifest.json: an address placeholder in long_description was not filled');
if (existsSync(icon)) manifest.icon = 'icon.png';
writeFileSync(path.join(stage, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
writeFileSync(path.join(stage, 'package.json'), `${JSON.stringify({ name: 'loam', version: manifest.version, private: true, type: 'module', license: 'MIT' }, null, 2)}\n`);

// better-sqlite3 13 uses N-API and ships a prebuilt binary per platform, so one bundle works everywhere
// Claude Desktop runs. Only the desktop platforms are included to keep the download small.
const sqlite = path.dirname(path.join(repo, 'node_modules/better-sqlite3/package.json'));
const target = path.join(stage, 'node_modules/better-sqlite3');
for (const file of ['package.json', 'LICENSE']) cpSync(path.join(sqlite, file), path.join(target, file));
cpSync(path.join(sqlite, 'lib'), path.join(target, 'lib'), { recursive: true });
for (const platform of ['darwin-arm64', 'darwin-x64', 'win32-x64', 'win32-arm64']) {
  cpSync(path.join(sqlite, 'prebuilds', `${platform}.node`), path.join(target, 'prebuilds', `${platform}.node`));
}

run('npx', ['mcpb', 'validate', path.join(stage, 'manifest.json')], repo);
rmSync(out, { force: true });
run('npx', ['mcpb', 'pack', stage, out], repo);
console.log(`\nPacked ${path.relative(repo, out)} (${(statSync(out).size / 1e6).toFixed(1)} MB)`);
