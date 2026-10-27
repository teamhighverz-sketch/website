import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  for (const width of [375, 430, 1440]) {
    const page = await browser.newPage();
    await page.setViewport({ width, height: 844, isMobile: width < 768, hasTouch: width < 768, deviceScaleFactor: 2 });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('highverz-theme', 'dark');
      sessionStorage.setItem('hv_from_subpage', 'true');
    });
    await page.goto((process.env.TEST_ORIGIN || 'http://localhost:5173') + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__hvHeroReelRefreshTheme);
    await delay(2000);
    for (const theme of ['light', 'dark']) {
      await page.evaluate(theme => document.querySelector(`.theme-capsule-btn[data-theme-value="${theme}"]`).click(), theme);
      await delay(1400);
      for (const route of ['team', 'why-us', 'index']) {
        await page.evaluate(route => {
          const top = route === 'team' ? 0 : 250;
          if (window.lenis) window.lenis.scrollTo(top, { immediate: true });
          else scrollTo(0, top);
        }, route);
        await delay(150);
        if (width < 768) {
          await page.evaluate(() => document.getElementById('mobile-toggle').click());
          await delay(450);
        }
        const result = await page.evaluate(async route => {
          const outgoing = document.getElementById('page-content');
          const before = outgoing.getBoundingClientRect().top;
          const samples = [];
          const shellStates = [];
          const start = performance.now();
          let frozenTop;
          const done = new Promise(resolve => {
            const tick = () => {
              if (outgoing.classList.contains('page-outgoing-frozen') && frozenTop === undefined) frozenTop = outgoing.getBoundingClientRect().top;
              const shell = document.getElementById('page-transition-shell');
              const incoming = shell?.querySelector('#page-content');
              if (incoming && shell.style.visibility === 'visible') {
                samples.push(incoming.getBoundingClientRect().top);
                const state = { top: incoming.getBoundingClientRect().top, scroll: shell.scrollTop, padding: getComputedStyle(shell).paddingTop };
                if (JSON.stringify(shellStates.at(-1)) !== JSON.stringify(state)) shellStates.push(state);
              }
              if (performance.now() - start < 1800) requestAnimationFrame(tick);
              else resolve();
            };
            requestAnimationFrame(tick);
          });
          document.querySelector(`.mobile-nav-link[href="/${route}.html"]`).click();
          await done;
          return { before, frozenTop, incomingTops: [...new Set(samples.map(y => Math.round(y * 100) / 100))], shellStates,
            finalTop: document.getElementById('page-content').getBoundingClientRect().top, scrollY,
            shellLeft: !!document.getElementById('page-transition-shell') };
        }, route);
        console.log(JSON.stringify({ width, theme, route, ...result }));
        if (!process.env.LAYOUT_BASELINE) {
          assert.ok(Math.abs(result.before - result.frozenTop) < 1, 'Freezing the outgoing page must preserve its screen position');
          assert.ok(result.incomingTops.length > 0, 'Incoming page must be sampled during the transition');
          assert.ok(result.incomingTops.every(y => Math.abs(y - result.finalTop) < 1), 'Promoting the incoming page must not move it vertically');
          assert.ok(result.shellStates.every(state => state.scroll === 0), 'The reveal layer must not scroll during initialization');
          assert.equal(result.scrollY, 0);
          assert.equal(result.shellLeft, false);
        }
      }
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally { await browser.close(); }
