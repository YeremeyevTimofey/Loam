---
name: Loam
description: Work context for AI agents: a quiet paper-and-ink surface with one lime sprout.
colors:
  paper: "#fafaf9"
  surface: "#ffffff"
  ink: "#18181b"
  ink-muted: "#61616a"
  hairline: "#e4e4e7"
  soil: "#a4a4a5"
  sprout-lime: "#c6f432"
  sprout-lime-pressed: "#b4e41c"
  sprout-wash: "#f1fad2"
  sprout-ink: "#46720b"
  warning: "#b45309"
  warning-ink: "#a14a08"
  danger: "#b91c1c"
  success: "#15803d"
  success-ink: "#146c36"
typography:
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 1.35rem + 3.6vw, 3.75rem)"
    fontWeight: 600
    lineHeight: 1.04
    letterSpacing: "-0.035em"
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "32px / 42px from 768px"
    fontWeight: 600
    lineHeight: 1.12
    letterSpacing: "-0.03em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "26px / 34px from 768px"
    fontWeight: 600
    lineHeight: 1.18
    letterSpacing: "-0.025em"
  subtitle:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "19px / 20px from 768px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.012em"
  lead:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "18px / 21px from 768px"
    fontWeight: 400
    lineHeight: 1.55
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px / 17px from 768px"
    fontWeight: 400
    lineHeight: 1.65
  secondary:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "14px"
    lineHeight: 1.5
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
spacing:
  unit: "8px"
  gutter: "20px / 32px from 768px"
  section: "56px / 96px from 768px"
  measure: "680px"
  wide: "1120px"
components:
  button-primary:
    backgroundColor: "{colors.sprout-lime}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 20px"
  button-primary-hover:
    backgroundColor: "{colors.sprout-lime-pressed}"
    textColor: "{colors.ink}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 20px"
  button-ghost:
    textColor: "{colors.sprout-ink}"
    height: "44px"
    padding: "0 8px"
  badge-neutral:
    backgroundColor: "{colors.sprout-wash}"
    textColor: "{colors.sprout-ink}"
    typography: "{typography.label}"
    rounded: "{rounded.sm}"
    height: "22px"
    padding: "0 8px"
  nav-item-current:
    backgroundColor: "{colors.sprout-wash}"
    textColor: "{colors.sprout-ink}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 12px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.lg}"
    padding: "16px / 24px from 768px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    height: "44px"
    padding: "0 12px"
  closing-panel:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
    rounded: "{rounded.lg}"
---

# Design System: Loam

## Overview

**Creative North Star: "The Sprout in the Soil"**

Loam is fertile ground: the product prepares it, the person's agent brings in the harvest. The surface is therefore quiet paper and ink, plain enough that a non-technical person reads it like a well-set document, with one living colour on top: a lime sprout. Lime marks only what is alive on a screen: the logo's top layer, the one action to take, the phrase that carries the promise, the current place in the app, and the text the visitor selects.

Density is calm. Long text sits in a column of about 70 characters on the same left edge as the logo; pictures and tables are allowed the full width. Nothing is decorative: no gradients, no glass, no glow. Motion is quick feedback plus one short moment on the landing page.

The system is light only (a dark theme was considered and declined) and lives in `src/styles/tokens.css`; components reach it through Tailwind and never write a colour of their own.

**Key Characteristics:**
- Paper, ink and one lime accent; lime is always a fill with ink on it.
- One self-hosted variable face, Geist, for everything except code.
- Reading first: 16–17px body at 1.65 line height, lines held to the measure.
- Flat surfaces separated by hairlines; one soft shadow for floating layers only.
- One authored motion moment; everything else is 150ms feedback, and nothing moves for people who ask for less motion.

## Colors

Neutral paper and near-black ink with a single high-energy yellow-green, chosen because it is what grows out of loam and because it stands apart from the blue of most software.

### Primary
- **Sprout Lime** (#c6f432): the logo's top layer, primary buttons, the highlighter, text selection, the timeline dots in the example. Always a fill, always with Ink on it (13.8:1).
- **Pressed Lime** (#b4e41c): hover state of lime fills (ink on it 11.9:1).
- **Sprout Wash** (#f1fad2): the quiet form of the accent: current navigation item, neutral badges, selected options, added lines in a diff.
- **Sprout Ink** (#46720b): the accent's text shade. Links, ghost buttons, text on Sprout Wash, borders of selected options, focus rings (5.3–5.7:1 on every light surface).

### Neutral
- **Paper** (#fafaf9): the page.
- **Surface** (#ffffff): cards, tables, inputs, secondary buttons.
- **Ink** (#18181b): text, the logo's deepest layer, and the closing panel on the landing page.
- **Muted Ink** (#61616a): secondary text, metadata, the lead paragraph (5.9:1 on Paper).
- **Hairline** (#e4e4e7): every border and divider.
- **Soil** (#a4a4a5): Ink at 38% over Paper (`--soil`). The logo's middle layer and the hover border of secondary buttons and cards.

Status colours (warning #b45309, danger #b91c1c, success #15803d, with their -ink text shades on 8% tints) carry meaning in words as well as colour and are not part of the brand.

### Named Rules
**The Sprout Rule.** Lime is never text, a border or a focus ring on a light surface (1.3:1). Those jobs belong to Sprout Ink. `apps/web/test/design.test.ts` fails the build if `text-accent`, `border-accent`, `ring-accent` or `outline-accent` appear.

**The One Lime Rule.** Lime is the only saturated colour in the brand. A second accent, a gradient or a lime tint of a whole region is a different product.

## Typography

**Display Font:** Geist (self-hosted variable `woff2`, 29 KB, with system-ui fallback)
**Body Font:** Geist
**Label/Mono Font:** the system monospace stack, for code only

**Character:** Geist is a plain, Swiss-leaning sans with open counters; set tight in headings and loose in body text it reads as calm and current. It was the user's choice; a design detector flags it as widely used, and that trade is accepted.

### Hierarchy
- **Display** (600, 36px growing to 60px with the screen, 1.04, -0.035em): the landing hero only.
- **Headline** (600, 32px / 42px, 1.12, -0.03em): the one page title of the install guide, the 404 page and every app screen.
- **Title** (600, 26px / 34px, 1.18, -0.025em): section headings.
- **Subtitle** (600, 19px / 20px, 1.3): card and step headings.
- **Lead** (400, 18px / 21px, 1.55, Muted Ink): the paragraph under the hero, held to 36rem.
- **Body** (400, 16px / 17px, 1.65): all reading text, at most 680px wide.
- **Secondary** (400, 15px, 1.6, Muted Ink): descriptions, notes, metadata.
- **Label** (500, 13px): badges.

### Named Rules
**The Measure Rule.** Prose never runs wider than the measure (680px, about 70 characters at 17px). Headings balance their lines; paragraphs avoid orphans (`text-wrap: balance` and `pretty`).

**The Tabular Rule.** Numbers that are compared (hours, statistics) use tabular figures.

## Layout

An 8px rhythm. Content sits in a 1120px wide container with 20px side padding on phones and 32px from 768px. Reading blocks use the `column` layout: same left edge as the logo, children held to the 680px measure; grids, tables and screenshots may use the full width. Sections are separated by 56px on phones and 96px from 768px, the hero by a little more. Below 640px every action stacks full-width; grids collapse to one column; nothing scrolls sideways at 375px.

## Elevation & Depth

Flat by default. Depth comes from Paper versus white Surface and a 1px Hairline, never from shadows on resting content. Floating layers (menus, dialogs) take one soft shadow.

### Shadow Vocabulary
- **Float** (`box-shadow: 0 4px 16px -4px rgba(24, 24, 27, 0.12)`): menus and dialogs only.

### Named Rules
**The Flat Paper Rule.** A card has a hairline or nothing; it never has a border and a shadow together.

## Shapes

Gently rounded and consistent: 6px for small parts (badges), 10px for controls (buttons, inputs, navigation items, code blocks), 14px for containers (cards, screenshots, dialogs, the closing panel). Dots are full circles. The logo is three 4px bars with fully rounded ends, a slice of soil: lime on top, Soil in the middle, Ink at the bottom; on the ink app-icon tile the lower layers turn light so all three read at 16px.

## Components

### Buttons
- **Shape:** gently rounded (10px), 44px high.
- **Primary:** Sprout Lime with Ink text, 20px side padding on the site, 16px in the app. One primary action per view.
- **Hover / Focus / Press:** lime deepens to Pressed Lime; a 2px Sprout Ink focus ring 2px out (lime on the ink panel); pressing sinks the button by 1px. 150ms with a calm deceleration (`cubic-bezier(0.16, 1, 0.3, 1)`).
- **Secondary:** white Surface, Ink text, Hairline border that darkens to Soil on hover.
- **Ghost:** Sprout Ink text, underline on hover (app toolbar actions).

### Chips
- **Style:** badges 22px high, 13px medium text, 6px corners. Neutral: Sprout Wash with Sprout Ink. Status: the 8% status tint with its ink shade. Muted: Hairline border with Muted Ink.
- **State:** a badge always says its meaning in words.

### Cards / Containers
- **Corner Style:** 14px.
- **Background:** white Surface on Paper.
- **Shadow Strategy:** none at rest (see Elevation).
- **Border:** 1px Hairline; clickable cards darken it to Soil on hover.
- **Internal Padding:** 16px, 24px from 768px.

### Inputs / Fields
- **Style:** white Surface, 1px Hairline, 10px corners, 44px high, caret in Sprout Ink.
- **Focus:** border turns Sprout Ink plus the 2px focus ring.
- **Error / Disabled:** error text in danger red with words; disabled at half opacity.

### Navigation
- **Style:** 16px medium labels in 44px targets. The current screen sits on Sprout Wash in Sprout Ink; the others are Muted Ink and turn Ink on hover. On phones the tabs wrap onto their own row under the logo.

### The Highlighter
A lime band under the lower 38% of a phrase, ink text on top (`.hl`). It marks the single most important phrase of a page (on the landing page: "how you work"). On load it sweeps in once from the left.

### The Closing Panel
The landing page ends on an ink panel with Paper text, secondary text at 75% Paper, and the lime primary action: the darkest, calmest surface on the page, used once.

### Motion
The landing page has one authored moment, played once on load and under a second: the logo's lower layers settle, the lime layer sprouts from the left, and the highlighter sweeps under the hero phrase. Pointing at the logo lets the lime layer grow again. Everything else is 150ms state feedback; app content fades in with a 4px rise in 200ms. With `prefers-reduced-motion` none of it plays and every element is shown in its final state.

## Do's and Don'ts

### Do:
- **Do** put Ink on lime and Sprout Ink wherever the accent's hue must be read as text, a border or a focus ring.
- **Do** keep one primary (lime) action per view; everything else is secondary or ghost.
- **Do** hold prose to the 680px measure on the logo's left edge, and let tables, grids and screenshots use the wide container.
- **Do** take every colour from `tokens.css` through Tailwind's utilities; regenerate brand files with `npm run assets` and pictures with `npm run screenshots` after a token changes.
- **Do** give every animation a reduced-motion path and keep content visible before and after it plays.

### Don't:
- **Don't** set lime text, lime borders or lime focus rings on Paper or Surface.
- **Don't** highlight more than one phrase per page, or use the highlighter as decoration.
- **Don't** add gradients, glass, glow, a second accent or a dark theme.
- **Don't** add shadows to resting cards or combine a border with a shadow.
- **Don't** put a small label above a heading; context goes in a sentence under it.
- **Don't** add scroll-triggered reveals or entrance animations to sections; the landing page has its one moment.
