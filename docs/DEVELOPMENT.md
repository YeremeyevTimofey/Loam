# Development

Requirements: **Node 22 or newer**, npm 10. First time on a machine: `npx playwright install chromium firefox webkit`.

```bash
npm install
npm run dev              # Vite dev server: landing /, install guide /install, app /app (http://localhost:5173)
```

Open `/app?demo=1` for the sample knowledge base (any browser), or `/app` in Chrome or Edge for a real folder.

## Commands

| Command | What it does |
|---|---|
| `npm run typecheck` | `tsc --noEmit` over every workspace (strict) |
| `npm test` | Unit and integration tests: core, MCP server over the real protocol, the agent config generator (with real JSON/TOML parsers and a real shell), the sample base, the packed `.mcpb` over stdio, tool sizes with a real tokenizer |
| `npm run build` | `apps/web/dist`: landing, install guide, app, 404, service worker, `_headers`, `_redirects` |
| `npm run check:rules` | Static audit of the spec's rules on source and on built files (needs `npm run build`) |
| `npm run pack:mcpb` | `apps/mcp-server/dist/loam.mcpb`, the Claude Desktop extension |
| `npm run pack:npm` | `apps/mcp-server/dist/npm-out/loam-mcp-<version>.tgz`, the npm package for every other agent |
| `npm run test:e2e` | Builds, then drives Chromium, Firefox and WebKit against the build; also installs the npm tarball with `npx` and talks to it over MCP (needs network) |
| `npm run demo:build` | Regenerates the derived files of the sample base and `summary.json` (a test fails if they drift) |
| `npm run readme` | Regenerates `README.md` from `docs/templates/README.md.tmpl` |
| `npm run assets` · `npm run screenshots` | Brand files; landing and install images |
| `npm run verify` | Everything above, in order |

## Where things are

```
site.config.json            every address: domain, repository, npm package, contact, analytics
apps/web/                   index.html (landing), install.html, 404.html, app/index.html
  src/app/                  the React app: screens, components, store (FsStore, DemoStore), lib/agents.ts
  src/landing/              build-time generators for the landing page and the install guide
  src/demo-data/kb/         the sample knowledge base (authored files + files derived by npm run demo:build)
  src/starter-skills/       the six starter skills (plain markdown)
  _headers.template         security headers (analytics host filled in at build time)
apps/mcp-server/            src/ (server, CLI, tools), manifest.json (Claude Desktop), scripts/ (build, pack)
packages/loam-core/         schema, scanner, lint, skill generation, KbStore: shared by app and server
e2e/                        browser tests and the npm package test
scripts/                    demo data, assets, screenshots, rules audit, README generator
```

## Changing things

- **An address** (domain, repository, package name, contact): edit `site.config.json`, then `npm run readme && npm run build`.
- **The interview**: `packages/loam-core/src/interview.ts`. Users get it through *Redo interview → Update interview script*; the server reads the copy in their folder.
- **Starter skills**: `apps/web/src/starter-skills/*.md`. They must pass the scanner with no flags (a test checks).
- **The sample base**: edit the authored files in `apps/web/src/demo-data/kb/` (profile, process, corrections, examples, context, the imported skill), then `npm run demo:build`. Keep it believable.
- **A new agent in the connect screen**: add it to `AGENTS` and `connectFor` in `apps/web/src/app/lib/agents.ts`, with tests in `apps/web/test/agents.test.ts`.
- **A scanner rule**: `packages/loam-core/src/scanner.ts`. Add a fixture under `packages/loam-core/test/fixtures/` and a test; also add a benign sentence that must keep passing.
- **Colours**: only in `apps/web/src/styles/tokens.css` (`check:rules` fails on a hard-coded colour).

## CI and deploys

`.github/workflows/ci.yml` runs the full verify on every pull request. `deploy-web.yml` publishes `apps/web/dist` to Cloudflare Pages on every push to `main`. `release-mcpb.yml` publishes a release on a `v*` tag. See [PUBLISHING.md](PUBLISHING.md).
