# LSU Moodle Dark

A dark mode for [LSU Moodle](https://moodle.lsu.edu) (Snap theme), with LSU purple and gold accents. It comes as a browser extension for Chrome-family browsers and Firefox (desktop and Android), and as a userscript for Safari and other mobile browsers.

> Unofficial student project, not affiliated with or endorsed by Louisiana State University. It only changes how Moodle looks in your own browser. It sends no data anywhere and stores just your on/off and AMOLED settings.

## Features

- Dark theme for pages, cards, drawers, menus, forms, tables, messaging, forums, quizzes, the calendar and the TinyMCE text editor
- **Auto mode:** follows your system's light/dark setting, so Moodle switches when your OS does
- **AMOLED mode:** a true-black page, so pixels switch off on OLED phone and laptop screens
- LSU-gold logo, gold keyboard-focus ring and gold "Highlighted" section tag
- Contrast safety net: anything the stylesheet misses is detected at runtime. Light backgrounds are darkened, light-gray borders are toned down, and any text below WCAG AA (4.5:1) is fixed. Grays map to the theme's text colors, and colored text is lightened to 7:1 while keeping its hue
- Mobile toolbar color follows the theme (`theme-color`)
- Only runs on `moodle.lsu.edu`, and the extension requests no permissions beyond `storage`

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
4. Refresh Moodle. Use the toolbar popup to set **Dark mode** (Off, On or Auto) and **AMOLED black**.

After changing any file, click the reload icon on the extension's card, then refresh Moodle.

## Install: Firefox

- **To try it:** open `about:debugging#/runtime/this-firefox`, click **Load Temporary Add-on** and pick `dist/build/firefox/manifest.json`. It stays until Firefox restarts.
- **To keep it:** Firefox only installs signed add-ons permanently. Upload `dist/lsu-moodle-dark-<version>-firefox.zip` to [addons.mozilla.org](https://addons.mozilla.org/developers/), either listed (public, and installable on Firefox for Android) or unlisted (you get a signed `.xpi` to install yourself). `npx web-ext sign --channel=unlisted` does the unlisted route from the command line, using AMO API keys.
- Needs Firefox 140 or later (Firefox for Android 142). If the theme doesn't apply, open the add-on's **Permissions** tab in `about:addons` and make sure access to `moodle.lsu.edu` is on.

## Install: Safari and mobile userscript

Safari, and Chrome on Android and iOS, don't run these extensions, so use the userscript: [`dist/lsu-moodle-dark.user.js`](dist/lsu-moodle-dark.user.js).

| Platform | How |
| --- | --- |
| macOS / iOS / iPadOS Safari | The **Userscripts** app (free, App Store), then add the file to its scripts folder |
| Android | Firefox can use the extension (above). Otherwise: Firefox or a Chromium browser with extension support (Lemur, Quetta) + **Violentmonkey** or **Tampermonkey**, then open the userscript's raw GitHub URL to install it |

The userscript updates itself from this repo. Toggles: with Violentmonkey or Tampermonkey, open the add-on's menu on a Moodle page and choose **Toggle dark mode**, **Toggle AMOLED black** or **Toggle follow system (Auto)**. Where a manager has no menu (iOS Userscripts), a small ◐ button appears in the bottom-left corner: tap to switch dark mode, long-press for AMOLED. The userscript doesn't reach the text editor's iframe, so that box stays light.

A native Safari extension is possible but needs a Mac with Xcode (`xcrun safari-web-extension-converter dist/build/chrome`) and an Apple developer account to distribute, so it isn't built here.

All versions need a browser from 2023 or later (CSS nesting: Chrome 120, Firefox 117, Safari 17.2).

## How it works

| File | Purpose |
| --- | --- |
| `dark.css` | Theme rules, all nested under `html.lsu-dark` so the toggle can switch them off. The palette is CSS variables, and `html.lsu-amoled` swaps in the true-black set |
| `content.js` | Adds the `lsu-dark` class at `document_start` (no white flash), then scans computed styles to fix leftover light backgrounds, borders and low-contrast text, including content Moodle loads later |
| `popup.html` / `popup.js` | Toolbar toggles, saved in `chrome.storage.sync`. `content.js` also keeps a copy in the site's localStorage, read synchronously at page start so the page never flashes the wrong theme |
| `build.py` | Builds the Chromium and Firefox packages (the Firefox one adds its add-on ID and data-consent settings to the manifest), and generates `dist/lsu-moodle-dark.user.js` from `dark.css` + `content.js`, with a shim that replaces `chrome.storage` (localStorage) and the popup (menu commands or a floating button) |
| `tests/` | Browser tests: small pages that imitate parts of moodle.lsu.edu, run against the extension in Chromium and Firefox and the userscript in WebKit (Safari's engine, on an emulated iPhone) |
| `make_icons.py` | Draws `icons/` (original artwork: purple tile, gold crescent) |
| `store/` | Chrome Web Store screenshots, promo tile, `make_store_images.py`, and [`STORE_LISTING.md`](store/STORE_LISTING.md) with the dashboard text |

After editing `dark.css` or `content.js`, run `python build.py` (Python 3.10+). It regenerates the userscript and the store packages (`dist/lsu-moodle-dark-<version>-chrome.zip` and `-firefox.zip`, git-ignored). A GitHub Action lints the Firefox build, fails if the committed userscript doesn't match the sources, and runs the browser tests.

To run the browser tests locally (Node 18+; Firefox 140+ and `geckodriver` for the Firefox part):

```sh
python build.py
cd tests && npm ci && npx playwright install chromium webkit
node run.mjs            # or: node run.mjs chromium webkit
```

They cover the editor iframe, the contrast fixes, text following its background, the course-card quick links, the no-flash cache, and (userscript) the floating button and Auto mode. They use local test pages, not the real site, so check visual changes on Moodle itself too.

Notes on Moodle 4 and the Snap theme:

- LSU runs Moodle 4 with Open LMS's Snap theme. Snap did not adopt Moodle 4's course index or drawers, so the rules for those in `dark.css` are only a Boost fallback. The Snap rules are the ones that matter.
- Moodle 4's TinyMCE editor puts the text you type in a separate `about:blank` iframe. The manifest sets `match_about_blank` so the theme runs there too. TinyMCE rewrites that document after the script starts, so `content.js` re-applies its classes to the new `<html>`. Userscript managers generally don't run in these frames, so on mobile the editor's text area stays light.

- Snap has rules such as `.summary div[style] { border: inherit; padding: inherit }`, so `content.js` never adds a `style` attribute to an element that lacks one. It marks those elements with `data-dm-*` attributes, which are styled by generated high-specificity rules instead.
- Snap animates some background colors (`#page` has a 0.4s transition). Full-page scans briefly disable transitions, so they read final colors rather than mid-fade ones.

## Reporting issues

If something is still hard to read, open an issue with a screenshot and the page URL (remove any IDs you don't want to share).

## License

[MIT](LICENSE)
