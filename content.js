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

// The stylesheets (base.css + the site's own) handle the known parts of the page.
// This script is the safety net for everything else. It reads each element's
// *computed* colors and:
//   1. darkens any background that is still light, then
//   2. lightens any text that fails WCAG AA contrast (4.5:1) against the background
//      it actually sits on — keeping its hue, so purple stays purple — and any
//      SVG icon shape below 3:1 (WCAG's bar for graphics).
//
// Snap has rules like `.summary div[style] { border: inherit; padding: inherit }`, so
// we never add a style attribute to an element that lacks one. Those elements get
// data attributes instead, matched by high-specificity rules that also beat the
// theme's own `!important` utility classes. Elements that already have inline styles
// (possibly `!important`) get inline overrides; originals are saved for the toggle.

// Replacement colors are CSS variables from base.css, so switching between the dark
// and AMOLED palettes restyles everything we touched without rescanning.
const PAGE = "var(--dm-bg)";
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

// Computed colors are usually rgb()/rgba(), but a color authored in a newer syntax
// keeps it: Workday's stylesheets use oklch(), so its computed colors read e.g.
// "oklch(0.9692 0.0035 248.23)". Those are converted to sRGB by painting one pixel
// on a canvas, once per distinct string.
const RGB_RE = /^rgba?\(([\d.]+),?\s*([\d.]+),?\s*([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?/;
const parsed = new Map();
let pixel;
function parse(color) {
  if (!color) return null;
  const m = color.match(RGB_RE);
  if (m) {
    const a = m[4] === undefined ? 1 : parseFloat(m[4]) / (m[4].endsWith("%") ? 100 : 1);
    return { r: +m[1], g: +m[2], b: +m[3], a };
  }
  if (!parsed.has(color)) parsed.set(color, viaCanvas(color));
  return parsed.get(color);
}
function viaCanvas(color) {
  if (!/^(oklch|oklab|lab|lch|color|hwb|hsla?)\(/.test(color)) return null;
  try {
    if (!pixel) {
      const c = document.createElement("canvas");
      c.width = c.height = 1;
      pixel = c.getContext("2d", { willReadFrequently: true });
    }
    pixel.clearRect(0, 0, 1, 1);
    pixel.fillStyle = "#000";
    pixel.fillStyle = color;
    pixel.fillRect(0, 0, 1, 1);
    const [r, g, b, a] = pixel.getImageData(0, 0, 1, 1).data;
    return { r, g, b, a: a / 255 };
  } catch {
    return null;
  }
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
// The properties the contrast pass may recolor. Text needs 4.5:1 (WCAG AA); icon
// shapes (<svg> paths, e.g. Workday's .wd-icon-fill) need 3:1, WCAG's bar for
// graphics. `id` / `src` are the dataset keys holding our color and the original.
const PAINTS = {
  color:  { id: "dmC", src: "dmSrc", attr: "data-dm-c", min: MIN_CONTRAST },
  fill:   { id: "dmF", src: "dmFsrc", attr: "data-dm-f", min: 3 },
  stroke: { id: "dmS", src: "dmSsrc", attr: "data-dm-s", min: 3 },
};
const colorIds = new Map();
const colorKeys = []; // id -> rgbKey, the reverse of colorIds
const rgbKey = ({ r, g, b }) => `rgb(${r}, ${g}, ${b})`;
function colorId(c, prop) {
  const key = rgbKey(c);
  const mapKey = `${prop} ${key}`;
  if (!colorIds.has(mapKey)) {
    colorIds.set(mapKey, colorKeys.length);
    colorKeys.push(key);
    sheet.textContent += `html.lsu-dark [${PAINTS[prop].attr}="${colorIds.get(mapKey)}"]${HI} { ${prop}: ${key} !important; }\n`;
  }
  return colorIds.get(mapKey);
}
function ensureSheet() {
  if (!sheet.isConnected) (document.head || html()).appendChild(sheet);
}
const SIDES = { t: "top", r: "right", b: "bottom", l: "left" };
sheet.textContent =
  `html.lsu-dark [data-dm-bg="page"]${HI} { background-color: ${PAGE} !important; background-image: none !important; }\n` +
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
  if (el === document.body) return null; // page base is base.css's job
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
    if (light(parse(img.match(/(?:rgba?|oklch|oklab|lab|lch|color|hwb|hsla?)\([^)]*\)/)?.[0]))) return "solid";
  }
  return null;
}

// Light-mode background behind `el`: the nearest ancestor with a solid color, read
// while dark mode is switched off (see resolveClear). Ancestors we already overrode
// inline report their saved original. If that original was empty, the light color
// came from a stylesheet, so lift our override for a moment to read it.
// With nothing painted behind, the browser's white canvas shows: { ..., canvas: true }.
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
  return { r: 255, g: 255, b: 255, a: 1, canvas: true };
}

// A light box straight on the browser canvas that fills most of the window is the
// page background, painted on a wrapper instead of <body> (Workday's grey page is a
// full-window <div>). It gets the page color, not the card color: cards on it stay
// distinguishable, and in AMOLED mode the page is true black. Fixed and absolute
// boxes are dialogs and menus, so they stay cards.
function isPageBackground(el) {
  const r = el.getBoundingClientRect();
  return r.width >= innerWidth * 0.6 && r.height >= innerHeight * 0.6 &&
    !["fixed", "absolute"].includes(getComputedStyle(el).position);
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
      else if (bgPlans[i] === "solid" && behind.canvas && isPageBackground(el)) bgPlans[i] = "page";
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
  } else if (kind === "solid" || kind === "page") {
    setInline(el, "background-color", kind === "page" ? PAGE : SURFACE);
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

// The background we gave an element in Pass 1, or undefined if we didn't touch it.
// null = we cleared it, so look further up. Used instead of the computed value
// because that can lag: many sites (Workday: `transition: all .12s` on buttons and
// grid cells) animate background-color, so right after we darken a cell it still
// reads white, and the text on it would be judged against white.
const SURFACE_RGB = { r: 30, g: 27, b: 38, a: 1 };
const OURS = { page: PAGE_BG, solid: SURFACE_RGB, overlay: PAGE_BG, clear: null,
  [PAGE]: PAGE_BG, [SURFACE]: SURFACE_RGB, [OVERLAY]: PAGE_BG, transparent: null };
function ourBg(e) {
  if (e.dataset.dmBg) return OURS[e.dataset.dmBg];
  if (e.dataset.dmInline?.includes('"background-color"')) return OURS[e.style.getPropertyValue("background-color")];
  return undefined;
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
      const own = ourBg(e);
      if (own) { result = own; break; }
      if (own === null) continue;
      const cs = getComputedStyle(e);
      if (cs.backgroundImage.includes("url(")) { result = null; break; } // text over a photo: leave it
      const c = parse(cs.backgroundColor);
      if (c && c.a >= 0.5) { result = c; break; }
    }
    path.forEach((e) => cache.set(e, result));
    return result;
  };
}

// The color we currently force on `el` for `prop`, as an rgbKey, or undefined if none.
function currentFix(el, prop) {
  const id = el.dataset[PAINTS[prop].id];
  if (id !== undefined) return colorKeys[id];
  if (el.dataset.dmInline?.includes(`"${prop}"`)) return el.style.getPropertyValue(prop);
  return undefined;
}

// Returns undefined for "leave as is", or { el, prop, src, out }: the element's own
// color and the replacement it needs (out = null: it no longer needs one, so drop
// our fix). `prop` is a key of PAINTS.
// The element's own color for `prop`, as the page set it, or null if there is none
// to judge (fill "none" or "url(#gradient)", or nearly transparent).
function originalPaint(el, prop) {
  if (currentFix(el, prop) !== undefined) {
    // Already fixed: judge the *original* color we saved, never the live one. A
    // rescan during a color transition (hover fades, .btn has `transition: color`)
    // would read an in-between color and chase it.
    const saved = el.dataset[PAINTS[prop].src];
    if (!saved) return null;
    const [r, g, b] = saved.split(",").map(Number);
    return { r, g, b, a: 1 };
  }
  const c = parse(getComputedStyle(el)[prop]);
  return c && c.a >= 0.3 ? c : null;
}

// Returns undefined for "leave as is", or { el, prop, src, out }: the element's own
// color and the replacement it needs (out = null: it no longer needs one, so drop
// our fix). `prop` is a key of PAINTS.
function planPaint(el, prop, effectiveBg) {
  const P = PAINTS[prop];
  const fixed = currentFix(el, prop);
  const src = originalPaint(el, prop);
  if (!src) return undefined;
  // Re-checked on every scan, so a fix follows its background: a section that turns
  // light gets its original color back, and one that turns dark gets a new fix.
  const bg = effectiveBg(el);
  let ok = !bg || luminance(bg) > 0.4 || contrast(src, bg) >= P.min; // light chip: own color is fine
  if (!ok && prop !== "color") {
    // A shape whose other paint already stands out is drawn by that one: a light
    // outline around a dark interior (Snap's feed icons) stays an outline, rather
    // than becoming a solid light blob.
    const other = prop === "fill" ? "stroke" : "fill";
    const o = originalPaint(el, other);
    const drawn = other === "fill" || parseFloat(getComputedStyle(el).strokeWidth) > 0;
    ok = !!o && drawn && contrast(o, bg) >= P.min;
  }
  const out = ok ? null : fixText(src, bg);
  if ((out ? rgbKey(out) : undefined) === fixed) return undefined;
  return { el, prop, src, out };
}

function applyPaint({ el, prop, src, out }) {
  const P = PAINTS[prop];
  if (!out) {
    delete el.dataset[P.id];
    delete el.dataset[P.src];
    unsetInline(el, prop);
    return;
  }
  el.dataset[P.src] = `${src.r},${src.g},${src.b}`;
  // Keep using whichever mechanism the element already has (see the top of the file)
  const viaData = el.dataset[P.id] !== undefined || (currentFix(el, prop) === undefined && !el.hasAttribute("style"));
  if (viaData) el.dataset[P.id] = colorId(out, prop);
  else setInline(el, prop, rgbKey(out));
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
  const all = [node, ...node.querySelectorAll("*")];
  const els = all.filter((el) => !SKIP.has(el.tagName) && !el.closest("svg"));
  // Icon shapes (<path>, <circle>, ...): only their fill and stroke are checked
  const shapes = all.filter((el) => el instanceof SVGGeometryElement);
  // Read everything, then write, so the browser doesn't recalc styles per element.
  const bgPlans = els.map(planBg);
  resolveClear(els, bgPlans);
  const bdPlans = els.map(planBorders);
  els.forEach((el, i) => {
    if (bgPlans[i]) applyBg(el, bgPlans[i]);
    if (bdPlans[i]) applyBorders(el, bdPlans[i]);
  });
  const effectiveBg = makeBgFinder();
  const fgPlans = [
    ...els.filter(hasOwnText).map((el) => planPaint(el, "color", effectiveBg)),
    ...shapes.flatMap((el) => [planPaint(el, "fill", effectiveBg), planPaint(el, "stroke", effectiveBg)]),
  ];
  fgPlans.forEach((plan) => plan && applyPaint(plan));
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
  for (const { id, src, attr } of Object.values(PAINTS)) {
    // Inline fixes have only the `src` key (dmSrc -> data-dm-src)
    const srcAttr = "data-" + src.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
    document.querySelectorAll(`[${attr}], [${srcAttr}]`).forEach((el) => { delete el.dataset[id]; delete el.dataset[src]; });
  }
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
