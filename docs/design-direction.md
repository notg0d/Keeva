# Keeva interface direction

Updated 4 November 2026.

## References

- [Juice](https://www.juice.agency/): inspected the live page, font declarations, and scrolling implementation. Its light Riposte body typography, enormous custom SVG wordmark, small monospaced labels, and generous spacing inform Keeva’s hierarchy. Keeva uses self-hosted, open-source DM Sans (light display weight) and Geist Mono to express that direction. Juice’s Lenis configuration uses smooth wheel scrolling with `lerp: 0.1` and native touch scrolling; Keeva uses the same settings, driven by Lenis’s animation frame loop.
- [Janis Wanger](https://janiswanger.ch/): inspected the live background, cursor movement, pattern shuffle, and the published `ChladniBackground` and `CursorPlateTrail` rendering code. The defining effect is a vibrating-plate simulation: grains move rapidly across high-amplitude regions and collect at the quiet nodes of two superimposed sine modes. The reference starts with mode numbers 5 and 3, uses fine pixel deposits with persistent afterimages, and morphs between modes. Its separate cursor layer adds dense clusters that follow the same field; the inspected version has a 3,200-grain cursor pool and approximately 2.8-second lives.
- Keeva implements its own two-layer Chladni renderer in `src/lib/heroParticleField.ts`. A mint sand field sits behind the hero, with five geometric modes and 2.2-second transitions. Pointer movement lays down closely spaced grains. Background clicks add a concentrated burst, a twin ripple, and outward displacement through the field. **Shift the pattern** provides the same pattern change through a native keyboard-accessible button. The logo cards fan outward, lift `.45rem`, and rotate with `cubic-bezier(.22,1,.36,1)` over 700ms; CTA arrows shift `.4rem` over 500ms. All effects are scoped to `.login-hero`.
- Supplied SÈVE dashboard image: broad, quiet left rail, branding at the top, and restrained uppercase navigation vertically centered. Keeva adapts the structure in pale mint with a text-first active state and a compact horizontal text menu on small screens.
- Supplied 752×752 ribbon-padlock artwork: used directly in the brand and hero. `public/keeva-logo.webp` is a compressed copy; `public/favicon.png` is its resized icon.

## Palette and layout

- Forest hero `#0e1d17`; mint highlight `#d6f5bf`; light canvas `#f2f5ee`; rail `#e3eadc`; ink `#183126`.
- The hero is the login screen. **Secure Vault Initialization** precedes gateway configuration, wallet connection, inspection, restore, and authorization. Setup errors and operation feedback appear in the login card.
- Four authenticated views retain their functional credential, audit, and storage tools. Their surfaces, settings drawer, and wallet picker share the logo palette.
- Status labels and values reflect actual application state and readings. Decorative cards represent encryption and storage concepts, not credential records.

## Motion and accessibility

- Lenis yields to native scrolling in dialogs, selects, textareas, and nested scroll areas. Reduced-motion users retain native document scrolling. Switching between login and vault resets the scroll position.
- Both canvases are noninteractive and decorative. The ambient field animates at 30 fps, or 24 fps on compact devices; its resolution and density scale to the device. A cached 512×512 signed wave field and pixel-buffer rendering keep the simulation inexpensive. The field starts from a node-weighted distribution, so its structure is present as it appears.
- The cursor trail uses growing typed-array buffers, with no particle-count ceiling or live-particle replacement. Loose grains have 7–9-second natural lives. Beyond 120 CSS pixels from the cursor, attraction toward the pattern's zero-amplitude lines accelerates with distance. Bilinear sampling of the same signed wave field provides a local slope in CSS-pixel space: loose grains flow into the curves, then gently wander along them. This attraction follows the current field throughout pattern morphs. Leaving the pointer area applies the strongest attraction to the remaining trail. Grains that stay within 3 CSS pixels of a pattern line for 0.18 seconds fade out over the next 0.8 seconds. Once started, that fade completes even if the pattern moves. Loose grains instead fade during their final 2.4 seconds; expired and fully merged grains are removed during compaction.
- Pointer emission is enabled for fine mouse pointers and pauses over form controls and the login card. Touch retains native scrolling and can use the explicit pattern control. The animation pauses when the hero leaves the viewport, the document becomes hidden, or a settings/wallet dialog opens. A dedicated pause/resume button freezes the ambient field. Unmounting releases animation frames, buffers, observers, and listeners.
- Keyboard focus indicators, anchor navigation, native wallet dialogs, and settings focus restoration are retained. Reduced motion disables particle drawing, card transforms, CTA travel, and page travel.
- Locking immediately unmounts decrypted content; no exit transition delays removal.
