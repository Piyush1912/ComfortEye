// ─── YT Dark Video – content.js ────────────────────────────────────────────
// Applies filters to the YouTube video element so that white Jupyter/slide
// backgrounds become dark while keeping other colours (people, objects) sane.

const STORAGE_KEY = 'ytDarkVideo_enabled';
const FILTER_NONE = '';
const SVG_NS      = 'http://www.w3.org/2000/svg';

let enabled      = false;
let currentPreset = 'smart';
let btn          = null;

// ── SVG Filter injection ─────────────────────────────────────────────────────
// We inject an invisible SVG containing filter definitions into the page.
// The video then references them via  filter: url(#ytdv-filter-smart).
// Everything runs GPU-side — zero CPU, zero ML, ~1% GPU on M4.

function injectSVGFilters() {
  if (document.getElementById('ytdv-svg-filters')) return;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.id = 'ytdv-svg-filters';
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svg.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;';

  // ── How the "smart" filter works ───────────────────────────────────────────
  //  Step 1 – make a fully inverted copy of the frame
  //  Step 2 – extract luminance as an alpha channel (bright = high alpha)
  //  Step 3 – steep linear curve:  lum < 0.75 → alpha 0  (untouched)
  //                                lum 0.75–0.83 → 0–1   (soft transition)
  //                                lum > 0.83 → alpha 1   (fully inverted)
  //  Step 4 – use that alpha as a mask on the inverted image
  //  Step 5 – composite masked-inverted ON TOP of original
  //
  //  Result: skin (lum ≈ 40-60%) → mask alpha = 0 → completely original ✅
  //          white bg  (lum ≈ 1.0) → mask alpha = 1 → dark             ✅
  //          light gray (lum ≈ 0.80) → mask alpha ≈ 0.6 → softly dark  ✅

  svg.innerHTML = `
    <defs>

      <!-- ★ SMART MODE: invert only near-white pixels ───────────────────── -->
      <filter id="ytdv-filter-smart"
              color-interpolation-filters="sRGB"
              x="0%" y="0%" width="100%" height="100%">

        <!-- Step 1: inverted copy -->
        <feColorMatrix in="SourceGraphic" type="matrix"
          values="-1  0  0  0  1
                   0 -1  0  0  1
                   0  0 -1  0  1
                   0  0  0  1  0"
          result="inv"/>

        <!-- Step 2: luminance → alpha (bright pixels = high alpha) -->
        <feColorMatrix in="SourceGraphic"
          type="luminanceToAlpha"
          result="lum"/>

        <!-- Step 3: steep curve — only lum > 0.75 gets a non-zero alpha.
             slope=12, intercept=-9  →  threshold at lum = 0.75
             fully opaque at lum ≈ 0.83                                   -->
        <feComponentTransfer in="lum" result="mask">
          <feFuncA type="linear" slope="12" intercept="-9"/>
        </feComponentTransfer>

        <!-- Step 4: apply mask to inverted image -->
        <feComposite in="inv" in2="mask" operator="in" result="inv_masked"/>

        <!-- Step 5: composite masked-invert over original
             Where mask=0 (person/objects): original shines through
             Where mask=1 (white bg): inverted (dark) layer covers         -->
        <feComposite in="inv_masked" in2="SourceGraphic" operator="over"/>
      </filter>

      <!-- FULL INVERT (classic mode) ────────────────────────────────────── -->
      <filter id="ytdv-filter-invert"
              color-interpolation-filters="sRGB"
              x="0%" y="0%" width="100%" height="100%">
        <feColorMatrix type="matrix"
          values="-1  0  0  0  1
                   0 -1  0  0  1
                   0  0 -1  0  1
                   0  0  0  1  0"/>
      </filter>

      <!-- WARM SMART MODE: smart + gentle warm tint on the dark areas ──── -->
      <filter id="ytdv-filter-warm"
              color-interpolation-filters="sRGB"
              x="0%" y="0%" width="100%" height="100%">

        <!-- Invert with warm bias: dark areas lean amber instead of cold black -->
        <feColorMatrix in="SourceGraphic" type="matrix"
          values="-0.95  0      0     0  0.18
                   0    -0.95   0     0  0.14
                   0     0     -0.95  0  0.08
                   0     0      0     1  0"
          result="inv_warm"/>

        <feColorMatrix in="SourceGraphic" type="luminanceToAlpha" result="lum"/>
        <feComponentTransfer in="lum" result="mask">
          <feFuncA type="linear" slope="12" intercept="-9"/>
        </feComponentTransfer>
        <feComposite in="inv_warm" in2="mask" operator="in" result="inv_masked"/>
        <feComposite in="inv_masked" in2="SourceGraphic" operator="over"/>
      </filter>

    </defs>
  `;

  document.documentElement.appendChild(svg);
}

// ── Preset filter values ─────────────────────────────────────────────────────

const PRESETS = {
  // SVG-based (per-pixel selective)
  smart:  'url(#ytdv-filter-smart)',   // ★ default: only inverts near-white
  warm:   'url(#ytdv-filter-warm)',    // smart + warm dark tint
  // CSS-based (whole-video)
  invert: 'invert(1) hue-rotate(180deg) contrast(0.9) brightness(0.95)',
  green:  'invert(1) hue-rotate(90deg) saturate(1.5) contrast(0.85) brightness(0.9)',
  blue:   'invert(1) hue-rotate(220deg) saturate(1.3) contrast(0.9) brightness(0.92)',
};

// ── Helpers ──────────────────────────────────────────────────────────────────

// Instead of setting video.style.filter (which YouTube's player constantly
// resets via its own JS), we inject a <style> tag with !important rules.
// A stylesheet rule with !important cannot be overridden by inline JS styles.
let filterStyleEl = null;

function applyFilter(val) {
  // SVG filters need the defs present in the DOM first
  if (val && val.startsWith('url(')) injectSVGFilters();

  if (!filterStyleEl) {
    filterStyleEl = document.createElement('style');
    filterStyleEl.id = 'ytdv-filter-style';
    document.head.appendChild(filterStyleEl);
  }

  if (val) {
    // Broad selectors cover: regular YouTube player, Shorts, and any other video
    filterStyleEl.textContent = `
      #movie_player video,
      ytd-shorts video,
      ytd-reel-video-renderer video,
      .html5-video-container video,
      video.html5-main-video {
        filter: ${val} !important;
        transition: filter 0.4s ease !important;
      }
    `;
  } else {
    filterStyleEl.textContent = '';
  }
}

function setEnabled(state) {
  enabled = state;
  applyFilter(enabled ? (PRESETS[currentPreset] || PRESETS.smart) : FILTER_NONE);
  updateButton();
  browser.storage.local.set({ [STORAGE_KEY]: enabled });
}

function updateButton() {
  if (!btn) return;
  if (enabled) {
    btn.classList.add('ytdv-active');
    btn.title = 'Dark Video: ON — click to turn off';
    btn.querySelector('.ytdv-icon').textContent  = '🌙';
    btn.querySelector('.ytdv-label').textContent = 'Dark Video ON';
  } else {
    btn.classList.remove('ytdv-active');
    btn.title = 'Dark Video: OFF — click to enable';
    btn.querySelector('.ytdv-icon').textContent  = '☀️';
    btn.querySelector('.ytdv-label').textContent = 'Dark Video';
  }
}

// ── Button injection ─────────────────────────────────────────────────────────

function injectButton() {
  if (document.getElementById('ytdv-btn')) return;

  const controls = document.querySelector('.ytp-right-controls');
  if (!controls) return;

  btn = document.createElement('button');
  btn.id        = 'ytdv-btn';
  btn.className = 'ytp-button ytdv-btn';
  btn.title     = 'Dark Video: OFF';
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

// ── SPA navigation re-apply ──────────────────────────────────────────────────

function onNavigate() {
  setTimeout(() => {
    injectButton();
    if (enabled) applyFilter(PRESETS[currentPreset] || PRESETS.smart);
  }, 1500);
}

let lastUrl = location.href;
const urlObserver = new MutationObserver(() => {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    onNavigate();
  }
});
urlObserver.observe(document.body, { childList: true, subtree: true });

const controlsObserver = new MutationObserver(() => {
  if (!document.getElementById('ytdv-btn')) {
    injectButton();
    if (enabled) applyFilter(PRESETS[currentPreset] || PRESETS.smart);
  }
});
controlsObserver.observe(document.documentElement, { childList: true, subtree: true });

// ── Keyboard shortcut: Alt+D ─────────────────────────────────────────────────

document.addEventListener('keydown', (e) => {
  if (e.altKey && e.key.toLowerCase() === 'd') setEnabled(!enabled);
});

// ── Popup messages ───────────────────────────────────────────────────────────

browser.runtime.onMessage.addListener((msg) => {
  if (msg.type === 'SET_STATE') {
    currentPreset = msg.preset || 'smart';
    enabled       = msg.enabled;
    applyFilter(enabled ? (PRESETS[currentPreset] || PRESETS.smart) : FILTER_NONE);
    updateButton();
  }
});

// ── Bootstrap ────────────────────────────────────────────────────────────────

const PRESET_KEY = 'ytDarkVideo_preset';

browser.storage.local.get([STORAGE_KEY, PRESET_KEY]).then((result) => {
  enabled       = !!result[STORAGE_KEY];
  currentPreset = result[PRESET_KEY] || 'smart';
  injectSVGFilters(); // pre-inject so filters are ready immediately
  injectButton();
  if (enabled) applyFilter(PRESETS[currentPreset] || PRESETS.smart);
});
