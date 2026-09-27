// Scripts Klyra runs inside the demo page. They stay plain ES2017 strings because
// they execute in the visited site, not in Klyra's bundle.

export const STEP_MESSAGE_PREFIX = "__KLYRA_DEMO_STEP__";

/**
 * Builds a CSS selector that survives a reload: an id, a test id, a name or
 * aria-label when the page offers one, otherwise a short nth-of-type path.
 */
const SELECTOR_BUILDER = `
function klyraCssEscape(value) {
	return window.CSS && CSS.escape ? CSS.escape(value) : String(value).replace(/[^a-zA-Z0-9_-]/g, "\\\\$&");
}
function klyraIsUnique(selector) {
	try { return document.querySelectorAll(selector).length === 1; } catch (e) { return false; }
}
function klyraSelectorFor(element) {
	if (!(element instanceof Element)) return null;
	if (element.id && !/\\d{4,}/.test(element.id)) {
		var byId = "#" + klyraCssEscape(element.id);
		if (klyraIsUnique(byId)) return byId;
	}
	var tag = element.tagName.toLowerCase();
	var attrs = ["data-testid", "data-test", "data-cy", "name", "aria-label", "placeholder"];
	for (var i = 0; i < attrs.length; i++) {
		var value = element.getAttribute(attrs[i]);
		if (value && value.length < 80) {
			var byAttr = tag + "[" + attrs[i] + "=\\"" + value.replace(/"/g, '\\\\"') + "\\"]";
			if (klyraIsUnique(byAttr)) return byAttr;
		}
	}
	var parts = [];
	var node = element;
	while (node && node.nodeType === 1 && node !== document.documentElement) {
		var part = node.tagName.toLowerCase();
		if (node.id && !/\\d{4,}/.test(node.id)) {
			parts.unshift("#" + klyraCssEscape(node.id));
			break;
		}
		var parent = node.parentElement;
		if (parent) {
			var sameTag = Array.prototype.filter.call(parent.children, function (child) {
				return child.tagName === node.tagName;
			});
			if (sameTag.length > 1) part += ":nth-of-type(" + (sameTag.indexOf(node) + 1) + ")";
		}
		parts.unshift(part);
		var candidate = parts.join(" > ");
		if (klyraIsUnique(candidate)) return candidate;
		node = parent;
	}
	return parts.join(" > ");
}
function klyraLabelFor(element) {
	var isField = element.tagName === "INPUT" || element.tagName === "TEXTAREA" || element.tagName === "SELECT";
	var text = element.getAttribute("aria-label") || element.getAttribute("placeholder") ||
		(isField ? element.getAttribute("name") || "" : element.innerText || element.value || "");
	return String(text).trim().replace(/\\s+/g, " ").slice(0, 60);
}
`;

/** Captures what the person does in the page and reports each step on the console. */
export const RECORDER_SCRIPT = `(function () {
	if (window.__klyraDemoRecorder) return;
	window.__klyraDemoRecorder = true;
	${SELECTOR_BUILDER}
	function emit(step) {
		console.debug(${JSON.stringify(STEP_MESSAGE_PREFIX)} + JSON.stringify(step));
	}
	function isTextField(el) {
		if (!el || !el.tagName) return false;
		if (el.isContentEditable) return true;
		if (el.tagName === "TEXTAREA") return true;
		if (el.tagName !== "INPUT") return false;
		var type = (el.getAttribute("type") || "text").toLowerCase();
		return ["text", "email", "search", "url", "tel", "number", "password"].indexOf(type) !== -1;
	}
	function clickable(el) {
		var node = el;
		while (node && node !== document.body) {
			var tag = node.tagName;
			if (tag === "A" || tag === "BUTTON" || tag === "SELECT" || tag === "LABEL" || tag === "SUMMARY" ||
				tag === "INPUT" || tag === "TEXTAREA" || node.getAttribute("role") === "button" ||
				node.getAttribute("onclick") !== null || node.isContentEditable) {
				return node;
			}
			node = node.parentElement;
		}
		return el;
	}
	document.addEventListener("click", function (event) {
		// Keyboard activation (Enter submitting a form) fires a click with detail 0;
		// the key press is already a step, so replaying both would act twice.
		if (!event.isTrusted || event.detail === 0) return;
		var target = clickable(event.target);
		var selector = klyraSelectorFor(target);
		if (selector) emit({ type: "click", selector: selector, label: klyraLabelFor(target) });
	}, true);
	function recordField(event) {
		var el = event.target;
		if (!event.isTrusted || !isTextField(el)) return;
		var selector = klyraSelectorFor(el);
		if (!selector) return;
		var secret = el.tagName === "INPUT" && (el.getAttribute("type") || "").toLowerCase() === "password";
		var text = secret ? "" : (el.isContentEditable ? el.innerText : el.value);
		emit({ type: "type", selector: selector, text: text || "", label: klyraLabelFor(el) });
	}
	document.addEventListener("input", recordField, true);
	document.addEventListener("keydown", function (event) {
		if (!event.isTrusted) return;
		if (event.key === "Enter" || event.key === "Tab" || event.key === "Escape") {
			emit({ type: "press", key: event.key });
		}
	}, true);
	var scrollTimer = null;
	window.addEventListener("scroll", function () {
		if (scrollTimer) clearTimeout(scrollTimer);
		scrollTimer = setTimeout(function () {
			emit({ type: "scroll", y: Math.round(window.scrollY) });
		}, 350);
	}, { passive: true, capture: true });
})();`;

/**
 * Brings the element into view and returns its centre in viewport pixels,
 * or null when the page has no such element.
 */
export function locateElementScript(selector: string, scroll: boolean): string {
	return `(function () {
		var el = document.querySelector(${JSON.stringify(selector)});
		if (!el) return null;
		${scroll ? 'el.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });' : ""}
		var rect = el.getBoundingClientRect();
		return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, width: rect.width, height: rect.height };
	})()`;
}

/** Empties a field so replayed typing replaces what is there instead of appending. */
export function clearFieldScript(selector: string): string {
	return `(function () {
		var el = document.querySelector(${JSON.stringify(selector)});
		if (!el) return false;
		el.focus();
		if (el.isContentEditable) {
			document.execCommand("selectAll", false);
			document.execCommand("delete", false);
		} else if ("value" in el) {
			el.value = "";
			el.dispatchEvent(new Event("input", { bubbles: true }));
		}
		return true;
	})()`;
}

export function scrollToScript(y: number): string {
	return `window.scrollTo({ top: ${Math.max(0, Math.round(y))}, behavior: "smooth" })`;
}
