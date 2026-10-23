import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation, useParams, useRoute } from 'wouter';
import { ArrowRight, CalendarDays, CircleAlert, Clapperboard, Film, Languages, Moon, Play, Search, Star, Sun, Tv } from 'lucide-react';
import {
  useGetCinemaHome, useDiscoverCinemaTitles, useSearchCinema, useGetCinemaGenres, useGetCinemaTitle,
  useGetCinemaPerson, useGetCinemaSeason, getDiscoverCinemaTitlesQueryKey, getSearchCinemaQueryKey,
  getGetCinemaGenresQueryKey, getGetCinemaTitleQueryKey, getGetCinemaPersonQueryKey, getGetCinemaSeasonQueryKey,
} from '@workspace/api-client-react';
import type { MediaItem, MediaDetails, PersonDetails } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import '../src/index.css';

const client = new QueryClient();
const img = (path?: string | null, size = 'w500') => path ? `https://image.tmdb.org/t/p/${size}${path}` : '';
const titleOf = (item: Partial<MediaItem> | Record<string, unknown>) => String(item.title || item.name || item.original_title || item.original_name || 'Untitled');
const dateOf = (item: Partial<MediaItem> | Record<string, unknown>) => String(item.release_date || item.first_air_date || '');
const yearOf = (item: Partial<MediaItem> | Record<string, unknown>) => dateOf(item).slice(0, 4);
const ratingOf = (item: Partial<MediaItem> | Record<string, unknown>) => Number(item.vote_average || 0);
const entryPath = (item: Partial<MediaItem> | Record<string, unknown>, forced?: string) => {
  const kind = forced || String(item.media_type || 'movie');
  return kind === 'person' ? `/person/${item.id}` : `/${kind}/${item.id}`;
};

type Lang = 'en' | 'ar';
const copy = {
  en: { home: 'Discover', movies: 'Movies', tv: 'Series', search: 'Search', tagline: 'Find your next story.', heroEyebrow: 'Your next watch starts here', explore: 'Explore title', trending: 'The conversation', trendingSub: 'Stories people are watching right now', moviesTitle: 'Movies worth your time', tvTitle: 'Series to get into', people: 'Faces behind the stories', browse: 'Browse', films: 'Movies', shows: 'Series', topRated: 'Top rated', newest: 'Recently released', popular: 'Most popular', sort: 'Sort by', genre: 'All genres', year: 'Any year', rating: 'Any rating', country: 'Country code', results: 'titles', noResults: 'No titles found', noResultsSub: 'Try changing a filter or exploring another genre.', retry: 'Try again', searchTitle: 'Search the whole story', searchSub: 'Titles, series, and the people who bring them to life.', searchPlaceholder: 'Try a title, actor, or director…', all: 'All', titles: 'Titles', cast: 'People', overview: 'Story', castTitle: 'Cast', crew: 'Key crew', details: 'At a glance', release: 'Release date', runtime: 'Runtime', status: 'Status', language: 'Original language', images: 'Stills & artwork', trailer: 'Watch the trailer', recommendations: 'You may also like', seasons: 'Seasons', season: 'Season', episodes: 'Episodes', biography: 'Biography', filmography: 'Known for', born: 'Born', birthplace: 'Place of birth', knownFor: 'Known for', loading: 'Finding the details…', failed: 'We couldn’t load this page.', back: 'Go back', emptyBio: 'No biography is available yet.', browseMore: 'Keep exploring', page: 'Page', previous: 'Previous', next: 'Next', noImage: 'No artwork available', castRole: 'as', watchProviders: 'Where to watch', providersEmpty: 'Provider details are not available.', languageLabel: 'العربية', verified: 'Reliable details. Zero fuss.', allTime: 'A better way to find what to watch.' },
  ar: { home: 'اكتشف', movies: 'أفلام', tv: 'مسلسلات', search: 'بحث', tagline: 'حكايتك القادمة تبدأ هنا.', heroEyebrow: 'مشاهدتك القادمة تبدأ هنا', explore: 'اكتشف العمل', trending: 'حديث الجمهور', trendingSub: 'حكايات يشاهدها الناس الآن', moviesTitle: 'أفلام تستحق وقتك', tvTitle: 'مسلسلات تستحق المتابعة', people: 'وجوه وراء الحكايات', browse: 'تصفّح', films: 'أفلام', shows: 'مسلسلات', topRated: 'الأعلى تقييماً', newest: 'الأحدث', popular: 'الأكثر رواجاً', sort: 'ترتيب حسب', genre: 'كل التصنيفات', year: 'كل السنوات', rating: 'أي تقييم', country: 'رمز الدولة', results: 'أعمال', noResults: 'لم نعثر على أعمال', noResultsSub: 'جرّب تغيير الفلاتر أو استكشاف تصنيف آخر.', retry: 'حاول مجدداً', searchTitle: 'ابحث عن الحكاية كاملة', searchSub: 'أفلام ومسلسلات والأشخاص الذين يمنحونها الحياة.', searchPlaceholder: 'ابحث عن عمل أو ممثل أو مخرج…', all: 'الكل', titles: 'الأعمال', cast: 'الأشخاص', overview: 'القصة', castTitle: 'طاقم التمثيل', crew: 'فريق العمل', details: 'التفاصيل', release: 'تاريخ الإصدار', runtime: 'المدة', status: 'الحالة', language: 'اللغة الأصلية', images: 'صور ومشاهد', trailer: 'شاهد الإعلان', recommendations: 'قد يعجبك أيضاً', seasons: 'المواسم', season: 'الموسم', episodes: 'الحلقات', biography: 'نبذة', filmography: 'أعمال بارزة', born: 'تاريخ الميلاد', birthplace: 'مكان الميلاد', knownFor: 'معروف بـ', loading: 'جارٍ العثور على التفاصيل…', failed: 'تعذّر تحميل هذه الصفحة.', back: 'العودة', emptyBio: 'لا تتوفر نبذة بعد.', browseMore: 'تابع الاستكشاف', page: 'صفحة', previous: 'السابق', next: 'التالي', noImage: 'لا تتوفر صورة', castRole: 'بدور', watchProviders: 'أماكن المشاهدة', providersEmpty: 'تفاصيل المشاهدة غير متاحة.', languageLabel: 'English', verified: 'معلومات موثوقة. بلا تعقيد.', allTime: 'طريقة أسهل لاختيار ما تشاهده.' }
};

type Preferences = { lang: Lang; setLang: (lang: Lang) => void; dark: boolean; setDark: (dark: boolean) => void; t: typeof copy.en };
const PreferenceContext = createContext<Preferences | null>(null);
function PreferenceProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => (localStorage.getItem('crdb-language-v1') as Lang) || 'ar');
  const [dark, setDark] = useState(() => localStorage.getItem('crdb-theme') === 'dark');
  useEffect(() => { document.documentElement.lang = lang; document.documentElement.dir = lang === 'ar' ? 'rtl' : 'ltr'; localStorage.setItem('crdb-language-v1', lang); }, [lang]);
  useEffect(() => { document.documentElement.classList.toggle('dark', dark); localStorage.setItem('crdb-theme', dark ? 'dark' : 'light'); }, [dark]);
  return <PreferenceContext.Provider value={{ lang, setLang, dark, setDark, t: copy[lang] }}>{children}</PreferenceContext.Provider>;
}
function usePreferences() {
  const context = useContext(PreferenceContext);
  if (!context) throw new Error('PreferenceProvider is missing');
  return context;
}

function Shell({ children }: { children: ReactNode }) {
  const pref = usePreferences();
  const [loc] = useLocation();
  const nav = [{ path: '/', label: pref.t.home, icon: Clapperboard }, { path: '/movies', label: pref.t.movies, icon: Film }, { path: '/tv', label: pref.t.tv, icon: Tv }];
  return <div className="shell">
    <header className="topbar">
      <Link href="/" className="brand" data-testid="link-brand"><img src={pref.dark ? '/brand/logo.svg' : '/brand/logo-on-light.svg'} alt="CRDb" /></Link>
      <nav className="navlinks">{nav.map(n => <Link key={n.path} href={n.path} className={loc === n.path ? 'active' : ''} data-testid={`link-nav-${n.path === '/' ? 'home' : n.path.slice(1)}`}>{n.label}</Link>)}</nav>
      <div className="top-actions">
        <Link href="/search" className="icon-btn" aria-label={pref.t.search} data-testid="link-search"><Search size={17} /></Link>
        <button className="lang-btn" onClick={() => pref.setLang(pref.lang === 'en' ? 'ar' : 'en')} aria-label="Change language" data-testid="button-language"><Languages size={14} /><span>{pref.t.languageLabel}</span></button>
        <button className="icon-btn" onClick={() => pref.setDark(!pref.dark)} aria-label="Toggle theme" data-testid="button-theme">{pref.dark ? <Sun size={16} /> : <Moon size={16} />}</button>
      </div>
    </header>
    <main>{children}</main>
    <nav className="mobile-nav">{nav.concat([{ path: '/search', label: pref.t.search, icon: Search }]).map(n => <Link key={n.path} href={n.path} className={loc === n.path ? 'active' : ''} data-testid={`mobile-nav-${n.path.slice(1) || 'home'}`}><n.icon size={17} /><span>{n.label}</span></Link>)}</nav>
    <footer className="footer"><img src={pref.dark ? '/brand/logo.svg' : '/brand/logo-on-light.svg'} alt="CRDb" /><span>{pref.t.verified} · {pref.t.allTime}</span><span>© CRDb</span></footer>
  </div>;
}

function PageFrame({ children }: { children: ReactNode }) { return <div className="page">{children}</div>; }
function StateBlock({ title, text, action, onAction, error = false }: { title: string; text: string; action?: string; onAction?: () => void; error?: boolean }) {
  return <div className="state" role={error ? 'alert' : undefined}><div style={{ color: error ? 'hsl(var(--destructive))' : 'hsl(var(--primary))', marginBottom: 12 }}>{error ? <CircleAlert size={25} style={{ margin: 'auto' }} /> : <Clapperboard size={25} style={{ margin: 'auto' }} />}</div><h2>{title}</h2><p>{text}</p>{action && <button className="cta" onClick={onAction}>{action}</button>}</div>;
}
function LoadingGrid() { return <div className="media-grid">{Array.from({ length: 10 }, (_, i) => <div key={i}><div className="skeleton" style={{ aspectRatio: '2/3' }} /><div className="skeleton" style={{ height: 13, marginTop: 12, width: '80%' }} /><div className="skeleton" style={{ height: 10, marginTop: 8, width: '42%' }} /></div>)}</div>; }
function PosterCard({ item, kind, onSelect }: { item: MediaItem | Record<string, unknown>; kind?: string; onSelect?: () => void }) {
  const name = titleOf(item);
  const href = entryPath(item, kind);
  return <Link href={href} className="poster-card" onClick={onSelect} data-testid={`card-title-${String(item.id)}`}>
    <div className="poster-frame">{img(item.poster_path as string) ? <img src={img(item.poster_path as string)} alt={name} loading="lazy" /> : <div className="poster-fallback">{name}<br />—</div>}{ratingOf(item) > 0 && <span className="poster-rating"><Star size={10} fill="currentColor" /> {ratingOf(item).toFixed(1)}</span>}</div>
    <div className="poster-title">{name}</div><div className="poster-year">{yearOf(item) || '—'}</div>
  </Link>;
}
function Section({ title, subtitle, items, kind, browseLabel = copy.en.browse }: { title: string; subtitle?: string; items?: MediaItem[]; kind?: string; browseLabel?: string }) {
  if (!items?.length) return null;
  return <section className="section"><div className="section-head"><div><h2 className="section-title">{title}</h2>{subtitle && <p className="section-kicker">{subtitle}</p>}</div>{kind && <Link href={kind === 'tv' ? '/tv' : '/movies'} className="text-link">{browseLabel}<ArrowRight size={14} /></Link>}</div><div className="poster-row">{items.map(i => <PosterCard key={`${i.media_type}-${i.id}`} item={i} kind={kind} />)}</div></section>;
}

function HomePage() {
  const { lang, t } = usePreferences();
  const q = useGetCinemaHome({ language: lang });
  const hero = q.data?.hero?.[0];
  return <PageFrame>
    {q.isLoading ? <div className="skeleton" style={{ height: 470, marginTop: 22, borderRadius: 26 }} /> : q.isError ? <StateBlock error title={t.failed} text={t.noResultsSub} action={t.retry} onAction={() => q.refetch()} /> : <>
      {hero && <section className="hero">
        {img(hero.backdrop_path, 'original') && <img className="hero-image" src={img(hero.backdrop_path, 'original')} alt="" />}
        <div className="hero-content"><div className="hero-label"><span style={{ width: 7, height: 7, borderRadius: 9, background: 'currentColor' }} />{t.heroEyebrow}</div><h1>{titleOf(hero)}</h1><div className="hero-meta">{ratingOf(hero) > 0 && <span className="score"><Star size={13} fill="currentColor" /> {ratingOf(hero).toFixed(1)}</span>}<span>{yearOf(hero)}</span><span>{hero.media_type === 'tv' ? t.tv : t.movies}</span></div><p>{hero.overview || t.allTime}</p><Link href={entryPath(hero)} className="cta" data-testid="button-hero-title"><Play size={15} fill="currentColor" />{t.explore}</Link></div>
      </section>}
      {!hero && !q.data?.sections?.length && <StateBlock title={t.noResults} text={t.noResultsSub} />}
      {q.data?.sections?.map(section => <Section key={section.id} title={section.title} items={section.items} kind={section.mediaType === 'person' ? undefined : section.mediaType} browseLabel={t.browse} />)}
    </>}
  </PageFrame>;
}

function BrowsePage({ kind }: { kind: 'movie' | 'tv' }) {
  const { lang, t } = usePreferences();
  const [genreId, setGenreId] = useState(''); const [year, setYear] = useState(''); const [minRating, setMinRating] = useState(''); const [country, setCountry] = useState(''); const [sortBy, setSortBy] = useState('popularity.desc'); const [page, setPage] = useState(1);
  const genres = useGetCinemaGenres({ mediaType: kind, language: lang }, { query: { queryKey: getGetCinemaGenresQueryKey({ mediaType: kind, language: lang }) } });
  const params = { mediaType: kind, language: lang, page, ...(genreId ? { genreId: Number(genreId) } : {}), ...(year ? { year: Number(year) } : {}), ...(minRating ? { minRating: Number(minRating) } : {}), ...(country ? { country: country.toUpperCase() } : {}), sortBy: sortBy as 'popularity.desc' | 'vote_average.desc' | 'primary_release_date.desc' | 'first_air_date.desc' };
  const results = useDiscoverCinemaTitles(params, { query: { queryKey: getDiscoverCinemaTitlesQueryKey(params) } });
  const title = kind === 'movie' ? t.moviesTitle : t.tvTitle;
  const resetPage = (fn: (v: string) => void) => (v: string) => { fn(v); setPage(1); };
  return <PageFrame><div className="eyebrow">{t.browse} / {kind === 'movie' ? t.films : t.shows}</div><h1 className="page-title">{title}</h1><p className="subhead">{t.verified}</p>
    <div className="filters">
      <select aria-label={t.genre} className="field filter-select" value={genreId} onChange={e => resetPage(setGenreId)(e.target.value)} data-testid="select-genre"><option value="">{t.genre}</option>{genres.data?.genres?.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}</select>
      <select aria-label={t.sort} className="field filter-select" value={sortBy} onChange={e => resetPage(setSortBy)(e.target.value)} data-testid="select-sort"><option value="popularity.desc">{t.popular}</option><option value="vote_average.desc">{t.topRated}</option><option value={kind === 'tv' ? 'first_air_date.desc' : 'primary_release_date.desc'}>{t.newest}</option></select>
      <select aria-label={t.year} className="field filter-select" value={year} onChange={e => resetPage(setYear)(e.target.value)} data-testid="select-year"><option value="">{t.year}</option>{Array.from({ length: 36 }, (_, i) => new Date().getFullYear() - i).map(y => <option key={y} value={y}>{y}</option>)}</select>
      <select aria-label={t.rating} className="field filter-select" value={minRating} onChange={e => resetPage(setMinRating)(e.target.value)} data-testid="select-rating"><option value="">{t.rating}</option>{[6, 7, 8].map(n => <option key={n} value={n}>{n}+</option>)}</select>
      <input aria-label={t.country} className="field filter-select" value={country} onChange={e => resetPage(setCountry)(e.target.value.slice(0, 2))} placeholder={t.country} maxLength={2} data-testid="input-country" />
      <span className="filter-spacer" /><span className="result-count">{results.data?.total_results?.toLocaleString() || '—'} {t.results}</span>
    </div>
    {results.isLoading ? <LoadingGrid /> : results.isError ? <StateBlock error title={t.failed} text={t.noResultsSub} action={t.retry} onAction={() => results.refetch()} /> : results.data?.results?.length ? <><div className="media-grid">{results.data.results.map(item => <div className="grid-poster" key={item.id}><PosterCard item={item} kind={kind} /></div>)}</div><div className="pager"><button onClick={() => { setPage(Math.max(1, page - 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }} disabled={page <= 1}>{t.previous}</button><span>{t.page} {page} / {Math.max(results.data.total_pages || 1, 1)}</span><button onClick={() => { setPage(Math.min(results.data?.total_pages || page + 1, page + 1)); window.scrollTo({ top: 0, behavior: 'smooth' }); }} disabled={page >= (results.data.total_pages || 1)}>{t.next}</button></div></> : <StateBlock title={t.noResults} text={t.noResultsSub} action={t.retry} onAction={() => { setGenreId(''); setYear(''); setMinRating(''); setCountry(''); }} />}
  </PageFrame>;
}

function SearchPage() {
  const { lang, t } = usePreferences();
  const [, setLocation] = useLocation();
  const [query, setQuery] = useState(() => new URLSearchParams(window.location.search).get('q') || '');
  const [tab, setTab] = useState('all'); const [page, setPage] = useState(1);
  const params = { query: query.trim(), language: lang, page };
  const search = useSearchCinema(params, { query: { enabled: query.trim().length >= 2, queryKey: getSearchCinemaQueryKey(params) } });
  useEffect(() => { const delay = window.setTimeout(() => setLocation(query.trim() ? `/search?q=${encodeURIComponent(query.trim())}` : '/search'), 300); return () => window.clearTimeout(delay); }, [query, setLocation]);
  const filtered = useMemo(() => search.data?.results?.filter(item => tab === 'all' || (tab === 'people' ? item.media_type === 'person' : item.media_type !== 'person')) || [], [search.data, tab]);
  return <PageFrame><div className="eyebrow">{t.search}</div><h1 className="page-title">{t.searchTitle}</h1><p className="subhead">{t.searchSub}</p>
    <label className="searchbox"><Search size={19} color="hsl(var(--primary))" /><input autoFocus value={query} onChange={e => { setQuery(e.target.value); setPage(1); }} placeholder={t.searchPlaceholder} data-testid="input-search" /><span style={{ color: 'hsl(var(--muted-foreground))' }}>⌘ K</span></label>
    {query.trim().length >= 2 && <><div className="tabs">{[['all', t.all], ['titles', t.titles], ['people', t.cast]].map(([id, label]) => <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)} data-testid={`tab-search-${id}`}>{label}</button>)}</div>
      {search.isLoading ? <LoadingGrid /> : search.isError ? <StateBlock error title={t.failed} text={t.noResultsSub} action={t.retry} onAction={() => search.refetch()} /> : filtered.length ? <><div className="media-grid">{filtered.map(item => <div className="grid-poster" key={`${item.media_type}-${item.id}`}><PosterCard item={item} kind={item.media_type || undefined} /></div>)}</div><div className="pager"><button disabled={page <= 1} onClick={() => setPage(page - 1)}>{t.previous}</button><span>{t.page} {page} / {search.data?.total_pages || 1}</span><button disabled={page >= (search.data?.total_pages || 1)} onClick={() => setPage(page + 1)}>{t.next}</button></div></> : <StateBlock title={t.noResults} text={t.noResultsSub} />}
    </>}
  </PageFrame>;
}

function DetailPage({ kind }: { kind: 'movie' | 'tv' }) {
  const p = useParams<{ id: string }>(); const id = Number(p.id); const { lang, t } = usePreferences();
  const params = { mediaType: kind, id, language: lang };
  const q = useGetCinemaTitle(params, { query: { enabled: Number.isFinite(id) && id > 0, queryKey: getGetCinemaTitleQueryKey(params) } });
  const [seasonNo, setSeasonNo] = useState<number | null>(null);
  const title = q.data as MediaDetails | undefined;
  const seasons = (title?.seasons as Array<Record<string, unknown>> | undefined) || [];
  useEffect(() => { setSeasonNo(null); }, [id]);
  const seasonParams = { id, seasonNumber: seasonNo ?? 0, language: lang };
  const season = useGetCinemaSeason(seasonParams, { query: { enabled: kind === 'tv' && seasonNo !== null, queryKey: getGetCinemaSeasonQueryKey(seasonParams) } });
  const credits = title?.credits as Record<string, unknown> | undefined;
  const cast = (credits?.cast as Array<Record<string, unknown>> | undefined) || [];
  const crew = (credits?.crew as Array<Record<string, unknown>> | undefined) || [];
  const images = title?.images as Record<string, unknown> | undefined;
  const stills = ((images?.backdrops as Array<Record<string, unknown>> | undefined) || []).slice(0, 12);
  const posters = ((images?.posters as Array<Record<string, unknown>> | undefined) || []).slice(0, 8);
  const videos = title?.videos as Record<string, unknown> | undefined;
  const videoItems = (videos?.results as Array<Record<string, unknown>> | undefined) || [];
  const trailer = videoItems.find(v => v.site === 'YouTube' && (v.type === 'Trailer' || v.type === 'Teaser'));
  const recommendations = title?.recommendations as Record<string, unknown> | undefined;
  const similar = title?.similar as Record<string, unknown> | undefined;
  const recoItems = ((recommendations?.results || similar?.results || []) as MediaItem[]).slice(0, 12);
  const providers = title?.['watch/providers'] as Record<string, unknown> | undefined;
  const providerResults = providers?.results as Record<string, unknown> | undefined;
  const region = (providerResults?.US || providerResults?.GB || Object.values(providerResults || {})[0]) as Record<string, unknown> | undefined;
  const providerList = [...((region?.flatrate as Array<Record<string, unknown>>) || []), ...((region?.rent as Array<Record<string, unknown>>) || [])].slice(0, 5);
  if (q.isLoading) return <PageFrame><div className="skeleton" style={{ height: 400 }} /><div className="skeleton" style={{ height: 230, marginTop: 24 }} /></PageFrame>;
  if (q.isError || !title) return <PageFrame><StateBlock error title={t.failed} text={t.noResultsSub} action={t.retry} onAction={() => q.refetch()} /></PageFrame>;
  const genres = (title.genres as Array<{ id: number; name: string }> | undefined) || [];
  const recommendationsLinkKind = kind;
  return <div className="page" style={{ paddingTop: 38 }}>
    <section className="detail-hero">{img(title.backdrop_path as string, 'original') && <img className="detail-backdrop" src={img(title.backdrop_path as string, 'original')} alt="" />}
      <div className="detail-head">{img(title.poster_path as string) ? <img className="detail-poster" src={img(title.poster_path as string)} alt={titleOf(title)} /> : <div className="detail-poster" />}
        <div><div className="eyebrow">{kind === 'movie' ? t.movies : t.tv}</div><h1 className="detail-title">{titleOf(title)}</h1><div className="detail-meta">{ratingOf(title) > 0 && <span className="score"><Star size={13} fill="currentColor" /> {ratingOf(title).toFixed(1)} ({Number(title.vote_count || 0).toLocaleString()})</span>}<span><CalendarDays size={13} style={{ verticalAlign: 'middle' }} /> {dateOf(title) || '—'}</span>{typeof title.runtime === 'number' && <span>{title.runtime} min</span>}{typeof title.number_of_seasons === 'number' && <span>{title.number_of_seasons} {t.seasons.toLowerCase()}</span>}</div><p className="detail-overview">{String(title.overview || '')}</p><div className="genre-pills">{genres.map(g => <span key={g.id}>{g.name}</span>)}</div></div>
      </div>
    </section>
    <div className="detail-body"><div className="detail-columns"><div>
      <section className="section"><div className="section-head"><div><h2 className="section-title">{t.castTitle}</h2><p className="section-kicker">{t.crew}</p></div></div>{cast.length ? <div className="cast-row">{cast.slice(0, 18).map((person, i) => <Link href={`/person/${person.id}`} className="cast-card" key={`${person.id}-${i}`} data-testid={`link-cast-${person.id}`}>{img(person.profile_path as string, 'w185') ? <img className="cast-photo" src={img(person.profile_path as string, 'w185')} alt={String(person.name)} loading="lazy" /> : <div className="cast-photo" /> }<div className="cast-name">{String(person.name || '')}</div><div className="cast-role">{t.castRole} {String(person.character || '')}</div></Link>)}</div> : <p className="subhead">—</p>}</section>
      {crew.length > 0 && <section className="section"><h2 className="section-title">{t.crew}</h2><div className="cast-row" style={{ marginTop: 17 }}>{crew.filter(c => ['Director', 'Writer', 'Executive Producer', 'Creator'].includes(String(c.job))).slice(0, 12).map((person, i) => <Link href={`/person/${person.id}`} className="cast-card" key={`${person.id}-${i}`}>{img(person.profile_path as string, 'w185') ? <img className="cast-photo" src={img(person.profile_path as string, 'w185')} alt={String(person.name)} loading="lazy" /> : <div className="cast-photo" />}<div className="cast-name">{String(person.name)}</div><div className="cast-role">{String(person.job)}</div></Link>)}</div></section>}
      {trailer && <section className="section"><h2 className="section-title">{t.trailer}</h2><iframe className="video-frame" src={`https://www.youtube-nocookie.com/embed/${String(trailer.key)}`} title={`${titleOf(title)} trailer`} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /></section>}
      {(stills.length + posters.length) > 0 && <section className="section"><h2 className="section-title">{t.images}</h2><div className="image-strip" style={{ marginTop: 17 }}>{[...stills, ...posters].map((image, i) => <img key={i} src={img(image.file_path as string, 'w500')} alt="" loading="lazy" />)}</div></section>}
      {kind === 'tv' && seasons.length > 0 && <section className="section"><div className="section-head"><div><h2 className="section-title">{t.seasons}</h2></div><select className="field" aria-label={t.season} value={seasonNo ?? ''} onChange={e => setSeasonNo(e.target.value === '' ? null : Number(e.target.value))} data-testid="select-season"><option value="">{t.seasons}</option>{seasons.map(s => <option key={String(s.id)} value={Number(s.season_number)}>{String(s.name || `${t.season} ${s.season_number}`)}</option>)}</select></div>
        {seasonNo !== null && (season.isLoading ? <div className="skeleton" style={{ height: 160 }} /> : season.isError ? <StateBlock error title={t.failed} text={t.noResultsSub} action={t.retry} onAction={() => season.refetch()} /> : <div className="episode-list">{((season.data?.episodes || []) as Array<Record<string, unknown>>).map((episode, i) => <article className="episode" key={String(episode.id || i)}>{img(episode.still_path as string, 'w300') ? <img src={img(episode.still_path as string, 'w300')} alt="" /> : <div className="skeleton" />}<div><h3>{String(episode.episode_number || i + 1)}. {String(episode.name || '')}</h3><p>{String(episode.air_date || '')} · {String(episode.runtime || '')} min</p><p>{String(episode.overview || '')}</p></div></article>)}</div>)}</section>}
      {providerList.length > 0 && <section className="section"><h2 className="section-title">{t.watchProviders}</h2><div style={{ display: 'flex', gap: 12, marginTop: 15, flexWrap: 'wrap' }}>{providerList.map((v, i) => <div key={i} style={{ textAlign: 'center', fontSize: 10, width: 65 }}>{img(v.logo_path as string, 'w92') && <img src={img(v.logo_path as string, 'w92')} alt={String(v.provider_name)} style={{ width: 46, height: 46, objectFit: 'cover', borderRadius: 12, display: 'block', margin: '0 auto 6px' }} />}{String(v.provider_name)}</div>)}</div></section>}
      {recoItems.length > 0 && <Section title={t.recommendations} items={recoItems} kind={recommendationsLinkKind} browseLabel={t.browse} />}
    </div><aside className="info-panel"><h3 style={{ margin: '0 0 5px', font: '800 17px var(--app-font-serif)' }}>{t.details}</h3>{[[t.release, dateOf(title)], [t.runtime, title.runtime ? `${title.runtime} min` : title.episode_run_time ? `${(title.episode_run_time as number[])[0]} min` : '—'], [t.status, String(title.status || '—')], [t.language, String(title.original_language || '—')], [t.knownFor, String(title.tagline || '—')]].map(([label, value]) => <div className="info-line" key={label}><strong>{label}</strong><span>{value}</span></div>)}{region && providerList.length === 0 && <div className="info-line"><strong>{t.watchProviders}</strong><span>{t.providersEmpty}</span></div>}</aside></div></div>
  </div>;
}

function PersonPage() {
  const p = useParams<{ id: string }>(); const id = Number(p.id); const { lang, t } = usePreferences();
  const params = { id, language: lang };
  const q = useGetCinemaPerson(params, { query: { enabled: Number.isFinite(id) && id > 0, queryKey: getGetCinemaPersonQueryKey(params) } });
  const person = q.data as PersonDetails | undefined;
  const credits = person?.combined_credits as Record<string, unknown> | undefined;
  const filmography = ((credits?.cast as MediaItem[] | undefined) || []).slice().sort((a, b) => (dateOf(b) || '').localeCompare(dateOf(a) || ''));
  if (q.isLoading) return <PageFrame><div className="skeleton" style={{ height: 400 }} /></PageFrame>;
  if (q.isError || !person) return <PageFrame><StateBlock error title={t.failed} text={t.noResultsSub} action={t.retry} onAction={() => q.refetch()} /></PageFrame>;
  return <PageFrame><div className="person-layout"><div>{img(person.profile_path, 'h632') ? <img className="person-photo" src={img(person.profile_path, 'h632')} alt={person.name} /> : <div className="person-photo" />}</div><div><div className="eyebrow">{t.people}</div><h1 className="page-title">{person.name}</h1><div className="detail-meta" style={{ color: 'hsl(var(--muted-foreground))' }}>{person.known_for_department && <span>{person.known_for_department}</span>}{person.birthday && <span>{t.born}: {person.birthday}</span>}{person.place_of_birth && <span>{t.birthplace}: {person.place_of_birth}</span>}</div><h2 className="section-title" style={{ marginTop: 27 }}>{t.biography}</h2><p className="bio">{person.biography || t.emptyBio}</p></div></div>
    {filmography.length > 0 && <section className="section"><div className="section-head"><h2 className="section-title">{t.filmography}</h2></div><div className="filmography">{filmography.map(item => <div className="grid-poster" key={`${item.media_type}-${item.id}`}><PosterCard item={item} kind={item.media_type || 'movie'} /></div>)}</div></section>}
  </PageFrame>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Shell><Switch>
    <Route path="/" component={HomePage} />
    <Route path="/movies"><BrowsePage kind="movie" /></Route>
    <Route path="/tv"><BrowsePage kind="tv" /></Route>
    <Route path="/search" component={SearchPage} />
    <Route path="/movie/:id"><DetailPage kind="movie" /></Route>
    <Route path="/tv/:id"><DetailPage kind="tv" /></Route>
    <Route path="/person/:id" component={PersonPage} />
    <Route component={NotFound} />
  </Switch></Shell></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={client}><TooltipProvider><PreferenceProvider><Router /></PreferenceProvider><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
