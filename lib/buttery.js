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
 * - Clamps scrollTop to avoid rubber-band (overscroll) bounce affecting animations
 * - Uses a stable viewport height that doesn't change when the iOS toolbar collapses/expands
 * - Ignores height-only resize events (iOS address bar show/hide) for recalculation
 * - Skips redundant style writes
 */

import parseUnit from 'parse-unit'
import eases from 'eases'

let instances = []
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
  lenis: null
}

// Number of samples used to approximate non-linear easing in timeline keyframes
const TIMELINE_SAMPLES = 30

// Last applied style values per instance, used to avoid redundant writes
const styleCache = new WeakMap()

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

  return init === true && settings.lenis != null && instance.getData().timeline === 'lenis'

}

/**
 * Returns all active instances that are driven by the JS loop (window scroll listener).
 * @param {Array} instances
 * @returns {Array} instances
 */
const getLoopInstances = function(instances) {

  return instances.filter((instance) => instance != null && instance.isActive() && instance.usesTimeline() === false && isLenisDriven(instance) === false)

}

/**
 * Returns all active instances that are driven by Lenis.
 * @param {Array} instances
 * @returns {Array} instances
 */
const getLenisInstances = function(instances) {

  return instances.filter((instance) => instance != null && instance.isActive() && isLenisDriven(instance))

}

/**
 * Returns all tracked instances from an array.
 * @param {Array} instances
 * @returns {Array} instances - Tracked instances.
 */
const getTrackedInstances = function(instances) {

  return instances.filter((instance) => instance != null && instance.getData().track)

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
 * Checks if a value is absolute.
 * An absolute value must have a value that's not NaN.
 * @param {String|Integer} value
 * @returns {Boolean} isAbsolute
 */
const isAbsoluteValue = function(value) {

  return isNaN(parseUnit(value)[0]) === false

}

/**
 * Parses an absolute value.
 * @param {String|Integer} value
 * @returns {Object} value - Parsed value.
 */
const parseAbsoluteValue = function(value) {

  const parsedValue = parseUnit(value)

  return {
    value: parsedValue[0],
    unit: parsedValue[1]
  }

}

/**
 * Checks if a value is relative.
 * A relative value must start and end with [a-z] and needs a '-' in the middle.
 * @param {String|Integer} value
 * @returns {Boolean} isRelative
 */
const isRelativeValue = function(value) {

  return String(value).match(/^[a-z0-9%]+-[a-z0-9%]+$/) !== null

}

/**
 * Returns the property that should be used according to direct.
 * @param {Boolean|Node} direct
 * @param {Object} properties
 * @returns {*}
 */
const mapDirectToProperty = function(direct, properties) {

  if (direct === true) return properties.elem
  if (direct instanceof HTMLElement) return properties.direct

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
 * Converts a relative value to an absolute value.
 * @param {String} value
 * @param {Node} elem - Anchor of the relative value.
 * @param {?Integer} scrollTop - Pixels scrolled in document (raw, unclamped).
 * @param {?Integer} vh - Height of the viewport.
 * @returns {String} value - Absolute value.
 */
const relativeToAbsoluteValue = function(value, elem, scrollTop = getRawScrollTop(), vh = getViewportHeight()) {

  const elemSize = elem.getBoundingClientRect()

  const elemAnchor = value.match(/^[a-z0-9%]+/)[0]
  const viewportAnchor = value.match(/[a-z0-9%]+$/)[0]

  // Absolute document position of the element
  const elemTop = elemSize.top + scrollTop

  let y = 0

  if (viewportAnchor.match(/%$/) !== null) {
    const percent = parseFloat(viewportAnchor.replace('%', '')) / 100
    y -= vh * percent
  } else {
    if (viewportAnchor === 'top') y -= 0
    if (viewportAnchor === 'middle') y -= vh / 2
    if (viewportAnchor === 'bottom') y -= vh
  }

  if (elemAnchor.match(/%$/) !== null) {
    const percent = parseFloat(elemAnchor.replace('%', '')) / 100
    y += elemTop + elemSize.height * percent
  } else {
    if (elemAnchor === 'top') y += elemTop
    if (elemAnchor === 'middle') y += elemTop + elemSize.height / 2
    if (elemAnchor === 'bottom') y += elemTop + elemSize.height
  }

  return `${ y }px`

}

/**
 * Validates data and sets defaults for undefined properties.
 * @param {?Object} data
 * @returns {Object} data - Validated data.
 */
const validate = function(data = {}) {

  // Copy root object to avoid changes by reference
  data = Object.assign({}, data)

  // Remember if callbacks were provided, before defaults are applied
  data.hasCallbacks = data.inside != null || data.outside != null

  if (data.inside == null) data.inside = () => {}
  if (data.outside == null) data.outside = () => {}
  if (data.direct == null) data.direct = false
  if (data.track == null) data.track = true
  if (data.props == null) data.props = {}
  if (data.timeline == null) data.timeline = 'auto'

  if (data.from == null) throw new Error('Missing property `from`')
  if (data.to == null) throw new Error('Missing property `to`')
  if (typeof data.inside !== 'function') throw new Error('Property `inside` must be undefined or a function')
  if (typeof data.outside !== 'function') throw new Error('Property `outside` must be undefined or a function')
  if (typeof data.direct !== 'boolean' && !(data.direct instanceof HTMLElement)) throw new Error('Property `direct` must be undefined, a boolean or a DOM element/node')
  if (data.direct === true && data.elem == null) throw new Error('Property `elem` is required when `direct` is true')
  if (typeof data.track !== 'boolean') throw new Error('Property `track` must be undefined or a boolean')
  if (typeof data.props !== 'object') throw new Error('Property `props` must be undefined or an object')
  if (data.timeline !== 'auto' && data.timeline !== 'lenis' && typeof data.timeline !== 'boolean') throw new Error('Property `timeline` must be undefined, a boolean, \'auto\' or \'lenis\'')

  if (data.elem == null) {

    if (isAbsoluteValue(data.from) === false) throw new Error('Property `from` must be a absolute value when no `elem` has been provided')
    if (isAbsoluteValue(data.to) === false) throw new Error('Property `to` must be a absolute value when no `elem` has been provided')

  } else {

    if (isRelativeValue(data.from) === true) data.from = relativeToAbsoluteValue(data.from, data.elem)
    if (isRelativeValue(data.to) === true) data.to = relativeToAbsoluteValue(data.to, data.elem)

  }

  data.from = parseAbsoluteValue(data.from)
  data.to = parseAbsoluteValue(data.to)

  // Create a new props object to avoid changes by reference
  data.props = Object.keys(data.props).reduce((acc, key) => {

    // Copy prop object to avoid changes by reference
    const prop = Object.assign({}, data.props[key])

    if (isAbsoluteValue(prop.from) === false) throw new Error('Property `from` of prop must be a absolute value')
    if (isAbsoluteValue(prop.to) === false) throw new Error('Property `to` of prop must be a absolute value')
    if (prop.via != null && isAbsoluteValue(prop.via) === false) throw new Error('Property `via` of prop must be a absolute value')

    prop.from = parseAbsoluteValue(prop.from)
    prop.to = parseAbsoluteValue(prop.to)
    if (prop.via != null) prop.via = parseAbsoluteValue(prop.via)

    if (prop.timing == null) prop.timing = eases['linear']

    if (typeof prop.timing !== 'string' && typeof prop.timing !== 'function') throw new Error('Property `timing` of prop must be undefined, a string or a function')

    if (typeof prop.timing === 'string' && eases[prop.timing] == null) throw new Error('Unknown timing for property `timing` of prop')
    if (typeof prop.timing === 'string') prop.timing = eases[prop.timing]

    acc[key] = prop

    return acc

  }, {})

  return data

}

/**
 * Calculates prop values for a given scroll position. Pure: no callbacks, no DOM writes.
 * @param {Object} data - Validated data.
 * @param {Number} scrollTop - Pixels scrolled in document (clamped).
 * @returns {Object} precisePercentage and props
 */
const computeProps = function(data, scrollTop) {

  // 100% in pixel
  const total = data.to.value - data.from.value

  // Pixel scrolled
  const current = scrollTop - data.from.value

  // Percent scrolled (guard against division by zero)
  const precisePercentage = total === 0
    ? (current >= 0 ? 100 : 0)
    : current / (total / 100)
  const normalizedPercentage = Math.min(Math.max(precisePercentage, 0), 100)

  // All easing functions only remap a time value, and all have the same signature.
  const normalizedTime = normalizedPercentage / 100

  const props = {}

  for (const key of Object.keys(data.props)) {

    const prop = data.props[key]

    // Use the unit of from OR to. It's valid to animate from '0' to '100px' and
    // '0' should be treated as 'px', too. Unit will be an empty string when no unit given.
    const unit = prop.from.unit || prop.to.unit

    const time = prop.timing(normalizedTime)

    let value

    if (prop.via != null) {
      const midpoint = 0.5

      if (time <= midpoint) {
        const localTime = time / midpoint
        const diff = prop.from.value - prop.via.value

        value = prop.from.value - diff * localTime
      } else {
        const localTime = (time - midpoint) / midpoint
        const diff = prop.via.value - prop.to.value

        value = prop.via.value - diff * localTime
      }
    } else {
      const diff = prop.from.value - prop.to.value

      value = prop.from.value - diff * time
    }

    // Round to avoid unprecise values.
    const rounded = Math.round(value * 10000) / 10000

    props[key] = rounded + unit

  }

  return {
    precisePercentage,
    props
  }

}

/**
 * Calculates the props of an instance and executes its callbacks.
 * @param {Object} instance
 * @param {?Integer} scrollTop - Pixels scrolled in document (clamped).
 * @returns {Object} Calculated props and the element to apply styles to.
 */
const getProps = function(instance, scrollTop = getScrollTop()) {

  const data = instance.getData()

  const { precisePercentage, props } = computeProps(data, scrollTop)

  // Use precise percentage to check if the viewport is between from and to.
  const isInside = (precisePercentage >= 0 && precisePercentage <= 100)

  // Execute callbacks
  if (isInside === true) data.inside(instance, precisePercentage, props)
  else data.outside(instance, precisePercentage, props)

  return {
    elem: getElem(data),
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
    const isConstant = prop.from.value === prop.to.value && (prop.via == null || prop.via.value === prop.from.value)

    return isConstant === false

  })

}

/**
 * Returns the CSS syntax and initial value to register a custom property with.
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
 * @param {String} unit
 * @returns {Boolean} Whether the property can be animated smoothly.
 */
const registerCustomProperty = function(name, unit) {

  const { syntax, initialValue } = getSyntaxForUnit(unit)

  if (registeredProperties.has(name)) {
    const existing = registeredProperties.get(name)

    // null = registered elsewhere (e.g. @property in CSS), trust it
    return existing === null || existing === syntax
  }

  if (hasPropertyRule(name)) {
    registeredProperties.set(name, null)
    return true
  }

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
 * Checks if an instance can use a native scroll timeline.
 * @param {Object} data
 * @param {Array} animatedKeys
 * @returns {Boolean}
 */
const canUseTimeline = function(data, animatedKeys) {

  if (settings.timeline === false) return false
  if (data.timeline === false) return false
  if (data.timeline === 'lenis') return false

  // Callbacks need to run per frame, which requires the JS loop
  if (data.timeline === 'auto' && data.hasCallbacks === true) return false

  if (supportsTimeline() === false) return false

  return animatedKeys.every((key) => {
    if (key.startsWith('--') === false) return true

    const prop = data.props[key]

    return registerCustomProperty(key, prop.from.unit || prop.to.unit)
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
 * Gets and sets new props of a list of instances.
 * Make sure it's performant as hell.
 * @param {Array} list - Instances to render.
 * @param {Number} scrollTop - Pixels scrolled in document (clamped).
 */
const renderInstances = function(list, scrollTop) {

  // Calculate everything first, then write, to avoid layout thrashing
  const results = list.map((instance) => ({
    instance,
    ...getProps(instance, scrollTop)
  }))

  // Write phase
  for (const { instance, elem, props } of results) {
    setProps(elem, props, getStyleCache(instance))
  }

}

/**
 * Gets and sets new props of all active Lenis instances.
 * Runs synchronously inside Lenis's frame, right after it sets the scroll position.
 * @param {Boolean} force - Update even when the scroll position hasn't changed.
 */
const updateLenis = function(force = false) {

  if (settings.lenis == null) return

  const lenisInstances = getLenisInstances(instances)

  if (lenisInstances.length === 0) return

  const scrollTop = getLenisScrollTop()

  if (force === false && previousLenisScroll === scrollTop) return
  previousLenisScroll = scrollTop

  renderInstances(lenisInstances, scrollTop)

}

/**
 * Gets and sets new props of all active loop instances.
 * Runs inside requestAnimationFrame. Make sure it's performant as hell.
 * @param {Boolean} force - Update even when scrollTop hasn't changed.
 */
const update = function(force = false) {

  // Forced updates (start, resize, pageshow) refresh Lenis instances too
  if (force === true) updateLenis(true)

  const loopInstances = getLoopInstances(instances)

  // Only continue when active instances available
  if (loopInstances.length === 0) return

  // Read phase
  const scrollTop = getScrollTop()

  // Only continue when scrollTop has changed
  if (force === false && previousScrollTop === scrollTop) return
  previousScrollTop = scrollTop

  renderInstances(loopInstances, scrollTop)

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

    for (const instance of instances) {
      if (instance != null && instance.usesTimeline()) instance.syncTimeline()
    }

  })

}

/**
 * Recalculates all tracked instances (e.g. after a layout change).
 */
const recalculateAll = function() {

  getTrackedInstances(instances).forEach((instance) => instance.calculate())

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
 * Creates a new instance.
 * @param {Object} data
 * @returns {Object} instance
 */
export const create = function(data) {

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

    if (active) requestUpdate(true)

  }

  // Creates or refreshes the native animation
  const _syncTimeline = () => {

    if (timelineMode === false) return

    const elem = getElem(_data)

    if (elem == null) return

    const cache = getStyleCache(instance)
    const { props } = computeProps(_data, getScrollTop())

    // Props that never change are simply set once
    const staticKeys = Object.keys(props).filter((key) => animatedKeys.includes(key) === false)
    setProps(elem, pickProps(props, staticKeys), cache)

    // Not started yet: create the animation on start()
    if (active === false && animation == null) return

    const max = getMaxScrollTop()

    // Nothing to animate, or the page can't scroll
    if (animatedKeys.length === 0 || max <= 0) {
      _cancelAnimation()
      setProps(elem, pickProps(props, animatedKeys), cache)
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

  // Parses and calculates data
  const _calculate = function() {

    // Refresh cached measurements, as layout may have changed
    viewportHeight = null
    maxScrollTop = null

    _data = validate(data)

    // Styles may have been reset externally, so don't trust the cache
    styleCache.delete(instance)

    animatedKeys = getAnimatedKeys(_data)
    timelineMode = canUseTimeline(_data, animatedKeys)

    if (timelineMode) _syncTimeline()
    else _cancelAnimation()

  }

  // Update props
  const _update = () => {

    if (timelineMode) {

      // The native animation applies the styles, just refresh it
      _syncTimeline()

      // Still return props (and run callbacks) for consumers relying on it
      const { props } = getProps(instance)

      return props

    }

    // Get new props
    const scrollTop = isLenisDriven(instance) ? getLenisScrollTop() : getScrollTop()
    const { elem, props } = getProps(instance, scrollTop)

    // Set new props
    setProps(elem, props, getStyleCache(instance))

    return props

  }

  // Starts to animate
  const _start = () => {

    active = true

    if (timelineMode) _syncTimeline()
    else requestUpdate(true)

  }

  // Stops to animate
  const _stop = () => {

    active = false

    // Freeze the native animation at its current state
    if (animation != null) animation.pause()

  }

  // Destroys the instance
  const _destroy = () => {

    _cancelAnimation()

    // Replace instance instead of deleting the item to avoid
    // that the index of other instances changes.
    instances[index] = undefined
    styleCache.delete(instance)

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

  // Store instance in global array and save the index
  const index = instances.push(instance) - 1

  // Calculate data for the first time
  instance.calculate()

  return instance

}

/**
 * Starts listening for scroll changes.
 * @param {?Object} options
 * @param {?Boolean} options.recalculateOnResize - Recalculate tracked instances when the viewport width changes.
 * @param {?Boolean} options.timeline - Allow native scroll-driven animations (default true).
 * @param {?Object} options.lenis - A Lenis instance that drives instances with `timeline: 'lenis'`.
 */
export const mount = function(options = {}) {

  // Guard against multiple calls
  if (init) {
    return
  }
  init = true

  settings = Object.assign({}, settings, { lenis: null }, options)

  viewportWidth = getViewportWidth()
  viewportHeight = null
  maxScrollTop = null
  previousScrollTop = null
  previousLenisScroll = null
  lastTimelineMax = null

  const onScroll = () => requestUpdate(false)
  const onPageShow = () => {
    // Restored from bfcache: positions may be stale
    maxScrollTop = null
    lastTimelineMax = null
    requestTimelineRefresh()
    requestUpdate(true)
  }

  listeners = { onScroll, onPageShow, offLenis: null }

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

  for (const instance of instances) {
    // Check element is still in DOM
    if (instance == null) continue

    const elem = instance.getData().elem

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
    instances = []
  }

  if (listeners != null) {
    window.removeEventListener('scroll', listeners.onScroll)
    window.removeEventListener('resize', handleResize)
    window.removeEventListener('orientationchange', handleResize)
    window.removeEventListener('pageshow', listeners.onPageShow)
    if (listeners.offLenis != null) listeners.offLenis()
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

  pendingForce = false
  previousScrollTop = null
  previousLenisScroll = null
  lastTimelineMax = null
  // Don't keep a reference to a Lenis instance that may be destroyed
  settings = Object.assign({}, settings, { lenis: null })
  init = false

}