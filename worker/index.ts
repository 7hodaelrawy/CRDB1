interface Env { TMDB_KEY?: string; TMDB_API_KEY?: string }

const getKey = (env: Env) => (env.TMDB_KEY || env.TMDB_API_KEY || '').trim();

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // بلد الزائر (Cloudflare بيحدده تلقائياً)
    if (url.pathname === '/api/country') {
      const cf = (request as unknown as { cf?: { country?: string } }).cf;
      return Response.json(
        { country: cf?.country || null },
        { headers: { 'cache-control': 'private, max-age=3600' } },
      );
    }

    if (url.pathname.startsWith('/api/tmdb/')) {
      const target = new URL('https://api.themoviedb.org/3/' + url.pathname.slice('/api/tmdb/'.length));
      url.searchParams.forEach((v, k) => target.searchParams.set(k, v));
      const key = getKey(env);
      const headers: Record<string, string> = {};
      if (key.length > 40) headers.Authorization = `Bearer ${key}`;
      else target.searchParams.set('api_key', key);
      const res = await fetch(target.toString(), { headers, cf: { cacheTtl: 300, cacheEverything: true } });
      return new Response(res.body, {
        status: res.status,
        headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' },
      });
    }

    if (url.pathname.startsWith('/img/')) {
      const res = await fetch('https://image.tmdb.org/t/p/' + url.pathname.slice(5), { cf: { cacheTtl: 86400, cacheEverything: true } });
      return new Response(res.body, {
        status: res.status,
        headers: { 'content-type': res.headers.get('content-type') || 'image/jpeg', 'cache-control': 'public, max-age=86400' },
      });
    }

    return new Response('Not found', { status: 404 });
  },
};
