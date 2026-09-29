# LSU Moodle Dark

A dark mode for [LSU Moodle](https://moodle.lsu.edu) (Snap theme), with LSU purple and gold accents. It comes as a Chrome extension for desktop and a userscript for mobile.

> Unofficial student project, not affiliated with or endorsed by Louisiana State University. It only changes how Moodle looks in your own browser. It sends no data anywhere and stores just your on/off and AMOLED settings.

## Features

- Dark theme for pages, cards, drawers, menus, forms, tables, messaging, forums, quizzes and the calendar
- **AMOLED mode:** a true-black page, so pixels switch off on OLED phone and laptop screens
- LSU-gold logo, gold keyboard-focus ring and gold "Highlighted" section tag
- Contrast safety net: anything the stylesheet misses is detected at runtime. Light backgrounds are darkened, light-gray borders are toned down, and any text below WCAG AA (4.5:1) is fixed. Grays map to the theme's text colors, and colored text is lightened to 7:1 while keeping its hue
- Mobile toolbar color follows the theme (`theme-color`)
- Only runs on `moodle.lsu.edu`, and the extension requests no permissions beyond `storage`

## Install: desktop (Chrome, Edge, Brave, Opera, Vivaldi)

1. Download or clone this repo.
2. Go to `chrome://extensions` and turn on **Developer mode** (top right).
3. Click **Load unpacked** and select this folder.
4. Refresh Moodle. Use the toolbar popup to switch **Dark mode** and **AMOLED black**.

After changing any file, click the reload icon on the extension's card, then refresh Moodle.

## Install: mobile

Chrome for Android and iOS doesn't support extensions, so on phones use the userscript: [`dist/lsu-moodle-dark.user.js`](dist/lsu-moodle-dark.user.js).

| Platform | How |
| --- | --- |
| Android | Firefox + the **Violentmonkey** or **Tampermonkey** add-on, then open the userscript's raw GitHub URL to install it |
| Android (Chromium) | A Chromium-based browser that supports extensions (for example Lemur or Quetta) + Tampermonkey |
| iOS / iPadOS | Safari + the **Userscripts** app (free, App Store), then add the file to its scripts folder |

Toggles: with Violentmonkey or Tampermonkey, open the add-on's menu on a Moodle page and choose **Toggle dark mode** or **Toggle AMOLED black**. Where a manager has no menu (iOS Userscripts), a small ◐ button appears in the bottom-left corner: tap to switch dark mode, long-press for AMOLED.

It needs a browser from 2023 or later (CSS nesting: Chrome 120, Firefox 117, Safari 17.2).

## How it works

| File | Purpose |
| --- | --- |
| `dark.css` | Theme rules, all nested under `html.lsu-dark` so the toggle can switch them off. The palette is CSS variables, and `html.lsu-amoled` swaps in the true-black set |
| `content.js` | Adds the `lsu-dark` class at `document_start` (no white flash), then scans computed styles to fix leftover light backgrounds, borders and low-contrast text, including content Moodle loads later |
| `popup.html` / `popup.js` | Toolbar toggles, saved in `chrome.storage.sync` |
| `build.py` | Generates `dist/lsu-moodle-dark.user.js` from `dark.css` + `content.js`, with a shim that replaces `chrome.storage` (localStorage) and the popup (menu commands or a floating button) |

| `make_icons.py` | Draws `icons/` (original artwork: purple tile, gold crescent) |
| `store/` | Chrome Web Store screenshots, promo tile, `make_store_images.py`, and [`STORE_LISTING.md`](store/STORE_LISTING.md) with the dashboard text |

After editing `dark.css` or `content.js`, run `python build.py`. It regenerates the userscript and the store package (`dist/lsu-moodle-dark-<version>.zip`, git-ignored).

Notes on the Snap theme:

- Snap has rules such as `.summary div[style] { border: inherit; padding: inherit }`, so `content.js` never adds a `style` attribute to an element that lacks one. It marks those elements with `data-dm-*` attributes, which are styled by generated high-specificity rules instead.
- Snap animates some background colors (`#page` has a 0.4s transition). Full-page scans briefly disable transitions, so they read final colors rather than mid-fade ones.

## Reporting issues

If something is still hard to read, open an issue with a screenshot and the page URL (remove any IDs you don't want to share).

## License

[MIT](LICENSE)
