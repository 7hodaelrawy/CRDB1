// @ts-nocheck
const getKey = (env) => (env.TMDB_KEY || env.TMDB_API_KEY || '').trim();

async function tmdbGet(env, path, params = {}) {
  const target = new URL('https://api.themoviedb.org/3' + path);
  Object.entries(params).forEach(([k, v]) => target.searchParams.set(k, String(v)));
  const key = getKey(env);
  const headers = {};
  if (key.length > 40) headers.Authorization = `Bearer ${key}`;
  else target.searchParams.set('api_key', key);
  const res = await fetch(target.toString(), { headers, cf: { cacheTtl: 3600, cacheEverything: true } });
  if (!res.ok) {
    const err = new Error(`TMDB ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const clip = (s, n = 155) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};
const pickLang = (request) => (/^\s*ar/i.test(request.headers.get('accept-language') || '') ? 'ar' : 'en');
const cleanPath = (p) => (p.length > 1 ? p.replace(/\/+$/, '') || '/' : p);

const PAGES = {
  '/': {
    en: ['CRDb — Movies & series, ratings, trailers and where to watch', 'Discover new releases, upcoming movies and top-rated series, with ratings, trailers, cast and where to watch in your country.'],
    ar: ['CRDb — أفلام ومسلسلات وتقييمات وأماكن المشاهدة', 'اكتشف أحدث الأفلام والمسلسلات والأعمال القادمة، مع التقييمات والإعلانات وطاقم التمثيل وأماكن المشاهدة في بلدك.'],
  },
  '/movies': {
    en: ['Movies worth your time — CRDb', 'Browse movies by genre, year, rating and country.'],
    ar: ['أفلام تستحق وقتك — CRDb', 'تصفّح الأفلام حسب التصنيف والسنة والتقييم والبلد.'],
  },
  '/tv': {
    en: ['Series to get into — CRDb', 'Browse TV series by genre, year, rating and country.'],
    ar: ['مسلسلات تستحق المتابعة — CRDb', 'تصفّح المسلسلات حسب التصنيف والسنة والتقييم والبلد.'],
  },
  '/top': {
    en: ['Top 250 movies and series — CRDb', 'The 250 best-rated movies and series, ranked by a weighted rating from viewer votes.'],
    ar: ['أفضل 250 فيلماً ومسلسلاً — CRDb', 'أفضل 250 فيلماً ومسلسلاً بتقييم الجمهور، مرتبة بتقييم موزون.'],
  },
  '/calendar': {
    en: ['Upcoming movies calendar — CRDb', 'Movies coming to theaters by release date, with a countdown for each one.'],
    ar: ['تقويم الأفلام القادمة — CRDb', 'الأفلام القادمة إلى السينما حسب تاريخ العرض مع عدّاد تنازلي لكل فيلم.'],
  },
  '/watchlist': {
    en: ['Your watchlist — CRDb', 'Titles you saved to watch later.'],
    ar: ['قائمتي — CRDb', 'أعمال حفظتها لتشاهدها لاحقاً.'],
    noindex: true,
  },
  '/search': {
    en: ['Search — CRDb', 'Search movies, series and people.'],
    ar: ['بحث — CRDb', 'ابحث عن أفلام ومسلسلات وأشخاص.'],
    noindex: true,
  },
};

function headHtml(m, origin, path, lang) {
  const url = origin + path;
  const tags = [
    `<meta name="description" content="${esc(m.description)}">`,
    `<link rel="canonical" href="${esc(url)}">`,
    m.noindex
      ? '<meta name="robots" content="noindex,follow">'
      : '<meta name="robots" content="index,follow,max-image-preview:large">',
    '<meta property="og:site_name" content="CRDb">',
    `<meta property="og:type" content="${esc(m.ogType || 'website')}">`,
    `<meta property="og:title" content="${esc(m.title)}">`,
    `<meta property="og:description" content="${esc(m.description)}">`,
    `<meta property="og:url" content="${esc(url)}">`,
    `<meta property="og:locale" content="${lang === 'ar' ? 'ar_AR' : 'en_US'}">`,
    m.image ? `<meta property="og:image" content="${esc(m.image)}">` : '',
    `<meta name="twitter:card" content="${m.image ? 'summary_large_image' : 'summary'}">`,
    `<meta name="twitter:title" content="${esc(m.title)}">`,
    `<meta name="twitter:description" content="${esc(m.description)}">`,
    m.image ? `<meta name="twitter:image" content="${esc(m.image)}">` : '',
  ];
  if (m.jsonld) {
    tags.push(`<script type="application/ld+json">${JSON.stringify(m.jsonld).replace(/</g, '\\u003c')}</script>`);
  }
  return tags.filter(Boolean).join('\n');
}

async function shell(request, env, m, lang, status = 200) {
  const url = new URL(request.url);
  const path = cleanPath(url.pathname);
  const base = await env.ASSETS.fetch(new Request(new URL('/', url).toString()));
  const head = headHtml(m, url.origin, path, lang);
  const out = new HTMLRewriter()
    .on('html', {
      element(e) {
        e.setAttribute('lang', lang);
        e.setAttribute('dir', lang === 'ar' ? 'rtl' : 'ltr');
      },
    })
    .on('title', { element(e) { e.setInnerContent(m.title); } })
    .on('meta[name="description"]', { element(e) { e.remove(); } })
    .on('meta[name="robots"]', { element(e) { e.remove(); } })
    .on('meta[property^="og:"]', { element(e) { e.remove(); } })
    .on('meta[name^="twitter:"]', { element(e) { e.remove(); } })
    .on('link[rel="canonical"]', { element(e) { e.remove(); } })
    .on('head', { element(e) { e.append(head, { html: true }); } })
    .on('body', {
      element(e) {
        if (m.body) e.append(`<noscript>${m.body}</noscript>`, { html: true });
      },
    })
    .transform(base);
  return new Response(out.body, {
    status,
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'public, max-age=300',
      vary: 'Accept-Language',
    },
  });
}

async function renderDetail(request, env, kind, id, lang) {
  const url = new URL(request.url);
  const path = cleanPath(url.pathname);
  let d;
  try {
    d = await tmdbGet(env, `/${kind}/${id}`, { language: lang });
  } catch (err) {
    const notFound = err && err.status === 404;
    const m = {
      title: notFound ? 'Not found — CRDb' : PAGES['/'][lang][0],
      description: PAGES['/'][lang][1],
      noindex: true,
    };
    return shell(request, env, m, lang, notFound ? 404 : 200);
  }
  const name = d.title || d.name || d.original_title || d.original_name || 'Untitled';
  const date = d.release_date || d.first_air_date || '';
  const year = date.slice(0, 4);
  const label = `${name}${year ? ` (${year})` : ''}`;
  const genres = (d.genres || []).map((g) => g.name);
  const description =
    clip(d.overview) ||
    (lang === 'ar'
      ? `${label} — التقييمات وطاقم التمثيل والإعلان وأماكن المشاهدة على CRDb.`
      : `${label} — ratings, cast, trailer and where to watch on CRDb.`);
  const image = d.backdrop_path
    ? `https://image.tmdb.org/t/p/w1280${d.backdrop_path}`
    : d.poster_path
      ? `https://image.tmdb.org/t/p/w500${d.poster_path}`
      : '';
  const jsonld = {
    '@context': 'https://schema.org',
    '@type': kind === 'movie' ? 'Movie' : 'TVSeries',
    name,
    url: url.origin + path,
    description: d.overview || undefined,
    image: d.poster_path ? `https://image.tmdb.org/t/p/w500${d.poster_path}` : undefined,
    datePublished: date || undefined,
    genre: genres.length ? genres : undefined,
    numberOfSeasons: kind === 'tv' ? d.number_of_seasons || undefined : undefined,
  };
  const body =
    `<h1>${esc(label)}</h1>` +
    (d.poster_path ? `<img src="https://image.tmdb.org/t/p/w342${d.poster_path}" alt="${esc(name)}">` : '') +
    `<p>${esc(d.overview || '')}</p>` +
    (genres.length ? `<p>${esc(genres.join(' · '))}</p>` : '');
  return shell(
    request,
    env,
    { title: `${label} — CRDb`, description, image, ogType: kind === 'movie' ? 'video.movie' : 'video.tv_show', jsonld, body },
    lang,
  );
}

async function renderPerson(request, env, id, lang) {
  const url = new URL(request.url);
  const path = cleanPath(url.pathname);
  let d;
  try {
    d = await tmdbGet(env, `/person/${id}`, { language: lang });
  } catch (err) {
    const notFound = err && err.status === 404;
    const m = {
      title: notFound ? 'Not found — CRDb' : PAGES['/'][lang][0],
      description: PAGES['/'][lang][1],
      noindex: true,
    };
    return shell(request, env, m, lang, notFound ? 404 : 200);
  }
  const name = d.name || 'Unknown';
  const description =
    clip(d.biography) ||
    (lang === 'ar' ? `${name} — السيرة والأعمال على CRDb.` : `${name} — biography and filmography on CRDb.`);
  const image = d.profile_path ? `https://image.tmdb.org/t/p/h632${d.profile_path}` : '';
  const jsonld = {
    '@context': 'https://schema.org',
    '@type': 'Person',
    name,
    url: url.origin + path,
    description: d.biography ? clip(d.biography, 500) : undefined,
    image: image || undefined,
    birthDate: d.birthday || undefined,
    birthPlace: d.place_of_birth || undefined,
    jobTitle: d.known_for_department || undefined,
  };
  const body = `<h1>${esc(name)}</h1>${image ? `<img src="${esc(image)}" alt="${esc(name)}">` : ''}<p>${esc(clip(d.biography, 600))}</p>`;
  return shell(request, env, { title: `${name} — CRDb`, description, image, ogType: 'profile', jsonld, body }, lang);
}

async function sitemap(env, origin) {
  const statics = ['/', '/movies', '/tv', '/top', '/calendar'];
  const jobs = [];
  for (const kind of ['movie', 'tv']) {
    for (const list of ['top_rated', 'popular']) {
      for (const page of [1, 2, 3, 4, 5]) {
        jobs.push(
          tmdbGet(env, `/${kind}/${list}`, { page })
            .then((r) => (r.results || []).map((i) => `/${kind}/${i.id}`))
            .catch(() => []),
        );
      }
    }
  }
  const found = (await Promise.all(jobs)).flat();
  const paths = Array.from(new Set([...statics, ...found]));
  const xml =
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
    paths.map((p) => `<url><loc>${esc(origin + p)}</loc></url>`).join('\n') +
    `\n</urlset>`;
  return new Response(xml, {
    headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=86400' },
  });
}

/* ====================== الحسابات والتقييمات (D1) ====================== */

const json = (data, status = 200, extra = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });

const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100000;
const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const enc = new TextEncoder();

const toB64 = (buf) => {
  let s = '';
  new Uint8Array(buf).forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s);
};
const fromB64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const toHex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const sha256Hex = async (s) => toHex(await crypto.subtle.digest('SHA-256', enc.encode(s)));

function safeEqual(a, b) {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function pbkdf2(password, salt, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
}
async function makeHash(password) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const bits = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toB64(salt)}$${toB64(bits)}`;
}
async function checkHash(password, stored) {
  const [scheme, iters, salt, hash] = String(stored).split('$');
  if (scheme !== 'pbkdf2') return false;
  const bits = await pbkdf2(password, fromB64(salt), Number(iters));
  return safeEqual(toB64(bits), hash);
}
const DUMMY_HASH = 'pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=';

const SCHEMA = [
  'CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY AUTOINCREMENT, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, pass_hash TEXT NOT NULL, created_at INTEGER NOT NULL)',
  'CREATE TABLE IF NOT EXISTS sessions (token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL, expires_at INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions (user_id)',
  'CREATE TABLE IF NOT EXISTS ratings (user_id INTEGER NOT NULL, media_type TEXT NOT NULL, media_id INTEGER NOT NULL, rating INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY (user_id, media_type, media_id))',
  'CREATE INDEX IF NOT EXISTS idx_ratings_media ON ratings (media_type, media_id)',
  'CREATE TABLE IF NOT EXISTS attempts (ip TEXT NOT NULL, ts INTEGER NOT NULL)',
  'CREATE INDEX IF NOT EXISTS idx_attempts_ip ON attempts (ip, ts)',
];
let schemaReady = null;
function ensureSchema(env) {
  if (!schemaReady) {
    schemaReady = env.DB.batch(SCHEMA.map((s) => env.DB.prepare(s))).catch((e) => {
      schemaReady = null;
      throw e;
    });
  }
  return schemaReady;
}

function getCookie(request, name) {
  const hit = (request.headers.get('cookie') || '').split(/;\s*/).find((c) => c.startsWith(name + '='));
  return hit ? hit.slice(name.length + 1) : '';
}
const cookieHeader = (value, maxAge) => `crdb_session=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;

async function currentUser(env, request) {
  const token = getCookie(request, 'crdb_session');
  if (!token || token.length > 100) return null;
  const hash = await sha256Hex(token);
  return env.DB
    .prepare('SELECT u.id AS id, u.name AS name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ?')
    .bind(hash, Date.now())
    .first();
}

async function startSession(env, userId) {
  const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
  const hash = await sha256Hex(token);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
    env.DB.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').bind(hash, userId, now + SESSION_DAYS * 86400000),
  ]);
  return cookieHeader(token, SESSION_DAYS * 86400);
}

async function throttled(env, request) {
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const now = Date.now();
  const row = await env.DB.prepare('SELECT COUNT(*) AS c FROM attempts WHERE ip = ? AND ts > ?').bind(ip, now - 600000).first();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO attempts (ip, ts) VALUES (?, ?)').bind(ip, now),
    env.DB.prepare('DELETE FROM attempts WHERE ts < ?').bind(now - 3600000),
  ]);
  return Number((row && row.c) || 0) >= 20;
}

async function readJson(request) {
  if (Number(request.headers.get('content-length') || 0) > 4096) return null;
  try {
    const body = await request.json();
    return body && typeof body === 'object' ? body : null;
  } catch {
    return null;
  }
}

function parseMedia(type, id) {
  const t = String(type);
  const n = Number(id);
  if ((t !== 'movie' && t !== 'tv') || !Number.isInteger(n) || n < 1 || n > 99999999) return null;
  return { type: t, id: n };
}

async function handleApi(request, env, url, path) {
  if (!env.DB) {
    if (path === '/api/me') return json({ user: null, enabled: false });
    return json({ error: 'db_not_configured' }, 503);
  }
  try {
    await ensureSchema(env);
    const method = request.method;
    if (method !== 'GET' && method !== 'HEAD' && request.headers.get('origin') !== url.origin) {
      return json({ error: 'forbidden' }, 403);
    }

    if (path === '/api/me' && method === 'GET') {
      const user = await currentUser(env, request);
      return json({ user: user ? { id: user.id, name: user.name } : null, enabled: true });
    }

    if (path === '/api/auth/signup' && method === 'POST') {
      if (await throttled(env, request)) return json({ error: 'too_many_attempts' }, 429);
      const body = await readJson(request);
      if (!body) return json({ error: 'generic' }, 400);
      const email = String(body.email || '').trim().toLowerCase();
      const name = String(body.name || '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
      const password = String(body.password || '');
      if (!EMAIL_RE.test(email) || email.length > 254) return json({ error: 'invalid_email' }, 400);
      if (name.length < 2 || name.length > 30) return json({ error: 'invalid_name' }, 400);
      if (password.length < 8 || password.length > 128) return json({ error: 'weak_password' }, 400);
      const passHash = await makeHash(password);
      let userId;
      try {
        const r = await env.DB
          .prepare('INSERT INTO users (email, name, pass_hash, created_at) VALUES (?, ?, ?, ?)')
          .bind(email, name, passHash, Date.now())
          .run();
        userId = r.meta.last_row_id;
      } catch (e) {
        if (/UNIQUE/i.test(String((e && (e.message || e)) || ''))) return json({ error: 'email_taken' }, 409);
        throw e;
      }
      const cookie = await startSession(env, userId);
      return json({ user: { id: userId, name } }, 200, { 'set-cookie': cookie });
    }

    if (path === '/api/auth/login' && method === 'POST') {
      if (await throttled(env, request)) return json({ error: 'too_many_attempts' }, 429);
      const body = await readJson(request);
      if (!body) return json({ error: 'generic' }, 400);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      if (!email || email.length > 254 || password.length > 128) return json({ error: 'invalid_credentials' }, 401);
      const row = await env.DB.prepare('SELECT id, name, pass_hash FROM users WHERE email = ?').bind(email).first();
      const ok = await checkHash(password, row ? row.pass_hash : DUMMY_HASH);
      if (!row || !ok) return json({ error: 'invalid_credentials' }, 401);
      const cookie = await startSession(env, row.id);
      return json({ user: { id: row.id, name: row.name } }, 200, { 'set-cookie': cookie });
    }

    if (path === '/api/auth/logout' && method === 'POST') {
      const token = getCookie(request, 'crdb_session');
      if (token && token.length <= 100) {
        await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run();
      }
      return json({ ok: true }, 200, { 'set-cookie': cookieHeader('', 0) });
    }

    if (path === '/api/crdb/rating' && method === 'GET') {
      const m = parseMedia(url.searchParams.get('type'), url.searchParams.get('id'));
      if (!m) return json({ error: 'bad_request' }, 400);
      const agg = await env.DB
        .prepare('SELECT COUNT(*) AS c, AVG(rating) AS a FROM ratings WHERE media_type = ? AND media_id = ?')
        .bind(m.type, m.id)
        .first();
      const user = await currentUser(env, request);
      let mine = null;
      if (user) {
        const r = await env.DB
          .prepare('SELECT rating FROM ratings WHERE user_id = ? AND media_type = ? AND media_id = ?')
          .bind(user.id, m.type, m.id)
          .first();
        mine = r ? r.rating : null;
      }
      const count = agg ? Number(agg.c) : 0;
      return json({ avg: count ? Math.round(Number(agg.a) * 10) / 10 : null, count, mine });
    }

    if (path === '/api/crdb/rating' && method === 'POST') {
      const user = await currentUser(env, request);
      if (!user) return json({ error: 'unauthorized' }, 401);
      const body = await readJson(request);
      const m = body && parseMedia(body.type, body.id);
      const rating = body ? Number(body.rating) : NaN;
      if (!m || !Number.isInteger(rating) || rating < 1 || rating > 10) return json({ error: 'bad_request' }, 400);
      try {
        await tmdbGet(env, `/${m.type}/${m.id}`);
      } catch (e) {
        if (e && e.status === 404) return json({ error: 'not_found' }, 404);
      }
      await env.DB
        .prepare(
          'INSERT INTO ratings (user_id, media_type, media_id, rating, updated_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(user_id, media_type, media_id) DO UPDATE SET rating = excluded.rating, updated_at = excluded.updated_at',
        )
        .bind(user.id, m.type, m.id, rating, Date.now())
        .run();
      return json({ ok: true });
    }

    if (path === '/api/crdb/rating' && method === 'DELETE') {
      const user = await currentUser(env, request);
      if (!user) return json({ error: 'unauthorized' }, 401);
      const m = parseMedia(url.searchParams.get('type'), url.searchParams.get('id'));
      if (!m) return json({ error: 'bad_request' }, 400);
      await env.DB
        .prepare('DELETE FROM ratings WHERE user_id = ? AND media_type = ? AND media_id = ?')
        .bind(user.id, m.type, m.id)
        .run();
      return json({ ok: true });
    }

    return json({ error: 'not_found' }, 404);
  } catch (e) {
    console.error('api error', e && (e.stack || e.message || e));
    return json({ error: 'generic' }, 500);
  }
}

/* ============================ المدخل الرئيسي ============================ */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = cleanPath(url.pathname);
    const isRead = request.method === 'GET' || request.method === 'HEAD';

    if (path === '/robots.txt') {
      const txt = `User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /search\nDisallow: /watchlist\n\nSitemap: ${url.origin}/sitemap.xml\n`;
      return new Response(txt, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
    }

    if (path === '/sitemap.xml') return sitemap(env, url.origin);

    // بلد الزائر (Cloudflare بيحدده تلقائياً)
    if (path === '/api/country') {
      const cf = request.cf;
      return Response.json({ country: (cf && cf.country) || null }, { headers: { 'cache-control': 'private, max-age=3600' } });
    }

    if (path.startsWith('/api/tmdb/')) {
      const target = new URL('https://api.themoviedb.org/3/' + path.slice('/api/tmdb/'.length));
      url.searchParams.forEach((v, k) => target.searchParams.set(k, v));
      const key = getKey(env);
      const headers = {};
      if (key.length > 40) headers.Authorization = `Bearer ${key}`;
      else target.searchParams.set('api_key', key);
      const res = await fetch(target.toString(), { headers, cf: { cacheTtl: 300, cacheEverything: true } });
      return new Response(res.body, {
        status: res.status,
        headers: { 'content-type': 'application/json', 'cache-control': 'public, max-age=300' },
      });
    }

    if (path.startsWith('/api/')) return handleApi(request, env, url, path);

    if (path.startsWith('/img/')) {
      const res = await fetch('https://image.tmdb.org/t/p/' + path.slice(5), { cf: { cacheTtl: 86400, cacheEverything: true } });
      return new Response(res.body, {
        status: res.status,
        headers: { 'content-type': res.headers.get('content-type') || 'image/jpeg', 'cache-control': 'public, max-age=86400' },
      });
    }

    if (isRead) {
      const lang = pickLang(request);
      const detail = path.match(/^\/(movie|tv)\/(\d+)$/);
      if (detail) return renderDetail(request, env, detail[1], detail[2], lang);
      const person = path.match(/^\/person\/(\d+)$/);
      if (person) return renderPerson(request, env, person[1], lang);
      const page = PAGES[path];
      if (page) {
        const [title, description] = page[lang];
        return shell(
          request,
          env,
          { title, description, noindex: !!page.noindex, image: `${url.origin}/og-image.png` },
          lang,
        );
      }
    }

    return env.ASSETS.fetch(request);
  },
};
