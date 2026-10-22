/**
 * HIGHVERZ — Premium Dual-Theme Engine
 * "The Studio" (Light) ↔ "After Hours" (Dark)
 * 
 * Features:
 * - Cinematic radial transition overlay from theme button position
 * - localStorage persistence + system preference detection
 * - Logo swap (dark ↔ light variants)
 * - SVG Sun/Moon icon animation
 * - prefers-reduced-motion aware
 * - FOUC prevention (inline script in <head> handles initial state)
 */

const STORAGE_KEY = 'highverz-theme';
// ─── Get saved or system theme ───
function getInitialTheme() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

// ─── Apply theme to DOM ───
let themeTransitionTimer = null;

function applyTheme(theme, animate = false) {
  if (animate) {
    const root = document.documentElement;
    root.classList.remove('theme-target-light', 'theme-target-dark');
    root.classList.add('theme-switching', theme === 'light' ? 'theme-target-light' : 'theme-target-dark');
    if (themeTransitionTimer) window.clearTimeout(themeTransitionTimer);
    themeTransitionTimer = window.setTimeout(() => {
      root.classList.remove('theme-switching', 'theme-target-light', 'theme-target-dark');
      themeTransitionTimer = null;
    }, 760);
  }
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(STORAGE_KEY, theme);
  updateIcons(theme);
  updateLogos(theme);
  try {
    window.dispatchEvent(new CustomEvent('hv:themechange', { detail: { theme } }));
  } catch (_) {}
}

// ─── Update Sun / Moon icon visibility ───
function updateIcons(theme) {
  const sunIcons = document.querySelectorAll('.theme-icon-sun');
  const moonIcons = document.querySelectorAll('.theme-icon-moon');

  sunIcons.forEach(icon => {
    icon.style.opacity = theme === 'light' ? '1' : '0';
    icon.style.transform = theme === 'light' ? 'rotate(0deg) scale(1)' : 'rotate(-90deg) scale(0.5)';
  });
  moonIcons.forEach(icon => {
    icon.style.opacity = theme === 'dark' ? '1' : '0';
    icon.style.transform = theme === 'dark' ? 'rotate(0deg) scale(1)' : 'rotate(90deg) scale(0.5)';
  });
}

// ─── Swap nav and footer logos based on theme ───
export function updateLogos(theme) {
  const currentTheme = theme || document.documentElement.getAttribute('data-theme') || 'dark';
  const navLogos = document.querySelectorAll('.nav-brand-logo-img');
  navLogos.forEach(logo => {
    if (currentTheme === 'light') {
      logo.src = logo.src.replace(/logo-(white|cyan)\.(png|svg)/, 'logo-light.png');
    } else {
      logo.src = logo.src.replace(/logo-(light|cyan)\.(png|svg)/, 'logo-white.png');
    }
  });

  // Also swap footer logos if they exist
  const footerLogos = document.querySelectorAll('.footer-logo-img');
  footerLogos.forEach(logo => {
    if (currentTheme === 'light') {
      logo.src = logo.src.replace(/logo-(white|cyan)\.(png|svg)/, 'logo-light.png');
    } else {
      logo.src = logo.src.replace(/logo-(light|cyan)\.(png|svg)/, 'logo-white.png');
    }
  });

  // Swap watermark logo in footer
  const watermarkLogos = document.querySelectorAll('.footer-watermark-logo img');
  watermarkLogos.forEach(logo => {
    if (currentTheme === 'light') {
      logo.src = logo.src.replace(/logo-(cyan|white)\.(png|svg)/, 'logo-light.svg');
    } else {
      logo.src = logo.src.replace(/logo-(light|white)\.(png|svg)/, 'logo-cyan.svg');
    }
  });
}

// ─── Toggle Theme ───
function toggleTheme(button) {
  const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

  // Simple, immediate theme change. CSS transitions handle the smooth
  // crossfade for the scene, materials, controls, and background.
  applyTheme(newTheme, true);
}

// ─── Initialize Theme System ───
export function initThemeSystem() {
  // Apply initial theme (FOUC script in <head> should have already set data-theme,
  // but this ensures icons and logos are synced)
  const currentTheme = document.documentElement.getAttribute('data-theme') || getInitialTheme();
  applyTheme(currentTheme);

  // Bind all theme switcher buttons (one per page, but safe for multiples)
  const switchers = document.querySelectorAll('.theme-switcher');
  switchers.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggleTheme(btn);
    });
  });

  // Listen for system preference changes
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', (e) => {
    // Only auto-switch if user hasn't manually set a preference
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) {
      applyTheme(e.matches ? 'light' : 'dark', true);
    }
  });
}
