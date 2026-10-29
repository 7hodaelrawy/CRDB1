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
// صفحة Top 250 (أفلام أو مسلسلات)
async function topPage(env: Env, url: URL, kind: 'movie' | 'tv'): Promise<Response> {
  type Row = {
    id: number;
    title?: string;
    name?: string;
    vote_average: number;
    release_date?: string;
    first_air_date?: string;
    poster_path?: string | null;
  };
  type List = { results?: Row[] };

  const pages = Array.from({ length: 13 }, (_, i) => String(i + 1));
  const lists = await Promise.all(
    pages.map((p) => tmdb<List>(env, `${kind}/top_rated`, { page: p, language: 'ar' })),
  );
  const rows = lists.flatMap((l) => l?.results ?? []).slice(0, 250);
  if (!rows.length) return new Response('تعذر تحميل القائمة حالياً، حاول بعد قليل.', { status: 502 });

  const heading = kind === 'movie' ? 'أفضل 250 فيلم' : 'أفضل 250 مسلسل';
  const title = `${heading} — ${SITE_NAME}`;
  const desc =
    kind === 'movie'
      ? `قائمة أعلى 250 فيلم تقييماً حسب تصويت الجمهور على ${SITE_NAME}.`
      : `قائمة أعلى 250 مسلسل تقييماً حسب تصويت الجمهور على ${SITE_NAME}.`;
  const path = kind === 'movie' ? '/top-movies' : '/top-tv';
  const origin = CANONICAL_ORIGIN || url.origin;
  const canonical = origin + path;

  const ld = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: heading,
    itemListElement: rows.map((r, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${origin}/${kind}/${r.id}`,
    })),
  }).replace(/</g, '\\u003c');

  const items = rows
    .map((r, i) => {
      const name = r.title || r.name || '';
      const year = (r.release_date || r.first_air_date || '').slice(0, 4);
      const img = r.poster_path
        ? `<img src="/img/w92${esc(r.poster_path)}" alt="${esc(name)}" width="46" height="69" loading="lazy">`
        : '<span class="noimg"></span>';
      return `<li><span class="rank">${i + 1}</span>${img}<a href="/${kind}/${r.id}">${esc(name)}</a><span class="year">${esc(year)}</span><span class="score">★ ${r.vote_average.toFixed(1)}</span></li>`;
    })
    .join('\n');

  const html = `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<link rel="canonical" href="${esc(canonical)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="${esc(SITE_NAME)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:url" content="${esc(canonical)}">
<meta name="twitter:card" content="summary">
<script type="application/ld+json">${ld}</script>
<style>
  body{margin:0;background:#0f1115;color:#eceff4;font-family:system-ui,-apple-system,'Segoe UI',Tahoma,sans-serif}
  header,main{max-width:760px;margin:0 auto;padding:16px}
  header{display:flex;gap:16px;align-items:center;flex-wrap:wrap}
  header a{color:#8ab4ff;text-decoration:none}
  h1{font-size:1.5rem;margin:8px 16px 8px 0}
  nav{display:flex;gap:12px}
  ol{list-style:none;margin:0;padding:0}
  li{display:flex;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid #232734}
  .rank{width:2.2rem;text-align:center;color:#9aa3b2}
  img,.noimg{width:46px;height:69px;border-radius:4px;background:#232734;flex:none;object-fit:cover}
  li a{flex:1;color:#eceff4;text-decoration:none;font-weight:600}
  li a:hover{color:#8ab4ff}
  .year{color:#9aa3b2}
  .score{color:#ffc94d;min-width:3.5rem;text-align:left}
</style>
</head>
<body>
<header>
  <a href="/">${esc(SITE_NAME)}</a>
  <nav><a href="/top-movies">أفضل الأفلام</a><a href="/top-tv">أفضل المسلسلات</a></nav>
</header>
<main>
  <h1>${esc(heading)}</h1>
  <ol>
${items}
  </ol>
</main>
</body>
</html>`;

  return new Response(html, {
    headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'public, max-age=3600' },
  });
}

// sitemap ديناميكي: الصفحة الرئيسية + صفحات Top + أعلى 100 فيلم + أعلى 100 مسلسل
async function sitemap(env: Env, url: URL): Promise<Response> {
  type List = { results?: { id: number }[] };
  const origin = CANONICAL_ORIGIN || url.origin;
@@ -118,7 +221,7 @@
    Promise.all(pages.map((p) => tmdb<List>(env, 'tv/top_rated', { page: p }))),
  ]);

  const urls = [`${origin}/`];
  const urls = [`${origin}/`, `${origin}/top-movies`, `${origin}/top-tv`];
  movies.forEach((l) => l?.results?.forEach((m) => urls.push(`${origin}/movie/${m.id}`)));
  shows.forEach((l) => l?.results?.forEach((m) => urls.push(`${origin}/tv/${m.id}`)));

@@ -169,14 +272,16 @@
    }

    if (url.pathname === '/sitemap.xml') return sitemap(env, url);
    if (url.pathname === '/top-movies') return topPage(env, url, 'movie');
    if (url.pathname === '/top-tv') return topPage(env, url, 'tv');

    const m = url.pathname.match(TITLE_ROUTE);
    if (m) {
      const page = await titlePage(env, url, m[1], m[2]);
      if (page) return page;
    }

    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response('Not found', { status: 404 });
  },
};
