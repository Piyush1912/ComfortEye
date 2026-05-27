// ─── YT Dark Video – content.js ────────────────────────────────────────────
// Applies an invert+hue-rotate filter to the YouTube video element so that
// white Jupyter/slide backgrounds become dark while keeping other colours sane.

const STORAGE_KEY = 'ytDarkVideo_enabled';
const FILTER_DARK = 'invert(1) hue-rotate(180deg) contrast(0.9) brightness(0.95)';
const FILTER_NONE = '';

let enabled = false;
let btn = null;

// ── Helpers ─────────────────────────────────────────────────────────────────

function getVideo() {
  return document.querySelector('video.html5-main-video, video');
}

function applyFilter(val) {
  const video = getVideo();
  if (video) {
    video.style.filter = val;
    video.style.transition = 'filter 0.4s ease';
  }
}

function setEnabled(state) {
  enabled = state;
  applyFilter(enabled ? FILTER_DARK : FILTER_NONE);
  updateButton();
  browser.storage.local.set({ [STORAGE_KEY]: enabled });
}

function updateButton() {
  if (!btn) return;
  if (enabled) {
    btn.classList.add('ytdv-active');
    btn.title = 'Dark Video: ON — click to turn off';
    btn.querySelector('.ytdv-icon').textContent = '🌙';
    btn.querySelector('.ytdv-label').textContent = 'Dark Video ON';
  } else {
    btn.classList.remove('ytdv-active');
    btn.title = 'Dark Video: OFF — click to invert colours';
    btn.querySelector('.ytdv-icon').textContent = '☀️';
    btn.querySelector('.ytdv-label').textContent = 'Dark Video';
  }
}

// ── Button injection ─────────────────────────────────────────────────────────

function injectButton() {
  if (document.getElementById('ytdv-btn')) return;

  // Try to place it in the right-side controls area
  const controls = document.querySelector('.ytp-right-controls');
  if (!controls) return;

  btn = document.createElement('button');
  btn.id = 'ytdv-btn';
  btn.className = 'ytp-button ytdv-btn';
  btn.title = 'Dark Video: OFF';
  btn.setAttribute('aria-label', 'Toggle dark video mode');
  btn.innerHTML = `
    <span class="ytdv-icon">☀️</span>
    <span class="ytdv-label">Dark Video</span>
  `;

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    setEnabled(!enabled);
  });

  controls.prepend(btn);
  updateButton();
}

// ── Re-apply after YouTube SPA navigation ───────────────────────────────────

function onNavigate() {
  // Give YouTube time to render the new player
  setTimeout(() => {
    injectButton();
    if (enabled) applyFilter(FILTER_DARK);
  }, 1500);
}

// YouTube is a SPA — watch for URL changes
let lastUrl = location.href;
const urlObserver = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    onNavigate();
  }
});
urlObserver.observe(document.body, { childList: true, subtree: true });

// Also watch for the player controls to appear (they load asynchronously)
const controlsObserver = new MutationObserver(() => {
  if (!document.getElementById('ytdv-btn')) {
    injectButton();
    if (enabled) applyFilter(FILTER_DARK);
  }
});
controlsObserver.observe(document.documentElement, {
  childList: true,
  subtree: true,
});

// ── Keyboard shortcut: Alt+D ─────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  if (e.altKey && e.key.toLowerCase() === 'd') {
    setEnabled(!enabled);
  }
});

// ── Preset filters map (kept in sync with popup) ────────────────────────────

const PRESETS = {
  invert: 'invert(1) hue-rotate(180deg) contrast(0.9) brightness(0.95)',
  sepia:  'invert(1) hue-rotate(180deg) sepia(0.4) contrast(0.9) brightness(0.9)',
  green:  'invert(1) hue-rotate(90deg) saturate(1.5) contrast(0.85) brightness(0.9)',
  blue:   'invert(1) hue-rotate(220deg) saturate(1.3) contrast(0.9) brightness(0.92)',
};

let currentPreset = 'invert';

// ── Listen for popup messages ────────────────────────────────────────────────

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SET_STATE') {
    currentPreset = msg.preset || 'invert';
    enabled = msg.enabled;
    applyFilter(enabled ? (PRESETS[currentPreset] || FILTER_DARK) : FILTER_NONE);
    updateButton();
  }
});

// ── Bootstrap ────────────────────────────────────────────────────────────────

const PRESET_KEY = 'ytDarkVideo_preset';

browser.storage.local.get([STORAGE_KEY, PRESET_KEY]).then((result) => {
  enabled = !!result[STORAGE_KEY];
  currentPreset = result[PRESET_KEY] || 'invert';
  injectButton();
  if (enabled) applyFilter(PRESETS[currentPreset] || FILTER_DARK);
});
