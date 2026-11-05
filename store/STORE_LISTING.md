# Chrome Web Store submission

Everything the [Developer Dashboard](https://chrome.google.com/webstore/devconsole) asks for, ready to paste.

## Package

Run `python build.py`, then upload `dist/lsu-moodle-dark-<version>-chrome.zip` (the same zip works for Edge Add-ons and Opera add-ons; Firefox uses `-firefox.zip` on addons.mozilla.org, with the same description). It contains only the runtime files (manifest, CSS, JS, popup, icons). Bump `version` in `manifest.json` before every re-upload: the store rejects a version it has already seen.

## Store listing tab

**Name** (from the manifest): LSU Dark Mode (Unofficial)

**Summary** (from the manifest, 132 characters max):
> Unofficial dark and AMOLED theme for LSU Moodle, Workday and myLSU, with automatic contrast fixes. Not affiliated with LSU.

**Description:**
```
A dark theme for LSU Moodle (moodle.lsu.edu), LSU Workday and the myLSU portal that is easy on the eyes at night.

• Dark mode for every part of Moodle: course pages, the contents sidebar, cards, menus, forms, grades, messages, forums, quizzes and the calendar
• Workday and myLSU too: the home pages, menus, data grids and icons
• Auto mode: follows your system's light/dark setting
• AMOLED black: a true-black background that switches off OLED pixels and saves battery
• Automatic contrast fixes: anything the theme doesn't cover (including content pasted by instructors) is detected and adjusted, so text stays readable (WCAG AA)
• Keeps the LSU look: gold logo and accents, purple highlights
• One-click toggle in the toolbar, no page reload needed

Privacy: the extension only runs on moodle.lsu.edu, LSU's Workday pages (myworkday.com/lsu) and mylsu.apps.lsu.edu, sends no data anywhere, and stores only your settings (dark mode off/on/auto, AMOLED on/off) with Chrome's sync storage.

Unofficial student project, not affiliated with or endorsed by Louisiana State University. Open source (MIT).
```

**Category:** Accessibility (or Productivity)
**Language:** English

**Graphics** (all in this folder):
| Asset | File |
| --- | --- |
| Store icon 128×128 | `../icons/icon-128.png` |
| Screenshots 1280×800 | `screenshot-1-light-vs-dark.png`, `screenshot-2-amoled.png`, `screenshot-3-dark.png`, `screenshot-4-workday.png` |
| Small promo tile 440×280 | `promo-small-440x280.png` |

## Privacy practices tab

**Single purpose:**
> Applies a dark (or true-black AMOLED) color theme to LSU's student websites: Moodle (moodle.lsu.edu), Workday (myworkday.com/lsu) and the myLSU portal (mylsu.apps.lsu.edu).

**Permission justification: `storage`:**
> Saves the user's two preferences (dark mode on/off and AMOLED on/off) so they persist across pages and browser restarts.

**Host permission justification (content scripts on `https://moodle.lsu.edu/*`, `https://*.myworkday.com/lsu/*`, `https://mylsu.apps.lsu.edu/*`):**
> The extension's stylesheets and script must run on these pages to recolor them. On myworkday.com it is limited to LSU's tenant path (/lsu/), so other institutions' Workday pages are untouched. It runs on no other site.

**Remote code:** No, I am not using remote code. (All code ships in the package; nothing is fetched or evaluated at runtime.)

**Data usage:** tick *none* of the data categories. The extension does not collect or transmit any user data. Then certify all three statements:
- I do not sell or transfer user data to third parties, outside of the approved use cases
- I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL:** not required when no user data is collected. If the form insists, link the README's privacy note on GitHub.

## Distribution tab

**Visibility:** Public, or *Unlisted* if you only want to share the link with classmates. Unlisted items don't appear in search but install the same way.

## Notes for review

- The name contains "LSU". Keep "(Unofficial)" and the "Not affiliated" line. Listings that look like they come from an institution can be rejected for impersonation.
- Don't upload screenshots that show your name, courses, grades or account details. Screenshots 1-3 are the public Moodle front page with the profile picture hidden; screenshot 4 is the Workday home page while its greeting read "Hi There" (no name) with no menus open. To regenerate them, replace `raw/*.jpg` and run `python store/make_store_images.py`.
- Updating from 1.2: version 1.3 adds two sites (Workday, myLSU). Chrome treats new sites as new permissions, so existing users see a prompt and the extension stays off until they accept it. Mention it in the release notes.
