// Settings: `enabled` is the master switch; `auto` makes it follow the system's
// light/dark preference; `amoled` picks the true-black palette.
const DEFAULTS = { enabled: true, auto: false, amoled: false };

// chrome.storage answers asynchronously, after the page has started to paint. To
// avoid a flash of the wrong theme, start from a copy of the last settings kept in
// the site's localStorage (read synchronously), then correct it if storage differs.
const CACHE_KEY = "lsu-moodle-dark-cache";
const state = { ...DEFAULTS };
try { Object.assign(state, JSON.parse(localStorage.getItem(CACHE_KEY))); } catch {}
function saveCache() {
  try { localStorage.setItem(CACHE_KEY, JSON.stringify(state)); } catch {}
}

const systemDark = matchMedia("(prefers-color-scheme: dark)");
const isDark = () => state.enabled && (!state.auto || systemDark.matches);

// The <html> element is looked up each time rather than kept: in TinyMCE's editor
// iframe (Moodle 4.1+), the page rewrites the document with document.open/write after
// we start, which replaces <html>. `state` is what gets re-applied to the new one.
const html = () => document.documentElement;
function syncRootClasses() {
  const root = html();
  if (!root) return;
  root.classList.toggle("lsu-dark", isDark());
  root.classList.toggle("lsu-amoled", state.amoled);
}
syncRootClasses();

// dark.css handles the known parts of the page. This script is the safety net for
// everything else. It reads each element's *computed* colors and:
//   1. darkens any background that is still light, then
//   2. lightens any text that fails WCAG AA contrast (4.5:1) against the background
//      it actually sits on — keeping its hue, so purple stays purple.
//
// Snap has rules like `.summary div[style] { border: inherit; padding: inherit }`, so
// we never add a style attribute to an element that lacks one. Those elements get
// data attributes instead, matched by high-specificity rules that also beat the
// theme's own `!important` utility classes. Elements that already have inline styles
// (possibly `!important`) get inline overrides; originals are saved for the toggle.

// Replacement colors are CSS variables from dark.css, so switching between the dark
// and AMOLED palettes restyles everything we touched without rescanning.
const SURFACE = "var(--dm-surface)";
const OVERLAY = "var(--dm-overlay)";
const BORDER = "var(--dm-border)";
// Contrast math assumes the lighter (dark, not AMOLED) page: if text passes there,
// it passes on true black too.
const PAGE_BG = { r: 21, g: 19, b: 27, a: 1 };
const MIN_CONTRAST = 4.5;
const HI = ":not(#dm_):not(#dm_):not(#dm_)"; // specificity boost: 3 IDs
const SKIP = new Set(["SCRIPT", "STYLE", "LINK", "META", "IMG", "PICTURE", "VIDEO",
  "CANVAS", "IFRAME", "svg", "path", "BR", "HR", "NOSCRIPT", "OBJECT", "EMBED", "HEAD", "TITLE"]);

function parse(color) {
  const m = color && color.match(/rgba?\(([\d.]+),?\s*([\d.]+),?\s*([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?/);
  if (!m) return null;
  const a = m[4] === undefined ? 1 : parseFloat(m[4]) / (m[4].endsWith("%") ? 100 : 1);
  return { r: +m[1], g: +m[2], b: +m[3], a };
}

function luminance({ r, g, b }) {
  const f = (v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

const TEXT = { r: 231, g: 228, b: 238 };
const MUTED = { r: 168, g: 162, b: 184 };
const TARGET_CONTRAST = 7; // aim for AAA when we have to touch a color at all

// Pick a replacement for text that fails contrast on a dark background.
// Greys map onto the theme's own text colors (keeping primary vs. secondary
// hierarchy); colored text is mixed toward white, keeping its hue.
function fixText(c, bg) {
  const spread = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
  if (spread < 40) {
    const secondary = luminance(c) > 0.1; // mid-grey = secondary text in light mode
    const pick = secondary ? MUTED : TEXT;
    return contrast(pick, bg) >= MIN_CONTRAST ? pick : TEXT;
  }
  for (let t = 0.1; t <= 1.001; t += 0.1) {
    const q = (v) => Math.min(255, Math.round((v + (255 - v) * t) / 4) * 4);
    const out = { r: q(c.r), g: q(c.g), b: q(c.b) };
    if (contrast(out, bg) >= TARGET_CONTRAST) return out;
  }
  return TEXT;
}

// ---------- Generated rules for elements without a style attribute ----------
const sheet = document.createElement("style");
const colorIds = new Map();
const colorKeys = []; // id -> key, the reverse of colorIds
const rgbKey = ({ r, g, b }) => `rgb(${r}, ${g}, ${b})`;
function colorId(c) {
  const key = rgbKey(c);
  if (!colorIds.has(key)) {
    colorIds.set(key, colorKeys.length);
    colorKeys.push(key);
    sheet.textContent += `html.lsu-dark [data-dm-c="${colorIds.get(key)}"]${HI} { color: ${key} !important; }\n`;
  }
  return colorIds.get(key);
}
function ensureSheet() {
  if (!sheet.isConnected) (document.head || html()).appendChild(sheet);
}
const SIDES = { t: "top", r: "right", b: "bottom", l: "left" };
sheet.textContent =
  `html.lsu-dark [data-dm-bg="solid"]${HI} { background-color: ${SURFACE} !important; background-image: none !important; }\n` +
  `html.lsu-dark [data-dm-bg="overlay"]${HI} { background-color: ${OVERLAY} !important; }\n` +
  `html.lsu-dark [data-dm-bg="clear"]${HI} { background-color: transparent !important; background-image: none !important; }\n` +
  Object.entries(SIDES).map(([k, side]) =>
    `html.lsu-dark [data-dm-bd~="${k}"]${HI} { border-${side}-color: ${BORDER} !important; }\n`).join("") +
  // Used by full-page scans (see scan): cancels running transitions so computed
  // colors are final values, not mid-fade ones.
  `html.lsu-dm-freeze *, html.lsu-dm-freeze *::before, html.lsu-dm-freeze *::after { transition: none !important; }\n`;

function setInline(el, prop, value) {
  const saved = el.dataset.dmInline ? JSON.parse(el.dataset.dmInline) : {};
  if (!(prop in saved)) saved[prop] = [el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)];
  el.dataset.dmInline = JSON.stringify(saved);
  el.style.setProperty(prop, value, "important");
}

// Undo setInline for one property, restoring whatever inline value was there before.
function unsetInline(el, prop) {
  if (!el.dataset.dmInline) return;
  const saved = JSON.parse(el.dataset.dmInline);
  if (!(prop in saved)) return;
  const [v, p] = saved[prop];
  if (v) el.style.setProperty(prop, v, p);
  else el.style.removeProperty(prop);
  delete saved[prop];
  if (Object.keys(saved).length) el.dataset.dmInline = JSON.stringify(saved);
  else delete el.dataset.dmInline;
}

// ---------- Pass 1: backgrounds ----------
function planBg(el) {
  if (el === document.body) return null; // page base is dark.css's job
  const cs = getComputedStyle(el);
  const bg = parse(cs.backgroundColor);
  const img = cs.backgroundImage;
  // Light greys/whites/pastels only — leave saturated brand colors (LSU gold chips) alone
  const light = (c) => {
    if (!c || c.a < 0.3) return false;
    const spread = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
    return luminance(c) > 0.5 && (spread < 60 || luminance(c) > 0.85);
  };
  if (img === "none" && light(bg)) return bg.a < 0.95 ? "overlay" : "solid";
  if (img.startsWith("linear-gradient") && !img.includes("url(")) {
    if (light(parse(img.match(/rgba?\([^)]+\)/)?.[0]))) return "solid";
  }
  return null;
}

// Light-mode background behind `el`: the nearest ancestor with a solid color, read
// while dark mode is switched off (see resolveClear). Ancestors we already overrode
// inline report their saved original. If that original was empty, the light color
// came from a stylesheet, so lift our override for a moment to read it.
function lightBgBehind(el) {
  const root = html();
  for (let e = el.parentElement; e && e !== root; e = e.parentElement) {
    const saved = e.dataset.dmInline && JSON.parse(e.dataset.dmInline)["background-color"];
    let c;
    if (saved && saved[0]) {
      c = parse(saved[0]);
    } else {
      const ours = saved ? [e.style.getPropertyValue("background-color"), e.style.getPropertyPriority("background-color")] : null;
      if (ours) e.style.removeProperty("background-color");
      const cs = getComputedStyle(e);
      const photo = cs.backgroundImage.includes("url(");
      c = parse(cs.backgroundColor);
      if (ours) e.style.setProperty("background-color", ...ours);
      if (photo && !saved) return null;
    }
    if (c && c.a >= 0.5) return c;
  }
  return { r: 255, g: 255, b: 255, a: 1 };
}

// Blocks pasted from editors often carry an inline `background-color: rgba(255,255,255,.9)`
// that matches the card they sit on. In light mode that's invisible; darkening each one
// separately would draw a dark bar per heading/paragraph. So for each light background,
// compare it with what was behind it *in light mode*: if they match, go transparent.
function resolveClear(els, bgPlans) {
  const idx = bgPlans.map((p, i) => (p ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return;
  const root = html();
  const wasFrozen = root.classList.contains("lsu-dm-freeze");
  root.classList.add("lsu-dm-freeze"); // no transitions, so reads are immediate
  root.classList.remove("lsu-dark");   // no paint happens before we switch it back
  try {
    for (const i of idx) {
      const el = els[i];
      const own = parse(getComputedStyle(el).backgroundColor);
      const behind = lightBgBehind(el);
      if (!own || !behind) continue;
      const mix = (k) => own[k] * own.a + behind[k] * (1 - own.a); // composite over parent
      const diff = Math.abs(mix("r") - behind.r) + Math.abs(mix("g") - behind.g) + Math.abs(mix("b") - behind.b);
      if (diff < 24) bgPlans[i] = "clear";
    }
  } finally {
    root.classList.add("lsu-dark");
    if (!wasFrozen) root.classList.remove("lsu-dm-freeze");
  }
}

function applyBg(el, kind) {
  if (!el.hasAttribute("style")) {
    el.dataset.dmBg = kind;
  } else if (kind === "clear") {
    setInline(el, "background-color", "transparent");
    setInline(el, "background-image", "none");
  } else if (kind === "solid") {
    setInline(el, "background-color", SURFACE);
    setInline(el, "background-image", "none");
  } else {
    setInline(el, "background-color", OVERLAY);
  }
}

// Light-grey borders are subtle on white but glare on dark. Returns e.g. "t l".
// Colored borders (LSU gold bars, red accents) are left alone.
function planBorders(el) {
  const cs = getComputedStyle(el);
  const sides = Object.entries(SIDES).filter(([, side]) => {
    if (parseFloat(cs[`border-${side}-width`]) === 0 || cs[`border-${side}-style`] === "none") return false;
    const c = parse(cs[`border-${side}-color`]);
    if (!c || c.a < 0.2) return false;
    const spread = Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b);
    return luminance(c) > 0.35 && spread < 40;
  });
  return sides.length ? sides.map(([k]) => k).join(" ") : null;
}

function applyBorders(el, sides) {
  if (!el.hasAttribute("style")) {
    el.dataset.dmBd = sides;
  } else {
    sides.split(" ").forEach((k) => setInline(el, `border-${SIDES[k]}-color`, BORDER));
  }
}

// ---------- Pass 2: text contrast ----------
function hasOwnText(el) {
  if (!el.firstElementChild) return true;
  for (const n of el.childNodes) if (n.nodeType === 3 && n.data.trim()) return true;
  return false;
}

function makeBgFinder() {
  const cache = new Map();
  const root = html();
  return function effectiveBg(el) {
    const path = [];
    let result = PAGE_BG;
    for (let e = el; e && e !== root; e = e.parentElement) {
      if (cache.has(e)) { result = cache.get(e); break; }
      path.push(e);
      const cs = getComputedStyle(e);
      if (cs.backgroundImage.includes("url(")) { result = null; break; } // text over a photo: leave it
      const c = parse(cs.backgroundColor);
      if (c && c.a >= 0.5) { result = c; break; }
    }
    path.forEach((e) => cache.set(e, result));
    return result;
  };
}

// The color we currently force on `el`, as an rgbKey, or undefined if none.
function currentFix(el) {
  if (el.dataset.dmC !== undefined) return colorKeys[el.dataset.dmC];
  if (el.dataset.dmInline?.includes('"color"')) return el.style.getPropertyValue("color");
  return undefined;
}

// Returns undefined for "leave as is", or { src, out }: the text's own color and the
// replacement it needs (out = null: it no longer needs one, so drop our fix).
function planFg(el, effectiveBg) {
  if (!hasOwnText(el)) return undefined;
  const fixed = currentFix(el);
  let src;
  if (fixed !== undefined) {
    // Already fixed: judge the *original* color we saved, never the live one. A
    // rescan during a color transition (hover fades, .btn has `transition: color`)
    // would read an in-between color and chase it.
    if (!el.dataset.dmSrc) return undefined;
    const [r, g, b] = el.dataset.dmSrc.split(",").map(Number);
    src = { r, g, b, a: 1 };
  } else {
    src = parse(getComputedStyle(el).color);
    if (!src || src.a < 0.3) return undefined;
  }
  // Re-checked on every scan, so a fix follows its background: a section that turns
  // light gets its original text color back, and one that turns dark gets a new fix.
  const bg = effectiveBg(el);
  const ok = !bg || luminance(bg) > 0.4 || contrast(src, bg) >= MIN_CONTRAST; // light chip: own text is fine
  const out = ok ? null : fixText(src, bg);
  if ((out ? rgbKey(out) : undefined) === fixed) return undefined;
  return { src, out };
}

function applyFg(el, { src, out }) {
  if (!out) {
    delete el.dataset.dmC;
    delete el.dataset.dmSrc;
    unsetInline(el, "color");
    return;
  }
  el.dataset.dmSrc = `${src.r},${src.g},${src.b}`;
  // Keep using whichever mechanism the element already has (see the top of the file)
  const viaData = el.dataset.dmC !== undefined || (currentFix(el) === undefined && !el.hasAttribute("style"));
  if (viaData) el.dataset.dmC = colorId(out);
  else setInline(el, "color", rgbKey(out));
}

// `freeze`: for full-page scans right after dark mode switches on. Snap animates
// background colors, so without it we'd read e.g. #page mid-fade as "still white" and
// mark it as a card forever. Not used for routine scans, where cancelling transitions
// would make drawers and menus jump instead of slide.
function scan(node, { freeze = false } = {}) {
  const root = html();
  if (!isDark() || !root || !node || node.nodeType !== 1 || !node.isConnected) return;
  // Hand any page mutations that are still undelivered to the queue first, so that
  // dropping the records our own writes create (below) can't swallow them.
  handleMutations(observer.takeRecords());
  ensureSheet();
  if (freeze) root.classList.add("lsu-dm-freeze");
  try {
    scanElements(node);
  } finally {
    if (freeze) root.classList.remove("lsu-dm-freeze");
    // Everything recorded since the call above is our own doing (inline overrides,
    // the class flips in resolveClear). Rescanning for those would only re-measure
    // elements we just fixed.
    observer.takeRecords();
  }
}

function scanElements(node) {
  const els = [node, ...node.querySelectorAll("*")].filter((el) => !SKIP.has(el.tagName) && !el.closest("svg"));
  // Read everything, then write, so the browser doesn't recalc styles per element.
  const bgPlans = els.map(planBg);
  resolveClear(els, bgPlans);
  const bdPlans = els.map(planBorders);
  els.forEach((el, i) => {
    if (bgPlans[i]) applyBg(el, bgPlans[i]);
    if (bdPlans[i]) applyBorders(el, bdPlans[i]);
  });
  const effectiveBg = makeBgFinder();
  const fgPlans = els.map((el) => planFg(el, effectiveBg));
  els.forEach((el, i) => fgPlans[i] && applyFg(el, fgPlans[i]));
}

function restoreAll() {
  document.querySelectorAll("[data-dm-inline]").forEach((el) => {
    for (const [prop, [v, p]] of Object.entries(JSON.parse(el.dataset.dmInline))) {
      if (v) el.style.setProperty(prop, v, p);
      else el.style.removeProperty(prop);
    }
    delete el.dataset.dmInline;
  });
  document.querySelectorAll("[data-dm-bg]").forEach((el) => delete el.dataset.dmBg);
  document.querySelectorAll("[data-dm-c]").forEach((el) => delete el.dataset.dmC);
  document.querySelectorAll("[data-dm-src]").forEach((el) => delete el.dataset.dmSrc);
  document.querySelectorAll("[data-dm-bd]").forEach((el) => delete el.dataset.dmBd);
}

// Batch DOM changes (AJAX content, drawers opening, hover states) into one scan.
let pending = new Set();
let timer = 0;
function queue(node) {
  pending.add(node);
  if (timer) return;
  timer = setTimeout(() => {
    timer = 0;
    const nodes = [...pending].filter((n) => n.isConnected);
    pending = new Set();
    nodes.filter((n) => !nodes.some((o) => o !== n && o.contains(n))).forEach((n) => scan(n));
  }, 50);
}

function handleMutations(mutations) {
  for (const m of mutations) {
    if (m.type === "childList") {
      // A new <html> (document.open/write in the editor iframe): put our classes back
      if (m.target === document) syncRootClasses();
      m.addedNodes.forEach((n) => n.nodeType === 1 && queue(n));
    } else if (m.target === html()) {
      // Our own flips are dropped in scan(); anything left is the page rewriting <html class>
      const cl = m.target.classList;
      if (cl.contains("lsu-dark") !== isDark() || cl.contains("lsu-amoled") !== state.amoled) syncRootClasses();
    } else {
      queue(m.target); // class/style change can restyle the whole subtree
    }
  }
}

// Observe the document, not <html>: the document survives document.open, <html> doesn't.
const observer = new MutationObserver(handleMutations);
observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });

// Mobile browsers tint their toolbar with <meta name="theme-color">; match the page.
let originalThemeColor;
function syncThemeColor() {
  if (!document.head || window.top !== window) return;
  let meta = document.head.querySelector('meta[name="theme-color"]');
  if (originalThemeColor === undefined) originalThemeColor = meta ? meta.content : null;
  if (!isDark() && originalThemeColor === null) { meta?.remove(); return; }
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = isDark() ? (state.amoled ? "#000000" : "#1e1b26") : originalThemeColor;
}

// `applied`: whether the page is currently themed, so update() knows whether the
// whole page needs a scan (turning on) or a restore (turning off).
let applied = isDark();
function update() {
  syncRootClasses();
  const now = isDark();
  if (now !== applied) {
    applied = now;
    if (now) document.body && scan(document.body, { freeze: true });
    else restoreAll();
  }
  syncThemeColor();
}

function applySettings(settings) {
  for (const k in DEFAULTS) if (settings[k] !== undefined) state[k] = settings[k];
  saveCache();
  update();
}

// Auto mode: follow the OS switching between light and dark (e.g. at sunset)
systemDark.addEventListener("change", update);

document.addEventListener("DOMContentLoaded", () => { scan(document.body, { freeze: true }); syncThemeColor(); });
window.addEventListener("load", () => scan(document.body, { freeze: true }));

chrome.storage.sync.get(DEFAULTS, applySettings);

chrome.storage.onChanged.addListener((changes) => {
  const settings = {};
  for (const k in DEFAULTS) if (changes[k]) settings[k] = changes[k].newValue;
  applySettings(settings);
});
