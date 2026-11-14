const baseUrl = process.env.HV_BASE_URL || 'http://localhost:5173';
const driverUrl = process.env.SAFARI_DRIVER_URL || 'http://localhost:4444';
const pages = [
  'creator-niv0ne.html',
  'creator-umarpnj.html',
  'movie-runner.html',
  'movie-kingofkings.html',
];

async function request(path, options = {}) {
  const response = await fetch(`${driverUrl}${path}`, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || payload.value?.error) {
    throw new Error(payload.value?.message || `Safari WebDriver returned HTTP ${response.status}`);
  }
  return payload.value;
}

const session = await request('/session', {
  method: 'POST',
  body: JSON.stringify({ capabilities: { alwaysMatch: { browserName: 'safari' } } }),
});
const id = session.sessionId;

try {
  for (const page of pages) {
    await request(`/session/${id}/url`, {
      method: 'POST',
      body: JSON.stringify({ url: `${baseUrl}/${page}` }),
    });

    const button = await request(`/session/${id}/element`, {
      method: 'POST',
      body: JSON.stringify({ using: 'css selector', value: '.case-reels-section .ig-sound-toggle-btn' }),
    });
    await request(`/session/${id}/element/${button['element-6066-11e4-a52e-4f735466cecf']}/click`, {
      method: 'POST',
      body: JSON.stringify({}),
    });

    await new Promise((resolve) => setTimeout(resolve, 2500));
    const result = await request(`/session/${id}/execute/sync`, {
      method: 'POST',
      body: JSON.stringify({
        // Inspect the exact video whose sound button WebDriver clicked. The
        // carousel contains loop clones, so querying the first video in the
        // section can report a different reel and give a false failure.
        script: `const b = document.querySelector('.case-reels-section .ig-sound-toggle-btn'); const c = b?.closest('.ig-reel-card'); const v = c?.querySelector('.ig-reel-video'); return {src:v?.currentSrc || v?.src, muted:v?.muted, defaultMuted:v?.defaultMuted, mutedAttribute:v?.hasAttribute('muted'), paused:v?.paused, currentTime:v?.currentTime, readyState:v?.readyState, networkState:v?.networkState, mediaError:v?.error ? {code:v.error.code, message:v.error.message} : null, soundButtonUnmuted:b?.classList.contains('is-unmuted'), audioTracks:v?.audioTracks?.length ?? 'unsupported'};`,
        args: [],
      }),
    });
    console.log(`${page}: ${JSON.stringify(result)}`);
  }
} finally {
  await request(`/session/${id}`, { method: 'DELETE', body: JSON.stringify({}) }).catch(() => {});
}
