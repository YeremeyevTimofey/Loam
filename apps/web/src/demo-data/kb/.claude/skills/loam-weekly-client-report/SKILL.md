---
name: loam-weekly-client-report
description: "Produce \"Weekly client report\" the way this user wants it, using their examples and corrections."
---

# Weekly client report

Every Friday I write a one-page report for each tier-one client. It says how the week went in numbers, what changed and why, what we recommend, and the one thing we need from the client.

## Before you write

1. Read the newest good example, `processes/weekly-client-report/examples/good-02.md`, and match its structure, length and tone.
2. Read `processes/weekly-client-report/corrections.md`. Corrections override everything else, including the example.
3. Take tone and constraints from `profile.md`. For the people, clients, goals and terms the task involves, call `loam_get_context` with the task text.

## Steps

1. Pull last week's numbers from the Looker Studio dashboard, split by channel.
2. Check them against the HubSpot export for leads and deals.
3. Read my notes from the week for anything that explains a change.
4. Write the report in the usual shape: headline numbers, what changed, recommendation, one ask with a date.
5. Send it by noon as a short email with the document attached.

## What a good result looks like

The client can read it in two minutes. The numbers come first and each one names its channel. The explanation is plain and honest, including when a week was bad. It ends with exactly one ask and a date.

## Constraints

No exclamation marks. Never promise a result or a date the team has not confirmed. Never mention one client in another client's report. Healthcare clients (Brightside Dental) cannot receive any claim about treatment results.

## Rules from corrections (newest first)

1. Name the channel (paid search, paid social, email) next to every number. Clients get confused by blended totals. Was: "Conversions were up 9% this week.". Should be: "Paid search conversions were up 9% (214 vs 196), paid social was flat.".
2. End every report with exactly one ask for the client, with a date. Not two, not a general "let us know". Was: "Let us know if you have any thoughts on the plan.". Should be: "Could you confirm the revised budget by Wednesday 16 September?".
3. Never use exclamation marks, and never write "unfortunately". State what happened instead. Was: "Unfortunately the email campaign underperformed!". Should be: "The email campaign opened at 18% against a target of 24%.".
4. Put the traffic and conversion numbers in the first paragraph, before any commentary. Was: "Overall it was a positive week for the account, with several highlights worth noting.". Should be: "Sessions 18,420 (+12%), conversions 214 (+9%). The rise came from paid search.".

## Examples

- `processes/weekly-client-report/examples/good-02.md` — good example (newest)
- `processes/weekly-client-report/examples/good-01.md` — good example

## Do not

Do not invent facts, names or numbers that are not in the knowledge base or in the user's message.
