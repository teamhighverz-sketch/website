export function initScatterGrid(container, options = {}) {
  const dotSize = options.dotSize || 3;
  const dotGap = options.dotGap || 2;
  const radius = options.radius || 200;
  const strength = options.strength || 1.5;
  const stiffness = options.stiffness || 0.02;
  const damping = options.damping || 0.88;
  const bleed = options.bleed || 50;
  const base = options.base || [30, 41, 59]; // slate-800
  const accent = options.accent || [0, 229, 255]; // cyan
  const STEPS = 14;

  if (!container) return () => {};

  // Clean up any existing canvas in container
  const oldCanvases = container.querySelectorAll('.footer-scatter-canvas');
  oldCanvases.forEach((c) => c.remove());

  // Make sure container has relative positioning
  if (getComputedStyle(container).position === 'static') {
    container.style.position = 'relative';
  }

  // Enable pointer events on the container so we can track mouse over it
  container.style.pointerEvents = 'auto';

  const canvas = document.createElement('canvas');
  canvas.classList.add('footer-scatter-canvas');
  // It shouldn't block pointer events for the container itself, but we track on window anyway
  canvas.style.pointerEvents = 'none';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};

  function buildRamp(from, to) {
    const ramp = [];
    for (let i = 0; i < STEPS; i++) {
      const t = i / (STEPS - 1);
      const r = Math.round(from[0] + (to[0] - from[0]) * t);
      const g = Math.round(from[1] + (to[1] - from[1]) * t);
      const b = Math.round(from[2] + (to[2] - from[2]) * t);
      ramp.push(`rgb(${r}, ${g}, ${b})`);
    }
    return ramp;
  }

  let ramp = buildRamp(base, accent);
  let dots = [];
  let ripples = [];
  let width = 0;
  let height = 0;
  let renderedDotSize = dotSize;
  let pointerX = -9999;
  let pointerY = -9999;
  let clock = 0;
  let raf = 0;

  let resizeTimer;

  const existingImg = container.querySelector('img');

  function build() {
    const rect = container.getBoundingClientRect();
    let boxW = Math.round(rect.width);

    // If container width is <= 10 (e.g. before mount/layout), try parent footer or clamp
    if (!boxW || boxW <= 10) {
      const parentRect = container.parentElement?.getBoundingClientRect();
      if (parentRect && parentRect.width > 20) {
        boxW = Math.min(650, Math.round(parentRect.width * 0.45));
      } else {
        boxW = Math.min(650, Math.round((window.innerWidth || 1200) * 0.4));
      }
    }
    boxW = Math.max(1, boxW);

    const aspect = (existingImg && existingImg.naturalWidth && existingImg.naturalHeight)
      ? (existingImg.naturalWidth / existingImg.naturalHeight)
      : (2415 / 900);

    let boxH = Math.round(rect.height);
    if (!boxH || boxH <= 10 || boxH < (boxW / aspect) * 0.6) {
      boxH = Math.round(boxW / aspect);
    }
    boxH = Math.max(1, boxH);

    // Keep container height consistent so it never collapses to 0
    container.style.minHeight = boxH + 'px';

    width = boxW + bleed * 2;
    height = boxH + bleed * 2;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    canvas.style.left = -bleed + "px";
    canvas.style.top = -bleed + "px";
    canvas.style.right = "auto";
    canvas.style.bottom = "auto";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const mask = document.createElement("canvas");
    mask.width = width;
    mask.height = height;
    const mctx = mask.getContext("2d", { willReadFrequently: true });
    if (!mctx) return;

    const extractDots = () => {
      try {
        const data = mctx.getImageData(0, 0, width, height).data;

        // Sample the actual logo densely enough to retain the rocket window,
        // fins and flame.
        const minStep = Math.max(1, Math.min(dotSize + dotGap, boxW / 320));
        let step = minStep;

        const countAt = (s) => {
          let n = 0;
          const half = s / 2;
          for (let y = half; y < height; y += s) {
            for (let x = half; x < width; x += s) {
              const px = (Math.round(y) * width + Math.round(x)) * 4;
              if (data[px + 3] > 50) n++; // Alpha threshold
            }
          }
          return n;
        };

        let count = countAt(step);
        let guard = 0;
        while (count > 8000 && guard < 20) {
          step *= 1.15;
          count = countAt(step);
          guard++;
        }

        renderedDotSize = Math.min(dotSize, step * 0.72);
        const nextDots = [];
        const half = step / 2;
        for (let y = half; y < height; y += step) {
          for (let x = half; x < width; x += step) {
            const px = (Math.round(y) * width + Math.round(x)) * 4;
            if (data[px + 3] > 50) {
              nextDots.push({ hx: x, hy: y, x, y, vx: 0, vy: 0 });
            }
          }
        }
        if (nextDots.length > 0) {
          dots = nextDots;
        }
      } catch (err) {
        console.warn('scatterGrid getImageData error, falling back to text mask', err);
      }
    };

    const renderTextFallback = () => {
      mctx.clearRect(0, 0, width, height);
      let text = options.text || "HIGHVERZ";
      let size = boxH * 0.75;
      mctx.font = `900 ${size}px "Inter", sans-serif`;

      const measured = mctx.measureText(text).width;
      if (measured > 0 && measured > boxW * 0.9) {
        size = size * (boxW * 0.9 / measured);
        mctx.font = `900 ${size}px "Inter", sans-serif`;
      }

      mctx.textAlign = "center";
      mctx.textBaseline = "middle";
      mctx.fillStyle = "#000";
      mctx.fillText(text, width / 2, height / 2);
      extractDots();
    };

    if (existingImg && existingImg.complete && existingImg.naturalWidth > 0) {
      let w = boxW;
      let h = w / aspect;
      if (h > boxH) {
        h = boxH;
        w = h * aspect;
      }
      // Center in canvas (which is box + bleed)
      mctx.drawImage(existingImg, bleed + (boxW - w) / 2, bleed + (boxH - h) / 2, w, h);

      extractDots();
      if (dots.length > 0) {
        existingImg.style.opacity = '0';
      } else {
        renderTextFallback();
        if (dots.length > 0) {
          existingImg.style.opacity = '0';
        } else {
          existingImg.style.opacity = '1';
        }
      }
    } else if (existingImg) {
      const onLoad = () => {
        build();
        paint();
      };
      existingImg.addEventListener('load', onLoad, { once: true });
      existingImg.decode?.().then(() => onLoad()).catch(() => {});
      renderTextFallback();
      if (dots.length > 0) {
        existingImg.style.opacity = '0';
      }
    } else {
      renderTextFallback();
    }
  }

  let isAnyMoving = false;

  function simulate() {
    const r2 = radius * radius;
    isAnyMoving = false;

    for (let i = 0; i < dots.length; i++) {
      const d = dots[i];
      const dx = d.x - pointerX;
      const dy = d.y - pointerY;
      const dist2 = dx * dx + dy * dy;

      if (dist2 < r2 && dist2 > 0.5) {
        const dist = Math.sqrt(dist2);
        const f = (1 - dist / radius) * strength;
        d.vx += (dx / dist) * f;
        d.vy += (dy / dist) * f;
      }

      for (let j = 0; j < ripples.length; j++) {
        const rp = ripples[j];
        const rx = d.x - rp.x;
        const ry = d.y - rp.y;
        const rd = Math.sqrt(rx * rx + ry * ry) || 1;
        const band = Math.abs(rd - rp.r);
        if (band < 26) {
          const f = (1 - band / 26) * 2.4;
          d.vx += (rx / rd) * f;
          d.vy += (ry / rd) * f;
        }
      }

      d.vx += (d.hx - d.x) * stiffness;
      d.vy += (d.hy - d.y) * stiffness;
      d.vx *= damping;
      d.vy *= damping;
      d.x += d.vx;
      d.y += d.vy;

      // Snap to rest when displacement and velocity are negligible to eliminate subpixel float jitter
      const distHome2 = (d.x - d.hx) * (d.x - d.hx) + (d.y - d.hy) * (d.y - d.hy);
      const vel2 = d.vx * d.vx + d.vy * d.vy;
      if (distHome2 < 0.05 && vel2 < 0.02) {
        d.x = d.hx;
        d.y = d.hy;
        d.vx = 0;
        d.vy = 0;
      } else {
        isAnyMoving = true;
      }
    }

    for (let j = ripples.length - 1; j >= 0; j--) {
      ripples[j].r += 14;
      if (ripples[j].r > Math.max(width, height) * 1.2) {
        ripples.splice(j, 1);
      } else {
        isAnyMoving = true;
      }
    }
  }

  function paint() {
    ctx.clearRect(0, 0, width, height);
    const pSize = Math.max(1, Math.round(renderedDotSize));
    let lastFill = '';

    for (let i = 0; i < dots.length; i++) {
      const d = dots[i];
      const ox = d.x - d.hx;
      const oy = d.y - d.hy;
      const disp = Math.sqrt(ox * ox + oy * oy);

      // Elevated color only on active disturbance (no continuous sine wave on straight lines)
      let level = disp > 0.5 ? Math.min(1, disp / 22) : 0;

      const idx = Math.min(STEPS - 1, Math.max(0, Math.round(level * (STEPS - 1))));
      const fill = ramp[idx];
      if (fill !== lastFill) {
        ctx.fillStyle = fill;
        lastFill = fill;
      }
      // Integer-aligned drawing coordinates to avoid fractional antialiasing blur/shiver
      const px = Math.round(d.x - pSize / 2);
      const py = Math.round(d.y - pSize / 2);
      ctx.fillRect(px, py, pSize, pSize);
    }
  }

  let last = 0;
  const FIXED = 1 / 60;
  let acc = 0;

  let isIntersecting = false;

  function loop(now) {
    if (!isIntersecting) {
      raf = 0;
      return;
    }
    const dt = last ? Math.min(0.05, (now - last) / 1000) : FIXED;
    last = now;
    clock += dt;
    acc += dt;

    let guard = 0;
    while (acc >= FIXED && guard < 5) {
      simulate();
      acc -= FIXED;
      guard++;
    }

    paint();

    // If completely settled at home and pointer is idle, sleep the RAF loop
    if (!isAnyMoving && pointerX < -500 && ripples.length === 0) {
      raf = 0;
      return;
    }

    raf = requestAnimationFrame(loop);
  }

  build();
  paint();

  const visibilityObserver = 'IntersectionObserver' in window ? new IntersectionObserver(([entry]) => {
    isIntersecting = entry.isIntersecting;
    if (isIntersecting) {
      last = performance.now();
      if (!raf) raf = requestAnimationFrame(loop);
    } else {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    }
  }, { threshold: 0, rootMargin: '300px' }) : null;

  if (visibilityObserver) {
    visibilityObserver.observe(container);
  } else {
    isIntersecting = true;
    raf = requestAnimationFrame(loop);
  }

  const wakeUpIfNeeded = () => {
    if (!isIntersecting) {
      const cRect = canvas.getBoundingClientRect();
      const vh = window.innerHeight || document.documentElement.clientHeight;
      if (cRect.top < vh + 400 && cRect.bottom > -400) {
        isIntersecting = true;
      }
    }
    if (isIntersecting && !raf) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  };

  const handlePointerMove = (e) => {
    wakeUpIfNeeded();
    if (!isIntersecting) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // Nearby CTA/footer text must not push the first letter out of shape.
    // Scatter when pointer is over or near the logo itself.
    if (x >= bleed - 25 && x <= width - bleed + 25 && y >= bleed - 25 && y <= height - bleed + 25) {
      pointerX = x;
      pointerY = y;
      if (!raf) {
        last = performance.now();
        raf = requestAnimationFrame(loop);
      }
    } else {
      pointerX = -9999;
      pointerY = -9999;
    }
  };

  const handlePointerLeave = () => {
    pointerX = -9999;
    pointerY = -9999;
  };

  const handlePointerDown = (e) => {
    wakeUpIfNeeded();
    if (!isIntersecting) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (x < bleed - 25 || y < bleed - 25 || x > width - bleed + 25 || y > height - bleed + 25) return;

    if (ripples.length > 2) ripples.shift();
    ripples.push({ x, y, r: 0 });
    if (!raf) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  };

  // Track on window so overlaying footer content (links, copyright, text) does not block scatter reactivity
  window.addEventListener("pointermove", handlePointerMove, { passive: true });
  window.addEventListener("pointerdown", handlePointerDown, { passive: true });
  window.addEventListener("pointerleave", handlePointerLeave, { passive: true });
  window.addEventListener("scroll", handlePointerLeave, { passive: true });

  const resizeObserver = new ResizeObserver(() => {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => {
      build();
      paint();
    }, 120);
  });
  resizeObserver.observe(container);

  return () => {
    if (raf) cancelAnimationFrame(raf);
    visibilityObserver?.disconnect();
    resizeObserver.disconnect();
    window.removeEventListener("pointermove", handlePointerMove);
    window.removeEventListener("pointerdown", handlePointerDown);
    window.removeEventListener("pointerleave", handlePointerLeave);
    window.removeEventListener("scroll", handlePointerLeave);
    if (canvas && canvas.parentNode) {
      canvas.parentNode.removeChild(canvas);
    }
    if (existingImg) {
      existingImg.style.opacity = '';
    }
  };
}
