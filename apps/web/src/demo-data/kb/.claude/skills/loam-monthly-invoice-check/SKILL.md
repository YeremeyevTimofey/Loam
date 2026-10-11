---
name: loam-monthly-invoice-check
description: "Produce \"Monthly invoice check\" the way this user wants it, using their examples and corrections."
---

# Monthly invoice check

Before the invoices go out on the first working day, I check that the hours on each retainer match the timesheets and that the amounts match the contracts. I report mismatches to Pieter by the third working day.

## Before you write

1. There is no example yet in `processes/monthly-invoice-check/examples/`. Ask the user for one if the result matters.
2. Read `processes/monthly-invoice-check/corrections.md`. Corrections override everything else, including the example.
3. Take tone and constraints from `profile.md` and names from `context/entities.md`.

## Steps

1. Export the timesheets for each of my clients for the month.
2. Compare the hours with the retainer terms in the contract list.
3. Flag any client where hours are over or under by more than ten percent.
4. Send Pieter the list of flags with a one-line reason for each.

## What a good result looks like

A short table: client, contracted hours, logged hours, difference, reason. No client missing. Every flag has a reason that Pieter does not need to ask about.

## Constraints

Never contact a client about an invoice. Queries go to Pieter. Never change a timesheet entry.

## Rules from corrections (newest first)

No corrections yet. After the first run, ask the user whether anything should change.

## Do not

Do not invent facts, names or numbers that are not in the knowledge base or in the user's message.
