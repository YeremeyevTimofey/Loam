# Install Loam for an AI agent

This file is for an AI agent that installs MCP servers on a person's behalf (Cline, for example). If you are a person, read the [README](README.md) instead.

## What this is

Loam gives an AI agent the work context of one person: their profile, their recurring processes, examples of good results, and the corrections they made. It is a local MCP server (stdio) started with `npx`. It reads and writes **only one folder** that the person chose, and it makes no network requests.

## Before you install

1. **Node.js 22 or newer.** Run `node --version`. If it is older, or missing, stop and tell the person to install Node 22 or newer from https://nodejs.org. Do not install Node yourself.
2. **The person's Loam folder.** They create it once in the Loam web app (https://loam-ai.pages.dev/app, in Chrome or Edge); it has a file called `AGENTS.md` inside. **Ask for the full path of that folder. Do not guess it and do not make one up.** If they have no folder yet, ask them to open https://loam-ai.pages.dev/app first.

## Install

Add this entry to the MCP settings (in Cline: MCP Servers → Configure MCP Servers). If the file already lists other servers, add only the `loam` entry inside `mcpServers`.

```json
{
  "mcpServers": {
    "loam": {
      "command": "npx",
      "args": ["-y", "loam-mcp", "--folder", "<FULL PATH OF THE LOAM FOLDER>"],
      "disabled": false
    }
  }
}
```

- Put the real path where the placeholder is. Keep it inside the quotes; on Windows write the backslashes doubled (`C:\\Users\\Sarah\\Loam`).
- On **Windows**, use `"command": "cmd"` and start `args` with `"/c", "npx", "-y", …`.
- The first start downloads the server (about 15 MB) and can take up to a minute.

## Check that it works

```bash
npx -y loam-mcp --check --folder "<FULL PATH OF THE LOAM FOLDER>"
```

A good answer says `Node … (ok)`, `Loam knowledge base: yes` and a search line. If it says the folder is **not** a knowledge base yet, tell the person to open https://loam-ai.pages.dev/app and choose the same folder, then run the check again. Do not create the files yourself.

## Then

Tell the person to start a new chat and say: `Run my Loam onboarding interview`.

## Good to know

- The tools all start with `loam_`. Use them to read; write only when the person asks, and show what changed.
- The server needs no account, key or password. Never ask the person for one, and never point it at any other folder.
- Source, documentation and issues: https://github.com/YeremeyevTimofey/Loam
