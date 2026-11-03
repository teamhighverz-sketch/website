/**
 * HIGHVERZ — REVEAL PRELOADER
 *
 * Framer SiteLoader behavior, adapted to the site's vanilla DOM runtime.
 *
 * Sequence:
 *  0.1s  → Glass HV mark fades + sharpens into focus
 *  0.7s  → Logo fades/scales in
 *  Ready → Reveal callback fires (hero starts)
 *  Ready → Full-screen loader lifts upward, revealing the page below
 */

import gsap from 'gsap';
import loaderLogo from '../assets/highverz-hv-logo.svg?raw';
import { preloadHomeMedia, HOME_MEDIA_TIMEOUT } from './preloadHomeMedia.js';

let activeIntroInstance = null;

export class HighverzIntro {
  constructor(options = {}) {
    this.onComplete    = options.onComplete    || (() => {});
    this.onStartReveal = options.onStartReveal || null;
    this.hasRevealed   = false;
    this.isDestroyed   = false;
    this.isCompleted   = false;

    this.container   = null;
    this.tl          = null;
    this.safetyTimer = null;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DOM
  // ─────────────────────────────────────────────────────────────────────────
  createDOM() {
    let container = document.getElementById('highverz-intro');

    const html = `
      <div class="hv-reveal-center" id="hv-reveal-center">
        <div class="hv-reveal-logo" id="hv-reveal-logo">
          <div class="hv-reveal-mark" aria-hidden="true">
            <div class="hv-reveal-glass">
              ${loaderLogo.replace(/<\?xml[^>]*\?>\s*/, '').replace('<svg ', '<svg class="hv-reveal-glass-base" aria-hidden="true" focusable="false" ')}
              <span class="hv-reveal-edge" aria-hidden="true"></span>
              <span class="hv-reveal-dispersion" aria-hidden="true"></span>
              <span class="hv-reveal-sheen" aria-hidden="true"></span>
            </div>
          </div>
        </div>
      </div>
      <div class="hv-loader-progress" aria-hidden="true">
        <div class="hv-loader-progress-track">
          <span class="hv-loader-progress-fill"></span>
        </div>
      </div>
    `;

    if (!container) {
      container = document.createElement('div');
      container.id = 'highverz-intro';
      container.setAttribute('aria-label', 'Highverz Loading');
      container.innerHTML = html;
      document.body.prepend(container);
    } else {
      container.innerHTML = html;
    }

    this.container = container;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // ANIMATE
  // ─────────────────────────────────────────────────────────────────────────
  animate() {
    const logo      = this.container.querySelector('#hv-reveal-logo');
    const center    = this.container.querySelector('#hv-reveal-center');
    const progress  = this.container.querySelector('.hv-loader-progress-fill');

    // Matches the Framer SiteLoader default: fade in the complete logo as one unit.
    gsap.set(logo, { opacity: 0, scale: 0.92, y: 8 });
    gsap.set(progress, { scaleX: 0, transformOrigin: 'left center' });

    this.tl = gsap.timeline();

    // SiteLoader's default logo entrance.
    this.tl.to(logo, {
      opacity: 1,
      scale: 1,
      y: 0,
      duration: 0.35,
      ease: 'power2.out',
    }, 0);

    // Initial progress bump while assets begin loading
    this.tl.to(progress, {
      scaleX: 0.25,
      duration: 0.2,
      ease: 'power1.out',
    }, 0);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // REAL ASSET PRELOADING COORDINATOR
  // Warm fonts and media in parallel while the intro is displayed.
  // Home includes all photos, posters, and a playable buffer for every reel.
  // ─────────────────────────────────────────────────────────────────────────
  async startAssetPreload() {
    const progress = this.container?.querySelector('.hv-loader-progress-fill');
    let currentScale = 0.25;

    const setProgress = (val, duration = 0.25) => {
      if (this.isFinishing || this.isCompleted || !progress) return;
      currentScale = Math.max(currentScale, val);
      gsap.to(progress, {
        scaleX: currentScale,
        duration,
        ease: 'power2.out',
        overwrite: 'auto'
      });
    };

    const isMobile = typeof window !== 'undefined' && (window.innerWidth < 768 || window.matchMedia('(max-width: 768px)').matches);
    const isHomePage = window.location.pathname === '/' || window.location.pathname.endsWith('/index.html');

    // 1. Critical Typography
    const fontTask = (document.fonts && document.fonts.ready)
      ? document.fonts.ready.then(() => { if (!isHomePage) setProgress(0.45); }).catch(() => {})
      : Promise.resolve();

    // 2. Route-aware first-viewport media. The former fixed Home poster list
    // allowed Work, Team, and creator pages to reveal while their own hero
    // assets were still decoding. Defer off-screen images and wait only for
    // what can actually be seen when the curtain lifts.
    const viewportBottom = window.innerHeight * 1.35;
    const images = Array.from(document.images || []);
    const videos = Array.from(document.querySelectorAll('video'));
    const isInInitialViewport = (element) => {
      const rect = element.getBoundingClientRect();
      return rect.bottom > -80 && rect.top < viewportBottom;
    };
    const waitForImage = (image) => new Promise((resolve) => {
      const finish = () => {
        if (image.decode) image.decode().catch(() => {}).finally(resolve);
        else resolve();
      };
      if (image.complete) {
        finish();
      } else {
        image.addEventListener('load', finish, { once: true });
        image.addEventListener('error', resolve, { once: true });
      }
    });
    const waitForVideo = (video) => new Promise((resolve) => {
      if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
        resolve();
        return;
      }
      video.addEventListener('loadeddata', resolve, { once: true });
      video.addEventListener('error', resolve, { once: true });
    });
    const viewportMediaTask = isHomePage ? Promise.resolve() : Promise.all([
      ...images.map((image) => {
        if (isInInitialViewport(image)) {
          image.fetchPriority = 'high';
          return waitForImage(image);
        }
        if (!image.loading) image.loading = 'lazy';
        return Promise.resolve();
      }),
      ...videos.filter(isInInitialViewport).map(waitForVideo)
    ]).then(() => setProgress(0.70)).catch(() => {});

    // Home warms every photo, poster, and reel while the loader is on screen.
    const homeMediaTask = isHomePage
      ? preloadHomeMedia(ratio => setProgress(0.25 + ratio * 0.65))
      : Promise.resolve();

    // 3. Fluid WebGL Background Preload & Shader Compilation
    const fluidTask = (typeof window.loadFluidBackground === 'function')
      ? window.loadFluidBackground().then(() => { if (!isHomePage) setProgress(0.85); }).catch(() => {})
      : Promise.resolve();

    // 4. Unlock hero videos in parallel (non-blocking background stream)
    if (typeof window.__hvUnlockHeroVideos === 'function') {
      window.__hvUnlockHeroVideos();
    }

    // 5. Reveal only after the first visible page is stable. The cap prevents
    // an unreachable asset from trapping visitors in the intro indefinitely.
    const minDelay = new Promise(resolve => setTimeout(resolve, isMobile ? 850 : 1100));
    const maxTimeout = new Promise(resolve => setTimeout(
      resolve,
      isHomePage ? HOME_MEDIA_TIMEOUT + 250 : (isMobile ? 3200 : 4200)
    ));

    await Promise.race([
      Promise.all([fontTask, homeMediaTask, viewportMediaTask, fluidTask, minDelay]),
      maxTimeout
    ]);

    setProgress(1.0, 0.15);
    await new Promise(resolve => setTimeout(resolve, 150));

    if (!this.isCompleted && !this.isFinishing) {
      this.finishLoading();
    }
  }

  finishLoading() {
    if (this.isCompleted || this.isFinishing) return;
    this.isFinishing = true;

    if (this.tl) { this.tl.kill(); this.tl = null; }

    const isMobile = typeof window !== 'undefined' && (window.innerWidth < 768 || window.matchMedia('(max-width: 768px)').matches);
    const center = this.container.querySelector('#hv-reveal-center');
    const progressWrap = this.container.querySelector('.hv-loader-progress');
    const progress = this.container.querySelector('.hv-loader-progress-fill');

    // Immediately trigger reveal and clear intro-pending class
    this.triggerReveal();

    const finishTl = gsap.timeline({ onComplete: () => this.destroy() });

    if (progress) {
      finishTl.to(progress, {
        scaleX: 1,
        duration: isMobile ? 0.10 : 0.14,
        ease: 'power1.out'
      }, 0);
    }

    if (center) {
      finishTl.to(center, {
        opacity: 0,
        scale: 0.98,
        duration: isMobile ? 0.28 : 0.38,
        ease: 'power2.inOut',
      }, isMobile ? 0.02 : 0.04);
    }

    if (progressWrap) {
      finishTl.to(progressWrap, {
        opacity: 0,
        duration: isMobile ? 0.22 : 0.30,
        ease: 'power2.inOut',
      }, isMobile ? 0.02 : 0.04);
    }

    // Elegant fade out of the entire loading screen backdrop
    finishTl.to(this.container, {
      opacity: 0,
      duration: isMobile ? 0.42 : 0.58,
      ease: 'power2.inOut',
    }, isMobile ? 0.04 : 0.08);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Safety fallback — only used if the animation runtime stalls.
  // There is intentionally no click, keyboard, or touch shortcut for leaving
  // the loading screen.
  // ─────────────────────────────────────────────────────────────────────────
  finishSafely() {
    if (this.isCompleted) return;
    this.isCompleted = true;

    if (this.tl) { this.tl.kill(); this.tl = null; }

    const skipTl = gsap.timeline({ onComplete: () => this.destroy() });

    this.triggerReveal();
    if (this.container) {
      const progress = this.container.querySelector('.hv-loader-progress-fill');
      if (progress) {
        skipTl.to(progress, { scaleX: 1, duration: 0.12, ease: 'power2.out' }, 0);
      }
      skipTl.to(this.container, {
        opacity: 0,
        duration: 0.45,
        ease: 'power2.inOut',
      }, 0);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // TRIGGER REVEAL (once)
  // ─────────────────────────────────────────────────────────────────────────
  triggerReveal() {
    if (this.hasRevealed) return;
    this.hasRevealed = true;
    document.documentElement.classList.remove('intro-pending');
    document.body.classList.remove('intro-active');
    window.dispatchEvent(new CustomEvent('hv:intro-reveal'));
    if (typeof this.onStartReveal === 'function') {
      this.onStartReveal();
    } else if (typeof this.onComplete === 'function') {
      this.onComplete();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DESTROY
  // ─────────────────────────────────────────────────────────────────────────
  destroy() {
    if (this.isDestroyed) return;
    this.isDestroyed = true;
    this.isCompleted = true;

    if (this.tl) { this.tl.kill(); this.tl = null; }
    if (this.safetyTimer) { clearTimeout(this.safetyTimer); this.safetyTimer = null; }

    this.triggerReveal();

    setTimeout(() => {
      if (this.container && this.container.parentNode) {
        this.container.parentNode.removeChild(this.container);
      }
      this.container = null;
      window.__HIGHVERZ_INTRO_ACTIVE__ = false;
      activeIntroInstance = null;
      window.dispatchEvent(new CustomEvent('hv:intro-complete'));
    }, 80);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────────────────────────────────────
  init() {
    this.createDOM();
    document.body.classList.add('intro-active');
    document.documentElement.classList.remove('skip-intro');
    document.documentElement.classList.add('intro-pending');

    const isHomePage = window.location.pathname === '/' || window.location.pathname.endsWith('/index.html');
    this.safetyTimer = setTimeout(() => {
      if (!this.isCompleted) this.finishSafely();
    }, isHomePage ? HOME_MEDIA_TIMEOUT + 2000 : 5000);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        this.animate();
        this.startAssetPreload();
      });
    });
  }
}

// ────────────────────────────────────────────────────────────────────────────
// PUBLIC API
// ────────────────────────────────────────────────────────────────────────────

export function initHighverzIntro(options = {}) {
  if (window.__HIGHVERZ_INTRO_ACTIVE__) {
    if (options.force) {
      if (activeIntroInstance) {
        activeIntroInstance.destroy();
        activeIntroInstance = null;
      }
      window.__HIGHVERZ_INTRO_ACTIVE__ = false;
    } else {
      return;
    }
  }

  const urlParams = new URLSearchParams(window.location.search);
  const isExplicitlyDisabled = urlParams.get('intro') === 'false';
  const isForceIntro = urlParams.get('intro') === 'true'
    || urlParams.get('intro') === 'force'
    || options.force === true;

  if (isExplicitlyDisabled || (window.__HV_SKIP_INTRO__ && !isForceIntro)) {
    const existing = document.getElementById('highverz-intro');
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    document.body.classList.remove('intro-active');
    document.documentElement.classList.remove('intro-pending');
    if (typeof options.onStartReveal === 'function') {
      options.onStartReveal();
    } else if (typeof options.onComplete === 'function') {
      options.onComplete();
    }
    return;
  }

  window.__HIGHVERZ_INTRO_ACTIVE__ = true;
  activeIntroInstance = new HighverzIntro(options);
  activeIntroInstance.init();
}

export function replayHighverzIntro() {
  if (typeof window.prepareHeroInitialState === 'function') {
    window.prepareHeroInitialState();
  }
  document.documentElement.classList.add('intro-pending');
  document.body.classList.add('intro-active');
  initHighverzIntro({
    force: true,
    onStartReveal: () => {
      if (window.lenis) window.lenis.start();
      if (typeof window.initHeroIntro === 'function') {
        window.initHeroIntro(false);
      }
    }
  });
}

if (typeof window !== 'undefined') {
  window.replayHighverzIntro = replayHighverzIntro;
}
