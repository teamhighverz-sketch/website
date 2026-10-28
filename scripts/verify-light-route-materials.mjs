import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const origin = process.env.TEST_ORIGIN || 'http://localhost:5173';
const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width, height: 900 });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('highverz-theme', 'light');
      sessionStorage.setItem('hv_from_subpage', 'true');
      window.fluidDraws = 0;
      window.browserFrames = 0;
      const frame = () => { window.browserFrames++; requestAnimationFrame(frame); };
      requestAnimationFrame(frame);
      for (const type of [WebGLRenderingContext, WebGL2RenderingContext]) {
        for (const method of ['drawArrays', 'drawElements']) {
          const original = type.prototype[method];
          type.prototype[method] = function (...args) {
            if (this.canvas.classList.contains('global-fluid-canvas')) window.fluidDraws++;
            return original.apply(this, args);
          };
        }
      }
    });
    await page.goto(`${origin}/work.html`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.fluidDraws > 0 && window.__hvInitPageScripts);
    await new Promise(resolve => setTimeout(resolve, 1800));
    for (const route of ['team', 'why-us', 'campaigns', 'index', 'work', 'movie-runner', 'movie-kingofkings', 'creator-umarpnj', 'creator-niv0ne']) {
      const result = await page.evaluate(async route => {
        const { navigateWithTransition } = await import('/src/transitions.js');
        const canvas = document.querySelector('.global-fluid-canvas');
        const problems = new Set();
        let shellSamples = 0, previousDraws = window.fluidDraws, previousFrames = window.browserFrames, stalledSamples = 0;
        const started = performance.now();
        const sampling = new Promise(resolve => {
          const timer = setInterval(() => {
            if (document.querySelector('#page-transition-shell')) {
              shellSamples++;
              if (document.body.getBoundingClientRect().height < innerHeight) problems.add('collapsed document');
              // Do not confuse browser-wide RAF throttling with our renderer
              // stopping while the rest of the page continues animating.
              if (innerWidth > 768 && window.browserFrames > previousFrames + 1 && window.fluidDraws === previousDraws) stalledSamples++;
            }
            previousDraws = window.fluidDraws;
            previousFrames = window.browserFrames;
            for (const el of document.querySelectorAll('.light-entry-glass')) {
              const style = getComputedStyle(el);
              if (style.opacity !== '1' || style.filter !== 'none' || /opacity|filter/.test(style.willChange)) problems.add(`unstable material: ${el.className}`);
            }
            if ((!document.querySelector('#page-transition-shell') && !document.body.classList.contains('page-is-transitioning') && shellSamples > 0 && performance.now() - started >= 1200) || performance.now() - started >= 5000) { clearInterval(timer); resolve(); }
          }, 100);
        });
        navigateWithTransition(`/${route}.html`);
        await sampling;
        return { problems: [...problems], shellSamples, stalledSamples, sameCanvas: canvas === document.querySelector('.global-fluid-canvas'),
          path: location.pathname, shellGone: !document.querySelector('#page-transition-shell'), mainCount: document.querySelectorAll('#page-content').length };
      }, route);
      console.log(width, route, JSON.stringify(result));
      assert.equal(result.path, `/${route}.html`);
      assert.deepEqual(result.problems, []);
      assert.ok(result.sameCanvas && result.shellGone && result.shellSamples > 0);
      assert.equal(result.mainCount, 1);
      assert.ok(result.stalledSamples <= 1, 'Fluid must keep drawing during route handoff');
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally { await browser.close(); }
