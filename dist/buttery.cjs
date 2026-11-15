Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
// \0rolldown/runtime.js
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __copyProps = (to, from, except, desc) => {
	if (from && typeof from === "object" || typeof from === "function") for (var keys = __getOwnPropNames(from), i = 0, n = keys.length, key; i < n; i++) {
		key = keys[i];
		if (!__hasOwnProp.call(to, key) && key !== except) __defProp(to, key, {
			get: ((k) => from[k]).bind(null, key),
			enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable
		});
	}
	return to;
};
var __toESM = (mod, isNodeMode, target) => (target = mod != null ? __create(__getProtoOf(mod)) : {}, __copyProps(isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", {
	value: mod,
	enumerable: true
}) : target, mod));
let parse_unit = require("parse-unit");
parse_unit = __toESM(parse_unit, 1);
let eases = require("eases");
eases = __toESM(eases, 1);
// lib/attributes.js
/**
* Parses declarative `data-buttery*` attributes into configs for `create()`.
*
* <div data-buttery="from: top-bottom; to: bottom-top"
*      data-buttery-md="to: bottom-middle"
*      data-buttery-translate="0 0px | 0 -100px; timing: quadIn"
*      data-buttery-translate-md="0 0px | 0 -300px"
*      data-buttery-opacity="0 | 1; to: 50%-40%">
*/
var PREFIX = "data-buttery";
var INSTANCE_OPTIONS = [
	"from",
	"to",
	"elem",
	"timeline",
	"track"
];
var BREAKPOINT_INSTANCE_OPTIONS = [
	"from",
	"to",
	"timeline"
];
var PROP_OPTIONS = [
	"timing",
	"from",
	"to",
	"prop"
];
/**
* Splits a string on a separator, ignoring separators inside (), [] and quotes.
* @param {String} string
* @param {String} separator - A single character.
* @returns {Array}
*/
var splitTopLevel = function(string, separator) {
	const parts = [];
	let depth = 0;
	let quote = null;
	let start = 0;
	for (let i = 0; i < string.length; i++) {
		const char = string[i];
		if (quote != null) {
			if (char === quote) quote = null;
		} else if (char === "\"" || char === "'") quote = char;
		else if (char === "(" || char === "[") depth++;
		else if (char === ")" || char === "]") depth = Math.max(0, depth - 1);
		else if (char === separator && depth === 0) {
			parts.push(string.slice(start, i));
			start = i + 1;
		}
	}
	parts.push(string.slice(start));
	return parts;
};
/**
* Parses `key: value` pairs. Splits on the first colon only, so values can contain colons.
* @param {Array} segments
* @param {Array} allowed - Allowed keys.
* @param {String} context - For error messages.
* @returns {Object}
*/
var parsePairs = function(segments, allowed, context) {
	const options = {};
	for (const segment of segments) {
		const trimmed = segment.trim();
		if (trimmed === "") continue;
		const colon = trimmed.indexOf(":");
		if (colon === -1) throw new Error(`Expected "key: value" in ${context}, got "${trimmed}"`);
		const key = trimmed.slice(0, colon).trim().toLowerCase();
		const value = trimmed.slice(colon + 1).trim();
		if (allowed.includes(key) === false) throw new Error(`Unknown option "${key}" in ${context}`);
		options[key] = value;
	}
	return options;
};
/**
* Parses a boolean option.
* @param {String} value
* @param {String} key
* @returns {Boolean}
*/
var parseBoolean = function(value, key) {
	if (value === "true" || value === "") return true;
	if (value === "false") return false;
	throw new Error(`Option "${key}" must be true or false`);
};
/**
* Parses the `timeline` option.
* @param {String} value
* @returns {String|Boolean}
*/
var parseTimeline = function(value) {
	if (value === "auto" || value === "lenis") return value;
	return parseBoolean(value, "timeline");
};
/**
* Parses instance options (`data-buttery` and `data-buttery-<bp>`).
* @param {String} value
* @param {Array} allowed
* @param {String} context
* @returns {Object|false}
*/
var parseInstanceOptions = function(value, allowed, context) {
	if (value.trim() === "off") return false;
	const options = parsePairs(splitTopLevel(value, ";"), allowed, context);
	if (options.timeline != null) options.timeline = parseTimeline(options.timeline);
	if (options.track != null) options.track = parseBoolean(options.track, "track");
	return options;
};
/**
* Parses a prop attribute: `from | to` or `from | via | to`, then `; option: value` pairs.
* The values can be left out, e.g. `; to: bottom-top` only changes the range.
* @param {String} value
* @param {String} context
* @returns {Object|false} { values, timing, range, prop }
*/
var parsePropAttribute = function(value, context) {
	if (value.trim() === "off") return false;
	const segments = splitTopLevel(value, ";");
	const result = {
		values: null,
		timing: null,
		range: {},
		prop: null
	};
	if (splitTopLevel(segments[0], "|").length > 1) {
		const values = splitTopLevel(segments.shift(), "|").map((part) => part.trim());
		if (values.length > 3 || values.some((part) => part === "")) throw new Error(`Expected "from | to" or "from | via | to" in ${context}`);
		result.values = values.length === 3 ? {
			from: values[0],
			via: values[1],
			to: values[2]
		} : {
			from: values[0],
			via: null,
			to: values[1]
		};
	}
	const options = parsePairs(segments, PROP_OPTIONS, context);
	if (options.timing != null) result.timing = options.timing;
	if (options.prop != null) result.prop = options.prop;
	if (options.from != null) result.range.from = options.from;
	if (options.to != null) result.range.to = options.to;
	return result;
};
/**
* Converts a parsed prop attribute to a prop (or prop override) object.
* @param {Object|false} parsed
* @returns {Object|false}
*/
var toProp = function(parsed) {
	if (parsed === false) return false;
	const prop = {};
	if (parsed.values != null) Object.assign(prop, parsed.values);
	if (parsed.timing != null) prop.timing = parsed.timing;
	return prop;
};
/**
* Finds the element used to measure the range.
* @param {Element} el
* @param {String} selector
* @returns {Element}
*/
var findElem = function(el, selector) {
	let elem = null;
	try {
		elem = el.closest(selector) || el.ownerDocument.querySelector(selector);
	} catch (error) {
		throw new Error(`Invalid elem selector "${selector}"`);
	}
	if (elem == null) throw new Error(`No element matches elem selector "${selector}"`);
	return elem;
};
/**
* Parses the data-buttery attributes of an element.
* @param {Element} el
* @param {Array} breakpointNames - Configured breakpoint names, e.g. ['sm', 'md'].
* @returns {Array} Configs for create(), with nested breakpoint keys.
*/
var parseElement = function(el, breakpointNames) {
	const suffixes = [...breakpointNames, ...breakpointNames.map((name) => `max-${name}`)].sort((a, b) => b.length - a.length);
	const base = parseInstanceOptions(el.getAttribute("data-buttery") || "", INSTANCE_OPTIONS, `${PREFIX}`);
	if (base === false) return [];
	const instanceOverrides = {};
	const groups = /* @__PURE__ */ new Map();
	for (const attr of Array.from(el.attributes)) {
		if (attr.name.startsWith(`data-buttery-`) === false) continue;
		const rest = attr.name.slice(13);
		const context = attr.name;
		if (suffixes.includes(rest)) {
			instanceOverrides[rest] = parseInstanceOptions(attr.value, BREAKPOINT_INSTANCE_OPTIONS, context);
			continue;
		}
		let name = rest;
		let breakpoint = null;
		for (const suffix of suffixes) if (rest.length > suffix.length + 1 && rest.endsWith(`-${suffix}`)) {
			name = rest.slice(0, -(suffix.length + 1));
			breakpoint = suffix;
			break;
		}
		if (groups.has(name) === false) groups.set(name, {
			base: null,
			overrides: {}
		});
		const group = groups.get(name);
		const parsed = parsePropAttribute(attr.value, context);
		if (breakpoint == null) group.base = parsed;
		else group.overrides[breakpoint] = parsed;
	}
	if (groups.size === 0) throw new Error("No props: add at least one data-buttery-<prop> attribute");
	const common = {
		from: base.from || "top-bottom",
		to: base.to || "bottom-top"
	};
	if (base.timeline != null) common.timeline = base.timeline;
	if (base.track != null) common.track = base.track;
	if (base.elem != null) {
		common.elem = findElem(el, base.elem);
		common.direct = common.elem === el ? true : el;
	} else {
		common.elem = el;
		common.direct = true;
	}
	const shared = { props: {} };
	const configs = [];
	for (const [name, group] of groups) {
		const parsedList = [group.base, ...Object.values(group.overrides)].filter((parsed) => parsed !== false && parsed != null);
		const key = parsedList.map((parsed) => parsed.prop).find((prop) => prop != null) || name;
		const prop = group.base ? toProp(group.base) : {};
		for (const breakpoint in group.overrides) prop[breakpoint] = toProp(group.overrides[breakpoint]);
		const rangeKeys = ["from", "to"].filter((rangeKey) => parsedList.some((parsed) => parsed.range[rangeKey] != null));
		if (rangeKeys.length === 0) {
			shared.props[key] = prop;
			continue;
		}
		const config = Object.assign({}, common, { props: { [key]: prop } });
		if (group.base) Object.assign(config, group.base.range);
		for (const breakpoint in instanceOverrides) {
			const override = instanceOverrides[breakpoint];
			if (override === false) {
				config[breakpoint] = false;
				continue;
			}
			const filtered = Object.assign({}, override);
			for (const rangeKey of rangeKeys) delete filtered[rangeKey];
			config[breakpoint] = filtered;
		}
		for (const breakpoint in group.overrides) {
			const parsed = group.overrides[breakpoint];
			if (parsed === false || Object.keys(parsed.range).length === 0) continue;
			if (config[breakpoint] === false) continue;
			config[breakpoint] = Object.assign({}, config[breakpoint], parsed.range);
		}
		configs.push(config);
	}
	if (Object.keys(shared.props).length > 0) configs.unshift(Object.assign({}, common, instanceOverrides, shared));
	return configs;
};
// lib/buttery.js
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
var DEFAULT_BREAKPOINTS = {
	sm: "40rem",
	md: "48rem",
	lg: "64rem",
	xl: "80rem",
	"2xl": "96rem"
};
var RESERVED_KEYS = [
	"from",
	"to",
	"via",
	"timing",
	"elem",
	"props",
	"direct",
	"track",
	"timeline",
	"inside",
	"outside"
];
var instances = /* @__PURE__ */ new Set();
var frameId = null;
var pendingForce = false;
var init = false;
var previousScrollTop = null;
var previousLenisScroll = null;
var maxScrollTop = null;
var viewportHeight = null;
var viewportWidth = null;
var listeners = null;
var resizeObserver = null;
var timelineFrameId = null;
var lastTimelineMax = null;
var scrollTimeline = null;
var timelineSupport = null;
var settings = {
	recalculateOnResize: false,
	timeline: true,
	lenis: null,
	nativeOnTouch: true,
	breakpoints: DEFAULT_BREAKPOINTS
};
var breakpointList = null;
var mediaQueries = /* @__PURE__ */ new Map();
var breakpointFrameId = null;
var recalculateFrameId = null;
var declarativeInstances = /* @__PURE__ */ new Set();
var scannedElements = /* @__PURE__ */ new WeakMap();
var failedElements = /* @__PURE__ */ new WeakSet();
var TIMELINE_SAMPLES = 30;
var styleCache = /* @__PURE__ */ new WeakMap();
var LAST_TIME = Symbol("lastTime");
var internals = /* @__PURE__ */ new WeakMap();
var lists = null;
var registeredProperties = /* @__PURE__ */ new Map();
/**
* Debounces a function that will be triggered many times.
* @param {Function} fn
* @param {Number} duration
* @returns {Function}
*/
var debounce = function(fn, duration) {
	let timeout = null;
	const debounced = (...args) => {
		clearTimeout(timeout);
		timeout = setTimeout(() => fn(...args), duration);
	};
	debounced.cancel = () => clearTimeout(timeout);
	return debounced;
};
/**
* Checks if an instance is driven by an attached Lenis instance.
* @param {Object} instance
* @returns {Boolean}
*/
var isLenisDriven = function(instance) {
	return init === true && settings.lenis != null && instance.getData().timeline === "lenis" && instance.usesTimeline() === false;
};
/**
* Marks the cached instance lists as stale.
* Call whenever an instance is added, removed, started, stopped or changes mode.
*/
var invalidateLists = function() {
	lists = null;
};
/**
* Returns the active instances driven by the JS loop (window scroll listener)
* and by Lenis. Cached, so filtering doesn't happen on every frame.
* @returns {Object} { loop, lenis }
*/
var getLists = function() {
	if (lists != null) return lists;
	const loop = [];
	const lenis = [];
	for (const instance of instances) {
		if (instance.isActive() === false || instance.usesTimeline()) continue;
		const data = instance.getData();
		if (data == null || data.disabled === true) continue;
		if (isLenisDriven(instance)) lenis.push(instance);
		else loop.push(instance);
	}
	lists = {
		loop,
		lenis
	};
	return lists;
};
/**
* Returns all tracked instances from a list.
* @param {Iterable} list
* @returns {Array} instances - Tracked instances.
*/
var getTrackedInstances = function(list) {
	return Array.from(list).filter((instance) => instance.getData() != null && instance.getData().track);
};
/**
* Converts a breakpoint value to pixels, for sorting. Numbers are pixels, `rem`/`em` are × 16.
* @param {Number|String} value
* @returns {Number}
*/
var breakpointToPx = function(value) {
	if (typeof value === "number") return value;
	return parseFloat(value) * (/r?em$/.test(String(value).trim()) ? 16 : 1);
};
/**
* Returns the configured breakpoints, smallest first.
* @returns {Array} [{ name, px, query }]
*/
var getBreakpoints = function() {
	if (breakpointList == null) breakpointList = Object.keys(settings.breakpoints || {}).map((name) => {
		const value = settings.breakpoints[name];
		const width = typeof value === "number" ? `${value}px` : String(value).trim();
		return {
			name,
			px: breakpointToPx(value),
			query: `(min-width: ${width})`
		};
	}).sort((a, b) => a.px - b.px);
	return breakpointList;
};
/**
* Returns the (cached) MediaQueryList of a breakpoint.
* @param {Object} breakpoint
* @returns {?MediaQueryList}
*/
var getMediaQuery = function(breakpoint) {
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") return null;
	let mql = mediaQueries.get(breakpoint.query);
	if (mql == null) {
		mql = window.matchMedia(breakpoint.query);
		mediaQueries.set(breakpoint.query, mql);
	}
	return mql;
};
/**
* Checks if the viewport is at least as wide as a breakpoint.
* @param {Object} breakpoint
* @returns {Boolean}
*/
var matchesBreakpoint = function(breakpoint) {
	const mql = getMediaQuery(breakpoint);
	return mql != null && mql.matches;
};
/**
* Checks if a key is a breakpoint key (`md` or `max-md`).
* @param {String} key
* @returns {Boolean}
*/
var isBreakpointKey = function(key) {
	return getBreakpoints().some((breakpoint) => key === breakpoint.name || key === `max-${breakpoint.name}`);
};
/**
* Checks if an object is a plain object (not null, not an element).
* @param {*} value
* @returns {Boolean}
*/
var isPlainObject = function(value) {
	return value != null && typeof value === "object" && (typeof Node === "undefined" || !(value instanceof Node));
};
/**
* Checks if raw data (or one of its props) has breakpoint keys.
* @param {Object} raw
* @returns {Boolean}
*/
var hasBreakpointKeys = function(raw) {
	if (Object.keys(raw).some(isBreakpointKey)) return true;
	if (isPlainObject(raw.props) === false) return false;
	return Object.values(raw.props).some((prop) => isPlainObject(prop) && Object.keys(prop).some(isBreakpointKey));
};
/**
* Returns a copy of an object without its breakpoint keys.
* @param {Object} object
* @returns {Object}
*/
var withoutBreakpointKeys = function(object) {
	const result = {};
	for (const key in object) if (isBreakpointKey(key) === false) result[key] = object[key];
	return result;
};
/**
* Returns the overrides of an object that match the viewport, in the order they apply:
* matching `max-*` keys (largest first), then matching min-width keys (smallest first).
* @param {Object} object
* @returns {Array}
*/
var getMatchingOverrides = function(object) {
	const breakpoints = getBreakpoints();
	const overrides = [];
	for (let i = breakpoints.length - 1; i >= 0; i--) {
		const key = `max-${breakpoints[i].name}`;
		if (key in object && matchesBreakpoint(breakpoints[i]) === false) overrides.push(object[key]);
	}
	for (const breakpoint of breakpoints) if (breakpoint.name in object && matchesBreakpoint(breakpoint)) overrides.push(object[breakpoint.name]);
	return overrides;
};
/**
* Resolves the breakpoint overrides of a prop.
* A prop without `from`/`to` at its base is off until an override turns it on.
* @param {Object|false} prop
* @returns {?Object} null when the prop is off
*/
var resolveProp = function(prop) {
	if (isPlainObject(prop) === false) return null;
	const merged = withoutBreakpointKeys(prop);
	let enabled = merged.from != null || merged.to != null;
	for (const override of getMatchingOverrides(prop)) if (override === false) enabled = false;
	else if (isPlainObject(override)) {
		enabled = true;
		Object.assign(merged, override);
	}
	return enabled ? merged : null;
};
/**
* Resolves the breakpoint overrides of instance data for the current viewport.
* @param {Object} raw
* @returns {Object|false} Flat data, or false when the instance is off
*/
var resolveBreakpoints = function(raw) {
	const data = withoutBreakpointKeys(raw);
	const props = Object.assign({}, raw.props);
	let enabled = true;
	for (const override of getMatchingOverrides(raw)) {
		if (override === false) {
			enabled = false;
			continue;
		}
		if (isPlainObject(override) === false) continue;
		enabled = true;
		const { props: overrideProps, ...rest } = override;
		Object.assign(data, rest);
		if (isPlainObject(overrideProps)) for (const key in overrideProps) {
			const value = overrideProps[key];
			props[key] = isPlainObject(value) && isPlainObject(props[key]) ? Object.assign({}, props[key], value) : value;
		}
	}
	if (enabled === false) return false;
	data.props = {};
	for (const key in props) {
		const prop = resolveProp(props[key]);
		if (prop != null) data.props[key] = prop;
	}
	return data;
};
/**
* Checks if native scroll-driven animations can be used.
* @returns {Boolean}
*/
var supportsTimeline = function() {
	if (timelineSupport == null) timelineSupport = typeof window !== "undefined" && typeof window.ScrollTimeline === "function" && typeof window.Animation === "function" && typeof window.KeyframeEffect === "function" && window.CSS != null && typeof window.CSS.registerProperty === "function";
	return timelineSupport;
};
/**
* Returns the scrolling element.
* @returns {Element}
*/
var getScrollingElement = function() {
	return document.scrollingElement || document.documentElement;
};
/**
* Returns the shared document scroll timeline.
* @returns {ScrollTimeline}
*/
var getScrollTimeline = function() {
	if (scrollTimeline == null) scrollTimeline = new ScrollTimeline({
		source: getScrollingElement(),
		axis: "block"
	});
	return scrollTimeline;
};
/**
* Returns the raw number of scrolled pixels.
* Can be negative or exceed the max scroll position during iOS rubber-band overscroll.
* Use this for measuring element positions (it stays consistent with getBoundingClientRect).
* @returns {Number} scrollTop
*/
var getRawScrollTop = function() {
	return getScrollingElement().scrollTop;
};
/**
* Returns the maximum scrollable distance.
* @returns {Number}
*/
var getMaxScrollTop = function() {
	const elem = getScrollingElement();
	return Math.max(0, elem.scrollHeight - elem.clientHeight);
};
/**
* Returns the number of scrolled pixels, clamped to the scrollable range.
* This prevents iOS rubber-band overscroll from making animations bounce.
* @returns {Number} scrollTop
*/
var getScrollTop = function() {
	const scrollTop = getRawScrollTop();
	if (scrollTop <= 0) return 0;
	if (maxScrollTop == null || scrollTop > maxScrollTop) maxScrollTop = getMaxScrollTop();
	return Math.min(scrollTop, maxScrollTop);
};
/**
* Returns the (sub-pixel) scroll position of the attached Lenis instance,
* clamped to its scrollable range.
* @returns {Number} scrollTop
*/
var getLenisScrollTop = function() {
	const lenis = settings.lenis;
	return Math.min(Math.max(lenis.scroll, 0), Math.max(lenis.limit, 0));
};
/**
* Returns a stable height of the viewport.
* documentElement.clientHeight doesn't change when the iOS Safari toolbar
* collapses/expands, unlike window.innerHeight, so calculated positions stay put.
* @returns {Number} viewportHeight
*/
var getViewportHeight = function() {
	if (viewportHeight == null) viewportHeight = document.documentElement.clientHeight || window.innerHeight || window.outerHeight;
	return viewportHeight;
};
/**
* Returns the width of the viewport.
* @returns {Number} viewportWidth
*/
var getViewportWidth = function() {
	return document.documentElement.clientWidth || window.innerWidth;
};
/**
* Checks if a value is absolute.
* An absolute value must have a value that's not NaN.
* @param {String|Integer} value
* @returns {Boolean} isAbsolute
*/
var isAbsoluteValue = function(value) {
	return isNaN((0, parse_unit.default)(value)[0]) === false;
};
/**
* Parses an absolute value.
* @param {String|Integer} value
* @returns {Object} value - Parsed value.
*/
var parseAbsoluteValue = function(value) {
	const parsedValue = (0, parse_unit.default)(value);
	return {
		value: parsedValue[0],
		unit: parsedValue[1]
	};
};
var NUMBER_PATTERN = /(^|[^\w#.])(-?(?:\d+\.?\d*|\.\d+))([a-zA-Z%]*)/g;
/**
* Parses a prop value that can contain several numbers, e.g. `'-100px'`,
* `'0 -100px'` or `'translateY(10px) rotate(5deg)'`.
* The text around the numbers is kept, so the value can be rebuilt after interpolation.
* @param {String|Number} value
* @returns {?Object} { numbers: [{ value, unit }], parts: [String] } (parts.length = numbers.length + 1),
*   or null if the value contains no number.
*/
var parsePropValue = function(value) {
	const string = String(value).trim();
	const numbers = [];
	const parts = [];
	let last = 0;
	for (const match of string.matchAll(NUMBER_PATTERN)) {
		const start = match.index + match[1].length;
		parts.push(string.slice(last, start));
		numbers.push({
			value: parseFloat(match[2]),
			unit: match[3]
		});
		last = match.index + match[0].length;
	}
	if (numbers.length === 0) return null;
	parts.push(string.slice(last));
	return {
		numbers,
		parts: parts.map((part) => part.replace(/\s+/g, " "))
	};
};
/**
* Checks that two parsed prop values have the same structure.
* @param {Object} a
* @param {Object} b
* @returns {Boolean}
*/
var hasSameStructure = function(a, b) {
	return a.numbers.length === b.numbers.length && a.parts.every((part, i) => part === b.parts[i]);
};
/**
* Checks if a value is relative.
* A relative value must start and end with [a-z] and needs a '-' in the middle.
* @param {String|Integer} value
* @returns {Boolean} isRelative
*/
var isRelativeValue = function(value) {
	return String(value).match(/^[a-z0-9%]+-[a-z0-9%]+$/) !== null;
};
/**
* Returns the property that should be used according to direct.
* @param {Boolean|Node} direct
* @param {Object} properties
* @returns {*}
*/
var mapDirectToProperty = function(direct, properties) {
	if (direct === true) return properties.elem;
	if (direct instanceof Element) return properties.direct;
	return properties.global;
};
/**
* Returns the element styles should be applied to.
* @param {Object} data
* @returns {?Element}
*/
var getElem = function(data) {
	return mapDirectToProperty(data.direct, {
		global: document.documentElement,
		elem: data.elem,
		direct: data.direct
	});
};
/**
* Converts a relative value to an absolute value.
* @param {String} value
* @param {Node} elem - Anchor of the relative value.
* @param {?Integer} scrollTop - Pixels scrolled in document (raw, unclamped).
* @param {?Integer} vh - Height of the viewport.
* @returns {String} value - Absolute value.
*/
var relativeToAbsoluteValue = function(value, elem, scrollTop = getRawScrollTop(), vh = getViewportHeight()) {
	const elemSize = elem.getBoundingClientRect();
	const elemAnchor = value.match(/^[a-z0-9%]+/)[0];
	const viewportAnchor = value.match(/[a-z0-9%]+$/)[0];
	const elemTop = elemSize.top + scrollTop;
	let y = 0;
	if (viewportAnchor.match(/%$/) !== null) {
		const percent = parseFloat(viewportAnchor.replace("%", "")) / 100;
		y -= vh * percent;
	} else {
		if (viewportAnchor === "top") y -= 0;
		if (viewportAnchor === "middle") y -= vh / 2;
		if (viewportAnchor === "bottom") y -= vh;
	}
	if (elemAnchor.match(/%$/) !== null) {
		const percent = parseFloat(elemAnchor.replace("%", "")) / 100;
		y += elemTop + elemSize.height * percent;
	} else {
		if (elemAnchor === "top") y += elemTop;
		if (elemAnchor === "middle") y += elemTop + elemSize.height / 2;
		if (elemAnchor === "bottom") y += elemTop + elemSize.height;
	}
	return `${y}px`;
};
/**
* Validates data and sets defaults for undefined properties.
* @param {?Object} data
* @returns {Object} data - Validated data.
*/
var validate = function(data = {}) {
	data = Object.assign({}, data);
	data.hasCallbacks = data.inside != null || data.outside != null;
	if (data.inside == null) data.inside = () => {};
	if (data.outside == null) data.outside = () => {};
	if (data.direct == null) data.direct = false;
	if (data.track == null) data.track = true;
	if (data.props == null) data.props = {};
	if (data.timeline == null) data.timeline = "auto";
	if (data.from == null) throw new Error("Missing property `from`");
	if (data.to == null) throw new Error("Missing property `to`");
	if (typeof data.inside !== "function") throw new Error("Property `inside` must be undefined or a function");
	if (typeof data.outside !== "function") throw new Error("Property `outside` must be undefined or a function");
	if (typeof data.direct !== "boolean" && !(data.direct instanceof Element)) throw new Error("Property `direct` must be undefined, a boolean or a DOM element/node");
	if (data.direct === true && data.elem == null) throw new Error("Property `elem` is required when `direct` is true");
	if (typeof data.track !== "boolean") throw new Error("Property `track` must be undefined or a boolean");
	if (typeof data.props !== "object") throw new Error("Property `props` must be undefined or an object");
	if (data.timeline !== "auto" && data.timeline !== "lenis" && typeof data.timeline !== "boolean") throw new Error("Property `timeline` must be undefined, a boolean, 'auto' or 'lenis'");
	if (data.elem == null) {
		if (isAbsoluteValue(data.from) === false) throw new Error("Property `from` must be a absolute value when no `elem` has been provided");
		if (isAbsoluteValue(data.to) === false) throw new Error("Property `to` must be a absolute value when no `elem` has been provided");
	} else {
		if (isRelativeValue(data.from) === true) data.from = relativeToAbsoluteValue(data.from, data.elem);
		if (isRelativeValue(data.to) === true) data.to = relativeToAbsoluteValue(data.to, data.elem);
	}
	data.from = parseAbsoluteValue(data.from);
	data.to = parseAbsoluteValue(data.to);
	data.props = Object.keys(data.props).reduce((acc, key) => {
		const prop = Object.assign({}, data.props[key]);
		const from = parsePropValue(prop.from);
		const to = parsePropValue(prop.to);
		const via = prop.via != null ? parsePropValue(prop.via) : null;
		if (from == null) throw new Error("Property `from` of prop must contain a number");
		if (to == null) throw new Error("Property `to` of prop must contain a number");
		if (prop.via != null && via == null) throw new Error("Property `via` of prop must contain a number");
		if (hasSameStructure(from, to) === false) throw new Error(`Properties \`from\` and \`to\` of prop \`${key}\` must have the same number of values and the same text around them`);
		if (via != null && hasSameStructure(from, via) === false) throw new Error(`Property \`via\` of prop \`${key}\` must have the same number of values and the same text around them as \`from\``);
		prop.from = from.numbers.map((number) => number.value);
		prop.to = to.numbers.map((number) => number.value);
		prop.via = via != null ? via.numbers.map((number) => number.value) : null;
		prop.parts = from.parts;
		prop.units = from.numbers.map((number, i) => number.unit || to.numbers[i].unit || (via != null ? via.numbers[i].unit : ""));
		if (prop.timing == null) prop.timing = eases.default["linear"];
		if (typeof prop.timing !== "string" && typeof prop.timing !== "function") throw new Error("Property `timing` of prop must be undefined, a string or a function");
		if (typeof prop.timing === "string" && eases.default[prop.timing] == null) throw new Error("Unknown timing for property `timing` of prop");
		if (typeof prop.timing === "string") prop.timing = eases.default[prop.timing];
		acc[key] = prop;
		return acc;
	}, {});
	data.propKeys = Object.keys(data.props);
	return data;
};
/**
* Calculates how far through its range an instance is.
* @param {Object} data - Validated data.
* @param {Number} scrollTop - Pixels scrolled in document (clamped).
* @returns {Object} precisePercentage (unclamped) and normalizedTime (clamped 0–1)
*/
var getProgress = function(data, scrollTop) {
	const total = data.to.value - data.from.value;
	const current = scrollTop - data.from.value;
	const precisePercentage = total === 0 ? current >= 0 ? 100 : 0 : current / (total / 100);
	return {
		precisePercentage,
		normalizedTime: Math.min(Math.max(precisePercentage, 0), 100) / 100
	};
};
/**
* Calculates prop values for a given scroll position. Pure: no callbacks, no DOM writes.
* @param {Object} data - Validated data.
* @param {Number} scrollTop - Pixels scrolled in document (clamped).
* @returns {Object} precisePercentage, normalizedTime and props
*/
var computeProps = function(data, scrollTop) {
	const { precisePercentage, normalizedTime } = getProgress(data, scrollTop);
	const props = {};
	for (const key of data.propKeys) {
		const prop = data.props[key];
		const time = prop.timing(normalizedTime);
		let start = prop.from;
		let end = prop.to;
		let localTime = time;
		if (prop.via != null) {
			const midpoint = .5;
			if (time <= midpoint) {
				end = prop.via;
				localTime = time / midpoint;
			} else {
				start = prop.via;
				localTime = (time - midpoint) / midpoint;
			}
		}
		let output = prop.parts[0];
		for (let i = 0; i < start.length; i++) {
			const value = start[i] - (start[i] - end[i]) * localTime;
			output += Math.round(value * 1e4) / 1e4 + prop.units[i] + prop.parts[i + 1];
		}
		props[key] = output;
	}
	return {
		precisePercentage,
		normalizedTime,
		props
	};
};
/**
* Calculates the props of an instance and executes its callbacks.
* @param {Object} instance
* @param {?Integer} scrollTop - Pixels scrolled in document (clamped).
* @returns {Object} Calculated props and the element to apply styles to.
*/
var getProps = function(instance, scrollTop = getScrollTop()) {
	const data = instance.getData();
	const { precisePercentage, normalizedTime, props } = computeProps(data, scrollTop);
	if ((precisePercentage >= 0 && precisePercentage <= 100) === true) data.inside(instance, precisePercentage, props);
	else data.outside(instance, precisePercentage, props);
	return {
		elem: getElem(data),
		normalizedTime,
		props
	};
};
/**
* Adds properties to a given style object, skipping values that haven't changed.
* @param {Node} elem - Styles will be applied to this element.
* @param {Object} props - Object of props.
* @param {?Object} cache - Last applied values.
*/
var setProps = function(elem, props, cache = null) {
	if (elem == null) return;
	for (const key in props) {
		const value = props[key];
		if (cache != null) {
			if (cache[key] === value) continue;
			cache[key] = value;
		}
		elem.style.setProperty(key, value);
	}
};
/**
* Returns the style cache of an instance.
* @param {Object} instance
* @returns {Object}
*/
var getStyleCache = function(instance) {
	let cache = styleCache.get(instance);
	if (cache == null) {
		cache = {};
		styleCache.set(instance, cache);
	}
	return cache;
};
/**
* Returns a subset of props.
* @param {Object} props
* @param {Array} keys
* @returns {Object}
*/
var pickProps = function(props, keys) {
	return keys.reduce((acc, key) => {
		acc[key] = props[key];
		return acc;
	}, {});
};
/**
* Returns the keys of props whose value actually changes while scrolling.
* @param {Object} data
* @returns {Array}
*/
var getAnimatedKeys = function(data) {
	return Object.keys(data.props).filter((key) => {
		const prop = data.props[key];
		return prop.from.every((value, i) => value === prop.to[i] && (prop.via == null || prop.via[i] === value)) === false;
	});
};
/**
* Returns the CSS syntax and initial value to register a custom property with.
* A value with several numbers needs a space-separated list syntax (e.g. `<length-percentage>+`).
* @param {Object} prop - Validated prop.
* @returns {?Object} null if no syntax can describe the value (e.g. it contains functions).
*/
var getSyntaxForProp = function(prop) {
	const types = prop.units.map((unit) => getSyntaxForUnit(unit));
	if (types.length === 1 && prop.parts[0] === "" && prop.parts[1] === "") return types[0];
	if ((prop.parts[0] === "" && prop.parts[prop.parts.length - 1] === "" && prop.parts.slice(1, -1).every((part) => part === " ") && types.every((type) => type.syntax === types[0].syntax)) === false) return null;
	return {
		syntax: `${types[0].syntax}+`,
		initialValue: types[0].initialValue
	};
};
/**
* Returns the CSS syntax and initial value for a single number with a unit.
* @param {String} unit
* @returns {Object}
*/
var getSyntaxForUnit = function(unit) {
	if (unit === "") return {
		syntax: "<number>",
		initialValue: "0"
	};
	if ([
		"deg",
		"grad",
		"rad",
		"turn"
	].includes(unit)) return {
		syntax: "<angle>",
		initialValue: "0deg"
	};
	if (["s", "ms"].includes(unit)) return {
		syntax: "<time>",
		initialValue: "0s"
	};
	return {
		syntax: "<length-percentage>",
		initialValue: "0px"
	};
};
/**
* Checks if a stylesheet already registers a custom property with @property.
* CSS.registerProperty() doesn't throw in that case: it silently takes precedence,
* which would replace the author's syntax and initial value.
* @param {String} name
* @returns {Boolean}
*/
var hasPropertyRule = function(name) {
	if (typeof CSSPropertyRule === "undefined") return false;
	const search = function(rules) {
		for (const rule of rules) {
			if (rule instanceof CSSPropertyRule && rule.name === name) return true;
			if (rule.cssRules != null && search(rule.cssRules)) return true;
		}
		return false;
	};
	return [...document.styleSheets, ...document.adoptedStyleSheets || []].some((sheet) => {
		try {
			return search(sheet.cssRules);
		} catch (error) {
			return false;
		}
	});
};
/**
* Registers a custom property so it can be interpolated by the animation engine.
* @param {String} name
* @param {Object} prop - Validated prop.
* @returns {Boolean} Whether the property can be animated smoothly.
*/
var registerCustomProperty = function(name, prop) {
	const type = getSyntaxForProp(prop);
	if (registeredProperties.has(name)) {
		const existing = registeredProperties.get(name);
		return existing === null || type != null && existing === type.syntax;
	}
	if (hasPropertyRule(name)) {
		registeredProperties.set(name, null);
		return true;
	}
	if (type == null) return false;
	const { syntax, initialValue } = type;
	try {
		CSS.registerProperty({
			name,
			syntax,
			inherits: true,
			initialValue
		});
		registeredProperties.set(name, syntax);
		return true;
	} catch (error) {
		if (error != null && error.name === "InvalidModificationError") {
			registeredProperties.set(name, null);
			return true;
		}
		return false;
	}
};
/**
* Converts a CSS property name to a keyframe key.
* @param {String} key
* @returns {String}
*/
var toKeyframeKey = function(key) {
	if (key.startsWith("--")) return key;
	return key.replace(/-([a-z])/g, (match, char) => char.toUpperCase());
};
/**
* Checks if a 'lenis' instance should use a native timeline instead.
* Lenis only smooths touch scrolling with `syncTouch`. Without it, touch scrolling is native,
* and a native timeline follows it more smoothly than JS reacting to scroll events (e.g. iOS Safari).
* @returns {Boolean}
*/
var prefersNativeForLenis = function() {
	if (settings.nativeOnTouch !== true) return false;
	if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
	const touchFirst = window.matchMedia("(hover: none) and (pointer: coarse)").matches;
	const lenisSyncsTouch = settings.lenis != null && settings.lenis.options != null && settings.lenis.options.syncTouch === true;
	return touchFirst && lenisSyncsTouch === false;
};
/**
* Checks if an instance can use a native scroll timeline.
* @param {Object} data
* @param {Array} animatedKeys
* @returns {Boolean}
*/
var canUseTimeline = function(data, animatedKeys) {
	if (settings.timeline === false) return false;
	if (data.timeline === false) return false;
	if (data.timeline === "lenis" && (data.hasCallbacks === true || prefersNativeForLenis() === false)) return false;
	if (data.timeline === "auto" && data.hasCallbacks === true) return false;
	if (supportsTimeline() === false) return false;
	return animatedKeys.every((key) => {
		if (key.startsWith("--") === false) return true;
		return registerCustomProperty(key, data.props[key]);
	});
};
/**
* Builds keyframes mapped onto the document scroll range (0 → max).
* Easing and `via` are sampled so the result matches the JS calculation.
* @param {Object} data
* @param {Array} keys - Animated prop keys.
* @param {Number} max - Max scroll distance.
* @returns {Array} keyframes
*/
var buildKeyframes = function(data, keys, max) {
	const from = data.from.value;
	const to = data.to.value;
	const isLinear = keys.every((key) => data.props[key].timing === eases.default["linear"]);
	const hasVia = keys.some((key) => data.props[key].via != null);
	const segments = isLinear ? hasVia ? 2 : 1 : TIMELINE_SAMPLES;
	const positions = [0, max];
	for (let i = 0; i <= segments; i++) positions.push(from + (to - from) * (i / segments));
	return [...new Set(positions.filter((position) => position >= 0 && position <= max))].sort((a, b) => a - b).map((position) => {
		const { props } = computeProps(data, position);
		const keyframe = { offset: position / max };
		for (const key of keys) keyframe[toKeyframeKey(key)] = props[key];
		return keyframe;
	});
};
/**
* Writes inline styles for an instance and records which keys it wrote,
* so they can be removed when a breakpoint turns a prop or the instance off.
* @param {Object} instance
* @param {?Element} elem
* @param {Object} props
*/
var writeStyles = function(instance, elem, props) {
	if (elem == null) return;
	const written = internals.get(instance).written;
	if (written.target !== elem) {
		written.target = elem;
		written.keys.clear();
	}
	for (const key in props) written.keys.add(key);
	setProps(elem, props, getStyleCache(instance));
};
/**
* Removes inline styles an instance wrote.
* Other instances that wrote the same keys to the same element lose their style cache,
* so their next render writes the values again.
* @param {Object} instance
* @param {Array} keys
*/
var removeStyles = function(instance, keys) {
	const written = internals.get(instance).written;
	const target = written.target;
	if (target == null || keys.length === 0) return;
	for (const key of keys) {
		target.style.removeProperty(key);
		written.keys.delete(key);
	}
	const cache = styleCache.get(instance);
	if (cache != null) for (const key of keys) delete cache[key];
	for (const other of instances) {
		if (other === instance) continue;
		const otherWritten = internals.get(other).written;
		if (otherWritten.target !== target || keys.some((key) => otherWritten.keys.has(key)) === false) continue;
		styleCache.delete(other);
		if (other.isActive()) {
			if (other.usesTimeline()) other.syncTimeline();
			else requestUpdate(true);
		}
	}
};
/**
* Gets and sets new props of a list of instances.
* Make sure it's performant as hell.
* @param {Array} list - Instances to render.
* @param {Number} scrollTop - Pixels scrolled in document (clamped).
* @param {Boolean} force - Render even when an instance's progress hasn't changed.
*/
var renderInstances = function(list, scrollTop, force = false) {
	const results = new Array(list.length);
	for (let i = 0; i < list.length; i++) {
		const instance = list[i];
		const data = instance.getData();
		if (force === false && data.hasCallbacks === false) {
			const cache = styleCache.get(instance);
			if (cache != null && cache[LAST_TIME] === getProgress(data, scrollTop).normalizedTime) continue;
		}
		results[i] = getProps(instance, scrollTop);
	}
	for (let i = 0; i < list.length; i++) {
		const result = results[i];
		if (result === void 0) continue;
		writeStyles(list[i], result.elem, result.props);
		getStyleCache(list[i])[LAST_TIME] = result.normalizedTime;
	}
};
/**
* Gets and sets new props of all active Lenis instances.
* Runs synchronously inside Lenis's frame, right after it sets the scroll position.
* @param {Boolean} force - Update even when the scroll position hasn't changed.
*/
var updateLenis = function(force = false) {
	if (settings.lenis == null) return;
	const lenisInstances = getLists().lenis;
	if (lenisInstances.length === 0) return;
	const scrollTop = getLenisScrollTop();
	if (force === false && previousLenisScroll === scrollTop) return;
	previousLenisScroll = scrollTop;
	renderInstances(lenisInstances, scrollTop, force);
};
/**
* Gets and sets new props of all active loop instances.
* Runs inside requestAnimationFrame. Make sure it's performant as hell.
* @param {Boolean} force - Update even when scrollTop hasn't changed.
*/
var update = function(force = false) {
	if (force === true) updateLenis(true);
	const loopInstances = getLists().loop;
	if (loopInstances.length === 0) return;
	const scrollTop = getScrollTop();
	if (force === false && previousScrollTop === scrollTop) return;
	previousScrollTop = scrollTop;
	renderInstances(loopInstances, scrollTop, force);
};
/**
* Schedules an update for the next animation frame.
* Multiple calls within the same frame are batched.
* @param {Boolean} force
*/
var requestUpdate = function(force = false) {
	if (init === false) return;
	pendingForce = pendingForce || force;
	if (frameId != null) return;
	frameId = requestAnimationFrame(() => {
		const shouldForce = pendingForce;
		frameId = null;
		pendingForce = false;
		update(shouldForce);
	});
};
/**
* Schedules a keyframe refresh of timeline instances when the scroll range changes.
*/
var requestTimelineRefresh = function() {
	if (timelineFrameId != null) return;
	timelineFrameId = requestAnimationFrame(() => {
		timelineFrameId = null;
		maxScrollTop = null;
		const max = getMaxScrollTop();
		if (max === lastTimelineMax) return;
		lastTimelineMax = max;
		const scrollTop = getScrollTop();
		for (const instance of instances) if (instance.usesTimeline()) instance.syncTimeline(scrollTop, max);
	});
};
/**
* Default error handler of calculateInstances(): warns and turns the instance off,
* so one bad config (e.g. an override that's only invalid at one breakpoint)
* doesn't stop the others from being applied.
* @param {Object} instance
* @param {Error} error
* @returns {Boolean} Whether to skip applying the instance.
*/
var disableOnError = function(instance, error) {
	console.warn("[buttery]", error.message, instance.getData() != null ? instance.getData().elem : "");
	internals.get(instance).disable();
	return false;
};
/**
* Recalculates instances in three passes, so the layout is only computed once:
* 1. Writes: elements measured by these instances lose the inline styles and native
*    animations applied to them, so their own transforms don't shift the measurements.
* 2. Reads: all measurements.
* 3. Writes: all styles and native animations.
* @param {Array} list
* @param {Function} onError - (instance, error) => skip. Defaults to warning and turning the instance off.
*/
var calculateInstances = function(list, onError = disableOnError) {
	viewportHeight = null;
	maxScrollTop = null;
	const measured = new Set(list.map((instance) => internals.get(instance).raw.elem).filter((elem) => elem != null));
	const all = new Set(list);
	if (measured.size > 0) {
		for (const instance of instances) if (internals.get(instance).resetIfTargets(measured)) all.add(instance);
	}
	const applied = [];
	for (const instance of all) try {
		internals.get(instance).measure();
		applied.push(instance);
	} catch (error) {
		if (onError(instance, error) === false) applied.push(instance);
	}
	invalidateLists();
	const scrollTop = getScrollTop();
	const max = getMaxScrollTop();
	for (const instance of applied) internals.get(instance).apply(scrollTop, max);
};
/**
* Recalculates all tracked instances (e.g. after a layout change).
*/
var recalculateAll = function() {
	calculateInstances(getTrackedInstances(instances));
};
/**
* Recalculates all tracked instances in the next frame. Batches several calls,
* e.g. scan() running for several swapped elements.
*/
var requestRecalculate = function() {
	if (recalculateFrameId != null) return;
	recalculateFrameId = requestAnimationFrame(() => {
		recalculateFrameId = null;
		recalculateAll();
		requestUpdate(true);
	});
};
/**
* Returns the instances that use breakpoints, now or at their last measurement.
* @returns {Array}
*/
var getBreakpointInstances = function() {
	return Array.from(instances).filter((instance) => {
		const internal = internals.get(instance);
		return internal.usedBreakpoints || hasBreakpointKeys(internal.raw);
	});
};
/**
* Re-applies breakpoint overrides in the next frame, after the viewport crossed a breakpoint.
*/
var requestBreakpointRefresh = function() {
	if (breakpointFrameId != null) return;
	breakpointFrameId = requestAnimationFrame(() => {
		breakpointFrameId = null;
		const list = getBreakpointInstances();
		if (list.length === 0) return;
		calculateInstances(list);
		requestUpdate(true);
	});
};
/**
* Handles resize events.
* Height-only changes (iOS Safari toolbar collapsing/expanding) don't trigger
* a recalculation, so animations don't jump while scrolling.
*/
var handleResize = debounce(() => {
	const width = getViewportWidth();
	maxScrollTop = null;
	requestTimelineRefresh();
	if (width === viewportWidth) return;
	viewportWidth = width;
	viewportHeight = null;
	if (settings.recalculateOnResize === true) recalculateAll();
	requestUpdate(true);
}, 150);
/**
* Error handler of calculateInstances() that throws, e.g. for create() and calculate().
* @param {Object} instance
* @param {Error} error
*/
var rethrow = function(instance, error) {
	throw error;
};
/**
* Creates a new instance.
* @param {Object} data
* @param {Boolean} defer - Don't calculate yet (scan() calculates many instances at once).
* @returns {Object} instance
*/
var createInstance = function(data, defer) {
	let _data = null;
	let active = false;
	let timelineMode = false;
	let animatedKeys = [];
	let animation = null;
	let animationTarget = null;
	const _isActive = () => {
		return active;
	};
	const _getData = function() {
		return _data;
	};
	const _usesTimeline = () => {
		return timelineMode;
	};
	const _cancelAnimation = () => {
		if (animation != null) {
			animation.cancel();
			animation = null;
			animationTarget = null;
		}
	};
	const _fallback = () => {
		_cancelAnimation();
		timelineMode = false;
		styleCache.delete(instance);
		invalidateLists();
		if (active) requestUpdate(true);
	};
	const _syncTimeline = (scrollTop, max) => {
		if (timelineMode === false) return;
		const elem = getElem(_data);
		if (elem == null) return;
		if (scrollTop == null) scrollTop = getScrollTop();
		if (max == null) max = getMaxScrollTop();
		const { props } = computeProps(_data, scrollTop);
		const staticKeys = Object.keys(props).filter((key) => animatedKeys.includes(key) === false);
		writeStyles(instance, elem, pickProps(props, staticKeys));
		if (active === false && animation == null) return;
		if (animatedKeys.length === 0 || max <= 0) {
			_cancelAnimation();
			writeStyles(instance, elem, pickProps(props, animatedKeys));
			return;
		}
		const keyframes = buildKeyframes(_data, animatedKeys, max);
		try {
			if (animation != null && animationTarget === elem) animation.effect.setKeyframes(keyframes);
			else {
				_cancelAnimation();
				const effect = new KeyframeEffect(elem, keyframes, {
					fill: "both",
					easing: "linear"
				});
				animation = new Animation(effect, getScrollTimeline());
				animationTarget = elem;
			}
			if (active) {
				if (animation.playState !== "running") animation.play();
			} else animation.pause();
		} catch (error) {
			_fallback();
		}
	};
	const _disable = function() {
		_data = {
			disabled: true,
			elem: data.elem,
			direct: data.direct == null ? false : data.direct,
			track: data.track == null ? true : data.track,
			timeline: data.timeline == null ? "auto" : data.timeline,
			hasCallbacks: false,
			props: {},
			propKeys: []
		};
		animatedKeys = [];
		timelineMode = false;
	};
	const _measure = function() {
		internal.usedBreakpoints = hasBreakpointKeys(data);
		const resolved = internal.usedBreakpoints ? resolveBreakpoints(data) : data;
		styleCache.delete(instance);
		if (resolved === false) {
			_disable();
			return;
		}
		_data = validate(resolved);
		_data.disabled = false;
		animatedKeys = getAnimatedKeys(_data);
		timelineMode = canUseTimeline(_data, animatedKeys);
	};
	const _resetIfTargets = function(elems) {
		const target = internal.written.target || animationTarget;
		if (target == null || elems.has(target) === false) return false;
		_cancelAnimation();
		for (const key of internal.written.keys) target.style.removeProperty(key);
		internal.written.keys.clear();
		styleCache.delete(instance);
		wasReset = true;
		return true;
	};
	const _apply = function(scrollTop, max) {
		const target = getElem(_data);
		const written = internal.written;
		if (written.target != null) {
			const stale = written.target !== target || _data.disabled ? Array.from(written.keys) : Array.from(written.keys).filter((key) => _data.propKeys.includes(key) === false);
			removeStyles(instance, stale);
		}
		if (timelineMode) _syncTimeline(scrollTop, max);
		else {
			_cancelAnimation();
			if ((active || wasReset) && _data.disabled === false) {
				const position = isLenisDriven(instance) ? getLenisScrollTop() : scrollTop;
				const { normalizedTime, props } = computeProps(_data, position);
				writeStyles(instance, target, props);
				getStyleCache(instance)[LAST_TIME] = normalizedTime;
			}
		}
		wasReset = false;
	};
	const _calculate = function() {
		calculateInstances([instance], rethrow);
	};
	const _update = () => {
		if (_data.disabled) return {};
		if (timelineMode) {
			_syncTimeline();
			const { props } = getProps(instance);
			return props;
		}
		const scrollTop = isLenisDriven(instance) ? getLenisScrollTop() : getScrollTop();
		const { elem, normalizedTime, props } = getProps(instance, scrollTop);
		writeStyles(instance, elem, props);
		getStyleCache(instance)[LAST_TIME] = normalizedTime;
		return props;
	};
	const _start = () => {
		active = true;
		invalidateLists();
		if (timelineMode) _syncTimeline();
		else requestUpdate(true);
	};
	const _stop = () => {
		active = false;
		invalidateLists();
		if (animation != null) animation.pause();
	};
	const _destroy = () => {
		_cancelAnimation();
		instances.delete(instance);
		styleCache.delete(instance);
		invalidateLists();
		if (declarativeInstances.delete(instance) && internal.source != null) {
			const list = scannedElements.get(internal.source);
			if (list != null) {
				const remaining = list.filter((other) => other !== instance);
				if (remaining.length > 0) scannedElements.set(internal.source, remaining);
				else scannedElements.delete(internal.source);
			}
		}
	};
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
	};
	const internal = {
		raw: data,
		measure: _measure,
		apply: _apply,
		disable: _disable,
		resetIfTargets: _resetIfTargets,
		activate: () => {
			active = true;
		},
		written: {
			target: null,
			keys: /* @__PURE__ */ new Set()
		},
		usedBreakpoints: false,
		source: null
	};
	let wasReset = false;
	internals.set(instance, internal);
	instances.add(instance);
	invalidateLists();
	if (defer === false) try {
		instance.calculate();
	} catch (error) {
		instance.destroy();
		throw error;
	}
	return instance;
};
/**
* Creates a new instance.
* @param {Object} data
* @returns {Object} instance
*/
var create = function(data) {
	return createInstance(data, false);
};
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
var mount = function(options = {}) {
	if (init) return;
	if (options.breakpoints != null) {
		if (isPlainObject(options.breakpoints) === false) throw new Error("Option `breakpoints` must be an object");
		for (const name in options.breakpoints) if (RESERVED_KEYS.includes(name) || name.startsWith("max-")) throw new Error(`Breakpoint name \`${name}\` is reserved`);
	}
	init = true;
	settings = Object.assign({}, settings, { lenis: null }, options);
	breakpointList = null;
	mediaQueries.clear();
	viewportWidth = getViewportWidth();
	viewportHeight = null;
	maxScrollTop = null;
	previousScrollTop = null;
	previousLenisScroll = null;
	lastTimelineMax = null;
	const onScroll = () => {
		if (getLists().loop.length > 0) requestUpdate(false);
	};
	const onPageShow = () => {
		maxScrollTop = null;
		lastTimelineMax = null;
		requestTimelineRefresh();
		requestUpdate(true);
	};
	listeners = {
		onScroll,
		onPageShow,
		offLenis: null,
		offBreakpoints: []
	};
	const onBreakpointChange = () => requestBreakpointRefresh();
	for (const breakpoint of getBreakpoints()) {
		const mql = getMediaQuery(breakpoint);
		if (mql == null) continue;
		if (typeof mql.addEventListener === "function") {
			mql.addEventListener("change", onBreakpointChange);
			listeners.offBreakpoints.push(() => mql.removeEventListener("change", onBreakpointChange));
		} else {
			mql.addListener(onBreakpointChange);
			listeners.offBreakpoints.push(() => mql.removeListener(onBreakpointChange));
		}
	}
	invalidateLists();
	calculateInstances(Array.from(instances).filter((instance) => {
		const data = instance.getData();
		return data != null && data.timeline === "lenis" || internals.get(instance).usedBreakpoints || hasBreakpointKeys(internals.get(instance).raw);
	}));
	const lenis = settings.lenis;
	if (lenis != null) {
		if (typeof lenis.on !== "function") throw new Error("Option `lenis` must be a Lenis instance");
		const onLenisScroll = () => updateLenis(false);
		const off = lenis.on("scroll", onLenisScroll);
		listeners.offLenis = typeof off === "function" ? off : () => lenis.off("scroll", onLenisScroll);
	}
	window.addEventListener("scroll", onScroll, { passive: true });
	window.addEventListener("resize", handleResize, { passive: true });
	window.addEventListener("orientationchange", handleResize, { passive: true });
	window.addEventListener("pageshow", onPageShow);
	if (typeof ResizeObserver !== "undefined") {
		resizeObserver = new ResizeObserver(() => {
			maxScrollTop = null;
			requestTimelineRefresh();
		});
		resizeObserver.observe(document.documentElement);
	}
	requestUpdate(true);
};
/**
* Stops listening and cleans up instances that are no longer in the DOM.
*/
var unmount = function() {
	if (init === false) return;
	let instancesInDom = false;
	for (const instance of Array.from(instances)) {
		const data = instance.getData();
		const elem = internals.get(instance).source || (data != null ? data.elem : null);
		if (elem == null || document.body.contains(elem) === false) instance.destroy();
		else instancesInDom = true;
	}
	if (instancesInDom === false) instances.clear();
	if (listeners != null) {
		window.removeEventListener("scroll", listeners.onScroll);
		window.removeEventListener("resize", handleResize);
		window.removeEventListener("orientationchange", handleResize);
		window.removeEventListener("pageshow", listeners.onPageShow);
		if (listeners.offLenis != null) listeners.offLenis();
		for (const off of listeners.offBreakpoints) off();
		listeners = null;
	}
	handleResize.cancel();
	if (resizeObserver != null) {
		resizeObserver.disconnect();
		resizeObserver = null;
	}
	if (frameId != null) {
		cancelAnimationFrame(frameId);
		frameId = null;
	}
	if (timelineFrameId != null) {
		cancelAnimationFrame(timelineFrameId);
		timelineFrameId = null;
	}
	if (breakpointFrameId != null) {
		cancelAnimationFrame(breakpointFrameId);
		breakpointFrameId = null;
	}
	if (recalculateFrameId != null) {
		cancelAnimationFrame(recalculateFrameId);
		recalculateFrameId = null;
	}
	pendingForce = false;
	previousScrollTop = null;
	previousLenisScroll = null;
	lastTimelineMax = null;
	settings = Object.assign({}, settings, { lenis: null });
	init = false;
	invalidateLists();
};
/**
* Destroys declarative instances whose element is no longer in the document.
*/
var pruneDeclarative = function() {
	for (const instance of Array.from(declarativeInstances)) if (internals.get(instance).source.isConnected === false) instance.destroy();
};
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
var scan = function(root = document, options = {}) {
	if (typeof document === "undefined" || root == null) return [];
	pruneDeclarative();
	if (options.reducedMotion !== true && typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return [];
	const selector = `[${PREFIX}]`;
	const elements = [];
	if (root.nodeType === 1 && root.matches(selector)) elements.push(root);
	elements.push(...root.querySelectorAll(selector));
	const breakpointNames = getBreakpoints().map((breakpoint) => breakpoint.name);
	const created = [];
	for (const el of elements) {
		if (scannedElements.has(el) || failedElements.has(el)) continue;
		const elInstances = [];
		try {
			for (const config of parseElement(el, breakpointNames)) {
				const instance = createInstance(Object.assign({}, options.defaults, config), true);
				internals.get(instance).source = el;
				declarativeInstances.add(instance);
				elInstances.push(instance);
			}
		} catch (error) {
			console.warn("[buttery]", error.message, el);
			elInstances.forEach((instance) => instance.destroy());
			failedElements.add(el);
			continue;
		}
		scannedElements.set(el, elInstances);
		created.push(...elInstances);
	}
	if (instances.size > 0) requestRecalculate();
	if (created.length === 0) return created;
	for (const instance of created) internals.get(instance).activate();
	const failed = /* @__PURE__ */ new Set();
	calculateInstances(created, (instance, error) => {
		console.warn("[buttery]", error.message, internals.get(instance).source);
		failed.add(internals.get(instance).source);
		return true;
	});
	for (const instance of created.slice()) {
		const source = internals.get(instance).source;
		if (failed.has(source)) {
			instance.destroy();
			failedElements.add(source);
			created.splice(created.indexOf(instance), 1);
		}
	}
	requestUpdate(true);
	return created;
};
/**
* Destroys the instances scan() created for an element and its descendants,
* e.g. before the element is removed.
* @param {?Element|Document} root
*/
var release = function(root = document) {
	if (root == null) return;
	if (failedElements.has(root)) failedElements.delete(root);
	if (typeof root.querySelectorAll === "function") for (const el of root.querySelectorAll(`[${PREFIX}]`)) failedElements.delete(el);
	for (const instance of Array.from(declarativeInstances)) {
		const source = internals.get(instance).source;
		if (root === source || root.contains(source)) instance.destroy();
	}
};
exports.create = create;
exports.mount = mount;
exports.release = release;
exports.scan = scan;
exports.supportsTimeline = supportsTimeline;
exports.unmount = unmount;

//# sourceMappingURL=buttery.cjs.map