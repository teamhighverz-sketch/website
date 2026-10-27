import assert from 'node:assert/strict';
import puppeteer from 'puppeteer-core';

const browser = await puppeteer.launch({
  executablePath: process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});
const origin = process.env.TEST_ORIGIN || 'http://localhost:5173';
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
    await page.goto(origin + '/index.html', { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__hvHeroReelRefreshTheme);
    await new Promise(resolve => setTimeout(resolve, 2500));
    for (const theme of ['light', 'dark', 'light']) {
      const before = await page.$eval('#heroCarouselViewport', el => ({ top: el.getBoundingClientRect().top, height: el.getBoundingClientRect().height }));
      await page.evaluate(theme => document.querySelector(`.theme-capsule-btn[data-theme-value="${theme}"]`).click(), theme);
      const mismatch = await page.$$eval('#heroCarouselTrack .card-video', (videos, theme) => videos.filter(v => v.getAttribute('src') !== v.dataset[theme === 'light' ? 'lightSrc' : 'darkSrc']).length, theme);
      assert.equal(mismatch, 0, 'Every reel source must match the theme in the switch task');
      await new Promise(resolve => setTimeout(resolve, 2000));
      const playing = await page.evaluate(async () => {
        const viewport = document.querySelector('#heroCarouselViewport');
        const rail = viewport.getBoundingClientRect();
        const visible = [...viewport.querySelectorAll('.card-video')].filter(v => {
          const rect = v.getBoundingClientRect();
          return rect.width && rect.right > 0 && rect.left < innerWidth && rect.bottom > 0 && rect.top < innerHeight;
        });
        const initial = visible.map(v => v.currentTime);
        const pos = viewport.querySelector('.card-position:not([style*="display: none"])') || viewport.querySelector('.card-position');
        const transform = pos.style.transform;
        await new Promise(resolve => setTimeout(resolve, 500));
        return { top: rail.top, height: rail.height, moving: pos.style.transform !== transform,
          videos: visible.map((v, i) => {
            const rect = v.getBoundingClientRect();
            return { src: v.getAttribute('src'), ready: v.readyState, paused: v.paused,
              advancing: v.currentTime !== initial[i], loading: v.closest('.video-card').classList.contains('reel-media-loading'),
              stillVisible: rect.width > 0 && rect.right > 0 && rect.left < innerWidth && rect.bottom > 0 && rect.top < innerHeight };
          }).filter(v => v.stillVisible) };
      });
      console.log(width, theme, JSON.stringify(playing));
      assert.ok(Math.abs(before.top - playing.top) < 2 && Math.abs(before.height - playing.height) < 2, 'Theme switch must preserve rail layout');
      assert.ok(playing.moving, 'Carousel must keep moving');
      assert.ok(playing.videos.length >= 3);
      assert.ok(playing.videos.every(v => v.ready >= 2 && !v.paused && v.advancing && !v.loading), 'All onscreen reels must play');
    }
    // Superseded loads must never reveal the old theme or leave a lock behind.
    await page.evaluate(async () => {
      for (const theme of ['dark', 'light', 'dark', 'light', 'dark']) {
        document.querySelector(`.theme-capsule-btn[data-theme-value="${theme}"]`).click();
        await new Promise(resolve => setTimeout(resolve, 75));
      }
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
    assert.ok(await page.$$eval('#heroCarouselTrack .card-video', videos => videos.every(v => v.getAttribute('src') === v.dataset.darkSrc)));
    assert.deepEqual(errors, []);
    await page.close();
  }
} finally { await browser.close(); }
