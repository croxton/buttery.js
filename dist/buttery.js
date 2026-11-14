import parseUnit from "parse-unit";
import eases from "eases";
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
*/
var instances = [];
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
	nativeOnTouch: true
};
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
		if (instance == null || instance.isActive() === false || instance.usesTimeline()) continue;
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
* Returns all tracked instances from an array.
* @param {Array} instances
* @returns {Array} instances - Tracked instances.
*/
var getTrackedInstances = function(instances) {
	return instances.filter((instance) => instance != null && instance.getData().track);
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
	return isNaN(parseUnit(value)[0]) === false;
};
/**
* Parses an absolute value.
* @param {String|Integer} value
* @returns {Object} value - Parsed value.
*/
var parseAbsoluteValue = function(value) {
	const parsedValue = parseUnit(value);
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
	if (direct instanceof HTMLElement) return properties.direct;
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
	if (typeof data.direct !== "boolean" && !(data.direct instanceof HTMLElement)) throw new Error("Property `direct` must be undefined, a boolean or a DOM element/node");
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
		if (prop.timing == null) prop.timing = eases["linear"];
		if (typeof prop.timing !== "string" && typeof prop.timing !== "function") throw new Error("Property `timing` of prop must be undefined, a string or a function");
		if (typeof prop.timing === "string" && eases[prop.timing] == null) throw new Error("Unknown timing for property `timing` of prop");
		if (typeof prop.timing === "string") prop.timing = eases[prop.timing];
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
	const isLinear = keys.every((key) => data.props[key].timing === eases["linear"]);
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
		const cache = getStyleCache(list[i]);
		setProps(result.elem, result.props, cache);
		cache[LAST_TIME] = result.normalizedTime;
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
		for (const instance of instances) if (instance != null && instance.usesTimeline()) instance.syncTimeline(scrollTop, max);
	});
};
/**
* Recalculates instances in two passes: all measurements first, then all style
* writes, so the layout is only computed once instead of once per instance.
* @param {Array} list
*/
var calculateInstances = function(list) {
	viewportHeight = null;
	maxScrollTop = null;
	for (const instance of list) internals.get(instance).measure();
	invalidateLists();
	let scrollTop;
	let max;
	if (list.some((instance) => instance.usesTimeline())) {
		scrollTop = getScrollTop();
		max = getMaxScrollTop();
	}
	for (const instance of list) internals.get(instance).apply(scrollTop, max);
};
/**
* Recalculates all tracked instances (e.g. after a layout change).
*/
var recalculateAll = function() {
	calculateInstances(getTrackedInstances(instances));
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
* Creates a new instance.
* @param {Object} data
* @returns {Object} instance
*/
var create = function(data) {
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
		const cache = getStyleCache(instance);
		const { props } = computeProps(_data, scrollTop);
		setProps(elem, pickProps(props, Object.keys(props).filter((key) => animatedKeys.includes(key) === false)), cache);
		if (active === false && animation == null) return;
		if (animatedKeys.length === 0 || max <= 0) {
			_cancelAnimation();
			setProps(elem, pickProps(props, animatedKeys), cache);
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
	const _measure = function() {
		_data = validate(data);
		styleCache.delete(instance);
		animatedKeys = getAnimatedKeys(_data);
		timelineMode = canUseTimeline(_data, animatedKeys);
	};
	const _apply = function(scrollTop, max) {
		if (timelineMode) _syncTimeline(scrollTop, max);
		else _cancelAnimation();
	};
	const _calculate = function() {
		calculateInstances([instance]);
	};
	const _update = () => {
		if (timelineMode) {
			_syncTimeline();
			const { props } = getProps(instance);
			return props;
		}
		const scrollTop = isLenisDriven(instance) ? getLenisScrollTop() : getScrollTop();
		const { elem, normalizedTime, props } = getProps(instance, scrollTop);
		const cache = getStyleCache(instance);
		setProps(elem, props, cache);
		cache[LAST_TIME] = normalizedTime;
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
		instances[index] = void 0;
		styleCache.delete(instance);
		invalidateLists();
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
	internals.set(instance, {
		measure: _measure,
		apply: _apply
	});
	const index = instances.push(instance) - 1;
	invalidateLists();
	instance.calculate();
	return instance;
};
/**
* Starts listening for scroll changes.
* @param {?Object} options
* @param {?Boolean} options.recalculateOnResize - Recalculate tracked instances when the viewport width changes.
* @param {?Boolean} options.timeline - Allow native scroll-driven animations (default true).
* @param {?Object} options.lenis - A Lenis instance that drives instances with `timeline: 'lenis'`.
* @param {?Boolean} options.nativeOnTouch - Use native timelines for 'lenis' instances on touch devices
*   when Lenis doesn't smooth touch scrolling (default true).
*/
var mount = function(options = {}) {
	if (init) return;
	init = true;
	settings = Object.assign({}, settings, { lenis: null }, options);
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
		offLenis: null
	};
	invalidateLists();
	calculateInstances(instances.filter((instance) => instance != null && instance.getData().timeline === "lenis"));
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
	for (const instance of instances) {
		if (instance == null) continue;
		const elem = instance.getData().elem;
		if (elem == null || document.body.contains(elem) === false) instance.destroy();
		else instancesInDom = true;
	}
	if (instancesInDom === false) instances = [];
	if (listeners != null) {
		window.removeEventListener("scroll", listeners.onScroll);
		window.removeEventListener("resize", handleResize);
		window.removeEventListener("orientationchange", handleResize);
		window.removeEventListener("pageshow", listeners.onPageShow);
		if (listeners.offLenis != null) listeners.offLenis();
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
	pendingForce = false;
	previousScrollTop = null;
	previousLenisScroll = null;
	lastTimelineMax = null;
	settings = Object.assign({}, settings, { lenis: null });
	init = false;
	invalidateLists();
};
export { create, mount, supportsTimeline, unmount };

//# sourceMappingURL=buttery.js.map