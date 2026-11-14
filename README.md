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
| Resize handling | Recalculates on every `resize` | Ignores height-only resizes (iOS toolbar); recalculating on width changes is opt-in |
| Overscroll | Animations follow the rubber-band bounce | Scroll position is clamped to the scrollable range |
| Viewport height | `window.innerHeight` | Stable `documentElement.clientHeight` |
| Style writes | Every frame | Only when a value changes; all reads happen before writes |
| Zero-length ranges | Division by zero | Handled |
| Back/forward cache | Not handled | Refreshes on `pageshow` |

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

```javascript
buttery.mount({ recalculateOnResize: true })
```

#### `unmount()`

Removes all listeners (including the Lenis `scroll` subscription) and cancels pending frames. Destroys instances whose `elem` is no longer in the DOM. If no instances are left, the internal instance list is reset.

#### `create(data)`

Creates and returns an instance. Its `from`/`to` positions are calculated straight away. Nothing animates until `instance.start()` is called.

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

Keys can be CSS custom properties (`--ty`) or normal CSS properties (`opacity`, `transform`).

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

Add `?js` to the URL to force the JavaScript fallback, or `?lenis` to smooth-scroll with Lenis and drive every instance from it. Add `&synctouch` to also smooth touch scrolling with Lenis (`?lenis&synctouch`).

## Tips

- **Don't put CSS `transition`s on scroll-driven properties.** In timeline mode they add delay to every frame. In fallback mode they cause wobble on iOS.
- **Prefer `transform` and `opacity`.** Animate them directly as prop keys where you can, e.g. `props: { opacity: { from: 0, to: 1 } }`. The GPU can run these, while custom properties are updated on the main thread.
- **Animate HTML elements, not SVG children.** WebKit doesn't give SVG `<path>` elements their own GPU layer, so animating them repaints the whole SVG.
- **Avoid animating `filter: blur()`** and avoid putting scroll-driven elements inside `mask: url(#…)` on mobile. Both force software repaints.
- **Call `calculate()` after layout changes** that move elements, such as content loading in or temporary `position: sticky` changes. Changes to page height alone are picked up automatically.
- **Respect reduced motion.** Check `prefers-reduced-motion` before calling `create()`.