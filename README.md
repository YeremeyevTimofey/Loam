<div align="center">

<img src="apps/web/public/logo.svg" width="56" height="56" alt="Loam">

# Loam

**Work context for AI agents.**<br>
Answer questions about your workday for 15 minutes. Get a knowledge base on your own computer that Claude, Cursor, Codex, Gemini and other AI agents can actually use.

[**Download for Claude Desktop**](https://github.com/YeremeyevTimofey/Loam/releases/latest/download/loam.mcpb) &nbsp;·&nbsp; [Try the live demo](https://loam.dev/app?demo=1) &nbsp;·&nbsp; [Set up another agent](https://loam.dev/install)

[![CI](https://github.com/YeremeyevTimofey/Loam/actions/workflows/ci.yml/badge.svg)](https://github.com/YeremeyevTimofey/Loam/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/YeremeyevTimofey/Loam)](https://github.com/YeremeyevTimofey/Loam/releases/latest)
[![npm](https://img.shields.io/npm/v/loam-mcp)](https://www.npmjs.com/package/loam-mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-green.svg)](LICENSE)

<img src="apps/web/public/shots/step-2-processes.png" width="760" alt="Loam showing five processes with the hours each takes per year">

</div>

---

## What it does

Most people have an AI assistant and still paste the same background into every prompt. Loam fixes the cause:

1. **Interviews you, through your own agent.** Your agent asks about your day, one question at a time, for about 15 minutes. Loam never calls a model itself: no API keys.
2. **Shows what is worth automating.** Your recurring work becomes a map of processes with minutes per run and hours per year, and an honest note on what each one needs.
3. **Keeps everything as plain files you own.** A folder on your disk: your profile, your processes, examples of good results, corrections, skills.
4. **Learns from your examples and corrections.** Say "remember this correction" once and the next result is right. After a few runs a process is marked stable.
5. **Checks skills from other people before they are added.** Anything that deletes files, uses the network, sends data out, asks for passwords or tries to change how your AI behaves is refused, with no override.

No server, no account, nothing leaves your computer.

## Get started

**1. Set up a folder:** open [loam.dev/app](https://loam.dev/app) in Chrome or Edge, choose an empty folder, and Loam fills it in. (Want to look first? [Open the demo](https://loam.dev/app?demo=1); it works in any browser.)

**2. Connect your AI agent.** Loam works with any agent that can run a local [MCP](https://modelcontextprotocol.io) server:

| Agent | How | |
|---|---|---|
| **Claude Desktop** | [**Download loam.mcpb**](https://github.com/YeremeyevTimofey/Loam/releases/latest/download/loam.mcpb) and double-click it | One click. The file downloads straight from this repository's releases; you never need to visit GitHub. Nothing else to install |
| **Claude Code** | `claude mcp add --transport stdio --scope user loam -- npx -y loam-mcp --folder <path>` | |
| **Codex** | `codex mcp add loam -- npx -y loam-mcp --folder <path>` | |
| **Cursor** · **VS Code (Copilot)** | One-click install links in the app | |
| **Gemini CLI** · **Windsurf** · others | A few lines in the agent's MCP config | |
| **ChatGPT** · **Gemini** · **claude.ai** in a browser | **Copy for any chat** in the app: a process or skill as text to paste | Read-only. These chats cannot run a local server, so they cannot save corrections back |

The app's **Connect your agent** screen writes the exact command or config for your agent and your folder (Mac, Windows and Linux), and the [install guide](https://loam.dev/install) shows them step by step. Agents other than Claude Desktop need [Node](https://nodejs.org) 22 or newer; check with `node --version`.

**3. Tell your agent:** `Run my Loam onboarding interview`. Then ask for your work in plain words, for example `Do my weekly client report`.

> **Chats in a browser** (ChatGPT, Gemini, claude.ai) cannot run a local server. Open a process or a skill in the app and press **Copy for any chat**: you see exactly what will be copied, tick what to include, and paste it into the chat. It is a one-way copy; the text contains your latest example and corrections, and imported skills are wrapped as data. Any agent that opens the folder can also read it: `AGENTS.md` is read natively by Codex, Cursor, Copilot and Windsurf, and Loam adds `GEMINI.md` for Gemini CLI and copies your skills to `.claude/skills` and `.agents/skills`, where Claude Code, Cursor, Codex, Gemini CLI, Copilot and others look for them.

<details>
<summary>Verify the download</summary>

Every release publishes `loam.mcpb.sha256` next to the file and a GitHub build attestation:

```bash
shasum -a 256 loam.mcpb          # compare with loam.mcpb.sha256
gh attestation verify loam.mcpb --repo YeremeyevTimofey/Loam
```

</details>

## See it on an example

The demo is a fictional account manager, Sarah, at a 20-person marketing agency. [Open her knowledge base](https://loam.dev/app?demo=1) to see:

- **5 processes** found by the interview, 3 ready to automate: about **108 hours a year**.
- A weekly report refined by **4 corrections** until it was marked *stable*.
- Starter skills, one imported skill with a safety scan and an agent review, and one skill the safety check **refused**.
- A health check: a typical task reads **5,648 tokens** in this deliberately messy sample, **2,215** after the suggested clean-up (**61% less**).

## Private and safe by design

| Claim | How it is checked |
|---|---|
| Your data never leaves your machine | The app page ships a Content-Security-Policy with `connect-src 'none'`; tests record every request; a static audit finds no network calls in the app, the server or the core |
| No account, no server | The site is static files; there is no backend dependency |
| Other people's skills are checked | One scanner, shared by the app and the server, tested against malicious skills for every red category, look-alike letters, hidden characters and more |
| A review never grants anything | The agent's verdict is information only; it is not used in any access decision |
| "Copy for any chat" is one-way | It shows the exact text first, flags anything that looks like a key or a password, wraps imported skills as data, and a static rule forbids any write in that code |
| The extension only touches your folder | Paths are normalised and checked again through symlinks; tests try `../`, absolute paths and links |

Details: [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md). Found a hole in the scanner? Please read [SECURITY.md](SECURITY.md).

## Repository

```
apps/web/          landing page, install guide, the app (React), sample knowledge base, starter skills
apps/mcp-server/   the MCP server, packed as loam.mcpb (Claude Desktop) and as the npm package loam-mcp
packages/loam-core/  schema, scanner, lint, skill generation: shared by the app and the server
e2e/  scripts/     browser tests (Chromium, Firefox, WebKit) and build tooling
docs/              architecture, development, publishing, acceptance criteria
site.config.json   every address (domain, repository, package name) in one place
```

Quick start for developers (Node 22+):

```bash
npm install
npm run dev          # landing page, install guide and app at http://localhost:5173
npm run verify       # types, tests, build, rules audit, both packages, browser tests
```

More: [development guide](docs/DEVELOPMENT.md) · [architecture](docs/ARCHITECTURE.md) · [publishing](docs/PUBLISHING.md) · [acceptance criteria](docs/acceptance.md) · [contributing](CONTRIBUTING.md).

## License

[MIT](LICENSE). The Inter typeface is under the SIL Open Font License (`apps/web/public/fonts/OFL.txt`).
