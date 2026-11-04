# Keeva interface direction

Updated 4 November 2026.

## References

- [Juice](https://www.juice.agency/): inspected the live page, font declarations, and scrolling implementation. Its light Riposte body typography, enormous custom SVG wordmark, small monospaced labels, and generous spacing inform Keeva’s hierarchy. Keeva uses self-hosted, open-source DM Sans (light display weight) and Geist Mono to express that direction. Juice’s Lenis configuration uses smooth wheel scrolling with `lerp: 0.1` and native touch scrolling; Keeva uses the same settings, driven by Lenis’s animation frame loop.
- [Janis Wanger](https://janiswanger.ch/): inspected the canvas pointer trail and overlapping card interactions. Keeva adapts the fading particles and background-click bursts to the logo palette, with a 180-particle limit. The logo cards fan outward, lift `.45rem`, and rotate with `cubic-bezier(.22,1,.36,1)` over 700ms; CTA arrows shift `.4rem` over 500ms. These effects are scoped to `.login-hero`.
- Supplied SÈVE dashboard image: broad, quiet left rail, branding at the top, and restrained uppercase navigation vertically centered. Keeva adapts the structure in pale mint with a text-first active state and a compact horizontal text menu on small screens.
- Supplied 752×752 ribbon-padlock artwork: used directly in the brand and hero. `public/keeva-logo.webp` is a compressed copy; `public/favicon.png` is its resized icon.

## Palette and layout

- Forest hero `#0e1d17`; mint highlight `#d6f5bf`; light canvas `#f2f5ee`; rail `#e3eadc`; ink `#183126`.
- The hero is the login screen. **Secure Vault Initialization** precedes gateway configuration, wallet connection, inspection, restore, and authorization. Setup errors and operation feedback appear in the login card.
- Four authenticated views retain their functional credential, audit, and storage tools. Their surfaces, settings drawer, and wallet picker share the logo palette.
- Status labels and values reflect actual application state and readings. Decorative cards represent encryption and storage concepts, not credential records.

## Motion and accessibility

- Lenis yields to native scrolling in dialogs, selects, textareas, and nested scroll areas. Reduced-motion users retain native document scrolling. Switching between login and vault resets the scroll position.
- The canvas is noninteractive and decorative. Trails stop over form controls and the login card. They run only for fine mouse pointers, stop when the hero leaves the viewport or the document becomes hidden, and release observers/listeners on unmount. No idle animation loop runs without particles.
- Keyboard focus indicators, anchor navigation, native wallet dialogs, and settings focus restoration are retained. Reduced motion disables particle drawing, card transforms, CTA travel, and page travel.
- Locking immediately unmounts decrypted content; no exit transition delays removal.
