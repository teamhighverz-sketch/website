/**
 * HIGHVERZ — HERO ROTATING KEYWORD ROLLER
 * Silky-smooth vertical slot-roll matching .btn-label (inline-grid + overflow:hidden)
 * Cycles through: Reach → Boost → Trend → Clicks → Reach
 */

import gsap from 'gsap';

function updateUnderlineWidth(container, item) {
  if (!container || !item) return;
  const range = document.createRange();
  range.selectNodeContents(item);
  const width = range.getBoundingClientRect().width;
  if (width > 0) {
    container.style.setProperty('--hero-word-underline-width', `${width}px`);
  }
}

export class HeroWordRoller {
  constructor(options = {}) {
    this.container = document.getElementById('hero-word-roller');
    this.words = ['Reach', 'Boost', 'Trend', 'Clicks'];
    this.currentIndex = 0;
    this.interval = options.interval || 1400; // ms to pause on each word (accelerated cadence)
    this.duration = options.duration || 0.52; // flip animation duration in seconds
    this.timer = null;
    this.isAnimating = false;
    this.isPaused = false;
    this.items = [];
    this.handleMouseEnter = this.handleMouseEnter.bind(this);
    this.handleMouseLeave = this.handleMouseLeave.bind(this);
    this.handleVisibilityChange = this.handleVisibilityChange.bind(this);
    this.handleResize = () => updateUnderlineWidth(this.container, this.items[this.currentIndex]);
  }

  init() {
    if (!this.container) return;
    this.setupDOM();
    this.bindEvents();
    this.startCycle();
  }

  setupDOM() {
    this.items = Array.from(this.container.querySelectorAll('.roller-item'));
    if (!this.items.length) return;

    // Reset items to clean initial state for 3D Slot
    gsap.set(this.container, { perspective: 800, transformStyle: 'preserve-3d' });

    this.items.forEach((item, index) => {
      if (index === 0) {
        item.classList.add('is-active');
        item.classList.remove('is-animating');
        gsap.set(item, { yPercent: 0, rotateX: 0, opacity: 1, visibility: 'visible', clearProps: 'filter', transformOrigin: '50% 50% -0.5em' });
      } else {
        item.classList.remove('is-active', 'is-animating');
        gsap.set(item, { rotateX: -90, opacity: 0, filter: 'none', visibility: 'hidden', transformOrigin: '50% 50% -0.5em' });
      }
    });

    this.currentIndex = 0;
    updateUnderlineWidth(this.container, this.items[0]);
  }

  startCycle() {
    this.clearTimer();
    this.timer = setTimeout(() => {
      this.next();
    }, this.interval);
  }

  next() {
    if (this.isAnimating || this.isPaused || !this.items.length) return;
    const isReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nextIndex = (this.currentIndex + 1) % this.items.length;

    if (isReduced) {
      this.transitionReduced(this.currentIndex, nextIndex);
    } else {
      this.transition(this.currentIndex, nextIndex);
    }
  }

  transition(fromIndex, toIndex) {
    this.isAnimating = true;
    const currentItem = this.items[fromIndex];
    const nextItem = this.items[toIndex];
    if (!currentItem || !nextItem) {
      this.isAnimating = false;
      return;
    }

    // Mark elements as actively animating so CSS permits their visibility during blend
    currentItem.classList.add('is-animating');
    nextItem.classList.add('is-animating');

    // Prepare the next word to be rotated back on the 3D cylinder
    gsap.set(nextItem, {
      yPercent: 0,
      rotateX: -90,
      transformOrigin: '50% 50% -0.5em',
      transformPerspective: 800,
      opacity: 0,
      filter: 'none',
      visibility: 'visible'
    });

    // Ensure current item has correct origin
    gsap.set(currentItem, {
      transformOrigin: '50% 50% -0.5em',
      transformPerspective: 800
    });

    const tl = gsap.timeline({
      onComplete: () => {
        // Reset currentItem cleanly for next cycle
        gsap.set(currentItem, {
          rotateX: 0,
          opacity: 0,
          filter: 'none',
          visibility: 'hidden'
        });
        currentItem.classList.remove('is-active', 'is-animating');
        nextItem.classList.remove('is-animating');
        nextItem.classList.add('is-active');

        // Keep the settled word pinned to the baseline
        gsap.set(nextItem, {
          rotateX: 0,
          opacity: 1,
          filter: 'none',
          clearProps: 'filter'
        });

        this.currentIndex = toIndex;
        updateUnderlineWidth(this.container, nextItem);
        this.isAnimating = false;
        if (!this.isPaused) {
          this.startCycle();
        }
      }
    });

    // The current word rotates up and fades out (into the cylinder)
    tl.to(currentItem, {
      rotateX: 90,
      opacity: 0,
      duration: this.duration,
      ease: 'power3.inOut'
    }, 0);

    // The next word elegantly rotates down into view
    tl.to(nextItem, {
      rotateX: 0,
      opacity: 1,
      duration: this.duration,
      ease: 'power3.inOut'
    }, 0);
  }

  transitionReduced(fromIndex, toIndex) {
    this.isAnimating = true;
    const currentItem = this.items[fromIndex];
    const nextItem = this.items[toIndex];

    currentItem.classList.remove('is-active', 'is-animating');
    gsap.set(currentItem, { rotateX: 90, opacity: 0, filter: 'none', visibility: 'hidden' });

    nextItem.classList.remove('is-animating');
    nextItem.classList.add('is-active');
    gsap.set(nextItem, { rotateX: 0, opacity: 1, filter: 'none', visibility: 'visible', clearProps: 'filter' });

    this.currentIndex = toIndex;
    updateUnderlineWidth(this.container, nextItem);
    this.isAnimating = false;
    this.startCycle();
  }

  handleMouseEnter() {
    this.isPaused = true;
    this.clearTimer();
  }

  handleMouseLeave() {
    this.isPaused = false;
    this.startCycle();
  }

  handleVisibilityChange() {
    if (document.hidden) {
      this.isPaused = true;
      this.clearTimer();
    } else {
      this.isPaused = false;
      this.startCycle();
    }
  }

  bindEvents() {
    if (this.container) {
      this.container.addEventListener('mouseenter', this.handleMouseEnter);
      this.container.addEventListener('mouseleave', this.handleMouseLeave);
    }
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    window.addEventListener('resize', this.handleResize, { passive: true });
  }

  clearTimer() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
  }

  destroy() {
    this.clearTimer();
    if (this.container) {
      this.container.removeEventListener('mouseenter', this.handleMouseEnter);
      this.container.removeEventListener('mouseleave', this.handleMouseLeave);
    }
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    window.removeEventListener('resize', this.handleResize);
  }
}

let activeRollerInstance = null;

export function prepareHeroWordRoller() {
  const el = document.getElementById('hero-word-roller');
  if (!el) return;
  const items = Array.from(el.querySelectorAll('.roller-item'));
  gsap.set(el, { perspective: 800, transformStyle: 'preserve-3d' });
  items.forEach((item, index) => {
    if (index === 0) {
      item.classList.add('is-active');
      item.classList.remove('is-animating');
      gsap.set(item, { yPercent: 0, rotateX: 0, opacity: 1, filter: 'none', visibility: 'visible', clearProps: 'filter', transformOrigin: '50% 50% -0.5em' });
    } else {
      item.classList.remove('is-active', 'is-animating');
      gsap.set(item, { rotateX: -90, opacity: 0, filter: 'none', visibility: 'hidden', transformOrigin: '50% 50% -0.5em' });
    }
  });
  updateUnderlineWidth(el, items[0]);
}

export function initHeroWordRoller() {
  if (activeRollerInstance) {
    activeRollerInstance.destroy();
    activeRollerInstance = null;
  }
  const el = document.getElementById('hero-word-roller');
  if (!el) return null;
  activeRollerInstance = new HeroWordRoller();
  activeRollerInstance.init();
  return activeRollerInstance;
}
