---
version: alpha
name: Apple Music
website: https://www.apple.com/apple-music/
description: 'Apple''s marketing surface for its streaming service, where the standard
  Apple.com chrome (white parchment, near-black ink, Action Blue #0066cc) gets reshaped
  around a saturated radial gradient hero that runs from Apple Music Red (#fa243c)
  through magenta (#ff4dc3) into a deep aubergine (#591962). The headline lands at
  SF Pro Display 128px / 600 with -0.256px tracking — a typographic scale Apple reserves
  for product moments it wants felt, not read. The page keeps Apple''s pill-CTA geometry
  (#0066cc on white, 10px and 980px radii), the global nav at #1d1d1f, and SF Pro
  Text 17px body, then layers chromatic gradient bands between dark photographic tiles
  for editorial music-app rhythm.'
seo:
  title: Apple Music Design System for React — Music Red, SF Pro, 21 components
  metaDescription: 'Apple Music''s design system as a DESIGN.md file. Music Red #fa243c,
    SF Pro Display 128px, 21 colors, 21 components. For React, Next.js, and AI tools.'
  highlights:
  - Radial gradient hero — Music Red (#fa243c) bleeds into magenta (#ff4dc3) and aubergine
    (#591962), a chromatic intensity Apple.com itself refuses
  - Display headline at 128px / 600 / -0.256px tracking — the SF Pro Display ceiling,
    used once per surface
  - Pill-and-radius binary — 10px (56 uses) for tiles, 980px (12 uses) for every CTA,
    nothing in between for interactive grammar
  - Quiet pill CTA inside loud canvas — Action Blue (#0066cc, 64 hits, all text and
    border) stays the same hex against the gradient roar
  - Three-tile rhythm — gradient hero, dark photographic immersion (#1d1d1f), then
    chromatic discovery panel, repeated as the page scrolls
  tags:
  - Music, Video & Streaming
  lastUpdated: '2026-05-13'
  author:
    name: Dov Azencot
    url: https://x.com/dovazencot
  opening: |
    Apple Music's marketing page is the loudest surface in Apple's web property — the rare moment Apple lets chromatic gradient do the work its product photography usually carries. The hero is a radial wash of Music Red (#fa243c) bleeding into magenta (#ff4dc3) and aubergine (#591962), with SF Pro Display set at 128px / 600 and -0.256px tracking floating above it in pure white. Below the hero, the page reverts to Apple's house grammar — white parchment cards at 10px radius, near-black ink (#1d1d1f) for body, and Action Blue (#0066cc) for every pill CTA — then alternates into dark photographic tiles for "Listening Experience" and "Music Discovery", each anchored by another gradient panel. The system is restrained Apple chrome carrying a saturated music-product payload.
    This page captures the system as a DESIGN.md file built on the Google Labs spec for machine-readable design tokens. Inside: 21 color tokens covering the gradient ramp (Music Red, Crimson #c00020, Magenta #ff4dc3, Aubergine #591962, plus three coral-orange supporting stops), Apple's structural blacks and parchments, and the Action Blue interactive accent; 11 typography tokens running on SF Pro Display for the 21–128px display ladder and SF Pro Text for the 12–17px body ladder; six radius tokens centered on the 10px / 980px binary; an 8.4-step spacing scale anchored on 9.6px (78 occurrences) and 24px (15 occurrences); and 21 component recipes covering the gradient hero, dark immersion tile, discovery panel, blue pill CTA, parchment plan card, and the persistent global nav.
    Drop the file into Claude, Cursor, GitHub Copilot, or any tool that reads structured design tokens. The agent produces React components that match Apple Music's actual voice — gradient hero on radial wash, dark photographic immersion, parchment plan card, blue pill CTA — rather than a generic music-app template. Use it as a reference when you need a streaming product page that breaks its parent brand's chrome restraint without abandoning it, a teaching artifact for chromatic discipline within a single-accent system, or a starting point for any subscription product whose marketing wants to feel emotional rather than catalog-grade.
  related:
  - href: /design
    title: Browse all design systems
    description: The full directory of DESIGN.md files on shadcn.io, with live mockups
      for each.
  - href: https://www.apple.com/apple-music/
    title: Apple Music — official page
    description: The live marketing page this DESIGN.md extracts from.
  - href: https://github.com/google-labs-code/design.md
    title: The DESIGN.md specification
    description: Google Labs' open spec for machine-readable design system files.
  questions:
  - id: primary-color
    title: What is Apple Music's primary brand color?
    answer: Music Red (#fa243c) — a saturated coral-red with 51 occurrences in the
      extraction (16 text, 10 background, 16 border, 9 gradient), riding alongside
      a darker Crimson (#c00020, 13 gradient hits) inside the radial hero wash. The
      interactive accent is still Apple's house Action Blue (#0066cc, 64 hits) — every
      pill CTA on the page uses the same blue you'd find on apple.com. Music Red carries
      identity in the gradient ramp; Action Blue carries every click.
  - id: typography
    title: What typography does Apple Music use, and what should I use if SF Pro isn't
      available?
    answer: SF Pro Display for the 21–128px display ladder (h2, h3, h4) and SF Pro
      Text for the 12–17px body and UI ladder. The hero headline 'For the love of
      music.' lands at 128px / 600 / -0.256px tracking with 128px line height — the
      upper ceiling of Apple's typographic system. Fallback walks 'system-ui, -apple-system,
      BlinkMacSystemFont' which resolves to real SF Pro on Apple platforms; Inter
      is the closest open-source substitute, with letter-spacing tightened by -0.01em
      on display sizes to recreate Apple-tight cadence.
  - id: gradient-hero
    title: How is the hero radial gradient constructed?
    answer: 'A radial wash centered roughly upper-left, ramping from Music Red (#fa243c)
      through Crimson (#c00020) into Magenta (#ff4dc3) and Aubergine (#591962), with
      coral-orange supporting stops (#dc4c24, #e43240, #e83273, #991e2f) each carrying
      4 gradient hits. The headline floats over the wash in pure white at 128px /
      600. No CSS shadow on the type — contrast comes entirely from the saturation
      drop between near-white text and the chromatic mid-tones of the wash.'
  - id: tile-rhythm
    title: How does Apple Music structure its long marketing page?
    answer: 'As a three-beat rhythm. Beat 1: chromatic gradient hero with massive
      display headline. Beat 2: a ''Start listening for free'' parchment plan-card
      row at 10px radius, with three pill cards and pill CTAs in Action Blue (#0066cc).
      Beat 3: dark photographic immersion tile on #1d1d1f canvas (''Listening Experience.
      Music at its most immersive.'') at 80px / 600 SF Pro Display. The pattern repeats
      with a chromatic ''Music Discovery'' panel and a dark ''Exclusive Content''
      tile, all separated by 24px and 80px vertical spacing rather than borders.'
  - id: pill-cta
    title: Why is the primary CTA still blue when the hero is red and magenta?
    answer: 'Action Blue (#0066cc) is the universal Apple click signal — 32 text uses
      and 32 border uses across the page, all on white parchment surfaces inside plan
      cards and inline links. Apple keeps the gradient roar to the hero band; every
      actual conversion moment sits on a parchment card where Action Blue is the only
      interactive color. The brand-side red lives in the gradient ramp and in the
      pill CTAs of the global Apple Music ribbon nav (filled #fa243c). Two surfaces,
      two grammars.'
  - id: use-in-project
    title: Can I use this DESIGN.md to build my own music or subscription page?
    answer: Yes — feed it to Claude, Cursor, or GitHub Copilot. The agent will reproduce
      Apple Music's voice (radial gradient hero with massive SF Pro Display, parchment
      plan cards with blue pill CTAs, dark photographic immersion bands) rather than
      a generic streaming-app theme. Tokens are quoted and ready to paste into Tailwind
      config, CSS variables, or a component library. Pair with high-quality lifestyle
      photography and a single chromatic gradient ramp to get the full effect — the
      system depends on saturation contrast between gradient band and parchment band.
colors:
  brand-music-red: '#fa243c'
  brand-music-red-deep: '#d6143a'
  gradient-crimson: '#c00020'
  gradient-coral: '#dc4c24'
  gradient-rose: '#e43240'
  gradient-pink: '#e83273'
  gradient-magenta: '#ff4dc3'
  gradient-aubergine: '#591962'
  gradient-burgundy: '#991e2f'
  primary-action-blue: '#0066cc'
  primary-action-blue-focus: '#0071e3'
  ink: '#1d1d1f'
  ink-secondary: '#6e6e73'
  ink-muted: '#86868b'
  canvas: '#ffffff'
  canvas-parchment: '#f5f5f7'
  surface-pearl: '#fafafc'
  surface-cool: '#e8e8ed'
  hairline: '#d2d2d7'
  surface-near-black: '#0d161f'
  surface-black: '#000000'
  surface: '#fff8f7'
  surface-dim: '#f4d2d0'
  surface-bright: '#fff8f7'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#fff0ef'
  surface-container: '#ffe9e7'
  surface-container-high: '#ffe1e0'
  surface-container-highest: '#fddad8'
  on-surface: '#291716'
  on-surface-variant: '#5e3f3e'
  inverse-surface: '#402b2a'
  inverse-on-surface: '#ffedeb'
  outline: '#926e6c'
  outline-variant: '#e7bcba'
  surface-tint: '#bf0025'
  primary: '#bb0024'
  on-primary: '#ffffff'
  primary-container: '#e70e31'
  on-primary-container: '#fffbff'
  inverse-primary: '#ffb3b0'
  secondary: '#005cba'
  on-secondary: '#ffffff'
  secondary-container: '#5095fe'
  on-secondary-container: '#002d61'
  tertiary: '#00676a'
  on-tertiary: '#ffffff'
  tertiary-container: '#008286'
  on-tertiary-container: '#f3ffff'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#ffdad8'
  primary-fixed-dim: '#ffb3b0'
  on-primary-fixed: '#410006'
  on-primary-fixed-variant: '#93001a'
  secondary-fixed: '#d7e3ff'
  secondary-fixed-dim: '#aac7ff'
  on-secondary-fixed: '#001b3e'
  on-secondary-fixed-variant: '#00458e'
  tertiary-fixed: '#8af3f8'
  tertiary-fixed-dim: '#6cd6db'
  on-tertiary-fixed: '#002021'
  on-tertiary-fixed-variant: '#004f52'
  background: '#fff8f7'
  on-background: '#291716'
  surface-variant: '#fddad8'
  music-red-deep: '#d6143a'
  action-blue-focus: '#0071e3'
  black: '#000000'
typography:
  hero-display:
    fontFamily: SF Pro Display, system-ui, -apple-system, sans-serif
    fontSize: 128px
    fontWeight: 600
    lineHeight: 1.0
    letterSpacing: -0.256px
  display-xl:
    fontFamily: SF Pro Display, system-ui, -apple-system, sans-serif
    fontSize: 80px
    fontWeight: 600
    lineHeight: 1.05
    letterSpacing: -1.2px
  display-lg:
    fontFamily: SF Pro Display, system-ui, -apple-system, sans-serif
    fontSize: 72px
    fontWeight: 600
    lineHeight: 1.0
    letterSpacing: -0.648px
  display-md:
    fontFamily: SF Pro Display, system-ui, -apple-system, sans-serif
    fontSize: 48px
    fontWeight: 600
    lineHeight: 1.08
    letterSpacing: -0.144px
  heading-lg:
    fontFamily: SF Pro Display, system-ui, -apple-system, sans-serif
    fontSize: 32px
    fontWeight: 600
    lineHeight: 1.13
    letterSpacing: 0.128px
  heading-md:
    fontFamily: SF Pro Display, system-ui, -apple-system, sans-serif
    fontSize: 28px
    fontWeight: 600
    lineHeight: 1.14
    letterSpacing: 0.196px
  lead:
    fontFamily: SF Pro Display, system-ui, -apple-system, sans-serif
    fontSize: 24px
    fontWeight: 600
    lineHeight: 1.17
    letterSpacing: 0.216px
  subhead:
    fontFamily: SF Pro Display, system-ui, -apple-system, sans-serif
    fontSize: 21px
    fontWeight: 400
    lineHeight: 1.19
    letterSpacing: 0.231px
  body:
    fontFamily: SF Pro Text, system-ui, -apple-system, sans-serif
    fontSize: 17px
    fontWeight: 400
    lineHeight: 1.47
    letterSpacing: -0.374px
  body-strong:
    fontFamily: SF Pro Text, system-ui, -apple-system, sans-serif
    fontSize: 17px
    fontWeight: 600
    lineHeight: 1.24
    letterSpacing: -0.374px
  caption:
    fontFamily: SF Pro Text, system-ui, -apple-system, sans-serif
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.33
    letterSpacing: -0.12px
  hero-display-mobile:
    fontFamily: plusJakartaSans
    fontSize: 64px
    fontWeight: '600'
    lineHeight: '1.05'
    letterSpacing: -0.02em
rounded:
  none: 0px
  sm: 10px
  md: 18px
  lg: 30px
  xl: 36px
  pill: 980px
  DEFAULT: 0.5rem
  full: 9999px
spacing:
  xxs: 2px
  xs: 8.4px
  sm: 9.6px
  md: 12.8px
  base: 20px
  lg: 24px
  xl: 25px
  xxl: 52px
  section: 80px
components:
  global-nav:
    backgroundColor: '{colors.surface-black}'
    textColor: '{colors.canvas}'
    typography: '{typography.caption}'
    height: 44px
    padding: 0px 8px
  apple-music-ribbon:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.ink}'
    typography: '{typography.body-strong}'
    height: 52px
    padding: 0px 24px
  ribbon-cta:
    backgroundColor: '{colors.brand-music-red}'
    textColor: '{colors.canvas}'
    typography: '{typography.caption}'
    rounded: '{rounded.pill}'
    padding: 8.4px 12.8px
  hero-gradient-band:
    backgroundColor: '{colors.gradient-aubergine}'
    textColor: '{colors.canvas}'
    typography: '{typography.hero-display}'
    rounded: '{rounded.none}'
    padding: 80px 25px
    height: 700px
  hero-headline:
    backgroundColor: transparent
    textColor: '{colors.canvas}'
    typography: '{typography.hero-display}'
    padding: '0'
  hero-subcopy:
    backgroundColor: transparent
    textColor: '{colors.canvas}'
    typography: '{typography.lead}'
    padding: '0'
  button-primary-blue:
    backgroundColor: '{colors.primary-action-blue}'
    textColor: '{colors.canvas}'
    typography: '{typography.body}'
    rounded: '{rounded.pill}'
    padding: 11px 21px
    height: 44px
  button-primary-blue-focus:
    backgroundColor: '{colors.primary-action-blue}'
    textColor: '{colors.canvas}'
    rounded: '{rounded.pill}'
    border: 2px {colors.primary-action-blue-focus}
  button-secondary-pill:
    backgroundColor: transparent
    textColor: '{colors.primary-action-blue}'
    typography: '{typography.body}'
    rounded: '{rounded.pill}'
    padding: 11px 21px
    border: 1px {colors.primary-action-blue}
  plan-card:
    backgroundColor: '{colors.canvas}'
    textColor: '{colors.ink}'
    typography: '{typography.body}'
    rounded: '{rounded.sm}'
    padding: 24px
    border: 1px {colors.hairline}
  plan-card-eyebrow:
    backgroundColor: transparent
    textColor: '{colors.ink-secondary}'
    typography: '{typography.caption}'
    padding: '0'
  plan-card-title:
    backgroundColor: transparent
    textColor: '{colors.ink}'
    typography: '{typography.lead}'
    padding: '0'
  immersion-tile-dark:
    backgroundColor: '{colors.ink}'
    textColor: '{colors.canvas}'
    typography: '{typography.display-xl}'
    rounded: '{rounded.md}'
    padding: 80px 52px
  discovery-panel:
    backgroundColor: '{colors.gradient-pink}'
    textColor: '{colors.ink}'
    typography: '{typography.display-md}'
    rounded: '{rounded.md}'
    padding: 52px 25px
  exclusive-content-tile:
    backgroundColor: '{colors.surface-near-black}'
    textColor: '{colors.canvas}'
    typography: '{typography.display-xl}'
    rounded: '{rounded.md}'
    padding: 80px 52px
  karaoke-band:
    backgroundColor: '{colors.brand-music-red}'
    textColor: '{colors.canvas}'
    typography: '{typography.display-md}'
    rounded: '{rounded.md}'
    padding: 52px 25px
  album-art-thumb:
    backgroundColor: '{colors.surface-cool}'
    rounded: '{rounded.lg}'
    border: '0'
    height: 128px
  text-link:
    backgroundColor: transparent
    textColor: '{colors.primary-action-blue}'
    typography: '{typography.body}'
  fine-print-row:
    backgroundColor: '{colors.canvas-parchment}'
    textColor: '{colors.ink-muted}'
    typography: '{typography.caption}'
    padding: 24px 52px
  footer:
    backgroundColor: '{colors.canvas-parchment}'
    textColor: '{colors.ink-secondary}'
    typography: '{typography.caption}'
    padding: 52px 80px
---

