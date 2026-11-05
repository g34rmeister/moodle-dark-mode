// Browser tests: the extension in Chromium and Firefox, the userscript in WebKit
// (Safari's engine, emulating an iPhone). Each page in pages/ imitates a piece of
// moodle.lsu.edu or LSU Workday and writes "RESULT {json}" into #out; this file
// checks the values.
//
//   python build.py              (the tests use dist/, so build first)
//   cd tests && npm ci && npx playwright install chromium webkit
//   node run.mjs                 (or: node run.mjs chromium webkit)
//
// Firefox is driven through geckodriver (Playwright's Firefox can't load add-ons),
// so it needs Firefox 140+ and geckodriver on PATH. Locally a missing engine is
// skipped with a warning; on CI (CI=true) it is a failure.
import { chromium, webkit, devices } from "playwright";
import { execFileSync, spawn } from "node:child_process";
import { createServer } from "node:https";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const PAGES = join(HERE, "pages");
const version = JSON.parse(readFileSync(join(ROOT, "manifest.json"), "utf8")).version;
const DIST = {
  chrome: join(ROOT, "dist/build/chrome"),
  firefoxZip: join(ROOT, `dist/lsu-moodle-dark-${version}-firefox.zip`),
  userscript: join(ROOT, "dist/lsu-moodle-dark.user.js"),
};
const CI = !!process.env.CI;

// ---------- expected values (dark palette from base.css) ----------
const BG = "rgb(21, 19, 27)", SURFACE = "rgb(30, 27, 38)", SURFACE_2 = "rgb(40, 36, 50)";
const BORDER = "rgb(58, 53, 72)", TEXT = "rgb(231, 228, 238)", MUTED = "rgb(168, 162, 184)";
const GOLD = "rgb(253, 208, 35)";
const EXPECT = {
  "editor.html": {
    iframeHtmlClass: "lsu-dark",        // classes survive TinyMCE's document.write
    iframeBodyBg: SURFACE_2,            // editor text area matches form fields
    iframeGreyText: TEXT,
    mainHtmlClass: "lsu-dark",
    mainBodyBg: BG,
    matchingBlockBg: "rgba(0, 0, 0, 0)", // same as what's behind it in light mode: cleared
    lightBoxBg: SURFACE,
    lightBoxBorder: BORDER,
    greyInlineText: MUTED,              // mid grey maps to the secondary text color
  },
  "follow.html": { textOnDark: TEXT, textOnGold: "rgb(85, 85, 85)", textOnDarkAgain: TEXT },
  "card.html": { quickLinkChipBg: SURFACE, quickLinkIcon: GOLD },
  // Extension only: the userscript reads its settings synchronously and has no cache
  "cache.html": { firstPaintClass: "", settledClass: "lsu-dark" },
  "lsu/workday.html": {
    htmlClass: "lsu-dark",
    pageBg: BG,                          // the full-window wrapper is the page, not a card
    cardBg: SURFACE,                     // oklch(1 0 0) is read as white and darkened
    cardText: TEXT,
    iconFill: TEXT,                      // dark SVG icon on the dark page
    chipIconFill: TEXT,                  // the icon on it turns light
    chipBg: "color(srgb 0.277255 0.243922 0.332784)", // a pastel chip gets a dark tint of its hue
    stepBg: SURFACE_2,                   // a grey tab on a white card stays a step apart
    blueLink: "rgb(108, 172, 236)",      // link blue on the dark page is lightened
    bodyLink: "rgb(108, 172, 236)",      // also straight on <body>
    tokBg: SURFACE, tokText: TEXT, tokBorder: BORDER, // Canvas Kit tokens redefined in workday.css
    tokMarks: "",                        // so the script had nothing to fix
    stripPopBg: SURFACE,                 // a white pop-up with a tiled strip image is darkened
    photoBoxBg: "rgb(255, 255, 255)",    // a cover-sized image is a photo: left alone
    blueRowText: "rgb(255, 255, 255)",   // grey text on a blue selected row: white (theme text falls short)
    blueChipText: "rgb(255, 255, 255)",  // white on a bright blue chip stays white
    olCardOutline: BORDER,               // a light grey outline gets the border color
    selItemBg: "color(srgb 0.304 0.289647 0.336235)", // a pale-tinted selected item keeps a tint
    hammyEdge: `${BORDER} 0px 0px 0px 1px`, // a raised pop-up menu gets an outline
    outlineFill: "rgb(0, 0, 0)",         // its white stroke already draws it
    navBgFill: "none",                   // black only until the page's rule matched
    ringFill: "rgb(0, 0, 0)",            // invisible fill (fill-opacity 0) is left alone
    barBg: SURFACE,                      // fixed bar matching the page stays opaque
    popBg: SURFACE,                      // so does a pop-up menu
    sideBg: SURFACE, pillBg: SURFACE_2,  // a lighter box on a darkened one stays a step apart
    tintPillBg: SURFACE_2,               // a faint dark tint (selected item) shows as a raised step
    ringBtnBorder: "color(srgb 0.905882 0.894118 0.933333 / 0.35)", // a translucent dark outline: light at 35%
    halfBtnBorder: "color(srgb 0.905882 0.894118 0.933333 / 0.35)", // so is one at 51% (session popup buttons)
    hairBorder: BORDER,                  // a 12% divider gets the border color
    orgCardEdge: `${BORDER} 0px 0px 0px 1px`, // shadow-only card gets an outline
    orgLine: MUTED,                      // near-black connector line stays a visible line
    slowBg: SURFACE,                     // recolored at once, not faded from white over 3 s
    suggBg: SURFACE,                     // and a panel inside a floating wrapper
    lateText: TEXT,                      // text in a cell that was still fading out
    ruleBg: BORDER,                      // workday.css
    logoTinted: true,                    // workday.css
  },
  // Another institution's Workday tenant: not ours to restyle
  "other.html": { htmlClass: "" },
};
// Which host each page is served as (default moodle.lsu.edu)
const HOSTS = { "lsu/workday.html": "www.myworkday.com", "other.html": "www.myworkday.com" };
const ALL_HOSTS = ["moodle.lsu.edu", "www.myworkday.com"];
const pageUrl = (name, port) => `https://${HOSTS[name] || "moodle.lsu.edu"}${port ? `:${port}` : ""}/${name}`;
const EXTENSION_PAGES = ["editor.html", "follow.html", "card.html", "cache.html", "lsu/workday.html", "other.html"];
// (Not other.html: Playwright injects the userscript into every page, while a real
// userscript manager only runs it where its @match lines allow)
const USERSCRIPT_PAGES = ["editor.html", "follow.html", "card.html", "lsu/workday.html"];

// ---------- reporting ----------
let failures = 0;
function check(engine, name, actual, expected) {
  const bad = Object.entries(expected).filter(([k, v]) => actual?.[k] !== v);
  if (!bad.length) return console.log(`  ok   ${engine} ${name}`);
  failures++;
  console.log(`  FAIL ${engine} ${name}`);
  for (const [k, v] of bad) console.log(`         ${k}: expected ${JSON.stringify(v)}, got ${JSON.stringify(actual?.[k])}`);
}
function skipOrFail(engine, why) {
  if (CI) { failures++; console.log(`  FAIL ${engine}: ${why}`); }
  else console.log(`  skip ${engine}: ${why}`);
}
const parseResult = (text) => (text?.startsWith("RESULT ") ? JSON.parse(text.slice(7)) : null);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Polls until the page has posted its result; tolerates reloads (cache.html reloads itself)
async function waitResult(read, timeout = 15000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    try { const r = parseResult(await read()); if (r) return r; } catch { /* navigating */ }
    await sleep(200);
  }
  return null;
}

// ---------- local "moodle.lsu.edu" / "www.myworkday.com" over HTTPS ----------
const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".svg": "image/svg+xml" };
function pageFile(url) {
  const p = join(PAGES, new URL(url, "https://x").pathname.replace(/^\/+/, ""));
  return p.startsWith(PAGES) && existsSync(p) ? p : null;
}
function startServer() {
  const dir = mkdtempSync(join(tmpdir(), "lsu-dark-cert-"));
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
    "-subj", "/CN=moodle.lsu.edu", "-keyout", join(dir, "key.pem"), "-out", join(dir, "cert.pem")], { stdio: "ignore" });
  const server = createServer({ key: readFileSync(join(dir, "key.pem")), cert: readFileSync(join(dir, "cert.pem")) }, (req, res) => {
    const p = pageFile(req.url);
    if (!p) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { "Content-Type": TYPES[extname(p)] || "application/octet-stream" });
    res.end(readFileSync(p));
  });
  rmSync(dir, { recursive: true });
  return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server)));
}

// ---------- Hover (Playwright engines): :hover changes no DOM, so content.js listens ----------
const HOVER_EXPECT = {
  rowBefore: "rgba(0, 0, 0, 0)", rowText: TEXT,
  rowHovered: SURFACE_2, rowTextHovered: TEXT,   // light highlight -> raised color, text stays light
  goldTextHovered: "rgb(102, 68, 153)",          // gold highlight kept, text back to its own purple
  purpleHovered: "rgb(70, 29, 124)",             // a dark hover color is the page's own
  purpleSoonAfter: SURFACE,                      // fading back to light: dark again at once
  rowAfter: "rgba(0, 0, 0, 0)", goldTextAfter: "rgb(180, 160, 204)", // purple lightened to 7:1 on the page
};
async function checkHover(engine, page) {
  await page.goto(pageUrl("lsu/workday.html"));
  await waitResult(() => page.locator("#out").textContent());
  const read = () => page.evaluate(() => {
    const cs = (id) => getComputedStyle(document.getElementById(id));
    return { row: cs("hrow").backgroundColor, text: cs("htext").color, gold: cs("gtext").color };
  });
  const before = await read();
  await page.hover("#hrow"); await sleep(500);
  const onRow = await read();
  await page.hover("#grow"); await sleep(500);
  const onGold = await read();
  await page.hover("#prow"); await sleep(800);
  const purpleHovered = await page.evaluate(() => getComputedStyle(document.getElementById("prow")).backgroundColor);
  await page.hover("#hrow"); await sleep(150); // mid-way through the 0.6 s fade back
  const purpleSoonAfter = await page.evaluate(() => getComputedStyle(document.getElementById("prow")).backgroundColor);
  await page.mouse.move(600, 380); await sleep(500); // empty part of the page
  const after = await read();
  check(engine, "hover", {
    rowBefore: before.row, rowText: before.text, rowHovered: onRow.row, rowTextHovered: onRow.text,
    goldTextHovered: onGold.gold, rowAfter: after.row, goldTextAfter: after.gold,
    purpleHovered, purpleSoonAfter,
  }, HOVER_EXPECT);
}

// ---------- Chromium: the extension ----------
async function testChromium(port) {
  if (!existsSync(join(DIST.chrome, "manifest.json"))) return skipOrFail("chromium", "dist/build/chrome missing (run python build.py)");
  const profile = mkdtempSync(join(tmpdir(), "lsu-dark-chromium-"));
  // channel "chromium": the full browser, whose new headless mode can load extensions
  const ctx = await chromium.launchPersistentContext(profile, {
    channel: "chromium", headless: true, ignoreHTTPSErrors: true,
    args: [`--disable-extensions-except=${DIST.chrome}`, `--load-extension=${DIST.chrome}`,
      `--host-resolver-rules=${ALL_HOSTS.map((h) => `MAP ${h}:443 127.0.0.1:${port}`).join(", ")}`],
  });
  try {
    for (const name of EXTENSION_PAGES) {
      const page = await ctx.newPage();
      await page.goto(pageUrl(name));
      check("chromium", name, await waitResult(() => page.locator("#out").textContent()), EXPECT[name]);
      await page.close();
    }
    const hp = await ctx.newPage();
    await checkHover("chromium", hp);
    await hp.close();
  } finally {
    await ctx.close();
    rmSync(profile, { recursive: true, force: true });
  }
}

// ---------- Firefox: the extension, via geckodriver ----------
function findGeckodriver() {
  const candidates = [process.env.GECKOWEBDRIVER && join(process.env.GECKOWEBDRIVER, "geckodriver"), "geckodriver"].filter(Boolean);
  for (const c of candidates) {
    try { execFileSync(c, ["--version"], { stdio: "ignore" }); return c; } catch { /* next */ }
  }
  return null;
}
async function testFirefox(port) {
  if (!existsSync(DIST.firefoxZip)) return skipOrFail("firefox", `${DIST.firefoxZip} missing (run python build.py)`);
  const gd = findGeckodriver();
  if (!gd) return skipOrFail("firefox", "geckodriver not found");
  const gdPort = 4444 + Math.floor(Math.random() * 1000);
  const proc = spawn(gd, ["--port", String(gdPort)], { stdio: "ignore" });
  const base = `http://127.0.0.1:${gdPort}`;
  const call = async (method, path, body) => {
    const res = await fetch(base + path, { method, headers: { "Content-Type": "application/json" }, body: body && JSON.stringify(body) });
    const json = await res.json();
    if (!res.ok) throw new Error(`${path}: ${json.value?.message || res.status}`);
    return json.value;
  };
  let sid;
  try {
    for (let i = 0; i < 50 && !sid; i++) {
      try {
        sid = (await call("POST", "/session", { capabilities: { alwaysMatch: { acceptInsecureCerts: true, "moz:firefoxOptions": {
          args: ["-headless"], prefs: { "network.dns.localDomains": ALL_HOSTS.join(",") } } } } })).sessionId;
      } catch (e) { if (!String(e).includes("fetch failed")) throw e; await sleep(200); }
    }
    if (!sid) return skipOrFail("firefox", "geckodriver did not start");
    await call("POST", `/session/${sid}/moz/addon/install`, { addon: readFileSync(DIST.firefoxZip).toString("base64"), temporary: true });
    for (const name of EXTENSION_PAGES) {
      // Match patterns ignore the port, so the extension runs on moodle.lsu.edu:<port>
      await call("POST", `/session/${sid}/url`, { url: pageUrl(name, port) });
      const read = () => call("POST", `/session/${sid}/execute/sync`, { script: "return document.getElementById('out')?.textContent", args: [] });
      check("firefox", name, await waitResult(read), EXPECT[name]);
    }
  } catch (e) {
    failures++;
    console.log(`  FAIL firefox: ${e.message}`);
  } finally {
    if (sid) await call("DELETE", `/session/${sid}`).catch(() => {});
    proc.kill();
  }
}

// ---------- WebKit: the userscript on an emulated iPhone ----------
async function testWebKit() {
  if (!existsSync(DIST.userscript)) return skipOrFail("webkit", "dist/lsu-moodle-dark.user.js missing (run python build.py)");
  const browser = await webkit.launch();
  // `pre` runs before the userscript, like settings already saved from an earlier visit
  const newContext = async (opts = {}, pre) => {
    const ctx = await browser.newContext({ ...devices["iPhone 15"], ...opts });
    for (const host of ALL_HOSTS) {
      await ctx.route(`https://${host}/**`, (route) => {
        const p = pageFile(route.request().url());
        if (!p) return route.fulfill({ status: 404, body: "" });
        route.fulfill({ status: 200, contentType: TYPES[extname(p)], body: readFileSync(p) });
      });
    }
    if (pre) await ctx.addInitScript(pre);
    await ctx.addInitScript({ path: DIST.userscript }); // a manager injecting at document-start
    return ctx;
  };
  try {
    let ctx = await newContext();
    for (const name of USERSCRIPT_PAGES) {
      const page = await ctx.newPage();
      await page.goto(pageUrl(name));
      check("webkit", name, await waitResult(() => page.locator("#out").textContent()), EXPECT[name]);
      await page.close();
    }

    const hp = await ctx.newPage();
    await checkHover("webkit", hp);
    await hp.close();

    // No userscript-menu API here, as in the iOS Userscripts app: the floating button stands in
    const page = await ctx.newPage();
    await page.goto("https://moodle.lsu.edu/card.html");
    const btn = page.locator('button[aria-label^="Toggle dark mode"]');
    await btn.waitFor({ timeout: 5000 }).catch(() => {});
    const before = await page.evaluate(() => document.documentElement.className);
    if (await btn.count()) await btn.tap();
    await sleep(300);
    const after = await page.evaluate(() => document.documentElement.className);
    check("webkit", "floating button", { buttons: await btn.count(), before, after }, { buttons: 1, before: "lsu-dark", after: "" });
    await ctx.close();

    // Auto mode: follows the system scheme, including a live switch
    const auto = () => localStorage.setItem("lsu-moodle-dark", JSON.stringify({ enabled: true, auto: true }));
    ctx = await newContext({ colorScheme: "light" }, auto);
    const p = await ctx.newPage();
    await p.goto("https://moodle.lsu.edu/card.html");
    await sleep(500);
    const onLight = await p.evaluate(() => document.documentElement.className);
    await p.emulateMedia({ colorScheme: "dark" });
    await sleep(500);
    const onDark = await p.evaluate(() => document.documentElement.className);
    check("webkit", "auto mode", { onLight, onDark }, { onLight: "", onDark: "lsu-dark" });
    await ctx.close();

    // AMOLED: the same Workday page, with the true-black palette
    const amoled = () => localStorage.setItem("lsu-moodle-dark", JSON.stringify({ enabled: true, amoled: true }));
    ctx = await newContext({}, amoled);
    const a = await ctx.newPage();
    await a.goto(pageUrl("lsu/workday.html"));
    check("webkit", "amoled lsu/workday.html", await waitResult(() => a.locator("#out").textContent()), {
      htmlClass: "lsu-amoled lsu-dark",
      pageBg: "rgb(0, 0, 0)",            // pixels off
      cardBg: "rgb(11, 10, 15)",         // AMOLED surface
      cardText: TEXT,
      iconFill: TEXT,
      lateText: TEXT,
      ruleBg: "rgb(44, 40, 54)",         // AMOLED border
      barBg: "rgb(11, 10, 15)",
      bodyLink: "rgb(108, 172, 236)",    // judged against the dark page, not AMOLED black
    });
    await ctx.close();
  } finally {
    await browser.close();
  }
}

// ---------- main ----------
const ENGINES = { chromium: testChromium, firefox: testFirefox, webkit: testWebKit };
const wanted = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(ENGINES);
const server = await startServer();
const { port } = server.address();
try {
  for (const name of wanted) {
    if (!ENGINES[name]) { failures++; console.log(`unknown engine ${name}`); continue; }
    console.log(name);
    try { await ENGINES[name](port); }
    catch (e) {
      // A browser that can't start (not installed, missing libraries) is a skip locally
      if (/Executable doesn't exist|Host system is missing|error while loading shared libraries/.test(e.message)) skipOrFail(name, e.message.split("\n")[0]);
      else { failures++; console.log(`  FAIL ${name}: ${e.message.split("\n")[0]}`); }
    }
  }
} finally {
  server.close();
}
console.log(failures ? `\n${failures} failure(s)` : "\nall passed");
process.exit(failures ? 1 : 0);
