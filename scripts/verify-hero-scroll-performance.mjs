import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
});
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewport({ width, height: 1000 });
    await page.evaluateOnNewDocument(() => {
      localStorage.setItem('highverz-theme', 'dark');
      sessionStorage.setItem('hv_from_subpage', 'true');
    });
    await page.goto((process.env.TEST_ORIGIN || 'http://localhost:5173') + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__hvHeroReelRefreshTheme);
    await delay(2500);
    for (const theme of ['dark', 'light']) {
      await page.evaluate(theme => document.querySelector(`.theme-capsule-btn[data-theme-value="${theme}"]`).click(), theme);
      await delay(1800);
      await page.evaluate(() => {
        window.__reelMetrics = { reads: 0, mediaWrites: 0, frames: [], maxScroll: 0 };
        if (!window.__reelInstrumentation) {
          window.__reelInstrumentation = true;
          const bounds = Element.prototype.getBoundingClientRect;
          Element.prototype.getBoundingClientRect = function (...args) {
            if (this.matches('.card-position, .card-perspective')) window.__reelMetrics.reads++;
            return bounds.apply(this, args);
          };
          const set = Element.prototype.setAttribute;
          Element.prototype.setAttribute = function (...args) {
            if (this.matches('#heroCarouselTrack video')) window.__reelMetrics.mediaWrites++;
            return set.apply(this, args);
          };
        }
        const frames = window.__reelMetrics.frames;
        const start = performance.now();
        let last = start;
        const tick = now => {
          frames.push(now - last);
          window.__reelMetrics.maxScroll = Math.max(window.__reelMetrics.maxScroll, scrollY);
          last = now;
          if (now - start < 3500) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      // Wheel over the carousel, then drag it: neither path should force
      // synchronous projected-card layout reads during the animation.
      const rail = await page.$eval('#heroCarouselViewport', el => {
        const r = el.getBoundingClientRect();
        return { y: Math.min(innerHeight - 100, Math.max(100, r.top + r.height / 2)) };
      });
      await page.mouse.move(width / 2, rail.y);
      for (let i = 0; i < 8; i++) {
        await page.mouse.wheel({ deltaY: i < 4 ? 45 : -45 });
        await delay(100);
      }
      await page.mouse.down();
      await page.mouse.move(width / 2 - 100, rail.y, { steps: 16 });
      await page.mouse.up();
      await delay(2800);
      const result = await page.evaluate(() => {
        const { reads, mediaWrites, frames, maxScroll } = window.__reelMetrics;
        return { reads, mediaWrites, frames: frames.length,
          longFrames: frames.filter(ms => ms > 40).length,
          maxFrame: Math.round(Math.max(...frames)), maxScroll };
      });
      console.log(JSON.stringify({ width, theme, ...result }));
      assert.ok(result.maxScroll > 50, 'Wheel input must scroll the page over the carousel');
      if (!process.env.PERF_BASELINE) {
        assert.equal(result.reads, 0, 'Carousel must not synchronously measure moving cards');
        assert.ok(result.mediaWrites < 80, 'Playing reels must not repeatedly reconfigure media attributes');
      }

      await page.evaluate(() => {
        const rail = document.querySelector('#heroCarouselViewport');
        const top = rail.getBoundingClientRect().bottom + scrollY + 200;
        if (window.lenis) window.lenis.scrollTo(top, { immediate: true });
        else scrollTo(0, top);
      });
      await delay(500);
      assert.ok(await page.$$eval('#heroCarouselTrack video', videos => videos.every(v => v.paused)), 'Offscreen reels must pause');
      await page.evaluate(() => {
        if (window.lenis) window.lenis.scrollTo(0, { immediate: true });
        else scrollTo(0, 0);
      });
      await delay(1000);
      const playback = await page.evaluate(async () => {
        const videos = [...document.querySelectorAll('#heroCarouselTrack video')].filter(v => {
          const r = v.getBoundingClientRect();
          return r.width > 0 && r.right > 0 && r.left < innerWidth && r.bottom > 0 && r.top < innerHeight;
        });
        const times = videos.map(v => v.currentTime);
        await new Promise(resolve => setTimeout(resolve, 250));
        return videos.map((v, i) => ({ paused: v.paused, advanced: v.currentTime !== times[i] }));
      });
      assert.ok(playback.length >= 3, 'At least three reels must be visible');
      assert.ok(playback.every(v => !v.paused && v.advanced), 'All visible reels must resume playback');
    }
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally { await browser.close(); }
