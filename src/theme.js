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
    }, 520);
  }
  document.documentElement.setAttribute('data-theme', theme);
  localStorage.setItem(STORAGE_KEY, theme);
  updateIcons(theme);
  updateLogos(theme);
  updateCapsuleSwitchers(theme);
  try {
    window.dispatchEvent(new CustomEvent('hv:themechange', { detail: { theme } }));
  } catch (_) {}
}

// ─── Update Capsule Switchers (Creators ↔ Brands) ───
export function updateCapsuleSwitchers(theme) {
  // Deduplicate any stray capsule wraps across the document
  const capsuleWraps = document.querySelectorAll('.home-theme-capsule-wrap');
  if (capsuleWraps.length > 1) {
    for (let i = 1; i < capsuleWraps.length; i++) {
      capsuleWraps[i].remove();
    }
  }

  const current = theme || document.documentElement.getAttribute('data-theme') || 'dark';
  const capsules = document.querySelectorAll('.theme-capsule-switcher');
  capsules.forEach(capsule => {
    capsule.setAttribute('data-active-theme', current);
    const buttons = capsule.querySelectorAll('.theme-capsule-btn');
    buttons.forEach(btn => {
      const val = btn.getAttribute('data-theme-value');
      const isActive = val === current;
      btn.classList.toggle('active', isActive);
      btn.setAttribute('aria-checked', isActive ? 'true' : 'false');
      btn.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });
  });
}
window.__hvUpdateCapsuleSwitchers = updateCapsuleSwitchers;

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

  // Bind slider capsule switchers (Creators ↔ Brands)
  const capsuleSwitchers = document.querySelectorAll('.theme-capsule-switcher');
  capsuleSwitchers.forEach(capsule => {
    capsule.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      const activeTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      const btn = e.target.closest('.theme-capsule-btn');
      if (btn) {
        const targetTheme = btn.getAttribute('data-theme-value');
        if (targetTheme && targetTheme !== activeTheme) {
          applyTheme(targetTheme, true);
        }
      } else {
        const nextTheme = activeTheme === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme, true);
      }
    });

    // Keyboard support: ArrowLeft / ArrowRight toggles between Creators and Brands
    capsule.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft' || e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        const activeTheme = document.documentElement.getAttribute('data-theme') || 'dark';
        const nextTheme = activeTheme === 'dark' ? 'light' : 'dark';
        applyTheme(nextTheme, true);
        const nextBtn = capsule.querySelector(`.theme-capsule-btn[data-theme-value="${nextTheme}"]`);
        nextBtn?.focus();
      }
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

// Delegated fallback listener for dynamically mounted switchers
if (typeof document !== 'undefined') {
  document.addEventListener('click', (e) => {
    const switcher = e.target.closest('.theme-capsule-switcher');
    if (!switcher) return;
    const activeTheme = document.documentElement.getAttribute('data-theme') || 'dark';
    const btn = e.target.closest('.theme-capsule-btn');
    if (btn) {
      const targetTheme = btn.getAttribute('data-theme-value');
      if (targetTheme && targetTheme !== activeTheme) {
        applyTheme(targetTheme, true);
      }
    } else {
      const nextTheme = activeTheme === 'dark' ? 'light' : 'dark';
      applyTheme(nextTheme, true);
    }
  });
}
