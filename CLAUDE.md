# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
pnpm install
pnpm exec playwright install chromium   # first time only, or if browsers are missing/mismatched
pnpm exec tsc --noEmit                  # typecheck — there is no separate lint or test suite

pnpm template                           # renders ONLY the frame to output/template-blank.png for approval
pnpm test                                # renders 1 sample card both coin sides to output/test/ (2 images) — quick comparison, not the real batch
pnpm build -- right                     # DEFINITIVE print batch: output/cards/{id}.png + output/print/sheet-{n}.pdf
pnpm build -- left                      # same, using the left-coin mirrored frame
pnpm build -- --side=left               # --side=<left|right> flag form also accepted
pnpm build                              # prompts interactively for the side if none is given — never guesses
pnpm dev -- left                        # watch mode (data/, src/, assets/frame/); optional side, defaults to right, never prompts
```

`pnpm build` and `pnpm dev` both require a coin side (`left`/`right`) because the frame ships as two mirrored PNGs — see Architecture below. `pnpm build` is the only command that touches `output/cards/` and `output/print/`; `pnpm test` never does.

## Architecture

**`src/config.ts` is the single source of truth.** Every physical dimension (card size, DPI, slot boxes, font min/max, footer layout, A4 imposition grid) lives here as named constants. `card.html.ts`, `render.ts`, and `impose.ts` all read from it — nothing else should hardcode a pixel or mm value. When recalibrating against a new frame image, this is the only file that needs editing.

**Render pipeline**: `card.html.ts` builds a self-contained HTML/CSS string for one card → `render.ts` loads it in a Playwright/Chromium page (via a temp file + `file://`, not `page.setContent`, because `file://` `<img>` sources are blocked from an `about:blank` origin) → binary-searches font-size (and, for the description, line-height) per text slot until it fits its box, using `measureFit`'s DOM measurements → screenshots the page to `output/cards/{id}.png`. If text can't fit even at the configured minimum size, `TextOverflowError` aborts the whole build with the card id/slot/measured-vs-available size — text is never silently clipped.

**Coin side (left/right) mirroring**: the approved frame art comes in two files, `assets/frame/frame-right.png` and `frame-left.png` (horizontal mirror images of each other — the price coin sits in the opposite corner). `config.ts`'s `getSlotsForSide(side)` returns a horizontally-mirrored copy of **every** slot box for `"left"` (not just `price`) — `SLOTS.art` is deliberately off-center (shifted away from the coin, ~1mm clearance), so mirroring only the price would collide the art box into the coin on the left variant. `price` additionally gets a small hand-tuned nudge beyond the pure mirror (see `mirrorPriceBoxMm`) because the two frame PNGs aren't pixel-perfect mirrors of each other.

**Card size / imposition**: cards are A7 (74×105mm, 874×1240px @ 300dpi) — this was deliberately kept as-is after evaluating a Magic-card-size (2.5×3.5in) alternative; A7 rotated 90° already tiles A4 at 8-up (2 cols × 4 rows) with ~0.03% waste, which is the mathematical maximum for that card size, so there was nothing to gain by resizing. `impose.ts` reads `data/cards-to-reapeat.json` (`{"cards-to-repeat":[{"id":..., "times-to-repeat": N}]}`) and expands each listed id to `N` **total** copies (not additional) before chunking into 8-per-sheet PDFs; unknown ids in that file log a warning and are ignored rather than failing the build.

**Footer**: each card has exactly 3 attribute cells (`Card.atributos`), resolved via `resolveFooterAttr` — a card's own `icone`/`rotulo` win, otherwise falls back to `TYPE_FOOTER_DEFAULTS[tipo][index]` in config.ts. Labels are never rendered (icon + value only, per the reference art's style); `rotulo` is kept only as self-documentation of what each position means. Autofit for the footer value uses `data-max-width-px` (an explicit ceiling passed to `measureFit`, see `render.ts`) instead of a wrapping fixed-width box, so the icon+value pair can shrink-wrap and center as a tight unit within its cell rather than floating inside an oversized invisible box.

**Known gotcha**: `assets/frame/*.png` are authored at a much higher native resolution (~1054×1492) than the render canvas (874×1240) — Chromium scales them via CSS `width/height:100%`. Never measure calibration coordinates against the raw PNG's own pixels; always measure against an actual rendered screenshot (`output/template-blank.png` or a card render), or work in percentages of image dimensions, which are resolution-independent.

**Cross-platform script entry-point check**: scripts use `import.meta.url === pathToFileURL(process.argv[1]).href` to detect "run directly" — the naive `` `file://${process.argv[1]}` `` string-concat version silently never matches on Windows (backslashes, no triple-slash), so the script's `main()` never runs when invoked directly.
