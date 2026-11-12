// Reel files keep stable names while their contents change. A revisioned URL
// prevents old immutable browser entries from surviving a new deployment.
export const REEL_MEDIA_REVISION = '20261113';

export function versionReelSource(source) {
  if (!source || !/\.(?:mp4|webm|mov)(?:[?#]|$)/i.test(source)) return source || '';
  const url = new URL(source, window.location.href);
  if (url.origin !== window.location.origin) return source;
  url.searchParams.set('v', REEL_MEDIA_REVISION);
  return `${url.pathname}${url.search}${url.hash}`;
}
