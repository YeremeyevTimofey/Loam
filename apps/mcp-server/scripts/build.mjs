import { build } from 'esbuild';
import { mkdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
mkdirSync(path.join(root, 'dist/server'), { recursive: true });
const version = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8')).version;

await build({
  entryPoints: [path.join(root, 'src/index.ts')],
  outfile: path.join(root, 'dist/server/index.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // The native module is shipped next to the bundle (see pack.mjs) and loaded lazily.
  external: ['better-sqlite3'],
  // Some bundled CommonJS packages call require() for Node built-ins.
  // The first line makes the file runnable as a command (npx loam-mcp). The second gives bundled CommonJS code require().
  banner: { js: "#!/usr/bin/env node\nimport { createRequire as __loamRequire } from 'node:module'; const require = __loamRequire(import.meta.url);" },
  define: { 'process.env.LOAM_VERSION': JSON.stringify(version) },
  legalComments: 'none',
  // gray-matter contains an eval-based JavaScript front-matter engine. Loam replaces every engine
  // except YAML at runtime (packages/loam-core/src/frontmatter.ts), so it is dead code.
  logOverride: { 'direct-eval': 'silent' },
  logLevel: 'info',
});
