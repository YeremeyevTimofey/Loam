---
name: contract-negotiation
description: "Produce \"Contract negotiation\" the way this user wants it, using their examples and corrections."
source: generated
capabilities: [read]
updated: 2026-09-01
---

# Contract negotiation

When a client renews or a new client signs, I negotiate scope, price and terms with them, usually over two or three calls, then agree the final wording with Lena and Pieter.

## Before you write

1. There is no example yet in `processes/contract-negotiation/examples/`. Ask the user for one if the result matters.
2. Read `processes/contract-negotiation/corrections.md`. Corrections override everything else, including the example.
3. Take tone and constraints from `profile.md`. For the people, clients, goals and terms the task involves, call `loam_get_context` with the task text.

## Steps

1. Agree the walk-away points with Lena before the first call.
2. Run the calls with the client and note what each side asked for.
3. Send a written summary of every agreement the same day.
4. Get Lena and Pieter to approve the final wording before it goes out.

## What a good result looks like

A signed contract with no surprises for either side, and a written trail of what was agreed on each call.

## Constraints

Nothing is agreed on a call without Lena's walk-away points. Nothing is promised that Operations cannot deliver.

## Rules from corrections (newest first)

No corrections yet. After the first run, ask the user whether anything should change.

## Do not

Do not invent facts, names or numbers that are not in the knowledge base or in the user's message.
