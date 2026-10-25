# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Non-technical office workers: account managers, HR, marketers, operators. They have an AI agent (Claude Desktop, Claude Code, Cursor, Codex, Gemini CLI and others) but do not use a terminal, write markdown, edit JSON or know what MCP is. A landing-page visitor is deciding whether to try Loam; an app user is looking at their own work map, a process, their skills or the health of their folder.

## Product Purpose

Loam asks a person about their work through their own AI agent (four questions, three to five minutes), builds a local knowledge base of plain markdown files (profile, recurring processes, examples of good results, corrections, skills), shows what is worth automating and how many hours a year it saves, and connects the base to their agents over MCP. Every correction makes the next result closer to the person's own example. Success: a task that used to need the same context pasted again is done with one or two messages and looks like the person's best work.

## Positioning

Everything stays on the person's disk: no servers, no accounts, no outgoing requests from the app or the server. Every change is shown as a diff before it is written. It works with any agent that can start a local MCP server, and browser chats get a read-only "Copy for any chat".

## Operating Context

The site has three surfaces: the landing page `/`, the install guide `/install` and the app `/app` (React; a real folder only in Chrome or Edge, a demo with a filled example in any browser). Setup is one message to the agent, or a `.mcpb` double-click for Claude Desktop.

## Capabilities and Constraints

- Light theme only (a dark theme was considered and declined). Interface language: English.
- Fonts are self-hosted; the only external request on the whole site is cookie-free analytics on `/` and `/install`. The app ships a Content-Security-Policy that blocks connections.
- WCAG 2.1 AA (checked with axe), touch targets of at least 44 px, no horizontal scrolling at 375 px, keyboard use, works offline after the first visit, `prefers-reduced-motion` respected.
- The landing page weighs under 100 KB without images; no React on the landing page.
- Colours live only in `src/styles/tokens.css`; components use them through Tailwind and never write a colour themselves.

## Brand Commitments

- Name: Loam, fertile soil. The product prepares the ground; the agent brings in the harvest. No "magic", no "AI-powered".
- Logo: three stacked rounded bars, a slice of soil.
- "Sarah" on the landing page is a fictional demo persona; all her numbers come from the demo base.

## Evidence on Hand

- Product screenshots from the real app: `public/shots/step-2…4`. The interview picture and the three Claude Desktop install pictures are drawn illustrations (`scripts/assets/mocks/`).
- Industry figures on the landing page (85%, 25%, 1 in 3) come from the specification and are labelled "Industry figures, 2026".
- No customers, testimonials, press or pricing exist; none may be invented.

## Product Principles

1. Plain words for non-technical people; nothing to configure by hand.
2. Show before writing: every change is a visible diff.
3. The person's own examples and corrections outrank anything generic.
4. Nothing leaves the person's computer.
