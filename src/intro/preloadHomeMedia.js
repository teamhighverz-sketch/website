// Load the real Home media elements so decoded images and buffered video are
// reused by the page. Do not download a second copy of each reel via fetch().
// Keep the intro from holding the first screen while large reel files buffer.
export const HOME_MEDIA_TIMEOUT = 3000;

// The carousel keeps both creator and cinema sources on each video element.
// Resolve the source for the active theme here as well so the loading screen
// warms the exact media that will be revealed (rather than the dark-theme
// fallback in data-src). This also keeps the decoded buffer on the same video
// element that the carousel reuses after the intro.
function getThemeVideoSource(video) {
  if (!video) return '';
  const isLight = document.documentElement?.dataset?.theme === 'light';
  const isMobile = typeof window !== 'undefined' && window.innerWidth <= 768;
  if (isLight) {
    return (isMobile && video.dataset.lightMobileSrc) ||
      video.dataset.lightSrc ||
      video.dataset.src ||
      video.getAttribute('src') || '';
  }
  return (isMobile && video.dataset.darkMobileSrc) ||
    video.dataset.darkSrc ||
    video.dataset.mobileSrc ||
    video.dataset.src ||
    video.getAttribute('src') || '';
}

export function preloadHomeMedia(onProgress = () => {}) {
  const images = [...document.querySelectorAll('img')];
  const videos = [...document.querySelectorAll('#page-content video')];
  const isLight = document.documentElement?.dataset?.theme === 'light';
  if (isLight) {
    videos.forEach((video, index) => {
      if (!video) return;
      if (!video.dataset.darkPoster && video.getAttribute('poster')) {
        video.dataset.darkPoster = video.getAttribute('poster');
      }
      const lightPoster = video.dataset.lightPoster || `/assets/movie/posters/poster_${index + 1}.jpg`;
      video.setAttribute('poster', lightPoster);
    });
  }
  const posters = [...new Set(videos.map(video => (isLight ? (video.dataset.lightPoster || video.poster) : (video.dataset.darkPoster || video.poster))).filter(Boolean))];
  const total = images.length + videos.length + posters.length;
  const results = [];
  let settled = 0;

  function waitFor(element, events, ready, start, source) {
    return new Promise(resolve => {
      let done = false;
      const finish = status => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        events.forEach(event => element.removeEventListener(event, check));
        element.removeEventListener('error', fail);
        results.push({ source, status });
        onProgress(++settled / Math.max(total, 1));
        resolve();
      };
      const check = () => { if (ready()) finish('ready'); };
      const fail = () => finish('error');
      const timer = setTimeout(() => finish('timeout'), HOME_MEDIA_TIMEOUT);
      if (ready()) { finish('ready'); return; }
      events.forEach(event => element.addEventListener(event, check));
      element.addEventListener('error', fail);
      start(check, fail);
      check();
    });
  }

  function imageTask(image, source) {
    let decoded = false;
    return waitFor(image, ['load'], () => decoded, (check, fail) => {
      image.loading = 'eager';
      image.decoding = 'async';
      if (!image.src) image.src = source;
      image.decode().then(() => { decoded = true; check(); }, fail);
    }, source);
  }

  // Buffer one lead reel while the intro is visible. Loading every large reel
  // here saturates the network and delays the first screen; the carousel loads
  // its other visible reels after reveal, with posters covering them meanwhile.
  const targetVideos = videos.length > 0 ? [videos[0]] : [];

  if (targetVideos.length > 0) {
    targetVideos.forEach((video) => {
      if (!video) return;
      video.muted = true;
      video.playsInline = true;
      video.defaultMuted = true;
      video.setAttribute('playsinline', '');
      video.setAttribute('muted', '');
      const source = getThemeVideoSource(video);
      if (source && video.getAttribute('src') !== source) {
        video.setAttribute('src', source);
        video.dataset.activeThemeSrc = source;
      }
    });
  }

  const tasks = images.map(image => imageTask(image, image.currentSrc || image.src));
  tasks.push(...posters.map(source => imageTask(new Image(), source)));
  tasks.push(...targetVideos.map(video => waitFor(video, ['loadeddata', 'canplay', 'canplaythrough', 'progress', 'suspend'], () => {
    if (video.readyState < 3) return false;
    const needed = Math.min(2, Number.isFinite(video.duration) ? video.duration : 2);
    for (let i = 0; i < video.buffered.length; i++) {
      if (video.buffered.start(i) <= video.currentTime &&
          video.buffered.end(i) >= video.currentTime + needed) return true;
    }
    return false;
  }, () => {
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.defaultMuted = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('muted', '');
    const source = getThemeVideoSource(video);
    if (source && video.getAttribute('src') !== source) {
      video.pause();
      video.removeAttribute('src');
      video.setAttribute('src', source);
      video.dataset.activeThemeSrc = source;
    }
    // Restart the initial metadata-only request once with preload=auto.
    // Changing the property alone can leave a paused reel at its tiny metadata
    // buffer until the user finally sees it and playback begins.
    video.load();
  }, getThemeVideoSource(video))));

  return Promise.all(tasks).then(() => {
    window.__hvHomeMediaResult = results;
    window.dispatchEvent(new CustomEvent('hv:home-media-ready', { detail: results }));
    return results;
  });
}
