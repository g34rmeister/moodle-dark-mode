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
const RAISED = "var(--dm-surface-2)"; // hover highlights
const LINE = "var(--dm-muted)";       // drawn lines that were near-black
const FAINT = "color-mix(in srgb, var(--dm-text) 35%, transparent)"; // see planBorders
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
  `html.lsu-dark :is([data-dm-bg="hover"], [data-dm-bg="raised"], [data-dm-bg="tint"])${HI} { background-color: ${RAISED} !important; background-image: none !important; }\n` +
  `html.lsu-dark [data-dm-bg="overlay"]${HI} { background-color: ${OVERLAY} !important; }\n` +
  `html.lsu-dark [data-dm-bg="clear"]${HI} { background-color: transparent !important; background-image: none !important; }\n` +
  Object.entries(SIDES).map(([k, side]) =>
    `html.lsu-dark [data-dm-bd~="${k}"]${HI} { border-${side}-color: ${BORDER} !important; }\n` +
    `html.lsu-dark [data-dm-bs~="${k}"]${HI} { border-${side}-color: ${LINE} !important; }\n` +
    `html.lsu-dark [data-dm-bm~="${k}"]${HI} { border-${side}-color: ${FAINT} !important; }\n`).join("") +
  Object.entries({ soft: BORDER, strong: LINE, faint: FAINT }).map(([k, color]) =>
    `html.lsu-dark [data-dm-ol="${k}"]${HI} { outline-color: ${color} !important; }\n`).join("") +
  `html.lsu-dark [data-dm-edge]${HI} { box-shadow: 0 0 0 1px ${BORDER} !important; }\n` +
  // Used by full-page scans (see scan): cancels running transitions so computed
  // colors are final values, not mid-fade ones.
  `html.lsu-dm-freeze *, html.lsu-dm-freeze *::before, html.lsu-dm-freeze *::after { transition: none !important; }\n` +
  // Elements held while we change them (see holder)
  `[data-dm-still]${HI}, [data-dm-still]${HI}::before, [data-dm-still]${HI}::after { transition: none !important; }\n`;

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
const accentOf = new WeakMap();
const pastel = (c) => (Math.max(c.r, c.g, c.b) + Math.min(c.r, c.g, c.b)) / 510 > 0.78 && luminance(c) > 0.4;
const accentIds = new Map();
function accentValue(c) { return `color-mix(in srgb, ${rgbKey(c)} 22%, ${SURFACE})`; }
function accentId(c) {
  const key = rgbKey(c);
  if (!accentIds.has(key)) {
    accentIds.set(key, accentIds.size);
    sheet.textContent += `html.lsu-dark [data-dm-ac="${accentIds.get(key)}"]${HI} { background-color: ${accentValue(c)} !important; background-image: none !important; }
`;
  }
  return accentIds.get(key);
}

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
  // A pastel (Workday's lavender behind the selected app) would be the one bright
  // patch on a dark page, and a pale tint (#f6f0ff behind the selected item of a
  // side menu) would turn the same card color as the menu. Both get a dark tint of
  // their own hue, so a selected item still reads as selected. Pale tints only on
  // small boxes: a big pale panel is a card. Strong colors (LSU gold) are left alone.
  if (img === "none" && bg && bg.a >= 0.95 && pastel(bg)) {
    const spread = Math.max(bg.r, bg.g, bg.b) - Math.min(bg.r, bg.g, bg.b);
    if (spread >= 60 || (spread >= 12 && el.getBoundingClientRect().height <= 80)) { accentOf.set(el, bg); return "accent"; }
  }
  if (img === "none" && light(bg)) return bg.a < 0.95 ? "overlay" : "solid";
  // A faint dark tint: Workday marks the selected item (My Tasks' "All Items") with
  // 5% navy. A visible shade on white, nothing on dark, so it gets the raised color.
  // Small boxes only, so a translucent black backdrop behind a dialog is left alone.
  if (img === "none" && bg && bg.a >= 0.03 && bg.a < 0.3 && luminance(bg) < 0.2 &&
    el.getBoundingClientRect().height <= 80) return "tint";
  if (img.startsWith("linear-gradient") && !img.includes("url(")) {
    if (light(parse(img.match(/(?:rgba?|oklch|oklab|lab|lch|color|hwb|hsla?)\([^)]*\)/)?.[0]))) return "solid";
  }
  return null;
}

// Light-mode background behind `el`: the nearest ancestor with a solid color, read
// while dark mode is switched off (see resolveClear). Ancestors we already overrode
// inline report their saved original. If that original was empty, the light color
// came from a stylesheet: resolveClear lifts all such overrides before calling this.
// With nothing painted behind, the browser's white canvas shows: { ..., canvas: true }.
// `floating: true` when a floating layer (see floats) lies between `el` and that
// color, so `el` floats over other content too: Workday's search suggestions are a
// static panel inside a transparent fixed wrapper.
function lightBgBehind(el) {
  const root = html();
  let floating = false;
  for (let e = el.parentElement; e && e !== root; e = e.parentElement) {
    const saved = e.dataset.dmInline && JSON.parse(e.dataset.dmInline)["background-color"];
    let c;
    if (saved && saved[0]) {
      c = parse(saved[0]);
    } else {
      const cs = getComputedStyle(e);
      c = parse(cs.backgroundColor);
      if (!saved && cs.backgroundImage.includes("url(")) return null;
    }
    if (c && c.a >= 0.5) return { ...c, floating, from: e };
    if (floats(e)) floating = true;
  }
  return { r: 255, g: 255, b: 255, a: 1, canvas: true, floating };
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

// A box that floats over other content matches what's behind it only while nothing
// is under it: Workday's fixed OK / Cancel bar (content scrolls beneath) and its
// pop-up menus (absolute, raised with a shadow, over the page). These keep the card
// color instead of going transparent. Plain absolute boxes (badges, decorations)
// don't count.
function floats(el) {
  const cs = getComputedStyle(el);
  if (cs.position === "fixed" || cs.position === "sticky") return true;
  return cs.position === "absolute" && (cs.boxShadow !== "none" || parseInt(cs.zIndex, 10) > 0);
}

// Blocks pasted from editors often carry an inline `background-color: rgba(255,255,255,.9)`
// that matches the card they sit on. In light mode that's invisible; darkening each one
// separately would draw a dark bar per heading/paragraph. So for each light background,
// compare it with what was behind it *in light mode*: if they match, go transparent.
function resolveClear(els, bgPlans) {
  const idx = bgPlans.map((p, i) => (p && p !== "tint" ? i : -1)).filter((i) => i >= 0);
  if (!idx.length) return;
  const root = html();
  const wasFrozen = root.classList.contains("lsu-dm-freeze");
  root.classList.add("lsu-dm-freeze"); // no transitions, so reads are immediate
  root.classList.remove("lsu-dark");   // no paint happens before we switch it back
  // The plan for an ancestor: from this scan (ancestors come first in `els`, so it is
  // final already) or from an earlier one
  const index = new Map(els.map((el, i) => [el, i]));
  const planOf = (e) => (index.has(e) ? bgPlans[index.get(e)] : e.dataset.dmBg);
  // Inline overrides whose original came from a stylesheet: lift them all at once,
  // so every read below sees light mode. One at a time, each lift would restyle the
  // whole page again: on Workday's org chart (6,000 elements) a hover took seconds.
  const liftedInline = [];
  for (const e of root.querySelectorAll("[data-dm-inline]")) {
    const saved = JSON.parse(e.dataset.dmInline)["background-color"];
    if (!saved || saved[0]) continue;
    liftedInline.push([e, e.style.getPropertyValue("background-color"), e.style.getPropertyPriority("background-color")]);
    e.style.removeProperty("background-color");
  }
  try {
    for (const i of idx) {
      const el = els[i];
      const own = parse(getComputedStyle(el).backgroundColor);
      const behind = lightBgBehind(el);
      if (!own || !behind) continue;
      const mix = (k) => own[k] * own.a + behind[k] * (1 - own.a); // composite over parent
      const diff = Math.abs(mix("r") - behind.r) + Math.abs(mix("g") - behind.g) + Math.abs(mix("b") - behind.b);
      if (diff < 24) { if (!behind.floating && !floats(el)) bgPlans[i] = "clear"; }
      else if (bgPlans[i] === "solid" && behind.canvas && isPageBackground(el)) bgPlans[i] = "page";
      // A lighter box on a light box we darken (myLSU's white search pill on its
      // light grey sidebar) would get the same card color and vanish: raise it.
      // So would a small darker one (Workday's grey selected tab on a white card).
      // Only small ones: Workday's grey nav sits on a white page wrapper, and a
      // raised nav would change shade with every scan that does or doesn't
      // include the wrapper.
      else if (bgPlans[i] === "solid" && behind.from && ["solid", "raised"].includes(planOf(behind.from)) &&
        (luminance(own) > luminance(behind) || el.getBoundingClientRect().height <= 80)) bgPlans[i] = "raised";
    }
  } finally {
    for (const [e, v, p] of liftedInline) e.style.setProperty("background-color", v, p);
    root.classList.add("lsu-dark");
    // Apply the dark styles again *before* unfreezing. Otherwise the browser sees
    // every element go from the light values we just read to dark with transitions
    // back on, and anything with `transition: all` (much of Workday) fades in from
    // light: the page flashes whenever new content arrives.
    if (!wasFrozen) { settleStyles(); root.classList.remove("lsu-dm-freeze"); }
  }
}

function applyBg(el, kind) {
  if (kind === "accent") {
    const c = accentOf.get(el);
    if (!el.hasAttribute("style")) { el.dataset.dmBg = kind; el.dataset.dmAc = accentId(c); }
    else { setInline(el, "background-color", accentValue(c)); setInline(el, "background-image", "none"); }
  } else if (!el.hasAttribute("style")) {
    el.dataset.dmBg = kind;
  } else if (kind === "clear") {
    setInline(el, "background-color", "transparent");
    setInline(el, "background-image", "none");
  } else if (kind === "solid" || kind === "page" || kind === "hover" || kind === "raised" || kind === "tint") {
    setInline(el, "background-color", kind === "page" ? PAGE : kind === "solid" ? SURFACE : RAISED);
    setInline(el, "background-image", "none");
  } else {
    setInline(el, "background-color", OVERLAY);
  }
}

// Grey borders, two kinds. Light grey ones (`soft`) are subtle separators on white
// but glare on dark: they get the border color. Near-black ones (`strong`) are
// drawn lines, like the connectors in Workday's org chart (borders on empty spans),
// which vanish on dark: they get the muted text color, so they stay lines. Our own
// border colors are dark greys well above near-black, so they are never re-caught.
// Colored borders (LSU gold bars, red accents) are left alone. Returns null or
// { soft: "t l", strong: "b", faint: "" } (any may be empty).
// Translucent dark borders (`faint`; Workday's outlined inputs and round icon
// buttons, navy at 35%) are mid-grey lines on white. They get light at 35%, which
// keeps them as visible as in light mode; the border color would be dimmer.
function planBorders(el) {
  const cs = getComputedStyle(el);
  const soft = [], strong = [], faint = [];
  // Sides we already recolored read as our colors now; judging them again would
  // take our muted line for a light-grey border
  const done = `${el.dataset.dmBd || ""} ${el.dataset.dmBs || ""} ${el.dataset.dmBm || ""}`.split(" ");
  for (const [k, side] of Object.entries(SIDES)) {
    if (done.includes(k) || el.dataset.dmInline?.includes(`"border-${side}-color"`)) continue;
    if (parseFloat(cs[`border-${side}-width`]) === 0 || cs[`border-${side}-style`] === "none") continue;
    const kind = lineKind(parse(cs[`border-${side}-color`]));
    if (kind) ({ soft, strong, faint })[kind].push(k);
  }
  // Workday draws its card edges as an outline (light grey, 0.8px), not a border
  let outline = null;
  if (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 && !el.dataset.dmOl &&
    !el.dataset.dmInline?.includes('"outline-color"')) outline = lineKind(parse(cs.outlineColor));
  return soft.length || strong.length || faint.length || outline ?
    { soft: soft.join(" "), strong: strong.join(" "), faint: faint.join(" "), outline } : null;
}

// How a grey line drawn for white should look on dark: "soft" (the border color),
// "strong" (muted, for drawn black lines), "faint" (light at 35%) or null (leave it:
// colored lines, and lines that already show).
function lineKind(c) {
  if (!c) return null;
  // Judged as it shows on white (the same as c when opaque)
  const w = { r: c.r * c.a + 255 * (1 - c.a), g: c.g * c.a + 255 * (1 - c.a), b: c.b * c.a + 255 * (1 - c.a) };
  if (Math.max(w.r, w.g, w.b) - Math.min(w.r, w.g, w.b) >= 40) return null;
  // Translucent dark borders show as grey on white, lighter the more see-through
  // they are: from 25% they are outlines (faint), below that hairline dividers,
  // which get the border color so they stay as subtle as they were
  const darkTint = c.a < 1 && luminance(c) < 0.2;
  if (c.a >= 0.5 && luminance(c) < 0.01) return "strong";
  if (darkTint && c.a >= 0.25) return "faint";
  if (darkTint && c.a >= 0.08) return "soft";
  if (c.a >= 0.2 && luminance(w) > 0.35) return "soft";
  return null;
}
const LINE_COLORS = { soft: BORDER, strong: LINE, faint: FAINT };

function applyBorders(el, { soft, strong, faint, outline }) {
  if (outline) {
    if (!el.hasAttribute("style")) el.dataset.dmOl = outline;
    else setInline(el, "outline-color", LINE_COLORS[outline]);
  }
  if (!el.hasAttribute("style")) {
    const add = (key, sides) => { if (sides) el.dataset[key] = `${el.dataset[key] || ""} ${sides}`.trim(); };
    add("dmBd", soft);
    add("dmBs", strong);
    add("dmBm", faint);
  } else {
    for (const [sides, color] of [[soft, BORDER], [strong, LINE], [faint, FAINT]]) {
      if (sides) sides.split(" ").forEach((k) => setInline(el, `border-${SIDES[k]}-color`, color));
    }
  }
}

// A light box whose only edge is a shadow (Workday's org chart cards): the shadow
// is invisible on dark, and on AMOLED black the darkened box is too. Such a box
// gets a thin outline in the border color instead (data-dm-edge).
function edgeOnlyByShadow(el) {
  const cs = getComputedStyle(el);
  if (cs.boxShadow === "none") return false;
  return Object.values(SIDES).every((side) => parseFloat(cs[`border-${side}-width`]) === 0 ||
    cs[`border-${side}-style`] === "none" || (parse(cs[`border-${side}-color`])?.a ?? 0) < 0.2);
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
const RAISED_RGB = { r: 40, g: 36, b: 50, a: 1 };
const OURS = { page: PAGE_BG, solid: SURFACE_RGB, hover: RAISED_RGB, raised: RAISED_RGB, tint: RAISED_RGB, overlay: PAGE_BG, clear: null,
  [PAGE]: PAGE_BG, [SURFACE]: SURFACE_RGB, [RAISED]: RAISED_RGB, [OVERLAY]: PAGE_BG, transparent: null };
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

// The fill and stroke the page itself gives each icon shape right now, read with our
// own overrides lifted for a moment (transitions frozen, nothing is painted).
// Shapes need this rather than the color saved when we first fixed them: SVG's
// initial fill is black, and a page rule that removes it can briefly not match.
// Workday's `.wd-icon-background { fill: none }` depends on the button's state, so
// a scan in between sees black; trusting that forever turns outline icons into
// solid blocks.
function readPagePaints(shapes, hold) {
  const own = new Map();
  if (!shapes.length) return own;
  const undo = [];
  for (const el of shapes) {
    for (const prop of ["fill", "stroke"]) {
      const { id } = PAINTS[prop];
      if (el.dataset[id] !== undefined || el.dataset.dmInline?.includes(`"${prop}"`)) hold(el);
      if (el.dataset[id] !== undefined) {
        const v = el.dataset[id];
        delete el.dataset[id];
        undo.push(() => { el.dataset[id] = v; });
      } else if (el.dataset.dmInline?.includes(`"${prop}"`)) {
        const ours = [el.style.getPropertyValue(prop), el.style.getPropertyPriority(prop)];
        const [v, p] = JSON.parse(el.dataset.dmInline)[prop];
        if (v) el.style.setProperty(prop, v, p);
        else el.style.removeProperty(prop);
        undo.push(() => el.style.setProperty(prop, ...ours));
      }
    }
  }
  try {
    for (const el of shapes) {
      const cs = getComputedStyle(el);
      own.set(el, { fill: cs.fill, stroke: cs.stroke, strokeWidth: cs.strokeWidth,
        fillOpacity: parseFloat(cs.fillOpacity), strokeOpacity: parseFloat(cs.strokeOpacity) });
    }
  } finally {
    undo.forEach((fn) => fn());
  }
  return own;
}

// Transitions off for just the elements we're about to change, until the browser has
// applied the change (see settle). Without it, the page's own transitions animate
// our recoloring: Workday has `transition: all` on rows and buttons, so a row we
// darken would fade from white. Only these elements are held, so animations
// elsewhere (a drawer sliding open) carry on.
const STILL = "data-dm-still";
function holder() {
  const held = new Set();
  return {
    hold(el) { if (!held.has(el)) { held.add(el); el.setAttribute(STILL, ""); } },
    settle() {
      if (!held.size) return;
      settleStyles();
      held.forEach((el) => el.removeAttribute(STILL));
    },
  };
}
// Elements inside `node` with a color transition running right now.
function fading(node) {
  if (typeof document.getAnimations !== "function" || typeof CSSTransition === "undefined") return [];
  return document.getAnimations()
    .filter((a) => a instanceof CSSTransition && /color|background|border|fill|stroke|^all$/.test(a.transitionProperty))
    .map((a) => a.effect?.target)
    .filter((el) => el && el.nodeType === 1 && node.contains(el));
}

// Make the browser apply pending style changes now. All engines do this for the
// whole document when any computed style is read.
function settleStyles() {
  getComputedStyle(html()).color;
}

// The element's own color for `prop`, as the page set it, or null if there is none
// to judge (fill "none" or "url(#gradient)", or nearly transparent). `own` is the
// result of readPagePaints, for shapes.
function originalPaint(el, prop, own) {
  let c;
  if (prop !== "color") {
    // fill-opacity / stroke-opacity count too: Snap's progress ring has a black
    // fill at fill-opacity 0, which nobody sees
    const o = own.get(el);
    c = parse(o[prop]);
    if (c) c = { ...c, a: c.a * o[`${prop}Opacity`] };
  } else if (currentFix(el, prop) !== undefined) {
    // Already fixed text: judge the *original* color we saved, never the live one. A
    // rescan during a color transition (hover fades, .btn has `transition: color`)
    // would read an in-between color and chase it.
    const saved = el.dataset[PAINTS[prop].src];
    if (!saved) return null;
    const [r, g, b] = saved.split(",").map(Number);
    return { r, g, b, a: 1 };
  } else {
    c = parse(getComputedStyle(el)[prop]);
  }
  return c && c.a >= 0.3 ? c : null;
}

// Returns undefined for "leave as is", or { el, prop, src, out }: the element's own
// color and the replacement it needs (out = null: it no longer needs one, so drop
// our fix). `prop` is a key of PAINTS.
function planPaint(el, prop, effectiveBg, own) {
  const P = PAINTS[prop];
  const fixed = currentFix(el, prop);
  const src = originalPaint(el, prop, own);
  // Nothing to judge any more (an icon's fill became "none"): drop a fix we made
  if (!src) return fixed === undefined ? undefined : { el, prop, src: null, out: null };
  // Re-checked on every scan, so a fix follows its background: a section that turns
  // light gets its original color back, and one that turns dark gets a new fix.
  const bg = effectiveBg(el);
  let ok = !bg || luminance(bg) > 0.4 || contrast(src, bg) >= P.min; // light chip: own color is fine
  if (!ok && prop !== "color") {
    // A shape whose other paint already stands out is drawn by that one: a light
    // outline around a dark interior (Snap's feed icons) stays an outline, rather
    // than becoming a solid light blob.
    const other = prop === "fill" ? "stroke" : "fill";
    const o = originalPaint(el, other, own);
    const drawn = other === "fill" || parseFloat(own.get(el).strokeWidth) > 0;
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
    if (freeze) { settleStyles(); root.classList.remove("lsu-dm-freeze"); } // same reason as in resolveClear
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
  const { hold, settle } = holder();
  try {
    // Elements mid-way through a color fade would be read at an in-between color:
    // myLSU's sidebar rows fade from purple (hover) back to light grey, so a check
    // as the pointer leaves sees purplish, finds nothing light and drops our
    // override, and the fade then ends on light grey. Holding them ends the fade,
    // so we read where it was going.
    for (const el of fading(node)) hold(el);
    // Backgrounds are re-judged on every scan: lift the ones we set, plan again from
    // the page's own colors, and re-apply. A hover highlight we darkened (Workday's
    // lavender menu rows) must go back to transparent once the pointer leaves.
    const lifted = els.filter((el) => el.dataset.dmBg !== undefined || el.dataset.dmInline?.includes('"background-color"'));
    for (const el of lifted) {
      hold(el);
      delete el.dataset.dmBg;
      delete el.dataset.dmEdge;
      delete el.dataset.dmAc;
      unsetInline(el, "background-color");
      unsetInline(el, "background-image");
    }
    // Read everything, then write, so the browser doesn't recalc styles per element.
    const bgPlans = els.map(planBg);
    // A light row that is light because it's hovered gets the raised color, so the
    // highlight still shows. Decided before resolveClear: a hover color is often
    // close to what's behind it (Workday's lavender on white), which would clear it.
    // (Small boxes only: a whole card under the pointer at page load is a card.)
    // (A pale-tinted hover row counts too; a pastel selected item keeps its tint.)
    const paleTint = (el) => { const c = accentOf.get(el); return c && Math.max(c.r, c.g, c.b) - Math.min(c.r, c.g, c.b) < 60; };
    const hovered = els.map((el, i) => (bgPlans[i] === "solid" || (bgPlans[i] === "accent" && paleTint(el))) &&
      el.matches(":hover") && el.getBoundingClientRect().height <= 80);
    resolveClear(els, bgPlans);
    hovered.forEach((h, i) => { if (h) bgPlans[i] = "hover"; });
    const edges = els.map((el, i) => ["solid", "raised"].includes(bgPlans[i]) && edgeOnlyByShadow(el));
    const bdPlans = els.map(planBorders);
    els.forEach((el, i) => {
      if (bgPlans[i] || bdPlans[i]) hold(el);
      if (bgPlans[i]) applyBg(el, bgPlans[i]);
      if (edges[i]) el.dataset.dmEdge = "";
      if (bdPlans[i]) applyBorders(el, bdPlans[i]);
    });
    const effectiveBg = makeBgFinder();
    const own = readPagePaints(shapes, hold);
    const fgPlans = [
      ...els.filter(hasOwnText).map((el) => planPaint(el, "color", effectiveBg)),
      ...shapes.flatMap((el) => [planPaint(el, "fill", effectiveBg, own), planPaint(el, "stroke", effectiveBg, own)]),
    ].filter(Boolean);
    fgPlans.forEach((plan) => { hold(plan.el); applyPaint(plan); });
  } finally {
    settle();
  }
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
  document.querySelectorAll("[data-dm-bs]").forEach((el) => delete el.dataset.dmBs);
  document.querySelectorAll("[data-dm-bm]").forEach((el) => delete el.dataset.dmBm);
  document.querySelectorAll("[data-dm-ol]").forEach((el) => delete el.dataset.dmOl);
  document.querySelectorAll("[data-dm-edge]").forEach((el) => delete el.dataset.dmEdge);
  document.querySelectorAll("[data-dm-ac]").forEach((el) => delete el.dataset.dmAc);
}

// Batch DOM changes (AJAX content, drawers opening, hover states) into one scan per
// frame, run just before the browser paints it, so new content never shows up
// light first (Workday renders grid rows as you scroll). A hidden tab gets no
// frames; its scans wait until it's shown.
let pending = new Set();
let scheduled = false;
function queue(node) {
  pending.add(node);
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    const nodes = [...pending].filter((n) => n.isConnected);
    pending = new Set();
    nodes.filter((n) => !nodes.some((o) => o !== n && o.contains(n))).forEach((n) => scan(n));
  });
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

// :hover and :focus restyle a page without changing its DOM, so the observer never
// hears about them: myLSU's link rows turn gold on hover, and the light text we gave
// them for the dark row would stay on the gold. Re-check the row under the pointer
// or focus as it changes (the parent too, for siblings in the same row), and again
// when a color transition ends, since rows that fade read mid-fade at first.
// Each is queued, so a fast mouse costs one scan of a small subtree per frame.
// Only small subtrees: on Workday's org chart (6,000 elements) the parent of what's
// under the pointer can be the whole chart, and scrolling moves new elements under
// a still pointer, so rescanning it made every frame of a scroll slow.
const HOVER_MAX = 400;
const smallEnough = (n) => n && n !== document.body && n !== html() && n.getElementsByTagName("*").length <= HOVER_MAX;
const recheck = (e) => {
  const t = e.target;
  if (t.nodeType !== 1) return;
  const node = smallEnough(t.parentElement) ? t.parentElement : smallEnough(t) ? t : null;
  if (node) queue(node);
};
for (const type of ["mouseover", "mouseout", "focusin", "focusout"]) {
  document.addEventListener(type, recheck, { capture: true, passive: true });
}
document.addEventListener("transitionend", (e) => {
  if (/color|background|^all$/.test(e.propertyName)) recheck(e);
}, { capture: true, passive: true });

document.addEventListener("DOMContentLoaded", () => { scan(document.body, { freeze: true }); syncThemeColor(); });
window.addEventListener("load", () => scan(document.body, { freeze: true }));

chrome.storage.sync.get(DEFAULTS, applySettings);

chrome.storage.onChanged.addListener((changes) => {
  const settings = {};
  for (const k in DEFAULTS) if (changes[k]) settings[k] = changes[k].newValue;
  applySettings(settings);
});
