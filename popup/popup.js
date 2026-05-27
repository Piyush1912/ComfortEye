// ─── Popup script ─────────────────────────────────────────────────────────

const STORAGE_KEY = 'ytDarkVideo_enabled';
const PRESET_KEY  = 'ytDarkVideo_preset';

// Must match content.js PRESETS keys
const SMART_PRESETS = new Set(['smart', 'warm']); // SVG per-pixel modes
const PRESET_DESCS  = {
  smart:  'Only whites inverted · People untouched',
  warm:   'Smart + warm amber tint on dark areas',
  invert: 'Full video inverted · Classic mode',
  green:  'Full invert with green matrix tint',
  blue:   'Full invert with cool blue tint',
};
const PRESET_TITLES = {
  smart:  'Smart Mode On',
  warm:   'Warm Smart Mode On',
  invert: 'Full Invert On',
  green:  'Matrix Mode On',
  blue:   'Cool Mode On',
};

const toggle      = document.getElementById('mainToggle');
const card        = document.getElementById('mainCard');
const toggleIcon  = document.getElementById('toggleIcon');
const toggleTitle = document.getElementById('toggleTitle');
const toggleDesc  = document.getElementById('toggleDesc');
const smartBanner = document.getElementById('smartBanner');
const presetBtns  = document.querySelectorAll('.preset-btn');

let currentEnabled = false;
let currentPreset  = 'smart';

// ── UI update ────────────────────────────────────────────────────────────────

function updateUI() {
  toggle.checked = currentEnabled;

  if (currentEnabled) {
    card.classList.add('is-on');
    toggleIcon.textContent  = '🌙';
    toggleTitle.textContent = PRESET_TITLES[currentPreset] || 'Dark Mode On';
    toggleDesc.textContent  = PRESET_DESCS[currentPreset]  || '';
  } else {
    card.classList.remove('is-on');
    toggleIcon.textContent  = '☀️';
    toggleTitle.textContent = 'Dark Mode Off';
    toggleDesc.textContent  = 'White backgrounds on video';
  }

  // Smart banner: visible only when on + smart/warm preset
  const showBanner = currentEnabled && SMART_PRESETS.has(currentPreset);
  smartBanner.classList.toggle('visible', showBanner);

  // Preset active states
  presetBtns.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.preset === currentPreset);
  });
}

// ── Send state to the active YouTube tab ─────────────────────────────────────

async function sendToTab(message) {
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) return;
  try { await browser.tabs.sendMessage(tab.id, message); } catch (_) {}
}

// ── Events ───────────────────────────────────────────────────────────────────

toggle.addEventListener('change', async () => {
  currentEnabled = toggle.checked;
  await browser.storage.local.set({ [STORAGE_KEY]: currentEnabled, [PRESET_KEY]: currentPreset });
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

// ── Bootstrap ─────────────────────────────────────────────────────────────────

browser.storage.local.get([STORAGE_KEY, PRESET_KEY]).then((result) => {
  currentEnabled = !!result[STORAGE_KEY];
  currentPreset  = result[PRESET_KEY] || 'smart';
  updateUI();
});
