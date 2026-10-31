# Your Loam knowledge base

This folder is your AI assistant's memory of how you work. It is plain files on your computer. You own it, and nothing leaves your machine.

## How to use it

1. Open Loam in your browser and choose this folder.
2. Connect your AI agent (Claude, Cursor, Codex, VS Code, Gemini CLI and others): the app shows the steps for each, and points the connection at this folder.
3. Tell your agent: `Run my Loam onboarding interview`

After that, ask your agent for your recurring work in plain words, for example `Do my weekly client report`. When the result needs a change, tell it `Remember this correction` and it will be right next time.

## What is inside

- `profile.md` — who you are and how you like to work
- `processes/` — one folder per recurring task: a description, examples of good results, and your corrections
- `skills/` — reusable skills: the starter pack, ones built from your processes, and ones you imported
- `context/` — what your assistant should know about the people, clients, projects, goals, metrics and terms around your work: one short line each, in `people.md`, `entities.md`, `goals.md`, `metrics.md` and `glossary.md`. A file appears when its first entry is saved
- `AGENTS.md` — the protocol your agent follows. Leave it alone unless you know why
- `.loam/` — Loam's own files: interview script, search index, history of changes
- `.claude/skills/` and `.agents/skills/` — copies of your skills for agents that read files (Claude Code, Cursor, Codex, Gemini CLI, Copilot and others). Loam overwrites only the folders that start with `loam-`
- `CLAUDE.md`, `GEMINI.md` — one line each, pointing the agent to `AGENTS.md`

You never need to edit these files by hand. The Loam app shows every change before it is saved and keeps the old version in `.loam/history`.

Questions or problems? The source, the documentation and the place to report an issue are at https://github.com/YeremeyevTimofey/Loam.
