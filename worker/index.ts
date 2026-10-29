interface Env {
  TMDB_KEY?: string;
  TMDB_API_KEY?: string;
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
}

interface TmdbItem {
  title?: string;
  name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
}

// ===== إعدادات =====
const SITE_NAME = 'Narvelo';
// لما تشتري الدومين حط هنا مثلاً 'https://narvelo.com' (من غير / في الآخر). فاضي = نفس الدومين اللي الزائر فيه.
const CANONICAL_ORIGIN = '';
// شكل روابط صفحات الأفلام والمسلسلات في موقعك
const TITLE_ROUTE = /^\/(movie|tv)\/(\d+)(?:[-/].*)?$/;

const getKey = (env: Env) => (env.TMDB_KEY || env.TMDB_API_KEY || '').trim();

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const clip = (s: string, n = 160) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
};

async function tmdb<T>(env: Env, path: string, params: Record<string, string> = {}): Promise<T | null> {
  try {
    const target = new URL('https://api.themoviedb.org/3/' + path);
    for (const [k, v] of Object.entries(params)) target.searchParams.set(k, v);
    const key = getKey(env);
    const headers: Record<string, string> = {};
    if (key.length > 40) headers.Authorization = `Bearer ${key}`;
    else target.searchParams.set('api_key', key);
    const res = await fetch(target.toString(), { headers, cf: { cacheTtl: 3600, cacheEverything: true } });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

// صفحة فيلم/مسلسل: نفس الـ index.html بس بعنوان ووصف وصورة مشاركة خاصة بالعنوان
async function titlePage(env: Env, url: URL, kind: string, id: string): Promise<Response | null> {
  if (!env.ASSETS) return null;
  const shell = await env.ASSETS.fetch(new Request(new URL('/', url).toString()));
  if (!shell.ok) return shell;

  const data = await tmdb<TmdbItem>(env, `${kind}/${id}`, { language: 'ar' });
  if (!data) return shell; // لو فشل أي حاجة، الموقع يشتغل عادي
  if (!data.overview) {
    const en = await tmdb<TmdbItem>(env, `${kind}/${id}`, { language: 'en-US' });
    if (en?.overview) data.overview = en.overview;
  }

  const name = data.title || data.name || '';
  if (!name) return shell;
  const year = (data.release_date || data.first_air_date || '').slice(0, 4);
  const title = `${name}${year ? ` (${year})` : ''} — ${SITE_NAME}`;
  const desc = clip(data.overview || `${name} — تقييمات وتفاصيل على ${SITE_NAME}`);
  const origin = CANONICAL_ORIGIN || url.origin;
  const canonical = `${origin}/${kind}/${id}`;
  const imgPath = data.backdrop_path || data.poster_path;
  const image = imgPath ? `${origin}/img/w780${imgPath}` : '';

  const ld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': kind === 'movie' ? 'Movie' : 'TVSeries',
    name,
    description: desc,
    url: canonical,
    ...(image ? { image } : {}),
    ...(year ? { datePublished: year } : {}),
  }).replace(/</g, '\\u003c');

  const tags = [
    `<meta name="description" content="${esc(desc)}">`,
    `<link rel="canonical" href="${esc(canonical)}">`,
    `<meta property="og:type" content="${kind === 'movie' ? 'video.movie' : 'video.tv_show'}">`,
    `<meta property="og:site_name" content="${esc(SITE_NAME)}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(desc)}">`,
    `<meta property="og:url" content="${esc(canonical)}">`,
    image ? `<meta property="og:image" content="${esc(image)}">` : '',
    `<meta name="twitter:card" content="${image ? 'summary_large_image' : 'summary'}">`,
    `<script type="application/ld+json">${ld}</script>`,
  ].join('\n');

  const out = new HTMLRewriter()
    .on('title', { element(e) { e.setInnerContent(title); } })
    .on('meta[name="description"], link[rel="canonical"], meta[property^="og:"], meta[name="twitter:card"]', {
      element(e) { e.remove(); },
    })
    .on('head', { element(e) { e.append(tags, { html: true }); } })
    .transform(shell);

  const headers = new Headers(out.headers);
  headers.delete('etag');
  headers.set('content-type', 'text/html; charset=utf-8');
  headers.set('cache-control', 'public, max-age=600');
  return new Response(out.body, { status: 200, headers });
}

// sitemap ديناميكي: الصفحة الرئيسية + أعلى 100 فيلم + أعلى 100 مسلسل
async function sitemap(env: Env, url: URL): Promise<Response> {
  type List = { results?: { id: number }[] };
  const origin = CANONICAL_ORIGIN || url.origin;
  const pages = ['1', '2', '3', '4', '5'];
  const [movies, shows] = await Promise.all([
    Promise.all(pages.map((p) => tmdb<List>(env, 'movie/top_rated', { page: p }))),
    Promise.all(pages.map((p) => tmdb<List>(env, 'tv/top_rated', { page: p }))),
  ]);

  const urls = [`${origin}/`];
  movies.forEach((l) => l?.results?.forEach((m) => urls.push(`${origin}/movie/${m.id}`)));
  shows.forEach((l) => l?.results?.forEach((m) => urls.push(`${origin}/tv/${m.id}`)));

  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n` +
    `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    urls.map((u) => `  <url><loc>${u}</loc></url>`).join('\n') +
    `\n</urlset>`;

  return new Response(xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=86400' },
  });
}

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

    if (url.pathname === '/sitemap.xml') return sitemap(env, url);

    const m = url.pathname.match(TITLE_ROUTE);
    if (m) {
      const page = await titlePage(env, url, m[1], m[2]);
      if (page) return page;
    }

    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  },
};
