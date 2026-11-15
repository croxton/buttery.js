# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 1.1.0 - 2026-11-15

### Added

- Breakpoint overrides on instances and props (`md: {...}`, `'max-md': false`). Tailwind CSS v4 breakpoint names by default, configurable with `mount({ breakpoints })`. Overrides are re-applied as soon as the viewport crosses a breakpoint.
- Declarative `data-buttery*` attributes in HTML, with breakpoint variants (`data-buttery-translate-md`). Create instances with `scan(root?, options?)` and destroy them with `release(root?)`. Props with their own range get their own instance.
- Prop values with several numbers, e.g. `translate: '0 -100px'` or `transform: 'translateY(10px) rotate(5deg)'`. Each number is interpolated separately and the text around them is kept. This allows animating compositor properties (`translate`, `rotate`, `scale`) directly.
- [Lenis](https://github.com/darkroomengineering/lenis) support: pass a Lenis instance to `mount({ lenis })` and set `timeline: 'lenis'` on instances it should drive. `nativeOnTouch` runs them on native timelines on touch devices unless Lenis smooths touch scrolling.
- `instance.usesLenis()`.
- `direct` accepts any `Element`, e.g. SVG elements.
- Test suite: unit and DOM integration tests (Vitest + happy-dom), and browser tests in Chromium and Firefox comparing native timeline and JS fallback output.
- `prepublishOnly` runs the build and `publint`.
- Seasons demo.

### Changed

- `create()` throws when a prop's `from`, `to` and `via` don't have the same structure.
- `create()` removes an instance whose data is invalid.
- Custom properties with space-separated lists are registered with list syntax (e.g. `<length-percentage>+`). Values that can't be registered use the JS fallback.
- Inline styles are tracked per instance, so props that are turned off are removed.
- Styles on measured elements are reset before measuring, so ranges don't drift on recalculation.
- Performance: active instance lists are cached instead of filtered every frame, values are only recalculated when an instance's progress changes, and recalculation reads all measurements before writing any styles.
- Value parsing, validation and interpolation moved to `lib/values.js`, and breakpoint resolution to `lib/breakpoints.js`.

## 1.0.1 - 2026-11-08

### Added

- Demo page.

## 1.0.0 - 2026-11-07

### Added

- Initial release, based on [basicScroll](https://github.com/electerious/basicScroll) by Tobias Reich.
- Native scroll-driven animations (`ScrollTimeline` + Web Animations API), with a `requestAnimationFrame` fallback behind the same API.
- Explicit `mount()` / `unmount()` lifecycle.
- Percentage relative anchors (e.g. `50%-40%`) and an optional `via` midpoint for props.
