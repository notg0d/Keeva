# Keeva interface direction

Research reviewed before layout implementation, 4 November 2026.

## References

- [Awwwards: DeepBook](https://www.awwwards.com/sites/deepbook), Site of the Day, 3 November 2026. The linked [DeepBook site](https://deepbook-v2-wip.webflow.io/) uses a black canvas, generous negative space, oversized sans-serif headlines, contained navigation, and a single bright action color. Its showcase includes mobile and scroll-interaction studies; the live site includes GSAP and scroll-animation tooling. Keeva adapts the hierarchy and contained surfaces to an application-sized type scale.
- [Awwwards security collection](https://www.awwwards.com/websites/security/) and [fintech collection](https://www.awwwards.com/websites/fintech/): reviewed the available listings. Several security entries are honorable mentions; those are not treated as daily or monthly winners.
- [Godly](https://godly.website/) now redirects to Recent. Its current visual feed uses pill filters, spacious typography, and rounded modular previews. These inform compact navigation and localized interaction feedback. The redirect prevents treating it as the earlier Godly collection.
- [Lapa Ninja bento collection](https://www.lapa.ninja/category/bento-grid/): the Beaucoup and other modular examples show that asymmetry works best with shared spacing and clear content priority.
- [Bento Grids](https://bentogrids.com/): reviewed the dark gallery and modular compositions. Use a dominant card alongside smaller supporting cards, with consistent gutters and restrained corner radii.
- [Siteinspire](https://www.siteinspire.com/) returned rate-limit/network errors. No direct visual findings are attributed to it.

## Application

- Canvas `#09090b`; translucent `#18181b` panels; `#27272a` borders.
- Emerald `#10b981` for encryption, cyan `#06b6d4` for RPC, violet `#8b5cf6` for storage, amber for rotation/review.
- Self-hosted Inter and Geist Mono, with compact labels, strong page headings, and tabular numeric values.
- A stable workspace rail, a compact utility bar, and responsive 12-column bento layouts. Initialization is the first content shown, followed by configuration, wallet connection, and vault authorization.
- Framer Motion spring transitions use stiffness 300 and damping 30. Card hover scale is 1.02 on pointer devices. Primary actions have a short hover shimmer. Status rings pulse only for a fresh successful service reading.
- A native modal dialog retains focus containment while its drawer and blurred backdrop animate in and out. Reduced-motion preferences remove travel, scaling, shimmer, and pulse.
- Clipboard checks follow successful clipboard writes. Credential confirmation follows a real storage receipt and synchronization. No invented telemetry, credential examples, or synthetic activity charts.
- Locking immediately unmounts the decrypted workspace; its exit animation never delays removal.
