/**
 * Pure value helpers: parsing ranges and prop values, validating data and interpolating props.
 */

import parseUnit from 'parse-unit'
import eases from 'eases'

/**
 * Checks if a value is absolute.
 * An absolute value must have a value that's not NaN.
 * @param {String|Integer} value
 * @returns {Boolean} isAbsolute
 */
export const isAbsoluteValue = function(value) {

  return isNaN(parseUnit(value)[0]) === false

}

/**
 * Parses an absolute value.
 * @param {String|Integer} value
 * @returns {Object} value - Parsed value.
 */
export const parseAbsoluteValue = function(value) {

  const parsedValue = parseUnit(value)

  return {
    value: parsedValue[0],
    unit: parsedValue[1]
  }

}

// A number with an optional unit, not part of a word (so `translate3d(` isn't a number).
// The first group is the preceding character (no lookbehind, for older Safari).
const NUMBER_PATTERN = /(^|[^\w#.])(-?(?:\d+\.?\d*|\.\d+))([a-zA-Z%]*)/g

/**
 * Parses a prop value that can contain several numbers, e.g. `'-100px'`,
 * `'0 -100px'` or `'translateY(10px) rotate(5deg)'`.
 * The text around the numbers is kept, so the value can be rebuilt after interpolation.
 * @param {String|Number} value
 * @returns {?Object} { numbers: [{ value, unit }], parts: [String] } (parts.length = numbers.length + 1),
 *   or null if the value contains no number.
 */
export const parsePropValue = function(value) {

  const string = String(value).trim()
  const numbers = []
  const parts = []

  let last = 0

  for (const match of string.matchAll(NUMBER_PATTERN)) {
    const start = match.index + match[1].length
    parts.push(string.slice(last, start))
    numbers.push({ value: parseFloat(match[2]), unit: match[3] })
    last = match.index + match[0].length
  }

  if (numbers.length === 0) return null

  parts.push(string.slice(last))

  // Normalise whitespace, so '0  10px' and '0 10px' have the same structure
  return {
    numbers,
    parts: parts.map((part) => part.replace(/\s+/g, ' '))
  }

}

/**
 * Checks that two parsed prop values have the same structure.
 * @param {Object} a
 * @param {Object} b
 * @returns {Boolean}
 */
export const hasSameStructure = function(a, b) {

  return a.numbers.length === b.numbers.length
    && a.parts.every((part, i) => part === b.parts[i])

}

/**
 * Checks if a value is relative.
 * A relative value must start and end with [a-z] and needs a '-' in the middle.
 * @param {String|Integer} value
 * @returns {Boolean} isRelative
 */
export const isRelativeValue = function(value) {

  return String(value).match(/^[a-z0-9%]+-[a-z0-9%]+$/) !== null

}

/**
 * Converts a relative value to an absolute value.
 * @param {String} value
 * @param {Node} elem - Anchor of the relative value.
 * @param {Number} scrollTop - Pixels scrolled in document (raw, unclamped).
 * @param {Number} vh - Height of the viewport.
 * @returns {String} value - Absolute value.
 */
export const relativeToAbsoluteValue = function(value, elem, scrollTop, vh) {

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
 * @param {Function} toAbsolute - Converts a relative value, (value, elem) => String.
 * @returns {Object} data - Validated data.
 */
export const validate = function(data = {}, toAbsolute) {

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
  if (typeof data.direct !== 'boolean' && !(data.direct instanceof Element)) throw new Error('Property `direct` must be undefined, a boolean or a DOM element/node')
  if (data.direct === true && data.elem == null) throw new Error('Property `elem` is required when `direct` is true')
  if (typeof data.track !== 'boolean') throw new Error('Property `track` must be undefined or a boolean')
  if (typeof data.props !== 'object') throw new Error('Property `props` must be undefined or an object')
  if (data.timeline !== 'auto' && data.timeline !== 'lenis' && typeof data.timeline !== 'boolean') throw new Error('Property `timeline` must be undefined, a boolean, \'auto\' or \'lenis\'')

  if (data.elem == null) {

    if (isAbsoluteValue(data.from) === false) throw new Error('Property `from` must be a absolute value when no `elem` has been provided')
    if (isAbsoluteValue(data.to) === false) throw new Error('Property `to` must be a absolute value when no `elem` has been provided')

  } else {

    if (isRelativeValue(data.from) === true) data.from = toAbsolute(data.from, data.elem)
    if (isRelativeValue(data.to) === true) data.to = toAbsolute(data.to, data.elem)

  }

  data.from = parseAbsoluteValue(data.from)
  data.to = parseAbsoluteValue(data.to)

  // Create a new props object to avoid changes by reference
  data.props = Object.keys(data.props).reduce((acc, key) => {

    // Copy prop object to avoid changes by reference
    const prop = Object.assign({}, data.props[key])

    const from = parsePropValue(prop.from)
    const to = parsePropValue(prop.to)
    const via = prop.via != null ? parsePropValue(prop.via) : null

    if (from == null) throw new Error('Property `from` of prop must contain a number')
    if (to == null) throw new Error('Property `to` of prop must contain a number')
    if (prop.via != null && via == null) throw new Error('Property `via` of prop must contain a number')

    if (hasSameStructure(from, to) === false) throw new Error(`Properties \`from\` and \`to\` of prop \`${ key }\` must have the same number of values and the same text around them`)
    if (via != null && hasSameStructure(from, via) === false) throw new Error(`Property \`via\` of prop \`${ key }\` must have the same number of values and the same text around them as \`from\``)

    prop.from = from.numbers.map((number) => number.value)
    prop.to = to.numbers.map((number) => number.value)
    prop.via = via != null ? via.numbers.map((number) => number.value) : null
    prop.parts = from.parts

    // Use the unit of from OR to, for each number. It's valid to animate from '0' to '100px' and
    // '0' should be treated as 'px', too. Unit will be an empty string when no unit given.
    prop.units = from.numbers.map((number, i) => number.unit || to.numbers[i].unit || (via != null ? via.numbers[i].unit : ''))

    if (prop.timing == null) prop.timing = eases['linear']

    if (typeof prop.timing !== 'string' && typeof prop.timing !== 'function') throw new Error('Property `timing` of prop must be undefined, a string or a function')

    if (typeof prop.timing === 'string' && eases[prop.timing] == null) throw new Error('Unknown timing for property `timing` of prop')
    if (typeof prop.timing === 'string') prop.timing = eases[prop.timing]

    acc[key] = prop

    return acc

  }, {})

  // Looked up on every frame, so only once here
  data.propKeys = Object.keys(data.props)

  return data

}

/**
 * Calculates how far through its range an instance is.
 * @param {Object} data - Validated data.
 * @param {Number} scrollTop - Pixels scrolled in document (clamped).
 * @returns {Object} precisePercentage (unclamped) and normalizedTime (clamped 0–1)
 */
export const getProgress = function(data, scrollTop) {

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

  return { precisePercentage, normalizedTime }

}

/**
 * Calculates prop values for a given scroll position. Pure: no callbacks, no DOM writes.
 * @param {Object} data - Validated data.
 * @param {Number} scrollTop - Pixels scrolled in document (clamped).
 * @returns {Object} precisePercentage, normalizedTime and props
 */
export const computeProps = function(data, scrollTop) {

  const { precisePercentage, normalizedTime } = getProgress(data, scrollTop)

  const props = {}

  for (const key of data.propKeys) {

    const prop = data.props[key]
    const time = prop.timing(normalizedTime)

    // With `via`, the first half goes from → via, the second half via → to
    let start = prop.from
    let end = prop.to
    let localTime = time

    if (prop.via != null) {
      const midpoint = 0.5

      if (time <= midpoint) {
        end = prop.via
        localTime = time / midpoint
      } else {
        start = prop.via
        localTime = (time - midpoint) / midpoint
      }
    }

    // Rebuild the value: text, number, text, number, ..., text
    let output = prop.parts[0]

    for (let i = 0; i < start.length; i++) {
      const value = start[i] - (start[i] - end[i]) * localTime

      // Round to avoid unprecise values.
      output += (Math.round(value * 10000) / 10000) + prop.units[i] + prop.parts[i + 1]
    }

    props[key] = output

  }

  return {
    precisePercentage,
    normalizedTime,
    props
  }

}
