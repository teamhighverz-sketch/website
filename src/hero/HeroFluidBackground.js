import * as THREE from 'three';

let activeFluidBackground = null;

const vertexShader = `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const fragmentShader = `
  precision highp float;

  varying vec2 vUv;
  uniform float uTime;
  uniform vec2 uPointer;
  uniform float uTheme;
  uniform vec2 uResolution;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
  }

  float fbm(vec2 p) {
    float value = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 3; i++) {
      value += amplitude * noise(p);
      p = p * 2.03 + vec2(9.2, 3.7);
      amplitude *= 0.5;
    }
    return value;
  }

  void main() {
    vec2 uv = vUv;
    float aspect = uResolution.x / max(uResolution.y, 1.0);
    // Slow, continuous advection gives the masses a calm liquid flow.
    float t = uTime * 0.22;

    // The pointer creates a soft local displacement while the time-based
    // drift remains the primary source of motion.
    vec2 pointer = (uPointer - 0.5) * vec2(aspect, 1.0);
    vec2 pointerDelta = ((uv - 0.5) * vec2(aspect, 1.0)) - pointer;
    // Keep the response broad enough to feel connected to the pointer,
    // rather than like a tiny spotlight.
    float pointerField = exp(-5.8 * dot(pointerDelta, pointerDelta));

    // Two slow domain-warp passes create broad liquid formations rather than
    // ribbons, clouds, or a tiled gradient.
    vec2 drift = vec2(
      t * 0.48 + sin(t * 0.42) * 0.42,
      -t * 0.31 + cos(t * 0.31) * 0.34
    );

    // On portrait mobile screens, adapt coordinate scaling and mass positions so the liquid pools
    // are centered directly behind the headline and carousel, blooming across the viewport.
    vec2 p;
    if (aspect < 1.0) {
      p = (uv - vec2(0.5, 0.65)) * vec2(0.85, 1.15);
    } else {
      p = (uv - 0.5) * vec2(aspect, 1.0);
    }

    vec2 warp = vec2(
      fbm(p * 1.25 + drift + vec2(3.1, 8.2)),
      fbm(p * 1.25 - drift + vec2(8.7, 1.9))
    ) - 0.5;
    // The cursor bends and lightly swirls the liquid while the time-based
    // drift remains continuous when the pointer is still.
    vec2 pointerTangent = vec2(-pointerDelta.y, pointerDelta.x);
    vec2 pointerDisplacement =
      (-pointerDelta * 0.56 + pointerTangent * 0.22) * pointerField;
    vec2 liquidPoint = p + warp * 1.8 + pointerDisplacement;
    float largeField = fbm(liquidPoint * 1.18 + drift * 0.55);
    float foldedField = fbm(liquidPoint * 2.15 - drift * 0.75 + warp * 0.8);
    float flowingField = fbm(
      (liquidPoint + vec2(sin(t * 0.27) * 0.34, cos(t * 0.36) * 0.28)) * 0.9
      + drift * 0.48
    );
    // A low-frequency field lets the liquid slowly spread into new areas
    // instead of remaining locked to two fixed masses.
    float ambientFlow = fbm(p * 0.72 + drift * 0.24 + vec2(2.8, 6.1));
    // A second broad mass keeps the composition alive on the right side too.
    // In portrait mobile, position it centered below the hero headline.
    vec2 rightPoint = aspect < 1.0
      ? (p - vec2(0.15, -0.15) + warp * 0.75)
      : (p - vec2(0.92, -0.06) + warp * 0.9);
    float rightMass = fbm(rightPoint * 1.12 - drift * 0.42 + vec2(5.4, 1.7));
    float density = max(
      largeField * 0.52 + foldedField * 0.18 + flowingField * 0.18 + ambientFlow * 0.14,
      rightMass * 0.75
    );

    // Broad negative-space pockets keep black dominant while the threshold
    // edges stretch, merge, and separate like a slow liquid surface.
    float pocketNoise = fbm(liquidPoint * 0.82 - drift * 0.45 + vec2(4.0, 2.0));
    float pocket = smoothstep(0.35, 0.65, pocketNoise);
    float liquid = smoothstep(0.34, 0.62, density) * (0.58 + pocket * 0.42);
    float rim = smoothstep(0.36, 0.50, density) * (1.0 - smoothstep(0.58, 0.74, density));
    float innerFold = smoothstep(0.52, 0.72, foldedField) * liquid;
    float highlightNoise = fbm(liquidPoint * 3.5 + vec2(t * 0.45, -t * 0.3));
    float highlight = pow(max(0.0, highlightNoise - 0.55) * 2.25, 2.2) * liquid;

    // Dark mode fluid colors (neon cyber cyan on deep space)
    vec3 deepBlue = vec3(0.0, 0.012, 0.045);
    vec3 electricBlue = vec3(0.0, 0.055, 0.18);
    vec3 cyan = vec3(0.0, 0.42, 0.58);
    vec3 lightCyan = vec3(0.24, 0.64, 0.72);
    vec3 darkFluidColor = mix(deepBlue, electricBlue, smoothstep(0.35, 0.72, density));
    darkFluidColor = mix(darkFluidColor, cyan, rim * 0.38 + innerFold * 0.10);
    darkFluidColor = mix(darkFluidColor, lightCyan, highlight * 0.25);
    darkFluidColor *= 0.45 + 0.38 * smoothstep(0.35, 0.75, pocketNoise);

    // Light mode fluid colors (radiant, crystal Sky Blue: #0EA5E9, #38BDF8, #7DD3FC)
    vec3 skyBase = vec3(0.055, 0.647, 0.914);   // #0EA5E9
    vec3 skyBright = vec3(0.220, 0.741, 0.969); // #38BDF8
    vec3 skyLight = vec3(0.490, 0.827, 0.988);  // #7DD3FC
    vec3 lightFluidColor = mix(skyBase, skyBright, smoothstep(0.32, 0.68, density));
    lightFluidColor = mix(lightFluidColor, skyLight, rim * 0.45 + highlight * 0.35);

    vec3 fluidColor = mix(darkFluidColor, lightFluidColor, uTheme);

    float centerQuiet = aspect < 1.0 ? 1.0 : (1.0 - 0.16 * exp(-2.6 * dot(p * vec2(0.72, 0.95), p * vec2(0.72, 0.95))));
    float darkAlpha = (liquid * 0.61 + rim * 0.17 + innerFold * 0.105 + highlight * 0.19) * centerQuiet;
    // Translucent airy Sky Blue fluid on pure white background
    float lightAlpha = (liquid * 0.38 + rim * 0.25 + highlight * 0.22) * centerQuiet;
    float alpha = mix(darkAlpha, lightAlpha, uTheme);

    gl_FragColor = vec4(fluidColor, alpha);
  }
`;

export function initHeroFluidBackground() {
  const root = document.body;
  if (!root || root.dataset.fluidBackgroundReady === 'true') return activeFluidBackground;

  const canvas = document.createElement('canvas');
  canvas.className = 'global-fluid-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  root.prepend(canvas);

  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: false, powerPreference: 'high-performance' });
  } catch (_) {
    canvas.remove();
    return null;
  }

  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    depthTest: false,
    vertexShader,
    fragmentShader,
    uniforms: {
      uTime: { value: 0 },
      uPointer: { value: new THREE.Vector2(0.5, 0.5) },
      uTheme: { value: document.documentElement.getAttribute('data-theme') === 'light' ? 1 : 0 },
      uResolution: { value: new THREE.Vector2(1, 1) },
    },
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  scene.add(mesh);

  let frameId = null;
  let isVisible = true;
  let isDestroyed = false;
  const pointer = new THREE.Vector2(0.5, 0.5);
  const targetPointer = new THREE.Vector2(0.5, 0.5);

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x000000, 0);

  const resize = () => {
    const isMobile = window.innerWidth < 768;
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    renderer.setPixelRatio(isMobile ? 0.65 : Math.min(window.devicePixelRatio || 1, 1.5));
    renderer.setSize(width, height, false);
    material.uniforms.uResolution.value.set(width, height);
  };

  const isMobile = () => window.innerWidth < 768;

  const render = (now = 0) => {
    if (isDestroyed || !isVisible) return;

    if (isMobile()) {
      // Mobile: Render one static initial frame, but do NOT run continuous RAF loop
      // to keep mobile GPU 100% free for fluid touch scrolling and instant animations
      material.uniforms.uPointer.value.set(0.5, 0.5);
      material.uniforms.uTime.value = 0.5;
      renderer.render(scene, camera);
      return;
    }

    pointer.lerp(targetPointer, 0.18);
    material.uniforms.uPointer.value.copy(pointer);
    material.uniforms.uTime.value = reducedMotion ? 0 : now * 0.001;
    if (Math.abs(targetThemeValue - currentThemeValue) > 0.001) {
      currentThemeValue += (targetThemeValue - currentThemeValue) * 0.06;
      material.uniforms.uTheme.value = currentThemeValue;
    } else if (currentThemeValue !== targetThemeValue) {
      currentThemeValue = targetThemeValue;
      material.uniforms.uTheme.value = targetThemeValue;
    }
    renderer.render(scene, camera);
    if (!reducedMotion) frameId = requestAnimationFrame(render);
  };

  const start = () => {
    if (!isVisible || isDestroyed) return;
    cancelAnimationFrame(frameId);
    if (isMobile()) {
      render(0);
      return;
    }
    render(performance.now());
  };

  const onPointerMove = (event) => {
    // Restrict fluid pointer interaction on mobile; keep active on desktop web
    if (isMobile()) return;

    const rect = { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
    targetPointer.set(
      Math.max(0, Math.min(1, (event.clientX - rect.left) / Math.max(1, rect.width))),
      Math.max(0, Math.min(1, 1 - (event.clientY - rect.top) / Math.max(1, rect.height))),
    );
  };

  const onResize = () => {
    resize();
    if (!isMobile() && !reducedMotion && isVisible && !frameId) {
      start();
    } else if (isMobile()) {
      cancelAnimationFrame(frameId);
      frameId = null;
      render(0);
    }
  };

  const visibilityObserver = new IntersectionObserver(([entry]) => {
    isVisible = entry.isIntersecting;
    if (isVisible) start();
    else cancelAnimationFrame(frameId);
  }, { threshold: 0.01 });
  visibilityObserver.observe(root);
  let currentThemeValue = document.documentElement.getAttribute('data-theme') === 'light' ? 1.0 : 0.0;
  let targetThemeValue = currentThemeValue;
  material.uniforms.uTheme.value = currentThemeValue;

  const updateThemeUniform = () => {
    targetThemeValue = document.documentElement.getAttribute('data-theme') === 'light' ? 1.0 : 0.0;
    if (reducedMotion || isMobile()) {
      currentThemeValue = targetThemeValue;
      material.uniforms.uTheme.value = targetThemeValue;
      render(performance.now());
    }
  };
  const themeObserver = new MutationObserver(updateThemeUniform);
  themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  window.addEventListener('hv:themechange', updateThemeUniform);

  const onVisibilityChange = () => {
    if (document.hidden) {
      cancelAnimationFrame(frameId);
      frameId = null;
    } else if (isVisible && !reducedMotion && !isDestroyed && !isMobile()) {
      start();
    }
  };
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('resize', onResize, { passive: true });

  resize();
  start();
  root.dataset.fluidBackgroundReady = 'true';

  activeFluidBackground = {
    destroy() {
      if (isDestroyed) return;
      isDestroyed = true;
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      visibilityObserver.disconnect();
      themeObserver.disconnect();
      window.removeEventListener('pointermove', onPointerMove);
      mesh.geometry.dispose();
      material.dispose();
      renderer.dispose();
      canvas.remove();
      delete root.dataset.fluidBackgroundReady;
      activeFluidBackground = null;
    },
  };

  return activeFluidBackground;
}
