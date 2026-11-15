/**
 * Parses declarative `data-buttery*` attributes into configs for `create()`.
 *
 * <div data-buttery="from: top-bottom; to: bottom-top"
 *      data-buttery-md="to: bottom-middle"
 *      data-buttery-translate="0 0px | 0 -100px; timing: quadIn"
 *      data-buttery-translate-md="0 0px | 0 -300px"
 *      data-buttery-opacity="0 | 1; to: 50%-40%">
 */

export const PREFIX = 'data-buttery'

const INSTANCE_OPTIONS = ['from', 'to', 'elem', 'timeline', 'track']
const BREAKPOINT_INSTANCE_OPTIONS = ['from', 'to', 'timeline']
const PROP_OPTIONS = ['timing', 'from', 'to', 'prop']

/**
 * Splits a string on a separator, ignoring separators inside (), [] and quotes.
 * @param {String} string
 * @param {String} separator - A single character.
 * @returns {Array}
 */
export const splitTopLevel = function(string, separator) {

  const parts = []

  let depth = 0
  let quote = null
  let start = 0

  for (let i = 0; i < string.length; i++) {
    const char = string[i]

    if (quote != null) {
      if (char === quote) quote = null
    } else if (char === '"' || char === '\'') {
      quote = char
    } else if (char === '(' || char === '[') {
      depth++
    } else if (char === ')' || char === ']') {
      depth = Math.max(0, depth - 1)
    } else if (char === separator && depth === 0) {
      parts.push(string.slice(start, i))
      start = i + 1
    }
  }

  parts.push(string.slice(start))

  return parts

}

/**
 * Parses `key: value` pairs. Splits on the first colon only, so values can contain colons.
 * @param {Array} segments
 * @param {Array} allowed - Allowed keys.
 * @param {String} context - For error messages.
 * @returns {Object}
 */
const parsePairs = function(segments, allowed, context) {

  const options = {}

  for (const segment of segments) {
    const trimmed = segment.trim()

    if (trimmed === '') continue

    const colon = trimmed.indexOf(':')

    if (colon === -1) throw new Error(`Expected "key: value" in ${ context }, got "${ trimmed }"`)

    const key = trimmed.slice(0, colon).trim().toLowerCase()
    const value = trimmed.slice(colon + 1).trim()

    if (allowed.includes(key) === false) throw new Error(`Unknown option "${ key }" in ${ context }`)

    options[key] = value
  }

  return options

}

/**
 * Parses a boolean option.
 * @param {String} value
 * @param {String} key
 * @returns {Boolean}
 */
const parseBoolean = function(value, key) {

  if (value === 'true' || value === '') return true
  if (value === 'false') return false

  throw new Error(`Option "${ key }" must be true or false`)

}

/**
 * Parses the `timeline` option.
 * @param {String} value
 * @returns {String|Boolean}
 */
const parseTimeline = function(value) {

  if (value === 'auto' || value === 'lenis') return value

  return parseBoolean(value, 'timeline')

}

/**
 * Parses instance options (`data-buttery` and `data-buttery-<bp>`).
 * @param {String} value
 * @param {Array} allowed
 * @param {String} context
 * @returns {Object|false}
 */
const parseInstanceOptions = function(value, allowed, context) {

  if (value.trim() === 'off') return false

  const options = parsePairs(splitTopLevel(value, ';'), allowed, context)

  if (options.timeline != null) options.timeline = parseTimeline(options.timeline)
  if (options.track != null) options.track = parseBoolean(options.track, 'track')

  return options

}

/**
 * Parses a prop attribute: `from | to` or `from | via | to`, then `; option: value` pairs.
 * The values can be left out, e.g. `; to: bottom-top` only changes the range.
 * @param {String} value
 * @param {String} context
 * @returns {Object|false} { values, timing, range, prop }
 */
const parsePropAttribute = function(value, context) {

  if (value.trim() === 'off') return false

  const segments = splitTopLevel(value, ';')
  const result = { values: null, timing: null, range: {}, prop: null }

  // The first segment holds the values when it contains a top-level `|`
  if (splitTopLevel(segments[0], '|').length > 1) {
    const values = splitTopLevel(segments.shift(), '|').map((part) => part.trim())

    if (values.length > 3 || values.some((part) => part === '')) {
      throw new Error(`Expected "from | to" or "from | via | to" in ${ context }`)
    }

    result.values = values.length === 3
      ? { from: values[0], via: values[1], to: values[2] }
      : { from: values[0], via: null, to: values[1] }
  }

  const options = parsePairs(segments, PROP_OPTIONS, context)

  if (options.timing != null) result.timing = options.timing
  if (options.prop != null) result.prop = options.prop
  if (options.from != null) result.range.from = options.from
  if (options.to != null) result.range.to = options.to

  return result

}

/**
 * Converts a parsed prop attribute to a prop (or prop override) object.
 * @param {Object|false} parsed
 * @returns {Object|false}
 */
const toProp = function(parsed) {

  if (parsed === false) return false

  const prop = {}

  if (parsed.values != null) Object.assign(prop, parsed.values)
  if (parsed.timing != null) prop.timing = parsed.timing

  return prop

}

/**
 * Finds the element used to measure the range.
 * @param {Element} el
 * @param {String} selector
 * @returns {Element}
 */
const findElem = function(el, selector) {

  let elem = null

  try {
    elem = el.closest(selector) || el.ownerDocument.querySelector(selector)
  } catch (error) {
    throw new Error(`Invalid elem selector "${ selector }"`)
  }

  if (elem == null) throw new Error(`No element matches elem selector "${ selector }"`)

  return elem

}

/**
 * Parses the data-buttery attributes of an element.
 * @param {Element} el
 * @param {Array} breakpointNames - Configured breakpoint names, e.g. ['sm', 'md'].
 * @returns {Array} Configs for create(), with nested breakpoint keys.
 */
export const parseElement = function(el, breakpointNames) {

  // Longest first, so `-max-md` wins over `-md`
  const suffixes = [ ...breakpointNames, ...breakpointNames.map((name) => `max-${ name }`) ]
    .sort((a, b) => b.length - a.length)

  const base = parseInstanceOptions(el.getAttribute(PREFIX) || '', INSTANCE_OPTIONS, `${ PREFIX }`)

  if (base === false) return []

  const instanceOverrides = {}
  const groups = new Map()

  for (const attr of Array.from(el.attributes)) {

    if (attr.name.startsWith(`${ PREFIX }-`) === false) continue

    const rest = attr.name.slice(PREFIX.length + 1)
    const context = attr.name

    if (suffixes.includes(rest)) {
      instanceOverrides[rest] = parseInstanceOptions(attr.value, BREAKPOINT_INSTANCE_OPTIONS, context)
      continue
    }

    let name = rest
    let breakpoint = null

    for (const suffix of suffixes) {
      if (rest.length > suffix.length + 1 && rest.endsWith(`-${ suffix }`)) {
        name = rest.slice(0, -(suffix.length + 1))
        breakpoint = suffix
        break
      }
    }

    if (groups.has(name) === false) groups.set(name, { base: null, overrides: {} })

    const group = groups.get(name)
    const parsed = parsePropAttribute(attr.value, context)

    if (breakpoint == null) group.base = parsed
    else group.overrides[breakpoint] = parsed

  }

  if (groups.size === 0) throw new Error('No props: add at least one data-buttery-<prop> attribute')

  // Shared options of every instance created from this element
  const common = {
    from: base.from || 'top-bottom',
    to: base.to || 'bottom-top'
  }

  if (base.timeline != null) common.timeline = base.timeline
  if (base.track != null) common.track = base.track

  if (base.elem != null) {
    common.elem = findElem(el, base.elem)
    common.direct = common.elem === el ? true : el
  } else {
    common.elem = el
    common.direct = true
  }

  const shared = { props: {} }
  const configs = []

  for (const [ name, group ] of groups) {

    const parsedList = [ group.base, ...Object.values(group.overrides) ].filter((parsed) => parsed !== false && parsed != null)
    const key = parsedList.map((parsed) => parsed.prop).find((prop) => prop != null) || name

    // Without base values (or with `off`), the prop is off until a breakpoint gives it values
    const prop = group.base ? toProp(group.base) : {}

    for (const breakpoint in group.overrides) prop[breakpoint] = toProp(group.overrides[breakpoint])

    // A prop with its own range gets its own instance
    const rangeKeys = [ 'from', 'to' ].filter((rangeKey) => parsedList.some((parsed) => parsed.range[rangeKey] != null))

    if (rangeKeys.length === 0) {
      shared.props[key] = prop
      continue
    }

    const config = Object.assign({}, common, { props: { [key]: prop } })

    if (group.base) Object.assign(config, group.base.range)

    // Instance overrides, without the range keys the prop sets itself
    for (const breakpoint in instanceOverrides) {
      const override = instanceOverrides[breakpoint]

      if (override === false) {
        config[breakpoint] = false
        continue
      }

      const filtered = Object.assign({}, override)
      for (const rangeKey of rangeKeys) delete filtered[rangeKey]
      config[breakpoint] = filtered
    }

    // The prop's own range at each breakpoint
    for (const breakpoint in group.overrides) {
      const parsed = group.overrides[breakpoint]

      if (parsed === false || Object.keys(parsed.range).length === 0) continue
      if (config[breakpoint] === false) continue

      config[breakpoint] = Object.assign({}, config[breakpoint], parsed.range)
    }

    configs.push(config)

  }

  if (Object.keys(shared.props).length > 0) {
    configs.unshift(Object.assign({}, common, instanceOverrides, shared))
  }

  return configs

}
