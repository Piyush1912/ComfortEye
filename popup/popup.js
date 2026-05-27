// ─── Popup script ────────────────────────────────────────────────────────────

const STORAGE_KEY = 'ytDarkVideo_enabled';
const PRESET_KEY  = 'ytDarkVideo_preset';

const PRESETS = {
  invert: 'invert(1) hue-rotate(180deg) contrast(0.9) brightness(0.95)',
  sepia:  'invert(1) hue-rotate(180deg) sepia(0.4) contrast(0.9) brightness(0.9)',
  green:  'invert(1) hue-rotate(90deg) saturate(1.5) contrast(0.85) brightness(0.9)',
  blue:   'invert(1) hue-rotate(220deg) saturate(1.3) contrast(0.9) brightness(0.92)',
};

const toggle    = document.getElementById('mainToggle');
const card      = document.getElementById('mainCard');
const toggleIcon  = document.getElementById('toggleIcon');
const toggleTitle = document.getElementById('toggleTitle');
const toggleDesc  = document.getElementById('toggleDesc');
const presetBtns  = document.querySelectorAll('.preset-btn');

let currentEnabled = false;
let currentPreset  = 'invert';

// ── Sync UI to state ─────────────────────────────────────────────────────────

function updateUI() {
  toggle.checked = currentEnabled;

  if (currentEnabled) {
    card.classList.add('is-on');
    toggleIcon.textContent  = '🌙';
    toggleTitle.textContent = 'Dark Mode On';
    toggleDesc.textContent  = 'Jupyter backgrounds are now dark';
  } else {
    card.classList.remove('is-on');
    toggleIcon.textContent  = '☀️';
    toggleTitle.textContent = 'Dark Mode Off';
    toggleDesc.textContent  = 'White backgrounds on video';
  }

  presetBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.preset === currentPreset);
  });
}

// ── Send command to the active YouTube tab ───────────────────────────────────

async function sendToTab(message) {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try {
    await browser.tabs.sendMessage(tab.id, message);
  } catch (_) {
    // Tab may not have the content script loaded yet — safe to ignore
  }
}

// ── Event listeners ──────────────────────────────────────────────────────────

toggle.addEventListener('change', async () => {
  currentEnabled = toggle.checked;
  await browser.storage.local.set({
    [STORAGE_KEY]: currentEnabled,
    [PRESET_KEY]:  currentPreset,
  });
  updateUI();
  sendToTab({ type: 'SET_STATE', enabled: currentEnabled, preset: currentPreset });
});

presetBtns.forEach((btn) => {
  btn.addEventListener('click', async () => {
    currentPreset = btn.dataset.preset;
    await browser.storage.local.set({ [PRESET_KEY]: currentPreset });
    updateUI();
    if (currentEnabled) {
      sendToTab({ type: 'SET_STATE', enabled: true, preset: currentPreset });
    }
  });
});

// ── Bootstrap: load saved state ──────────────────────────────────────────────

browser.storage.local.get([STORAGE_KEY, PRESET_KEY]).then((result) => {
  currentEnabled = !!result[STORAGE_KEY];
  currentPreset  = result[PRESET_KEY] || 'invert';
  updateUI();
});
