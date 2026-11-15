/**
 * Breakpoints: configuration, media queries and resolving `md` / `max-md` overrides.
 */

// Tailwind CSS v4 default breakpoints (min-width)
export const DEFAULT_BREAKPOINTS = { sm: '40rem', md: '48rem', lg: '64rem', xl: '80rem', '2xl': '96rem' }

// Configured breakpoints by name
let configured = DEFAULT_BREAKPOINTS

// Sorted breakpoints [{ name, px, query }] (null = rebuild from the configuration)
let breakpointList = null

// Media query lists by query
const mediaQueries = new Map()

/**
 * Sets the breakpoints and clears the cached lists and media queries.
 * @param {?Object} breakpoints - Names and min-widths.
 */
export const setBreakpoints = function(breakpoints) {

  configured = breakpoints || {}
  breakpointList = null
  mediaQueries.clear()

}

/**
 * Converts a breakpoint value to pixels, for sorting. Numbers are pixels, `rem`/`em` are × 16.
 * @param {Number|String} value
 * @returns {Number}
 */
export const breakpointToPx = function(value) {

  if (typeof value === 'number') return value

  return parseFloat(value) * (/r?em$/.test(String(value).trim()) ? 16 : 1)

}

/**
 * Returns the configured breakpoints, smallest first.
 * @returns {Array} [{ name, px, query }]
 */
export const getBreakpoints = function() {

  if (breakpointList == null) {
    breakpointList = Object.keys(configured)
      .map((name) => {
        const value = configured[name]
        const width = typeof value === 'number' ? `${ value }px` : String(value).trim()

        return { name, px: breakpointToPx(value), query: `(min-width: ${ width })` }
      })
      .sort((a, b) => a.px - b.px)
  }

  return breakpointList

}

/**
 * Returns the (cached) MediaQueryList of a breakpoint.
 * @param {Object} breakpoint
 * @returns {?MediaQueryList}
 */
export const getMediaQuery = function(breakpoint) {

  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null

  let mql = mediaQueries.get(breakpoint.query)

  if (mql == null) {
    mql = window.matchMedia(breakpoint.query)
    mediaQueries.set(breakpoint.query, mql)
  }

  return mql

}

/**
 * Checks if the viewport is at least as wide as a breakpoint.
 * @param {Object} breakpoint
 * @returns {Boolean}
 */
export const matchesBreakpoint = function(breakpoint) {

  const mql = getMediaQuery(breakpoint)

  return mql != null && mql.matches

}

/**
 * Checks if a key is a breakpoint key (`md` or `max-md`).
 * @param {String} key
 * @returns {Boolean}
 */
export const isBreakpointKey = function(key) {

  return getBreakpoints().some((breakpoint) => key === breakpoint.name || key === `max-${ breakpoint.name }`)

}

/**
 * Checks if an object is a plain object (not null, not an element).
 * @param {*} value
 * @returns {Boolean}
 */
export const isPlainObject = function(value) {

  return value != null && typeof value === 'object' && (typeof Node === 'undefined' || !(value instanceof Node))

}

/**
 * Checks if raw data (or one of its props) has breakpoint keys.
 * @param {Object} raw
 * @returns {Boolean}
 */
export const hasBreakpointKeys = function(raw) {

  if (Object.keys(raw).some(isBreakpointKey)) return true
  if (isPlainObject(raw.props) === false) return false

  return Object.values(raw.props).some((prop) => isPlainObject(prop) && Object.keys(prop).some(isBreakpointKey))

}

/**
 * Returns a copy of an object without its breakpoint keys.
 * @param {Object} object
 * @returns {Object}
 */
export const withoutBreakpointKeys = function(object) {

  const result = {}

  for (const key in object) {
    if (isBreakpointKey(key) === false) result[key] = object[key]
  }

  return result

}

/**
 * Returns the overrides of an object that match the viewport, in the order they apply:
 * matching `max-*` keys (largest first), then matching min-width keys (smallest first).
 * @param {Object} object
 * @returns {Array}
 */
export const getMatchingOverrides = function(object) {

  const breakpoints = getBreakpoints()
  const overrides = []

  for (let i = breakpoints.length - 1; i >= 0; i--) {
    const key = `max-${ breakpoints[i].name }`
    if (key in object && matchesBreakpoint(breakpoints[i]) === false) overrides.push(object[key])
  }

  for (const breakpoint of breakpoints) {
    if (breakpoint.name in object && matchesBreakpoint(breakpoint)) overrides.push(object[breakpoint.name])
  }

  return overrides

}

/**
 * Resolves the breakpoint overrides of a prop.
 * A prop without `from`/`to` at its base is off until an override turns it on.
 * @param {Object|false} prop
 * @returns {?Object} null when the prop is off
 */
export const resolveProp = function(prop) {

  if (isPlainObject(prop) === false) return null

  const merged = withoutBreakpointKeys(prop)
  let enabled = merged.from != null || merged.to != null

  for (const override of getMatchingOverrides(prop)) {
    if (override === false) {
      enabled = false
    } else if (isPlainObject(override)) {
      enabled = true
      Object.assign(merged, override)
    }
  }

  return enabled ? merged : null

}

/**
 * Resolves the breakpoint overrides of instance data for the current viewport.
 * @param {Object} raw
 * @returns {Object|false} Flat data, or false when the instance is off
 */
export const resolveBreakpoints = function(raw) {

  const data = withoutBreakpointKeys(raw)
  const props = Object.assign({}, raw.props)

  let enabled = true

  for (const override of getMatchingOverrides(raw)) {

    if (override === false) {
      enabled = false
      continue
    }

    if (isPlainObject(override) === false) continue

    enabled = true

    const { props: overrideProps, ...rest } = override

    Object.assign(data, rest)

    if (isPlainObject(overrideProps)) {
      for (const key in overrideProps) {
        const value = overrideProps[key]

        props[key] = isPlainObject(value) && isPlainObject(props[key])
          ? Object.assign({}, props[key], value)
          : value
      }
    }

  }

  if (enabled === false) return false

  data.props = {}

  for (const key in props) {
    const prop = resolveProp(props[key])
    if (prop != null) data.props[key] = prop
  }

  return data

}
