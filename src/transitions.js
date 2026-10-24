/**
 * HIGHVERZ — Page Transition Engine
 * Recreates the Framer diagonal wipe transition from the reference recording.
 *
 * SPECIFICATION:
 * - Angle: 315° (135° in CSS linear-gradient coordinates, top-left to bottom-right)
 * - Feather / Softness Width: 30%
 * - Duration: 0.8s
 * - Easing: cubic-bezier(0.27, 0, 0.51, 1)
 *
 * Internal HTML routes use the same fade transition, including Home.
 */

import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

/**
 * Checks if a given path or URL represents the Home route.
 */
export function isHomeRoute(pathOrUrl) {
  if (!pathOrUrl) return false;
  try {
    const url = typeof pathOrUrl === 'string'
      ? new URL(pathOrUrl, window.location.origin)
      : pathOrUrl;
    const p = url.pathname.replace(/\/+$/, '') || '/';
    return p === '/' || p === '/index.html';
  } catch (e) {
    return false;
  }
}

/**
 * Validates whether transition animation should run between two routes.
 */
export function canTransition(currentPath, targetUrl) {
  // Exclude external origins
  if (targetUrl.origin !== window.location.origin) {
    return false;
  }
  // Exclude downloads and static non-html assets
  if (/\.(png|jpg|jpeg|gif|svg|webp|mp4|mov|webm|pdf|xlsx|zip|json|xml|txt)$/i.test(targetUrl.pathname)) {
    return false;
  }
  // Exclude same page anchor navigation
  if (targetUrl.pathname === window.location.pathname) {
    return false;
  }
  return true;
}

const htmlCache = new Map();

// Keep the Why Us hero copy canonical during HTML handoffs. A prefetched
// document can outlive a content edit, and overlapping outgoing/incoming DOM
// should never leave two subtitle variants visible during a transition.
const WHY_US_SUBTITLE = 'See how Highverz Creative Agency compares to traditional agencies and freelancers.';

function normalizeWhyUsSubtitle(root) {
  if (!root) return;
  const subtitles = Array.from(root.querySelectorAll('.why-hero-subtitle'));
  subtitles.forEach((subtitle, index) => {
    if (index === 0) {
      subtitle.textContent = WHY_US_SUBTITLE;
    } else {
      subtitle.remove();
    }
  });
}

// Start only the incoming hero counters underneath the route fade. The rest
// of the hero remains static so the page reveal and number animation stay in
// sync without introducing a second entrance sequence.
function startIncomingMetricCounters(content) {
  // The home-page counter is below the hero and is not re-initialized by the
  // dedicated-page dispatcher during an internal route swap. Hydrate it with
  // its stable value immediately so returning home can never expose the
  // source placeholder (0+) during the blur handoff.
  const incomingHomeStats = content.querySelector('#stats-counter');
  if (incomingHomeStats) {
    incomingHomeStats.textContent = '4,500,000,000+';
    incomingHomeStats.dataset.transitionHydrated = 'true';

    // The home initializer owns its ScrollTriggers after promotion. Keeping
    // this value final during the handoff avoids a competing trigger resetting
    // it back to 0 after the old page's triggers are destroyed.
  }

  const incomingCreators = content.querySelector('.section-creators');
  if (incomingCreators) {
    incomingCreators.dataset.transitionHydrated = 'true';
    incomingCreators.querySelectorAll('.stat-number').forEach((el) => {
      const target = parseInt(el.dataset.count || '', 10);
      el.textContent = Number.isNaN(target) ? '0' : target.toLocaleString('en-US');
    });
    incomingCreators.querySelectorAll('.stat-dyn-num').forEach((el) => {
      const target = parseInt(el.dataset.count || '', 10);
      el.textContent = Number.isNaN(target) ? '0' : String(target);
    });
  }

  const workHero = content.querySelector('.work-hero-section');
  if (workHero) {
    workHero.dataset.transitionMetricsStarted = 'true';
    const items = [];
    workHero.querySelectorAll('.work-metric-val').forEach((el) => {
      const target = parseFloat(el.getAttribute('data-metric-target'));
      if (Number.isNaN(target)) return;
      const prefix = el.getAttribute('data-metric-prefix') || '';
      const suffix = el.getAttribute('data-metric-suffix') || '';
      const isFloat = target % 1 !== 0;
      const value = { current: 0 };
      el.textContent = `${prefix}${isFloat ? '0.0' : '0'}${suffix}`;
      items.push({ el, target, prefix, suffix, isFloat, value });
    });
    const timeline = gsap.timeline({ defaults: { duration: 1.6, ease: 'power2.out' } });
    items.forEach((item) => {
      timeline.to(item.value, {
        current: item.target,
        onUpdate: () => {
          const display = item.isFloat ? item.value.current.toFixed(1) : Math.round(item.value.current);
          item.el.textContent = `${item.prefix}${display}${item.suffix}`;
        },
        onComplete: () => {
          const display = item.isFloat ? item.target.toFixed(1) : item.target;
          item.el.textContent = `${item.prefix}${display}${item.suffix}`;
        },
      }, 0);
    });
  }

  const teamHero = content.querySelector('.team-hero-section');
  if (teamHero) {
    teamHero.dataset.transitionMetricsStarted = 'true';
    const timeline = gsap.timeline({ defaults: { duration: 2, ease: 'power2.out' } });
    teamHero.querySelectorAll('.team-metric-val').forEach((el) => {
      const format = el.getAttribute('data-metric-format');
      const value = { current: format === 'top' ? 15 : 0 };
      let target;
      let render;
      if (format === 'billion') {
        target = 4.5; el.textContent = '0.0B+';
        render = () => { el.textContent = `${value.current.toFixed(1)}B+`; };
      } else if (format === 'days') {
        target = 60; el.textContent = '0 Days';
        render = () => { el.textContent = `${Math.round(value.current)} Days`; };
      } else if (format === 'reach') {
        el.textContent = 'Global Reach';
        return;
      } else if (format === 'percent') {
        target = 99.4; el.textContent = '0.0%';
        render = () => { el.textContent = `${value.current.toFixed(1)}%`; };
      } else if (format === 'distribution') {
        el.textContent = '24/7';
        return;
      } else if (format === 'top') {
        target = 1; el.textContent = 'Top 15%';
        render = () => { el.textContent = `Top ${Math.round(value.current)}%`; };
      } else {
        return;
      }
      timeline.to(value, { current: target, onUpdate: render, onComplete: render }, 0);
    });
  }
}

/**
 * Prefetches target HTML for instantaneous transition response
 */
export async function prefetchPage(urlStr) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 8000);
  try {
    const normUrl = urlStr.split('#')[0];
    if (htmlCache.has(normUrl)) return htmlCache.get(normUrl);
    const res = await fetch(normUrl, { signal: controller.signal });
    if (!res.ok) return null;
    const text = await res.text();
    htmlCache.set(normUrl, text);
    return text;
  } catch (e) {
    return null;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

let isTransitioning = false;

/**
 * Core Page Transition Choreographer
 */
export async function navigateWithTransition(targetHref, isPopState = false) {
  if (isTransitioning) return;

  const currentPath = window.location.pathname;
  let targetUrl;
  try {
    targetUrl = new URL(targetHref, window.location.origin);
  } catch (e) {
    window.location.href = targetHref;
    return;
  }

  // Double-check route eligibility before taking over browser navigation.
  if (!canTransition(currentPath, targetUrl)) {
    if (!isPopState) {
      window.location.href = targetHref;
    } else {
      window.location.reload();
    }
    return;
  }

  isTransitioning = true;
  // A theme toggle can leave its optical veil alive for a few hundred
  // milliseconds. Navigation owns the next visual handoff, so remove that
  // stale veil instead of letting its colour continue settling over the page.
  document.documentElement.classList.remove('theme-switching', 'theme-target-light', 'theme-target-dark');
  // A failed page initializer must never leave navigation permanently locked.
  // The normal handoff completes in under a second; this is only a last-resort
  // native navigation fallback for a stalled fetch, animation, or initializer.
  let transitionSafetyTimer = window.setTimeout(() => {
    if (!isTransitioning) return;
    console.warn('Page transition timed out; falling back to native navigation.');
    isTransitioning = false;
    window.location.href = targetHref;
  }, 2600);

  try {
    // 1. Retrieve target document HTML (from memory cache or network)
    let htmlText = htmlCache.get(targetUrl.href.split('#')[0]);
    if (!htmlText) {
      htmlText = await prefetchPage(targetUrl.href);
    }
    if (!htmlText) {
      // Fallback to native navigation if fetch fails
      window.location.href = targetHref;
      isTransitioning = false;
      return;
    }

    const parser = new DOMParser();
    const newDoc = parser.parseFromString(htmlText, 'text/html');

    // Normalize cached Why Us markup before it enters the transition shell.
    normalizeWhyUsSubtitle(newDoc);

    // Find main content container (#page-content or fallback)
    const currentContent = document.getElementById('page-content') || document.querySelector('main.page-content');
    const incomingContent = newDoc.getElementById('page-content') || newDoc.querySelector('main.page-content');

    if (!currentContent || !incomingContent) {
      window.location.href = targetHref;
      isTransitioning = false;
      return;
    }

    const targetTitle = newDoc.title;
    const targetBodyClass = newDoc.body.className;

    // 2. Update Browser History & Document Title
    if (!isPopState) {
      window.history.pushState({ path: targetHref }, '', targetHref);
    }
    window.__hvSetSpeedInsightsRoute?.(targetUrl.pathname);
    if (targetTitle) {
      document.title = targetTitle;
    }

    // 3. Update Navbar active states and slide indicator immediately
    if (window.__hvUpdateNavbar) {
      window.__hvUpdateNavbar(window.location.pathname);
    }

    // Close mobile menu if active
    document.body.classList.remove('mobile-menu-active');
    if (window.__hvCloseMobileMenu) {
      window.__hvCloseMobileMenu();
    } else {
      const mobileToggle = document.getElementById('mobile-toggle');
      if (mobileToggle) mobileToggle.classList.remove('is-active');
      const mobileOverlay = document.getElementById('mobile-nav-overlay');
      if (mobileOverlay) {
        mobileOverlay.classList.remove('is-open');
        mobileOverlay.setAttribute('aria-hidden', 'true');
        mobileOverlay.setAttribute('inert', '');
        mobileOverlay.inert = true;
        mobileOverlay.style.pointerEvents = 'none';
        mobileOverlay.style.visibility = 'hidden';
        mobileOverlay.style.opacity = '0';
      }
    }

    // Keep cursor active and clear any stuck click/magnetic states
    if (window.__hvEnsureCursorActive) {
      window.__hvEnsureCursorActive();
    }

    // 4. Freeze Lenis scrolling during transition to prevent scroll/layout thrashing
    if (window.lenis) {
      window.lenis.stop();
    }

    // 5. Freeze current content in visual viewport (preserves exact visual frame without bottom cut-off)
    const currentScrollY = window.scrollY || window.pageYOffset || 0;
    currentContent.classList.add('page-outgoing-frozen');
    currentContent.style.top = `-${currentScrollY}px`;

    // Immediately reset document scroll while outgoing content is pinned at -scrollY
    // This completely eliminates scroll-jump and bottom/top layout gaps when swapping pages
    window.scrollTo(0, 0);
    if (window.lenis) {
      window.lenis.scrollTo(0, { immediate: true });
    }

    // 6. Mount incoming content inside an isolated 100vw x 100vh viewport shell
    const shell = document.createElement('div');
    shell.className = 'page-transition-shell';
    shell.id = 'page-transition-shell';

    document.documentElement.classList.add('page-transitioned');

    // Pre-activate incoming hero elements so the wipe immediately reveals the live content
    // This eliminates any blank delay during the wipe and prevents delayed secondary entrance animations
    const heroSelectors = [
      '.campaign-hero-tag',
      '.campaign-hero-headline',
      '.campaign-hero-sub',
      '.campaign-hero-pillars',
      '.campaign-search-section',
      '.campaign-featured-label',
      '.work-hero-container',
      '.team-hero-container',
      '.why-hero-container',
      '.case-hero-container'
    ].join(',');
    incomingContent.querySelectorAll(heroSelectors).forEach((el) => {
      el.style.opacity = '1';
      el.style.transform = 'none';
      el.style.animation = 'none';
    });
    const incCampaignHero = incomingContent.querySelector('.campaign-hero');
    if (incCampaignHero) {
      incCampaignHero.dataset.heroAnimated = 'true';
    }

    // Pre-split words on incoming hero headings before mounting to prevent layout shifting or clipping artifacts
    incomingContent.querySelectorAll('.work-hero-title, .campaign-hero-headline, .why-hero-title, .team-hero-title, .case-hero-title').forEach((heading) => {
      window.splitAdscaleWords?.(heading);
    });

    // Pre-set metric counters in incoming content to 0 so they never flash target values before animating
    incomingContent.querySelectorAll('.work-metric-val').forEach((el) => {
      const target = parseFloat(el.getAttribute('data-metric-target'));
      const prefix = el.getAttribute('data-metric-prefix') || '';
      const suffix = el.getAttribute('data-metric-suffix') || '';
      if (!isNaN(target)) {
        const isFloat = target % 1 !== 0;
        el.textContent = `${prefix}${isFloat ? (0).toFixed(1) : 0}${suffix}`;
      }
    });
    incomingContent.querySelectorAll('.team-metric-val').forEach((el) => {
      const format = el.getAttribute('data-metric-format');
      if (format === 'billion') el.textContent = '0.0B+';
      else if (format === 'days') el.textContent = '0 Days';
      else if (format === 'reach') el.textContent = 'Global Reach';
      else if (format === 'percent') el.textContent = '0.0%';
      else if (format === 'distribution') el.textContent = '24/7';
    });

    incomingContent.style.position = 'relative';
    incomingContent.style.width = '100%';
    incomingContent.style.minHeight = '100vh';
    incomingContent.style.pointerEvents = 'none';
    shell.appendChild(incomingContent);

    // Hold the current page background underneath both fades. This prevents
    // the body/ambient layer from flashing through while content crossfades.
    const backdrop = document.createElement('div');
    backdrop.className = 'page-transition-backdrop';
    backdrop.id = 'page-transition-backdrop';
    backdrop.style.backgroundColor = getComputedStyle(document.body).backgroundColor || '#050809';

    // Keep the old glow node for compatibility with the existing transition
    // shell, while the route handoff itself uses a clean synchronized fade.
    const glow = document.createElement('div');
    glow.className = 'page-transition-glow';
    glow.id = 'page-transition-glow';

    document.body.appendChild(backdrop);
    document.body.appendChild(shell);
    document.body.appendChild(glow);
    // Lock the space occupied by the native scrollbar before hiding overflow.
    // Without this, centered sections briefly gain the scrollbar width and
    // appear to jump right, then left, during the route handoff.
    const transitionScrollbarWidth = Math.max(
      0,
      window.innerWidth - document.documentElement.clientWidth
    );
    document.body.style.setProperty(
      '--transition-scrollbar-width',
      `${transitionScrollbarWidth}px`
    );
    document.body.classList.add('page-is-transitioning');

    // Stop observers, RAF loops, media, and counter tweens bound to the old
    // page before removing it. ScrollTrigger alone cannot clean those up.
    if (window.__hvDisposePageRuntime) {
      window.__hvDisposePageRuntime();
    }

    // Move the incoming page's choreography into the transition window. Old
    // triggers are removed first so only the incoming document is animated.
    ScrollTrigger.getAll().forEach((t) => t.kill());
    startIncomingMetricCounters(incomingContent);
    const navbar = document.getElementById('navbar');
    if (navbar) navbar.classList.add('page-nav-outgoing');

    // Lightweight, high-performance blur transition (60fps optimized, clearProps on finish)
    gsap.set(currentContent, {
      opacity: 1,
      y: 0,
      scale: 1,
      filter: 'blur(0px)',
      willChange: 'opacity, transform, filter',
    });
    // Do not crossfade two different page subtitles over one another. The
    // outgoing hero copy is intentionally removed before the blur handoff so
    // the incoming sentence never appears duplicated or reflows mid-transition.
    currentContent.querySelectorAll(
      '#hero-desc, .work-hero-desc, .campaign-hero-sub, .team-hero-desc, ' +
      '.why-hero-subtitle, .case-hero-desc'
    ).forEach((copy) => {
      copy.style.opacity = '0';
    });
    if (navbar) {
      gsap.set(navbar, {
        opacity: 1,
        y: 0,
        scale: 1,
        filter: 'blur(0px)',
        transformOrigin: '50% 50%',
        willChange: 'opacity, transform, filter',
      });
    }
    gsap.set(shell, {
      opacity: 0,
      y: 10,
      scale: 0.995,
      filter: 'blur(40px)',
      willChange: 'opacity, transform, filter',
    });
    gsap.set(glow, { opacity: 0 });

    // Start the incoming page choreography at the beginning of the handoff.
    // Previously this ran only after the blur completed, which made the hero
    // appear first and then animate a moment later.
    let incomingScriptsStarted = false;
    const startIncomingScripts = () => {
      if (incomingScriptsStarted) return;
      incomingScriptsStarted = true;
      // Fast route clicks can leave the browser/Lenis scroll state one frame
      // behind the new shell. Reset every scroll owner before measuring the
      // incoming hero so Home never opens halfway down the page.
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
      window.lenis?.scrollTo(0, { immediate: true });
      currentContent.remove();
      // Install the incoming route's CSS context before dispatching scripts or
      // measuring its layout. Outgoing body classes used to select the wrong
      // initializer (e.g. Team on Home), leaving reels stacked and grids empty.
      const wasCursorActive = document.body.classList.contains('cursor-active');
      document.body.className = targetBodyClass;
      document.body.classList.add('page-is-transitioning');
      if (wasCursorActive) document.body.classList.add('cursor-active');
      try {
        window.__hvInitPageScripts?.(targetUrl.pathname, true);
      } catch (err) {
        console.error('Incoming page initialization failed:', err);
      }
    };

    // 7. Execute the synchronized blur handoff. Text choreography runs under
    // the incoming blur, so it sharpens directly with the page reveal.
    const transitionTimeline = gsap.timeline({
      defaults: { overwrite: 'auto' },
      onStart: startIncomingScripts,
      onComplete: () => {
        // Clean up glow & backdrop elements
        glow.remove();
        backdrop.remove();

        // Remove old frozen content from DOM
        currentContent.remove();

        // Promote incoming content into normal document flow
        incomingContent.removeAttribute('style');
        shell.insertAdjacentElement('beforebegin', incomingContent);
        shell.remove();
        if (navbar) {
          gsap.set(navbar, { clearProps: 'all' });
        }

        // Route classes were installed before initialization; preserve any
        // runtime flags added by the incoming page's components.
        document.body.classList.remove('page-is-transitioning');
        document.body.style.removeProperty('--transition-scrollbar-width');
        if (navbar) navbar.classList.remove('page-nav-outgoing');
        if (window.innerWidth > 900) {
          document.body.classList.add('cursor-active');
        }
        if (window.__hvEnsureCursorActive) {
          window.__hvEnsureCursorActive();
        }

        // Reset scroll position to top
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
        if (window.lenis) {
          window.lenis.scrollTo(0, { immediate: true });
          window.lenis.start();
          window.lenis.resize();
        }

      // Initialize page scripts in next animation frame once DOM is rendered
      requestAnimationFrame(() => {
          try {
            if (!incomingScriptsStarted) {
              startIncomingScripts();
            }

            window.__hvResetNavbar?.(window.location.pathname);

            // Repeated frame passes ensure the carousel never gets stuck on 1 reel
            let passes = 0;
            const refreshPass = () => {
              try {
                window.__hvHeroReelRefresh?.();
                window.__hvInitFooterScatterGrid?.();
                window.__hvUpdateCapsuleSwitchers?.();
                passes++;
                if (passes < 4) {
                  requestAnimationFrame(refreshPass);
                } else {
                  if (window.ScrollTrigger) {
                    ScrollTrigger.refresh();
                  }
                  isTransitioning = false;
                  window.clearTimeout(transitionSafetyTimer);
                }
              } catch (err) {
                console.error('Page runtime refresh failed:', err);
                isTransitioning = false;
                window.clearTimeout(transitionSafetyTimer);
              }
            };
            requestAnimationFrame(refreshPass);
          } catch (err) {
            console.error('Incoming page initialization failed:', err);
            isTransitioning = false;
            window.clearTimeout(transitionSafetyTimer);
          }
        });
      }
    })
      .to(currentContent, {
        opacity: 0,
        filter: 'blur(24px)',
        y: -10,
        scale: 0.99,
        duration: 0.34,
        ease: 'power2.inOut',
      }, 0)
      .to(shell, {
        opacity: 1,
        filter: 'blur(0px)',
        y: 0,
        scale: 1,
        duration: 0.56,
        ease: 'power3.out',
        clearProps: 'filter,willChange',
      }, 0.08);

    if (navbar) {
      transitionTimeline.to(navbar, {
        opacity: 0,
        y: 0,
        scale: 1,
        filter: 'blur(24px)',
        duration: 0.34,
        ease: 'power2.inOut',
      }, 0);
      transitionTimeline.fromTo(navbar,
        { opacity: 0, y: 0, scale: 1, filter: 'blur(40px)' },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          filter: 'blur(0px)',
          duration: 0.34,
          ease: 'power2.out',
          clearProps: 'all',
        },
        0.12
      );
    }

  } catch (err) {
    console.error('Page transition encountered an error:', err);
    window.clearTimeout(transitionSafetyTimer);
    window.location.href = targetHref;
    isTransitioning = false;
  }
}

/**
 * Initializes global click and popstate listeners
 */
export function initPageTransitions() {
  // Pre-cache all dedicated non-Home pages in memory so transition starts in 0ms without waiting for fetch
  const targetRoutes = ['/index.html', '/work.html', '/campaigns.html', '/team.html', '/why-us.html'];
  setTimeout(() => {
    targetRoutes.forEach(r => {
      if (r !== window.location.pathname) {
        prefetchPage(r);
      }
    });
  }, 250);

  // Intercept click on links
  document.addEventListener('click', (e) => {
    // Ignore right click, middle click, modifier keys (open in new tab)
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) {
      return;
    }

    const link = e.target.closest('a');
    if (!link) return;

    // Check if link specifies target="_blank"
    if (link.target && link.target !== '_self') return;

    // Check if link has download or data-no-transition
    if (link.hasAttribute('download') || link.dataset.noTransition === 'true') return;

    const href = link.getAttribute('href');
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) {
      return;
    }

    let url;
    try {
      url = new URL(href, window.location.href);
    } catch (err) {
      return;
    }

    // If destination is same page with hash (anchor scroll), let normal/Lenis anchor scrolling work
    if (url.pathname === window.location.pathname) {
      if (!url.hash) {
        // Clicking same page link without hash: scroll smoothly to top
        e.preventDefault();
        if (window.lenis) {
          window.lenis.scrollTo(0);
        } else {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }
      return;
    }

    // If navigating to Home from any subpage, flag it in sessionStorage to skip intro screen
    if (isHomeRoute(url) && !isHomeRoute(window.location.pathname)) {
      try {
        sessionStorage.setItem('hv_from_subpage', 'true');
      } catch (_) {}
    }

    // Check if this navigation is between non-Home pages
    if (canTransition(window.location.pathname, url)) {
      e.preventDefault();
      navigateWithTransition(url.href, false);
    }
  });

  // Track subpage exit
  window.addEventListener('beforeunload', () => {
    if (!isHomeRoute(window.location.pathname)) {
      try {
        sessionStorage.setItem('hv_from_subpage', 'true');
      } catch (_) {}
    }
  });

  // Prefetch on hover
  document.addEventListener('mouseover', (e) => {
    const link = e.target.closest('a');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href) return;
    try {
      const url = new URL(href, window.location.href);
      if (canTransition(window.location.pathname, url)) {
        prefetchPage(url.href);
      }
    } catch (err) {}
  }, { passive: true });

  // Handle browser back and forward
  window.addEventListener('popstate', () => {
    const currentPath = window.location.pathname;
    if (isHomeRoute(currentPath)) {
      // Navigating back/forward to Home: reload natively
      window.location.reload();
      return;
    }
    navigateWithTransition(window.location.href, true);
  });
}
