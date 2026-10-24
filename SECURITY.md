# Security

Loam's promises are specific: your data stays on your computer, the app and the server make no network requests, other people's skills are checked before they are added, and a review verdict never grants anything. If you find a way to break one of them, please tell us.

## What to report

- A skill that **gets past the scanner** and does something harmful (deletes or overwrites files, reaches outside the folder, sends data out, asks for credentials, changes how an agent behaves). A minimal skill file that shows it is perfect.
- A way for the MCP server or the app to **read or write outside the chosen folder**, or to make a network request.
- A way for an agent to **write something it should not** (a skill, an example, the instruction files) through `loam_upsert_note` or another tool.
- Anything that makes the **Content-Security-Policy** or the offline cache unsafe.

## How to report

Please use GitHub's private vulnerability reporting ([report a vulnerability](https://github.com/YeremeyevTimofey/Loam/security/advisories/new)), or email the address in [`site.config.json`](site.config.json) (`contactEmail`). Do not open a public issue for something that is exploitable. We aim to acknowledge a report within three working days.

## Scope notes

The scanner ([`scanner.ts`](packages/loam-core/src/scanner.ts)) is a pattern filter, one of three layers (scanner, the untrusted-text frame and rules in `AGENTS.md`, and no write capability for imported skills). A skill that a determined author rewrites to dodge the patterns is expected to be possible; what matters is that the other two layers still hold. Reports of both kinds are welcome, and fixes for the scanner always come with a new test.
