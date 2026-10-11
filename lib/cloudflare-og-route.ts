import { getCloudflareContext } from '@opennextjs/cloudflare';
export const dynamic = 'force-dynamic';
/** Free Workers cannot afford WASM rasterization. PNG downloads use the browser. */
export async function GET(req: Request): Promise<Response> {
  const { env } = getCloudflareContext();
  const assets = (env as unknown as { ASSETS: { fetch(request: Request): Promise<Response> } }).ASSETS;
  const image = await assets.fetch(new Request(new URL('/og-fallback.png',req.url)));
  if (!image.ok) return new Response('Share image unavailable',{status:503});
  const headers = new Headers(image.headers);
  headers.set('Cache-Control','public, max-age=86400');
  headers.set('Content-Type','image/png');
  headers.set('X-Content-Type-Options','nosniff');
  return new Response(image.body,{status:200,headers});
}
