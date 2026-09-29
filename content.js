// Turn dark mode on immediately to avoid a white flash, then honor the saved setting.
const root = document.documentElement;
root.classList.add("lsu-dark");

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
function colorId({ r, g, b }) {
  const key = `rgb(${r}, ${g}, ${b})`;
  if (!colorIds.has(key)) {
    colorIds.set(key, colorIds.size);
    sheet.textContent += `html.lsu-dark [data-dm-c="${colorIds.size - 1}"]${HI} { color: ${key} !important; }\n`;
  }
  return colorIds.get(key);
}
function ensureSheet() {
  if (!sheet.isConnected) (document.head || root).appendChild(sheet);
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
// inline report their saved original instead.
function lightBgBehind(el) {
  for (let e = el.parentElement; e && e !== root; e = e.parentElement) {
    const saved = e.dataset.dmInline && JSON.parse(e.dataset.dmInline)["background-color"];
    const cs = getComputedStyle(e);
    if (!saved && cs.backgroundImage.includes("url(")) return null;
    const c = parse(saved ? saved[0] : cs.backgroundColor);
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

function planFg(el, effectiveBg) {
  // Already fixed: don't re-measure. A rescan during a color transition (hover
  // fades, .btn has `transition: color`) would read an in-between color and chase it.
  if (el.dataset.dmC !== undefined || el.dataset.dmInline?.includes('"color"')) return null;
  if (!hasOwnText(el)) return null;
  const c = parse(getComputedStyle(el).color);
  if (!c || c.a < 0.3) return null;
  const bg = effectiveBg(el);
  if (!bg || luminance(bg) > 0.4) return null; // on a light/colored chip: its own text is fine
  if (contrast(c, bg) >= MIN_CONTRAST) return null;
  return fixText(c, bg);
}

function applyFg(el, c) {
  if (!el.hasAttribute("style")) el.dataset.dmC = colorId(c);
  else setInline(el, "color", `rgb(${c.r}, ${c.g}, ${c.b})`);
}

// `freeze`: for full-page scans right after dark mode switches on. Snap animates
// background colors, so without it we'd read e.g. #page mid-fade as "still white" and
// mark it as a card forever. Not used for routine scans, where cancelling transitions
// would make drawers and menus jump instead of slide.
function scan(node, { freeze = false } = {}) {
  if (!root.classList.contains("lsu-dark") || !node || node.nodeType !== 1 || !node.isConnected) return;
  ensureSheet();
  if (freeze) root.classList.add("lsu-dm-freeze");
  try {
    scanElements(node);
  } finally {
    if (freeze) root.classList.remove("lsu-dm-freeze");
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

new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (m.type === "childList") m.addedNodes.forEach((n) => n.nodeType === 1 && queue(n));
    else if (m.target !== root) queue(m.target); // class/style change can restyle the whole subtree
  }
}).observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["style", "class"] });

// Mobile browsers tint their toolbar with <meta name="theme-color">; match the page.
let originalThemeColor;
function syncThemeColor() {
  if (!document.head) return;
  let meta = document.head.querySelector('meta[name="theme-color"]');
  if (originalThemeColor === undefined) originalThemeColor = meta ? meta.content : null;
  const on = root.classList.contains("lsu-dark");
  if (!on && originalThemeColor === null) { meta?.remove(); return; }
  if (!meta) {
    meta = document.createElement("meta");
    meta.name = "theme-color";
    document.head.appendChild(meta);
  }
  meta.content = on ? (root.classList.contains("lsu-amoled") ? "#000000" : "#1e1b26") : originalThemeColor;
}

function applySettings({ enabled, amoled }) {
  if (amoled !== undefined) root.classList.toggle("lsu-amoled", amoled);
  if (enabled !== undefined) {
    root.classList.toggle("lsu-dark", enabled);
    if (enabled) document.body && scan(document.body, { freeze: true });
    else restoreAll();
  }
  syncThemeColor();
}

document.addEventListener("DOMContentLoaded", () => { scan(document.body, { freeze: true }); syncThemeColor(); });
window.addEventListener("load", () => scan(document.body, { freeze: true }));

chrome.storage.sync.get({ enabled: true, amoled: false }, applySettings);

chrome.storage.onChanged.addListener((changes) => {
  applySettings({ enabled: changes.enabled?.newValue, amoled: changes.amoled?.newValue });
});
