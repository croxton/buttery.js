/**
 * Buttery - scroll animation library
 * Performance focused, lightweight scroll animation library
 *
 * A fork of basicScroll.js by Tobias Reich (@electerious)
 * Created and maintained by Mark Croxton (@croxton)
 *
 * - Uses native scroll-driven animations (ScrollTimeline + Web Animations) when supported,
 *   so values update in sync with scrolling without per-frame JavaScript.
 * - Falls back to an event-driven requestAnimationFrame loop otherwise.
 * - Instances with `inside`/`outside` callbacks use the fallback by default (callbacks need JS per frame).
 * - Optional 'lenis' mode: instances update synchronously from a Lenis instance's `scroll` event,
 *   using its sub-pixel scroll position, instead of the window scroll listener.
 *   On touch devices where Lenis doesn't smooth touch (no `syncTouch`), they use native timelines instead.
 * - Clamps scrollTop to avoid rubber-band (overscroll) bounce affecting animations
 * - Uses a stable viewport height that doesn't change when the iOS toolbar collapses/expands
 * - Ignores height-only resize events (iOS address bar show/hide) for recalculation
 * - Skips redundant style writes
 * - Breakpoint overrides (`md: {...}`, `'max-md': false`), re-applied when the viewport crosses a breakpoint
 * - Declarative `data-buttery*` attributes, created with scan() and destroyed with release()
 */

import eases from 'eases'
import { parseElement, PREFIX } from './attributes.js'
import {
  DEFAULT_BREAKPOINTS,
  setBreakpoints,
  getBreakpoints,
  getMediaQuery,
  isPlainObject,
  hasBreakpointKeys,
  resolveBreakpoints
} from './breakpoints.js'
import { relativeToAbsoluteValue, validate, getProgress, computeProps } from './values.js'

// Breakpoint names that would clash with option names
const RESERVED_KEYS = ['from', 'to', 'via', 'timing', 'elem', 'props', 'direct', 'track', 'timeline', 'inside', 'outside']

let instances = new Set()
let frameId = null
let pendingForce = false
let init = false
let previousScrollTop = null
let previousLenisScroll = null
let maxScrollTop = null
let viewportHeight = null
let viewportWidth = null
let listeners = null
let resizeObserver = null
let timelineFrameId = null
let lastTimelineMax = null
let scrollTimeline = null
let timelineSupport = null
let settings = {
  recalculateOnResize: false,
  timeline: true,
  lenis: null,
  nativeOnTouch: true,
  breakpoints: DEFAULT_BREAKPOINTS
}

// Pending frames for breakpoint changes and recalculation after a scan
let breakpointFrameId = null
let recalculateFrameId = null

// Instances created by scan(), and the instances created for each element
const declarativeInstances = new Set()
const scannedElements = new WeakMap()

// Elements whose attributes were invalid, so they aren't parsed (and warned about) again
const failedElements = new WeakSet()

// Number of samples used to approximate non-linear easing in timeline keyframes
const TIMELINE_SAMPLES = 30

// Last applied style values per instance, used to avoid redundant writes
const styleCache = new WeakMap()

// Key in the style cache for the last rendered (clamped) progress of an instance
const LAST_TIME = Symbol('lastTime')

// Internal per-instance functions that aren't part of the public instance API
const internals = new WeakMap()

// Cached lists of instances driven by the JS loop and by Lenis (null = rebuild)
let lists = null

// Custom properties registered by this library: name => syntax (null = registered elsewhere)
const registeredProperties = new Map()

/**
 * Debounces a function that will be triggered many times.
 * @param {Function} fn
 * @param {Number} duration
 * @returns {Function}
 */
const debounce = function(fn, duration) {

  let timeout = null

  const debounced = (...args) => {
    clearTimeout(timeout)
    timeout = setTimeout(() => fn(...args), duration)
  }

  debounced.cancel = () => clearTimeout(timeout)

  return debounced

}

/**
 * Checks if an instance is driven by an attached Lenis instance.
 * @param {Object} instance
 * @returns {Boolean}
 */
const isLenisDriven = function(instance) {

  return init === true
    && settings.lenis != null
    && instance.getData().timeline === 'lenis'
    && instance.usesTimeline() === false

}

/**
 * Marks the cached instance lists as stale.
 * Call whenever an instance is added, removed, started, stopped or changes mode.
 */
const invalidateLists = function() {

  lists = null

}

/**
 * Returns the active instances driven by the JS loop (window scroll listener)
 * and by Lenis. Cached, so filtering doesn't happen on every frame.
 * @returns {Object} { loop, lenis }
 */
const getLists = function() {

  if (lists != null) return lists

  const loop = []
  const lenis = []

  for (const instance of instances) {
    if (instance.isActive() === false || instance.usesTimeline()) continue

    const data = instance.getData()
    if (data == null || data.disabled === true) continue

    if (isLenisDriven(instance)) lenis.push(instance)
    else loop.push(instance)
  }

  lists = { loop, lenis }

  return lists

}

/**
 * Returns all tracked instances from a list.
 * @param {Iterable} list
 * @returns {Array} instances - Tracked instances.
 */
const getTrackedInstances = function(list) {

  return Array.from(list).filter((instance) => instance.getData() != null && instance.getData().track)

}


/**
 * Checks if native scroll-driven animations can be used.
 * @returns {Boolean}
 */
export const supportsTimeline = function() {

  if (timelineSupport == null) {
    timelineSupport = typeof window !== 'undefined'
      && typeof window.ScrollTimeline === 'function'
      && typeof window.Animation === 'function'
      && typeof window.KeyframeEffect === 'function'
      && window.CSS != null
      && typeof window.CSS.registerProperty === 'function'
  }

  return timelineSupport

}

/**
 * Returns the scrolling element.
 * @returns {Element}
 */
const getScrollingElement = function() {

  return document.scrollingElement || document.documentElement

}

/**
 * Returns the shared document scroll timeline.
 * @returns {ScrollTimeline}
 */
const getScrollTimeline = function() {

  if (scrollTimeline == null) {
    scrollTimeline = new ScrollTimeline({
      source: getScrollingElement(),
      axis: 'block'
    })
  }

  return scrollTimeline

}

/**
 * Returns the raw number of scrolled pixels.
 * Can be negative or exceed the max scroll position during iOS rubber-band overscroll.
 * Use this for measuring element positions (it stays consistent with getBoundingClientRect).
 * @returns {Number} scrollTop
 */
const getRawScrollTop = function() {

  return getScrollingElement().scrollTop

}

/**
 * Returns the maximum scrollable distance.
 * @returns {Number}
 */
const getMaxScrollTop = function() {

  const elem = getScrollingElement()

  return Math.max(0, elem.scrollHeight - elem.clientHeight)

}

/**
 * Returns the number of scrolled pixels, clamped to the scrollable range.
 * This prevents iOS rubber-band overscroll from making animations bounce.
 * @returns {Number} scrollTop
 */
const getScrollTop = function() {

  const scrollTop = getRawScrollTop()

  if (scrollTop <= 0) return 0

  // Only re-read the (layout dependent) max when it might be stale
  if (maxScrollTop == null || scrollTop > maxScrollTop) maxScrollTop = getMaxScrollTop()

  return Math.min(scrollTop, maxScrollTop)

}

/**
 * Returns the (sub-pixel) scroll position of the attached Lenis instance,
 * clamped to its scrollable range.
 * @returns {Number} scrollTop
 */
const getLenisScrollTop = function() {

  const lenis = settings.lenis

  return Math.min(Math.max(lenis.scroll, 0), Math.max(lenis.limit, 0))

}

/**
 * Returns a stable height of the viewport.
 * documentElement.clientHeight doesn't change when the iOS Safari toolbar
 * collapses/expands, unlike window.innerHeight, so calculated positions stay put.
 * @returns {Number} viewportHeight
 */
const getViewportHeight = function() {

  if (viewportHeight == null) {
    viewportHeight = document.documentElement.clientHeight || window.innerHeight || window.outerHeight
  }

  return viewportHeight

}

/**
 * Returns the width of the viewport.
 * @returns {Number} viewportWidth
 */
const getViewportWidth = function() {

  return document.documentElement.clientWidth || window.innerWidth

}


/**
 * Returns the property that should be used according to direct.
 * @param {Boolean|Node} direct
 * @param {Object} properties
 * @returns {*}
 */
const mapDirectToProperty = function(direct, properties) {

  if (direct === true) return properties.elem
  if (direct instanceof Element) return properties.direct

  return properties.global

}

/**
 * Returns the element styles should be applied to.
 * @param {Object} data
 * @returns {?Element}
 */
const getElem = function(data) {

  return mapDirectToProperty(data.direct, {
    global: document.documentElement,
    elem: data.elem,
    direct: data.direct
  })

}


/**
 * Calculates the props of an instance and executes its callbacks.
 * @param {Object} instance
 * @param {?Integer} scrollTop - Pixels scrolled in document (clamped).
 * @returns {Object} Calculated props and the element to apply styles to.
 */
const getProps = function(instance, scrollTop = getScrollTop()) {

  const data = instance.getData()

  const { precisePercentage, normalizedTime, props } = computeProps(data, scrollTop)

  // Use precise percentage to check if the viewport is between from and to.
  const isInside = (precisePercentage >= 0 && precisePercentage <= 100)

  // Execute callbacks
  if (isInside === true) data.inside(instance, precisePercentage, props)
  else data.outside(instance, precisePercentage, props)

  return {
    elem: getElem(data),
    normalizedTime,
    props
  }

}

/**
 * Adds properties to a given style object, skipping values that haven't changed.
 * @param {Node} elem - Styles will be applied to this element.
 * @param {Object} props - Object of props.
 * @param {?Object} cache - Last applied values.
 */
const setProps = function(elem, props, cache = null) {

  if (elem == null) return

  for (const key in props) {

    const value = props[key]

    if (cache != null) {
      if (cache[key] === value) continue
      cache[key] = value
    }

    elem.style.setProperty(key, value)

  }

}

/**
 * Returns the style cache of an instance.
 * @param {Object} instance
 * @returns {Object}
 */
const getStyleCache = function(instance) {

  let cache = styleCache.get(instance)

  if (cache == null) {
    cache = {}
    styleCache.set(instance, cache)
  }

  return cache

}

/**
 * Returns a subset of props.
 * @param {Object} props
 * @param {Array} keys
 * @returns {Object}
 */
const pickProps = function(props, keys) {

  return keys.reduce((acc, key) => {
    acc[key] = props[key]
    return acc
  }, {})

}

/**
 * Returns the keys of props whose value actually changes while scrolling.
 * @param {Object} data
 * @returns {Array}
 */
const getAnimatedKeys = function(data) {

  return Object.keys(data.props).filter((key) => {

    const prop = data.props[key]
    const isConstant = prop.from.every((value, i) => value === prop.to[i] && (prop.via == null || prop.via[i] === value))

    return isConstant === false

  })

}

/**
 * Returns the CSS syntax and initial value to register a custom property with.
 * A value with several numbers needs a space-separated list syntax (e.g. `<length-percentage>+`).
 * @param {Object} prop - Validated prop.
 * @returns {?Object} null if no syntax can describe the value (e.g. it contains functions).
 */
const getSyntaxForProp = function(prop) {

  const types = prop.units.map((unit) => getSyntaxForUnit(unit))

  if (types.length === 1 && prop.parts[0] === '' && prop.parts[1] === '') return types[0]

  // Only plain numbers separated by spaces, all of the same type, can be a list
  const isList = prop.parts[0] === ''
    && prop.parts[prop.parts.length - 1] === ''
    && prop.parts.slice(1, -1).every((part) => part === ' ')
    && types.every((type) => type.syntax === types[0].syntax)

  if (isList === false) return null

  return { syntax: `${ types[0].syntax }+`, initialValue: types[0].initialValue }

}

/**
 * Returns the CSS syntax and initial value for a single number with a unit.
 * @param {String} unit
 * @returns {Object}
 */
const getSyntaxForUnit = function(unit) {

  if (unit === '') return { syntax: '<number>', initialValue: '0' }
  if (['deg', 'grad', 'rad', 'turn'].includes(unit)) return { syntax: '<angle>', initialValue: '0deg' }
  if (['s', 'ms'].includes(unit)) return { syntax: '<time>', initialValue: '0s' }

  return { syntax: '<length-percentage>', initialValue: '0px' }

}

/**
 * Checks if a stylesheet already registers a custom property with @property.
 * CSS.registerProperty() doesn't throw in that case: it silently takes precedence,
 * which would replace the author's syntax and initial value.
 * @param {String} name
 * @returns {Boolean}
 */
const hasPropertyRule = function(name) {

  if (typeof CSSPropertyRule === 'undefined') return false

  const search = function(rules) {
    for (const rule of rules) {
      if (rule instanceof CSSPropertyRule && rule.name === name) return true
      // Look inside @media, @supports, @layer and other grouping rules
      if (rule.cssRules != null && search(rule.cssRules)) return true
    }
    return false
  }

  const sheets = [ ...document.styleSheets, ...(document.adoptedStyleSheets || []) ]

  return sheets.some((sheet) => {
    try {
      return search(sheet.cssRules)
    } catch (error) {
      // Cross-origin stylesheets can't be read
      return false
    }
  })

}

/**
 * Registers a custom property so it can be interpolated by the animation engine.
 * @param {String} name
 * @param {Object} prop - Validated prop.
 * @returns {Boolean} Whether the property can be animated smoothly.
 */
const registerCustomProperty = function(name, prop) {

  const type = getSyntaxForProp(prop)

  if (registeredProperties.has(name)) {
    const existing = registeredProperties.get(name)

    // null = registered elsewhere (e.g. @property in CSS), trust it
    return existing === null || (type != null && existing === type.syntax)
  }

  if (hasPropertyRule(name)) {
    registeredProperties.set(name, null)
    return true
  }

  // No syntax describes this value, so it can't be interpolated natively
  if (type == null) return false

  const { syntax, initialValue } = type

  try {
    CSS.registerProperty({ name, syntax, inherits: true, initialValue })
    registeredProperties.set(name, syntax)
    return true
  } catch (error) {
    if (error != null && error.name === 'InvalidModificationError') {
      // Already registered, e.g. with @property in CSS
      registeredProperties.set(name, null)
      return true
    }
    return false
  }

}

/**
 * Converts a CSS property name to a keyframe key.
 * @param {String} key
 * @returns {String}
 */
const toKeyframeKey = function(key) {

  if (key.startsWith('--')) return key

  return key.replace(/-([a-z])/g, (match, char) => char.toUpperCase())

}

/**
 * Checks if a 'lenis' instance should use a native timeline instead.
 * Lenis only smooths touch scrolling with `syncTouch`. Without it, touch scrolling is native,
 * and a native timeline follows it more smoothly than JS reacting to scroll events (e.g. iOS Safari).
 * @returns {Boolean}
 */
const prefersNativeForLenis = function() {

  if (settings.nativeOnTouch !== true) return false
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false

  const touchFirst = window.matchMedia('(hover: none) and (pointer: coarse)').matches
  const lenisSyncsTouch = settings.lenis != null
    && settings.lenis.options != null
    && settings.lenis.options.syncTouch === true

  return touchFirst && lenisSyncsTouch === false

}

/**
 * Checks if an instance can use a native scroll timeline.
 * @param {Object} data
 * @param {Array} animatedKeys
 * @returns {Boolean}
 */
const canUseTimeline = function(data, animatedKeys) {

  if (settings.timeline === false) return false
  if (data.timeline === false) return false
  if (data.timeline === 'lenis' && (data.hasCallbacks === true || prefersNativeForLenis() === false)) return false

  // Callbacks need to run per frame, which requires the JS loop
  if (data.timeline === 'auto' && data.hasCallbacks === true) return false

  if (supportsTimeline() === false) return false

  return animatedKeys.every((key) => {
    if (key.startsWith('--') === false) return true

    return registerCustomProperty(key, data.props[key])
  })

}

/**
 * Builds keyframes mapped onto the document scroll range (0 → max).
 * Easing and `via` are sampled so the result matches the JS calculation.
 * @param {Object} data
 * @param {Array} keys - Animated prop keys.
 * @param {Number} max - Max scroll distance.
 * @returns {Array} keyframes
 */
const buildKeyframes = function(data, keys, max) {

  const from = data.from.value
  const to = data.to.value

  const isLinear = keys.every((key) => data.props[key].timing === eases['linear'])
  const hasVia = keys.some((key) => data.props[key].via != null)
  const segments = isLinear ? (hasVia ? 2 : 1) : TIMELINE_SAMPLES

  const positions = [0, max]

  for (let i = 0; i <= segments; i++) {
    positions.push(from + (to - from) * (i / segments))
  }

  // Keyframe offsets must be within 0–1, values outside the scroll range are
  // represented by the exact values at the start/end of the scroll range.
  const uniquePositions = [...new Set(positions.filter((position) => position >= 0 && position <= max))]
    .sort((a, b) => a - b)

  return uniquePositions.map((position) => {

    const { props } = computeProps(data, position)
    const keyframe = { offset: position / max }

    for (const key of keys) {
      keyframe[toKeyframeKey(key)] = props[key]
    }

    return keyframe

  })

}

/**
 * Writes inline styles for an instance and records which keys it wrote,
 * so they can be removed when a breakpoint turns a prop or the instance off.
 * @param {Object} instance
 * @param {?Element} elem
 * @param {Object} props
 */
const writeStyles = function(instance, elem, props) {

  if (elem == null) return

  const written = internals.get(instance).written

  if (written.target !== elem) {
    written.target = elem
    written.keys.clear()
  }

  for (const key in props) written.keys.add(key)

  setProps(elem, props, getStyleCache(instance))

}

/**
 * Removes inline styles an instance wrote.
 * Other instances that wrote the same keys to the same element lose their style cache,
 * so their next render writes the values again.
 * @param {Object} instance
 * @param {Array} keys
 */
const removeStyles = function(instance, keys) {

  const written = internals.get(instance).written
  const target = written.target

  if (target == null || keys.length === 0) return

  for (const key of keys) {
    target.style.removeProperty(key)
    written.keys.delete(key)
  }

  const cache = styleCache.get(instance)
  if (cache != null) for (const key of keys) delete cache[key]

  for (const other of instances) {
    if (other === instance) continue

    const otherWritten = internals.get(other).written

    if (otherWritten.target !== target || keys.some((key) => otherWritten.keys.has(key)) === false) continue

    styleCache.delete(other)

    if (other.isActive()) {
      if (other.usesTimeline()) other.syncTimeline()
      else requestUpdate(true)
    }
  }

}

/**
 * Gets and sets new props of a list of instances.
 * Make sure it's performant as hell.
 * @param {Array} list - Instances to render.
 * @param {Number} scrollTop - Pixels scrolled in document (clamped).
 * @param {Boolean} force - Render even when an instance's progress hasn't changed.
 */
const renderInstances = function(list, scrollTop, force = false) {

  // Calculate everything first, then write, to avoid layout thrashing
  const results = new Array(list.length)

  for (let i = 0; i < list.length; i++) {

    const instance = list[i]
    const data = instance.getData()

    // Without callbacks, the same progress means the same values (e.g. while
    // the instance is out of range), so there's nothing to calculate or write
    if (force === false && data.hasCallbacks === false) {
      const cache = styleCache.get(instance)
      if (cache != null && cache[LAST_TIME] === getProgress(data, scrollTop).normalizedTime) continue
    }

    results[i] = getProps(instance, scrollTop)

  }

  // Write phase
  for (let i = 0; i < list.length; i++) {

    const result = results[i]

    if (result === undefined) continue

    writeStyles(list[i], result.elem, result.props)
    getStyleCache(list[i])[LAST_TIME] = result.normalizedTime

  }

}

/**
 * Gets and sets new props of all active Lenis instances.
 * Runs synchronously inside Lenis's frame, right after it sets the scroll position.
 * @param {Boolean} force - Update even when the scroll position hasn't changed.
 */
const updateLenis = function(force = false) {

  if (settings.lenis == null) return

  const lenisInstances = getLists().lenis

  if (lenisInstances.length === 0) return

  const scrollTop = getLenisScrollTop()

  if (force === false && previousLenisScroll === scrollTop) return
  previousLenisScroll = scrollTop

  renderInstances(lenisInstances, scrollTop, force)

}

/**
 * Gets and sets new props of all active loop instances.
 * Runs inside requestAnimationFrame. Make sure it's performant as hell.
 * @param {Boolean} force - Update even when scrollTop hasn't changed.
 */
const update = function(force = false) {

  // Forced updates (start, resize, pageshow) refresh Lenis instances too
  if (force === true) updateLenis(true)

  const loopInstances = getLists().loop

  // Only continue when active instances available
  if (loopInstances.length === 0) return

  // Read phase
  const scrollTop = getScrollTop()

  // Only continue when scrollTop has changed
  if (force === false && previousScrollTop === scrollTop) return
  previousScrollTop = scrollTop

  renderInstances(loopInstances, scrollTop, force)

}

/**
 * Schedules an update for the next animation frame.
 * Multiple calls within the same frame are batched.
 * @param {Boolean} force
 */
const requestUpdate = function(force = false) {

  if (init === false) return

  pendingForce = pendingForce || force

  if (frameId != null) return

  frameId = requestAnimationFrame(() => {

    const shouldForce = pendingForce

    frameId = null
    pendingForce = false

    update(shouldForce)

  })

}

/**
 * Schedules a keyframe refresh of timeline instances when the scroll range changes.
 */
const requestTimelineRefresh = function() {

  if (timelineFrameId != null) return

  timelineFrameId = requestAnimationFrame(() => {

    timelineFrameId = null
    maxScrollTop = null

    const max = getMaxScrollTop()

    if (max === lastTimelineMax) return
    lastTimelineMax = max

    // Read once, before any instance writes styles
    const scrollTop = getScrollTop()

    for (const instance of instances) {
      if (instance.usesTimeline()) instance.syncTimeline(scrollTop, max)
    }

  })

}

/**
 * Default error handler of calculateInstances(): warns and turns the instance off,
 * so one bad config (e.g. an override that's only invalid at one breakpoint)
 * doesn't stop the others from being applied.
 * @param {Object} instance
 * @param {Error} error
 * @returns {Boolean} Whether to skip applying the instance.
 */
const disableOnError = function(instance, error) {

  console.warn('[buttery]', error.message, instance.getData() != null ? instance.getData().elem : '')
  internals.get(instance).disable()

  return false

}

/**
 * Recalculates instances in three passes, so the layout is only computed once:
 * 1. Writes: elements measured by these instances lose the inline styles and native
 *    animations applied to them, so their own transforms don't shift the measurements.
 * 2. Reads: all measurements.
 * 3. Writes: all styles and native animations.
 * @param {Array} list
 * @param {Function} onError - (instance, error) => skip. Defaults to warning and turning the instance off.
 */
const calculateInstances = function(list, onError = disableOnError) {

  // Refresh cached measurements, as layout may have changed
  viewportHeight = null
  maxScrollTop = null

  // 1. Instances styling an element that's measured must be reset, and re-applied too
  const measured = new Set(list.map((instance) => internals.get(instance).raw.elem).filter((elem) => elem != null))
  const all = new Set(list)

  if (measured.size > 0) {
    for (const instance of instances) {
      if (internals.get(instance).resetIfTargets(measured)) all.add(instance)
    }
  }

  // 2. Reads
  const applied = []

  for (const instance of all) {
    try {
      internals.get(instance).measure()
      applied.push(instance)
    } catch (error) {
      if (onError(instance, error) === false) applied.push(instance)
    }
  }

  invalidateLists()

  const scrollTop = getScrollTop()
  const max = getMaxScrollTop()

  // 3. Writes
  for (const instance of applied) internals.get(instance).apply(scrollTop, max)

}

/**
 * Recalculates all tracked instances (e.g. after a layout change).
 */
const recalculateAll = function() {

  calculateInstances(getTrackedInstances(instances))

}

/**
 * Recalculates all tracked instances in the next frame. Batches several calls,
 * e.g. scan() running for several swapped elements.
 */
const requestRecalculate = function() {

  if (recalculateFrameId != null) return

  recalculateFrameId = requestAnimationFrame(() => {
    recalculateFrameId = null
    recalculateAll()
    requestUpdate(true)
  })

}

/**
 * Returns the instances that use breakpoints, now or at their last measurement.
 * @returns {Array}
 */
const getBreakpointInstances = function() {

  return Array.from(instances).filter((instance) => {
    const internal = internals.get(instance)
    return internal.usedBreakpoints || hasBreakpointKeys(internal.raw)
  })

}

/**
 * Re-applies breakpoint overrides in the next frame, after the viewport crossed a breakpoint.
 */
const requestBreakpointRefresh = function() {

  if (breakpointFrameId != null) return

  breakpointFrameId = requestAnimationFrame(() => {
    breakpointFrameId = null

    const list = getBreakpointInstances()

    if (list.length === 0) return

    calculateInstances(list)
    requestUpdate(true)
  })

}

/**
 * Handles resize events.
 * Height-only changes (iOS Safari toolbar collapsing/expanding) don't trigger
 * a recalculation, so animations don't jump while scrolling.
 */
const handleResize = debounce(() => {

  const width = getViewportWidth()

  // The scrollable distance might have changed in any case
  maxScrollTop = null
  requestTimelineRefresh()

  if (width === viewportWidth) return

  // A real resize (width change / orientation change)
  viewportWidth = width
  viewportHeight = null

  if (settings.recalculateOnResize === true) recalculateAll()

  requestUpdate(true)

}, 150)

/**
 * Error handler of calculateInstances() that throws, e.g. for create() and calculate().
 * @param {Object} instance
 * @param {Error} error
 */
const rethrow = function(instance, error) {

  throw error

}

/**
 * Creates a new instance.
 * @param {Object} data
 * @param {Boolean} defer - Don't calculate yet (scan() calculates many instances at once).
 * @returns {Object} instance
 */
const createInstance = function(data, defer) {

  // Store the parsed data
  let _data = null

  // Store if instance is started or stopped
  let active = false

  // Native scroll-driven animation state
  let timelineMode = false
  let animatedKeys = []
  let animation = null
  let animationTarget = null

  // Returns if instance is started or stopped
  const _isActive = () => {

    return active

  }

  // Returns the parsed and calculated data
  const _getData = function() {

    return _data

  }

  // Returns if the instance is driven by a native scroll timeline
  const _usesTimeline = () => {

    return timelineMode

  }

  // Cancels the native animation
  const _cancelAnimation = () => {

    if (animation != null) {
      animation.cancel()
      animation = null
      animationTarget = null
    }

  }

  // Falls back to the JS loop
  const _fallback = () => {

    _cancelAnimation()
    timelineMode = false
    styleCache.delete(instance)
    invalidateLists()

    if (active) requestUpdate(true)

  }

  // Creates or refreshes the native animation.
  // Scroll measurements can be passed in, so they're read before any styles are written.
  const _syncTimeline = (scrollTop, max) => {

    if (timelineMode === false) return

    const elem = getElem(_data)

    if (elem == null) return

    if (scrollTop == null) scrollTop = getScrollTop()
    if (max == null) max = getMaxScrollTop()

    const { props } = computeProps(_data, scrollTop)

    // Props that never change are simply set once
    const staticKeys = Object.keys(props).filter((key) => animatedKeys.includes(key) === false)
    writeStyles(instance, elem, pickProps(props, staticKeys))

    // Not started yet: create the animation on start()
    if (active === false && animation == null) return

    // Nothing to animate, or the page can't scroll
    if (animatedKeys.length === 0 || max <= 0) {
      _cancelAnimation()
      writeStyles(instance, elem, pickProps(props, animatedKeys))
      return
    }

    const keyframes = buildKeyframes(_data, animatedKeys, max)

    try {

      if (animation != null && animationTarget === elem) {
        animation.effect.setKeyframes(keyframes)
      } else {
        _cancelAnimation()

        const effect = new KeyframeEffect(elem, keyframes, {
          fill: 'both',
          easing: 'linear'
        })

        animation = new Animation(effect, getScrollTimeline())
        animationTarget = elem
      }

      if (active) {
        if (animation.playState !== 'running') animation.play()
      } else {
        animation.pause()
      }

    } catch (error) {
      // Something isn't supported after all, use the JS loop instead
      _fallback()
    }

  }

  // Turns the instance off: no props, no animation. Keeps what's needed to find its elements.
  const _disable = function() {

    _data = {
      disabled: true,
      elem: data.elem,
      direct: data.direct == null ? false : data.direct,
      track: data.track == null ? true : data.track,
      timeline: data.timeline == null ? 'auto' : data.timeline,
      hasCallbacks: false,
      props: {},
      propKeys: []
    }

    animatedKeys = []
    timelineMode = false

  }

  // Parses data and measures the layout. Reads only, no style writes.
  const _measure = function() {

    internal.usedBreakpoints = hasBreakpointKeys(data)

    const resolved = internal.usedBreakpoints ? resolveBreakpoints(data) : data

    // Styles may have been reset externally, so don't trust the cache
    styleCache.delete(instance)

    if (resolved === false) {
      _disable()
      return
    }

    _data = validate(resolved, (value, elem) => relativeToAbsoluteValue(value, elem, getRawScrollTop(), getViewportHeight()))
    _data.disabled = false

    animatedKeys = getAnimatedKeys(_data)
    timelineMode = canUseTimeline(_data, animatedKeys)

  }

  // Before measuring: removes the styles and animation applied to an element that's
  // about to be measured, so its own transforms don't shift the measurements.
  // Returns true if the instance was reset (it must then be applied again).
  const _resetIfTargets = function(elems) {

    const target = internal.written.target || animationTarget

    if (target == null || elems.has(target) === false) return false

    _cancelAnimation()

    for (const key of internal.written.keys) target.style.removeProperty(key)

    internal.written.keys.clear()
    styleCache.delete(instance)
    wasReset = true

    return true

  }

  // Applies the measured state: removes styles that are no longer set, writes styles
  // and creates the native animation
  const _apply = function(scrollTop, max) {

    const target = getElem(_data)
    const written = internal.written

    // Keys written before that this state doesn't set any more
    if (written.target != null) {
      const stale = written.target !== target || _data.disabled
        ? Array.from(written.keys)
        : Array.from(written.keys).filter((key) => _data.propKeys.includes(key) === false)

      removeStyles(instance, stale)
    }

    if (timelineMode) {
      _syncTimeline(scrollTop, max)
    } else {
      _cancelAnimation()

      // Render straight away, rather than showing unstyled elements for a frame
      if ((active || wasReset) && _data.disabled === false) {
        const position = isLenisDriven(instance) ? getLenisScrollTop() : scrollTop
        const { normalizedTime, props } = computeProps(_data, position)

        writeStyles(instance, target, props)
        getStyleCache(instance)[LAST_TIME] = normalizedTime
      }
    }

    wasReset = false

  }

  // Parses and calculates data
  const _calculate = function() {

    calculateInstances([instance], rethrow)

  }

  // Update props
  const _update = () => {

    if (_data.disabled) return {}

    if (timelineMode) {

      // The native animation applies the styles, just refresh it
      _syncTimeline()

      // Still return props (and run callbacks) for consumers relying on it
      const { props } = getProps(instance)

      return props

    }

    // Get new props
    const scrollTop = isLenisDriven(instance) ? getLenisScrollTop() : getScrollTop()
    const { elem, normalizedTime, props } = getProps(instance, scrollTop)

    // Set new props
    writeStyles(instance, elem, props)
    getStyleCache(instance)[LAST_TIME] = normalizedTime

    return props

  }

  // Starts to animate
  const _start = () => {

    active = true
    invalidateLists()

    if (timelineMode) _syncTimeline()
    else requestUpdate(true)

  }

  // Stops to animate
  const _stop = () => {

    active = false
    invalidateLists()

    // Freeze the native animation at its current state
    if (animation != null) animation.pause()

  }

  // Destroys the instance
  const _destroy = () => {

    _cancelAnimation()

    instances.delete(instance)
    styleCache.delete(instance)
    invalidateLists()

    // Forget declarative bookkeeping, so the element can be scanned again
    if (declarativeInstances.delete(instance) && internal.source != null) {
      const list = scannedElements.get(internal.source)

      if (list != null) {
        const remaining = list.filter((other) => other !== instance)
        if (remaining.length > 0) scannedElements.set(internal.source, remaining)
        else scannedElements.delete(internal.source)
      }
    }

  }

  // Assign instance to a variable so the instance can be used
  // elsewhere in the current function.
  const instance = {
    isActive: _isActive,
    getData: _getData,
    usesTimeline: _usesTimeline,
    usesLenis: () => isLenisDriven(instance),
    syncTimeline: _syncTimeline,
    calculate: _calculate,
    update: _update,
    start: _start,
    stop: _stop,
    destroy: _destroy
  }

  const internal = {
    raw: data,
    measure: _measure,
    apply: _apply,
    disable: _disable,
    resetIfTargets: _resetIfTargets,
    // Marks the instance as started without rendering, for batched creation
    activate: () => { active = true },
    // Element and keys this instance wrote inline styles for
    written: { target: null, keys: new Set() },
    usedBreakpoints: false,
    // Element with the data-buttery attributes, for instances created by scan()
    source: null
  }

  // Set when _resetIfTargets removed styles that _apply must write again
  let wasReset = false

  internals.set(instance, internal)

  instances.add(instance)
  invalidateLists()

  // Calculate data for the first time. Remove the instance again if its data is invalid.
  if (defer === false) {
    try {
      instance.calculate()
    } catch (error) {
      instance.destroy()
      throw error
    }
  }

  return instance

}

/**
 * Creates a new instance.
 * @param {Object} data
 * @returns {Object} instance
 */
export const create = function(data) {

  return createInstance(data, false)

}

/**
 * Starts listening for scroll changes.
 * @param {?Object} options
 * @param {?Boolean} options.recalculateOnResize - Recalculate tracked instances when the viewport width changes.
 * @param {?Boolean} options.timeline - Allow native scroll-driven animations (default true).
 * @param {?Object} options.lenis - A Lenis instance that drives instances with `timeline: 'lenis'`.
 * @param {?Boolean} options.nativeOnTouch - Use native timelines for 'lenis' instances on touch devices
 *   when Lenis doesn't smooth touch scrolling (default true).
 * @param {?Object} options.breakpoints - Breakpoint names and min-widths (default: Tailwind's).
 *   Numbers are pixels, strings are CSS lengths, e.g. `{ md: '48rem', desktop: 1200 }`.
 */
export const mount = function(options = {}) {

  // Guard against multiple calls
  if (init) {
    return
  }

  if (options.breakpoints != null) {
    if (isPlainObject(options.breakpoints) === false) throw new Error('Option `breakpoints` must be an object')

    for (const name in options.breakpoints) {
      if (RESERVED_KEYS.includes(name) || name.startsWith('max-')) throw new Error(`Breakpoint name \`${ name }\` is reserved`)
    }
  }

  init = true

  settings = Object.assign({}, settings, { lenis: null }, options)

  // Breakpoints may have changed
  setBreakpoints(settings.breakpoints)

  viewportWidth = getViewportWidth()
  viewportHeight = null
  maxScrollTop = null
  previousScrollTop = null
  previousLenisScroll = null
  lastTimelineMax = null

  // Nothing to do on scroll when every instance runs natively or on Lenis
  const onScroll = () => {
    if (getLists().loop.length > 0) requestUpdate(false)
  }
  const onPageShow = () => {
    // Restored from bfcache: positions may be stale
    maxScrollTop = null
    lastTimelineMax = null
    requestTimelineRefresh()
    requestUpdate(true)
  }

  listeners = { onScroll, onPageShow, offLenis: null, offBreakpoints: [] }

  // Re-apply breakpoint overrides when the viewport crosses a breakpoint
  const onBreakpointChange = () => requestBreakpointRefresh()

  for (const breakpoint of getBreakpoints()) {
    const mql = getMediaQuery(breakpoint)

    if (mql == null) continue

    if (typeof mql.addEventListener === 'function') {
      mql.addEventListener('change', onBreakpointChange)
      listeners.offBreakpoints.push(() => mql.removeEventListener('change', onBreakpointChange))
    } else {
      mql.addListener(onBreakpointChange)
      listeners.offBreakpoints.push(() => mql.removeListener(onBreakpointChange))
    }
  }

  // The mode of 'lenis' instances depends on the Lenis instance passed now, and
  // breakpoints may have changed, so instances created before mount() decide again
  invalidateLists()
  calculateInstances(Array.from(instances).filter((instance) => {
    const data = instance.getData()
    return (data != null && data.timeline === 'lenis') || internals.get(instance).usedBreakpoints || hasBreakpointKeys(internals.get(instance).raw)
  }))

  // Lenis emits `scroll` inside its own frame, right after setting the position,
  // so its instances are updated synchronously, without waiting for another frame.
  const lenis = settings.lenis

  if (lenis != null) {
    if (typeof lenis.on !== 'function') throw new Error('Option `lenis` must be a Lenis instance')

    const onLenisScroll = () => updateLenis(false)
    const off = lenis.on('scroll', onLenisScroll)

    listeners.offLenis = typeof off === 'function'
      ? off
      : () => lenis.off('scroll', onLenisScroll)
  }

  window.addEventListener('scroll', onScroll, { passive: true })
  window.addEventListener('resize', handleResize, { passive: true })
  window.addEventListener('orientationchange', handleResize, { passive: true })
  window.addEventListener('pageshow', onPageShow)

  // React to document height changes (lazy images etc.)
  if (typeof ResizeObserver !== 'undefined') {
    resizeObserver = new ResizeObserver(() => {
      maxScrollTop = null
      requestTimelineRefresh()
    })
    resizeObserver.observe(document.documentElement)
  }

  // Initial update
  requestUpdate(true)

}

/**
 * Stops listening and cleans up instances that are no longer in the DOM.
 */
export const unmount = function() {

  if (init === false) {
    return
  }

  let instancesInDom = false

  for (const instance of Array.from(instances)) {
    // Check element is still in DOM. For declarative instances, the element with the attributes.
    const data = instance.getData()
    const elem = internals.get(instance).source || (data != null ? data.elem : null)

    if (elem == null || document.body.contains(elem) === false) {
      // Destroy instance
      instance.destroy()
    } else {
      instancesInDom = true
    }
  }

  // Do we have instances left (have all running instances been destroyed)?
  // If so, it's safe to reset the instances array
  if (instancesInDom === false) {
    instances.clear()
  }

  if (listeners != null) {
    window.removeEventListener('scroll', listeners.onScroll)
    window.removeEventListener('resize', handleResize)
    window.removeEventListener('orientationchange', handleResize)
    window.removeEventListener('pageshow', listeners.onPageShow)
    if (listeners.offLenis != null) listeners.offLenis()
    for (const off of listeners.offBreakpoints) off()
    listeners = null
  }

  handleResize.cancel()

  if (resizeObserver != null) {
    resizeObserver.disconnect()
    resizeObserver = null
  }

  if (frameId != null) {
    cancelAnimationFrame(frameId)
    frameId = null
  }

  if (timelineFrameId != null) {
    cancelAnimationFrame(timelineFrameId)
    timelineFrameId = null
  }

  if (breakpointFrameId != null) {
    cancelAnimationFrame(breakpointFrameId)
    breakpointFrameId = null
  }

  if (recalculateFrameId != null) {
    cancelAnimationFrame(recalculateFrameId)
    recalculateFrameId = null
  }

  pendingForce = false
  previousScrollTop = null
  previousLenisScroll = null
  lastTimelineMax = null
  // Don't keep a reference to a Lenis instance that may be destroyed
  settings = Object.assign({}, settings, { lenis: null })
  init = false
  invalidateLists()

}
/**
 * Destroys declarative instances whose element is no longer in the document.
 */
const pruneDeclarative = function() {

  for (const instance of Array.from(declarativeInstances)) {
    if (internals.get(instance).source.isConnected === false) instance.destroy()
  }

}

/**
 * Creates and starts instances for elements with `data-buttery` attributes.
 * Elements that were scanned before are skipped, and instances of elements that
 * have left the document are destroyed. Call it again after new content is added.
 * @param {?Element|Document} root - Scans this element (itself included) and its descendants.
 * @param {?Object} options
 * @param {?Object} options.defaults - Data merged under every element's config, e.g. `{ timeline: 'lenis' }`.
 * @param {?Boolean} options.reducedMotion - Animate even when the user prefers reduced motion.
 * @returns {Array} The new instances.
 */
export const scan = function(root = document, options = {}) {

  if (typeof document === 'undefined' || root == null) return []

  pruneDeclarative()

  if (options.reducedMotion !== true
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return []

  const selector = `[${ PREFIX }]`
  const elements = []

  if (root.nodeType === 1 && root.matches(selector)) elements.push(root)
  elements.push(...root.querySelectorAll(selector))

  const breakpointNames = getBreakpoints().map((breakpoint) => breakpoint.name)
  const created = []

  for (const el of elements) {

    if (scannedElements.has(el) || failedElements.has(el)) continue

    const elInstances = []

    try {
      for (const config of parseElement(el, breakpointNames)) {
        const instance = createInstance(Object.assign({}, options.defaults, config), true)

        internals.get(instance).source = el
        declarativeInstances.add(instance)
        elInstances.push(instance)
      }
    } catch (error) {
      console.warn('[buttery]', error.message, el)
      elInstances.forEach((instance) => instance.destroy())
      failedElements.add(el)
      continue
    }

    scannedElements.set(el, elInstances)
    created.push(...elInstances)

  }

  // New or removed content moves the elements after it, so recalculate the others too (once per frame)
  if (instances.size > 0) requestRecalculate()

  if (created.length === 0) return created

  // Measure and apply all new instances at once, already started
  for (const instance of created) internals.get(instance).activate()

  const failed = new Set()

  calculateInstances(created, (instance, error) => {
    console.warn('[buttery]', error.message, internals.get(instance).source)
    failed.add(internals.get(instance).source)
    return true
  })

  // Drop every instance of an element with an invalid config
  for (const instance of created.slice()) {
    const source = internals.get(instance).source

    if (failed.has(source)) {
      instance.destroy()
      failedElements.add(source)
      created.splice(created.indexOf(instance), 1)
    }
  }

  requestUpdate(true)

  return created

}

/**
 * Destroys the instances scan() created for an element and its descendants,
 * e.g. before the element is removed.
 * @param {?Element|Document} root
 */
export const release = function(root = document) {

  if (root == null) return

  // Invalid elements can be scanned again, e.g. after their attributes were fixed
  if (failedElements.has(root)) failedElements.delete(root)
  if (typeof root.querySelectorAll === 'function') {
    for (const el of root.querySelectorAll(`[${ PREFIX }]`)) failedElements.delete(el)
  }

  for (const instance of Array.from(declarativeInstances)) {
    const source = internals.get(instance).source

    if (root === source || root.contains(source)) instance.destroy()
  }

}
