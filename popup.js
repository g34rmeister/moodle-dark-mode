const toggle = document.getElementById("toggle");
const amoled = document.getElementById("amoled");
const amoledRow = document.getElementById("amoled-row");

function render(enabled) {
  amoled.disabled = !enabled;
  amoledRow.classList.toggle("disabled", !enabled);
}

chrome.storage.sync.get({ enabled: true, amoled: false }, (settings) => {
  toggle.checked = settings.enabled;
  amoled.checked = settings.amoled;
  render(settings.enabled);
});

toggle.addEventListener("change", () => {
  chrome.storage.sync.set({ enabled: toggle.checked });
  render(toggle.checked);
});

amoled.addEventListener("change", () => {
  chrome.storage.sync.set({ amoled: amoled.checked });
});
