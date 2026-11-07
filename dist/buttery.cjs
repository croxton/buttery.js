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
	timeline: true
};
var TIMELINE_SAMPLES = 30;
var styleCache = /* @__PURE__ */ new WeakMap();
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
* Returns all active instances that are driven by the JS loop.
* @param {Array} instances
* @returns {Array} instances
*/
var getLoopInstances = function(instances) {
	return instances.filter((instance) => instance != null && instance.isActive() && instance.usesTimeline() === false);
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
	if (data.timeline !== "auto" && typeof data.timeline !== "boolean") throw new Error("Property `timeline` must be undefined, a boolean or 'auto'");
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
		if (isAbsoluteValue(prop.from) === false) throw new Error("Property `from` of prop must be a absolute value");
		if (isAbsoluteValue(prop.to) === false) throw new Error("Property `to` of prop must be a absolute value");
		if (prop.via != null && isAbsoluteValue(prop.via) === false) throw new Error("Property `via` of prop must be a absolute value");
		prop.from = parseAbsoluteValue(prop.from);
		prop.to = parseAbsoluteValue(prop.to);
		if (prop.via != null) prop.via = parseAbsoluteValue(prop.via);
		if (prop.timing == null) prop.timing = eases.default["linear"];
		if (typeof prop.timing !== "string" && typeof prop.timing !== "function") throw new Error("Property `timing` of prop must be undefined, a string or a function");
		if (typeof prop.timing === "string" && eases.default[prop.timing] == null) throw new Error("Unknown timing for property `timing` of prop");
		if (typeof prop.timing === "string") prop.timing = eases.default[prop.timing];
		acc[key] = prop;
		return acc;
	}, {});
	return data;
};
/**
* Calculates prop values for a given scroll position. Pure: no callbacks, no DOM writes.
* @param {Object} data - Validated data.
* @param {Number} scrollTop - Pixels scrolled in document (clamped).
* @returns {Object} precisePercentage and props
*/
var computeProps = function(data, scrollTop) {
	const total = data.to.value - data.from.value;
	const current = scrollTop - data.from.value;
	const precisePercentage = total === 0 ? current >= 0 ? 100 : 0 : current / (total / 100);
	const normalizedTime = Math.min(Math.max(precisePercentage, 0), 100) / 100;
	const props = {};
	for (const key of Object.keys(data.props)) {
		const prop = data.props[key];
		const unit = prop.from.unit || prop.to.unit;
		const time = prop.timing(normalizedTime);
		let value;
		if (prop.via != null) {
			const midpoint = .5;
			if (time <= midpoint) {
				const localTime = time / midpoint;
				const diff = prop.from.value - prop.via.value;
				value = prop.from.value - diff * localTime;
			} else {
				const localTime = (time - midpoint) / midpoint;
				const diff = prop.via.value - prop.to.value;
				value = prop.via.value - diff * localTime;
			}
		} else {
			const diff = prop.from.value - prop.to.value;
			value = prop.from.value - diff * time;
		}
		props[key] = Math.round(value * 1e4) / 1e4 + unit;
	}
	return {
		precisePercentage,
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
	const { precisePercentage, props } = computeProps(data, scrollTop);
	if ((precisePercentage >= 0 && precisePercentage <= 100) === true) data.inside(instance, precisePercentage, props);
	else data.outside(instance, precisePercentage, props);
	return {
		elem: getElem(data),
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
		return (prop.from.value === prop.to.value && (prop.via == null || prop.via.value === prop.from.value)) === false;
	});
};
/**
* Returns the CSS syntax and initial value to register a custom property with.
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
* Registers a custom property so it can be interpolated by the animation engine.
* @param {String} name
* @param {String} unit
* @returns {Boolean} Whether the property can be animated smoothly.
*/
var registerCustomProperty = function(name, unit) {
	const { syntax, initialValue } = getSyntaxForUnit(unit);
	if (registeredProperties.has(name)) {
		const existing = registeredProperties.get(name);
		return existing === null || existing === syntax;
	}
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
* Checks if an instance can use a native scroll timeline.
* @param {Object} data
* @param {Array} animatedKeys
* @returns {Boolean}
*/
var canUseTimeline = function(data, animatedKeys) {
	if (settings.timeline === false) return false;
	if (data.timeline === false) return false;
	if (data.timeline === "auto" && data.hasCallbacks === true) return false;
	if (supportsTimeline() === false) return false;
	return animatedKeys.every((key) => {
		if (key.startsWith("--") === false) return true;
		const prop = data.props[key];
		return registerCustomProperty(key, prop.from.unit || prop.to.unit);
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
* Gets and sets new props of all active loop instances.
* Runs inside requestAnimationFrame. Make sure it's performant as hell.
* @param {Boolean} force - Update even when scrollTop hasn't changed.
*/
var update = function(force = false) {
	const loopInstances = getLoopInstances(instances);
	if (loopInstances.length === 0) return;
	const scrollTop = getScrollTop();
	if (force === false && previousScrollTop === scrollTop) return;
	previousScrollTop = scrollTop;
	const results = loopInstances.map((instance) => ({
		instance,
		...getProps(instance, scrollTop)
	}));
	for (const { instance, elem, props } of results) setProps(elem, props, getStyleCache(instance));
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
		for (const instance of instances) if (instance != null && instance.usesTimeline()) instance.syncTimeline();
	});
};
/**
* Recalculates all tracked instances (e.g. after a layout change).
*/
var recalculateAll = function() {
	getTrackedInstances(instances).forEach((instance) => instance.calculate());
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
		if (active) requestUpdate(true);
	};
	const _syncTimeline = () => {
		if (timelineMode === false) return;
		const elem = getElem(_data);
		if (elem == null) return;
		const cache = getStyleCache(instance);
		const { props } = computeProps(_data, getScrollTop());
		setProps(elem, pickProps(props, Object.keys(props).filter((key) => animatedKeys.includes(key) === false)), cache);
		if (active === false && animation == null) return;
		const max = getMaxScrollTop();
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
	const _calculate = function() {
		viewportHeight = null;
		maxScrollTop = null;
		_data = validate(data);
		styleCache.delete(instance);
		animatedKeys = getAnimatedKeys(_data);
		timelineMode = canUseTimeline(_data, animatedKeys);
		if (timelineMode) _syncTimeline();
		else _cancelAnimation();
	};
	const _update = () => {
		if (timelineMode) {
			_syncTimeline();
			const { props } = getProps(instance);
			return props;
		}
		const { elem, props } = getProps(instance);
		setProps(elem, props, getStyleCache(instance));
		return props;
	};
	const _start = () => {
		active = true;
		if (timelineMode) _syncTimeline();
		else requestUpdate(true);
	};
	const _stop = () => {
		active = false;
		if (animation != null) animation.pause();
	};
	const _destroy = () => {
		_cancelAnimation();
		instances[index] = void 0;
		styleCache.delete(instance);
	};
	const instance = {
		isActive: _isActive,
		getData: _getData,
		usesTimeline: _usesTimeline,
		syncTimeline: _syncTimeline,
		calculate: _calculate,
		update: _update,
		start: _start,
		stop: _stop,
		destroy: _destroy
	};
	const index = instances.push(instance) - 1;
	instance.calculate();
	return instance;
};
/**
* Starts listening for scroll changes.
* @param {?Object} options
* @param {?Boolean} options.recalculateOnResize - Recalculate tracked instances when the viewport width changes.
* @param {?Boolean} options.timeline - Allow native scroll-driven animations (default true).
*/
var mount = function(options = {}) {
	if (init) return;
	init = true;
	settings = Object.assign({}, settings, options);
	viewportWidth = getViewportWidth();
	viewportHeight = null;
	maxScrollTop = null;
	previousScrollTop = null;
	lastTimelineMax = null;
	const onScroll = () => requestUpdate(false);
	const onPageShow = () => {
		maxScrollTop = null;
		lastTimelineMax = null;
		requestTimelineRefresh();
		requestUpdate(true);
	};
	listeners = {
		onScroll,
		onPageShow
	};
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
	lastTimelineMax = null;
	init = false;
};
exports.create = create;
exports.mount = mount;
exports.supportsTimeline = supportsTimeline;
exports.unmount = unmount;

//# sourceMappingURL=buttery.cjs.map