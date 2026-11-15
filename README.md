# Buttery.js

A lightweight, performance-focused scroll animation library. Based on [basicScroll](https://github.com/electerious/basicScroll) by Tobias Reich.

When the browser supports it, the library uses native **scroll-driven animations** (`ScrollTimeline` + Web Animations API). Otherwise it falls back to an event-driven `requestAnimationFrame` loop. Either way, you use the same API. 

Alternatively, if you already use [Lenis](https://github.com/darkroomengineering/lenis) for smooth scrolling, instances can be driven by Lenis directly instead of the native timeline or rAF loop.

## Contents

- [Demo](#demo)
- [What's different from the original](#whats-different-from-the-original)
- [Requirements](#requirements)
- [Setup](#setup)
- [API](#api)
    - [Module](#module)
    - [Instance](#instance)
- [Data](#data)
- [Props](#props)
- [Breakpoints](#breakpoints)
- [Declarative HTML](#declarative-html)
- [Rendering modes](#rendering-modes)
- [Custom properties and `@property`](#custom-properties-and-property)
- [iOS Safari](#ios-safari)
- [Tips](#tips)

## Demo

[Live demo](https://croxton.github.io/buttery.js/demo/)

## What's different from the original

| Feature | Original | Customised |
|---|---|---|
| Rendering | rAF loop that runs all the time | Native `ScrollTimeline` when supported, otherwise a rAF update that only runs on scroll |
| Lifecycle | Starts automatically on import | Explicit `mount()` / `unmount()` (works with page transitions, e.g. htmx) |
| Relative anchors | `top`, `middle`, `bottom` | Also percentages, e.g. `50%-40%` |
| Prop keyframes | `from` → `to` | Optional `via` midpoint value |
| Prop values | One number | Several numbers, e.g. `translate: '0 -100px'` or `'translateY(10px) rotate(5deg)'` |
| Resize handling | Recalculates on every `resize` | Ignores height-only resizes (iOS toolbar); recalculating on width changes is opt-in |
| Overscroll | Animations follow the rubber-band bounce | Scroll position is clamped to the scrollable range |
| Viewport height | `window.innerHeight` | Stable `documentElement.clientHeight` |
| Style writes | Every frame | Only when a value changes; all reads happen before writes |
| Zero-length ranges | Division by zero | Handled |
| Back/forward cache | Not handled | Refreshes on `pageshow` |
| Responsive | Same config at every size | [Breakpoint](#breakpoints) overrides (Tailwind names by default), re-applied live |
| Setup | JavaScript only | Also [`data-buttery` attributes](#declarative-html) in HTML |

## Requirements

Use it from npm with a bundler, or drop in a `<script>` tag. The npm build lists `parse-unit` and `eases` as dependencies; the script-tag build bundles them.

Native scroll timelines need `ScrollTimeline`, `Animation`, `KeyframeEffect` and `CSS.registerProperty` (Chrome/Edge 115+, Safari 26+, including all browsers on iOS 26+). Other browsers, such as current Firefox, use the JavaScript fallback automatically.

## Setup

### Install

With npm:

```bash
npm install @croxton/buttery
```

```javascript
import * as buttery from '@croxton/buttery'
```

Or with a script tag, which exposes a `buttery` global:

```html
<script src="https://unpkg.com/@croxton/buttery/dist/buttery.min.js"></script>
<script>
  const buttery = window.buttery
</script>
```

### Usage

```javascript
// Start listening for scroll (safe to call more than once)
buttery.mount()

const instance = buttery.create({
  elem: document.querySelector('.element'),
  from: 'top-bottom',
  to: 'bottom-top',
  direct: true,
  props: {
    '--ty': {
      from: '0px',
      to: '-100px'
    }
  }
})

instance.start()
```

Use the CSS variables in your stylesheet:

```css
.element {
  transform: translateY(var(--ty));
}
```

When the page is replaced (for example, on an htmx navigation), clean up:

```javascript
buttery.unmount()
```

## API

### Module

#### `mount(options?)`

Adds the scroll, resize, orientation and `pageshow` listeners, plus a `ResizeObserver` that watches the document height. Call it before or after creating instances. Extra calls are ignored until `unmount()` is called.

| Option | Type | Default | Description |
|---|---|---|---|
| `recalculateOnResize` | `Boolean` | `false` | Call `calculate()` on every instance with `track: true` when the viewport **width** changes |
| `timeline` | `Boolean` | `true` | Allow native scroll timelines. `false` forces the JavaScript fallback for every instance |
| `lenis` | `Lenis` | `null` | A [Lenis](https://github.com/darkroomengineering/lenis) instance. Drives instances that use `timeline: 'lenis'`. See [Lenis](#lenis) |
| `nativeOnTouch` | `Boolean` | `true` | On touch devices, run `timeline: 'lenis'` instances on native timelines unless Lenis smooths touch scrolling (`syncTouch`). See [On touch devices](#on-touch-devices) |
| `breakpoints` | `Object` | Tailwind's | Breakpoint names and min-widths. See [Breakpoints](#breakpoints) |

```javascript
buttery.mount({ recalculateOnResize: true })
```

#### `unmount()`

Removes all listeners (including the Lenis `scroll` subscription) and cancels pending frames. Destroys instances whose `elem` is no longer in the DOM. If no instances are left, the internal instance list is reset.

#### `create(data)`

Creates and returns an instance. Its `from`/`to` positions are calculated straight away. Nothing animates until `instance.start()` is called.

#### `scan(root?, options?)`

Creates and starts instances for elements with [`data-buttery` attributes](#declarative-html) in `root` (default `document`), including `root` itself. Returns the new instances.

- Elements that were scanned before are skipped, so it's safe to call again after new content is added.
- Instances of elements that have left the document are destroyed.
- Other instances are recalculated in the next frame, as new or removed content moves what comes after it.
- Elements with invalid attributes are skipped with a `console.warn`.
- Nothing is created when the user prefers reduced motion.

| Option | Type | Default | Description |
|---|---|---|---|
| `defaults` | `Object` | `{}` | Data merged under every element's config, e.g. `{ timeline: 'lenis' }` |
| `reducedMotion` | `Boolean` | `false` | Animate even when the user prefers reduced motion |

#### `release(root?)`

Destroys the instances `scan()` created for `root` and its descendants, e.g. before removing them.

#### `supportsTimeline()`

Returns `true` if the browser supports native scroll-driven animations.

```javascript
if (buttery.supportsTimeline()) {
  // e.g. remove CSS transitions that were only there to smooth the JS fallback
}
```

### Instance

| Method | Description |
|---|---|
| `start()` | Starts animating and applies the current state straight away |
| `stop()` | Stops animating. A native animation is paused at its current state |
| `calculate()` | Recalculates `from`/`to` positions and keyframes. Call it after the layout changes |
| `update()` | Applies the current state and runs the callbacks. Returns the calculated props |
| `destroy()` | Cancels any native animation and removes the instance |
| `isActive()` | Returns `true` if the instance is started |
| `getData()` | Returns the parsed data |
| `usesTimeline()` | Returns `true` if the instance runs on a native scroll timeline |
| `usesLenis()` | Returns `true` if the instance is driven by the Lenis instance passed to `mount()` |
| `syncTimeline()` | Rebuilds the native keyframes for the current scroll range. Called automatically when the page height changes |

To recalculate after a layout change:

```javascript
instance.calculate()
instance.update()
```

## Data

| Property | Type | Default | Description |
|---|---|---|---|
| `elem` | `Node` | — | Element used to work out relative `from`/`to` values. Required when `direct: true` |
| `from` | `String\|Number` | — | Where the animation starts. Absolute (`'0px'`) or relative (`'top-bottom'`) |
| `to` | `String\|Number` | — | Where the animation ends |
| `direct` | `Boolean\|Node` | `false` | Where the props are applied: `false` = `document.documentElement`, `true` = `elem`, a `Node` = that element |
| `track` | `Boolean` | `true` | Include in automatic recalculation when `mount({ recalculateOnResize: true })` is used |
| `props` | `Object` | `{}` | Properties to animate. See [Props](#props) |
| `inside` | `Function` | — | `(instance, percentage, props) => {}`. Runs while the scroll position is between `from` and `to` |
| `outside` | `Function` | — | `(instance, percentage, props) => {}`. Runs while it's outside that range |
| `timeline` | `'auto'\|Boolean\|'lenis'` | `'auto'` | Rendering mode. See [Rendering modes](#rendering-modes) |

### Relative values

A relative value has the form `{element anchor}-{viewport anchor}`. It means: the point where that position on the element meets that position in the viewport.

Each anchor can be `top`, `middle`, `bottom` or a **percentage**:

| Value | Meaning |
|---|---|
| `top-bottom` | The element's top meets the viewport's bottom |
| `middle-middle` | The element's middle meets the viewport's middle |
| `bottom-top` | The element's bottom meets the viewport's top |
| `50%-40%` | 50% down the element meets 40% down the viewport |

Relative values become absolute pixel positions when `calculate()` runs. If the layout changes later, call `calculate()` again.

## Props

```javascript
props: {
  '--opacity': {
    from: 0,
    via: 1,       // optional
    to: 0,
    timing: 'sineInOut'
  }
}
```

| Property | Type | Default | Description |
|---|---|---|---|
| `from` | `String\|Number` | — | Value at the start |
| `via` | `String\|Number` | — | Optional value halfway through (after easing). The animation goes `from` → `via` → `to` |
| `to` | `String\|Number` | — | Value at the end |
| `timing` | `String\|Function` | `'linear'` | Any [eases](https://www.npmjs.com/package/eases) name, or a function `(t) => t` |

Units come from `from` or `to`, so `from: 0, to: '100px'` animates in `px`.

Keys can be CSS custom properties (`--ty`) or normal CSS properties (`opacity`, `translate`, `transform`).

### Values with several numbers

A value can contain several numbers. Each one is interpolated on its own, and the text around them is kept:

```javascript
props: {
  translate: { from: '-45vw 40vh', to: '45vw -60vh', timing: 'quadIn' },
  rotate:    { from: '-10deg', to: '15deg' },
  transform: { from: 'translateY(0px) scale(1)', to: 'translateY(-100px) scale(1.2)' },
  '--pos':   { from: '0px 0px', to: '20px -100px' }
}
```

- `from`, `to` and `via` must have the same structure: the same number of numbers, and the same text around them. Otherwise `create()` throws an error.
- Units come from `from`, `to` or `via` for each number separately, so `from: '0 0'` with `to: '10px 20px'` works.
- Single values work exactly as before.

### Animate compositor properties directly

For the smoothest native animations, animate `translate`, `rotate`, `scale` or `opacity` directly instead of a custom property used in CSS:

```javascript
// Composited: the browser can run this off the main thread
props: { translate: { from: '0 0px', to: '0 -100px' } }

// Main thread: the custom property is recalculated every frame, then used in `transform`
props: { '--ty': { from: '0px', to: '-100px' } }   // with .el { transform: translateY(var(--ty)) }
```

Browsers can't run custom-property animations on the compositor, so they're recalculated on the main thread every frame. A busy main thread (scripts, image decoding) then makes them stutter. Animating `translate` and the like directly lets browsers that support it (such as Chrome) run the scroll-driven animation on the compositor.

`translate`, `rotate` and `scale` are separate properties, so different instances can animate them on the same element without overwriting each other. They combine with the element's `transform`, so use them on elements that don't need custom-property transforms. Custom properties still work as before. Use them when one value feeds several properties, or for anything the compositor can't animate.

## Breakpoints

Data and props can change with the viewport width. Breakpoints are mobile-first, like Tailwind: an `md` override applies from the `md` width up. A `max-md` override applies below it.

```javascript
buttery.create({
  elem, from: 'top-bottom', to: 'bottom-top',
  lg: { to: 'bottom-middle' },      // a different range from lg up
  'max-sm': false,                  // turned off below sm
  props: {
    translate: {
      from: '0 0px', to: '0 -100px',
      md: { to: '0 -300px' }        // further from md up
    },
    rotate: { from: '0deg', to: '10deg', xl: false }  // no rotation from xl up
  }
})
```

- Overrides are merged over the base values: matching `max-*` overrides first (largest first), then matching min-width overrides (smallest first). Later ones win.
- Instance overrides can set `from`, `to`, `timeline`, `direct` and `props`. Their `props` merge with the instance's props, one prop at a time.
- `false` turns the instance or prop off: its inline styles are removed and its native animation is cancelled. A later object override turns it on again, so `md: false, xl: {}` is off from `md` to `xl`.
- A prop with no `from`/`to` of its own is off until an override gives it values: `rotate: { md: { from: '0deg', to: '10deg' } }` only rotates from `md` up.
- Overrides are re-applied as soon as the viewport crosses a breakpoint, with no need for `recalculateOnResize`.

The default breakpoints are Tailwind CSS's:

| Name | Min width |
|---|---|
| `sm` | `40rem` (640px) |
| `md` | `48rem` (768px) |
| `lg` | `64rem` (1024px) |
| `xl` | `80rem` (1280px) |
| `2xl` | `96rem` (1536px) |

Use your own with `mount()`. Numbers are pixels, strings are CSS lengths:

```javascript
buttery.mount({ breakpoints: { tablet: 600, desktop: '75rem' } })
```

Call `mount()` before `scan()` when you use your own breakpoints, so the attribute names are read with them. Names can't be option names such as `from`, `to` or `props`, or start with `max-`.

## Declarative HTML

Animations can be added in HTML instead of JavaScript, then created with `scan()`:

```html
<img class="cow"
     data-buttery="from: top-bottom; to: bottom-top"
     data-buttery-translate="0 0px | 0 -100px; timing: quadIn"
     data-buttery-translate-md="0 0px | 0 -300px"
     data-buttery-rotate="-5deg | 5deg"
     data-buttery-opacity="0 | 1; to: 50%-40%">
```

```javascript
buttery.mount()
buttery.scan()
```

### `data-buttery`

Required. Holds the instance options as `key: value` pairs separated by `;`. All are optional:

| Option | Default | Description |
|---|---|---|
| `from` | `top-bottom` | Where the animation starts |
| `to` | `bottom-top` | Where it ends |
| `elem` | the element | A selector for the element to measure. The closest matching ancestor is used, otherwise the first match in the document |
| `timeline` | `auto` | `auto`, `true`, `false` or `lenis` |
| `track` | `true` | `true` or `false` |

Styles are always applied to the element with the attributes. Measuring the element itself works unless the element **moves itself**: `getBoundingClientRect()` includes its transform. In that case, point `elem` at an ancestor that doesn't move, e.g. `elem: section`. Before measuring, the library removes the styles and animations it applied to the measured element, so recalculating doesn't make positions drift. Even so, an element that starts far from where it sits in the layout is measured more reliably through a static ancestor.

### Props

Each prop is an attribute: `data-buttery-<prop>="from | to"` or `"from | via | to"`. Options follow after `;`:

| Option | Description |
|---|---|
| `timing` | An [eases](https://www.npmjs.com/package/eases) name |
| `from`, `to` | A range for this prop only. The prop gets its own instance, so it can animate over a different part of the scroll than the others |
| `prop` | The property name, when the attribute name can't express it (see below) |

Custom properties work too: `data-buttery---ty="0px | -100px"`. `|` and `;` inside brackets are ignored, so `translate(0, 10px) | translate(0, -10px)` works.

### Breakpoints in HTML

Add the breakpoint name to the end of an attribute:

```html
<div data-buttery
     data-buttery-max-sm="off"
     data-buttery-md="to: bottom-middle"
     data-buttery-translate="0 0px | 0 -100px"
     data-buttery-translate-md="0 0px | 0 -300px"
     data-buttery-rotate-lg="off">
```

- `data-buttery-<breakpoint>` overrides instance options (`from`, `to`, `timeline`).
- `data-buttery-<prop>-<breakpoint>` overrides a prop. An override can't change just one value, so give both `from | to`.
- `off` turns the instance or prop off at that breakpoint.
- A prop that only has breakpoint attributes is off below them.

HTML lowercases attribute names, and a name ending in a breakpoint name is read as a breakpoint override. For a custom property like `--gap-lg` or `--myVar`, name the attribute anything and set `prop`:

```html
<div data-buttery data-buttery-gap="0px | 20px; prop: --gap-lg">
```

A registered custom property that's turned off falls back to its registered initial value, not to a `var()` fallback.

### With htmx (or other partial page updates)

```javascript
document.body.addEventListener('htmx:beforeSwap', (e) => buttery.release(e.detail.target))
document.body.addEventListener('htmx:afterSettle', (e) => buttery.scan(e.detail.elt))
```

`scan()` also destroys the instances of elements that are no longer in the document, so `release()` is only needed to stop animations before the swap.

## Rendering modes

Each instance runs in one of three modes:

### Native timeline

The instance's range and props are turned into keyframes on a Web Animation linked to a document `ScrollTimeline`. The browser updates the values in step with scrolling, with no JavaScript per frame. Easing and `via` are sampled into keyframes, so the result matches the JavaScript calculation.

### JavaScript fallback

A passive `scroll` listener schedules at most one `requestAnimationFrame` update per frame. Values are calculated for every active instance first, then only the changed values are written.

### Lenis

When you smooth-scroll with [Lenis](https://github.com/darkroomengineering/lenis), pass your Lenis instance to `mount()` and set `timeline: 'lenis'` on the instances it should drive:

```javascript
const lenis = new Lenis({ autoRaf: true })

buttery.mount({ lenis })

buttery.create({
  elem: document.querySelector('.element'),
  from: 'top-bottom',
  to: 'bottom-top',
  direct: true,
  timeline: 'lenis',
  props: { '--ty': { from: '0px', to: '-100px' } }
}).start()
```

These instances update inside Lenis's own frame, straight from its `scroll` event, using its sub-pixel scroll position. The JavaScript fallback waits for the browser's `scroll` event and the next animation frame, and only sees the rounded `scrollTop`, so it can lag a frame behind Lenis and step. `inside`/`outside` callbacks run on every Lenis frame.

- Lenis isn't a dependency: Buttery only calls `lenis.on('scroll', …)` and reads `lenis.scroll` and `lenis.limit`.
- Only Lenis on the page (window) scroller is supported, not a custom `wrapper`.
- If no Lenis instance is passed to `mount()`, `timeline: 'lenis'` instances use the JavaScript fallback. So the same code works when Lenis is turned off, for example on touch devices.
- Native timelines already follow Lenis, because Lenis sets the real scroll position. Use `'lenis'` for instances that need JavaScript, such as those with callbacks, or for browsers without `ScrollTimeline`.

#### On touch devices

By default Lenis doesn't smooth touch scrolling: the browser scrolls natively and Lenis only passes on its `scroll` events. JavaScript reacting to those events lags behind the scrolling, which is easy to see as jitter in iOS Safari.

So on touch-first devices (`(hover: none) and (pointer: coarse)`), `'lenis'` instances use a native timeline when the browser supports it, just like `'auto'`. Instances with `inside`/`outside` callbacks, and browsers without `ScrollTimeline`, still follow Lenis. Turn this off with `mount({ lenis, nativeOnTouch: false })`.

If you'd rather Lenis drove touch scrolling too, create it with `syncTouch`. Lenis then animates touch scrolling itself, and `'lenis'` instances update in its frame on touch devices as well:

```javascript
const lenis = new Lenis({ autoRaf: true, syncTouch: true })
buttery.mount({ lenis })
```

This replaces Safari's own scroll momentum with Lenis's, which feels different, and Lenis notes that `syncTouch` can be less reliable on iOS. Try both on a real device.

### Choosing a mode

| `data.timeline` | Behaviour |
|---|---|
| `'auto'` (default) | Uses the timeline if the browser supports it **and** the instance has no `inside`/`outside` callbacks |
| `true` | Uses the timeline whenever supported. Callbacks only run when `update()` is called |
| `false` | Always uses the JavaScript fallback |
| `'lenis'` | Driven by the Lenis instance passed to `mount()`. Uses the JavaScript fallback if there isn't one. On touch devices, uses the native timeline unless Lenis has `syncTouch` (see [On touch devices](#on-touch-devices)) |

An instance also falls back to JavaScript automatically if a custom property can't be registered, or if creating the animation throws an error.

> **Callbacks need JavaScript on every frame.** Instances that use `inside`/`outside` to drive per-frame work (for example, drawing SVG lines) stay on the JavaScript fallback in `'auto'` mode.

## Custom properties and `@property`

A native animation can only interpolate a custom property smoothly if the property is **registered**. Unregistered properties jump between values instead.

If a property isn't registered yet, the library registers it with `CSS.registerProperty()`. The syntax is based on the unit:

| Unit | Syntax | Initial value |
|---|---|---|
| none | `<number>` | `0` |
| `deg`, `grad`, `rad`, `turn` | `<angle>` | `0deg` |
| `s`, `ms` | `<time>` | `0s` |
| anything else | `<length-percentage>` | `0px` |

A value with several numbers separated only by spaces, all of the same type, is registered as a list, e.g. `'0px -100px'` → `<length-percentage>+`. Other values with several numbers, such as `'translateY(10px) rotate(5deg)'`, can't be registered. They use the JavaScript fallback in a custom property, unless you register a matching syntax yourself.

Registration affects the whole site: a registered property always has a value, so `var(--x, fallback)` fallbacks stop working. **It's better to register the properties yourself in CSS**, with sensible initial values. The library will then use your registrations:

```css
@property --tx      { syntax: "<length-percentage>"; inherits: true; initial-value: 0px; }
@property --ty      { syntax: "<length-percentage>"; inherits: true; initial-value: 0px; }
@property --scale   { syntax: "<number>"; inherits: true; initial-value: 1; }
@property --opacity { syntax: "<number>"; inherits: true; initial-value: 1; }
@property --blur    { syntax: "<length>"; inherits: true; initial-value: 0px; }
```

## iOS Safari

These features are there to reduce scroll jitter on iOS:

- **Native timelines** remove the delay between Safari's scrolling and JavaScript updates, which are also held near 60 fps on ProMotion devices.
- **Overscroll clamping:** animations stay still during the rubber-band bounce at the top and bottom of the page.
- **Stable viewport height:** relative positions use `documentElement.clientHeight`, which doesn't change when the toolbar collapses.
- **Height-only resizes are ignored** for recalculation. Only width and orientation changes count as real resizes.

## Building

```bash
npm install
npm run build
```

Vite builds `lib/buttery.js` twice (see `vite.config.js`):

| File | Use | Dependencies |
|---|---|---|
| `dist/buttery.js` | `import` in bundlers | left as imports |
| `dist/buttery.cjs` | `require()` | left as requires |
| `dist/buttery.min.js` | `<script>` tag / CDN, `window.buttery` | bundled, minified |

### Demo

`demo/` is a static page that uses the script-tag build (`dist/buttery.min.js`). To run it locally:

```bash
npm run demo
```

A second page, `demo/parallax.html`, has four layered parallax bands set up entirely with `data-buttery` attributes.

Add `?js` to the URL to force the JavaScript fallback, or `?lenis` to smooth-scroll with Lenis and drive every instance from it. Add `&synctouch` to also smooth touch scrolling with Lenis (`?lenis&synctouch`).

### Tests

Tests use [Vitest](https://vitest.dev) and live in `test/`.

```bash
npm test
```

Runs the unit and DOM tests in Node with [happy-dom](https://github.com/capricorn86/happy-dom) (`vitest.config.js`), in watch mode. No browser is needed. Use `npm test -- --run` for a single run (e.g. in CI). To run one file or the tests whose name matches some text:

```bash
npx vitest test/attributes.test.js
npx vitest -t "max-md"
```

| File | Covers |
|---|---|
| `test/attributes.test.js` | Parsing `data-buttery*` attributes |
| `test/values.test.js` | Prop values, ranges, validation and interpolation |
| `test/breakpoints.test.js` | Breakpoint sorting, matching and overrides |
| `test/buttery.test.js` | The public API: rendering on scroll, callbacks, `mount()`/`unmount()`, resize, breakpoint changes, Lenis, `scan()`/`release()` |

#### Browser tests

`test/browser/` runs in real Chromium and Firefox with Vitest browser mode and Playwright (`vitest.browser.config.js`). These check that the native timeline and the JavaScript fallback render the same values, and that breakpoints re-apply when the viewport is resized. Install the browsers once, then run the tests:

```bash
npx playwright install chromium firefox
npm run test:browser
```

#### Before publishing

`npm publish` runs `prepublishOnly` first. It builds `dist/` and checks the package with [publint](https://publint.dev). To run it yourself:

```bash
npm run prepublishOnly
```

## Tips

- **Don't put CSS `transition`s on scroll-driven properties.** In timeline mode they add delay to every frame. In fallback mode they cause wobble on iOS.
- **Prefer `translate`, `rotate`, `scale` and `opacity`.** Animate them directly as prop keys where you can, e.g. `props: { translate: { from: '0 0px', to: '0 -100px' } }`. The GPU can run these, while custom properties are updated on the main thread. See [Animate compositor properties directly](#animate-compositor-properties-directly).
- **Animate HTML elements, not SVG children.** WebKit doesn't give SVG `<path>` elements their own GPU layer, so animating them repaints the whole SVG.
- **Avoid animating `filter: blur()`** and avoid putting scroll-driven elements inside `mask: url(#…)` on mobile. Both force software repaints.
- **Call `calculate()` after layout changes** that move elements, such as content loading in or temporary `position: sticky` changes. Changes to page height alone are picked up automatically.
- **Respect reduced motion.** Check `prefers-reduced-motion` before calling `create()`. `scan()` does this for you.