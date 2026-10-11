---
type: process
slug: monthly-invoice-check
title: Monthly invoice check
frequency: monthly
minutes_per_run: 120
automation: needs-access
inputs: [timesheet export, accounting export, retainer list]
output: spreadsheet
runs: 0
corrections: 0
updated: 2026-09-30
---

# Monthly invoice check

## What we do

Before the invoices go out on the first working day, I check that the hours on each retainer match the timesheets and that the amounts match the contracts. I report mismatches to Pieter by the third working day.

## Steps

1. Export the timesheets for each of my clients for the month.
2. Compare the hours with the retainer terms in the contract list.
3. Flag any client where hours are over or under by more than ten percent.
4. Send Pieter the list of flags with a one-line reason for each.

## What a good result looks like

A short table: client, contracted hours, logged hours, difference, reason. No client missing. Every flag has a reason that Pieter does not need to ask about.

## Constraints

Never contact a client about an invoice. Queries go to Pieter. Never change a timesheet entry.

## What it takes

This needs read access to the timesheet and accounting exports, which the agent does not have today. A human must always check the result, because it concerns money. The risk of a wrong flag is moderate: an unnecessary query to Pieter costs time, but a missed one costs money.
