interface D1Stmt {
  bind(...values: unknown[]): D1Stmt;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<unknown>;
}
interface D1Like {
  prepare(query: string): D1Stmt;
}

interface Env {
  TMDB_KEY?: string;
  TMDB_API_KEY?: string;
  ASSETS?: { fetch: (request: Request) => Promise<Response> };
  DB?: D1Like;
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
// الدول العربية (لحساب تقييم الجمهور العربي)
const ARAB_COUNTRIES = [
  'EG', 'SA', 'AE', 'KW', 'QA', 'BH', 'OM', 'JO', 'LB', 'SY', 'IQ',
  'PS', 'YE', 'LY', 'TN', 'DZ', 'MA', 'SD', 'MR', 'SO', 'DJ', 'KM',
];
const ARAB_SQL = ARAB_COUNTRIES.map((c) => `'${c}'`).join(',');

const getKey = (env: Env) => (env.TMDB_KEY || env.TMDB_API_KEY || '').trim();

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const clip = (s: string, n = 160) => {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
};

const jsonResponse = (data: unknown, status = 200, extra?: Record<string, string>) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...(extra || {}) },
  });

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

// ===== التقييمات (D1) =====
const round1 = (x: number) => Math.round(x * 10) / 10;

function getVisitor(request: Request): string | null {
  const m = (request.headers.get('cookie') || '').match(/(?:^|;\s*)nv_vid=([A-Za-z0-9-]{16,64})/);
  return m ? m[1] : null;
}

async function ratingStats(db: D1Like, kind: string, id: number, visitor: string | null) {
  const row = await db
    .prepare(
      `SELECT COUNT(*) AS n,
              AVG(score) AS avg,
              SUM(CASE WHEN country IN (${ARAB_SQL}) THEN 1 ELSE 0 END) AS an,
              AVG(CASE WHEN country IN (${ARAB_SQL}) THEN score END) AS aavg
       FROM ratings WHERE kind = ? AND tmdb_id = ?`,
    )
    .bind(kind, id)
    .first<{ n: number; avg: number | null; an: number | null; aavg: number | null }>();

  const mine = visitor
    ? await db
        .prepare('SELECT score FROM ratings WHERE kind = ? AND tmdb_id = ? AND visitor = ?')
        .bind(kind, id, visitor)
        .first<{ score: number }>()
    : null;

  return {
    count: row?.n ?? 0,
    avg: row?.avg != null ? round1(row.avg) : null,
    arabCount: row?.an ?? 0,
    arabAvg: row?.aavg != null ? round1(row.aavg) : null,
    mine: mine?.score ?? null,
  };
}

async function getRating(request: Request, env: Env, kind: string, id: number): Promise<Response> {
  if (!env.DB) return jsonResponse({ error: 'db_not_configured' }, 503);
  return jsonResponse(await ratingStats(env.DB, kind, id, getVisitor(request)));
}

async function postRating(request: Request, env: Env, url: URL): Promise<Response> {
  if (!env.DB) return jsonResponse({ error: 'db_not_configured' }, 503);

  const origin = request.headers.get('origin');
  if (origin && origin !== url.origin) return jsonResponse({ error: 'forbidden' }, 403);

  let body: { kind?: unknown; id?: unknown; score?: unknown };
  try {
    body = (await request.json()) as { kind?: unknown; id?: unknown; score?: unknown };
  } catch {
    return jsonResponse({ error: 'bad_request' }, 400);
  }

  const kind = body.kind;
  const id = Number(body.id);
  const score = Number(body.score);
  if (
    (kind !== 'movie' && kind !== 'tv') ||
    !Number.isInteger(id) || id < 1 || id > 100000000 ||
    !Number.isInteger(score) || score < 1 || score > 10
  ) {
    return jsonResponse({ error: 'bad_request' }, 400);
  }

  // نتأكد إن الفيلم/المسلسل موجود فعلاً (عشان مفيش أرقام عشوائية تتخزن)
  if (!(await tmdb(env, `${kind}/${id}`))) return jsonResponse({ error: 'not_found' }, 404);

  let visitor = getVisitor(request);
  const isNew = !visitor;
  if (!visitor) visitor = crypto.randomUUID();

  const cf = (request as unknown as { cf?: { country?: string } }).cf;
  const country = cf?.country || null;
  const now = Math.floor(Date.now() / 1000);

  await env.DB.prepare(
    `INSERT INTO ratings (kind, tmdb_id, visitor, score, country, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (kind, tmdb_id, visitor)
     DO UPDATE SET score = excluded.score, country = excluded.country, updated_at = excluded.updated_at`,
  )
    .bind(kind, id, visitor, score, country, now, now)
    .run();

  const stats = await ratingStats(env.DB, kind, id, visitor);
  return jsonResponse(
    stats,
    200,
    isNew ? { 'set-cookie': `nv_vid=${visitor}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax` } : undefined,
  );
}

// ===== صفحة فيلم/مسلسل: نفس الـ index.html بس بعنوان ووصف وصورة مشاركة خاصة بالعنوان =====
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

// ===== صفحة Top 250 (أفلام أو مسلسلات) =====
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

// ===== sitemap ديناميكي =====
async function sitemap(env: Env, url: URL): Promise<Response> {
  type List = { results?: { id: number }[] };
  const origin = CANONICAL_ORIGIN || url.origin;
  const pages = ['1', '2', '3', '4', '5'];
  const [movies, shows] = await Promise.all([
    Promise.all(pages.map((p) => tmdb<List>(env, 'movie/top_rated', { page: p }))),
    Promise.all(pages.map((p) => tmdb<List>(env, 'tv/top_rated', { page: p }))),
  ]);

  const urls = [`${origin}/`, `${origin}/top-movies`, `${origin}/top-tv`];
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

    // التقييمات
    const rm = url.pathname.match(/^\/api\/rating\/(movie|tv)\/(\d+)$/);
    if (rm && request.method === 'GET') return getRating(request, env, rm[1], Number(rm[2]));
    if (url.pathname === '/api/rating' && request.method === 'POST') return postRating(request, env, url);

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
