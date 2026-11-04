# LSU Moodle Dark

A dark mode for [LSU Moodle](https://moodle.lsu.edu) (Snap theme), [LSU Workday](https://workday.lsu.edu) and the [myLSU portal](https://mylsu.apps.lsu.edu), with LSU purple and gold accents. It comes as a browser extension for Chrome-family browsers and Firefox (desktop and Android), and as a userscript for Safari and other mobile browsers.

> Unofficial student project, not affiliated with or endorsed by Louisiana State University. It only changes how these sites look in your own browser. It sends no data anywhere and stores just your on/off and AMOLED settings.

## Features

- Moodle: dark theme for pages, cards, drawers, menus, forms, tables, messaging, forums, quizzes, the calendar and the TinyMCE text editor
- Workday and myLSU: home pages, menus, data grids, buttons and icons, with the LSU wordmark in gold
- One setting for all three sites
- **Auto mode:** follows your system's light/dark setting, so the sites switch when your OS does
- **AMOLED mode:** a true-black page, so pixels switch off on OLED phone and laptop screens
- LSU-gold logo, gold keyboard-focus ring and gold "Highlighted" section tag
- Contrast safety net: anything the stylesheets miss is detected at runtime. Light backgrounds are darkened, light-gray borders are toned down, and any text below WCAG AA (4.5:1) or SVG icon below 3:1 is fixed. Grays map to the theme's text colors, and colored text is lightened to 7:1 while keeping its hue. Modern color syntax (Workday's `oklch()`) is understood
- Mobile toolbar color follows the theme (`theme-color`)
- Only runs on `moodle.lsu.edu`, `mylsu.apps.lsu.edu` and LSU's Workday tenant (`*.myworkday.com/lsu/*`, so other schools' Workday pages are untouched), and the extension requests no permissions beyond `storage`

## Which version to use

| Browser | Use |
| --- | --- |
| Chrome, Edge, Brave, Opera, Vivaldi (desktop) | The extension, Chromium build |
| Firefox (desktop and Android) | The extension, Firefox build |
| Safari (macOS, iOS, iPadOS) | The userscript, with the free **Userscripts** app |
| Chrome on Android or iOS, other mobile browsers | The userscript, with a userscript manager |

Run `python build.py` to make the builds: `dist/build/chrome/` and `dist/build/firefox/` (unpacked folders for testing) plus a store zip for each.

## Install: Chrome, Edge, Brave, Opera, Vivaldi

1. Download or clone this repo.
2. Open the extensions page (`chrome://extensions`, `edge://extensions`, `brave://extensions`, ...) and turn on **Developer mode**.
3. Click **Load unpacked** and select this folder (or `dist/build/chrome/`).
4. Refresh Moodle, Workday or myLSU. Use the toolbar popup to set **Dark mode** (Off, On or Auto) and **AMOLED black**.

After changing any file, click the reload icon on the extension's card, then refresh the site.

## Install: Firefox

- **To try it:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on** and pick `dist/build/firefox/manifest.json`. It stays until Firefox restarts.
- **To keep it:** Firefox only installs signed add-ons permanently. Upload `dist/lsu-moodle-dark-<version>-firefox.zip` to [addons.mozilla.org](https://addons.mozilla.org/developers/), either listed (public, and installable on Firefox for Android) or unlisted (you get a signed `.xpi` to install yourself). `npx web-ext sign --channel=unlisted` does the unlisted route from the command line, using AMO API keys.
- Needs Firefox 140 or later (Firefox for Android 142). If the theme doesn't apply, open the add-on's **Permissions** tab in `about:addons` and make sure access to `moodle.lsu.edu`, `myworkday.com` and `mylsu.apps.lsu.edu` is on (Firefox asks for each site separately).

## Install: Safari and mobile userscript

Safari, and Chrome on Android and iOS, don't run these extensions, so use the userscript: [`dist/lsu-moodle-dark.user.js`](dist/lsu-moodle-dark.user.js).

| Platform | How |
| --- | --- |
| macOS / iOS / iPadOS Safari | The **Userscripts** app (free, App Store), then add the file to its scripts folder |
| Android | Firefox can use the extension (above). Otherwise: Firefox or a Chromium browser with extension support (Lemur, Quetta) + **Violentmonkey** or **Tampermonkey**, then open the userscript's raw GitHub URL to install it |

The userscript updates itself from this repo. Toggles: with Violentmonkey or Tampermonkey, open the add-on's menu on one of the sites and choose **Toggle dark mode**, **Toggle AMOLED black** or **Toggle follow system (Auto)**. Where a manager has no menu (iOS Userscripts), a small ◐ button appears in the bottom-left corner: tap to switch dark mode, long-press for AMOLED. The userscript doesn't reach the text editor's iframe, so that box stays light.

A native Safari extension is possible but needs a Mac with Xcode (`xcrun safari-web-extension-converter dist/build/chrome`) and an Apple developer account to distribute, so it isn't built here.

All versions need a browser from 2023 or later (CSS nesting: Chrome 120, Firefox 117, Safari 17.2).

## How it works

| File | Purpose |
| --- | --- |
| `base.css` | Shared by all sites: the palette (CSS variables; `html.lsu-amoled` swaps in the true-black set), page base, placeholders, scrollbars. All rules are nested under `html.lsu-dark` so the toggle can switch them off |
| `moodle.css`, `workday.css`, `mylsu.css` | Each site's own rules, loaded after `base.css`. The manifest has one content-script entry per site |
| `content.js` | Adds the `lsu-dark` class at `document_start` (no white flash), then scans computed styles to fix leftover light backgrounds, borders, low-contrast text and SVG icons, including content the site loads later |
| `popup.html` / `popup.js` | Toolbar toggles, saved in `chrome.storage.sync`. `content.js` also keeps a copy in the site's localStorage, read synchronously at page start so the page never flashes the wrong theme |
| `build.py` | Builds the Chromium and Firefox packages (the Firefox one adds its add-on ID and data-consent settings to the manifest), and generates `dist/lsu-moodle-dark.user.js` from the stylesheets + `content.js` (it picks the site's stylesheet from the page URL), with a shim that replaces `chrome.storage` (localStorage) and the popup (menu commands or a floating button) |
| `tests/` | Browser tests: small pages that imitate parts of moodle.lsu.edu and Workday, run against the extension in Chromium and Firefox and the userscript in WebKit (Safari's engine, on an emulated iPhone) |
| `make_icons.py` | Draws `icons/` (original artwork: purple tile, gold crescent) |
| `store/` | Chrome Web Store screenshots, promo tile, `make_store_images.py`, and [`STORE_LISTING.md`](store/STORE_LISTING.md) with the dashboard text |

After editing a `.css` file or `content.js`, run `python build.py` (Python 3.10+). It regenerates the userscript and the store packages (`dist/lsu-moodle-dark-<version>-chrome.zip` and `-firefox.zip`, git-ignored). A GitHub Action lints the Firefox build, fails if the committed userscript doesn't match the sources, and runs the browser tests.

To run the browser tests locally (Node 18+; Firefox 140+ and `geckodriver` for the Firefox part):

```sh
python build.py
cd tests && npm ci && npx playwright install chromium webkit
node run.mjs            # or: node run.mjs chromium webkit
```

They cover the editor iframe, the contrast fixes, text following its background, the course-card quick links, the no-flash cache, Workday's `oklch()` colors, icons and late-loading grid rows, that other Workday tenants are left alone, and (userscript) the floating button and Auto mode. They use local test pages, not the real sites, so check visual changes on the sites themselves too.

Notes on Moodle 4 and the Snap theme:

- LSU runs Moodle 4 with Open LMS's Snap theme. Snap did not adopt Moodle 4's course index or drawers, so the rules for those in `moodle.css` are only a Boost fallback. The Snap rules are the ones that matter.
- Moodle 4's TinyMCE editor puts the text you type in a separate `about:blank` iframe. The manifest sets `match_about_blank` so the theme runs there too. TinyMCE rewrites that document after the script starts, so `content.js` re-applies its classes to the new `<html>`. Userscript managers generally don't run in these frames, so on mobile the editor's text area stays light.

- Snap has rules such as `.summary div[style] { border: inherit; padding: inherit }`, so `content.js` never adds a `style` attribute to an element that lacks one. It marks those elements with `data-dm-*` attributes, which are styled by generated high-specificity rules instead.
- Snap animates some background colors (`#page` has a 0.4s transition). Full-page scans briefly disable transitions, so they read final colors rather than mid-fade ones.

Notes on Workday and myLSU:

- Workday serves every customer from the same `myworkday.com` hosts, so the manifest matches only LSU's tenant path, `/lsu/`. Its class names are generated and change between releases, so `workday.css` hooks onto `data-automation-id` attributes instead, and leaves most of the work to `content.js`.
- Workday paints its grey page background on a full-window `<div>` rather than `<body>`. `content.js` treats a light box like that (filling most of the window, with nothing painted behind it, not fixed or absolute) as the page and gives it the page color rather than the card color, so cards stay distinct and AMOLED stays true black.
- Workday writes its colors as `oklch()`, which stays `oklch()` in computed styles. `content.js` converts such colors to RGB by painting a pixel on a canvas.
- Workday's grid cells and buttons have `transition: all`, so right after `content.js` darkens one, it still reads white. When judging text, `content.js` uses the color it set itself for backgrounds it changed, rather than the computed value.
- Workday's icons are inline SVGs (`.wd-icon-fill`), so the contrast pass also checks SVG `fill` and `stroke`. A shape whose other paint already stands out (a light outline around a dark interior) is left as it is.

## Reporting issues

If something is still hard to read, open an issue with a screenshot and the page URL (remove any IDs you don't want to share).

## License

[MIT](LICENSE)
