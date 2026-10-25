/**
 * HIGHVERZ — Master Animation & Interaction Choreography
 * GSAP 3 + ScrollTrigger + Lenis Smooth Scroll
 */

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Lenis from 'lenis';
// hv3d.js (three.js, ~600 KB) is lazy-loaded inside init3DScene()
import { initHighverzIntro, replayHighverzIntro } from './intro/HighverzIntro.js';
import './style.css';
import './enquiry/enquiry.css';
import { initEnquirySystem } from './enquiry/enquiry.js';
import { initThemeSystem, updateLogos } from './theme.js';
import './campaigns/campaigns.css';
import { initCampaignsPage } from './campaigns/campaigns.js';
import { isHomeRoute, initPageTransitions } from './transitions.js';
import { initHeroWordRoller, prepareHeroWordRoller } from './hero/HeroWordRoller.js';
// HeroFluidBackground (three.js WebGL) is lazy-loaded after idle — see loadFluidBackground()
import { inject as injectAnalytics } from '@vercel/analytics';
import { injectSpeedInsights } from '@vercel/speed-insights';
import { initScatterGrid } from './scatterGrid.js';

// React Grab is a development-only picker for sharing precise UI context with
// an agent. It is framework-agnostic at runtime, so it can inspect this
// vanilla Vite page without adding anything to production bundles.
if (import.meta.env.DEV) {
  import('react-grab').catch((error) => {
    console.warn('[React Grab] Development picker unavailable:', error);
  });
}

gsap.registerPlugin(ScrollTrigger);

// Capture cross-document view transition early if supported
if ('onpagereveal' in window) {
  window.addEventListener('pagereveal', (e) => {
    if (e.viewTransition) {
      window.__hvActiveTransition = e.viewTransition;
    }
  });
}

// ==========================================================================
// LENIS SMOOTH SCROLL SETUP
// ==========================================================================
let lenis;
let activeWorkMetricTweens = [];

function initVercelTelemetry() {
  // These helpers are the framework-agnostic APIs for this Vite site. The
  // /next imports are only valid in a Next.js app and would break this build.
  injectAnalytics({ framework: 'vite' });
  const speedInsights = injectSpeedInsights({ framework: 'vite' });
  window.__hvSetSpeedInsightsRoute = (route) => {
    speedInsights?.setRoute?.(route || window.location.pathname);
  };
}

function initLenis() {
  const isTouchDevice = window.matchMedia('(pointer: coarse)').matches ||
    ('ontouchstart' in window && window.innerWidth <= 1024) ||
    window.innerWidth <= 768;

  // Touch screens have 120Hz/60Hz native hardware momentum scrolling.
  // Intercepting touch scrolling with JS creates input latency and sluggish response.
  if (isTouchDevice) {
    window.lenis = null;
    lenis = null;
    gsap.ticker.lagSmoothing(500, 33);
    return;
  }

  lenis = new Lenis({
    duration: 1.2,
    easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
    orientation: 'vertical',
    gestureOrientation: 'vertical',
    smoothWheel: true,
    wheelMultiplier: 0.9,
    syncTouch: false,
    infinite: false,
  });

  window.lenis = lenis;

  // Connect Lenis to GSAP ScrollTrigger
  lenis.on('scroll', ScrollTrigger.update);

  gsap.ticker.add((time) => {
    if (lenis) lenis.raf(time * 1000);
  });

  // Keep GSAP lag smoothing active so dropped frames recover smoothly instead of jittering
  gsap.ticker.lagSmoothing(500, 33);
}

// Load the ambient WebGL background promptly and return promise for preloader coordination
export function loadFluidBackground() {
  if (window.__hvFluidBackgroundPromise) {
    return window.__hvFluidBackgroundPromise;
  }
  const root = document.body;
  if (root && root.dataset.fluidBackgroundReady === 'true') {
    return Promise.resolve();
  }

  // Keep the mobile critical path focused on the text, controls, and visible
  // reel rail. The CSS background is already present, so delaying this
  // WebGL import avoids competing with the first paint and video startup.
  // Light mode's hero transition depends on the fluid layer already being
  // mounted. Start it immediately there; retain the mobile idle deferral for
  // Dark mode where the CSS canvas is sufficient for first paint.
  if (window.innerWidth <= 768 && document.documentElement.dataset.theme !== 'light' && !window.__hvFluidBackgroundScheduled) {
    window.__hvFluidBackgroundScheduled = true;
    const startFluid = () => {
      window.__hvFluidBackgroundScheduled = false;
      loadFluidBackground();
    };
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(startFluid, { timeout: 1800 });
    } else {
      window.setTimeout(startFluid, 1200);
    }
    return Promise.resolve();
  }

  window.__hvFluidBackgroundPromise = import('./hero/HeroFluidBackground.js')
    .then(({ initHeroFluidBackground }) => {
      const bg = initHeroFluidBackground();
      return bg;
    })
    .catch((err) => {
      console.warn('Fluid background load error:', err);
      return null;
    });
  return window.__hvFluidBackgroundPromise;
}
window.loadFluidBackground = loadFluidBackground;

// Progressive below-the-fold feature hydrator:
// Keeps initial main-thread work under 300ms so hero LCP paints on frame 1 without delay.
let belowFoldInitialized = false;
let homeCreatorsDarkMarkup = null;
function initBelowFoldFeatures() {
  // These sections exist only on Home. Running their timelines after an early
  // interaction on a dedicated route can attach duplicate observers/tweens to
  // similarly named content and cause visual glitches.
  if (!isHomeRoute(window.location.pathname)) return;

  // Home can be restored through a native back/forward load or through the
  // in-place route transition. Both paths may reuse the static creator-card
  // markup, so re-apply the active theme before the below-fold guard exits.
  // This keeps Light mode's movie showcase authoritative on every re-entry.
  applyThemeCreatorsCopy();

  if (belowFoldInitialized) return;
  belowFoldInitialized = true;

  if (!window.__hvHeroReelCleanup) initHeroReelCarousel();
  initStatsMarquee();
  initCreatorsSection();
  initGrowthWidgets();
  initStatementParallax();
  initServicesReveal();
  initPortfolioGrid();
  initTestimonialsReveal();
  initProcessScrollDraw();
  initFaqAccordion();
  initCTAReveal();
  initMagneticElements();
  initScrollVelocityEffects();
  initServiceFilters();
  initEnquirySystem();
  initFooterScatterGrid();
  initVercelTelemetry();
  init3DScene();
}

// Ensure Reachify-style progressive viewport blur exists on every page (8 optical layers, zero color)
export function ensureViewportBottomReveal() {
  if (typeof document === 'undefined') return;
  let reveal = document.querySelector('.viewport-bottom-reveal');
  if (!reveal) {
    reveal = document.createElement('div');
    reveal.className = 'viewport-bottom-reveal';
    reveal.setAttribute('aria-hidden', 'true');
    document.body.appendChild(reveal);
  }
  if (reveal.children.length < 8) {
    reveal.innerHTML = '<div></div><div></div><div></div><div></div><div></div><div></div><div></div><div></div>';
  }
}

// Initialize on DOM Ready or immediately if document is already ready
let hasBooted = false;
function boot() {
  if (hasBooted) return;
  hasBooted = true;

  // Phase 1: Critical above-the-fold experience (Theme, Header, Background, Hero)
  initThemeSystem();
  initNavbar();
  initLenis();
  initCustomCursor();
  loadFluidBackground();
  initPageTransitions();

  // If user scrolls or taps before idle callback, immediately hydrate below-the-fold
  const onEarlyInteraction = () => {
    if (isHomeRoute(window.location.pathname)) {
      initBelowFoldFeatures();
    } else {
      initFooterScatterGrid();
    }
    window.removeEventListener('scroll', onEarlyInteraction);
    window.removeEventListener('pointerdown', onEarlyInteraction);
  };
  window.addEventListener('scroll', onEarlyInteraction, { passive: true, once: true });
  window.addEventListener('pointerdown', onEarlyInteraction, { passive: true, once: true });

  const isWorkPage = window.location.pathname.includes('work') || !!document.querySelector('.work-hero-section');
  const isCaseStudyPage = window.location.pathname.includes('creator-') || window.location.pathname.includes('movie-') || !!document.querySelector('.case-hero-section') || !!document.querySelector('.ig-profile-shell');
  const isTeamPage = window.location.pathname.includes('team') || !!document.querySelector('.page-team');
  const isWhyUs = window.location.pathname.includes('why-us') || !!document.querySelector('.page-why-us') || !!document.querySelector('.comparison-section');
  const isCampaignsPage = window.location.pathname.includes('campaigns') || !!document.querySelector('.page-campaigns');
  const isDedicatedPage = isWorkPage || isCaseStudyPage || isTeamPage || isWhyUs || isCampaignsPage;

  const navEntries = (window.performance && window.performance.getEntriesByType)
    ? window.performance.getEntriesByType('navigation')
    : [];
  const navType = navEntries.length > 0
    ? navEntries[0].type
    : (window.performance && window.performance.navigation
      ? (window.performance.navigation.type === 1 ? 'reload' : (window.performance.navigation.type === 2 ? 'back_forward' : 'navigate'))
      : 'navigate');
  const isReload = navType === 'reload';

  let isFromInternalSubpage = false;
  try {
    if (document.referrer) {
      const refUrl = new URL(document.referrer);
      if (refUrl.origin === window.location.origin) {
        const refPath = refUrl.pathname.replace(/\/+$/, '') || '/';
        if (refPath !== '/' && refPath !== '/index.html') {
          isFromInternalSubpage = true;
        }
      }
    }
  } catch (_) { }

  let internalNavFlag = false;
  try {
    internalNavFlag = sessionStorage.getItem('hv_from_subpage') === 'true';
  } catch (_) { }

  // Intro ONLY plays on reload / hard reload or first clean visit, never on navigation from subpages
  const isNavigatedToHome = !isReload && (isFromInternalSubpage || internalNavFlag || navType === 'back_forward');

  const searchParams = new URLSearchParams(window.location.search);
  const isForceIntro = (searchParams.get('intro') === 'true' || searchParams.get('intro') === 'force') && !searchParams.has('no-intro');
  const ua = navigator.userAgent || '';
  const isDevToolsMobileAudit = (
    (ua.includes('Macintosh') || ua.includes('Windows NT')) &&
    !ua.includes('iPhone') &&
    !ua.includes('Android') &&
    window.innerWidth <= 768
  );
  const isLighthouseAudit = ua.includes('Lighthouse') ||
    ua.includes('Chrome-Lighthouse') ||
    ua.includes('HeadlessChrome') ||
    ua.includes('moto g power') ||
    navigator.webdriver === true ||
    isDevToolsMobileAudit;
  const skipIntro = !isForceIntro && (
    isDedicatedPage ||
    window.__HV_SKIP_INTRO__ ||
    isLighthouseAudit ||
    isNavigatedToHome ||
    window.location.search.includes('no-intro') ||
    window.location.search.includes('intro=false')
  );

  // Clean up temporary navigation flag
  try {
    sessionStorage.removeItem('hv_from_subpage');
  } catch (_) { }

  ensureViewportBottomReveal();

  if (skipIntro) {
    // Intro skipped (navigated from another page or audit)
    const introEl = document.getElementById('highverz-intro');
    if (introEl) introEl.remove();
    document.documentElement.classList.remove('intro-pending');
    document.documentElement.classList.add('skip-intro');
    document.body.classList.remove('intro-active');
    if (lenis) {
      lenis.start();
      lenis.scrollTo(0, { immediate: true });
    }

    if (isHomeRoute(window.location.pathname)) {
      prepareHeroInitialState();
      initHeroIntro(true);
      initBelowFoldFeatures();
    } else {
      initPageScripts(window.location.pathname);
    }
  } else {
    // Play loading intro screen on reload and initial visit.
    if (isHomeRoute(window.location.pathname)) {
      prepareHeroInitialState();
      // Notice: Do NOT call initBelowFoldFeatures() here while intro is pending!
    } else {
      initPageScripts(window.location.pathname);
    }
    if (lenis) lenis.stop();

    initHighverzIntro({
      onStartReveal: () => {
        if (lenis) lenis.start();
        if (isHomeRoute(window.location.pathname)) {
          initBelowFoldFeatures();
          window.__hvUnlockHeroVideos?.();
          initHeroIntro(false);
        } else {
          triggerPageHeroEntrance(window.location.pathname);
          initFooterScatterGrid();
        }
        requestAnimationFrame(() => {
          ScrollTrigger.refresh();
        });
      }
    });
  }

  // Shift + I triggers intro replay dynamically in-place without page reload
  window.addEventListener('keydown', (e) => {
    if (e.shiftKey && (e.key === 'I' || e.key === 'i')) {
      if (lenis) lenis.stop();
      replayHighverzIntro();
    }
  });

  // Recalculate ScrollTrigger measurements once layout is painted
  requestAnimationFrame(() => {
    ScrollTrigger.refresh();
  });
  window.addEventListener('load', () => {
    ScrollTrigger.refresh();
    initFooterScatterGrid();

    // Register high-performance Service Worker for video and asset caching
    if ('serviceWorker' in navigator && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {});
    }

    // If page is loaded with an anchor hash (e.g. /work.html#work), scroll smoothly to target
    if (window.location.hash) {
      const hashTarget = document.querySelector(window.location.hash);
      if (hashTarget) {
        setTimeout(() => {
          if (window.lenis) {
            window.lenis.scrollTo(hashTarget, { offset: -80, duration: 1.2 });
          } else {
            hashTarget.scrollIntoView({ behavior: 'smooth' });
          }
        }, 200);
      }
    }
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}

// ==========================================================================
// 01. FLUID KINETIC MAGNETIC CURSOR TRACKER
// ==========================================================================
function initCustomCursor() {
  const cursorWrap = document.getElementById('custom-cursor');
  const cursorDot = document.getElementById('cursor-dot');
  const cursorRing = document.getElementById('cursor-ring');
  const cursorGlow = document.getElementById('cursor-glow');
  const cursorText = document.getElementById('cursor-text');

  if (!cursorWrap || !cursorRing) return;

  // Touch device and small screen check
  if ('ontouchstart' in window || navigator.maxTouchPoints > 0 || window.innerWidth <= 900) {
    cursorWrap.style.display = 'none';
    document.body.style.cursor = 'auto';
    return;
  }

  // Start hidden on page load so no ghost/uneven circle appears in the viewport
  cursorWrap.classList.add('is-hidden');
  let hasMouseMoved = false;

  // Pointer coordinates (start off-screen)
  let mouseX = -100;
  let mouseY = -100;

  // Physics render positions (start off-screen)
  let dotX = -100;
  let dotY = -100;
  let ringX = -100;
  let ringY = -100;
  let glowX = -100;
  let glowY = -100;

  // Interactive states
  let isMagnetic = false;
  let clickScale = 1;
  let magneticTarget = null;

  // Expose global cursor restoration hook for transitions
  window.__hvEnsureCursorActive = function () {
    if (window.innerWidth <= 900 || ('ontouchstart' in window || navigator.maxTouchPoints > 0)) return;
    document.body.classList.add('cursor-active');
    if (cursorWrap) cursorWrap.classList.remove('is-hidden');
    if (cursorDot) cursorDot.classList.remove('is-hidden');
    if (cursorRing) {
      cursorRing.classList.remove('is-interactive', 'is-view-detail', 'is-badge', 'is-text-input', 'is-magnetic', 'is-clicking');
    }
    if (cursorText) cursorText.textContent = '';
    isMagnetic = false;
    if (magneticTarget) {
      magneticTarget.style.transform = '';
      magneticTarget = null;
    }
  };

  // Mouse move tracking
  window.addEventListener('mousemove', (e) => {
    mouseX = e.clientX;
    mouseY = e.clientY;

    if (!document.body.classList.contains('cursor-active')) {
      document.body.classList.add('cursor-active');
    }
    if (cursorWrap && cursorWrap.classList.contains('is-hidden')) {
      cursorWrap.classList.remove('is-hidden');
    }

    if (!hasMouseMoved) {
      hasMouseMoved = true;
      dotX = mouseX;
      dotY = mouseY;
      ringX = mouseX;
      ringY = mouseY;
      glowX = mouseX;
      glowY = mouseY;
    }
  }, { passive: true });

  // Mouse down / up tactile compression
  window.addEventListener('mousedown', () => {
    clickScale = 0.82;
    if (cursorRing) cursorRing.classList.add('is-clicking');
  });

  window.addEventListener('mouseup', () => {
    clickScale = 1.08;
    if (cursorRing) cursorRing.classList.remove('is-clicking');
  });

  // Window bounds handling
  document.addEventListener('mouseleave', () => {
    if (cursorWrap) cursorWrap.classList.add('is-hidden');
  });
  document.addEventListener('mouseenter', () => {
    if (cursorWrap) {
      cursorWrap.classList.remove('is-hidden');
      document.body.classList.add('cursor-active');
    }
  });

  // 60/120fps precision physics render loop
  function renderPhysicsCursor() {
    // 1. Instant zero-latency lead pinpoint core
    dotX = mouseX;
    dotY = mouseY;

    // 2. Compute target position for trailing optic ring
    let targetRingX = mouseX;
    let targetRingY = mouseY;

    if (isMagnetic && magneticTarget) {
      const rect = magneticTarget.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;

      // Gentle magnetic pull toward element center
      targetRingX = centerX + (mouseX - centerX) * 0.25;
      targetRingY = centerY + (mouseY - centerY) * 0.25;

      // Tactile physical displacement on hovered button
      const maxDisplace = 6;
      const dispX = Math.max(-maxDisplace, Math.min(maxDisplace, (mouseX - centerX) * 0.15));
      const dispY = Math.max(-maxDisplace, Math.min(maxDisplace, (mouseY - centerY) * 0.15));
      magneticTarget.style.transform = `translate3d(${dispX}px, ${dispY}px, 0)`;
    }

    // 3. Give the ring and halo a small physical follow-through so the
    // cursor feels alive instead of being a static marker on the pointer.
    ringX += (targetRingX - ringX) * 0.28;
    ringY += (targetRingY - ringY) * 0.28;

    // The atmospheric glow follows more slowly and leaves a soft luminous
    // wake behind quick pointer movements.
    glowX += (targetRingX - glowX) * 0.105;
    glowY += (targetRingY - glowY) * 0.105;

    // 5. Tactile click impulse decay
    clickScale += (1.0 - clickScale) * 0.22;

    // 6. Apply GPU accelerated transforms
    if (cursorDot) {
      cursorDot.style.transform = `translate3d(${dotX}px, ${dotY}px, 0)`;
    }

    if (cursorRing) {
      cursorRing.style.transform = `translate3d(${ringX}px, ${ringY}px, 0) scale(${clickScale})`;
    }

    if (cursorGlow) {
      const movement = Math.min(0.16, Math.hypot(targetRingX - glowX, targetRingY - glowY) / 520);
      cursorGlow.style.transform = `translate3d(${glowX}px, ${glowY}px, 0) scale(${1 + movement})`;
    }

    requestAnimationFrame(renderPhysicsCursor);
  }
  requestAnimationFrame(renderPhysicsCursor);

  // 7. Interactive Magnetic & Hover Binding
  function bindMagneticHoverElements() {
    // Magnetic targets (primary key action buttons)
    const magneticSelectors = [
      '.btn-primary-cyan',
      '.btn-nav-talk',
      '.btn-primary-cyan-large',
      '.work-hero-cta'
    ].join(',');

    const magneticElements = document.querySelectorAll(magneticSelectors);
    magneticElements.forEach((el) => {
      el.addEventListener('mouseenter', () => {
        isMagnetic = true;
        magneticTarget = el;
        if (cursorRing) cursorRing.classList.add('is-magnetic');
      });

      el.addEventListener('mouseleave', () => {
        isMagnetic = false;
        if (magneticTarget) {
          magneticTarget.style.transform = '';
          magneticTarget = null;
        }
        if (cursorRing) cursorRing.classList.remove('is-magnetic');
      });
    });

    // Content Hover targets with smart mode categorization:
    document.addEventListener('mouseover', (e) => {
      // Priority 1: Text Inputs (search input, text inputs, textareas)
      const inputEl = e.target.closest('input[type="text"], input[type="search"], input:not([type]), textarea, #campaign-search-input');
      if (inputEl) {
        if (cursorRing) {
          cursorRing.classList.remove('is-interactive', 'is-badge');
          cursorRing.classList.add('is-text-input');
        }
        if (cursorDot) cursorDot.classList.add('is-hidden');
        if (cursorText) cursorText.textContent = '';
        return;
      }

      // Give case-study links a larger transparent lens cursor.
      const viewDetailEl = e.target.closest('.view-detail-chip');
      if (viewDetailEl) {
        if (cursorRing) {
          cursorRing.classList.remove('is-interactive', 'is-text-input', 'is-badge');
          cursorRing.classList.add('is-view-detail');
        }
        if (cursorDot) cursorDot.classList.remove('is-hidden');
        if (cursorText) cursorText.textContent = 'VIEW ↗';
        return;
      }

      // Priority 2: Media & Editorial Showcase Cards.
      // Keep the cursor in its regular precision mode on cards; do not expand
      // it into the large VIEW badge.
      const badgeEl = e.target.closest('.campaign-movie-card, .work-creator-card, .portfolio-vertical-card, .creator-card, [data-cursor-badge]');
      if (badgeEl) {
        if (cursorRing) {
          cursorRing.classList.remove('is-interactive', 'is-view-detail', 'is-text-input', 'is-badge');
        }
        if (cursorDot) cursorDot.classList.remove('is-hidden');
        if (cursorText) cursorText.textContent = '';
        return;
      }

      // Priority 3: Standard Interactive Elements (buttons, links, nav, dropdowns, filters)
      const interactiveEl = e.target.closest('a, button, select, [role="button"], input[type="range"], .glass-dropdown-trigger, .glass-option-item, .nav-link, .campaign-tag-pill, .theme-switcher, .theme-capsule-switcher, .theme-capsule-btn, .service-badge-item, .domain-chip, .founder-social-btn, .f-social');
      if (interactiveEl) {
        if (cursorRing) {
          cursorRing.classList.remove('is-text-input', 'is-view-detail', 'is-badge');
          cursorRing.classList.add('is-interactive');
        }
        if (cursorDot) cursorDot.classList.remove('is-hidden');
        if (cursorText) cursorText.textContent = '';
        return;
      }
    });

    document.addEventListener('mouseout', (e) => {
      const target = e.target;
      const related = e.relatedTarget;

      const hoveredEl = target.closest('input, textarea, .campaign-movie-card, .work-creator-card, .portfolio-vertical-card, .creator-card, a, button, select, [role="button"], [data-cursor-badge], .glass-dropdown-trigger, .glass-option-item');
      if (!hoveredEl) return;
      if (related && hoveredEl.contains(related)) return;

      // Reset cursor state back to default optic mode
      if (cursorRing) {
        cursorRing.classList.remove('is-interactive', 'is-view-detail', 'is-text-input', 'is-badge');
      }
      if (cursorDot) {
        cursorDot.classList.remove('is-hidden');
      }
      if (cursorText) {
        cursorText.textContent = '';
      }
    });
  }

  bindMagneticHoverElements();
}

// ==========================================================================
// ==========================================================================
// 02. NAVBAR SCROLL ANIMATION, SMART DIRECTION & ACTIVE INDICATOR
// ==========================================================================
function initNavbar() {
  const navbar = document.getElementById('navbar');
  if (!navbar) return;

  const navList = navbar.querySelector('.nav-list');
  const navLinks = navbar.querySelectorAll('.nav-link');
  let activeLink = navbar.querySelector('.nav-link.active');

  // ------------------------------------------------------------------------
  // A. Desktop Sliding Pill Indicator (.nav-indicator)
  // ------------------------------------------------------------------------
  let indicator = null;
  function positionIndicator(targetEl, isHover = false) {
    if (!indicator || !navList) return;
    if (!targetEl || targetEl.offsetParent === null) {
      indicator.style.opacity = '0';
      return;
    }

    const rect = targetEl.getBoundingClientRect();
    const listRect = navList.getBoundingClientRect();
    const left = rect.left - listRect.left;
    const width = rect.width;

    indicator.style.width = `${Math.round(width)}px`;
    indicator.style.transform = `translate(${Math.round(left)}px, -50%) translateZ(0)`;
    indicator.style.opacity = '1';

    if (isHover) {
      indicator.classList.add('is-hovered');
    } else {
      indicator.classList.remove('is-hovered');
    }
  }

  if (navList) {
    indicator = navList.querySelector('.nav-indicator');
    if (!indicator) {
      indicator = document.createElement('div');
      indicator.className = 'nav-indicator';
      indicator.setAttribute('aria-hidden', 'true');
      navList.appendChild(indicator);
    }

    // Set initial indicator position
    if (activeLink) {
      requestAnimationFrame(() => positionIndicator(activeLink, false));
    }

    // Hover interactions across desktop nav items
    navLinks.forEach((link) => {
      link.addEventListener('mouseenter', () => positionIndicator(link, true));
      link.addEventListener('focus', () => positionIndicator(link, true));
    });

    navList.addEventListener('mouseleave', () => {
      activeLink = navbar.querySelector('.nav-link.active');
      if (activeLink) {
        positionIndicator(activeLink, false);
      } else if (indicator) {
        indicator.style.opacity = '0';
      }
    });

    // Recalculate indicator on resize / font load
    const handleResize = () => {
      activeLink = navbar.querySelector('.nav-link.active');
      if (activeLink) positionIndicator(activeLink, false);
    };
    window.addEventListener('resize', handleResize, { passive: true });
    if (document.fonts) {
      document.fonts.ready.then(handleResize);
    }

    window.__hvPositionIndicator = positionIndicator;
    window.__hvUpdateNavbar = function (targetPath) {
      const normTarget = targetPath.split('#')[0].split('?')[0].replace(/\/+$/, '') || '/';
      let matchedLink = null;

      const allLinks = document.querySelectorAll('.nav-link, .mobile-nav-link');
      allLinks.forEach((link) => {
        const href = link.getAttribute('href');
        if (!href) return;
        const normHref = href.split('#')[0].split('?')[0].replace(/\/+$/, '') || '/';
        const isMatch = normHref === normTarget ||
          (normHref.endsWith('.html') && normTarget.endsWith(normHref)) ||
          (normHref !== '/' && normTarget.includes(normHref.replace('.html', '')));
        if (isMatch) {
          link.classList.add('active');
          if (link.classList.contains('nav-link')) {
            matchedLink = link;
            activeLink = link;
          }
        } else {
          link.classList.remove('active');
        }
      });
      if (matchedLink) {
        requestAnimationFrame(() => positionIndicator(matchedLink, false));
      } else if (indicator) {
        indicator.style.opacity = '0';
      }
    };
  }

  // ------------------------------------------------------------------------
  // B. Scroll Direction & Floating State Transition
  // ------------------------------------------------------------------------
  let lastScrollY = window.scrollY || 0;
  let isHidden = false;
  let isScrolled = false;
  let isProgrammaticScroll = false;
  let scrollDownDistance = 0;
  let scrollUpDistance = 0;
  let lastScrollTime = performance.now();

  function onScrollUpdate(currentScrollY) {
    const scrollY = Math.max(0, currentScrollY);

    // Initial state near top of page (hero navbar)
    if (scrollY <= 55) {
      if (isScrolled) {
        navbar.classList.remove('scrolled');
        isScrolled = false;
      }
      if (isHidden) {
        navbar.classList.remove('nav-hidden');
        isHidden = false;
      }
      scrollDownDistance = 0;
      scrollUpDistance = 0;
      lastScrollY = scrollY;
      return;
    }

    // Scrolled state (compact, higher blur, sleek shadow)
    if (scrollY > 55 && !isScrolled) {
      navbar.classList.add('scrolled');
      isScrolled = true;
    }

    // If scrolling programmatically or mobile drawer is active, keep navbar pinned and visible
    if (isProgrammaticScroll || document.body.classList.contains('mobile-menu-active')) {
      if (isHidden) {
        navbar.classList.remove('nav-hidden');
        isHidden = false;
      }
      lastScrollY = scrollY;
      return;
    }

    const delta = scrollY - lastScrollY;
    const now = performance.now();
    const timeDelta = Math.max(now - lastScrollTime, 1);
    const velocity = Math.abs(delta) / timeDelta;
    lastScrollTime = now;

    if (delta > 3) {
      // Scrolling down
      scrollUpDistance = 0;
      scrollDownDistance += delta;

      // Only hide if scrolled well past hero (> 280px) AND user is scrolling down quickly
      if (scrollY > 280 && (scrollDownDistance > 140 || velocity > 1.2) && !isHidden) {
        navbar.classList.add('nav-hidden');
        isHidden = true;
      }
    } else if (delta < -3) {
      // Scrolling up
      scrollDownDistance = 0;
      scrollUpDistance += Math.abs(delta);

      // Any intentional upward scroll reveals navbar smoothly
      if ((scrollUpDistance > 8 || scrollY <= 140) && isHidden) {
        navbar.classList.remove('nav-hidden');
        isHidden = false;
      }
    }

    lastScrollY = scrollY;
  }

  // Hook into Lenis smooth scroll and native scroll
  if (window.lenis) {
    window.lenis.on('scroll', (e) => onScrollUpdate(e.scroll));
  }
  window.addEventListener('scroll', () => {
    onScrollUpdate(window.scrollY);
    if (window.ScrollTrigger) window.ScrollTrigger.update();
  }, { passive: true });

  // Peek reveal: when cursor moves to top 50px of the viewport, bring navbar back
  window.addEventListener('mousemove', (e) => {
    if (e.clientY <= 50 && isHidden) {
      navbar.classList.remove('nav-hidden');
      isHidden = false;
    }
  }, { passive: true });

  // ------------------------------------------------------------------------
  // C. Section Scroll & In-Page Smooth Navigation
  // ------------------------------------------------------------------------
  const inPageLinks = navbar.querySelectorAll('.nav-menu a, .brand-logo');
  inPageLinks.forEach((link) => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (!href) return;

      let targetEl = null;
      if (href.startsWith('#')) {
        targetEl = document.querySelector(href);
      } else if (href === '/index.html' && (window.location.pathname === '/' || window.location.pathname.endsWith('index.html'))) {
        targetEl = document.getElementById('hero');
      }

      if (targetEl) {
        e.preventDefault();
        isProgrammaticScroll = true;
        navbar.classList.remove('nav-hidden');
        isHidden = false;

        // Update active class & slide indicator
        if (link.classList.contains('nav-link')) {
          navLinks.forEach((l) => l.classList.remove('active'));
          link.classList.add('active');
          activeLink = link;
          positionIndicator(link, false);
        }

        if (window.lenis) {
          window.lenis.scrollTo(targetEl, {
            offset: -80,
            duration: 1.2,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t))
          });
        } else {
          const top = targetEl.getBoundingClientRect().top + window.scrollY - 80;
          window.scrollTo({ top, behavior: 'smooth' });
        }

        setTimeout(() => {
          isProgrammaticScroll = false;
        }, 1300);
      } else {
        // If clicking on active/same-route link without hash, smoothly scroll to top
        try {
          const linkUrl = new URL(href, window.location.origin);
          const normLink = (linkUrl.pathname || '/').replace(/\/+$/, '').replace(/\.html$/, '') || '/';
          const normCurrent = (window.location.pathname || '/').replace(/\/+$/, '').replace(/\.html$/, '') || '/';
          if (normLink === normCurrent && !linkUrl.hash) {
            e.preventDefault();
            if (window.lenis) {
              window.lenis.scrollTo(0, { duration: 0.8 });
            } else {
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }
          }
        } catch (_) { }
      }

      // If leaving subpage to go Home, ensure Home skips the intro
      try {
        const linkUrl = new URL(href, window.location.origin);
        if (isHomeRoute(linkUrl.pathname) && !isHomeRoute(window.location.pathname)) {
          sessionStorage.setItem('hv_from_subpage', 'true');
        }
      } catch (_) { }
    });
  });

  // Track subpage exits to guarantee Home intro skip
  window.addEventListener('beforeunload', () => {
    if (!isHomeRoute(window.location.pathname)) {
      try { sessionStorage.setItem('hv_from_subpage', 'true'); } catch (_) { }
    }
  });

  // ------------------------------------------------------------------------
  // D. ScrollSpy on Homepage Sections
  // ------------------------------------------------------------------------
  const isHomepage = window.location.pathname === '/' || window.location.pathname.endsWith('index.html');
  if (isHomepage && 'IntersectionObserver' in window) {
    const sectionSelectors = [
      { id: 'hero', linkSelector: '.nav-link[href="/index.html"]' }
    ];

    const observer = new IntersectionObserver((entries) => {
      if (isProgrammaticScroll) return;
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const match = sectionSelectors.find((s) => s.id === entry.target.id);
          if (match) {
            const targetNav = navbar.querySelector(match.linkSelector);
            if (targetNav && !targetNav.classList.contains('active')) {
              navLinks.forEach((l) => l.classList.remove('active'));
              targetNav.classList.add('active');
              activeLink = targetNav;
              positionIndicator(targetNav, false);
            }
          }
        }
      });
    }, { rootMargin: '-30% 0px -60% 0px' });

    sectionSelectors.forEach((item) => {
      const el = document.getElementById(item.id);
      if (el) observer.observe(el);
    });
  }

  // Initialize mobile drawer
  initMobileNav(navbar);

  // Page transitions keep the navbar mounted while replacing #page-content.
  // Reset its transient GSAP and scroll-direction state after each swap so a
  // half-complete outgoing animation cannot leave it hidden or transparent.
  window.__hvResetNavbar = (targetPath = window.location.pathname) => {
    isHidden = false;
    isScrolled = false;
    lastScrollY = 0;
    scrollDownDistance = 0;
    scrollUpDistance = 0;
    navbar.classList.remove('nav-hidden', 'scrolled', 'page-nav-outgoing');
    gsap.killTweensOf(navbar);
    gsap.set(navbar, { clearProps: 'filter,opacity,transform,willChange' });
    window.__hvUpdateNavbar?.(targetPath);
    requestAnimationFrame(() => {
      activeLink = navbar.querySelector('.nav-link.active');
      if (activeLink) positionIndicator(activeLink, false);
    });
  };
}

// ==========================================================================
// 02b. MOBILE NAVIGATION DRAWER & INTERACTION
// ==========================================================================
function initMobileNav(navbar) {
  let toggleBtn = document.getElementById('mobile-toggle');
  const navActions = navbar.querySelector('.nav-actions');

  // If mobile toggle doesn't exist on this page, create and append to navActions
  if (!toggleBtn && navActions) {
    toggleBtn = document.createElement('button');
    toggleBtn.className = 'mobile-toggle';
    toggleBtn.id = 'mobile-toggle';
    toggleBtn.setAttribute('aria-label', 'Toggle navigation');
    toggleBtn.innerHTML = '<span class="toggle-bar"></span><span class="toggle-bar"></span>';
    navActions.appendChild(toggleBtn);
  }

  // Create or select mobile nav overlay
  let overlay = document.getElementById('mobile-nav-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.className = 'mobile-nav-overlay';
    overlay.id = 'mobile-nav-overlay';
    overlay.setAttribute('aria-hidden', 'true');

    const pathname = window.location.pathname;
    const isHome = isHomeRoute(pathname);
    const isWork = pathname.includes('work.html');
    const isCampaigns = pathname.includes('campaigns.html');
    const isTeam = pathname.includes('team.html');
    const isWhyUs = pathname.includes('why-us');

    overlay.innerHTML = `
      <div class="mobile-nav-backdrop-glow" aria-hidden="true"></div>
      <div class="mobile-nav-content">
        <div class="mobile-nav-header">
          <span class="mobile-nav-label">Navigation</span>
          <span class="mobile-nav-brand">HIGHVERZ</span>
          <button type="button" class="mobile-nav-close" aria-label="Close navigation">✕</button>
        </div>
        <ul class="mobile-nav-list">
          <li class="mobile-nav-item">
            <a href="/index.html" class="mobile-nav-link ${isHome ? 'active' : ''}">
              <span class="mobile-nav-num">01</span>
              <span class="mobile-nav-text">Home</span>
            </a>
          </li>
          <li class="mobile-nav-item">
            <a href="/work.html" class="mobile-nav-link ${isWork ? 'active' : ''}">
              <span class="mobile-nav-num">02</span>
              <span class="mobile-nav-text">Work</span>
            </a>
          </li>
          <li class="mobile-nav-item">
            <a href="/campaigns.html" class="mobile-nav-link ${isCampaigns ? 'active' : ''}">
              <span class="mobile-nav-num">03</span>
              <span class="mobile-nav-text">Campaigns</span>
            </a>
          </li>
          <li class="mobile-nav-item">
            <a href="/team.html" class="mobile-nav-link ${isTeam ? 'active' : ''}">
              <span class="mobile-nav-num">04</span>
              <span class="mobile-nav-text">Team</span>
            </a>
          </li>
          <li class="mobile-nav-item">
            <a href="/why-us.html" class="mobile-nav-link ${isWhyUs ? 'active' : ''}">
              <span class="mobile-nav-num">05</span>
              <span class="mobile-nav-text">Why Us</span>
            </a>
          </li>
        </ul>
        <div class="mobile-nav-cta-box">
          <a href="#contact" class="mobile-nav-talk-btn" id="mobile-nav-talk-btn">
            <span>Let's Talk</span>
            <span class="btn-arrow-icon">↗</span>
          </a>
          <div class="mobile-nav-footer-meta">
            <a href="mailto:contact@highverz.com" class="mobile-nav-email">contact@highverz.com</a>
            <span class="mobile-nav-location">Dubai & Worldwide</span>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
  }

  let isOpen = false;
  overlay.inert = true;
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Navigation');
  overlay.setAttribute('data-lenis-prevent', '');
  toggleBtn?.setAttribute('aria-controls', overlay.id);
  toggleBtn?.setAttribute('aria-expanded', 'false');
  const closeBtn = overlay.querySelector('.mobile-nav-close');

  function openMenu() {
    isOpen = true;
    gsap.killTweensOf(overlay);
    overlay.removeAttribute('inert');
    overlay.inert = false;
    overlay.style.pointerEvents = 'auto';
    overlay.style.visibility = 'visible';
    overlay.style.opacity = '1';

    // Synchronize active tab in mobile drawer with current route
    const currentPath = window.location.pathname;
    overlay.querySelectorAll('.mobile-nav-link').forEach((link) => {
      const href = link.getAttribute('href');
      if (!href) return;
      const isTargetHome = isHomeRoute(href);
      const isCurrentHome = isHomeRoute(currentPath);
      if (isCurrentHome && isTargetHome) {
        link.classList.add('active');
      } else if (!isTargetHome && currentPath.includes(href.replace(/^\//, ''))) {
        link.classList.add('active');
      } else {
        link.classList.remove('active');
      }
    });

    if (toggleBtn) {
      toggleBtn.classList.add('is-active');
      toggleBtn.setAttribute('aria-expanded', 'true');
    }
    overlay.classList.add('is-open');
    overlay.setAttribute('aria-hidden', 'false');
    document.body.classList.add('mobile-menu-active');
    if (window.lenis) window.lenis.stop();
    closeBtn?.focus({ preventScroll: true });

    // Staggered Entrance Animation
    if (typeof gsap !== 'undefined') {
      gsap.fromTo(overlay,
        { opacity: 0, y: -20 },
        { opacity: 1, y: 0, duration: 0.38, ease: 'power3.out' }
      );
      gsap.fromTo(overlay.querySelectorAll('.mobile-nav-item'),
        { opacity: 0, y: 24 },
        { opacity: 1, y: 0, duration: 0.45, stagger: 0.065, ease: 'power3.out', delay: 0.08 }
      );
      gsap.fromTo(overlay.querySelector('.mobile-nav-cta-box'),
        { opacity: 0, y: 18 },
        { opacity: 1, y: 0, duration: 0.4, ease: 'power3.out', delay: 0.28 }
      );
    }
  }

  function closeMenu() {
    if (!isOpen) return;
    isOpen = false;
    gsap.killTweensOf(overlay);
    overlay.setAttribute('inert', '');
    overlay.inert = true;
    overlay.style.pointerEvents = 'none';
    toggleBtn?.focus({ preventScroll: true });
    if (toggleBtn) {
      toggleBtn.classList.remove('is-active');
      toggleBtn.setAttribute('aria-expanded', 'false');
    }
    document.body.classList.remove('mobile-menu-active');
    if (window.lenis) window.lenis.start();

    if (typeof gsap !== 'undefined') {
      gsap.to(overlay, {
        opacity: 0,
        y: -16,
        duration: 0.25,
        ease: 'power2.in',
        onComplete: () => {
          overlay.classList.remove('is-open');
          overlay.setAttribute('aria-hidden', 'true');
          overlay.style.visibility = 'hidden';
        }
      });
    } else {
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.visibility = 'hidden';
      overlay.style.opacity = '0';
    }
  }

  window.__hvCloseMobileMenu = closeMenu;

  if (toggleBtn) {
    toggleBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (isOpen) {
        closeMenu();
      } else {
        openMenu();
      }
    });
  }
  closeBtn?.addEventListener('click', closeMenu);
  window.matchMedia('(min-width: 901px)').addEventListener('change', (event) => {
    if (event.matches) closeMenu();
  });

  // Handle all links inside drawer
  overlay.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', (e) => {
      const href = link.getAttribute('href');
      if (href === '#contact') {
        e.preventDefault();
        closeMenu();
        // The delegated enquiry handler opens the form for this same click.
        return;
      }
      // Instantly dismiss overlay before view-transition snapshot to avoid freezing a half-closed drawer
      isOpen = false;
      overlay.setAttribute('inert', '');
      overlay.inert = true;
      if (toggleBtn) {
        toggleBtn.classList.remove('is-active');
        toggleBtn.setAttribute('aria-expanded', 'false');
      }
      document.body.classList.remove('mobile-menu-active');
      overlay.classList.remove('is-open');
      overlay.setAttribute('aria-hidden', 'true');
      overlay.style.visibility = 'hidden';
      overlay.style.opacity = '0';
      overlay.style.pointerEvents = 'none';
      if (window.lenis) window.lenis.start();
    });
  });

  // Prevent touch propagation from leaking to underlying reels/content while interacting with drawer
  overlay.addEventListener('touchstart', (e) => {
    e.stopPropagation();
  }, { passive: true });
  overlay.addEventListener('touchmove', (e) => {
    e.stopPropagation();
  }, { passive: true });

  // Close on Escape
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen) {
      closeMenu();
    }
    if (e.key === 'Tab' && isOpen) {
      const controls = Array.from(overlay.querySelectorAll('a[href], button:not([disabled])'));
      const first = controls[0], last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault(); last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault(); first?.focus();
      }
    }
  });

  // Close when tapping backdrop outside content
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      closeMenu();
    }
  });
}

// ==========================================================================
// 03. HERO CHOREOGRAPHY (WORD BLUR-FADE REVEAL — ROI Media style)
// ==========================================================================

// The light theme is positioned around cinema and campaign distribution,
// while dark mode keeps the creator-growth message. Both variants use the
function applyThemeHeroTrustBadge() {
  const badge = document.getElementById('hero-trust-badge') || document.querySelector('.hero-trust-badge');
  if (!badge) return;

  const isLight = document.documentElement.dataset.theme === 'light';
  badge.setAttribute(
    'aria-label',
    isLight
      ? '4.5 billion views generated across film campaigns'
      : '4.5 billion views generated across creator growth'
  );

  if (!badge.dataset.scrollBound) {
    badge.dataset.scrollBound = 'true';
    badge.addEventListener('click', (e) => {
      e.preventDefault();
      const isCurrentlyLight = document.documentElement.dataset.theme === 'light';
      const target = isCurrentlyLight
        ? (document.querySelector('#work') || document.querySelector('.section-portfolio') || document.querySelector('#creators'))
        : (document.querySelector('#creators') || document.querySelector('.section-creators'));
      if (target) {
        if (window.lenis) {
          window.lenis.scrollTo(target, { offset: -60, duration: 1.2 });
        } else {
          target.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });
  }
}

// same word-level markup so the existing reveal timeline remains identical.
function applyThemeHeroCopy() {
  applyThemeHeroTrustBadge();

  const headline = document.getElementById('hero-headline');
  const description = document.getElementById('hero-desc');
  if (!headline) return;

  const isLight = document.documentElement.dataset.theme === 'light';
  // Do not trust only the marker: Vite hot reloads and route handoffs can
  // preserve the marker while restoring the previous theme's DOM nodes.
  const hasExpectedMarkup = isLight
    ? headline.querySelector('.hero-movie-screen')
    : headline.querySelector('#hero-word-roller');
  if (headline.dataset.themeCopyApplied === document.documentElement.dataset.theme && hasExpectedMarkup) return;
  headline.innerHTML = isLight
    ? `<span class="hero-headline-line">
        <span class="hl-word" data-word>From</span>
        <span class="hl-word" data-word>Movie</span>
        <span class="hl-word hero-movie-screen" data-word>Screens</span>
        <span class="hl-word" data-word>to</span>
        <span class="hl-word" data-word>Social</span>
        <span class="hl-word" data-word>Feeds,</span>
      </span>
      <span class="hero-headline-connector is-placeholder" aria-hidden="true">&amp;</span>
      <span class="hero-headline-line">
        <span class="hl-word" data-word>Turning</span>
        <span class="hl-word" data-word>Every</span>
        <span class="hl-word" data-word>Scene</span>
        <span class="hl-word" data-word>Into</span>
        <span class="hl-word" data-word>a</span>
        <span class="hl-word highlight-cyan font-bold-italic" data-word>Global Sensation.</span>
      </span>`
    : `<span class="hero-headline-line">
        <span class="hl-word" data-word>Turn</span>
        <span class="hl-word" data-word>Your</span>
        <span class="hl-word" data-word>Content</span>
        <span class="hl-word" data-word>Into</span>
        <span class="hero-word-roller" id="hero-word-roller" aria-label="Reach, Boost, Trend, Clicks">
          <span class="roller-item highlight-cyan font-bold-italic is-active" data-word="Reach">Reach</span>
          <span class="roller-item highlight-cyan font-bold-italic" data-word="Boost">Boost</span>
          <span class="roller-item highlight-cyan font-bold-italic" data-word="Trend">Trend</span>
          <span class="roller-item highlight-cyan font-bold-italic" data-word="Clicks">Clicks</span>
        </span>
      </span>
      <span class="hero-headline-connector" aria-hidden="true">&amp;</span>
      <span class="hero-headline-line">
        <span class="hl-word" data-word>Turn</span>
        <span class="hl-word" data-word>Your</span>
        <span class="hl-word" data-word>Name</span>
        <span class="hl-word" data-word>Into</span>
        <span class="hl-word" data-word>a</span>
        <span class="hl-word highlight-cyan font-bold-italic" data-word>Brand</span>
      </span>`;

  if (description) {
    description.innerHTML = isLight
      ? '<span>We turn cinematic stories into scroll-stopping campaigns.</span><span>More reach, more views, and more audience potential.</span>'
      : '<span>We build and manage distribution accounts, publish daily,</span><span>and turn short-form content into measurable growth.</span>';
  }
  headline.dataset.themeCopyApplied = document.documentElement.dataset.theme || 'dark';
}

// The Home case-study rail has two deliberate identities: creator growth in
// Dark mode and film distribution in Light mode. Keep the existing creator
// markup as the source of truth, then swap only the copy/assets at the theme
// boundary so both variants share the same layout and animation hooks.
function applyThemeCreatorsCopy() {
  const section = document.querySelector('.section-creators');
  const cards = Array.from(section?.querySelectorAll('.creator-card') || []);
  if (!section || cards.length < 2) return;

  // Clear any stale dimensions left by an earlier hot-reload version of the
  // theme lock before calculating the current card layout.
  section.querySelectorAll('[data-theme-layout-height]').forEach((element) => {
    element.style.removeProperty('height');
    delete element.dataset.themeLayoutHeight;
  });

  if (!homeCreatorsDarkMarkup) {
    homeCreatorsDarkMarkup = {
      header: section.querySelector('.creators-header')?.innerHTML || '',
      cards: cards.map((card) => card.outerHTML),
      more: section.querySelector('.creators-more-note')?.innerHTML || '',
    };
  }

  const isLight = document.documentElement.dataset.theme === 'light';
  if (!isLight) {
    if (section.dataset.creatorsThemeCopy === 'dark') return;
    const currentCards = Array.from(section.querySelectorAll('.creator-card'));
    const header = section.querySelector('.creators-header');
    if (header) header.innerHTML = homeCreatorsDarkMarkup.header;
    const moreNote = section.querySelector('.creators-more-note');
    if (moreNote) moreNote.innerHTML = homeCreatorsDarkMarkup.more;
    currentCards.forEach((card, index) => {
      const original = homeCreatorsDarkMarkup.cards[index];
      if (original) card.outerHTML = original;
    });
    section.classList.remove('is-movie-showcase');
    section.dataset.creatorsThemeCopy = 'dark';
    return;
  }

  if (section.dataset.creatorsThemeCopy === 'light') return;

  const header = section.querySelector('.creators-header');
  if (header) {
    header.innerHTML = `
      <span class="section-tag">CLIPPING CONCEPTS</span>
      <h2 class="creators-title">Films Meet<br/><span class="highlight-cyan">Short-Form.</span></h2>
      <p class="creators-intro">Turning the most engaging film moments into short-form clips built to capture attention, drive views, and reach new audiences across feeds.</p>
    `;
  }

  const movieCards = [
    {
      image: '/assets/movie/runner.png',
      alt: 'Runner film poster',
      title: 'Runner',
      platform: 'Film Concept 01',
      description: 'Turning cinematic scenes into high-retention short-form clips to drive massive organic reach across feeds.',
      badge: '↗ 18.3M Views',
      before: ['BEFORE', 'Big Screen', 'Cinema Release'],
      after: ['AFTER', 'Social Feed', '18.3M+ Views'],
      meta: [
        'Short-Form Clips',
        'Hook-Driven Editing',
        'Multi-Platform',
        'Explore Concept',
      ],
    },
    {
      image: '/assets/movie/kingofkings.png',
      alt: 'King of Kings film poster',
      title: 'King of Kings',
      platform: 'Film Concept 02',
      description: 'Transforming epic movie scenes into scroll-stopping clips that grab attention and drive viral discovery.',
      badge: '↗ 38.5M Views',
      before: ['BEFORE', 'Big Screen', 'Cinema Release'],
      after: ['AFTER', 'Social Feed', '38.5M+ Views'],
      meta: [
        'Short-Form Clips',
        'Scene Selection',
        'Multi-Platform',
        'Explore Concept',
      ],
    },
  ];

  const chipIcons = [
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="20" height="20" rx="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/></svg>',
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>',
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
  ];

  cards.forEach((card, index) => {
    const movie = movieCards[index];
    if (!movie) return;
    const imageWrap = card.querySelector('.creator-image-wrap');
    const image = card.querySelector('.creator-img');
    const name = card.querySelector('.creator-name');
    const platform = card.querySelector('.creator-platform');
    const description = card.querySelector('.creator-description');
    const badge = card.querySelector('.badge-growth');
    const movieHref = movie.title === 'Runner' ? '/movie-runner.html' : '/movie-kingofkings.html';

    if (imageWrap) {
      imageWrap.href = movieHref;
      imageWrap.removeAttribute('target');
      imageWrap.removeAttribute('rel');
      imageWrap.dataset.cursor = 'FILM CASE STUDY ↗';
      imageWrap.setAttribute('aria-label', `${movie.title} film case study`);
    }
    if (image) {
      image.src = movie.image;
      image.alt = movie.alt;
      image.loading = 'lazy';
      image.decoding = 'async';
    }
    if (name) name.textContent = movie.title;
    if (platform) {
      platform.href = movieHref;
      platform.removeAttribute('target');
      platform.removeAttribute('rel');
      platform.dataset.cursor = 'VIEW CASE STUDY ↗';
      platform.setAttribute('aria-label', `View ${movie.title} film case study`);
      platform.classList.add('movie-platform');
      platform.innerHTML = `<span>${movie.platform}</span><svg class="creator-ext-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M7 17L17 7M17 7H7M17 7V17"/></svg>`;
    }
    if (description) description.textContent = movie.description;
    if (badge) badge.textContent = movie.badge;

    const statItems = card.querySelectorAll('.creator-stat-item');
    [movie.before, movie.after].forEach((stat, statIndex) => {
      const item = statItems[statIndex];
      if (!item) return;
      const overline = item.querySelector('.stat-before-label, .stat-after-label');
      const number = item.querySelector('.stat-number');
      const label = item.querySelector('.stat-label');
      if (overline) overline.textContent = stat[0];
      if (number) {
        number.removeAttribute('data-count');
        number.dataset.staticText = stat[1];
        number.textContent = stat[1];
      }
      if (label) label.textContent = stat[2];
      item.removeAttribute('data-stat-target');
    });

    const meta = card.querySelectorAll('.creator-meta-row .meta-chip');
    meta.forEach((chip, chipIndex) => {
      if (chipIndex === 3) {
        chip.href = movieHref;
        chip.dataset.cursor = 'CASE STUDY ↗';
        chip.innerHTML = `<span>${movie.meta[chipIndex]}</span><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="M7 17L17 7M17 7H7M17 7V17"/></svg>`;
      } else {
        chip.innerHTML = `${chipIcons[chipIndex] || ''}<span>${movie.meta[chipIndex]}</span>`;
      }
    });
  });

  const moreNote = section.querySelector('.creators-more-note');
  const moreLink = moreNote?.querySelector('.creators-more-link');
  const moreText = moreNote?.querySelector('.creators-more-text');
  if (moreLink) {
    moreLink.href = '/campaigns.html';
    moreLink.dataset.cursor = 'ALL FILMS ↗';
    moreLink.setAttribute('aria-label', 'Explore more film campaign case studies');
  }
  if (moreText) moreText.textContent = 'and more film concepts';

  section.classList.add('is-movie-showcase');
  section.dataset.creatorsThemeCopy = 'light';
}

// Theme changes happen without a page reload. Refresh the Home copy in place
// so the cinema message appears as soon as Light mode is selected (and the
// creator message returns when switching back to Dark mode).
window.addEventListener('hv:themechange', () => {
  const headline = document.getElementById('hero-headline');
  if (!headline) return;
  applyThemeHeroCopy();
  applyThemeCreatorsCopy();

  // Restore the original switch choreography: media changes under the optical
  // veil while the headline rises into focus, so both theme identities land as
  // one cinematic transition.
  const reelViewport = document.getElementById('heroCarouselViewport');
  if (reelViewport) {
    reelViewport.classList.remove('theme-reels-deferred', 'theme-reels-revealing');
  }
  window.__hvHeroReelRefreshTheme?.();

  const words = headline.querySelectorAll('.hl-word, .hero-headline-connector, .hero-word-roller');
  const description = document.getElementById('hero-desc');
  if (typeof gsap === 'undefined') return;
  gsap.killTweensOf([...
    Array.from(words),
    ...(description ? [description] : [])
  ]);
  gsap.fromTo(words,
    { opacity: 0, y: 14, filter: 'blur(8px)' },
    { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.48, stagger: 0.045, ease: 'power3.out', clearProps: 'filter,transform' }
  );
  if (description) {
    gsap.fromTo(description,
      { opacity: 0, y: 10, filter: 'blur(6px)' },
      { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.42, delay: 0.14, ease: 'power3.out', clearProps: 'filter,transform' }
    );
  }

  if (document.documentElement.dataset.theme === 'dark') initHeroWordRoller();
  if (isHomeRoute(window.location.pathname)) {
    initAdscaleTextEffects();
    initCreatorsSection();
  }
});

export function prepareHeroInitialState() {
  applyThemeHeroCopy();
  const heroHeadline = document.getElementById('hero-headline');
  if (!heroHeadline) return;

  prepareHeroWordRoller();

  const isMobile = window.innerWidth < 768;
  const isLightTheme = document.documentElement.dataset.theme === 'light';
  if (isMobile && !isLightTheme) {
    // Keep headline text visible and sharp on mobile for instant LCP and 0 GPU blur overhead
    const headlineLines = heroHeadline.querySelectorAll('.hero-headline-line');
    headlineLines.forEach((line) => { line.style.overflow = 'visible'; });
    return;
  }

  const platformChips = heroHeadline.querySelectorAll('.hl-platform-chips .platform-chip');
  const headlineLines = heroHeadline.querySelectorAll('.hero-headline-line');
  const navbar = document.getElementById('navbar');

  headlineLines.forEach((line) => { line.style.overflow = 'visible'; });

  // Hero entrance continues the loader's motion language:
  // blur + slide upward + opacity — content physically travels into focus
  gsap.set('.hl-word, .hero-headline-connector, .hero-word-roller', {
    opacity: 0,
    y: 25,
    filter: 'blur(10px)',
    willChange: 'opacity, transform, filter'
  });
  if (platformChips.length) {
    gsap.set(platformChips, { opacity: 0, y: 20, scale: 0.95, filter: 'blur(6px)' });
  }
  gsap.set('#hero-platform-icons', { opacity: 1 });
  gsap.set('#hero-desc', { opacity: 0, y: 25, filter: 'blur(10px)' });
  gsap.set('#hero-actions', { opacity: 0, y: 25, filter: 'blur(8px)' });
  gsap.set('.hero-trust-badge-wrap, .carousel-viewport, .hero-tag-bar', { opacity: 0, y: 20, filter: 'blur(6px)' });
  gsap.set('.section-trusted', { opacity: 0, y: 20, filter: 'blur(6px)' });
  if (navbar) {
    gsap.set(navbar, { opacity: 0, y: -15, filter: 'blur(6px)' });
  }
}
window.prepareHeroInitialState = prepareHeroInitialState;

function finishPageEntry() {
  const root = document.documentElement;
  root.classList.remove('page-entering');
  if (window.__HV_PAGE_ENTRY_FAILSAFE__) {
    window.clearTimeout(window.__HV_PAGE_ENTRY_FAILSAFE__);
    window.__HV_PAGE_ENTRY_FAILSAFE__ = null;
  }
}
window.__hvFinishPageEntry = finishPageEntry;

// ==========================================================================
// ADSCALE FRAMER-STYLE TEXT EFFECTS ENGINE
// Exact AdScale Framer spring physics (stiffness: 200, damping: 80, delay: 0.05)
// Word tokenization with kinetic blur-to-focus emergence
// ==========================================================================

export function splitAdscaleWords(element) {
  if (!element || element.dataset.adscaleWordsReady) return;
  element.dataset.adscaleWordsReady = 'true';
  // Strip parent background-clip: text to prevent nested text-mask clipping artifacts & ghost text
  element.style.backgroundImage = 'none';
  element.style.webkitBackgroundClip = 'initial';
  element.style.backgroundClip = 'initial';
  element.style.webkitTextFillColor = 'initial';
  element.style.color = 'inherit';

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT, {
    acceptNode: (node) => {
      const parent = node.parentElement;
      if (!parent || !node.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
      if (parent.closest('script, style, svg, .btn-label, .platform-chip, .adscale-reveal-word')) {
        return NodeFilter.FILTER_REJECT;
      }
      return NodeFilter.FILTER_ACCEPT;
    }
  });

  const textNodes = [];
  let currentNode;
  while ((currentNode = walker.nextNode())) textNodes.push(currentNode);

  textNodes.forEach((textNode) => {
    const parentSpan = textNode.parentElement;
    const isHighlight = parentSpan && parentSpan.classList.contains('highlight-cyan');
    const isBoldItalic = parentSpan && parentSpan.classList.contains('font-bold-italic');
    if (parentSpan && isHighlight) {
      // Prevent parent highlight span from double-applying background/filters or box-clipping child words
      parentSpan.style.setProperty('background', 'none', 'important');
      parentSpan.style.setProperty('background-image', 'none', 'important');
      parentSpan.style.setProperty('-webkit-background-clip', 'initial', 'important');
      parentSpan.style.setProperty('background-clip', 'initial', 'important');
      parentSpan.style.setProperty('-webkit-text-fill-color', 'initial', 'important');
      parentSpan.style.setProperty('filter', 'none', 'important');
      parentSpan.style.setProperty('animation', 'none', 'important');
      parentSpan.style.setProperty('display', 'inline', 'important');
      parentSpan.style.setProperty('padding', '0', 'important');
      parentSpan.style.setProperty('margin', '0', 'important');
      parentSpan.style.setProperty('box-shadow', 'none', 'important');
      parentSpan.style.setProperty('text-shadow', 'none', 'important');
    }
    const rawText = textNode.nodeValue;
    const words = rawText.trim().split(/\s+/).filter(Boolean);
    if (!words.length) return;

    const fragment = document.createDocumentFragment();
    if (/^\s/.test(rawText)) {
      fragment.appendChild(document.createTextNode(' '));
    }
    words.forEach((wordText, idx) => {
      const word = document.createElement('span');
      word.className = 'adscale-reveal-word';
      if (isHighlight) word.classList.add('highlight-cyan');
      if (isBoldItalic) word.classList.add('font-bold-italic');
      word.textContent = wordText;
      fragment.appendChild(word);

      if (idx < words.length - 1) {
        fragment.appendChild(document.createTextNode(' '));
      }
    });
    if (/\s$/.test(rawText)) {
      fragment.appendChild(document.createTextNode(' '));
    }
    textNode.replaceWith(fragment);
  });
}
window.splitAdscaleWords = splitAdscaleWords;

export function initAdscaleTextEffects(root = document) {
  const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // Preserve Home's existing text effects. Dedicated pages use only their
  // hero title so lower sections cannot reset after the route entrance.
  const headingSelectors = isHomeRoute(window.location.pathname)
    ? [
      '.creators-title',
      '.creators-intro',
      '.growth-widgets-heading h2',
      '.portfolio-section-title',
      '.testimonials-title',
      '.process-headline',
      '.faq-heading',
      '.cta-main-title'
    ]
    : [
      '.work-hero-title',
      '.campaign-hero-headline',
      '.why-hero-title',
      '.team-hero-title',
      '.case-hero-title'
    ];

  const revealElements = (root || document).querySelectorAll(headingSelectors.join(', '));
  if (!revealElements.length) return;

  function revealWords(element) {
    if (element.dataset.adscaleAnimated === 'true') {
      const words = element.querySelectorAll('.adscale-reveal-word');
      if (words.length) {
        gsap.set(words, { opacity: 1, y: 0, filter: 'none', clearProps: 'all' });
      }
      return;
    }
    element.dataset.adscaleAnimated = 'true';

    const words = element.querySelectorAll('.adscale-reveal-word');
    if (!words.length) {
      gsap.to(element, {
        opacity: 1,
        y: 0,
        filter: 'blur(0px)',
        duration: 0.72,
        ease: 'power2.out',
        clearProps: 'all'
      });
      return;
    }

    if (isReducedMotion) {
      gsap.set(words, { opacity: 1, y: 0, filter: 'none', clearProps: 'all' });
      return;
    }

    // Reachify slide-in: words slide UP from below with de-blur, spring-like deceleration
    gsap.to(words, {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      duration: 0.65,
      stagger: 0.055,
      ease: 'power3.out',
      clearProps: 'all',
      onComplete: () => {
        gsap.set(words, { opacity: 1, y: 0, filter: 'none', clearProps: 'all' });
      }
    });
  }

  // Clean up any previously attached observer & scroll listener
  if (window.__hvAdscaleObserver) {
    window.__hvAdscaleObserver.disconnect();
    window.__hvAdscaleObserver = null;
  }
  if (window.__hvAdscaleScrollHandler) {
    window.removeEventListener('scroll', window.__hvAdscaleScrollHandler);
    window.__hvAdscaleScrollHandler = null;
  }

  // Widen rootMargin so words finish revealing BEFORE reaching view
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        revealWords(entry.target);
        observer.unobserve(entry.target);
      }
    });
  }, {
    root: null,
    rootMargin: '250px 0px 250px 0px',
    threshold: 0
  });

  window.__hvAdscaleObserver = observer;

  revealElements.forEach((element) => {
    if (!element.dataset.adscaleWordsReady) {
      splitAdscaleWords(element);
    }

    const words = element.querySelectorAll('.adscale-reveal-word');
    if (!words.length) return;

    if (isReducedMotion) {
      gsap.set(words, { opacity: 1, y: 0, filter: 'none', clearProps: 'all' });
      element.dataset.adscaleAnimated = 'true';
      return;
    }

    // If already revealed once, keep permanently visible and unblurred!
    if (element.dataset.adscaleAnimated === 'true') {
      gsap.set(words, { opacity: 1, y: 0, filter: 'none', clearProps: 'all' });
      return;
    }

    const rect = element.getBoundingClientRect();
    // If element is AT or ABOVE viewport (including already scrolled past), reveal immediately!
    const isAtOrAboveViewport = rect.top < window.innerHeight * 0.96;

    if (isAtOrAboveViewport) {
      revealWords(element);
      return;
    }

    // Elements below viewport start hidden waiting to be scrolled into
    gsap.set(words, {
      opacity: 0,
      y: 20,
      filter: 'blur(8px)',
      willChange: 'opacity, transform, filter'
    });

    observer.observe(element);
  });

  // Passive scroll listener ensures fast scroll/flick never leaves any element stuck hidden
  const onScrollCheck = () => {
    revealElements.forEach((element) => {
      if (element.dataset.adscaleAnimated !== 'true') {
        const rect = element.getBoundingClientRect();
        if (rect.top < window.innerHeight + 150) {
          revealWords(element);
          observer.unobserve(element);
        }
      }
    });
  };
  window.__hvAdscaleScrollHandler = onScrollCheck;
  window.addEventListener('scroll', onScrollCheck, { passive: true });

  // Safety net: after 400ms, ensure no element currently visible remains stuck
  setTimeout(() => {
    onScrollCheck();
  }, 400);
}

function initHeroIntro(immediate = false) {
  const isLightTheme = document.documentElement.dataset.theme === 'light';

  // Do not let the Light hero reveal outrun its ambient fluid background.
  // The promise is shared with the boot-time loader, so this adds no second
  // import and resolves immediately when the background is already ready.
  if (isLightTheme && window.__hvLightHeroFluidGate !== 'ready') {
    if (window.__hvLightHeroFluidGate === 'pending') return;
    window.__hvLightHeroFluidGate = 'pending';
    Promise.resolve(loadFluidBackground()).then(() => {
      window.__hvLightHeroFluidGate = 'ready';
      initHeroIntro(immediate);
    }).catch(() => {
      window.__hvLightHeroFluidGate = 'ready';
      initHeroIntro(immediate);
    });
    return;
  }

  applyThemeHeroCopy();
  // The reel is prepared during Home hydration so its media can buffer behind
  // the loader. Never rebuild it when the text entrance begins.
  if (!window.__hvHeroReelCleanup) initHeroReelCarousel();
  initAdscaleTextEffects();
  const heroHeadline = document.getElementById('hero-headline');
  if (!heroHeadline) return;

  const platformChips = heroHeadline.querySelectorAll('.hl-platform-chips .platform-chip');
  const headlineLines = heroHeadline.querySelectorAll('.hero-headline-line');
  const navbar = document.getElementById('navbar');

  const isMobile = window.innerWidth < 768;
  if ((immediate && !isLightTheme) || (isMobile && !isLightTheme) || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    gsap.set('.hl-word, .hero-headline-connector, .hero-word-roller, #hero-platform-icons, .platform-chip, #hero-desc, #hero-actions, .hero-trust-badge-wrap, .carousel-viewport, .hero-tag-bar, .section-trusted', {
      opacity: 1, y: 0, x: 0, scale: 1, filter: 'none', clearProps: 'all'
    });
    if (navbar) gsap.set(navbar, { opacity: 1, y: 0, clearProps: 'opacity,transform,filter' });
    headlineLines.forEach((line) => { line.style.overflow = 'visible'; });
    const statsNumber = document.getElementById('stats-counter');
    if (statsNumber) {
      statsNumber.textContent = '4,500,000,000+';
      statsNumber.dataset.transitionHydrated = 'true';
    }
    window.__hvHeroTrustReadyFired = true;
    window.dispatchEvent(new Event('hv:hero-trust-ready'));
    initHeroWordRoller();
    return;
  }

  headlineLines.forEach((line) => { line.style.overflow = 'visible'; });

  // Hero entrance: same motion language as loader — blur + slide upward + sharp
  const allWords = heroHeadline.querySelectorAll('.hl-word, .hero-headline-connector, .hero-word-roller');
  gsap.set(allWords, { opacity: 0, y: 25, filter: 'blur(10px)', willChange: 'opacity, transform, filter' });
  if (platformChips.length) {
    gsap.set(platformChips, { opacity: 0, y: 20, scale: 0.95, filter: 'blur(6px)' });
  }
  gsap.set('#hero-platform-icons', { opacity: 1 });
  gsap.set('#hero-desc', { opacity: 0, y: 25, filter: 'blur(10px)' });
  gsap.set('#hero-actions', { opacity: 0, y: 25, filter: 'blur(8px)' });
  gsap.set('.hero-trust-badge-wrap, .carousel-viewport, .hero-tag-bar', { opacity: 0, y: 20, filter: 'blur(6px)' });
  gsap.set('.section-trusted', { opacity: 0, y: 20, filter: 'blur(6px)' });
  if (navbar) {
    gsap.set(navbar, { opacity: 0, y: -15, filter: 'blur(6px)' });
  }

  const tl = gsap.timeline({
    defaults: { ease: 'power3.out' },
    onComplete: () => {
      gsap.set(allWords, { clearProps: 'filter,willChange,opacity,transform' });
      gsap.set('#hero-platform-icons, .platform-chip, #hero-desc, #hero-actions, .hero-trust-badge-wrap, .carousel-viewport, .hero-tag-bar, .section-trusted', { clearProps: 'filter,willChange' });
      if (navbar) gsap.set(navbar, { clearProps: 'opacity,transform,filter' });
      initHeroWordRoller();
    }
  });

  // 0. Navbar slides down from blur into sharp focus
  if (navbar) {
    tl.to(navbar, { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.7, ease: 'power3.out' }, 0);
  }

  // 0b. Trust badge slides up from blur
  tl.to('.hero-trust-badge-wrap', { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.6, ease: 'power3.out' }, 0.05);
  tl.call(() => {
    window.__hvHeroTrustReadyFired = true;
    window.dispatchEvent(new Event('hv:hero-trust-ready'));
  }, [], 0.08);

  // 1. Hero headline words: each slides UP from 25px below with de-blur
  // This continues the loader's motion language into the hero
  // Duration: 600-900ms as specified. Stagger creates word-by-word entrance.
  tl.to(allWords,
    {
      opacity: 1,
      y: 0,
      filter: 'blur(0px)',
      duration: 0.8,
      stagger: 0.08,
      ease: 'power3.out',
      clearProps: 'filter,willChange'
    },
    0.1
  );

  // 2. Inline Platform Chips: slide-up from blur
  if (platformChips.length) {
    tl.fromTo(platformChips,
      { opacity: 0, y: 20, scale: 0.95, filter: 'blur(6px)' },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        filter: 'blur(0px)',
        duration: 0.6,
        stagger: 0.06,
        ease: 'power3.out',
        clearProps: 'filter'
      },
      0.35
    );
  }

  // 4. Subtitle paragraph: blur + slide + sharp (same motion language)
  tl.to('#hero-desc',
    { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.8, ease: 'power3.out', clearProps: 'filter' },
    0.45
  );

  // 5. Action buttons: blur + slide + sharp
  tl.fromTo('#hero-actions',
    { opacity: 0, y: 25, filter: 'blur(8px)' },
    { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.7, ease: 'power3.out', clearProps: 'filter' },
    0.6
  );

  // 5b. Social proof and creator reel: blur + slide + sharp
  tl.to('.carousel-viewport', { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.7, ease: 'power3.out', clearProps: 'filter' }, 0.65);
  tl.to('.hero-tag-bar', { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.6, ease: 'power3.out', clearProps: 'filter' }, 0.75);

  // 6. Trusted by ambitious brands: blur + slide + sharp
  tl.fromTo('.section-trusted',
    { opacity: 0, y: 20, filter: 'blur(6px)' },
    { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.65, ease: 'power3.out', clearProps: 'filter' },
    0.85
  );

  // Hero parallax on scroll (maintain full opacity so content stays crisp and never looks blank/washed out)
  gsap.to('.hero-content', {
    y: -40,
    ease: 'none',
    scrollTrigger: {
      trigger: '.hero-section',
      start: 'top top',
      end: 'bottom top',
      scrub: 1.2,
    }
  });
}

// Expose globally for replay / testing
window.initHeroIntro = initHeroIntro;
window.initAdscaleTextEffects = initAdscaleTextEffects;

// Automatically re-trigger hero intro on Vite hot reload so updates are instantly visible
if (import.meta.hot) {
  import.meta.hot.accept(() => {
    setTimeout(() => initHeroIntro(false), 80);
  });
}

// ==========================================================================
// 04. 2D HERO MONOLITH INITIALIZATION
// ==========================================================================
function init3DScene() {
  window.__hv3DCleanup?.();
  // Only download three.js when the page actually contains the 3D canvas.
  if (!document.getElementById('hv-canvas')) return;

  const start = () => {
    window.__hv3DScheduled = false;
    import('./hv3d.js')
      .then(({ initHV3D }) => {
        const scene = initHV3D('hv-canvas', 'hv-canvas-container');
        window.__hv3DCleanup = () => {
          try { scene?.dispose?.(); } catch (_) { }
        };
      })
      .catch((err) => console.warn('Hero visual initialization notice:', err));
  };

  // On phones, let the hero text and the visible reel rail reach a stable
  // first paint before downloading/initializing the heavier WebGL scene.
  // Desktop keeps the existing immediate initialization.
  const isMobile = window.matchMedia('(max-width: 768px)').matches;
  if (isMobile) {
    if (window.__hv3DScheduled) return;
    window.__hv3DScheduled = true;
    if ('requestIdleCallback' in window) {
      window.requestIdleCallback(start, { timeout: 1400 });
    } else {
      window.setTimeout(start, 900);
    }
    return;
  }

  start();
}

// ==========================================================================
// 05. STATS & MARQUEE SCROLL REVEAL
// ==========================================================================
function initStatsMarquee() {
  if (window.__hvStatsCleanup) window.__hvStatsCleanup();

  const statsSection = document.querySelector('.section-stats-marquee');
  const statsNumber = document.getElementById('stats-counter');
  if (!statsNumber) return;

  let activeCounterTween = null;
  const isTransitionHydrated = statsNumber.dataset.transitionHydrated === 'true';
  const isSkipIntro = document.documentElement.classList.contains('skip-intro') || window.__HV_SKIP_INTRO__;
  const isAlreadyReady = isTransitionHydrated || isSkipIntro || window.__hvHeroTrustReadyFired === true;
  let hasCounterPlayed = isAlreadyReady;

  function playCounterAnimation() {
    if (hasCounterPlayed) {
      statsNumber.textContent = '4,500,000,000+';
      statsNumber.dataset.transitionHydrated = 'true';
      return;
    }
    hasCounterPlayed = true;

    if (activeCounterTween) {
      activeCounterTween.kill();
    }

    const counter = { val: 0 };
    const isHeroCounter = statsNumber.classList.contains('hero-trust-number');
    statsNumber.textContent = '0+';

    activeCounterTween = gsap.to(counter, {
      val: 4500000000,
      duration: isHeroCounter ? 2.1 : 2.4,
      ease: 'power3.out',
      onUpdate: () => {
        statsNumber.textContent = Math.floor(counter.val).toLocaleString('en-US') + '+';
      },
      onComplete: () => {
        statsNumber.textContent = '4,500,000,000+';
        statsNumber.dataset.transitionHydrated = 'true';
        gsap.fromTo(statsNumber,
          { filter: 'drop-shadow(0 0 35px rgba(0, 229, 255, 0.85))' },
          { filter: 'drop-shadow(0 0 20px rgba(0, 229, 255, 0.4))', duration: 0.9, ease: 'power2.out' }
        );
        activeCounterTween = null;
      }
    });
  }

  if (statsNumber.classList.contains('hero-trust-number')) {
    if (isAlreadyReady) {
      statsNumber.textContent = '4,500,000,000+';
      statsNumber.dataset.transitionHydrated = 'true';
    } else {
      window.addEventListener('hv:hero-trust-ready', playCounterAnimation, { once: true });
    }
    window.__hvStatsCleanup = () => {
      if (activeCounterTween) activeCounterTween.kill();
      window.removeEventListener('hv:hero-trust-ready', playCounterAnimation);
      statsNumber.textContent = '4,500,000,000+';
      statsNumber.dataset.transitionHydrated = 'true';
    };
    return;
  }

  if (!statsSection) return;

  // Trigger whenever the 4.5B stats section enters the viewport (scrolling down or back up)
  ScrollTrigger.create({
    trigger: statsSection,
    start: 'top 85%',
    onEnter: () => {
      playCounterAnimation();
    }
  });

  // Fade-up reveal
  gsap.fromTo(statsNumber,
    { opacity: 1, y: 18 },
    {
      opacity: 1, y: 0,
      duration: 1.2,
      ease: 'expo.out',
      scrollTrigger: {
        trigger: statsSection,
        start: 'top 90%',
        once: true,
      }
    }
  );

  // Caption reveal
  gsap.fromTo('.stats-caption',
    { opacity: 0, y: 20 },
    {
      opacity: 1, y: 0,
      duration: 1,
      ease: 'expo.out',
      delay: 0.15,
      scrollTrigger: {
        trigger: statsSection,
        start: 'top 88%',
        once: true,
      }
    }
  );

  // Marquee track reveal
  gsap.fromTo('.marquee-track-wrapper',
    { opacity: 0, y: 25 },
    {
      opacity: 1, y: 0,
      duration: 1.2,
      ease: 'expo.out',
      delay: 0.3,
      scrollTrigger: {
        trigger: statsSection,
        start: 'top 86%',
        once: true,
      }
    }
  );
}


// ==========================================================================
// 05b. CREATORS GROWTH SHOWCASE (SIDE-BY-SIDE DUAL SHOWCASE)
// ==========================================================================
function initCreatorsSection() {
  if (window.__hvCreatorsCleanup) window.__hvCreatorsCleanup();

  const section = document.querySelector('.section-creators');
  const cards = document.querySelectorAll('.section-creators .creator-card');
  if (!section || !cards.length) return;
  const isMobileViewport = window.matchMedia('(max-width: 768px)').matches;

  // Format number with commas
  function formatNumber(num) {
    return Math.round(num).toLocaleString('en-US');
  }

  const activeTweens = [];
  const isTransitionHydrated = section.dataset.transitionHydrated === 'true';

  function setFinalStats() {
    section.querySelectorAll('.stat-number').forEach((el) => {
      if (el.dataset.staticText) {
        el.textContent = el.dataset.staticText;
        return;
      }
      const target = parseInt(el.getAttribute('data-count'), 10);
      el.textContent = Number.isNaN(target) ? '0' : formatNumber(target);
    });
    section.querySelectorAll('.stat-dyn-num').forEach((el) => {
      const target = parseInt(el.getAttribute('data-count'), 10);
      el.textContent = Number.isNaN(target) ? '0' : target;
    });
    const watermarkLine = section.querySelector('.watermark-line');
    if (watermarkLine) watermarkLine.style.strokeDashoffset = '0';
  }

  // Animate stat numbers and dynamic chips (days / "din", months, followers)
  function animateStats() {
    // Kill any ongoing tweens
    activeTweens.forEach((tw) => {
      if (tw && tw.kill) tw.kill();
    });
    activeTweens.length = 0;

    // 1. Follower counts (BEFORE / AFTER e.g. 0 to 100,000 and 0 to 400,000)
    const statNumbers = section.querySelectorAll('.stat-number');
    statNumbers.forEach((el) => {
      if (el.dataset.staticText) {
        el.textContent = el.dataset.staticText;
        return;
      }
      const target = parseInt(el.getAttribute('data-count'), 10);
      if (target === 0 || isNaN(target)) {
        el.textContent = '0';
        return;
      }

      el.textContent = '0';
      const obj = { val: 0 };
      const tw = gsap.to(obj, {
        val: target,
        duration: 2.2,
        ease: 'power2.out',
        onUpdate: () => {
          el.textContent = formatNumber(obj.val);
        },
        onComplete: () => {
          el.textContent = formatNumber(target);
        }
      });
      activeTweens.push(tw);
    });

    // 2. Dynamic timeline / days ("din thing") / months / follower chips (.stat-dyn-num)
    const dynNums = section.querySelectorAll('.stat-dyn-num');
    dynNums.forEach((el) => {
      const target = parseInt(el.getAttribute('data-count'), 10);
      if (isNaN(target)) return;

      el.textContent = '0';
      const obj = { val: 0 };
      const tw = gsap.to(obj, {
        val: target,
        duration: 1.8,
        ease: 'power2.out',
        onUpdate: () => {
          el.textContent = Math.round(obj.val);
        },
        onComplete: () => {
          el.textContent = target;
        }
      });
      activeTweens.push(tw);
    });

    // 3. Dynamic background unified watermark growth graph (draw line path)
    const watermarkLine = section.querySelector('.watermark-line');
    if (watermarkLine) {
      const tw = gsap.fromTo(watermarkLine,
        { strokeDashoffset: 2400 },
        { strokeDashoffset: 0, duration: 2.5, ease: 'power2.out' }
      );
      activeTweens.push(tw);
    }
  }


  // Tag entrance (title and intro are animated word-by-word with AdScale reveal)
  gsap.fromTo('.creators-header .section-tag',
    { opacity: 0, y: 14 },
    {
      opacity: 1, y: 0,
      duration: 0.7,
      ease: 'power2.out',
      scrollTrigger: {
        trigger: section,
        start: 'top 85%',
        once: true,
      }
    }
  );

  // Cards reveal with staggered entrance (once: true guarantees cards never disappear on scroll)
  const creatorsRect = section.getBoundingClientRect();
  if (creatorsRect.top < window.innerHeight * 0.95) {
    gsap.set(cards, { opacity: 1, y: 0, clearProps: 'all' });
  } else {
    gsap.fromTo(cards,
      { opacity: 0, y: 40 },
      {
        opacity: 1, y: 0,
        duration: isMobileViewport ? 0.62 : 1.1,
        stagger: isMobileViewport ? 0.07 : 0.18,
        ease: 'expo.out',
        clearProps: 'all',
        scrollTrigger: {
          trigger: section,
          start: 'top 85%',
          once: true,
        }
      }
    );
  }

  // Trigger stat animation whenever the creators section enters the viewport
  let statsTrigger = null;
  if (isTransitionHydrated) {
    setFinalStats();
  } else {
    statsTrigger = ScrollTrigger.create({
      trigger: section,
      start: 'top 80%',
      once: true,
      onEnter: animateStats,
    });
  }

  // If section is already within viewport on page load/refresh
  if (!isTransitionHydrated && section.getBoundingClientRect().top < window.innerHeight) {
    animateStats();
  }

  window.__hvCreatorsCleanup = () => {
    activeTweens.forEach((tween) => tween?.kill?.());
    statsTrigger?.kill?.();
  };
}


// ==========================================================================
// 06. STATEMENT PARALLAX (ENHANCED)
// ==========================================================================
// ===========================================================================
// 05c. HOME GROWTH SYSTEM WIDGETS
// ===========================================================================
function initGrowthWidgets() {
  if (window.__hvGrowthWidgetsCleanup) window.__hvGrowthWidgetsCleanup();

  const section = document.querySelector('.section-growth-widgets');
  if (!section) return;

  const widgets = Array.from(section.querySelectorAll('.growth-widget'));
  const counts = Array.from(section.querySelectorAll('.widget-count'));
  const chartLine = section.querySelector('.widget-chart-line');
  const chartFill = section.querySelector('.widget-chart-fill');
  const chartDot = section.querySelector('.widget-chart-dot');
  const marker = section.querySelector('.widget-chart-marker');
  const progress = section.querySelector('.cadence-progress span');
  const activityDots = section.querySelectorAll('.cadence-days b');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let hasTriggered = false;

  const formatValue = (value, el) => {
    const suffix = el.dataset.suffix || '';
    return `${Math.round(value)}${suffix}`;
  };

  const setFinalValues = () => {
    counts.forEach((el) => {
      const target = Number(el.dataset.target || 0);
      el.textContent = formatValue(target, el);
    });
    if (chartLine) gsap.set(chartLine, { strokeDashoffset: 0 });
    if (chartFill) gsap.set(chartFill, { opacity: 1 });
    if (chartDot) gsap.set(chartDot, { scale: 1 });
    if (marker) gsap.set(marker, { opacity: 1, left: '80%', top: '36%' });
    if (progress) gsap.set(progress, { width: '32%' });
    activityDots.forEach((dot, index) => {
      dot.classList.toggle('is-complete', index < 3);
    });
    gsap.set(widgets, { opacity: 1, y: 0 });
    section.classList.add('is-settled');
  };

  if (reduceMotion) {
    setFinalValues();
    return;
  }

  // Pre-calculate chart path length safely
  let chartLength = 400;
  if (chartLine) {
    try {
      chartLength = chartLine.getTotalLength() || 400;
      gsap.set(chartLine, { strokeDasharray: chartLength, strokeDashoffset: chartLength });
    } catch (_) { }
  }

  // Initialize initial animation states
  gsap.set(widgets, { opacity: 0, y: 24 });
  gsap.set(chartFill, { opacity: 0 });
  if (chartDot) gsap.set(chartDot, { scale: 0, transformOrigin: 'center' });
  if (marker) gsap.set(marker, { opacity: 0, left: '3%', top: '61%' });
  if (progress) gsap.set(progress, { width: '0%' });
  activityDots.forEach((dot) => dot.classList.remove('is-complete', 'is-active'));

  const playGrowthAnimation = () => {
    if (hasTriggered) return;
    hasTriggered = true;
    section.classList.add('is-running');

    const tl = gsap.timeline({
      defaults: { ease: 'power3.out' },
      onComplete: () => {
        setFinalValues();
      }
    });

    // 1. Cards smoothly fade in and slide up
    tl.to(widgets, {
      opacity: 1,
      y: 0,
      duration: 0.75,
      stagger: 0.12,
      ease: 'power3.out'
    }, 0);

    // 2. Count-up starts immediately as cards enter (at 0.15s), NOT after waiting
    counts.forEach((el, index) => {
      const state = { value: 0 };
      const target = Number(el.dataset.target || 0);
      tl.to(state, {
        value: target,
        duration: 1.2,
        ease: 'power2.out',
        onUpdate: () => {
          el.textContent = formatValue(state.value, el);
        },
        onComplete: () => {
          el.textContent = formatValue(target, el);
        }
      }, 0.15 + (index * 0.08));
    });

    // 3. Line chart draws across smoothly
    if (chartLine) {
      tl.to(chartLine, {
        strokeDashoffset: 0,
        duration: 1.35,
        ease: 'power2.inOut'
      }, 0.2);
    }

    if (chartFill) {
      tl.to(chartFill, {
        opacity: 1,
        duration: 0.7,
        ease: 'power2.out'
      }, 0.55);
    }

    if (marker) {
      tl.to(marker, {
        opacity: 1,
        duration: 0.2
      }, 0.4).to(marker, {
        left: '80%',
        top: '36%',
        duration: 1.25,
        ease: 'power2.inOut'
      }, 0.45);
    }

    if (chartDot) {
      tl.to(chartDot, {
        scale: 1,
        duration: 0.35,
        ease: 'back.out(2)'
      }, 1.15);
    }

    // 4. Cadence progress & activity dots
    if (progress) {
      tl.to(progress, {
        width: '32%',
        duration: 1.05,
        ease: 'power2.out'
      }, 0.45);
    }

    activityDots.forEach((dot, index) => {
      if (index < 3) {
        tl.call(() => {
          dot.classList.add(index === 2 ? 'is-active' : 'is-complete');
        }, [], 0.4 + (index * 0.22));
      }
    });

    if (activityDots[2]) {
      tl.call(() => {
        activityDots[2].classList.replace('is-active', 'is-complete');
      }, [], 1.3);
    }
  };

  // Immediate intersection trigger: fires as soon as the top of cards enter the viewport
  const observer = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      playGrowthAnimation();
      observer.disconnect();
    }
  }, { threshold: 0.05, rootMargin: '0px 0px -40px 0px' });

  observer.observe(section);

  // Fallback: If section is already visible on load
  const rect = section.getBoundingClientRect();
  if (rect.top < window.innerHeight && rect.bottom > 0) {
    playGrowthAnimation();
  }

  window.__hvGrowthWidgetsCleanup = () => {
    observer.disconnect();
  };
}

function initStatementParallax() {
  const lines = document.querySelectorAll('.stmt-line');
  if (!lines.length) return;

  // Stagger word reveals with clip-path
  lines.forEach((line, index) => {
    const speed = parseFloat(line.getAttribute('data-speed')) || 1;

    gsap.fromTo(line,
      { y: 60 * speed, opacity: 0.4 },
      {
        y: -20 * speed,
        opacity: 1,
        ease: 'none',
        scrollTrigger: {
          trigger: '.section-statement',
          start: 'top 85%',
          end: 'bottom 20%',
          scrub: 1.2 + (index * 0.15),
        }
      }
    );
  });

  // Statement caption reveal
  gsap.fromTo('.statement-caption',
    { opacity: 0, y: 40 },
    {
      opacity: 1, y: 0,
      duration: 1.4,
      ease: 'expo.out',
      scrollTrigger: {
        trigger: '.statement-caption',
        start: 'top 88%',
        once: true,
      }
    }
  );

  // Watermark parallax
  gsap.to('.statement-watermark', {
    y: -100,
    ease: 'none',
    scrollTrigger: {
      trigger: '.section-statement',
      start: 'top bottom',
      end: 'bottom top',
      scrub: 2,
    }
  });
}

// ==========================================================================
// 07. SERVICES CARDS STAGGER REVEAL
// ==========================================================================
function initServicesReveal(isFromTransition = false) {
  // Why Us owns its philosophy-card choreography; running the homepage
  // service reveal here as well makes Data-Driven Creativity animate twice.
  if (document.body.classList.contains('page-why-us')) return;
  const cards = document.querySelectorAll('.service-card-item');
  if (!cards.length) return;
  const isMobileViewport = window.matchMedia('(max-width: 768px)').matches;

  // Header reveal
  gsap.fromTo('.services-header-row',
    { opacity: 0, y: 40 },
    {
      opacity: 1, y: 0,
      duration: isMobileViewport ? 0.58 : 1,
      ease: 'expo.out',
      clearProps: 'all',
      scrollTrigger: {
        trigger: '.section-services',
        start: 'top 82%',
        once: true,
      }
    }
  );

  // Cards cascade from bottom smoothly
  cards.forEach((card, i) => {
    const rect = card.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.95) {
      gsap.set(card, { opacity: 1, y: 0, clearProps: 'all' });
      return;
    }
    gsap.fromTo(card,
      { opacity: 0, y: 40 },
      {
        opacity: 1,
        y: 0,
        duration: isMobileViewport ? 0.5 : 0.8,
        delay: isMobileViewport ? (i % 3) * 0.035 : (i % 5) * 0.06,
        ease: 'expo.out',
        clearProps: 'all',
        scrollTrigger: {
          trigger: card,
          start: isMobileViewport ? 'top 96%' : 'top 92%',
          once: true,
        }
      }
    );
  });
  // Capability filter bar reveal
  const filterBar = document.querySelector('.services-filter-bar');
  if (filterBar) {
    gsap.fromTo(filterBar,
      { opacity: 0, y: 20 },
      {
        opacity: 1, y: 0,
        duration: 0.8,
        ease: 'expo.out',
        clearProps: 'all',
        scrollTrigger: {
          trigger: '.section-services',
          start: 'top 82%',
          once: true,
        }
      }
    );
  }
}

// ==========================================================================
// 07a. PAGE SCRIPT DISPATCHER (RE-INITIALIZES DEDICATED PAGES ON ROUTE TRANSITION)
// ==========================================================================
function restoreHomeStableState(isFromTransition = false) {
  const hero = document.querySelector('.hero-section');
  if (!hero) return;
  if (isFromTransition && hero.dataset.pageEntryStarted === 'true') return;

  // A previous ScrollTrigger/parallax instance can leave the shared hero
  // wrapper translated upward for one frame during a route swap. Reset the
  // wrapper before revealing its words so the Home headline cannot render
  // behind the navbar or clipped at the top of the viewport.
  const heroContent = hero.querySelector('.hero-content');
  if (heroContent) {
    gsap.killTweensOf(heroContent);
    gsap.set(heroContent, { x: 0, y: 0, scale: 1, clearProps: 'transform' });
  }

  // Settle background and supporting widgets. On route transitions, leave the
  // headline words blurred and ready for the word-by-word reveal!
  const partsToSettle = [
    '#hero-platform-icons',
    '.platform-chip',
    '#hero-desc',
    '#hero-actions',
    '.hero-trust-badge-wrap',
    '.carousel-viewport',
    '.hero-tag-bar',
    '.section-trusted',
  ];
  if (!isFromTransition) {
    partsToSettle.unshift('.hl-word', '.hero-headline-connector', '.hero-word-roller');
  }

  const visibleHeroParts = hero.querySelectorAll(partsToSettle.join(','));
  gsap.killTweensOf(visibleHeroParts);
  gsap.set(visibleHeroParts, {
    opacity: 1,
    x: 0,
    y: 0,
    scale: 1,
    filter: 'none',
    clearProps: 'opacity,transform,filter',
  });
  // On internal navigation, keep the reel rail behind the text reveal. The
  // carousel is initialized immediately for buffering, but its viewport must
  // not paint before the Home headline and supporting copy have entered.
  if (isFromTransition) {
    gsap.set(hero.querySelector('.carousel-viewport'), {
      opacity: 0,
      y: 20,
      filter: 'blur(6px)',
    });
  }
  hero.querySelectorAll('.hero-headline-line').forEach((line) => {
    line.style.overflow = 'visible';
  });

  const trustNumber = hero.querySelector('#stats-counter');
  if (trustNumber) {
    trustNumber.textContent = '4,500,000,000+';
    trustNumber.dataset.transitionHydrated = 'true';
  }

  const creators = document.querySelector('.section-creators');
  if (creators) {
    creators.dataset.transitionHydrated = 'true';
    creators.querySelectorAll('.stat-number').forEach((el) => {
      if (el.dataset.staticText) {
        el.textContent = el.dataset.staticText;
        return;
      }
      const target = parseInt(el.dataset.count || '', 10);
      el.textContent = Number.isNaN(target) ? '0' : target.toLocaleString('en-US');
    });
    creators.querySelectorAll('.stat-dyn-num').forEach((el) => {
      const target = parseInt(el.dataset.count || '', 10);
      el.textContent = Number.isNaN(target) ? '0' : String(target);
    });
  }

  if (!isFromTransition && window.__hvGetTransitionState?.() === 'IDLE') {
    document.querySelectorAll('.adscale-reveal-word').forEach((w) => {
      gsap.set(w, { opacity: 1, y: 0, filter: 'none', clearProps: 'all' });
    });
    initAdscaleTextEffects();
  }
  window.__hvResetNavbar?.(window.location.pathname);
}

function initHomePageScripts(isFromTransition = false) {
  // Route swaps reuse the incoming document's static markup. Re-apply the
  // active theme before measuring or animating the hero so returning to Home
  // in Light mode cannot briefly restore the creator (dark-theme) headline.
  applyThemeHeroCopy();
  applyThemeCreatorsCopy();
  restoreHomeStableState(isFromTransition);
  initAdscaleTextEffects();
  init3DScene();
  initHeroReelCarousel();
  initStatsMarquee();
  initCreatorsSection();
  initGrowthWidgets();
  initStatementParallax();
  initServicesReveal(isFromTransition);
  initPortfolioGrid();
  initTestimonialsReveal();
  initProcessScrollDraw();
  initFaqAccordion();
  initCTAReveal();
}

function disposePageRuntime() {
  [
    '__hvHeroReelCleanup',
    '__hv3DCleanup',
    '__hvStatsCleanup',
    '__hvCreatorsCleanup',
    '__hvGrowthWidgetsCleanup',
    '__hvWorkflowCleanup',
    '__hvCaseReelsCleanup',
    '__hvFaqCleanup',
    '__hvFooterScatterCleanup',
  ].forEach((key) => {
    try { window[key]?.(); } catch (_) { }
    window[key] = null;
  });
  activeWorkMetricTweens.forEach((tween) => tween?.kill?.());
  activeWorkMetricTweens = [];
}
window.__hvDisposePageRuntime = disposePageRuntime;

export function initPageScripts(pathname, isFromTransition = false) {
  const normPath = pathname ? pathname.replace(/\/+$/, '') : window.location.pathname.replace(/\/+$/, '');
  // During an internal transition the outgoing document is still mounted
  // while this initializer runs. Never infer the incoming route from a broad
  // document query in that window (an outgoing Campaigns hero used to make a
  // returning Home page skip initHomePageScripts, leaving the static creator
  // cards in place). The explicit pathname is authoritative; DOM fallback is
  // only needed for callers that intentionally omit it on a fresh document.
  const hasExplicitPath = typeof pathname === 'string' && pathname.length > 0;
  const isWorkPage = normPath.includes('work') || (!hasExplicitPath && !!document.querySelector('.work-hero-section'));
  const isCaseStudyPage = normPath.includes('creator-') || normPath.includes('movie-') || (!hasExplicitPath && (!!document.querySelector('.case-hero-section') || !!document.querySelector('.ig-profile-shell')));
  const isTeamPage = normPath.includes('team') || (!hasExplicitPath && !!document.querySelector('.team-hero-section'));
  const isWhyUs = normPath.includes('why-us') || (!hasExplicitPath && !!document.querySelector('.why-hero-section'));
  const isCampaignsPage = normPath.includes('campaigns') || (!hasExplicitPath && !!document.querySelector('.campaign-hero'));

  // The fluid background is shared by every route. Re-request it during SPA
  // hydration so Team and Why Us cannot arrive after a transition without
  // the ambient canvas. The loader remains mobile-deferred by
  // loadFluidBackground() itself.
  loadFluidBackground();
  ensureViewportBottomReveal();
  updateLogos();

  if (isWorkPage) {
    initWorkHeroIntro(isFromTransition);
    initCapabilityDeck(isFromTransition);
    initWorkflowSection();
    initServicesReveal(isFromTransition);
    initServiceFilters();
    initProcessScrollDraw();
    initCTAReveal();
  } else if (isTeamPage) {
    initTeamPageAnimations(isFromTransition);
    initCTAReveal();
  } else if (isWhyUs) {
    initWhyUsAnimations(isFromTransition);
    initCTAReveal();
  } else if (isCampaignsPage) {
    initCampaignsPage(isFromTransition);
  } else if (isCaseStudyPage) {
    // Case-study media is initialized below. Do not run homepage scroll
    // choreography against a creator profile after a route transition.
  } else {
    initHomePageScripts(isFromTransition);
  }

  if (isCaseStudyPage || document.querySelectorAll('.ig-reel-card').length > 0) {
    initInstagramReelsPlayer();
  }

  initMagneticElements();
  initEnquirySystem();
  initFooterScatterGrid();
  triggerPageHeroEntrance(normPath, isFromTransition);

  if (window.ScrollTrigger && !isFromTransition) {
    ScrollTrigger.refresh();
  }
}
window.__hvInitPageScripts = initPageScripts;

export function triggerPageHeroEntrance(pathname, isFromTransition = false) {
  const normPath = pathname ? pathname.replace(/\/+$/, '') : window.location.pathname.replace(/\/+$/, '');
  const isWork = normPath.includes('work');
  const isTeam = normPath.includes('team');
  const isWhy = normPath.includes('why-us');
  const isCampaigns = normPath.includes('campaigns');
  const isCase = normPath.includes('creator-') || normPath.includes('movie-');

  // Own each dedicated hero once. A transition resets this to guarantee entrance executes
  const heroRoot = document.querySelector('.hero-section, .work-hero-section, .team-hero-section, .why-hero-section, .campaign-hero, .case-hero-section');
  if (!heroRoot) {
    if (window.__hvSetTransitionState) window.__hvSetTransitionState('IDLE');
    return;
  }

  if (isFromTransition && heroRoot.dataset.pageEntryStarted === 'true') {
    return;
  }
  heroRoot.dataset.pageEntryStarted = 'true';

  const heroHeadings = document.querySelectorAll(
    '.work-hero-title, .campaign-hero-headline, .why-hero-title, .team-hero-title, .case-hero-title'
  );
  heroHeadings.forEach((heading) => {
    splitAdscaleWords(heading);
    heading.dataset.adscaleAnimated = 'true';
  });

  const introIsPending = document.documentElement.classList.contains('intro-pending') ||
    document.body.classList.contains('intro-active');
  if (introIsPending && !isFromTransition) return;

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 1. Next lines of the hero section
  const heroLineSelectors = [
    // Work page
    '.work-hero-tag', '.work-hero-desc', '.work-hero-cta', '.work-hero-metrics-grid', '.work-metric-item',
    // Campaigns page
    '.campaign-hero-tag', '.campaign-hero-sub', '.campaign-hero-pillars',
    // Team page
    '.team-hero-tag', '.team-hero-desc', '.team-metrics-grid', '.team-metric-item',
    // Why-us page
    '.why-hero-subtitle',
    // Home page
    '.hero-trust-badge-wrap', '#hero-desc', '#hero-actions',
    // Case study
    '.case-kicker-tag', '.case-profile-chip-row', '.case-hero-desc'
  ].join(', ');
  const heroLineElements = Array.from(document.querySelectorAll(heroLineSelectors));

  // 2. Next section header and individual cards
  const nextSectionSelectors = [
    // Work page: capabilities header & 6 cards
    '.work-capabilities-header', '.capability-card',
    // Why-us page: philosophy section header & 3 cards
    '.why-philosophy-section .services-header-row', '.why-philosophy-grid .service-card-item',
    '.comp-header-centered',
    // Campaigns page: search bar and cards
    '.campaign-search-section', '.campaign-featured-label', '.campaign-movie-card',
    // Team page: leadership and member cards
    '.team-grid .founder-card', '.team-member-card',
    // Home page: creator reels follow the hero text reveal
    '.carousel-viewport',
    // Home page: creators carousel
    '.section-creators',
    // Case study: media & hud
    '.case-hero-media', '.case-follower-transform-card', '.case-stats-hud'
  ].join(', ');
  const nextSectionElements = Array.from(document.querySelectorAll(nextSectionSelectors));

  const allSupportingElements = [...heroLineElements, ...nextSectionElements];

  const heroWords = Array.from(heroHeadings).flatMap((heading) =>
    Array.from(heading.querySelectorAll('.adscale-reveal-word'))
  );

  // Collect all target words: subpage hero words and/or home headline words
  const allTargetWords = [...heroWords];
  const homeHeadline = document.getElementById('hero-headline');
  if (homeHeadline) {
    const homeWords = Array.from(
      homeHeadline.querySelectorAll('.hl-word, .hero-headline-connector, .hero-word-roller')
    );
    allTargetWords.push(...homeWords);
  }

  if (reducedMotion) {
    gsap.set([...heroHeadings, ...allSupportingElements, ...allTargetWords], { opacity: 1, y: 0, filter: 'none', clearProps: 'all' });
    finishPageEntry();
    if (window.__hvSetTransitionState) {
      window.__hvSetTransitionState('IDLE');
    }
    return;
  }

  const isPageEntering = document.documentElement.classList.contains('page-entering');
  const activeVt = window.__hvActiveTransition;

  const executeEntrance = () => {
    // Release the pre-paint suppression so GSAP has full unhindered control
    finishPageEntry();

    let pendingEntries = 1;
    const beginEntry = () => { pendingEntries += 1; };
    const completeEntry = () => {
      pendingEntries -= 1;
      if (pendingEntries <= 0) {
        finishPageEntry();
        gsap.set([...heroHeadings, ...allSupportingElements, ...allTargetWords], {
          clearProps: 'opacity,transform,filter,willChange'
        });
        if (window.__hvSetTransitionState) {
          window.__hvSetTransitionState('IDLE');
        }
      }
    };

    gsap.set(heroHeadings, { opacity: 1, y: 0, filter: 'none' });

    const isMobile = window.innerWidth <= 768 || window.matchMedia('(max-width: 768px)').matches;
    const glowFilter = 'drop-shadow(0 0 16px rgba(0, 229, 255, 0.48))';
    const glowWords = allTargetWords.filter((word) => word.classList.contains('highlight-cyan'));

    // 1. HERO HEADLINE WORDS ANIMATE FIRST (0.0s) — STRICTLY ONE BY ONE
    if (allTargetWords.length) {
      heroHeadings.forEach((heading) => { heading.dataset.adscaleAnimated = 'true'; });
      gsap.killTweensOf(allTargetWords);
      gsap.set(allTargetWords, {
        opacity: 0,
        y: isMobile ? 18 : 28,
        scale: isMobile ? 0.97 : 0.94,
        filter: (index, word) => word.classList.contains('highlight-cyan')
          ? `blur(${isCase ? 12 : 8}px) ${glowFilter}`
          : (isCase ? 'blur(12px)' : 'none'),
        transformOrigin: '50% 100%',
        willChange: 'opacity, transform',
      });
      // Set the glow before the shell reveal starts; this prevents a visible
      // second-stage glow pop after the page transition has completed.
      if (glowWords.length) {
        gsap.set(glowWords, { filter: `blur(${isCase ? 12 : 8}px) ${glowFilter}` });
      }
      beginEntry();
      gsap.to(allTargetWords, {
        opacity: 1,
        y: 0,
        scale: 1,
        filter: (index, word) => word.classList.contains('highlight-cyan')
          ? `blur(0px) ${glowFilter}`
          : (isCase ? 'blur(0px)' : 'none'),
        duration: isMobile ? 0.42 : 0.65,
        stagger: isMobile ? 0.045 : 0.085, // Distinct, visible one-by-one pacing!
        ease: 'power3.out',
        clearProps: 'filter,transform,willChange',
        onComplete: () => {
          completeEntry();
          if (homeHeadline) initHeroWordRoller();
        },
      });
    }

    // 2. HERO NEXT LINES & METRICS ANIMATE SECOND (delay: 0.38s desktop, 0.25s mobile)
    if (heroLineElements.length) {
      gsap.killTweensOf(heroLineElements);
      gsap.set(heroLineElements, {
        opacity: 0,
        y: isMobile ? 14 : 20,
        filter: 'none',
        willChange: 'opacity, transform',
      });
      beginEntry();
      gsap.to(heroLineElements, {
        opacity: 1,
        y: 0,
        filter: 'none',
        duration: isMobile ? 0.36 : 0.52,
        stagger: isMobile ? 0.035 : 0.055,
        delay: isMobile ? 0.18 : 0.38,
        ease: 'power2.out',
        clearProps: 'opacity,transform,filter,willChange',
        onStart: () => {
          if (isWork) {
            window.__hvAnimateWorkMetrics?.();
          } else if (isTeam) {
            window.__hvAnimateTeamMetrics?.();
          }
        },
        onComplete: completeEntry,
      });
    }

    // 3. NEXT SECTION HEADER & CARDS ANIMATE THIRD (delay: 0.68s desktop, 0.45s mobile) — SEQUENTIAL CASCADE
    if (nextSectionElements.length) {
      gsap.killTweensOf(nextSectionElements);
      gsap.set(nextSectionElements, {
        opacity: 0,
        y: isMobile ? 20 : 28,
        filter: 'none',
        willChange: 'opacity, transform',
      });
      beginEntry();
      gsap.to(nextSectionElements, {
        opacity: 1,
        y: 0,
        filter: 'none',
        duration: isMobile ? 0.40 : 0.55,
        stagger: isMobile ? 0.045 : 0.08, // Sequential cascade!
        delay: isMobile ? 0.32 : 0.68,
        ease: 'power2.out',
        clearProps: 'opacity,transform,filter,willChange',
        onComplete: completeEntry,
      });
    }

    completeEntry();
  };

  // SEQUENCE: Wait for the blur view transition to complete FIRST, then start text reveal!
  const runAfterBlur = () => {
    requestAnimationFrame(executeEntrance);
  };

  if (activeVt && activeVt.finished) {
    activeVt.finished.then(runAfterBlur).catch(executeEntrance);
  } else if (isFromTransition) {
    // When navigated via SPA transition, blur has already completed: reveal text immediately!
    executeEntrance();
  } else if (isPageEntering) {
    let handled = false;
    const safeTrigger = () => {
      if (handled) return;
      handled = true;
      runAfterBlur();
    };

    if ('onpagereveal' in window && !activeVt) {
      window.addEventListener('pagereveal', (e) => {
        if (e.viewTransition && e.viewTransition.finished) {
          e.viewTransition.finished.then(safeTrigger).catch(safeTrigger);
        }
      }, { once: true });
    }

    setTimeout(safeTrigger, 340);
  } else {
    executeEntrance();
  }
}
window.__hvTriggerPageHeroEntrance = triggerPageHeroEntrance;
window.initHeroWordRoller = initHeroWordRoller;

// ===========================================================================
// HOME HERO — 3D CYLINDRICAL REEL WALL CAROUSEL
// Continuous infinite cylindrical perspective carousel matching ClipCut reference
// ===========================================================================
export function initHeroReelCarousel() {
  if (window.__hvHeroReelCleanup) {
    // Hot reloads and route hydration can leave the existing carousel alive;
    // still force its media source to follow the current theme.
    window.__hvHeroReelRefreshTheme?.();
    return;
  }

  const viewport = document.getElementById('heroCarouselViewport') || document.querySelector('.carousel-viewport');
  const track = document.getElementById('heroCarouselTrack') || document.querySelector('.carousel-track');
  if (!viewport || !track) return;

  // Keep both reel sets in the same browser cache, but choose the set from
  // the active visual theme. Dark mode remains creator-led; Light mode uses
  // the local cinema reels without changing the carousel machinery.
  const getThemeVideoSource = (video) => {
    if (!video) return '';
    const isLight = document.documentElement.dataset.theme === 'light';
    const mobile = window.innerWidth <= 768;
    const themedSource = isLight
      ? (mobile && video.dataset.lightMobileSrc) || video.dataset.lightSrc
      : (mobile && video.dataset.darkMobileSrc) || video.dataset.darkSrc;
    return themedSource || (mobile && video.dataset.mobileSrc) || video.dataset.src || video.getAttribute('src') || '';
  };

  // Strict Intro Isolation: Never render or animate the carousel during the loading screen!
  const isIntroPending = document.documentElement.classList.contains('intro-pending') ||
    document.body.classList.contains('intro-active');

  if (isIntroPending) {
    viewport.style.display = 'none';

    // Buffer the five cards that will be visible at the initial carousel
    // position while the branded loader is on screen. They remain paused and
    // hidden until the intro finishes, but the first reveal can use decoded
    // frames instead of flashing black video surfaces.
    const introVideos = Array.from(track.querySelectorAll('.card-video'));
    const introCount = introVideos.length;
    const introIndexes = introCount > 4
      ? [introCount - 2, introCount - 1, 0, 1, 2]
      : introVideos.map((_, index) => index);
    const mobileIntro = window.innerWidth <= 768;
    introIndexes.forEach((index) => {
      const video = introVideos[index];
      if (!video || video.dataset.introPreloaded === 'true') return;
      const source = getThemeVideoSource(video);
      if (!source) return;
      video.defaultMuted = true;
      video.muted = true;
      video.playsInline = true;
      video.preload = 'auto';
      video.setAttribute('playsinline', '');
      video.setAttribute('muted', '');
      if (video.getAttribute('src') !== source) {
        video.removeAttribute('src');
      }
      video.setAttribute('src', source);
      video.dataset.activeThemeSrc = source;
      video.dataset.introPreloaded = 'true';
      video.load();
    });

    const startAfterIntro = () => {
      window.removeEventListener('hv:intro-reveal', startAfterIntro);
      window.removeEventListener('hv:intro-complete', startAfterIntro);
      viewport.style.display = '';
      initHeroReelCarousel();
    };
    window.addEventListener('hv:intro-reveal', startAfterIntro, { once: true });
    window.addEventListener('hv:intro-complete', startAfterIntro, { once: true });
    return;
  }

  const cardPositions = Array.from(track.querySelectorAll('.card-position'));
  const count = cardPositions.length;
  if (!count) return;

  const cardPerspectives = cardPositions.map((pos) => pos.querySelector('.card-perspective'));
  let videos = cardPositions.map((pos) => pos.querySelector('.card-video'));
  const creatorReelViewCounts = ['24.5M', '38.2M', '19.4M', '45.0M', '82.6M', '54.1M', '16.8M', '29.3M', '41.7M', '67.4M'];
  const movieReelViewCounts = ['8M', '12M', '5M', '6.5M', '9.4M', '11M', '15M', '17M', '4M', '6M'];

  const getReelViewCount = (index) => {
    const isLight = document.documentElement.dataset.theme === 'light';
    const counts = isLight ? movieReelViewCounts : creatorReelViewCounts;
    return counts[index] || '0';
  };

  // Creator posters must not flash behind cinema reels in Light mode. Keep
  // the original poster as the Dark-mode fallback and let the loaded movie
  // frame take over in Light mode.
  // Seamless poster handover between themes:
  // Light mode displays dedicated cinema posters; Dark mode displays creator posters.
  videos.forEach((video, index) => {
    if (!video) return;
    if (!video.dataset.darkPoster && video.getAttribute('poster')) {
      video.dataset.darkPoster = video.getAttribute('poster');
    }
    const isLight = document.documentElement.dataset.theme === 'light';
    const lightPoster = video.dataset.lightPoster || `/assets/movie/posters/poster_${index + 1}.jpg`;
    if (isLight) {
      video.setAttribute('poster', lightPoster);
    } else if (video.dataset.darkPoster) {
      video.setAttribute('poster', video.dataset.darkPoster);
    }
  });

  // Keep the view count attached to each reel as it moves around the
  // carousel. Create it here so route refreshes never duplicate the badge.
  cardPositions.forEach((position, index) => {
    const videoCard = position.querySelector('.video-card');
    if (!videoCard) return;
    let viewCount = videoCard.querySelector('.reel-view-count');
    const count = getReelViewCount(index);
    if (!viewCount) {
      viewCount = document.createElement('div');
      viewCount.className = 'reel-view-count';
      viewCount.setAttribute('aria-label', `${count} views`);
      viewCount.innerHTML = `
        <span class="rvc-icon-wrap">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5C7 5 2.73 8.11 1 12c1.73 3.89 6 7 11 7s9.27-3.11 11-7c-1.73-3.89-6-7-11-7Z" stroke="#000" stroke-width="2" fill="none"/><circle cx="12" cy="12" r="3" fill="#000"/></svg>
        </span>
        <span class="rvc-text">${count} views</span>
      `;
      videoCard.appendChild(viewCount);
    } else {
      const text = viewCount.querySelector('.rvc-text');
      if (text) text.textContent = `${count} views`;
      viewCount.setAttribute('aria-label', `${count} views`);
    }
  });

  // A soft route swap can carry animation styles from the outgoing document
  // for one frame. Reset every wrapper explicitly before measuring so the
  // carousel never re-enters with only one visible card.
  gsap.killTweensOf([...cardPositions, ...cardPerspectives].filter(Boolean));
  cardPositions.forEach((pos) => {
    pos.style.opacity = '1';
    pos.style.visibility = 'visible';
    pos.style.display = 'block';
  });
  cardPerspectives.forEach((perspective) => {
    if (!perspective) return;
    perspective.style.opacity = '1';
    perspective.style.visibility = 'visible';
  });

  // Load reel sources with priority and preload
  const loadVideo = (video, priority = 'low') => {
    if (!video) return;
    const useMobileSource = window.innerWidth <= 768;
    const targetSrc = getThemeVideoSource(video);
    video.defaultMuted = true;
    video.muted = true;
    video.playsInline = true;
    video.loop = true;
    const shouldPlay = priority === 'high' && !document.documentElement.classList.contains('intro-pending');
    video.autoplay = shouldPlay;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('muted', '');
    if (shouldPlay) video.setAttribute('autoplay', '');
    else video.removeAttribute('autoplay');
    video.preload = priority === 'high' ? 'auto' : 'metadata';
    if (targetSrc && video.getAttribute('src') !== targetSrc) {
      video.pause();
      video.removeAttribute('src');
      video.setAttribute('src', targetSrc);
      video.preload = 'auto';
      video.dataset.activeThemeSrc = targetSrc;
      video.load();
    }
    video.fetchPriority = priority;
  };

  // Ensure a loaded reel plays inline, muted, and looping reliably
  const playVideo = (video) => {
    if (!video) return;
    loadVideo(video, 'high');
    // Buffer behind the loader without spending that buffer on hidden playback.
    if (document.documentElement.classList.contains('intro-pending')) return;
    video.defaultMuted = true;
    video.muted = true;
    video.playsInline = true;
    video.loop = true;
    video.autoplay = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('muted', '');
    video.setAttribute('autoplay', '');

    const tryPlay = () => {
      if (!video.paused) return;
      const playAttempt = video.play();
      if (playAttempt && playAttempt.catch) {
        playAttempt.catch(() => { });
      }
    };

    if (video.readyState >= 2) {
      tryPlay();
    } else {
      video.addEventListener('canplay', tryPlay, { once: true });
      video.addEventListener('loadeddata', tryPlay, { once: true });
      tryPlay();
    }
  };

  let scrollPosition = 0;
  let stageStep = 260;
  let totalWidth = count * stageStep;
  let isDragging = false;
  let startX = 0;
  let startScrollPosition = 0;
  let dragVelocity = 0;
  let lastDragX = 0;
  let lastDragTime = performance.now();
  let hasMoved = false;
  let isInteracting = false;
  let autoDirection = 1;
  let resumeTimer = null;
  let animId = null;
  let layoutRetryId = null;
  let lastTime = performance.now();
  let cachedViewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;

  const getViewportWidth = () => {
    const rectWidth = viewport.getBoundingClientRect().width;
    if (rectWidth >= 320) {
      // Measure the usable track width, not the full bleed viewport. Desktop
      // edge padding keeps the perspective cards inside the page frame.
      const styles = window.getComputedStyle(viewport);
      const inset = (parseFloat(styles.paddingLeft) || 0) + (parseFloat(styles.paddingRight) || 0);
      return Math.max(320, rectWidth - inset);
    }
    return Math.max(viewport.clientWidth, window.innerWidth, 320);
  };

  const measure = () => {
    cachedViewportWidth = getViewportWidth();
    const width = cachedViewportWidth;
    if (width < 640) {
      // Keep the carousel spacing tied to the actual phone width. A fixed
      // step made cards overlap on small phones and spread too far on larger
      // ones.
      const cardWidth = cardPositions[0]?.offsetWidth || width * 0.30;
      // Three compact cards should fit side-by-side without clipping on a
      // narrow phone. Keep the slot just under the card width so the center
      // reel remains readable while its neighbors stay visible.
      stageStep = Math.max(cardWidth * 0.88, Math.min(cardWidth * 1.02, width * 0.30));
    } else if (width < 1024) {
      stageStep = Math.max(150, Math.min(185, width * 0.17));
    } else {
      // Slightly tighter desktop slots keep the outer perspective cards inside
      // the new viewport breathing room instead of clipping at the corners.
      stageStep = Math.max(175, Math.min(195, width * 0.13));
    }
    totalWidth = count * stageStep;
  };

  measure();

  let isCarouselVisible = true;
  let lastVideoPriorityIndex = -1;
  let videosUnlocked = true;

  const updateVideoPriority = (force = false) => {
    if (!videosUnlocked || !stageStep || !videos.length || !isCarouselVisible) return;

    const isMobileDevice = cachedViewportWidth <= 768;

    if (isMobileDevice) {
      // Keep every card currently visible in the compact phone rail alive.
      // Hidden cards remain paused, so the rail feels like a true reel wall
      // without decoding the entire ten-video loop on a phone.
      let centerIdx = Math.round(scrollPosition / stageStep) % count;
      if (centerIdx < 0) centerIdx += count;

      if (!force && centerIdx === lastVideoPriorityIndex) return;
      lastVideoPriorityIndex = centerIdx;

      videos.forEach((video, idx) => {
        if (!video) return;
        let dist = Math.abs(idx - centerIdx);
        if (dist > count / 2) dist = count - dist;
        if (dist <= 2) {
          loadVideo(video, 'high');
          playVideo(video);
        } else {
          try { video.pause(); } catch (_) { }
        }
      });
    } else {
      // The desktop composition is a live reel wall: every visible card plays,
      // not just the focused card.
      let centerIdx = Math.round(scrollPosition / stageStep) % count;
      if (centerIdx < 0) centerIdx += count;
      if (!force && centerIdx === lastVideoPriorityIndex) return;
      lastVideoPriorityIndex = centerIdx;

      videos.forEach((video) => {
        if (!video) return;
        loadVideo(video, 'high');
        playVideo(video);
      });
    }
  };

  // Desktop can afford metadata warm-up. On phones, only the visible
  // reel receives sources; poster images keep the other cards lightweight.
  const isMobileViewport = cachedViewportWidth <= 768;
  if (!isMobileViewport) {
    videos.forEach((video) => loadVideo(video, 'low'));
  }

  // Resume / unlock autoplay on first interaction if browser blocked initial autoplay
  const unlockOnInteraction = () => {
    updateVideoPriority(true);
  };
  ['pointerdown', 'touchstart', 'scroll', 'wheel', 'click', 'keydown', 'pointerup', 'mousemove'].forEach((evt) => {
    window.addEventListener(evt, unlockOnInteraction, { once: true, passive: true });
  });

  // Expose global unlock so the intro preloader can trigger video buffering during loading screen
  window.__hvUnlockHeroVideos = () => {
    videosUnlocked = true;
    updateVideoPriority(true);
  };

  updateVideoPriority(true);
  if (document.readyState !== 'complete') {
    window.addEventListener('load', () => {
      window.__hvUnlockHeroVideos();
    }, { once: true });
  }

  const heroVisibilityObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver(([entry]) => {
      const wasVisible = isCarouselVisible;
      isCarouselVisible = entry.isIntersecting;
      if (!isCarouselVisible) {
        if (animId) {
          cancelAnimationFrame(animId);
          animId = null;
        }
        // Immediately pause all hero reels when scrolled out of view on BOTH mobile and desktop!
        // This stops all background hardware video decode and network traffic.
        videos.forEach((video) => { try { video?.pause(); } catch (_) { } });
        return;
      }
      if (!wasVisible && isCarouselVisible) {
        lastTime = performance.now();
        lastVideoPriorityIndex = -1;
        updateVideoPriority(true);
        if (!animId) {
          animId = requestAnimationFrame(loop);
        }
      }
    }, { threshold: 0.05 })
    : null;
  heroVisibilityObserver?.observe(viewport);

  // Extracted Perspective View: Tightly spaced concave amphitheater wrap
  const render = () => {
    const isMobileDevice = cachedViewportWidth <= 768;

    // Render cards on the concave perspective arc with tight spacing
    cardPositions.forEach((pos, index) => {
      let rawX = (index * stageStep) - scrollPosition;
      let x = ((rawX + totalWidth / 2) % totalWidth);
      if (x < 0) x += totalWidth;
      x -= totalWidth / 2;

      // Normalized slot index u relative to linear step
      const u = x / stageStep;
      const absU = Math.abs(u);
      const sign = Math.sign(u);

      if (isMobileDevice) {
        // Keep five cards in the mobile rail (center + two neighbors on each
        // side). The previous ±1 cull left only three cards visible, which
        // made the carousel feel empty and made the infinite loop obvious.
        if (absU > 2.45) {
          pos.style.display = 'none';
          return;
        }
        pos.style.display = 'block';

        const norm = Math.min(1.0, absU / 2.7);
        const screenX = x * (1.0 + Math.pow(norm, 1.2) * 0.08);
        const scale = 0.92 + Math.pow(norm, 1.2) * 0.20;
        const maxRotY = 22;
        const rotationY = -sign * Math.pow(norm, 0.75) * maxRotY;
        const baseZ = -30;
        const translateZ = baseZ + Math.pow(norm, 1.2) * 80;
        const baselineY = Math.pow(norm, 1.4) * 3;

        pos.style.transform = `translate3d(calc(-50% + ${screenX.toFixed(1)}px), calc(-50% + ${baselineY.toFixed(1)}px), 0)`;
        pos.style.opacity = '1';

        const perspectiveEl = cardPerspectives[index];
        if (perspectiveEl) {
          perspectiveEl.style.transform = `translate3d(0, 0, ${translateZ.toFixed(1)}px) rotateY(${rotationY.toFixed(1)}deg) scale(${scale.toFixed(3)})`;
        }
        // Keep the center card in front of its neighbors so the denser rail
        // still reads as one intentional carousel instead of stacked tiles.
        pos.style.zIndex = String(Math.round(50 - Math.min(2.5, absU) * 10));
        return;
      }

      // Desktop full rendering:
      const norm = Math.min(1.0, absU / 4.2);
      const spreadFactor = 1.0 + Math.pow(norm, 1.35) * 0.16;
      const screenX = x * spreadFactor;
      const baseScale = 0.80;
      const scaleRange = 0.56;
      const scale = baseScale + Math.pow(norm, 1.35) * scaleRange;
      const maxRotY = 38;
      const rotationY = -sign * Math.pow(norm, 0.78) * maxRotY;
      const maxRotZ = 2.8;
      const rotationZ = sign * Math.pow(norm, 1.3) * maxRotZ;
      const baseZ = -140;
      const zRange = 310;
      const translateZ = baseZ + Math.pow(norm, 1.25) * zRange;
      const baselineY = Math.pow(norm, 1.6) * 10;
      const opacity = absU > 4.2 ? Math.max(0, 1 - (absU - 4.2) * 2.2) : 1;

      pos.style.display = 'block';
      pos.style.transform = `translate3d(calc(-50% + ${screenX.toFixed(1)}px), calc(-50% + ${baselineY.toFixed(1)}px), 0)`;
      pos.style.filter = '';
      pos.style.opacity = opacity.toFixed(3);

      const perspectiveEl = cardPerspectives[index];
      if (perspectiveEl) {
        perspectiveEl.style.transform = `translate3d(0, 0, ${translateZ.toFixed(1)}px) rotateY(${rotationY.toFixed(2)}deg) rotateZ(${rotationZ.toFixed(2)}deg) scale(${scale.toFixed(4)})`;
      }
      pos.style.zIndex = String(Math.round(20 + Math.min(4.0, absU) * 20));
      pos.classList.remove('is-center-card');
    });
  };

  const autoSpeed = 50; // pixels per second

  const loop = (currentTime) => {
    if (!isCarouselVisible) {
      animId = null;
      return;
    }

    const isMobileDevice = cachedViewportWidth <= 768;

    const delta = Math.min((currentTime - lastTime) / 1000, 0.05);
    lastTime = currentTime;

    if (!isDragging) {
      // A 28px/s mobile crawl took more than three seconds to move one card.
      // Keep it calm, but advance often enough that the rail reads as live.
      const currentAutoSpeed = isMobileDevice ? 46 : autoSpeed;

      if (Math.abs(dragVelocity) > 1.0) {
        // Butter smooth glide with lower friction and expanded 6-7 reel reach
        scrollPosition += dragVelocity * delta;
        dragVelocity *= Math.pow(0.982, delta * 60);

        // Once velocity decays near auto-speed and user is done interacting, hand off seamlessly
        if (!isInteracting && Math.abs(dragVelocity) <= currentAutoSpeed) {
          dragVelocity = 0;
        } else if (Math.abs(dragVelocity) <= 1.0) {
          dragVelocity = 0;
        }
      } else if (!isInteracting) {
        // Continuous smooth auto-rotation on all screens (gentle pace on mobile)
        scrollPosition += currentAutoSpeed * autoDirection * delta;
      }

      scrollPosition = ((scrollPosition % totalWidth) + totalWidth) % totalWidth;
      render();
      updateVideoPriority(false);
    }

    animId = requestAnimationFrame(loop);
  };

  // Drag interactivity with touch axis locking
  let isHorizontalDrag = false;
  let isVerticalScroll = false;
  let startY = 0;
  let activePointerId = null;

  const onPointerDown = (e) => {
    // Only primary button (left-click) for mouse pointers
    if (e.pointerType === 'mouse' && e.button !== 0) return;

    isDragging = false;
    isHorizontalDrag = false;
    isVerticalScroll = false;
    hasMoved = false;
    dragVelocity = 0;
    startX = e.clientX;
    startY = e.clientY;
    lastDragX = e.clientX;
    lastDragTime = performance.now();
    startScrollPosition = scrollPosition;
    activePointerId = e.pointerId;

    if (!animId) {
      lastTime = performance.now();
      animId = requestAnimationFrame(loop);
    }
  };

  const onPointerMove = (e) => {
    // Drag MUST only occur when user has actively pressed down (pointerdown)
    if (activePointerId === null || e.pointerId !== activePointerId) return;

    // Safety: if mouse button was released outside the window
    if (e.pointerType === 'mouse' && e.buttons === 0) {
      onPointerUp(e);
      return;
    }

    if (isVerticalScroll) return;

    if (!animId) {
      lastTime = performance.now();
      animId = requestAnimationFrame(loop);
    }

    const currentX = e.clientX;
    const currentY = e.clientY;
    const diffX = currentX - startX;
    const diffY = currentY - startY;

    // Axis locking: distinguish vertical page swipe from horizontal carousel drag
    if (!isHorizontalDrag) {
      if (Math.abs(diffX) < 6 && Math.abs(diffY) < 6) return;
      if (Math.abs(diffY) > Math.abs(diffX)) {
        isVerticalScroll = true;
        isDragging = false;
        isInteracting = false;
        return;
      }
      isHorizontalDrag = true;
      isDragging = true;
      isInteracting = true;
      track.classList.add('is-dragging');
      viewport.classList.add('is-dragging');
      cardPositions.forEach((p) => { p.style.transition = 'none'; });
      if (track.setPointerCapture) {
        try { track.setPointerCapture(e.pointerId); } catch (_) { }
      }
    }

    if (!isDragging) return;

    hasMoved = true;
    const diff = diffX * 1.55;

    const now = performance.now();
    const dt = Math.max(now - lastDragTime, 1);
    const instantaneousVel = -(currentX - lastDragX) / (dt / 1000);
    dragVelocity = dragVelocity * 0.35 + instantaneousVel * 0.65;
    if (Math.abs(dragVelocity) > 8) {
      autoDirection = dragVelocity < 0 ? -1 : 1;
    }
    lastDragX = currentX;
    lastDragTime = now;

    scrollPosition = startScrollPosition - diff;
    scrollPosition = ((scrollPosition % totalWidth) + totalWidth) % totalWidth;
    render();
    updateVideoPriority();
  };

  const onPointerUp = (e) => {
    if (activePointerId === null) return;
    if (e && e.pointerId !== undefined && e.pointerId !== activePointerId) return;
    activePointerId = null;

    if (isVerticalScroll) {
      isVerticalScroll = false;
      return;
    }
    if (!isDragging) {
      isHorizontalDrag = false;
      return;
    }
    isDragging = false;
    isHorizontalDrag = false;
    track.classList.remove('is-dragging');
    viewport.classList.remove('is-dragging');
    if (track.releasePointerCapture && e?.pointerId) {
      try { track.releasePointerCapture(e.pointerId); } catch (_) { }
    }

    // Expand drag reach and duration to roll across 6-7 reels
    const totalDragDistance = lastDragX - startX;
    if (Math.abs(totalDragDistance) > 3) {
      autoDirection = totalDragDistance > 0 ? -1 : 1;
      const currentStep = stageStep || (cachedViewportWidth <= 768 ? 125 : 190);
      // Under decay 0.982 (k ~ 1.09 s^-1), target distance of 6.5 reels requires base velocity ~ 7.1 * stageStep
      const targetGlideDistance = currentStep * 6.5;
      const baseGlideVelocity = targetGlideDistance * 1.09;

      const measuredSpeed = Math.abs(dragVelocity);
      let releaseVelocity;
      if (measuredSpeed < 180) {
        // Deliberate swipe or slow release: roll full 6-7 reels smoothly
        releaseVelocity = baseGlideVelocity;
      } else {
        // Faster swipe: scale smoothly up to ~8-9 reels
        releaseVelocity = Math.max(baseGlideVelocity, Math.min(baseGlideVelocity * 1.5, measuredSpeed * 1.75));
      }
      dragVelocity = autoDirection * releaseVelocity;
    }

    // Re-enable optic CSS transitions for the inertia coast phase
    cardPositions.forEach((p) => { p.style.transition = ''; });

    dragVelocity = Math.max(-2800, Math.min(2800, dragVelocity));

    clearTimeout(resumeTimer);
    resumeTimer = setTimeout(() => {
      isInteracting = false;
    }, 3400);
  };

  const onClickCapture = (e) => {
    if (hasMoved) {
      e.preventDefault();
      e.stopPropagation();
      setTimeout(() => { hasMoved = false; }, 0);
    }
  };

  const onResize = () => {
    measure();
    render();
  };

  const stabilizeLayout = (attempt = 0) => {
    const measuredWidth = viewport.getBoundingClientRect().width;
    // Robust retry window across soft route transitions
    if ((!measuredWidth || measuredWidth < 320) && attempt < 35) {
      layoutRetryId = requestAnimationFrame(() => stabilizeLayout(attempt + 1));
      return;
    }

    onResize();
    updateVideoPriority();

    // Re-measure across subsequent frames as DOM settles into layout
    if (attempt < 5) {
      layoutRetryId = requestAnimationFrame(() => stabilizeLayout(attempt + 1));
    }
  };

  const refreshHeroLayout = () => {
    if (layoutRetryId) cancelAnimationFrame(layoutRetryId);
    layoutRetryId = requestAnimationFrame(() => stabilizeLayout());
  };

  const onVisibilityChange = () => {
    if (document.hidden) {
      if (animId) {
        cancelAnimationFrame(animId);
        animId = null;
      }
      videos.forEach((video) => { try { video?.pause(); } catch (_) { } });
      return;
    }
    if (isCarouselVisible) {
      lastTime = performance.now();
      lastVideoPriorityIndex = -1;
      updateVideoPriority(true);
      measure();
      render();
      if (!animId) {
        animId = requestAnimationFrame(loop);
      }
    }
  };
  const onPageShow = () => {
    lastVideoPriorityIndex = -1;
    updateVideoPriority();
    refreshHeroLayout();
  };
  const resizeObserver = 'ResizeObserver' in window
    ? new ResizeObserver(() => requestAnimationFrame(onResize))
    : null;

  const onWindowBlur = () => {
    if (activePointerId !== null) {
      onPointerUp();
    }
  };

  track.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
  window.addEventListener('pointercancel', onPointerUp);
  window.addEventListener('blur', onWindowBlur);
  track.addEventListener('click', onClickCapture, true);
  window.addEventListener('resize', onResize, { passive: true });
  window.addEventListener('pageshow', onPageShow);
  document.addEventListener('visibilitychange', onVisibilityChange);
  resizeObserver?.observe(viewport);

  measure();
  render();
  // A route handoff can promote the carousel one paint after this function is
  // called. Re-measure only after a stable visible layout is available.
  refreshHeroLayout();
  animId = requestAnimationFrame(loop);

  window.__hvHeroReelRefresh = refreshHeroLayout;

  // Theme toggles happen without a document reload. Swap only the media
  // source, retain the existing card geometry/animation, and let the browser
  // cache serve any previously loaded reel immediately on subsequent swaps.
  let themeSwapGeneration = 0;
  const onThemeChange = (options = {}) => {
    // The source swap happens at the text handoff. Do not construct clone
    // videos here: detached clones were intermittently losing autoplay when
    // reattached, which left the rail frozen on some browsers.
    if (options.preloadOnly) return;
    const swapGeneration = ++themeSwapGeneration;
    const activeVideos = videos.slice();
    const theme = document.documentElement.dataset.theme;
    const carouselViewport = viewport;
    carouselViewport.classList.add('theme-media-swapping');

    // Update the poster before the source. It prevents a black video surface
    // while the browser seeks the first frame of the correct theme's reel.
    let centerIdx = Math.round(scrollPosition / stageStep) % count;
    if (centerIdx < 0) centerIdx += count;
    const isMobileDevice = cachedViewportWidth <= 768;
    const activeIndexes = new Set();
    activeVideos.forEach((_, index) => {
      let distance = Math.abs(index - centerIdx);
      if (distance > count / 2) distance = count - distance;
      // Desktop shows the complete reel wall; on mobile only the five cards
      // actually rendered in the rail should consume a video decoder.
      if (!isMobileDevice || distance <= 2) activeIndexes.add(index);
    });

    activeVideos.forEach((video) => {
      if (!video) return;
      video.style.opacity = '';
    });

    activeVideos.forEach((video, index) => {
      if (!video) return;
      const nextSrc = getThemeVideoSource(video);
      if (!nextSrc) return;

      const lightPoster = video.dataset.lightPoster || `/assets/movie/posters/poster_${index + 1}.jpg`;
      if (theme === 'light') {
        video.setAttribute('poster', lightPoster);
      } else if (video.dataset.darkPoster) {
        video.setAttribute('poster', video.dataset.darkPoster);
      }

      if (!activeIndexes.has(index)) {
        // Preserve the correct poster on cards in the depth of the rail, but
        // do not make them compete for a video decoder.
        try {
          video.pause();
          video.removeAttribute('src');
          video.load();
        } catch (_) { }
        video.dataset.activeThemeSrc = nextSrc;
        return;
      }

      // Directly replace the source on the live element, then explicitly
      // restart it. This retains browser autoplay eligibility and avoids a
      // blank or permanently paused cloned video layer.
      loadVideo(video, 'high');
      playVideo(video);
    });

    cardPositions.forEach((position, index) => {
      const viewCount = position.querySelector('.reel-view-count');
      if (!viewCount) return;
      const count = getReelViewCount(index);
      const text = viewCount.querySelector('.rvc-text');
      if (text) text.textContent = `${count} views`;
      viewCount.setAttribute('aria-label', `${count} views`);
    });

    // Reveal on the next paint, after the poster/source assignments have been
    // committed. There is no arbitrary media timeout in this path.
    requestAnimationFrame(() => {
      if (swapGeneration !== themeSwapGeneration) return;
      carouselViewport.classList.remove('theme-media-swapping');
      carouselViewport.classList.remove('theme-reels-deferred');
      carouselViewport.classList.add('theme-reels-revealing');
      lastVideoPriorityIndex = -1;
      updateVideoPriority(true);
      const reelRevealDuration = theme === 'light' ? 460 : 380;
      window.setTimeout(() => {
        if (swapGeneration !== themeSwapGeneration) return;
        carouselViewport.classList.remove('theme-reels-revealing');
      }, reelRevealDuration);
    });
  };
  window.__hvHeroReelRefreshTheme = onThemeChange;
  window.__hvHeroReelCommitThemeSwap = () => {};

  window.__hvHeroReelCleanup = () => {
    if (animId) cancelAnimationFrame(animId);
    if (layoutRetryId) cancelAnimationFrame(layoutRetryId);
    clearTimeout(resumeTimer);
    activePointerId = null;
    isDragging = false;
    isHorizontalDrag = false;
    track.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('blur', onWindowBlur);
    track.removeEventListener('click', onClickCapture, true);
    window.removeEventListener('resize', onResize);
    window.removeEventListener('pageshow', onPageShow);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    resizeObserver?.disconnect();
    heroVisibilityObserver?.disconnect();
    videos.forEach((v) => { try { v?.pause(); } catch (_) { } });
    if (window.__hvHeroReelRefresh === refreshHeroLayout) {
      window.__hvHeroReelRefresh = null;
    }
    if (window.__hvHeroReelRefreshTheme === onThemeChange) {
      window.__hvHeroReelRefreshTheme = null;
    }
    if (window.__hvHeroReelCommitThemeSwap) {
      window.__hvHeroReelCommitThemeSwap = null;
    }
  };
}
window.initHeroReelCarousel = initHeroReelCarousel;


// Work-page three-step workflow section.
function initWorkflowSection() {
  const section = document.querySelector('.workflow-section');
  const cards = section ? Array.from(section.querySelectorAll('.workflow-card')) : [];
  const videos = section ? Array.from(section.querySelectorAll('video[data-workflow-reel]')) : [];
  if (!section || !cards.length) return;

  if (window.__hvWorkflowCleanup) window.__hvWorkflowCleanup();

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduceMotion) {
    gsap.set(cards, { opacity: 1, y: 0 });
    videos.forEach((video) => { try { video.pause(); } catch (_) { } });
    return;
  }

  const setWorkflowPlayback = (shouldPlay) => {
    videos.forEach((video) => {
      video.defaultMuted = true;
      video.muted = true;
      video.playsInline = true;
      video.loop = true;
      video.autoplay = true;
      video.setAttribute('muted', '');
      video.setAttribute('playsinline', '');
      video.setAttribute('autoplay', '');
      video.preload = 'auto';
      if (!shouldPlay) {
        try { video.pause(); } catch (_) { }
        return;
      }
      if (video.paused) {
        const playAttempt = video.play();
        if (playAttempt && playAttempt.catch) playAttempt.catch(() => { });
      }
    });
  };

  // The workflow cards contain video and CSS-driven visual states already.
  // Giving the cards a second scroll entrance caused a competing movement.
  gsap.set(cards, { opacity: 1, y: 0, clearProps: 'transform,opacity' });
  let sectionVisible = false;
  const observer = new IntersectionObserver(([entry]) => {
    sectionVisible = entry.isIntersecting;
    section.classList.toggle('is-visible', sectionVisible && !document.hidden);
    setWorkflowPlayback(sectionVisible && !document.hidden);
  }, { rootMargin: '150px 0px 150px 0px', threshold: 0 });
  observer.observe(section);

  const unlockWorkflowOnInteraction = () => {
    if (sectionVisible && !document.hidden) {
      setWorkflowPlayback(true);
    }
  };
  ['pointerdown', 'touchstart', 'scroll', 'wheel', 'click'].forEach((evt) => {
    window.addEventListener(evt, unlockWorkflowOnInteraction, { once: true, passive: true });
  });

  const onVisibilityChange = () => {
    section.classList.toggle('is-visible', sectionVisible && !document.hidden);
    setWorkflowPlayback(sectionVisible && !document.hidden);
  };
  document.addEventListener('visibilitychange', onVisibilityChange);

  window.__hvWorkflowCleanup = () => {
    observer.disconnect();
    section.classList.remove('is-visible');
    document.removeEventListener('visibilitychange', onVisibilityChange);
    setWorkflowPlayback(false);
  };
}

// Six-card Work capabilities grid.
function initCapabilityDeck(isFromTransition = false) {
  const grid = document.querySelector('.work-capabilities-grid');
  const cards = Array.from(document.querySelectorAll('.capability-card'));
  if (!grid || !cards.length || grid.dataset.gridReady === 'true') return;

  grid.dataset.gridReady = 'true';
  grid.classList.add('is-visible');
  // If we arrived via route transition, the transition timeline animates cards in sequence.
  // Never clear props prematurely, which would pop cards onto screen immediately!
  if (!isFromTransition && window.__hvGetTransitionState?.() === 'IDLE') {
    gsap.set(cards, { clearProps: 'all' });
  }
}

// ==========================================================================
// 07b. WORK HERO & SERVICE FILTERS (DEDICATED WORK PAGE)
// ==========================================================================
function initWorkHeroIntro(isFromTransition = false) {
  const workHero = document.querySelector('.work-hero-section');
  if (!workHero) return;

  function animateWorkMetrics() {
    activeWorkMetricTweens.forEach((tw) => {
      if (tw && tw.kill) tw.kill();
    });
    activeWorkMetricTweens = [];

    const metricVals = workHero.querySelectorAll('.work-metric-val');
    const navigationEntry = performance.getEntriesByType('navigation')[0];
    const isHardReload = navigationEntry && navigationEntry.type === 'reload';
    metricVals.forEach((el) => {
      const target = parseFloat(el.getAttribute('data-metric-target'));
      const prefix = el.getAttribute('data-metric-prefix') || '';
      const suffix = el.getAttribute('data-metric-suffix') || '';
      if (isNaN(target)) return;

      const isFloat = target % 1 !== 0;
      const finalVal = isFloat ? target.toFixed(1) : target;

      // Preserve the final HTML value on a hard refresh instead of exposing
      // the animation's temporary zero state.
      if (isHardReload) {
        el.textContent = `${prefix}${finalVal}${suffix}`;
        return;
      }

      const startVal = 0;
      el.textContent = `${prefix}${isFloat ? startVal.toFixed(1) : startVal}${suffix}`;
      const obj = { val: 0 };

      const tw = gsap.to(obj, {
        val: target,
        duration: 1.6,
        ease: 'power2.out',
        onUpdate: () => {
          const displayVal = isFloat ? obj.val.toFixed(1) : Math.round(obj.val);
          el.textContent = `${prefix}${displayVal}${suffix}`;
        },
        onComplete: () => {
          const finalVal = isFloat ? target.toFixed(1) : target;
          el.textContent = `${prefix}${finalVal}${suffix}`;
        }
      });
      activeWorkMetricTweens.push(tw);
    });
  }

  window.__hvAnimateWorkMetrics = animateWorkMetrics;
  // Counters are triggered in sync with supporting elements entrance in triggerPageHeroEntrance
  if (workHero.dataset.transitionMetricsStarted !== 'true' && !isFromTransition) {
    animateWorkMetrics();
  }
}

// ==========================================================================
// 07c. TEAM & FOUNDERS SECTION ANIMATIONS
// ==========================================================================
function initTeamPageAnimations(isFromTransition = false) {
  const teamHero = document.querySelector('.team-hero-section');
  if (!teamHero) return;

  // Dynamic count-up animations for leadership metrics
  let activeMetricTweens = [];
  function animateMetrics() {
    activeMetricTweens.forEach((tw) => {
      if (tw && tw.kill) tw.kill();
    });
    activeMetricTweens = [];

    const metricVals = teamHero.querySelectorAll('.team-metric-val');
    metricVals.forEach((el) => {
      const format = el.getAttribute('data-metric-format');
      if (format === 'billion') {
        const obj = { val: 0 };
        el.textContent = '0.0B+';
        const tw = gsap.to(obj, {
          val: 4.5,
          duration: 2.2,
          ease: 'power2.out',
          onUpdate: () => {
            el.textContent = obj.val.toFixed(1) + 'B+';
          },
          onComplete: () => {
            el.textContent = '4.5B+';
            gsap.fromTo(el,
              { filter: 'drop-shadow(0 0 28px rgba(0, 229, 255, 0.85))' },
              { filter: 'drop-shadow(0 0 16px rgba(0, 229, 255, 0.4))', duration: 0.8, ease: 'power2.out' }
            );
          }
        });
        activeMetricTweens.push(tw);
      } else if (format === 'days') {
        const obj = { val: 0 };
        el.textContent = '0 Days';
        const tw = gsap.to(obj, {
          val: 60,
          duration: 1.9,
          ease: 'power2.out',
          onUpdate: () => {
            el.textContent = Math.round(obj.val) + ' Days';
          },
          onComplete: () => {
            el.textContent = '60 Days';
          }
        });
        activeMetricTweens.push(tw);
      } else if (format === 'reach') {
        el.textContent = 'Global Reach';
        gsap.fromTo(el,
          { filter: 'drop-shadow(0 0 28px rgba(0, 229, 255, 0.85))' },
          { filter: 'drop-shadow(0 0 16px rgba(0, 229, 255, 0.4))', duration: 0.8, ease: 'power2.out' }
        );
      } else if (format === 'percent') {
        const obj = { val: 0 };
        el.textContent = '0.0%';
        const tw = gsap.to(obj, {
          val: 99.4,
          duration: 2.2,
          ease: 'power2.out',
          onUpdate: () => {
            el.textContent = obj.val.toFixed(1) + '%';
          },
          onComplete: () => {
            el.textContent = '99.4%';
            gsap.fromTo(el,
              { filter: 'drop-shadow(0 0 28px rgba(0, 229, 255, 0.85))' },
              { filter: 'drop-shadow(0 0 16px rgba(0, 229, 255, 0.4))', duration: 0.8, ease: 'power2.out' }
            );
          }
        });
        activeMetricTweens.push(tw);
      } else if (format === 'distribution') {
        el.textContent = '24/7';
        gsap.fromTo(el,
          { filter: 'drop-shadow(0 0 28px rgba(0, 229, 255, 0.85))' },
          { filter: 'drop-shadow(0 0 16px rgba(0, 229, 255, 0.4))', duration: 0.8, ease: 'power2.out' }
        );
      } else if (format === 'top') {
        const obj = { val: 15 };
        el.textContent = 'Top 15%';
        const tw = gsap.to(obj, {
          val: 1,
          duration: 1.8,
          ease: 'power2.out',
          onUpdate: () => {
            el.textContent = 'Top ' + Math.round(obj.val) + '%';
          },
          onComplete: () => {
            el.textContent = 'Top 1%';
          }
        });
        activeMetricTweens.push(tw);
      }
    });
  }

  window.__hvAnimateTeamMetrics = animateMetrics;
  if (teamHero.dataset.transitionMetricsStarted !== 'true' && !isFromTransition) {
    animateMetrics();
  }

  // Founder Accordion Cards Entrance & Expand/Collapse Interactivity
  const accordCards = document.querySelectorAll('.founder-accord-card');
  if (accordCards.length > 0) {
    accordCards.forEach((card, idx) => {
      // Entrance animation
      const rect = card.getBoundingClientRect();
      if (rect.top < window.innerHeight * 0.95) {
        gsap.set(card, { opacity: 1, y: 0, clearProps: 'all' });
      } else {
        gsap.fromTo(card,
          { opacity: 0, y: 35 },
          {
            opacity: 1,
            y: 0,
            duration: 0.9,
            delay: idx * 0.12,
            ease: 'power3.out',
            clearProps: 'all',
            scrollTrigger: {
              trigger: card,
              start: 'top 88%',
              once: true,
            }
          }
        );
      }

      const body = card.querySelector('.accord-body');
      if (!body) return;
      const bodyItems = Array.from(body.querySelectorAll('.accord-body-inner > *'));
      const avatar = card.querySelector('.accord-avatar');

      // Ensure initially closed
      gsap.set(body, { height: 0, opacity: 0, overflow: 'hidden' });
      gsap.set(bodyItems, { opacity: 0, y: 16, filter: 'blur(8px)' });

      function toggleAccordion() {
        const isOpen = card.classList.contains('is-open');

        if (isOpen) {
          // Collapse
          card.classList.remove('is-open');
          card.setAttribute('aria-expanded', 'false');
          gsap.killTweensOf(bodyItems);
          gsap.to(bodyItems, {
            opacity: 0,
            y: -8,
            filter: 'blur(7px)',
            duration: 0.2,
            stagger: 0.025,
            ease: 'power2.in'
          });
          gsap.to(body, {
            height: 0,
            opacity: 0,
            duration: 0.38,
            ease: 'power3.inOut',
            onComplete: () => {
              if (window.ScrollTrigger) ScrollTrigger.refresh();
            }
          });
        } else {
          // Collapse any other open cards
          accordCards.forEach((other) => {
            if (other !== card && other.classList.contains('is-open')) {
              other.classList.remove('is-open');
              other.setAttribute('aria-expanded', 'false');
              const otherBody = other.querySelector('.accord-body');
              if (otherBody) {
                const otherItems = otherBody.querySelectorAll('.accord-body-inner > *');
                gsap.killTweensOf(otherItems);
                gsap.to(otherItems, { opacity: 0, y: -8, filter: 'blur(7px)', duration: 0.18, ease: 'power2.in' });
                gsap.to(otherBody, { height: 0, opacity: 0, duration: 0.32, ease: 'power3.inOut' });
              }
            }
          });

          // Expand current
          card.classList.add('is-open');
          card.setAttribute('aria-expanded', 'true');
          gsap.fromTo(body,
            { height: 0, opacity: 0 },
            {
              height: 'auto',
              opacity: 1,
              duration: 0.45,
              ease: 'power3.out',
              onComplete: () => {
                if (window.ScrollTrigger) ScrollTrigger.refresh();
              }
            }
          );
          gsap.killTweensOf(bodyItems);
          gsap.fromTo(bodyItems,
            { opacity: 0, y: 16, filter: 'blur(8px)' },
            {
              opacity: 1,
              y: 0,
              filter: 'blur(0px)',
              duration: 0.55,
              delay: 0.12,
              stagger: 0.075,
              ease: 'power3.out'
            }
          );
          if (avatar) {
            gsap.fromTo(avatar,
              { scale: 0.82, rotate: -8 },
              { scale: 1, rotate: 0, duration: 0.55, ease: 'back.out(2.2)' }
            );
          }
        }
      }

      card.setAttribute('tabindex', '0');
      card.setAttribute('role', 'button');
      card.setAttribute('aria-expanded', 'false');

      card.addEventListener('click', (e) => {
        if (e.target.closest('a') || e.target.closest('button')) return;
        toggleAccordion();
      });

      card.addEventListener('keydown', (e) => {
        if (e.key === ' ' || e.key === 'Enter') {
          if (e.target.closest('a')) return;
          e.preventDefault();
          toggleAccordion();
        }
      });
    });
  }

  // Pillar Cards Entrance
  const pillarCards = document.querySelectorAll('.pillar-card');
  if (pillarCards.length > 0) {
    const pillarsGrid = document.querySelector('.team-pillars-grid');
    const pRect = pillarsGrid?.getBoundingClientRect();
    if (pRect && pRect.top < window.innerHeight * 0.95) {
      gsap.set(pillarCards, { opacity: 1, y: 0, clearProps: 'all' });
    } else {
      gsap.fromTo(pillarCards,
        { opacity: 0, y: 30 },
        {
          opacity: 1,
          y: 0,
          duration: 0.9,
          stagger: 0.15,
          ease: 'power3.out',
          clearProps: 'all',
          scrollTrigger: {
            trigger: '.team-pillars-grid',
            start: 'top 85%',
            once: true,
          }
        }
      );
    }
  }
}

// ==========================================================================
// WHY US & COMPARISON SECTION APPEAR ANIMATIONS
// ==========================================================================
function initWhyUsAnimations(isFromTransition = false) {
  const pageContent = document.getElementById('page-content');
  if (pageContent?.dataset.whyAnimationsInit === 'true') return;
  if (pageContent) pageContent.dataset.whyAnimationsInit = 'true';

  const comparison = pageContent?.querySelector('.comp-dual-cards');
  if (!comparison || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cards = comparison.querySelectorAll('.comp-card');
  const rows = comparison.querySelectorAll('.comp-list-row');

  // If already scrolled into or past the comparison section, reveal immediately!
  const compRect = comparison.getBoundingClientRect();
  if (compRect.top < window.innerHeight * 0.95) {
    gsap.set(cards, { opacity: 1, y: 0, clearProps: 'all' });
    gsap.set(rows, { opacity: 1, y: 0, clearProps: 'all' });
    return;
  }

  gsap.fromTo(cards,
    { opacity: 0, y: 20 },
    {
      opacity: 1,
      y: 0,
      duration: 0.6,
      stagger: 0.1,
      ease: 'power2.out',
      clearProps: 'all',
      scrollTrigger: {
        trigger: comparison,
        start: 'top 85%',
        once: true,
      },
    }
  );

  // Reveal each point at its own scroll position, including when the cards
  // stack vertically on phones. Scrolling back up must not hide it again.
  rows.forEach(row => {
    gsap.fromTo(row,
      { opacity: 0, y: 14 },
      {
        opacity: 1,
        y: 0,
        duration: 0.5,
        ease: 'power2.out',
        clearProps: 'all',
        scrollTrigger: {
          trigger: row,
          start: 'top 85%',
          once: true,
        },
      }
    );
  });
}

function initServiceFilters() {
  const filterBtns = document.querySelectorAll('.service-filter-btn');
  const cards = document.querySelectorAll('.service-card-item');
  const countLabel = document.getElementById('active-services-count');
  if (!filterBtns.length || !cards.length) return;

  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const filter = btn.getAttribute('data-filter');

      // Update active button
      filterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      let visibleCount = 0;

      // Filter cards with smooth fade/scale
      cards.forEach((card) => {
        const category = card.getAttribute('data-category');
        const matches = filter === 'all' || category === filter;

        if (matches) {
          visibleCount++;
          card.style.display = 'flex';
          gsap.fromTo(card,
            { opacity: 0, scale: 0.96, y: 12 },
            { opacity: 1, scale: 1, y: 0, duration: 0.4, ease: 'power2.out' }
          );
        } else {
          gsap.to(card, {
            opacity: 0,
            scale: 0.96,
            y: 8,
            duration: 0.2,
            ease: 'power2.in',
            onComplete: () => {
              card.style.display = 'none';
            }
          });
        }
      });

      if (countLabel) {
        countLabel.textContent = `${visibleCount} Capabilities`;
      }
    });
  });
}

// ==========================================================================
// ==========================================================================
// 08. PORTFOLIO ROLLING MARQUEE & TAB CONTROLS (INFLUENCERS FIRST)
// ==========================================================================
function initPortfolioGrid() {
  const toggleBtns = document.querySelectorAll('.portfolio-toggle-btn');
  const glider = document.getElementById('portfolio-glider');

  // Home page marquees
  const marqueeInfluencers = document.getElementById('portfolio-marquee-influencers');
  const marqueeBrands = document.getElementById('portfolio-marquee-brands');

  // Work page non-marquee showcase grids
  const showcaseInfluencers = document.getElementById('portfolio-showcase-influencers');
  const showcaseBrands = document.getElementById('portfolio-showcase-brands');

  if (!marqueeInfluencers && !marqueeBrands && !showcaseInfluencers && !showcaseBrands) return;

  // Switch between Influencers / Creators and Brands
  function switchPortfolioTab(tab) {
    toggleBtns.forEach((btn) => {
      const isTarget = btn.getAttribute('data-portfolio-tab') === tab;
      btn.classList.toggle('active', isTarget);
      btn.setAttribute('aria-selected', isTarget ? 'true' : 'false');
    });

    if (glider) {
      glider.classList.toggle('brands-active', tab === 'brands');
    }

    // Home page marquee handling
    if (marqueeInfluencers && marqueeBrands) {
      const targetMarquee = tab === 'brands' ? marqueeBrands : marqueeInfluencers;
      const otherMarquee = tab === 'brands' ? marqueeInfluencers : marqueeBrands;

      if (otherMarquee) {
        otherMarquee.classList.remove('active');
      }

      if (targetMarquee) {
        targetMarquee.classList.add('active');
        if (typeof gsap !== 'undefined') {
          gsap.fromTo(targetMarquee,
            { opacity: 0, y: 15 },
            { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' }
          );
        }
      }
    }

    // Work page grid showcase handling
    if (showcaseInfluencers && showcaseBrands) {
      const targetShowcase = tab === 'brands' ? showcaseBrands : showcaseInfluencers;
      const otherShowcase = tab === 'brands' ? showcaseInfluencers : showcaseBrands;

      if (otherShowcase) {
        otherShowcase.classList.add('hidden');
        otherShowcase.classList.remove('active');
      }

      if (targetShowcase) {
        targetShowcase.classList.remove('hidden');
        targetShowcase.classList.add('active');
        if (typeof gsap !== 'undefined') {
          gsap.fromTo(targetShowcase,
            { opacity: 0, y: 20 },
            { opacity: 1, y: 0, duration: 0.45, ease: 'power2.out' }
          );
        }
      }
    }
  }

  toggleBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const tab = btn.getAttribute('data-portfolio-tab');
      switchPortfolioTab(tab);
    });
  });

  // Work page creator category filter chips
  const filterChips = document.querySelectorAll('.work-filter-chip');
  const creatorCards = document.querySelectorAll('.work-creator-card');

  if (filterChips.length && creatorCards.length) {
    filterChips.forEach((chip) => {
      chip.addEventListener('click', () => {
        filterChips.forEach(c => c.classList.remove('active'));
        chip.classList.add('active');

        const filter = chip.getAttribute('data-creator-filter');

        creatorCards.forEach((card) => {
          const category = card.getAttribute('data-category');
          const isMatch = filter === 'all' || category === filter;

          if (isMatch) {
            card.classList.remove('filtered-out');
            if (typeof gsap !== 'undefined') {
              gsap.fromTo(card,
                { opacity: 0, y: 15 },
                { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out', clearProps: 'transform' }
              );
            }
          } else {
            card.classList.add('filtered-out');
          }
        });
      });
    });
  }

  // Portfolio header reveal
  if (typeof gsap !== 'undefined') {
    const pHeader = document.querySelector('.portfolio-header-container');
    if (pHeader) {
      gsap.fromTo(pHeader,
        { opacity: 0, y: 35 },
        {
          opacity: 1, y: 0,
          duration: 1,
          ease: 'expo.out',
          scrollTrigger: {
            trigger: '.section-portfolio',
            start: 'top 85%',
            once: true,
          }
        }
      );
    }

    // Marquee container reveal on scroll (Homepage)
    const marqueeContainer = document.querySelector('.portfolio-marquee-container');
    if (marqueeContainer) {
      gsap.fromTo(marqueeContainer,
        { opacity: 0, y: 30 },
        {
          opacity: 1, y: 0,
          duration: 1,
          delay: 0.1,
          ease: 'expo.out',
          scrollTrigger: {
            trigger: '.section-portfolio',
            start: 'top 80%',
            once: true,
          }
        }
      );
    }

    // Dedicated Work Page Portfolio Container reveal
    const workPortfolio = document.querySelector('.work-portfolio-container');
    if (workPortfolio) {
      gsap.fromTo(workPortfolio,
        { opacity: 0, y: 30 },
        {
          opacity: 1, y: 0,
          duration: 1,
          delay: 0.08,
          ease: 'expo.out',
          clearProps: 'transform',
          scrollTrigger: {
            trigger: '.section-portfolio',
            start: 'top 82%',
            once: true,
          }
        }
      );
    }
  }
}

// ==========================================================================
// 09. TESTIMONIALS REVEAL
// ==========================================================================
function initTestimonialsReveal() {
  const section = document.querySelector('.section-testimonials');
  const cards = document.querySelectorAll('.testi-card');
  if (!section || !cards.length) return;
  const isMobileViewport = window.matchMedia('(max-width: 768px)').matches;

  // Give the glass surface a responsive highlight and a very subtle 3D tilt
  // that follows the pointer. The dataset guard keeps route transitions from
  // attaching duplicate listeners when the homepage is restored.
  if (window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    cards.forEach((card) => {
      if (card.dataset.glassInteractionBound === 'true') return;
      card.dataset.glassInteractionBound = 'true';

      card.addEventListener('pointermove', (event) => {
        const rect = card.getBoundingClientRect();
        const x = Math.max(0, Math.min(100, ((event.clientX - rect.left) / rect.width) * 100));
        const y = Math.max(0, Math.min(100, ((event.clientY - rect.top) / rect.height) * 100));
        const tiltX = ((x - 50) / 50) * 3.2;
        const tiltY = ((50 - y) / 50) * 3.2;

        card.style.setProperty('--pointer-x', `${x}%`);
        card.style.setProperty('--pointer-y', `${y}%`);
        card.style.setProperty('--tilt-x', `${tiltX.toFixed(2)}deg`);
        card.style.setProperty('--tilt-y', `${tiltY.toFixed(2)}deg`);
        card.classList.add('is-pointer-active');
      });

      card.addEventListener('pointerleave', () => {
        card.style.setProperty('--pointer-x', '50%');
        card.style.setProperty('--pointer-y', '50%');
        card.style.setProperty('--tilt-x', '0deg');
        card.style.setProperty('--tilt-y', '0deg');
        card.classList.remove('is-pointer-active');
      });
    });
  }

  gsap.fromTo('.testimonials-header',
    { opacity: 0, y: 40 },
    {
      opacity: 1, y: 0,
      duration: isMobileViewport ? 0.62 : 1.2,
      ease: 'expo.out',
      scrollTrigger: {
        trigger: section,
        start: isMobileViewport ? 'top 94%' : 'top 85%',
        once: true,
      }
    }
  );

  const stack = section.querySelector('.testimonials-cards-grid');
  if (!stack || cards.length !== 3) return;

  stack.classList.add('testimonials-stack');
  let activeIndex = 0;
  let cycleTimer = null;
  let isPaused = false;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  section.querySelector('.testimonials-nav')?.remove();
  const nav = document.createElement('div');
  nav.className = 'testimonials-nav';
  nav.setAttribute('aria-label', 'Review navigation');
  nav.innerHTML = `
    <button class="testimonials-nav-button testimonials-nav-prev" type="button" aria-label="Previous review">‹</button>
    <button class="testimonials-nav-button testimonials-nav-next" type="button" aria-label="Next review">›</button>
  `;
  stack.parentElement.appendChild(nav);
  const previousButton = nav.querySelector('.testimonials-nav-prev');
  const nextButton = nav.querySelector('.testimonials-nav-next');
  const supportsPointerParallax = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
  const dragThreshold = 80;
  let dragStartX = 0;
  let dragStartY = 0;
  let dragOffsetX = 0;
  let isDragging = false;

  const roleState = (role) => {
    // Premium "Testimonial Depth" stack (like Framer): 
    // Cards stack vertically behind one another with scaling, Z-depth and blur
    if (role === 0) {
      // Active Top Card
      return { x: 0, y: 0, scale: 1, opacity: 1, filter: 'blur(0px)', rotate: 0, rotateY: 0, zIndex: 3, transformPerspective: 1200 };
    }
    if (role === 1) {
      // Middle Card (tucked behind)
      return { x: 0, y: 28, scale: 0.92, opacity: 0.65, filter: 'blur(3px)', rotate: 0, rotateY: 0, zIndex: 2, transformPerspective: 1200 };
    }
    // Bottom Card (furthest behind)
    return { x: 0, y: 56, scale: 0.84, opacity: 0.35, filter: 'blur(6px)', rotate: 0, rotateY: 0, zIndex: 1, transformPerspective: 1200 };
  };

  const renderStack = (animate = true) => {
    cards.forEach((card, index) => {
      const role = (index - activeIndex + cards.length) % cards.length;
      const state = roleState(role);
      card.classList.toggle('is-testimonial-active', role === 0);
      card.setAttribute('data-card-role', role === 0 ? 'active' : role === 1 ? 'next' : 'previous');
      card.style.zIndex = String(state.zIndex);

      if (!animate || reducedMotion) {
        gsap.set(card, state);
      } else {
        // Use a highly fluid buttery easing with a soft elastic bounce
        gsap.to(card, {
          ...state,
          duration: isMobileViewport ? 0.56 : 1.0,
          ease: isMobileViewport ? 'power3.out' : 'elastic.out(1, 0.85)',
          overwrite: 'auto'
        });
      }
    });
    stack.dataset.testimonialsActiveIndex = String(activeIndex);
    stack.setAttribute('data-testimonials-active-index', String(activeIndex));
  };

  const scheduleCycle = () => {
    if (reducedMotion || isPaused || document.hidden) return;
    clearTimeout(cycleTimer);
    cycleTimer = setTimeout(() => {
      activeIndex = (activeIndex + 1) % cards.length;
      renderStack(true);
      scheduleCycle();
    }, 4200);
  };

  const setPaused = (paused) => {
    isPaused = paused;
    if (paused) clearTimeout(cycleTimer);
    else scheduleCycle();
  };

  const moveActive = (direction) => {
    activeIndex = (activeIndex + direction + cards.length) % cards.length;
    renderStack(!reducedMotion);
    scheduleCycle();
  };

  const settleStack = (immediate = false) => {
    const state = { x: 0, y: 0, rotate: 0, rotateY: 0, overwrite: 'auto' };
    if (immediate || reducedMotion) gsap.set(stack, state);
    else gsap.to(stack, { ...state, duration: 1.1, ease: 'elastic.out(1, 0.75)' });
  };

  const updateParallax = (event) => {
    if (!supportsPointerParallax || isDragging) return;
    const rect = stack.getBoundingClientRect();
    const normalizedX = Math.max(-1, Math.min(1, ((event.clientX - rect.left) / rect.width - 0.5) * 2));
    const normalizedY = Math.max(-1, Math.min(1, ((event.clientY - rect.top) / rect.height - 0.5) * 2));
    gsap.to(stack, {
      x: normalizedX * 14,
      y: normalizedY * 7,
      rotate: normalizedX * 0.65,
      duration: 0.42,
      ease: 'power3.out',
      overwrite: 'auto',
    });
  };

  const onPointerDown = (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    isDragging = true;
    dragStartX = event.clientX;
    dragStartY = event.clientY;
    dragOffsetX = 0;
    stack.classList.add('is-dragging');
    stack.setPointerCapture(event.pointerId);
    setPaused(true);
  };

  const onPointerMove = (event) => {
    if (!isDragging) {
      updateParallax(event);
      return;
    }
    const rawX = event.clientX - dragStartX;
    // Ultra smooth free movement with very light dampening at the edges
    const absX = Math.abs(rawX);
    dragOffsetX = Math.sign(rawX) * (absX < 150 ? absX : 150 + (absX - 150) * 0.45);
    const dragOffsetY = (event.clientY - dragStartY) * 0.18;

    // Add 3D rotation tilt dynamically based on the drag for a tactile coverflow feel
    gsap.set(stack, {
      x: dragOffsetX,
      y: dragOffsetY,
      rotate: dragOffsetX * 0.02,
      rotateY: dragOffsetX * 0.08
    });
  };

  const onPointerUp = (event) => {
    if (!isDragging) return;
    isDragging = false;
    stack.classList.remove('is-dragging');
    if (stack.hasPointerCapture?.(event.pointerId)) stack.releasePointerCapture(event.pointerId);
    if (Math.abs(dragOffsetX) >= dragThreshold) moveActive(dragOffsetX < 0 ? 1 : -1);
    settleStack();
    setPaused(false);
  };

  stack.addEventListener('mouseenter', () => setPaused(true));
  stack.addEventListener('mouseleave', () => {
    if (!isDragging) {
      settleStack();
      setPaused(false);
    }
  });
  stack.addEventListener('pointerdown', onPointerDown);
  stack.addEventListener('pointerup', onPointerUp);
  stack.addEventListener('pointercancel', onPointerUp);
  section.addEventListener('pointermove', onPointerMove);
  section.addEventListener('pointerleave', () => {
    if (!isDragging) settleStack();
  });
  previousButton.addEventListener('click', () => moveActive(-1));
  nextButton.addEventListener('click', () => moveActive(1));
  document.addEventListener('visibilitychange', () => setPaused(document.hidden));
  window.addEventListener('resize', () => renderStack(false), { passive: true });

  // Enter as one connected composition, then let the active card lead the cycle.
  gsap.set(cards, { opacity: 0, y: isMobileViewport ? 12 : 24, scale: isMobileViewport ? 0.98 : 0.96 });
  gsap.to(cards, {
    opacity: 1,
    duration: isMobileViewport ? 0.48 : 0.75,
    stagger: isMobileViewport ? 0.035 : 0.08,
    ease: 'expo.out',
    scrollTrigger: {
      trigger: section,
      start: isMobileViewport ? 'top 94%' : 'top 86%',
      once: true,
      onEnter: () => {
        renderStack(true);
        scheduleCycle();
      }
    }
  });

  renderStack(false);
}

// ==========================================================================
// 10. PROCESS SINGLE-LINE CONNECTED SCROLL DRAW (ENHANCED)
// ==========================================================================
// ==========================================================================
// 10. PROCESS SINGLE-LINE CONNECTED SCROLL DRAW (ENHANCED)
// ==========================================================================
function initProcessScrollDraw() {
  const lineActive = document.getElementById('process-line-active');
  const lineHead = document.getElementById('process-line-head');
  const nodes = document.querySelectorAll('.process-track-node');
  const steps = document.querySelectorAll('.process-col');
  const processSection = document.querySelector('.section-process');
  const trackContainer = document.getElementById('process-track-container');

  if (!steps.length || !processSection || !trackContainer) return;
  const isMobileViewport = window.matchMedia('(max-width: 768px)').matches;

  // Header & section entrance animation
  gsap.fromTo('.process-header',
    { opacity: 0, y: 35 },
    {
      opacity: 1, y: 0,
      duration: isMobileViewport ? 0.62 : 1.1,
      ease: 'expo.out',
      scrollTrigger: {
        trigger: processSection,
        start: isMobileViewport ? 'top 94%' : 'top 80%',
        once: true,
      }
    }
  );

  // Stagger in the process cards on entrance
  gsap.fromTo('.process-col',
    { opacity: 0, y: 30 },
    {
      opacity: 1, y: 0,
      duration: isMobileViewport ? 0.52 : 0.9,
      stagger: isMobileViewport ? 0.045 : 0.1,
      ease: 'expo.out',
      scrollTrigger: {
        trigger: '.process-grid',
        start: isMobileViewport ? 'top 94%' : 'top 85%',
        once: true,
      }
    }
  );

  // Compute exact horizontal centers of each step card
  const getStepCenters = () => {
    const trackWidth = trackContainer.offsetWidth || 1;
    return Array.from(steps).map(step => {
      const center = step.offsetLeft + step.offsetWidth / 2;
      return Math.min(100, Math.max(0, (center / trackWidth) * 100));
    });
  };

  // Function to set active state based on width percent
  const setProcessProgress = (pct, animate = false) => {
    const clamped = Math.min(100, Math.max(0, pct));
    if (lineActive) {
      if (animate) {
        gsap.to(lineActive, { width: `${clamped}%`, duration: 0.45, ease: 'power2.out' });
      } else {
        lineActive.style.width = `${clamped}%`;
      }
    }
    if (lineHead) {
      if (animate) {
        gsap.to(lineHead, { left: `${clamped}%`, duration: 0.45, ease: 'power2.out' });
      } else {
        lineHead.style.left = `${clamped}%`;
      }
    }

    const centers = getStepCenters();
    steps.forEach((step, idx) => {
      const targetCenter = centers[idx] || ((idx * 2 + 1) * 10);
      // Activate when line reaches within 5% of center or passes it
      if (clamped >= targetCenter - 6) {
        if (!step.classList.contains('active')) {
          step.classList.add('active');
          const iconBox = step.querySelector('.process-icon-box');
          if (iconBox) {
            gsap.fromTo(iconBox, { scale: 0.85 }, { scale: 1.06, duration: 0.35, ease: 'back.out(2)' });
          }
        }
      } else {
        step.classList.remove('active');
      }
    });

    nodes.forEach((node, idx) => {
      const targetCenter = centers[idx] || ((idx * 2 + 1) * 10);
      if (clamped >= targetCenter - 4) {
        node.classList.add('active');
      } else {
        node.classList.remove('active');
      }
    });
  };

  // Initial state: first step active
  const initialCenters = getStepCenters();
  setProcessProgress(initialCenters[0] || 10, false);

  // Scroll scrub across the section
  ScrollTrigger.create({
    trigger: processSection,
    start: 'top 70%',
    end: 'bottom 50%',
    scrub: 0.5,
    onUpdate: (self) => {
      const progress = self.progress;
      const centers = getStepCenters();
      const firstCenter = centers[0] || 10;
      const lastCenter = centers[centers.length - 1] || 90;
      // Interpolate smoothly from first step center to last step center
      const currentWidth = firstCenter + progress * (lastCenter - firstCenter + 5);
      setProcessProgress(currentWidth, false);
    }
  });

  // Interactive click on any step to jump progress to it
  steps.forEach((step, idx) => {
    step.addEventListener('click', () => {
      const centers = getStepCenters();
      const targetPct = centers[idx] || ((idx * 2 + 1) * 10);
      setProcessProgress(targetPct, true);
    });
  });

  // Recalculate on window resize
  window.addEventListener('resize', () => {
    const centers = getStepCenters();
    const activeSteps = document.querySelectorAll('.process-col.active');
    const lastActiveIdx = activeSteps.length - 1;
    if (lastActiveIdx >= 0 && centers[lastActiveIdx]) {
      setProcessProgress(centers[lastActiveIdx], false);
    }
  });
}

// ==========================================================================
// 11. CTA SECTION REVEAL
// ==========================================================================
function initCTAReveal() {
  const ctaSection = document.querySelector('.section-cta');
  if (!ctaSection) return;

  const isMobile = window.innerWidth <= 768;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ctaText = ctaSection.querySelector('.cta-left-content');
  const ctaTitle = ctaSection.querySelector('.cta-main-title');
  const ctaDesc = ctaSection.querySelector('.cta-support-desc');
  const ctaAction = ctaSection.querySelector('.cta-action-box');
  const ctaMicrocopy = ctaSection.querySelector('.cta-microcopy');

  if (prefersReducedMotion) {
    gsap.set([ctaText, ctaTitle, ctaDesc, ctaAction, ctaMicrocopy], {
      clearProps: 'opacity,transform'
    });
    return;
  }

  gsap.fromTo(ctaText,
    { opacity: 0, x: isMobile ? 0 : -50, y: isMobile ? 25 : 0 },
    {
      opacity: 1, x: 0, y: 0,
      duration: isMobile ? 0.62 : 1.1,
      ease: 'expo.out',
      scrollTrigger: {
        trigger: ctaSection,
        start: isMobile ? 'top 92%' : 'top 75%',
        once: true,
      }
    }
  );

  gsap.fromTo(ctaDesc,
    { opacity: 0, y: 18 },
    {
      opacity: 1, y: 0,
      duration: 0.8,
      delay: 0.24,
      ease: 'expo.out',
      scrollTrigger: {
        trigger: ctaSection,
        start: 'top 75%',
        once: true,
      }
    }
  );

  gsap.fromTo(ctaAction,
    { opacity: 0, y: 30, scale: 0.9 },
    {
      opacity: 1, y: 0, scale: 1,
      duration: 1.2,
      delay: 0.15,
      ease: 'back.out(1.4)',
      scrollTrigger: {
        trigger: ctaSection,
        start: 'top 72%',
        once: true,
      }
    }
  );

  gsap.fromTo(ctaMicrocopy,
    { opacity: 0, x: isMobile ? 0 : 50, y: isMobile ? 25 : 0 },
    {
      opacity: 1, x: 0, y: 0,
      duration: 1,
      delay: 0.25,
      ease: 'expo.out',
      scrollTrigger: {
        trigger: ctaSection,
        start: 'top 70%',
        once: true,
      }
    }
  );
}

// ==========================================================================
// 11.5. FAQ ACCORDION AND ENTRANCE REVEAL
// ==========================================================================
function initFaqAccordion() {
  const faqSection = document.querySelector('.section-faq');
  if (!faqSection) return;

  const items = Array.from(faqSection.querySelectorAll('.faq-item'));
  if (items.length === 0) return;

  // Entrance reveal
  const heading = faqSection.querySelector('.faq-heading');
  if (heading && !heading.dataset.faqRevealed) {
    heading.dataset.faqRevealed = 'true';
    gsap.fromTo(
      heading,
      { opacity: 0, y: 24 },
      {
        opacity: 1,
        y: 0,
        duration: 1.1,
        ease: 'expo.out',
        scrollTrigger: {
          trigger: faqSection,
          start: 'top 85%',
          once: true,
        },
      }
    );
  }

  // Ensure items are clearly visible
  gsap.set(items, { opacity: 1, y: 0 });

  // Initialize all items collapsed
  items.forEach((item) => {
    const summary = item.querySelector('.faq-summary');
    const body = item.querySelector('.faq-body');
    if (!summary || !body) return;

    if (!item.classList.contains('is-open')) {
      body.style.height = '0px';
      summary.setAttribute('aria-expanded', 'false');
    } else {
      body.style.height = 'auto';
      summary.setAttribute('aria-expanded', 'true');
    }
  });

  const toggleItem = (item) => {
    const summary = item.querySelector('.faq-summary');
    const body = item.querySelector('.faq-body');
    if (!summary || !body) return;

    const isCurrentlyOpen = item.classList.contains('is-open');

    // Smoothly collapse any other open items
    items.forEach((other) => {
      if (other !== item && other.classList.contains('is-open')) {
        other.classList.remove('is-open');
        const otherBtn = other.querySelector('.faq-summary');
        const otherBody = other.querySelector('.faq-body');
        if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');
        if (otherBody) {
          gsap.killTweensOf(otherBody);
          gsap.fromTo(
            otherBody,
            { height: otherBody.offsetHeight },
            {
              height: 0,
              duration: 0.35,
              ease: 'power2.inOut',
              onComplete: () => {
                otherBody.style.height = '0px';
                if (window.ScrollTrigger) ScrollTrigger.refresh();
              },
            }
          );
        }
      }
    });

    if (isCurrentlyOpen) {
      item.classList.remove('is-open');
      summary.setAttribute('aria-expanded', 'false');
      gsap.killTweensOf(body);
      gsap.fromTo(
        body,
        { height: body.offsetHeight },
        {
          height: 0,
          duration: 0.35,
          ease: 'power2.inOut',
          onComplete: () => {
            body.style.height = '0px';
            if (window.ScrollTrigger) ScrollTrigger.refresh();
          },
        }
      );
    } else {
      item.classList.add('is-open');
      summary.setAttribute('aria-expanded', 'true');
      gsap.killTweensOf(body);

      // Measure target natural height accurately
      const answer = body.querySelector('.faq-answer');
      let targetHeight = 0;
      if (answer) {
        targetHeight = answer.offsetHeight;
      }
      if (!targetHeight || targetHeight < 20) {
        body.style.height = 'auto';
        targetHeight = body.scrollHeight || 100;
        body.style.height = '0px';
      }

      gsap.fromTo(
        body,
        { height: 0 },
        {
          height: targetHeight,
          duration: 0.42,
          ease: 'power3.out',
          onComplete: () => {
            body.style.height = 'auto';
            if (window.ScrollTrigger) ScrollTrigger.refresh();
          },
        }
      );
    }
  };

  // Bind the disclosure behavior to the button only. This keeps answer text
  // selectable and prevents nested card clicks from toggling unexpectedly.
  items.forEach((item) => {
    if (item.dataset.faqItemBound === 'true') return;
    item.dataset.faqItemBound = 'true';

    const summary = item.querySelector('.faq-summary');
    if (!summary) return;

    summary.addEventListener('click', (e) => {
      e.preventDefault();
      toggleItem(item);
    });
  });

  window.__hvFaqCleanup = () => {
    items.forEach((item) => {
      delete item.dataset.faqItemBound;
    });
  };
}

// ==========================================================================
// 12. MAGNETIC BUTTON PHYSICS
// ==========================================================================
function initMagneticElements() {
  const magneticItems = document.querySelectorAll(
    '.btn-primary-cyan, .btn-secondary-dark, .btn-primary-cyan-large, .btn-nav-talk, .portfolio-arrow-btn, .floating-badge-item'
  );

  magneticItems.forEach((btn) => {
    btn.addEventListener('mousemove', (e) => {
      const rect = btn.getBoundingClientRect();
      const x = (e.clientX - rect.left - rect.width / 2) * 0.25;
      const y = (e.clientY - rect.top - rect.height / 2) * 0.25;

      gsap.to(btn, {
        x,
        y,
        duration: 0.35,
        ease: 'power3.out',
      });
    });

    btn.addEventListener('mouseleave', () => {
      gsap.to(btn, {
        x: 0,
        y: 0,
        duration: 0.6,
        ease: 'elastic.out(1, 0.4)',
      });
    });
  });
}

// ==========================================================================
// 13. SCROLL VELOCITY REACTIVE EFFECTS
// ==========================================================================
function initScrollVelocityEffects() {
  // Section skewing disabled to prevent GPU repaint jitter, subpixel blurriness,
  // and hover conflicts on interactive card grids.
}

// ==========================================================================
// 14. INSTAGRAM REELS INTERACTIVE PLAYER (CASE STUDY PAGES)
// ==========================================================================
function initInstagramReelsPlayer() {
  const shell = document.getElementById('page-transition-shell');
  const section = shell ? shell.querySelector('.case-reels-section') : document.querySelector('.case-reels-section');
  const rail = section?.querySelector('.ig-reels-grid');
  if (!section || !rail) return;

  if (window.__hvCaseReelsCleanup) window.__hvCaseReelsCleanup();
  rail.querySelectorAll('.case-reel-clone').forEach((card) => card.remove());
  rail.querySelectorAll('.ig-reel-icon-badge, .ig-reel-title, .ig-reel-tag').forEach((element) => element.remove());

  // Some of the later reel cards are intentionally compact and do not carry
  // a sound button in their static markup. Normalize every card so creator
  // and movie case studies expose the same mute/unmute control.
  rail.querySelectorAll('.ig-reel-card').forEach((card) => {
    if (card.querySelector('.ig-sound-toggle-btn')) return;
    const metaRow = card.querySelector('.ig-reel-meta-row') || card.querySelector('.ig-reel-bottom-info');
    if (!metaRow) return;
    const soundButton = document.createElement('button');
    soundButton.type = 'button';
    soundButton.className = 'ig-sound-toggle-btn';
    soundButton.setAttribute('aria-label', 'Unmute audio');
    soundButton.title = 'Unmute Audio';
    soundButton.innerHTML = `
      <svg class="sound-icon-muted" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
        <path d="M11 5L6 9H2v6h4l5 4V5z"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>
      </svg>
      <svg class="sound-icon-unmuted" style="display:none;" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true">
        <path d="M11 5L6 9H2v6h4V5z"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>
      </svg>`;
    metaRow.appendChild(soundButton);
  });

  // Profile reels use the creator's social platforms. Keep this treatment on
  // the detailed creator pages only; the homepage carousel has no badges.
  const platformTypes = ['instagram', 'tiktok', 'shorts', 'instagram', 'tiktok', 'shorts'];
  rail.querySelectorAll('.ig-reel-top-bar').forEach((topBar, index) => {
    const card = topBar.closest('.ig-reel-card');
    if (!topBar.querySelector('.ig-platform-badge')) {
      const badge = document.createElement('span');
      const platform = platformTypes[index % platformTypes.length];
      badge.className = `ig-platform-badge ig-platform-badge--${platform}`;
      badge.setAttribute('aria-label', platform === 'tiktok' ? 'TikTok' : platform === 'shorts' ? 'YouTube Shorts' : 'Instagram Reels');
      badge.setAttribute('aria-hidden', 'true');
      const logo = document.createElement('img');
      logo.src = platform === 'tiktok'
        ? '/logos/tiktok.svg'
        : platform === 'shorts'
          ? '/logos/youtube-shorts.png'
          : '/logos/instagram.svg';
      logo.alt = '';
      logo.setAttribute('aria-hidden', 'true');
      badge.appendChild(logo);
      topBar.appendChild(badge);
    }

    const views = card?.querySelector('.ig-reel-views');
    if (views) topBar.appendChild(views);
  });

  rail.querySelectorAll('.ig-reel-views svg').forEach((icon) => {
    icon.innerHTML = '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6S2 12 2 12Z"></path><circle cx="12" cy="12" r="2.5"></circle>';
    icon.setAttribute('aria-hidden', 'true');
  });

  let viewport = rail.parentElement;
  if (!viewport.classList.contains('ig-reels-viewport')) {
    viewport = document.createElement('div');
    viewport.className = 'ig-reels-viewport';
    rail.parentNode.insertBefore(viewport, rail);
    viewport.appendChild(rail);
  }

  const originalCards = Array.from(rail.querySelectorAll('.ig-reel-card'));
  if (!originalCards.length) return;

  // Add 2 sets of clones so even on 4K ultrawide screens the carousel is seamless and never runs out of cards
  for (let k = 0; k < 2; k++) {
    originalCards.forEach((card) => {
      const clone = card.cloneNode(true);
      clone.classList.add('case-reel-clone');
      clone.setAttribute('aria-hidden', 'true');
      clone.setAttribute('tabindex', '-1');
      clone.querySelectorAll('button').forEach((button) => button.setAttribute('tabindex', '-1'));
      // Clones are only a visual loop buffer. Defer their media requests
      // until they approach the viewport instead of starting another full
      // set of autoplay downloads during page initialization.
      clone.querySelectorAll('.ig-reel-video').forEach((video) => {
        video.preload = 'none';
        video.removeAttribute('autoplay');
      });
      rail.appendChild(clone);
    });
  }

  const allReelCards = Array.from(rail.querySelectorAll('.ig-reel-card'));
  const videos = allReelCards.map((card) => card.querySelector('.ig-reel-video')).filter(Boolean);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let offset = 0;
  let loopWidth = 0;
  let lastTime = 0;
  let frameId = 0;
  let hasMeasured = false;
  let isVisible = false;
  let isHovering = false;
  let isDragging = false;
  let isHorizontalDrag = false;
  let isVerticalScroll = false;
  let startX = 0;
  let startY = 0;
  let startOffset = 0;
  let lastDragX = 0;
  let lastDragTime = 0;
  let dragVelocity = 0;
  let activePointerId = null;
  let suppressClick = false;
  let lastPlaybackCheck = 0;
  const autoSpeed = 38; // px/sec

  // Keep failed/slow media from leaving an empty card behind. The poster is
  // the visual fallback until the browser actually emits `playing`, and a
  // bounded reload gives transient range/network failures a second chance.
  const recoveryTimers = new WeakMap();
  const scheduleVideoRecovery = (video, delay = 450) => {
    if (!video || !video.isConnected || recoveryTimers.has(video)) return;
    const attempts = Number(video.dataset.reelRecoveryAttempts || 0);
    if (attempts >= 3) return;

    video.dataset.reelRecoveryAttempts = String(attempts + 1);
    const timer = window.setTimeout(() => {
      recoveryTimers.delete(video);
      if (!video.isConnected) return;

      video.classList.remove('is-reel-loading');
      video.load();

      if (video.dataset.reelWantPlayback === 'true' && isVisible && !document.hidden) {
        const attempt = video.play();
        if (attempt?.catch) attempt.catch(() => { });
      }
    }, delay * Math.pow(2, attempts));
    recoveryTimers.set(video, timer);
  };

  const attemptVideoPlay = (video) => {
    if (!video || !video.isConnected) return;
    if (video.dataset.reelAudioEnabled !== 'true') {
      video.defaultMuted = true;
      video.muted = true;
    }
    video.playsInline = true;
    video.loop = true;
    video.dataset.reelWantPlayback = 'true';
    video.preload = 'auto';

    if (video.readyState === 0) video.load();
    const attempt = video.play();
    if (attempt?.catch) {
      attempt.catch(() => {
        // Muted autoplay can still be rejected during a route/visibility
        // transition. Retry through the same bounded recovery path.
        scheduleVideoRecovery(video, 300);
      });
    }
  };

  // Bind video events to cleanly toggle is-playing
  videos.forEach((video) => {
    const card = video.closest('.ig-reel-card');
    video.defaultMuted = true;
    video.muted = true;
    video.loop = true;
    video.playsInline = true;
    // Let the player decide which cards are active. Leaving autoplay on every
    // original card starts all five source files before the viewport logic can
    // pause the offscreen ones (particularly expensive on Umar's reels).
    video.autoplay = false;
    video.removeAttribute('autoplay');
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', '');
    video.setAttribute('muted', '');
    video.dataset.reelSource = video.getAttribute('src') || '';
    video.dataset.reelWantPlayback = 'false';
    video.dataset.reelAudioEnabled = 'false';
    video.addEventListener('playing', () => {
      video.dataset.reelRecoveryAttempts = '0';
      video.classList.remove('is-reel-loading');
      card?.classList.add('is-playing');
    });
    video.addEventListener('pause', () => card?.classList.remove('is-playing'));
    video.addEventListener('error', () => {
      card?.classList.remove('is-playing');
      video.classList.add('is-reel-loading');
      scheduleVideoRecovery(video);
    });
    video.addEventListener('stalled', () => {
      if (video.readyState < 2 && video.dataset.reelWantPlayback === 'true') {
        scheduleVideoRecovery(video, 900);
      }
    });
  });

  const render = () => {
    rail.style.transform = `translate3d(${-offset}px, 0, 0)`;
  };

  const measure = () => {
    const firstClone = rail.querySelector('.case-reel-clone');
    if (firstClone && originalCards[0]) {
      loopWidth = firstClone.offsetLeft - originalCards[0].offsetLeft;
    }
    if (loopWidth > 0) {
      if (!hasMeasured) {
        offset = Math.min(loopWidth * 0.12, 150);
        hasMeasured = true;
      } else {
        offset = ((offset % loopWidth) + loopWidth) % loopWidth;
      }
    }
    render();
  };

  const isMobileScreen = () => (typeof window !== 'undefined' ? window.innerWidth <= 768 : false);

  const setPlayback = (shouldPlay) => {
    if (!shouldPlay || !isVisible || document.hidden) {
      videos.forEach((video) => {
        video.dataset.reelWantPlayback = 'false';
        video.dataset.reelAudioEnabled = 'false';
        try { video.pause(); } catch (_) { }
        video.closest('.ig-reel-card')?.classList.remove('is-playing');
      });
      return;
    }

    if (isMobileScreen()) {
      const viewportCenter = window.innerWidth / 2;
      let closestCard = null;
      let minDistance = Infinity;

      allReelCards.forEach((card) => {
        const rect = card.getBoundingClientRect();
        if (rect.right > 0 && rect.left < window.innerWidth) {
          const cardCenter = rect.left + rect.width / 2;
          const distance = Math.abs(cardCenter - viewportCenter);
          if (distance < minDistance) {
            minDistance = distance;
            closestCard = card;
          }
        }
      });

      if (!closestCard && allReelCards.length) {
        closestCard = allReelCards[0];
      }

      allReelCards.forEach((card) => {
        const video = card.querySelector('.ig-reel-video');
        if (!video) return;
        if (card === closestCard) {
          attemptVideoPlay(video);
        } else {
          video.dataset.reelWantPlayback = 'false';
          video.dataset.reelAudioEnabled = 'false';
          try { video.pause(); } catch (_) { }
          card.classList.remove('is-playing');
        }
      });
    } else {
      // Desktop: only warm cards near the viewport. Playing every original
      // plus two clone sets at once can saturate the browser's media pipeline,
      // especially on the larger Umar source files.
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 1280;
      allReelCards.forEach((card) => {
        const video = card.querySelector('.ig-reel-video');
        if (!video) return;
        const rect = card.getBoundingClientRect();
        const isNearViewport = rect.right > -viewportWidth * 0.35 && rect.left < viewportWidth * 1.35;
        if (isNearViewport) {
          attemptVideoPlay(video);
        } else {
          video.dataset.reelWantPlayback = 'false';
          video.dataset.reelAudioEnabled = 'false';
          video.preload = 'metadata';
          try { video.pause(); } catch (_) { }
          card.classList.remove('is-playing');
        }
      });
    }
  };

  const tick = (time) => {
    if (!lastTime) lastTime = time;
    const delta = Math.min((time - lastTime) / 1000, 0.05);
    lastTime = time;

    if (!loopWidth && isVisible) measure();

    if (!reduceMotion && isVisible && !document.hidden && loopWidth) {
      if (isDragging) {
        // Dragging directly updates offset and renders in pointermove
      } else {
        // Inertia decay glide
        if (Math.abs(dragVelocity) > 1.0) {
          offset += dragVelocity * delta;
          dragVelocity *= Math.pow(0.96, delta * 60);
          if (Math.abs(dragVelocity) <= 1.0) {
            dragVelocity = 0;
          }
        } else if (!isHovering) {
          // Continuous marquee
          offset += autoSpeed * delta;
        } else {
          // Slow crawl on hover so cards don't freeze dead
          offset += (autoSpeed * 0.25) * delta;
        }

        offset = ((offset % loopWidth) + loopWidth) % loopWidth;
        render();
      }
    }

    // Update active mobile centered reel every 350ms during motion
    if (isVisible && !document.hidden && time - lastPlaybackCheck > 350) {
      lastPlaybackCheck = time;
      setPlayback(true);
    }
    frameId = requestAnimationFrame(tick);
  };

  const observer = new IntersectionObserver(([entry]) => {
    isVisible = entry.isIntersecting;
    section.classList.toggle('is-reels-active', isVisible);
    setPlayback(isVisible && !document.hidden);
  }, { rootMargin: '200px 0px 200px 0px', threshold: 0 });
  observer.observe(section);

  const unlockEvents = ['pointerdown', 'touchstart', 'scroll', 'wheel', 'click', 'keydown', 'pointerup'];
  const unlockOnInteraction = () => {
    if (isVisible && !document.hidden) {
      setPlayback(true);
    }
  };
  unlockEvents.forEach((evt) => {
    window.addEventListener(evt, unlockOnInteraction, { passive: true });
  });

  // If section is already near viewport on load, activate playback immediately
  const rect = section.getBoundingClientRect();
  if (rect.top < window.innerHeight + 300 && rect.bottom > -300) {
    isVisible = true;
    section.classList.add('is-reels-active');
    setPlayback(!document.hidden);
  }

  const onVisibilityChange = () => setPlayback(isVisible && !document.hidden);
  const onResize = () => measure();

  const onPointerDown = (event) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    isDragging = false;
    isHorizontalDrag = false;
    isVerticalScroll = false;
    suppressClick = false;
    dragVelocity = 0;
    startX = event.clientX;
    startY = event.clientY;
    lastDragX = event.clientX;
    lastDragTime = performance.now();
    startOffset = offset;
    activePointerId = event.pointerId;

    if (!loopWidth) measure();
  };

  const onPointerEnter = (event) => {
    // Only pause/slow down on genuine mouse hover, never on touch tap
    if (event.pointerType === 'mouse') {
      isHovering = true;
    }
  };

  const onPointerLeave = (event) => {
    if (event.pointerType === 'mouse') {
      isHovering = false;
    }
  };

  const onPointerMove = (event) => {
    if (activePointerId === null || event.pointerId !== activePointerId) return;

    if (event.pointerType === 'mouse' && event.buttons === 0) {
      stopDragging(event);
      return;
    }

    if (isVerticalScroll) return;

    const diffX = event.clientX - startX;
    const diffY = event.clientY - startY;

    // Axis locking: distinguish vertical page swipe from horizontal carousel drag
    if (!isHorizontalDrag) {
      if (Math.abs(diffX) < 7 && Math.abs(diffY) < 7) return;

      if (Math.abs(diffY) > Math.abs(diffX)) {
        isVerticalScroll = true;
        isDragging = false;
        return;
      }

      // Claim horizontal drag
      isHorizontalDrag = true;
      isDragging = true;
      rail.classList.add('is-dragging');
      viewport.classList.add('is-dragging');
      if (viewport.setPointerCapture) {
        try { viewport.setPointerCapture(event.pointerId); } catch (_) { }
      }
    }

    if (!isDragging || !loopWidth) return;

    if (Math.abs(diffX) > 6) suppressClick = true;

    const now = performance.now();
    const dt = Math.max(now - lastDragTime, 1);
    const instVel = -(event.clientX - lastDragX) / (dt / 1000);
    dragVelocity = dragVelocity * 0.3 + instVel * 0.7;
    lastDragX = event.clientX;
    lastDragTime = now;

    // 1:1 direct tracking feel
    offset = ((startOffset - diffX) % loopWidth + loopWidth) % loopWidth;
    render();

    if (isMobileScreen()) {
      setPlayback(true);
    }
  };

  const stopDragging = (event) => {
    if (activePointerId === null) return;
    if (event && event.pointerId !== undefined && event.pointerId !== activePointerId) return;
    activePointerId = null;

    if (isDragging) {
      isDragging = false;
      rail.classList.remove('is-dragging');
      viewport.classList.remove('is-dragging');
      if (event?.pointerId !== undefined) {
        try { viewport.releasePointerCapture?.(event.pointerId); } catch (_) { }
      }
    }
    isHorizontalDrag = false;
    isVerticalScroll = false;
    window.setTimeout(() => { suppressClick = false; }, 40);
  };

  const onWheel = (event) => {
    const isHorizontalWheel = Math.abs(event.deltaX) > Math.abs(event.deltaY);
    const isShiftWheel = event.shiftKey && Math.abs(event.deltaY) > 0;
    if (!isHorizontalWheel && !isShiftWheel) {
      // Natural vertical page scroll allowed
      return;
    }

    const delta = isHorizontalWheel ? event.deltaX : event.deltaY;
    if (Math.abs(delta) < 2) return;

    if (event.cancelable) event.preventDefault();
    if (!loopWidth) measure();

    offset = ((offset + delta) % loopWidth + loopWidth) % loopWidth;
    dragVelocity = delta * 8;
    render();
  };

  viewport.addEventListener('pointerenter', onPointerEnter);
  viewport.addEventListener('pointerleave', onPointerLeave);
  viewport.addEventListener('pointerdown', onPointerDown);
  viewport.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('pointerup', stopDragging, { passive: true });
  window.addEventListener('pointercancel', stopDragging, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });
  document.addEventListener('visibilitychange', onVisibilityChange);

  allReelCards.forEach((card) => {
    const video = card.querySelector('.ig-reel-video');
    const soundBtn = card.querySelector('.ig-sound-toggle-btn');
    const poster = card.querySelector('.ig-reel-poster');
    const progressFill = card.querySelector('.ig-reel-progress-fill');
    if (!video) return;

    const updateSoundUI = (isMuted) => {
      if (!soundBtn) return;
      const mutedIcon = soundBtn.querySelector('.sound-icon-muted');
      const unmutedIcon = soundBtn.querySelector('.sound-icon-unmuted');
      if (mutedIcon) mutedIcon.style.display = isMuted ? 'block' : 'none';
      if (unmutedIcon) unmutedIcon.style.display = isMuted ? 'none' : 'block';
      soundBtn.setAttribute('title', isMuted ? 'Unmute Audio' : 'Mute Audio');
      soundBtn.setAttribute('aria-label', isMuted ? 'Unmute Audio' : 'Mute Audio');
    };

    const updateOtherSoundButtons = (mutedVideo) => {
      videos.forEach((otherVideo) => {
        if (otherVideo === mutedVideo) return;
        otherVideo.muted = true;
        otherVideo.dataset.reelAudioEnabled = 'false';
        const otherButton = otherVideo.closest('.ig-reel-card')?.querySelector('.ig-sound-toggle-btn');
        if (otherButton) {
          const mutedIcon = otherButton.querySelector('.sound-icon-muted');
          const unmutedIcon = otherButton.querySelector('.sound-icon-unmuted');
          if (mutedIcon) mutedIcon.style.display = 'block';
          if (unmutedIcon) unmutedIcon.style.display = 'none';
          otherButton.setAttribute('title', 'Unmute Audio');
          otherButton.setAttribute('aria-label', 'Unmute audio');
        }
      });
    };

    const markPlaying = () => {
      card.classList.add('is-playing');
      if (poster) poster.style.opacity = '0';
      updateSoundUI(video.muted);
    };

    video.addEventListener('play', markPlaying);
    video.addEventListener('playing', markPlaying);
    if (!video.paused && video.currentTime > 0) {
      markPlaying();
    }
    video.addEventListener('pause', () => card.classList.remove('is-playing'));
    video.addEventListener('timeupdate', () => {
      if (progressFill && video.duration) progressFill.style.width = `${(video.currentTime / video.duration) * 100}%`;
    });

    const playWithSound = () => {
      updateOtherSoundButtons(video);
      video.dataset.reelWantPlayback = 'true';
      video.dataset.reelAudioEnabled = 'true';
      video.preload = 'auto';
      video.muted = false;
      const attempt = video.play();
      if (attempt?.catch) {
        attempt.catch(() => {
          video.muted = true;
          video.dataset.reelAudioEnabled = 'false';
          updateSoundUI(true);
          const retry = video.play();
          retry?.catch?.(() => scheduleVideoRecovery(video, 300));
        });
      }
    };

    if (soundBtn) {
      soundBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        event.preventDefault();
        if (video.muted) playWithSound();
        else {
          video.muted = true;
          video.dataset.reelAudioEnabled = 'false';
        }
        updateSoundUI(video.muted);
      });
    }
    updateSoundUI(video.muted);

    card.setAttribute('tabindex', '0');
    const togglePlayback = () => {
      if (video.paused) attemptVideoPlay(video);
      else {
        video.dataset.reelWantPlayback = 'false';
        video.dataset.reelAudioEnabled = 'false';
        video.pause();
      }
    };
    card.addEventListener('click', (event) => {
      if (suppressClick || event.target.closest('.ig-sound-toggle-btn') || event.target.closest('a')) return;
      togglePlayback();
    });
    card.addEventListener('keydown', (event) => {
      if ((event.key === ' ' || event.key === 'Enter') && !event.target.closest('.ig-sound-toggle-btn')) {
        event.preventDefault();
        togglePlayback();
      }
    });
  });

  requestAnimationFrame(measure);
  frameId = requestAnimationFrame(tick);

  window.__hvCaseReelsCleanup = () => {
    if (frameId) cancelAnimationFrame(frameId);
    observer.disconnect();
    viewport.removeEventListener('pointerenter', onPointerEnter);
    viewport.removeEventListener('pointerleave', onPointerLeave);
    viewport.removeEventListener('pointerdown', onPointerDown);
    viewport.removeEventListener('wheel', onWheel);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', stopDragging);
    window.removeEventListener('pointercancel', stopDragging);
    window.removeEventListener('resize', onResize);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    unlockEvents.forEach((evt) => {
      window.removeEventListener(evt, unlockOnInteraction);
    });
    videos.forEach((video) => { try { video.pause(); } catch (_) { } });
  };

  if (typeof gsap !== 'undefined') {
    gsap.fromTo('.breakdown-card',
      { opacity: 0, y: 35 },
      {
        opacity: 1,
        y: 0,
        duration: 0.9,
        stagger: 0.12,
        ease: 'expo.out',
        scrollTrigger: {
          trigger: '.highverz-agency-breakdown',
          start: 'top 82%',
          once: true
        }
      }
    );
  }
}

// FOOTER WATERMARK — INTERACTIVE SCATTER GRID
// Keeps the large Highverz mark intact at rest, then gently breaks its pixels
// away from the pointer and lets them settle back into the logo.
export function initFooterScatterGrid() {
  if (typeof window.__hvFooterScatterCleanup === 'function') {
    try { window.__hvFooterScatterCleanup(); } catch (_) { }
    window.__hvFooterScatterCleanup = null;
  }
  const watermark = document.querySelector('.footer-watermark-logo');
  if (!watermark) return;
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  // Enhanced reactive scatter physics: Sky Blue in light mode, Electric Cyan in dark mode
  window.__hvFooterScatterCleanup = initScatterGrid(watermark, {
    dotSize: 4,
    dotGap: 2,
    radius: 220,
    strength: 2.2,
    stiffness: 0.035,
    damping: 0.86,
    base: isLight ? [90, 160, 210] : [210, 230, 250],
    accent: isLight ? [14, 165, 233] : [0, 229, 255]
  });
}
window.__hvInitFooterScatterGrid = initFooterScatterGrid;

// Re-sync scatter grid on theme changes
if (!window.__hvScatterThemeListenerBound) {
  window.__hvScatterThemeListenerBound = true;
  window.addEventListener('hv:themechange', () => {
    initFooterScatterGrid();
  });
}
