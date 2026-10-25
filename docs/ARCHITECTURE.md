# Architecture

How Loam is built, why it is built that way, and what each claim of the product rests on. For setup and commands see [DEVELOPMENT.md](DEVELOPMENT.md); for publishing see [PUBLISHING.md](PUBLISHING.md).

## Contents

1. [How it fits together](#how-it-fits-together)
2. [The knowledge base on disk](#the-knowledge-base-on-disk)
3. [Connecting agents](#connecting-agents)
4. [MCP tools](#mcp-tools)
5. [Skills and the security model](#skills-and-the-security-model)
6. [Context Lint](#context-lint)
7. [Privacy: each claim and how it is checked](#privacy-each-claim-and-how-it-is-checked)
8. [Design system](#design-system)
9. [Decisions and deviations from the spec](#decisions-and-deviations-from-the-spec)
10. [Not in the MVP](#not-in-the-mvp)

## How it fits together

```
 Static site (Cloudflare Pages)                  Your computer
 ┌───────────────────────────────┐   ┌─────────────────────────────────────────────┐
 │ /          landing (no React) │   │  your folder ← plain markdown files         │
 │ /install   install guide      │   │     ▲   ▲                                   │
 │ /app       React app          │◀─▶│     │   └─ FsStore (the app, File System    │
 │   ├ FsStore   (real folder)   │ no│     │       Access API)                     │
 │   └ DemoStore (in memory)     │net│     └──── NodeStore (the MCP server, stdio) │
 │ /download/loam.mcpb ──redirect┼─┐ │                  ▲ started by the agent     │
 └───────────────────────────────┘ │ │                  │ MCP                      │
                                   │ │   Claude Desktop · Claude Code · Cursor ·   │
 GitHub Releases: loam.mcpb ◀──────┘ │   Codex · VS Code · Gemini CLI · Windsurf … │
 npm: loam-mcp (npx) ───────────────▶│                                             │
                                     └─────────────────────────────────────────────┘
```

`packages/loam-core` is the one place where the rules live: schema, scoring, the skill scanner, Context Lint, skill generation, history/restore. The app and the server both implement the same small `KbStore` interface (browser folder, in-memory demo, Node disk) and share every operation, so the browser and the server cannot disagree about a rule.

Every edit is first a **plan** (the files that would change plus the audit entries). The app shows a plan as a diff and applies it on *Apply*; the MCP server applies it immediately and returns the diff to the agent. Applying refuses if a file changed after the preview.

## The knowledge base on disk

```
<folder>/
  README.md  AGENTS.md  CLAUDE.md  GEMINI.md   # CLAUDE.md and GEMINI.md are one line: @AGENTS.md
  profile.md
  processes/<slug>/{process.md, corrections.md, SKILL.md, examples/good-01.md …}
  skills/<name>/SKILL.md                        # the single source of truth for skills
  context/{glossary.md, entities.md}
  .claude/skills/loam-<name>/SKILL.md           # derived copy: Claude Code, VS Code Copilot, OpenCode
  .agents/skills/loam-<name>/SKILL.md           # derived copy: Codex, Cursor, Gemini CLI, Copilot, Windsurf …
  .loam/{state.json, interview.json, index.sqlite, history/, lint-report.json, skill-audit.json}
```

- Folder names are lowercase latin slugs; Cyrillic titles are transliterated.
- Word budgets: `profile.md` 400, `process.md` 600, `AGENTS.md` 500, `SKILL.md` 1000. Context Lint reports anything over.
- Before any write, the previous version is copied to `.loam/history/<timestamp>-<encoded path>`. Examples are never edited. Only folders that start with `loam-` inside the two agent skill folders are ever touched.
- `skills/` is the source of truth. The agent folders are rebuilt from it by *Sync to agents*; imported skills are copied there inside the same untrusted-text frame, and only `name` and `description` are kept in the header (every agent reads those two).

## Connecting agents

Loam does not depend on one vendor. Two things make a folder usable by an agent, and both are open conventions:

**1. Reading the folder (any agent that opens it).**

| Agent | Instructions | Skills |
|---|---|---|
| Codex, Cursor, Copilot, Windsurf | read `AGENTS.md` natively | `.agents/skills/` |
| Claude Code | `CLAUDE.md` → `@AGENTS.md` | `.claude/skills/` |
| Gemini CLI | `GEMINI.md` → `@AGENTS.md` | `.agents/skills/` |

`AGENTS.md` has a read-only mode for agents that are not connected through MCP: they can read skills and processes, must not edit the base, and tell the user how to connect Loam. *Health* notices when these instruction files are older than the app and offers a diff-confirmed update; `CLAUDE.md` and `GEMINI.md` are only created when missing, never overwritten (people add their own lines).

**2. Saving to the folder (MCP).** One server, two ways to start it. The person never has to use a terminal: Claude Desktop installs a file; every other agent is given **one message** (`Set up Loam for me. Follow the instructions at <site>/llms-install.md and ask me before you change anything.`) and does the setup itself: it checks Node (and offers to install it), finds the folder that has `.loam/state.json` (or suggests a new one in Documents, and asks), adds the server to its own settings after showing what it will write, runs `--check`, and says what to do next. The instructions are a file generated from `docs/templates/llms-install.md.tmpl`, served by the site and carried in the repository for installers such as Cline; the technical steps stay available, folded away. The folder itself is set up by the agent through `loam_init` (after asking), so the web app, which only works in Chrome and Edge, is optional.

| Route | For | Notes |
|---|---|---|
| `loam.mcpb` (MCP Bundle) | Claude Desktop | One click, carries its own runtime and the native SQLite binaries for macOS and Windows. Served from GitHub Releases, reached through `/download/loam.mcpb` |
| `npx -y loam-mcp --folder <path>` | every other MCP client | Needs Node 22+. The first start downloads the package (about 15 MB); `--check` explains problems in plain words |

The *Connect your agent* screen generates the exact command or config for the chosen agent and the person's folder path (browsers hide the path, so it is typed once). Formats, from each tool's documentation (checked October 2026):

| Agent | What the app generates |
|---|---|
| Claude Code | `claude mcp add --transport stdio --scope user loam -- npx …` |
| Cursor | `cursor://anysphere.cursor-deeplink/mcp/install?name=…&config=<base64 JSON>`, or `~/.cursor/mcp.json` |
| Codex | `codex mcp add loam -- npx …`, or `[mcp_servers.loam]` in `~/.codex/config.toml` |
| VS Code (Copilot) | `vscode:mcp/install?<URL-encoded JSON>`, `code --add-mcp '<JSON>'`, or `.vscode/mcp.json` |
| Gemini CLI | `mcpServers` in `~/.gemini/settings.json` |
| Windsurf | `mcpServers` in `~/.codeium/windsurf/mcp_config.json` |
| Any other | the common `mcpServers` JSON shape |

On Windows the server is started through `cmd /c npx …`, which every client expects. The generator is a pure function, tested with real parsers (JSON, TOML), by decoding the Cursor and VS Code links, and by running the shell commands for ten awkward paths (spaces, quotes, `$`, backticks, Unicode, `~`) through a real `sh` with stand-ins for the CLIs.

**3. Chats that cannot run a local server (ChatGPT, Gemini, claude.ai in a browser): “Copy for any chat”.** A button on the process page and on each skill card turns one process or skill into text to paste. See the next section.

Not done: finding the folder from the agent's working directory.

### Copy for any chat

`packages/loam-core/src/chat-context.ts`, `apps/web/src/app/components/ChatCopyDialog.tsx`.

| Decision | Why |
|---|---|
| Built from the sources, not from `SKILL.md` | A chat cannot open files. The generated skill points at `profile.md`, `examples/…` and `corrections.md`; the copy carries what those files say. Process headings, the newest example, the corrections and the relevant profile sections are inlined |
| Order: how to use it → about me → the process → examples → names → corrections → “wait for my task” | Long reference material first, the instruction last, as the vendors' prompting guides advise; the corrections sit closest to the task, where they weigh most. Markdown headings for structure, a tag only around text that is copied verbatim (`<example>`) |
| Rules stated once, in the first lines | The chat is told it cannot open files or save anything (so it does not claim to), that `profile.md` / `loam_*` mentions map to the sections below, and not to invent facts |
| Defaults keep it short; every part can be ticked | Profile core on, the long handbook off; newest good example and newest “avoid” example on, older ones off; names whole when the list is short, only the mentioned ones when it is long. Real token counts (the tokenizer loads when the dialog opens), a warning above 6,000 tokens |
| The person reads the exact text before it leaves | Preview = clipboard = downloaded file. Copy, or download a `.md` for chats that turn long pastes into attachments or for a Project's files |
| One-way, on purpose | Nothing is written, no network. A chat has no way to save a correction back; those still go through an agent with MCP. A static rule forbids any write call in these two files |
| Other people's skills are still data | Imported text goes inside the same marker frame as over MCP, with a notice written for a chat (no links, no connected apps), forged markers neutralised, and a warning in the dialog |
| An example cannot end its own frame | A closing `</example>` inside the text is escaped |
| Keys and passwords are caught | The scanner's secret patterns run over the ticked text; the dialog names the part (never the secret) and the button reads “Copy anyway” |

Not done: writing a correction back from a chat (it would need an “Add a correction” form in the app); copying the whole profile without a process.

## MCP tools

All tools are prefixed `loam_`. They return readable text and never crash the server; failures say what to do next. The server makes no outgoing network requests and only touches the folder it was given (paths are normalised and checked again through symlinks).

| Tool | Purpose |
|---|---|
| `loam_overview` | Start here: owner, processes with hours/year, run and correction counts. Under 500 tokens. |
| `loam_get_process` | `process.md`, path of the newest example, all corrections. |
| `loam_search` | BM25 search (SQLite FTS5). Falls back to a plain keyword scan if the native module cannot load. |
| `loam_read` | Read one text file inside the folder. Imported skills come back inside the warning frame. |
| `loam_list_skills` · `loam_get_skill` | Compact skill list (under 400 tokens) and one skill. |
| `loam_import_skill` | Scan, then quarantine (stored as imported, unreviewed). Red flag ⇒ refused, nothing written. |
| `loam_review_skill` · `loam_set_skill_review` | The user's agent reviews an imported skill; the verdict is stored as information only. |
| `loam_init` | Sets up the knowledge base in the chosen folder when it is not one yet (the only way into a folder that the web app has not touched). Asks first: `confirm: true` only after the user agreed; a folder that holds other files needs `allow_existing_files: true`; never overwrites; does nothing if the base exists. |
| `loam_get_interview_script` · `loam_save_interview` | Run the onboarding interview from `.loam/interview.json`; save profile, processes, glossary, entities, progress. |
| `loam_upsert_note` | Write a markdown note when asked, with history and a diff. Cannot write skills, examples, corrections, `AGENTS.md`/`CLAUDE.md`/`GEMINI.md`, `.loam`, `.claude`, `.agents`. |
| `loam_record_correction` · `loam_add_example` · `loam_generate_skill` · `loam_log_run` | The learning loop. Every third correction suggests rebuilding the skill. |
| `loam_lint` | Context Lint report. |

**The interview is short on purpose** (version 2: four questions and a confirmation, three to five minutes; version 1 had 27 questions over seven stages, 15 to 20 minutes). Completion of questionnaires falls after about five minutes, so the script asks for what decides whether a task can be automated (how often, how many minutes, the steps, what a good result is, what must never happen) in as few questions as possible, and has the agent *draft* the process map from the answers and let the user correct it in one reply. It asks for no files during the interview (an example is offered after saving) and not for a timeline of the day. A folder created before version 2 keeps its script until *Update interview script* (scripts with `branches` still load).

The interview script lives in the user's folder (`.loam/interview.json`), so it can be improved and picked up **without reinstalling the extension**. *Overview → Redo interview → Update interview script* replaces it with the bundled version after showing a diff.

## Skills and the security model

A skill is someone else's instruction text for an agent that can read your folder. So:

1. **Static scanner** (`packages/loam-core/src/scanner.ts`, one implementation for the browser and the server). Red flags block the import with no override: `delete`, `network` (URLs, bare domains, download/upload, curl/fetch/webhook, “send … to a server”), `exfiltration` (reading everything and sending it), `injection` (“ignore previous instructions”, role resets, forged frame markers, hidden/zero-width characters, look-alike letters), `escape` (`../`, absolute paths, `~/`, drive letters, `.ssh`, `.env`), `credentials`. Rules also run on a look-alike-folded copy of each line and on Russian phrasings. Yellow flags allow the import but mark `scanner: warn`: over 1000 words, empty/template description, no licence, more than `read`, tools not in your profile, hidden comments or encoded blocks, declared tool permissions.
2. **Capabilities.** Imported skills are `read` only. Declaring `network` — or `write` for an imported skill — is refused, as is a skill that says `read` but tells the agent to write to the base.
3. **Untrusted-text frame.** `loam_get_skill`, `loam_read` and the copies in the agent skill folders wrap imported text in a warning frame; forged frame markers inside the text are neutralised.
4. **Review by the user's own agent** (`loam_review_skill`): the text is served inside an “UNTRUSTED DATA” frame with a seven-point checklist. The verdict goes into the skill's header and the UI. **A verdict never grants anything** — it is not used in any access decision (enforced by `npm run check:rules`).
5. **Write policy for agents.** `loam_upsert_note` cannot create skills, edit examples, corrections, instruction files, `.loam/`, `.claude/` or `.agents/`; a prompt-injected agent cannot plant a skill through a “note”.
6. **Audit log** (`.loam/skill-audit.json`): time, action (`import`, `reject`, `review`, `delete`, `sync`), skill, source, scanner result, verdict, SHA-256 of the content. Shown in the app under *View audit log*.
7. The `---js` / `---javascript` front-matter engine of `gray-matter` (which would evaluate code) is disabled; only plain YAML is read.

A pattern scanner is a filter, not a proof. It is the first of three layers (scanner → untrusted-text rules in `AGENTS.md` and the frame → no write capability for imports) and the tests include evasion attempts (look-alike letters, zero-width characters, split sentences, negation tricks).

## Context Lint

Ten checks, in plain language, shared by the app (Health) and `loam_lint`: cost, size limits, repeated text, possible contradictions, outdated processes, unfilled templates, processes without examples, unreviewed imported skills, skills without a description, and drift of the agent copies (the two skill folders and the instruction files).

**Before / after.** Tokens are counted with a GPT tokenizer (Claude's is not public), so treat them as a yardstick. The report gives two numbers:

- *A typical task* = `AGENTS.md` + the skill list + `profile.md` + one process skill + its newest example. (`profile.md` is included on top of the list in the spec because step 3 of the reading order in `AGENTS.md` loads it for tone and background on almost every deliverable.)
- *Everything your agent could read.*

“After” applies the suggestions: remove repeated paragraphs, bring over-size files to their limit, drop leftover template lines. The sample knowledge base is deliberately messy (a pasted handbook in `profile.md`, a brand-voice block repeated in three files); its figures are quoted on the landing page and in the README straight from `apps/web/src/demo-data/summary.json`, so they cannot drift from the product. On a tidy real base the figure is much smaller, and the report says so.

Fixes the app can do for you (always with a diff first): sync the agent copies, remove repeated paragraphs, mark a process as up to date, update the agent instruction files.

## Privacy: each claim and how it is checked

| Claim | Verified by |
|---|---|
| Your data never leaves your machine; the app has no outgoing request | The production page ships `Content-Security-Policy: connect-src 'none'`; e2e records every request (none to another origin) and proves `fetch`, WebSocket and inline script are blocked; `check:rules` finds no `fetch`/XHR/WebSocket/`http`/`net` in app, server or core, nor in the built files |
| No server, no account | No backend dependency (`check:rules`); the site is static files |
| No analytics in the app | `check:rules`; e2e greps the served `/app/` page. Analytics (Plausible, cookie-free) is on `/` and `/install` only |
| Only external resource on the landing page is the analytics script | e2e records requests on `/`; fonts and images are self-hosted |
| Works offline after the first visit | e2e: loads, goes offline, reloads every screen |
| The server only touches the chosen folder | Server tests: `../`, absolute, `~`, symlink escapes are errors; reads and writes |
| Other people's skills are checked | 8 malicious fixtures (one per red category + capability cases) refused in core, server and UI tests; the 7 starter skills and everyday text pass |
| Reviews grant nothing | `check:rules` + tests: capabilities unchanged after a `safe` verdict |
| “Copy for any chat” is one-way and shows what leaves | The exact text is previewed, equals the clipboard and the download; a store that refuses every write still builds it; the folder is identical before and after (e2e); `check:rules` forbids writes in that code; keys and passwords are flagged first |

`npx` itself downloads the `loam-mcp` package from npm on first use; that is npm's request, not the server's. The server code makes none.

`npm audit` reports advisories in the **build-time** toolchain (`@anthropic-ai/mcpb` → `node-forge`, `inquirer`) and in `js-yaml` 3, which `gray-matter` pins (reached only through its argument parser, never by `load`). None of it ships in the attack surface of the server.

## Design system

Neutral paper and ink with one bright accent: lime (`--accent`), the sprout on top of the soil. Lime is only ever a fill (the logo's top layer, the primary action, the highlighter, text selection) with ink on it; text, borders and focus rings in its hue use `--accent-ink`, and a unit test (`apps/web/test/design.test.ts`) keeps it that way. One typeface (Geist, self-hosted, one variable `woff2`), 8 px rhythm, no gradients, no decorative shadows, no dark mode. Motion is quick feedback plus one moment on the landing page (the logo's layers settle, the lime marks the promise in the heading), and none of it for people who ask for less motion. The full system, with its reasons, is in [DESIGN.md](../apps/web/DESIGN.md). Values are declared once in `apps/web/src/styles/tokens.css` and reach Tailwind through `@theme` in `theme.css`; the Tailwind default palette is switched off so a stray `bg-red-500` cannot exist. Two extra “ink” shades (`--warning-ink`, `--success-ink`) are used for text on the 8 % status tints, because the specified status colours reach only 4.3:1 there and the target is 4.5:1. Accessibility is tested with axe (WCAG 2.1 A/AA, including contrast) on every screen, the landing page, the install guide, the connect panel for every agent and an open dialog; focus rings, 44 × 44 px targets and “no sideways scroll at 375 px” are asserted too.

Brand files (`logo.svg`, `favicon.svg/.ico`, `apple-touch-icon.png`, `icon-512.png`, `og.png`) are generated from the tokens by `npm run assets`.

## Decisions and deviations from the spec

Things the spec did not settle, or where an installed dependency or a later request forced a choice. Each is a one-line change if you disagree.

| Topic | What was done and why |
|---|---|
| Node version | **22+** instead of 20+. `better-sqlite3` 13 requires it and gives one N-API binary per platform, which removes the usual native-module packaging problem. Node 20 is end-of-life. If the native module cannot load, search degrades to a keyword scan and says so. |
| Tailwind | v4 (`@theme`) instead of a `theme.extend` config; same single source of tokens. |
| More than Claude | The spec connected only Claude Desktop (`.mcpb`). Other agents are connected through the `loam-mcp` npm package, skills are copied to `.agents/skills` as well, `GEMINI.md` is added, and `AGENTS.md` got a read-only mode. |
| Download link | `/download/loam.mcpb` on our own domain redirects (302, in `_redirects`) to GitHub's `releases/latest/download/loam.mcpb`, which GitHub serves directly as a download: the person never sees a GitHub page. |
| Addresses | All in `site.config.json` (domain, repository, npm package, contact, analytics) and substituted into the pages, `_headers`, `_redirects`, the manifest, the npm package and the README. |
| Full folder path | Browsers never reveal a folder's path, so “Connect your agent” shows the folder **name** and, for agents started by command, asks for the path once (kept in this browser only). |
| `runs_per_year` | New optional front-matter field for `ad-hoc` processes, so their hours can be computed (§9 says “by the user's estimate”). |
| `review_verdict` | New field next to `reviewed`, to store safe / suspicious / unsafe (§14.5 needs somewhere to put it). |
| `stable` | “More than five runs and none of the last three needed a correction” is implemented per run: each correction remembers how many runs had happened (`after run N`). |
| Run counting | `AGENTS.md` adds one sentence: after delivering a process result the agent calls `loam_log_run`. It is the single write allowed without being asked, and it only raises a counter. |
| `loam_save_interview` | Takes `glossary`, `entities`, `stage`, `complete` besides `profile` and `processes[]`, to fill `glossary.md`, `entities.md` and to resume a tired interview. |
| Typical read path | Includes `profile.md` (see Context Lint). |
| “No example” check | Covers `needs-access` as well as `ready`: an example can be prepared before access arrives. |
| Example edits | Adding or deleting an example rebuilds the process skill in the same plan, so it never says “no example yet” after one was added. |
| Language of the base | Answers are stored in the language the person used; slugs and field names stay English. |
| `loam_upsert_note` | Fenced (see the security model); not in the spec, needed so “notes” cannot bypass the scanner. |
| Screenshots | The four product shots on the landing page come from the real app. The agent chat and the three Claude Desktop steps on `/install` are **drawn illustrations** (labelled so in their alt text); replace them with real screenshots when you have them. |
| Service worker | Hand-written (no Workbox), contains no `fetch()`. A new version waits until all tabs are closed, so a page never loses the chunks it was built with. |
| “Meet Sarah” | An extra block on the landing page (the spec has six), generated at build time from the sample base so it cannot drift from what the demo shows. |

## Not in the MVP

Vector search (planned: local embeddings with `transformers.js` and `sqlite-vec`, merged with BM25 by reciprocal rank fusion); importing skills by URL; publishing or versioning skills; an expert mode for refused skills; dark theme; accounts, sync, team features; running processes inside the product; saving a correction made in a browser chat; finding the folder from the agent's working directory.
