---
name: incoming-doc-review
description: Break down an incoming document - what it is about, what it asks of me, what is unclear and which deadlines it sets
source: starter
capabilities: [read]
license: MIT
origin: bundled
reviewed: true
review_note: Written and reviewed by the Loam team
scanner: pass
---

# Incoming document review

Use this when the user pastes a contract, a brief, a request, a policy or any document they received and wants to know what to do with it.

## Before you write

- Read `profile.md` to know the user's role, so you can judge what is relevant to them.
- If the document names a client, a project, a person or a system, call `loam_get_context` with those names.

## What to produce

1. **What it is**: one or two sentences. Type of document, who it is from, what it is about.
2. **What it asks of me**: every action, approval or answer the document requires from the user, as a short list. Quote the words that create the obligation.
3. **Deadlines**: every date or time limit, with what it applies to. If a date is only implied, mark it as implied.
4. **What is unclear**: terms, numbers or clauses that are vague, missing or contradict each other. Phrase each as a question the user could ask.
5. **Worth a second pair of eyes**: anything that looks like money, legal responsibility or a commitment beyond the user's role. Say why, and do not give legal advice.

## Rules

- Stay with what the document says. When you are interpreting, say "this seems to mean".
- Keep the whole answer to about one page.
- Use plain words. Explain jargon in a few words the first time it appears.

Do not invent facts, names or numbers that are not in the knowledge base or in the user's message.
