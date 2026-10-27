interface Env {
  TMDB_API_KEY: string;
  ASSETS: Fetcher;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // 1. طلبات الأفلام (API)
    if (url.pathname.startsWith('/api/tmdb/')) {
      const target = new URL('https://api.themoviedb.org/3/' + url.pathname.slice('/api/tmdb/'.length));
      url.searchParams.forEach((v, k) => target.searchParams.set(k, v));
      const key = (env.TMDB_API_KEY || '').trim();
      const headers: Record<string, string> = {};
      if (key.length > 40) headers.Authorization = `Bearer ${key}`;
      else target.searchParams.set('api_key', key);
      const res = await fetch(target.toString(), { headers, cf: { cacheTtl: 300, cacheEverything: true } });
      return new Response(res.body, {
        status: res.status,
        headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' },
      });
    }

    // 2. طلبات الصور
    if (url.pathname.startsWith('/img/')) {
      const res = await fetch('https://image.tmdb.org/t/p/' + url.pathname.slice(5), { cf: { cacheTtl: 86400, cacheEverything: true } });
      return new Response(res.body, {
        status: res.status,
        headers: { 'content-type': res.headers.get('content-type') || 'image/jpeg', 'cache-control': 'public, max-age=86400' },
      });
    }

    // 3. عرض الموقع (الملفات) وحقن كود الـ CSP
    try {
      const res = await env.ASSETS.fetch(request);
      const newHeaders = new Headers(res.headers);
      // السطر ده هو اللي بيفك الحظر
      newHeaders.set('Content-Security-Policy', "script-src 'self' 'unsafe-eval' 'unsafe-inline' https:;");
      return new Response(res.body, {
        status: res.status,
        headers: newHeaders,
      });
    } catch (e) {
      // لو الملف مش موجود
      return new Response('Not found', { status: 404 });
    }
  },
};
