const DEFAULTS = { enabled: true, auto: false, amoled: false }; // keep in sync with content.js
const modes = document.querySelectorAll('input[name="mode"]');
const autoNote = document.getElementById("auto-note");
const amoled = document.getElementById("amoled");
const amoledRow = document.getElementById("amoled-row");
const current = { ...DEFAULTS };

// The three-way mode maps onto two stored booleans, so older versions' settings still work
const modeOf = ({ enabled, auto }) => (!enabled ? "off" : auto ? "auto" : "on");

function render(changes) {
  Object.assign(current, changes);
  const mode = modeOf(current);
  modes.forEach((r) => { r.checked = r.value === mode; });
  autoNote.hidden = mode !== "auto";
  amoled.checked = current.amoled;
  amoled.disabled = !current.enabled;
  amoledRow.classList.toggle("disabled", !current.enabled);
}

chrome.storage.sync.get(DEFAULTS, render);

// Settings changed elsewhere (another window's popup, Chrome sync) while this is open
chrome.storage.onChanged.addListener((changes) => {
  const update = {};
  for (const k in DEFAULTS) if (changes[k]) update[k] = changes[k].newValue;
  render(update);
});

modes.forEach((r) => r.addEventListener("change", () => {
  const update = { enabled: r.value !== "off", auto: r.value === "auto" };
  chrome.storage.sync.set(update);
  render(update);
}));

amoled.addEventListener("change", () => {
  chrome.storage.sync.set({ amoled: amoled.checked });
  render({ amoled: amoled.checked });
});
