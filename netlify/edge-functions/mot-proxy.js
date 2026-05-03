/**
 * Netlify Edge Function — streams the MOT GTFS ZIP to the browser.
 * Runs on Deno at the CDN edge; streaming means no timeout/size limit issues.
 */
export default async () => {
  const MOT_URL = 'https://gtfs.mot.gov.il/gtfsfiles/israel-public-transportation.zip';

  const upstream = await fetch(MOT_URL, {
    headers: { 'User-Agent': 'GTFSExplorer/1.0' },
  });

  if (!upstream.ok) {
    return new Response(`MOT fetch failed: ${upstream.status}`, { status: 502 });
  }

  const headers = new Headers({
    'Content-Type':                'application/zip',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control':               'public, max-age=3600',
  });
  const cl = upstream.headers.get('Content-Length');
  if (cl) headers.set('Content-Length', cl);

  return new Response(upstream.body, { status: 200, headers });
};

export const config = { path: '/mot-proxy' };
