# Save My Brain AI — Design System

## Font CDN Links (add to index.html `<head>`)

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Noto+Sans+TC:wght@400;500;700&family=Noto+Sans+JP:wght@400;500;700&display=swap" rel="stylesheet">
```

## Colour Palette

| Token | Hex | Use |
|-------|-----|-----|
| `--color-bg` | `#0F172A` | Page background |
| `--color-surface` | `#1E293B` | Cards, sidebar, header |
| `--color-surface-2` | `#334155` | Inputs, hover states |
| `--color-accent` | `#0EA5E9` | Buttons, links, active nav |
| `--color-success` | `#10B981` | Completed tasks, saved |
| `--color-warning` | `#F59E0B` | P2 tasks, caution |
| `--color-danger` | `#EF4444` | P1 tasks, errors |
| `--color-text` | `#F8FAFC` | Primary text |
| `--color-text-muted` | `#94A3B8` | Labels, secondary text |

## Component Inventory

- `.card` — Standard content card (surface bg, border, shadow)
- `.card-hover` — Clickable card with lift effect on hover
- `.btn-primary` — Teal filled button (main CTAs)
- `.btn-secondary` — Ghost button with border (secondary actions)
- `.btn-ghost` — Transparent button (nav, minor actions)
- `.btn-danger` — Red button (delete, destructive)
- `.input` — Text/email/password input field
- `.badge-p1/p2/p3/p4` — Priority level badges
- `.badge-success/warning/danger` — Status badges
- `.sidebar` + `.nav-item` — Left navigation
- `.header` — Top header bar
- `.alert-error/success/info` — Inline alert messages
- `.spinner` — Loading spinner

## Do / Don't Rules

✅ DO:
- Use `var(--token-name)` for every colour, spacing, and font value
- Use `.card` as the base for every content section
- Use `.btn-primary` only for the most important CTA on the page
- Add `card-hover` when the card is clickable

❌ DON'T:
- Use hardcoded hex values like `#0EA5E9` directly in component files
- Use inline `style=""` for colours or spacing
- Create new colour values not in tokens.css
- Use font sizes in px directly — use `var(--text-sm)` etc.

## New Components
When adding a new component pattern, add the class to `components.css` following the naming convention. Never duplicate a pattern that already exists.
