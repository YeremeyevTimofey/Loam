# Contributing

Thank you for helping. Loam is small on purpose: a change should be traceable to a need, and nothing should be added "for later".

## Before you start

- Read [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) (what is built and why) and [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) (commands).
- For anything bigger than a fix, [open an issue](https://github.com/YeremeyevTimofey/Loam/issues) first to agree on the idea.
- The ground rules are not negotiable, and `npm run check:rules` enforces most of them: no server, no accounts, no LLM calls inside the product, no tracking in the app, no network requests, no external fonts or scripts, no colours outside `tokens.css`, and nothing that weakens the skill security model.

## Making a change

```bash
npm install
npm run dev
# ... edit ...
npm run verify     # types, tests, build, rules audit, both packages, browser tests
```

- Keep to the surrounding style: comments only where they explain why; no abstractions for a single use.
- Every behaviour change comes with a test. Scanner changes need a malicious fixture **and** a benign sentence that must still pass.
- User-facing text is plain English for a non-technical reader: no jargon in the interface.
- If you change the sample knowledge base, run `npm run demo:build`; if you change an address, edit `site.config.json` and run `npm run readme`.

## Pull requests

Describe what changed and why, and say which checks you ran (the [pull request template](.github/PULL_REQUEST_TEMPLATE.md) lists them). Found a security problem instead? Please [report it privately](https://github.com/YeremeyevTimofey/Loam/security/advisories/new). Small, focused pull requests are merged fastest.
