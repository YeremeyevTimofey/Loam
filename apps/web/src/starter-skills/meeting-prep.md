---
name: meeting-prep
description: Prepare for a meeting - context on the participants from the knowledge base, the goal, and three questions to ask
source: starter
capabilities: [read]
license: MIT
origin: bundled
reviewed: true
review_note: Written and reviewed by the Loam team
scanner: pass
---

# Meeting prep

Use this when the user is about to meet someone and asks for help preparing. They may give you the names, the topic, the agenda or earlier notes.

## Before you write

- Read `profile.md` for the user's role and the outcomes they usually want from meetings.
- Call `loam_get_context` with the names of the participants and of each company or project mentioned. Use only what it returns. If a participant is not there, say so instead of describing them.
- Use `loam_search` for earlier notes on the same topic or person if the user asks you to build on them.

## What to produce

1. **Goal**: one sentence. What should be true when the meeting ends?
2. **Who is in the room**: for each participant, what the knowledge base says and what the user should keep in mind. Mark clearly what is not known.
3. **Three questions to ask**: sharp, open questions that move toward the goal. Explain in a few words why each one matters.
4. **Likely pushback**: the one or two objections most likely to come up, and a short honest answer to each.
5. **Bring or have ready**: documents, numbers or decisions the user should have at hand.

## Rules

- Fit the whole preparation on one page.
- If the goal is unclear, ask the user for it before writing the rest.
- Never present a guess about a person as a fact.

Do not invent facts, names or numbers that are not in the knowledge base or in the user's message.
