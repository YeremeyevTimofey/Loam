// Builds the npm package that every agent except Claude Desktop starts with `npx -y loam-mcp --folder <path>`.
// The server code is one bundled file; only the native SQLite module is a normal dependency (it ships prebuilt
// binaries inside the package, so nothing is compiled on the user's machine).
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { site } from '../../../scripts/lib/site-node.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '../..');
const stage = path.join(root, 'dist/npm');
const outDir = path.join(root, 'dist/npm-out');

execFileSync('node', [path.join(root, 'scripts/build.mjs')], { cwd: root, stdio: 'inherit' });
rmSync(stage, { recursive: true, force: true });
rmSync(outDir, { recursive: true, force: true });
mkdirSync(stage, { recursive: true });
mkdirSync(outDir, { recursive: true });

const { version } = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const sqliteRange = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')).dependencies['better-sqlite3'];

cpSync(path.join(root, 'dist/server/index.mjs'), path.join(stage, 'index.mjs'));
cpSync(path.join(repo, 'LICENSE'), path.join(stage, 'LICENSE'));
writeFileSync(
  path.join(stage, 'package.json'),
  `${JSON.stringify(
    {
      name: site.npmPackage,
      version,
      description: 'MCP server for your Loam knowledge base: gives Claude, Cursor, Codex, Gemini CLI, VS Code and any MCP-capable agent your work context.',
      keywords: ['mcp', 'model-context-protocol', 'ai-agents', 'knowledge-base', 'claude', 'cursor', 'codex', 'gemini', 'agents-md', 'skills', 'local-first'],
      license: 'MIT',
      author: site.author,
      homepage: site.siteUrl,
      repository: { type: 'git', url: `git+${site.githubUrl}.git` },
      bugs: { url: site.issuesUrl },
      // Name used by the official MCP registry (io.github.<owner>/<name>).
      mcpName: `io.github.${site.github.owner}/loam`,
      type: 'module',
      bin: { [site.npmPackage]: 'index.mjs' },
      files: ['index.mjs', 'README.md', 'LICENSE'],
      engines: { node: '>=22' },
      dependencies: { 'better-sqlite3': sqliteRange },
    },
    null,
    2,
  )}\n`,
);
writeFileSync(
  path.join(stage, 'README.md'),
  `# ${site.npmPackage}

The MCP server of [Loam](${site.siteUrl}): it lets your AI agent read (and, when you ask, update) the knowledge base folder you set up in the [Loam app](${site.appUrl}). It runs on your computer, makes no network requests and only touches that folder.

\`\`\`bash
npx -y ${site.npmPackage} --folder /path/to/your/loam/folder
\`\`\`

You normally do not run this yourself: add it to your agent's MCP settings. The Loam app (**Connect your agent**) shows the exact steps and config for Claude Code, Cursor, Codex, VS Code, Gemini CLI, Windsurf and others. Claude Desktop users install the one-click extension instead: ${site.installUrl}

Options: \`--folder <path>\` (or \`LOAM_FOLDER\`), \`--check\` (diagnose Node, the folder and search), \`--version\`, \`--help\`. Requires Node 22 or newer.

Source and issues: ${site.githubUrl} · MIT licence
`,
);
execFileSync('npm', ['pack', stage, '--pack-destination', outDir], { cwd: repo, stdio: 'inherit' });
console.log(`\nPackage staged in ${path.relative(repo, stage)}; tarball in ${path.relative(repo, outDir)}`);
