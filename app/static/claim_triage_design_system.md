---
name: "Claim Triage"
description: "An interactive, experience-first light-mode design system built on 60% Crisp Porcelain (#F8FAFC), 30% Deep Midnight Navy (#0F172A), and 10% Vibrant Emerald (#10B981) for insurance fraud investigators."
---

## Overview

Claim Triage is an interactive decision-support experience for insurance fraud investigators. It pairs a **Crisp Porcelain** content canvas (60%, `#F8FAFC`) with **Deep Midnight Navy** navigation, dark hero stages, and crisp typography (30%, `#0F172A`), accented by **Vibrant Emerald** primary actions, positive metrics, and live status indicators (10%, `#10B981`).

## Colors

- **Crisp Porcelain (`surface`) — 60%**: Clean `#F8FAFC` content canvas with `#FFFFFF` elevated interactive stages and `#F1F5F9` recessed wells.
- **Deep Midnight Navy (`midnight`, `on-surface`) — 30%**: `#0F172A` for navigation, dark hero stages, and high-contrast typography.
- **Vibrant Emerald (`primary`, `emerald`) — 10%**: `#10B981` for primary action buttons (paired with `#0F172A` text for high contrast), positive metrics, and live status indicators; `#047857` (`emerald-text`) for emerald text on light Porcelain.
- **Risk colors**: Reserved strictly for High (`#BE123C`), Medium (`#B45309`), and Low (`#047857`) risk indicators.

```yaml
colors:
  primary: "#10B981"
  on-primary: "#0F172A"
  emerald: "#10B981"
  emerald-text: "#047857"
  emerald-bright: "#34D399"
  midnight: "#0F172A"
  on-midnight: "#F8FAFC"
  midnight-muted: "#94A3B8"
  midnight-surface: "#1E293B"
  accent: "#10B981"
  accent-text: "#047857"
  surface: "#F8FAFC"
  on-surface: "#0F172A"
  on-surface-variant: "#475569"
  surface-container: "#FFFFFF"
  surface-container-low: "#F1F5F9"
  surface-container-high: "#E2E8F0"
  porcelain: "#F8FAFC"
  on-porcelain: "#0F172A"
  on-porcelain-variant: "#475569"
  outline: "#CBD5E1"
  outline-dark: "#334155"
  risk-high: "#BE123C"
  risk-high-on-light: "#BE123C"
  on-risk-high: "#FFFFFF"
  risk-high-container: "#FFE4E6"
  on-risk-high-container: "#881337"
  risk-medium: "#B45309"
  on-risk-medium: "#FFFFFF"
  risk-medium-container: "#FEF3C7"
  on-risk-medium-container: "#78350F"
  risk-low: "#047857"
  risk-low-on-light: "#047857"
  on-risk-low: "#FFFFFF"
  risk-low-container: "#D1FAE5"
  on-risk-low-container: "#064E3B"
  risk-bar-low: "#94A3B8"
  error: "#BE123C"
  on-error: "#FFFFFF"
  error-container: "#FFE4E6"
  on-error-container: "#881337"
```

## Typography

Display and section headings use **Plus Jakarta Sans** for crisp geometric authority. Interface controls, tables, and 15px body prose use **Inter**. Claim IDs and tabular figures use **JetBrains Mono**.

```yaml
typography:
  display-lg:
    fontFamily: "Plus Jakarta Sans"
    fontSize: 44px
    fontWeight: 700
    lineHeight: 50px
    letterSpacing: -0.8px
  display-lg-mobile:
    fontFamily: "Plus Jakarta Sans"
    fontSize: 32px
    fontWeight: 700
    lineHeight: 38px
    letterSpacing: -0.4px
  display-md:
    fontFamily: "Plus Jakarta Sans"
    fontSize: 34px
    fontWeight: 700
    lineHeight: 40px
    letterSpacing: -0.5px
  display-md-mobile:
    fontFamily: "Plus Jakarta Sans"
    fontSize: 26px
    fontWeight: 700
    lineHeight: 32px
    letterSpacing: -0.3px
  headline-lg:
    fontFamily: "Plus Jakarta Sans"
    fontSize: 26px
    fontWeight: 600
    lineHeight: 32px
    letterSpacing: -0.3px
  headline-md:
    fontFamily: "Plus Jakarta Sans"
    fontSize: 20px
    fontWeight: 600
    lineHeight: 26px
    letterSpacing: -0.2px
  title-md:
    fontFamily: "Inter"
    fontSize: 16px
    fontWeight: 600
    lineHeight: 24px
    letterSpacing: 0px
  body-md:
    fontFamily: "Inter"
    fontSize: 15px
    fontWeight: 400
    lineHeight: 24px
    letterSpacing: 0px
  body-sm:
    fontFamily: "Inter"
    fontSize: 14px
    fontWeight: 400
    lineHeight: 21px
    letterSpacing: 0px
  label-lg:
    fontFamily: "Inter"
    fontSize: 14px
    fontWeight: 500
    lineHeight: 20px
    letterSpacing: 0px
  label-sm:
    fontFamily: "Inter"
    fontSize: 12px
    fontWeight: 500
    lineHeight: 16px
    letterSpacing: 0px
  mono-sm:
    fontFamily: "JetBrains Mono"
    fontSize: 13px
    fontWeight: 500
    lineHeight: 18px
    letterSpacing: 0px
```

## Layout & Spacing

Full-width interactive canvas on Crisp Porcelain (`#F8FAFC`) anchored by a sticky Deep Midnight Navy (`#0F172A`) navigation header and dark hero/telemetry bands.

```yaml
spacing:
  gutter-xs: 4px
  gutter-sm: 8px
  gutter-md: 16px
  gutter-lg: 24px
  gutter-xl: 32px
  section: 48px
  page-margin: 32px
```

## Elevation & Depth

- Elevated white Porcelain stages (`bg-surface-container`) float above `#F8FAFC` with crisp perimeter borders (`border-outline`) and soft ambient shadows.
- Dark Midnight Navy hero sections (`bg-midnight text-on-midnight`) anchor interactive simulations and telemetry readouts.
- Primary Emerald actions (`bg-primary text-on-primary`) carry a clean tactile highlight and subtle emerald glow.

## Shapes

```yaml
rounded:
  none: 0px
  sm: 6px
  DEFAULT: 8px
  md: 12px
  lg: 16px
  full: 9999px
```

## Motion & Micro-interaction

```yaml
motion:
  state-change:
    duration: 120ms
    delay: 0ms
    timingFunction: ease-out
  panel-enter:
    duration: 200ms
    delay: 0ms
    timingFunction: cubic-bezier(0.2, 0, 0, 1)
```

## Voice & Content Strategy

- **Tone**: Calm, direct, plain-spoken, and transparent about uncertainty. Never use marketing hype ("AI-powered", "seamless", "revolutionary") or imply automated enforcement.
- **Persistent disclaimer**: Every screen carries the exact footer line: *"Decision support only. A high rank means look at this claim first. It does not show that fraud occurred, and this tool never rejects a claim."*

## Components

Component implementations live as individual HTML sticker sheet files in `components/`.

- **Button** → `@components/button.html`: `button-primary`, `button-icon`, `button-with-icon`
- **Input Field** → `@components/input-field.html`: `input-field-text`, `input-field-icon`
- **Table** → `@components/table.html`: `table-standard`, `table-interactive`, `table-selectable`
- **Tabs** → `@components/tabs.html`: `tabs-horizontal`, `tabs-with-icon`
