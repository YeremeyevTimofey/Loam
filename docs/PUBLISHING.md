# Publishing Loam

From this folder to a public GitHub repository, a live website, a one-click download and an npm package. About an hour the first time.

## What you need

| Account | For |
|---|---|
| **GitHub** (an organisation is best) | The code, the Releases that carry `loam.mcpb`, the build pipelines |
| **Cloudflare** (free) | Hosts the website (`/`, `/install`, `/app`) on your domain through Cloudflare Pages |
| **npm** (free) | Publishes the `loam-mcp` package that Claude Code, Cursor, Codex, VS Code, Gemini CLI and others start with `npx` |
| A **domain** | `loam.dev` or another; point it at Cloudflare Pages |

## 1. Put your real addresses in one file

Edit [`site.config.json`](../site.config.json): the domain (`siteUrl`), the GitHub `owner` and `repo`, the `npmPackage` name, the contact address and the analytics domain. Then:

```bash
npm install
npm run readme     # rewrites README.md from docs/templates/README.md.tmpl
npm run verify     # everything builds and passes with the new addresses
```

Two files are plain GitHub files and cannot read the config, so edit them by hand: the repository URL in `.github/ISSUE_TEMPLATE/config.yml`, and the project name in `.github/workflows/deploy-web.yml` if you do not call the Cloudflare project `loam`.

## 2. Create the repository and upload the files

Create an **empty public** repository (public matters: the download link only works for public releases). Then, from this folder:

```bash
git init -b main
git add -A            # .gitignore keeps node_modules, dist and *.mcpb out
git commit -m "Loam"
git remote add origin https://github.com/<owner>/<repo>.git
git push -u origin main
```

**What goes to GitHub** (about 250 files, 2 MB): everything `git add -A` picks up. By area:

| Path | What it is |
|---|---|
| `README.md`, `LICENSE`, `SECURITY.md`, `CONTRIBUTING.md` | What visitors read first; the licence; how to report a security hole; how to contribute |
| `site.config.json`, `package.json`, `package-lock.json`, `tsconfig.base.json`, `vitest*.ts` | One place for addresses; dependencies (the lock file is needed by `npm ci`); shared configuration |
| `.github/` | Build and release pipelines, issue and pull-request templates, Dependabot |
| `.gitignore`, `.gitattributes`, `.editorconfig` | Repository hygiene |
| `apps/web/` | Landing page, install guide, 404, the app (`src/app`), generators (`src/landing`), the sample knowledge base (`src/demo-data`), starter skills, design tokens, Vite config, `public/` (logo, favicon, OG image, font, screenshots) |
| `apps/mcp-server/` | The MCP server source, the Claude Desktop manifest, the packing scripts |
| `packages/loam-core/` | Shared rules: schema, scanner, lint, skill generation, with its tests and malicious/benign fixtures |
| `e2e/`, `scripts/` | Browser tests; build tooling, demo-data and README generators, the rules audit |
| `docs/` | Architecture, development, this guide, acceptance criteria, the README template |

**What stays off GitHub** (the `.gitignore` handles it): `node_modules/` (reinstalled by `npm install`), `dist/` folders (rebuilt), `*.mcpb` and `*.tgz` (these are **release assets**, built by the pipeline and attached to a release, never committed), editor and OS files, `.env` files. There are no secrets in the repository; the three secrets below live in GitHub's settings.

## 3. Add three secrets

Repository → Settings → Secrets and variables → Actions:

| Secret | Where it comes from |
|---|---|
| `CLOUDFLARE_API_TOKEN` | Cloudflare → My Profile → API Tokens → *Edit Cloudflare Workers* template, limited to Pages |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare dashboard, right-hand side of the account overview |
| `NPM_TOKEN` | npmjs.com → Access Tokens → *Automation*, with publish rights for the package name |

Also enable *Private vulnerability reporting* (Settings → Security) so `SECURITY.md` works.

## 4. The website

1. Cloudflare → Workers & Pages → create a **Pages** project named `loam` (direct upload is fine; the pipeline deploys into it).
2. Add your domain to the project (Custom domains).
3. Push to `main`: `deploy-web.yml` runs the checks, builds, and deploys `apps/web/dist`. It contains `_headers` (security headers and the strict Content-Security-Policy for `/app`) and `_redirects` (the download address, below), both written from `site.config.json`.

## 5. The first release (the download button and the npm package)

```bash
# version numbers must match in package.json, apps/mcp-server/package.json and apps/mcp-server/manifest.json (check:rules enforces it)
git tag v0.1.0
git push origin v0.1.0
```

`release-mcpb.yml` then:

1. checks that the tag equals the three version numbers;
2. runs the tests, packs `loam.mcpb` and the npm package, and starts the packed extension over stdio as a last check;
3. writes `loam.mcpb.sha256` and a signed **build attestation**;
4. creates the GitHub Release with `loam.mcpb` and the checksum attached;
5. publishes `loam-mcp` to npm with provenance.

## 6. List the server in the official MCP Registry

The [MCP Registry](https://modelcontextprotocol.io/registry/quickstart) is the public catalogue of MCP servers that agents and other directories read from. It stores only a short description (`server.json`); the code stays on npm, so publish the package first (section 5).

`npm run pack:npm` writes the description for you, from `site.config.json` and the version in the manifest, to `apps/mcp-server/dist/npm/server.json` (it is not part of the npm package). The package carries the matching `mcpName`; the registry checks that the two agree. Once, on your computer:

```bash
brew install mcp-publisher                       # or the binary from the registry's releases page
npm run pack:npm                                 # on the tagged commit, so the versions match what is on npm
cd apps/mcp-server/dist/npm
mcp-publisher login github                       # sign in as the account that owns the repository
mcp-publisher publish
curl "https://registry.modelcontextprotocol.io/v0.1/servers?search=loam"   # the server is listed
```

- The name is `io.github.<owner>/loam`. A GitHub sign-in only allows names that start with your own user name; if the registry rejects the capital letters of the owner, change the one line in `scripts/lib/registry.mjs` (`mcpName`) and rebuild.
- Each new release needs `mcp-publisher publish` again (the registry can also be published from GitHub Actions with the repository's own identity; see its documentation).
- The registry is marked as a preview by its maintainers, so its schema and address can change: `scripts/test/registry.test.ts` checks the generated file against the schema it was written for.
- Anthropic's own directory no longer accepts `.mcpb` extensions (only plugins), so `loam.mcpb` stays a direct download. Agents that install servers for people (Cline, for example) can follow [llms-install.md](../llms-install.md).

For what to do next, to be found and starred, see [LAUNCH.md](LAUNCH.md).

## The setup message for other agents

People who use Cursor, Codex, Claude Code and the rest send their agent one message that points at `<site>/llms-install.md`. That file is built from `docs/templates/llms-install.md.tmpl` by `npm run readme` (three copies: the repository root, for GitHub and for installers such as Cline, and `apps/web/public`, which the site serves). It is deployed with the site, so after you change the template, run `npm run readme`, merge, and the next deploy updates what agents read. It names `loam-mcp` on npm: the message only works once the package is published (section 5).

## How the one-click download works

The button on the site and in the app points to **`<your domain>/download/loam.mcpb`**. That address answers with a redirect (written to `_redirects`) to

```
https://github.com/<owner>/<repo>/releases/latest/download/loam.mcpb
```

GitHub answers *that* with a second redirect to the stored file, served as an attachment. The browser follows both and **downloads the file while staying on the page**: the person never sees a GitHub page, an account prompt or a release list. (A test reproduces the chain with a stand-in server and checks that a download starts and the page does not change.) Everything the redirect needs:

- the repository must be **public**;
- the release must be **published**, not a draft or a pre-release (`latest` ignores those);
- the asset must always be called exactly **`loam.mcpb`** (the pipeline does this);
- the first release must exist before the button is used, otherwise people see GitHub's 404.

Why our own address in front: the visible link stays on your domain, you can move the file (another host, a CDN) by editing one redirect, and the GitHub address is never typed into the product. The README on GitHub links straight to the GitHub address, so it works before your domain does.

Things that can go wrong for a particular person: a company network that blocks `release-assets.githubusercontent.com` (the download fails; the install guide says what the file is called so IT can allow it), and browsers that warn about rarely downloaded files (the checksum in the release lets people verify it).

## After a release: check it

```bash
curl -sI https://<your domain>/download/loam.mcpb            # 302, location: the GitHub address
curl -sIL https://github.com/<owner>/<repo>/releases/latest/download/loam.mcpb | grep -i -E "^(HTTP|content-disposition)"
npx -y loam-mcp --version                                    # the version you just published
npx -y loam-mcp --check --folder <a Loam folder>             # Node, folder and search, in plain words
```

## Updating

- **Website**: push to `main`.
- **Extension and package**: bump the three version numbers, push a new `v*` tag. Claude Desktop users install the newer `loam.mcpb`; `npx` users get a newer `loam-mcp` the next time the cache is refreshed (`npx -y loam-mcp@latest --version` forces it). Keep the folder format backwards compatible: the app and the server share one `schema_version`.
- **The interview**: people get a new script with *Redo interview → Update interview script*; no new release of the extension is needed.

## Optional

- **Social preview**: Settings → General → Social preview → upload `apps/web/public/og.png`.
- **Replace the install-guide illustrations** (`apps/web/public/shots/install-*.png`, drawn, not real) with real screenshots, then `npm run build`.
