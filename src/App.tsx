import { createContext, Fragment, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, Route, Switch, useLocation, useParams, useRoute } from 'wouter';
import { ArrowRight, Bookmark, BookmarkCheck, BookmarkPlus, CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, CircleAlert, Clapperboard, Film, Languages, LogOut, Moon, Play, Search, Star, Sun, Trophy, Tv, UserRound, X } from 'lucide-react';
import {
  useGetCinemaHome, useGetCinemaTrailer, useGetCinemaUpcoming, useGetCinemaEpisodeRatings, useGetCinemaTop, useDiscoverCinemaTitles, useSearchCinema, useGetCinemaGenres, useGetCinemaTitle,
  useGetCinemaPerson, useGetCinemaSeason, getDiscoverCinemaTitlesQueryKey, getSearchCinemaQueryKey,
  getGetCinemaGenresQueryKey, getGetCinemaTitleQueryKey, getGetCinemaPersonQueryKey, getGetCinemaSeasonQueryKey,
} from '@workspace/api-client-react';
import type { MediaItem, MediaDetails, PersonDetails, EpisodeRating } from '@workspace/api-client-react';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import NotFound from '@/pages/not-found';
import { useWatchlist, type SavedItem } from '@/watchlist';
import '../src/index.css';

const client = new QueryClient();

class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}
async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', ...init, headers: { 'content-type': 'application/json', ...(init?.headers || {}) } });
  let data: Record<string, unknown> | null = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) throw new ApiError(res.status, String(data?.error || 'generic'));
  return data as T;
}

const img = (path?: string | null, size = 'w500') => path ? `/img/${size}${path}` : '';
const titleOf = (item: Partial<MediaItem> | Record<string, unknown>) => String(item.title || item.name || item.original_title || item.original_name || 'Untitled');
const dateOf = (item: Partial<MediaItem> | Record<string, unknown>) => String(item.release_date || item.first_air_date || '');
const yearOf = (item: Partial<MediaItem> | Record<string, unknown>) => dateOf(item).slice(0, 4);
const ratingOf = (item: Partial<MediaItem> | Record<string, unknown>) => Number(item.vote_average || 0);
const entryPath = (item: Partial<MediaItem> | Record<string, unknown>, forced?: string) => {
  const kind = forced || String(item.media_type || 'movie');
  return kind === 'person' ? `/person/${item.id}` : `/${kind}/${item.id}`;
};
const toSaved = (item: Partial<MediaItem> | Record<string, unknown>, kind?: string): Omit<SavedItem, 'added'> => ({
  id: Number(item.id),
  media_type: (kind || String(item.media_type || 'movie')) === 'tv' ? 'tv' : 'movie',
  title: titleOf(item),
  poster_path: (item.poster_path as string | null) || null,
  vote_average: ratingOf(item),
  date: dateOf(item),
});
const countryName = (code: string, lang: string) => {
  try { return new Intl.DisplayNames([lang], { type: 'region' }).of(code) || code; } catch { return code; }
};
function useVisitorCountry() {
  const [country, setCountry] = useState<string>(() => { try { return localStorage.getItem('crdb-country-v1') || ''; } catch { return ''; } });
  useEffect(() => {
    if (country) return;
    fetch('/api/country').then(r => r.json()).then(d => { if (d?.country) setCountry(String(d.country)); }).catch(() => {});
  }, [country]);
  const choose = (c: string) => { setCountry(c); try { localStorage.setItem('crdb-country-v1', c); } catch { /* ignore */ } };
  return { country, choose };
}
const daysUntil = (date: string): number | null => {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return null;
  const now = new Date();
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
};
const countdownLabel = (days: number | null, lang: 'en' | 'ar') => {
  if (days === null) return '';
  if (days <= 0) return lang === 'ar' ? 'اليوم' : 'Today';
  if (days === 1) return lang === 'ar' ? 'غداً' : 'Tomorrow';
  if (lang === 'ar') return days === 2 ? 'بعد يومين' : days <= 10 ? `بعد ${days} أيام` : `بعد ${days} يوماً`;
  return `In ${days} days`;
};
const downloadIcs = (item: Partial<MediaItem> | Record<string, unknown>) => {
  const d = String(item.release_date || '').replace(/-/g, '');
  if (d.length !== 8) return;
  const next = new Date(Date.UTC(Number(d.slice(0, 4)), Number(d.slice(4, 6)) - 1, Number(d.slice(6, 8)) + 1)).toISOString().slice(0, 10).replace(/-/g, '');
  const esc = (s: string) => s.replace(/[\\;,]/g, m => `\\${m}`).replace(/\r?\n/g, ' ');
  const stamp = `${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CRDb//Calendar//EN', 'BEGIN:VEVENT', `UID:crdb-${item.id}@crdb`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`, `SUMMARY:${esc(titleOf(item))}`, 'END:VEVENT', 'END:VCALENDAR'];
  const url = URL.createObjectURL(new Blob([lines.join('\r\n')], { type: 'text/calendar;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${titleOf(item).replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || `movie-${item.id}`}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
};
const heat = (r: number) => {
  const tt = Math.max(0, Math.min(1, (r - 5) / 4.5));
  return `hsl(${Math.round(tt * 125)} 62% 42%)`;
};

type Lang = 'en' | 'ar';
const baseCopy = {
  en: { home: 'Discover', movies: 'Movies', tv: 'Series', search: 'Search', tagline: 'Find your next story.', heroEyebrow: 'Your next watch starts here', explore: 'Explore title', trending: 'The conversation', trendingSub: 'Stories people are watching right now', moviesTitle: 'Movies worth your time', tvTitle: 'Series to get into', people: 'Faces behind the stories', browse: 'Browse', films: 'Movies', shows: 'Series', topRated: 'Top rated', newest: 'Recently released', popular: 'Most popular', sort: 'Sort by', genre: 'All genres', year: 'Any year', rating: 'Any rating', country: 'Country code', results: 'titles', noResults: 'No titles found', noResultsSub: 'Try changing a filter or exploring another genre.', retry: 'Try again', searchTitle: 'Search the whole story', searchSub: 'Titles, series, and the people who bring them to life.', searchPlaceholder: 'Try a title, actor, or director…', all: 'All', titles: 'Titles', cast: 'People', overview: 'Story', castTitle: 'Cast', crew: 'Key crew', details: 'At a glance', release: 'Release date', runtime: 'Runtime', status: 'Status', language: 'Original language', images: 'Stills & artwork', trailer: 'Watch the trailer', recommendations: 'You may also like', seasons: 'Seasons', season: 'Season', episodes: 'Episodes', biography: 'Biography', filmography: 'Known for', born: 'Born', birthplace: 'Place of birth', knownFor: 'Known for', loading: 'Finding the details…', failed: 'We couldn’t load this page.', back: 'Go back', emptyBio: 'No biography is available yet.', browseMore: 'Keep exploring', page: 'Page', previous: 'Previous', next: 'Next', noImage: 'No artwork available', castRole: 'as', watchProviders: 'Where to watch', providersEmpty: 'Provider details are not available.', languageLabel: 'العربية', verified: 'Reliable details. Zero fuss.', allTime: 'A better way to find what to watch.', watchlist: 'Watchlist', watchlistSub: 'Titles you saved to watch later. Saved on this device.', watchlistEmpty: 'Your watchlist is empty', watchlistEmptySub: 'Tap the bookmark on any title to save it here.', addWatchlist: 'Add to watchlist', inWatchlist: 'In your watchlist', wtwStream: 'Stream', wtwFree: 'Free', wtwRent: 'Rent', wtwBuy: 'Buy', wtwNoCountry: 'No listings for your country yet. Showing', wtwCredit: 'Streaming availability by JustWatch', wtwAll: 'See all options', calendar: 'Calendar', calendarTitle: 'Coming to theaters', calendarSub: 'Upcoming movies by release date, with a countdown for each one.', calendarNote: 'Dates follow TMDB and can differ by country.', addToCalendar: 'Add to your calendar', episodeRatings: 'Episode ratings', epRatingsSub: 'Every episode rated by viewers. Hover over a cell for details.', epBest: 'Best episode', epWorst: 'Lowest rated', epAvg: 'Avg', epSeasonShort: 'S', epNote: 'Ratings come from TMDB viewers; episodes with few votes can be noisy.', top: 'Top 250', topTitle: 'The 250 best-rated titles', topSub: 'Ranked by a weighted rating, so a title needs lots of votes, not just a high score.', topNote: 'Ranking is calculated by CRDb from TMDB viewer votes.', votes: 'votes', showMore: 'Show more' },
  ar: { home: 'اكتشف', movies: 'أفلام', tv: 'مسلسلات', search: 'بحث', tagline: 'حكايتك القادمة تبدأ هنا.', heroEyebrow: 'مشاهدتك القادمة تبدأ هنا', explore: 'اكتشف العمل', trending: 'حديث الجمهور', trendingSub: 'حكايات يشاهدها الناس الآن', moviesTitle: 'أفلام تستحق وقتك', tvTitle: 'مسلسلات تستحق المتابعة', people: 'وجوه وراء الحكايات', browse: 'تصفّح', films: 'أفلام', shows: 'مسلسلات', topRated: 'الأعلى تقييماً', newest: 'الأحدث', popular: 'الأكثر رواجاً', sort: 'ترتيب حسب', genre: 'كل التصنيفات', year: 'كل السنوات', rating: 'أي تقييم', country: 'رمز الدولة', results: 'أعمال', noResults: 'لم نعثر على أعمال', noResultsSub: 'جرّب تغيير الفلاتر أو استكشاف تصنيف آخر.', retry: 'حاول مجدداً', searchTitle: 'ابحث عن الحكاية كاملة', searchSub: 'أفلام ومسلسلات والأشخاص الذين يمنحونها الحياة.', searchPlaceholder: 'ابحث عن عمل أو ممثل أو مخرج…', all: 'الكل', titles: 'الأعمال', cast: 'الأشخاص', overview: 'القصة', castTitle: 'طاقم التمثيل', crew: 'فريق العمل', details: 'التفاصيل', release: 'تاريخ الإصدار', runtime: 'المدة', status: 'الحالة', language: 'اللغة الأصلية', images: 'صور ومشاهد', trailer: 'شاهد الإعلان', recommendations: 'قد يعجبك أيضاً', seasons: 'المواسم', season: 'الموسم', episodes: 'الحلقات', biography: 'نبذة', filmography: 'أعمال بارزة', born: 'تاريخ الميلاد', birthplace: 'مكان الميلاد', knownFor: 'معروف بـ', loading: 'جارٍ العثور على التفاصيل…', failed: 'تعذّر تحميل هذه الصفحة.', back: 'العودة', emptyBio: 'لا تتوفر نبذة بعد.', browseMore: 'تابع الاستكشاف', page: 'صفحة', previous: 'السابق', next: 'التالي', noImage: 'لا تتوفر صورة', castRole: 'بدور', watchProviders: 'أماكن المشاهدة', providersEmpty: 'تفاصيل المشاهدة غير متاحة.', languageLabel: 'English', verified: 'معلومات موثوقة. بلا تعقيد.', allTime: 'طريقة أسهل لاختيار ما تشاهده.', watchlist: 'قائمتي', watchlistSub: 'أعمال حفظتها لتشاهدها لاحقاً، وتُحفظ على هذا الجهاز.', watchlistEmpty: 'قائمتك فارغة', watchlistEmptySub: 'اضغط على علامة الحفظ في أي عمل ليظهر هنا.', addWatchlist: 'أضف إلى قائمتي', inWatchlist: 'في قائمتك', wtwStream: 'اشتراك', wtwFree: 'مجاناً', wtwRent: 'إيجار', wtwBuy: 'شراء', wtwNoCountry: 'لا توجد منصات لبلدك حتى الآن. المعروض لـ', wtwCredit: 'بيانات المشاهدة من JustWatch', wtwAll: 'كل الخيارات', calendar: 'التقويم', calendarTitle: 'قريباً في السينما', calendarSub: 'الأفلام القادمة حسب تاريخ العرض مع عدّاد تنازلي لكل فيلم.', calendarNote: 'التواريخ حسب TMDB وقد تختلف من بلد لآخر.', addToCalendar: 'أضف إلى تقويمك', episodeRatings: 'تقييمات الحلقات', epRatingsSub: 'كل حلقة بتقييم الجمهور. مرّر على أي خلية للتفاصيل.', epBest: 'أفضل حلقة', epWorst: 'أقل حلقة تقييماً', epAvg: 'المتوسط', epSeasonShort: 'م', epNote: 'التقييمات من جمهور TMDB، والحلقات قليلة الأصوات قد تكون غير دقيقة.', top: 'الأفضل ٢٥٠', topTitle: 'أفضل ٢٥٠ عملاً بتقييم الجمهور', topSub: 'الترتيب بتقييم موزون، فالعمل لازم يحصل على أصوات كتير مش درجة عالية بس.', topNote: 'الترتيب محسوب من CRDb بناءً على أصوات جمهور TMDB.', votes: 'صوت', showMore: 'عرض المزيد' }
};
const extraCopy = {
  en: { signIn: 'Sign in', signUp: 'Create account', signOut: 'Sign out', email: 'Email', password: 'Password', displayName: 'Display name', authLoginTitle: 'Welcome back', authSignupTitle: 'Join CRDb', authLoginSub: 'Sign in to rate titles and keep your profile.', authSignupSub: 'Create an account to rate movies and series.', authNoAccount: 'New here?', authHaveAccount: 'Already have an account?', authNote: 'We only store your email, display name and your ratings.', authPasswordHint: 'At least 8 characters', authErrInvalid: 'Wrong email or password.', authErrTaken: 'This email is already registered.', authErrWeak: 'Password must be 8 to 128 characters.', authErrEmail: 'Please enter a valid email.', authErrName: 'Display name must be 2 to 30 characters.', authErrMany: 'Too many attempts. Try again in a few minutes.', authErrGeneric: 'Something went wrong. Please try again.', crdbRating: 'CRDb rating', rateThis: 'Tap a star to rate', yourRating: 'Your rating', removeRating: 'Remove', signInToRate: 'Sign in to rate', rateBeFirst: 'Be the first to rate', close: 'Close' },
  ar: { signIn: 'تسجيل الدخول', signUp: 'إنشاء حساب', signOut: 'تسجيل الخروج', email: 'البريد الإلكتروني', password: 'كلمة المرور', displayName: 'الاسم الظاهر', authLoginTitle: 'أهلاً بعودتك', authSignupTitle: 'انضم إلى CRDb', authLoginSub: 'سجّل الدخول لتقيّم الأعمال وتحتفظ بملفك.', authSignupSub: 'أنشئ حساباً لتقيّم الأفلام والمسلسلات.', authNoAccount: 'جديد هنا؟', authHaveAccount: 'عندك حساب؟', authNote: 'نحتفظ فقط ببريدك واسمك الظاهر وتقييماتك.', authPasswordHint: '8 أحرف على الأقل', authErrInvalid: 'البريد أو كلمة المرور غير صحيحة.', authErrTaken: 'هذا البريد مسجّل من قبل.', authErrWeak: 'كلمة المرور لازم تكون من 8 إلى 128 حرفاً.', authErrEmail: 'اكتب بريداً إلكترونياً صحيحاً.', authErrName: 'الاسم الظاهر من 2 إلى 30 حرفاً.', authErrMany: 'محاولات كثيرة. جرّب بعد دقايق.', authErrGeneric: 'حصل خطأ. جرّب مرة تانية.', crdbRating: 'تقييم CRDb', rateThis: 'اضغط على نجمة لتقييم العمل', yourRating: 'تقييمك', removeRating: 'إزالة', signInToRate: 'سجّل الدخول للتقييم', rateBeFirst: 'كن أول من يقيّم', close: 'إغلاق' }
};
const copy = { en: { ...baseCopy.en, ...extraCopy.en }, ar: { ...baseCopy.ar, ...extraCopy.ar } };

type Preferences = { lang: Lang; setLang: (lang: Lang) => void; dark: boolean; setDark: (dark: boolean) => void; t: typeof copy.en };
const PreferenceContext = createContext<Preferences | null>(null);
function PreferenceProvider({ children }: { children: ReactNode }) {
  const [lang, setLang] = useState<Lang>(() => {
    const saved = localStorage.getItem('crdb-language-v1');
    if (saved === 'ar' || saved === 'en') return saved;
    return (navigator.language || '').toLowerCase().startsWith('ar') ? 'ar' : 'en';
  });
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
function usePageMeta(title?: string | null, description?: string) {
  const { t } = usePreferences();
  useEffect(() => {
    if (title === null) return;
    document.title = title ? `${title} — CRDb` : `CRDb — ${t.tagline}`;
    const text = (description || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    if (!text) return;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement('meta');
      meta.setAttribute('name', 'description');
      document.head.appendChild(meta);
    }
    meta.setAttribute('content', text);
  }, [title, description, t.tagline]);
}

type AuthUser = { id: number; name: string };
type AuthState = { user: AuthUser | null; ready: boolean; enabled: boolean; openAuth: () => void; logout: () => Promise<void> };
const AuthContext = createContext<AuthState | null>(null);
function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider is missing');
  return context;
}

function AuthModal({ onClose, onAuthed }: { onClose: () => void; onAuthed: (user: AuthUser) => void }) {
  const { t } = usePreferences();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  const errText = (code: string) => (({ invalid_credentials: t.authErrInvalid, email_taken: t.authErrTaken, weak_password: t.authErrWeak, invalid_email: t.authErrEmail, invalid_name: t.authErrName, too_many_attempts: t.authErrMany }) as Record<string, string>)[code] || t.authErrGeneric;
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      const data = await api<{ user: AuthUser }>(`/api/auth/${mode}`, { method: 'POST', body: JSON.stringify({ name, email, password }) });
      onAuthed(data.user);
    } catch (err) {
      setError(errText(err instanceof ApiError ? err.code : ''));
    } finally {
      setBusy(false);
    }
  };
  const signup = mode === 'signup';
  return <div className="auth-modal" role="dialog" aria-modal="true" onClick={onClose}>
    <div className="auth-card" onClick={e => e.stopPropagation()}>
      <button type="button" className="auth-close" onClick={onClose} aria-label={t.close}><X size={18} /></button>
      <h2>{signup ? t.authSignupTitle : t.authLoginTitle}</h2>
      <p className="auth-sub">{signup ? t.authSignupSub : t.authLoginSub}</p>
      <form onSubmit={submit}>
        {signup && <label className="auth-field"><span>{t.displayName}</span><input value={name} onChange={e => setName(e.target.value)} autoComplete="nickname" maxLength={30} required /></label>}
        <label className="auth-field"><span>{t.email}</span><input type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" maxLength={254} required /></label>
        <label className="auth-field"><span>{t.password}</span><input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={signup ? 'new-password' : 'current-password'} minLength={signup ? 8 : undefined} maxLength={128} placeholder={signup ? t.authPasswordHint : undefined} required /></label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button type="submit" className="auth-submit" disabled={busy}>{signup ? t.signUp : t.signIn}</button>
      </form>
      <p className="auth-switch">{signup ? t.authHaveAccount : t.authNoAccount} <button type="button" onClick={() => { setMode(signup ? 'login' : 'signup'); setError(''); }}>{signup ? t.signIn : t.signUp}</button></p>
      {signup && <p className="auth-note">{t.authNote}</p>}
    </div>
  </div>;
}

function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    api<{ user: AuthUser | null; enabled: boolean }>('/api/me')
      .then(d => { setUser(d.user); setEnabled(!!d.enabled); })
      .catch(() => {})
      .finally(() => setReady(true));
  }, []);
  const logout = async () => {
    try { await api('/api/auth/logout', { method: 'POST', body: '{}' }); } catch { /* ignore */ }
    setUser(null);
    qc.invalidateQueries({ queryKey: ['crdb'] });
  };
  const onAuthed = (u: AuthUser) => { setUser(u); setOpen(false); qc.invalidateQueries({ queryKey: ['crdb'] }); };
  return <AuthContext.Provider value={{ user, ready, enabled, openAuth: () => setOpen(true), logout }}>
    {children}
    {open && <AuthModal onClose={() => setOpen(false)} onAuthed={onAuthed} />}
  </AuthContext.Provider>;
}

function UserMenu() {
  const auth = useAuth();
  const { t } = usePreferences();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);
  if (!auth.user) return null;
  return <div className="user-menu" ref={ref}>
    <button type="button" className="lang-btn auth-btn" onClick={() => setOpen(o => !o)} aria-expanded={open}><UserRound size={14} /><span>{auth.user.name}</span></button>
    {open && <div className="user-pop"><div className="user-pop-name">{auth.user.name}</div><button type="button" onClick={() => { setOpen(false); auth.logout(); }}><LogOut size={15} />{t.signOut}</button></div>}
  </div>;
}

function RatingBox({ kind, id }: { kind: 'movie' | 'tv'; id: number }) {
  const { t } = usePreferences();
  const auth = useAuth();
  const qc = useQueryClient();
  const [hover, setHover] = useState(0);
  const [busy, setBusy] = useState(false);
  const key = ['crdb', 'rating', kind, id];
  const q = useQuery({ queryKey: key, enabled: auth.enabled, queryFn: () => api<{ avg: number | null; count: number; mine: number | null }>(`/api/crdb/rating?type=${kind}&id=${id}`) });
  if (!auth.enabled) return null;
  const data = q.data;
  const mine = data?.mine ?? 0;
  const shown = hover || mine;
  const change = async (run: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await run();
      await qc.invalidateQueries({ queryKey: key });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) auth.openAuth();
    } finally {
      setBusy(false);
    }
  };
  const rate = (n: number) => {
    if (!auth.user) { auth.openAuth(); return; }
    change(() => api('/api/crdb/rating', { method: 'POST', body: JSON.stringify({ type: kind, id, rating: n }) }));
  };
  const clear = () => change(() => api(`/api/crdb/rating?type=${kind}&id=${id}`, { method: 'DELETE' }));
  return <div className="rate-box">
    <div className="rate-label">{t.crdbRating}</div>
    <div className="rate-score"><Star size={20} fill="currentColor" /><strong>{data?.count && data.avg !== null ? data.avg.toFixed(1) : '—'}</strong><span>/10</span><em>{data?.count ? `${data.count.toLocaleString()} ${t.votes}` : t.rateBeFirst}</em></div>
    <div className="rate-stars" onMouseLeave={() => setHover(0)}>
      {Array.from({ length: 10 }, (_, i) => i + 1).map(n => <button key={n} type="button" disabled={busy} className={n <= shown ? 'on' : ''} onMouseEnter={() => setHover(n)} onClick={() => rate(n)} aria-label={`${n}/10`}><Star size={20} fill={n <= shown ? 'currentColor' : 'none'} /></button>)}
    </div>
    <div className="rate-foot">{auth.user ? (mine ? <>{t.yourRating}: <b>{mine}</b><button type="button" className="rate-clear" onClick={clear}>{t.removeRating}</button></> : t.rateThis) : <button type="button" className="rate-clear" onClick={auth.openAuth}>{t.signInToRate}</button>}</div>
  </div>;
}

function Shell({ children }: { children: ReactNode }) {
  const pref = usePreferences();
  const auth = useAuth();
  const [loc] = useLocation();
  const nav = [{ path: '/', label: pref.t.home, icon: Clapperboard }, { path: '/movies', label: pref.t.movies, icon: Film }, { path: '/tv', label: pref.t.tv, icon: Tv }, { path: '/top', label: pref.t.top, icon: Trophy }, { path: '/calendar', label: pref.t.calendar, icon: CalendarDays }, { path: '/watchlist', label: pref.t.watchlist, icon: Bookmark }];
  return <div className="shell">
    <header className="topbar">
      <Link href="/" className="brand" data-testid="link-brand"><img src={pref.dark ? '/brand/logo.svg' : '/brand/logo-on-light.svg'} alt="CRDb" /></Link>
      <nav className="navlinks">{nav.map(n => <Link key={n.path} href={n.path} className={loc === n.path ? 'active' : ''} data-testid={`link-nav-${n.path === '/' ? 'home' : n.path.slice(1)}`}>{n.label}</Link>)}</nav>
      <div className="top-actions">
        <Link href="/search" className="icon-btn" aria-label={pref.t.search} data-testid="link-search"><Search size={17} /></Link>
        {auth.enabled && (auth.user ? <UserMenu /> : <button type="button" className="lang-btn auth-btn" onClick={auth.openAuth}><UserRound size={14} /><span>{pref.t.signIn}</span></button>)}
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

function TrailerModal({ videoKey, title, onClose }: { videoKey: string; title: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [onClose]);
  return <div className="trailer-modal" role="dialog" aria-modal="true" onClick={onClose}>
    <div className="trailer-box" onClick={e => e.stopPropagation()}>
      <div className="trailer-head"><span>{title}</span><button type="button" className="trailer-close" onClick={onClose} aria-label="Close"><X size={20} /></button></div>
      <div className="trailer-frame"><iframe src={`https://www.youtube-nocookie.com/embed/${videoKey}?autoplay=1&rel=0&modestbranding=1&playsinline=1`} title={`${title} trailer`} allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowFullScreen /></div>
    </div>
  </div>;
}

function PosterCard({ item, kind, onSelect }: { item: MediaItem | Record<string, unknown>; kind?: string; onSelect?: () => void }) {
  const name = titleOf(item);
  const href = entryPath(item, kind);
  const wl = useWatchlist();
  const resolved = kind || String(item.media_type || 'movie');
  const saved = resolved !== 'person' && wl.has(Number(item.id), resolved === 'tv' ? 'tv' : 'movie');
  return <Link href={href} className="poster-card" onClick={onSelect} data-testid={`card-title-${String(item.id)}`}>
    <div className="poster-frame">{img(item.poster_path as string) ? <img src={img(item.poster_path as string)} alt={name} loading="lazy" /> : <div className="poster-fallback">{name}<br />—</div>}{ratingOf(item) > 0 && <span className="poster-rating"><Star size={10} fill="currentColor" /> {ratingOf(item).toFixed(1)}</span>}
      {resolved !== 'person' && <button type="button" className={`wl-btn ${saved ? 'on' : ''}`} aria-label="Watchlist" onClick={e => { e.preventDefault(); e.stopPropagation(); wl.toggle(toSaved(item, kind)); }}>{saved ? <BookmarkCheck size={16} /> : <BookmarkPlus size={16} />}</button>}
    </div>
    <div className="poster-title">{name}</div><div className="poster-year">{yearOf(item) || '—'}</div>
  </Link>;
}
function Section({ title, subtitle, items, kind, browseLabel = copy.en.browse }: { title: string; subtitle?: string; items?: MediaItem[]; kind?: string; browseLabel?: string }) {
  if (!items?.length) return null;
  return <section className="section"><div className="section-head"><div><h2 className="section-title">{title}</h2>{subtitle && <p className="section-kicker">{subtitle}</p>}</div>{kind && <Link href={kind === 'tv' ? '/tv' : '/movies'} className="text-link">{browseLabel}<ArrowRight size={14} /></Link>}</div><div className="poster-row">{items.map(i => <PosterCard key={`${i.media_type}-${i.id}`} item={i} kind={kind} />)}</div></section>;
}

function HomePage() {
  const { lang, t } = usePreferences();
  usePageMeta(undefined);
  const [, setLocation] = useLocation();
  const q = useGetCinemaHome({ language: lang });
  const heroes = q.data?.hero || [];
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    if (heroes.length < 2 || playing) return;
    const timer = window.setInterval(() => setIdx(i => (i + 1) % heroes.length), 7000);
    return () => window.clearInterval(timer);
  }, [heroes.length, playing]);
  useEffect(() => { setPlaying(false); }, [idx]);
  const go = (d: number) => setIdx(i => (i + d + heroes.length) % heroes.length);
  const hero = heroes.length ? heroes[idx % heroes.length] : undefined;
  const upNext = heroes.length > 1 ? Array.from({ length: Math.min(3, heroes.length - 1) }, (_, n) => heroes[(idx + n + 1) % heroes.length]) : [];
  const top10 = (q.data?.sections?.find(s => s.id === 'trending')?.items || []).slice(0, 10);
  const trailerQuery = useGetCinemaTrailer(
    { mediaType: hero?.media_type === 'tv' ? 'tv' : 'movie', id: Number(hero?.id || 0), language: lang },
    { query: { enabled: !!hero } },
  );
  const trailerKey = trailerQuery.data || null;
  const watch = () => {
    if (trailerKey) setPlaying(true);
    else if (hero) setLocation(entryPath(hero));
  };
  return <PageFrame>
    {q.isLoading ? <div className="skeleton" style={{ height: 470, marginTop: 22, borderRadius: 26 }} /> : q.isError ? <StateBlock error title={t.failed} text={t.noResultsSub} action={t.retry} onAction={() => q.refetch()} /> : <>
      {hero && <section className="imdb-hero">
        <div className="imdb-stage">
          {img(hero.backdrop_path, 'original') && <img key={hero.id} className="imdb-stage-img" src={img(hero.backdrop_path, 'original')} alt="" />}
          <div className="imdb-stage-shade" />
          {heroes.length > 1 && <>
            <button className="imdb-arrow prev" onClick={() => go(-1)} aria-label="Previous"><ChevronLeft size={26} /></button>
            <button className="imdb-arrow next" onClick={() => go(1)} aria-label="Next"><ChevronRight size={26} /></button>
          </>}
          <div className="imdb-stage-info">
            {img(hero.poster_path, 'w342') && <Link href={entryPath(hero)}><img className="imdb-stage-poster" src={img(hero.poster_path, 'w342')} alt={titleOf(hero)} /></Link>}
            <div className="imdb-stage-text">
              <button type="button" className="imdb-play" onClick={watch} aria-label={t.trailer}><Play size={22} fill="currentColor" /></button>
              <div>
                <h1><Link href={entryPath(hero)}>{titleOf(hero)}</Link></h1>
                <div className="imdb-stage-meta">{ratingOf(hero) > 0 && <span className="score"><Star size={13} fill="currentColor" /> {ratingOf(hero).toFixed(1)}</span>}<span>{dateOf(hero) || yearOf(hero)}</span><span>{hero.media_type === 'tv' ? t.tv : t.movies}</span>{trailerKey && <span className="imdb-watch">{t.trailer}</span>}</div>
              </div>
            </div>
          </div>
        </div>
        <aside className="imdb-side">
          <h3>{lang === 'ar' ? 'التالي' : 'Up next'}</h3>
          {upNext.map(item => <Link key={item.id} href={entryPath(item)} className="imdb-side-item">
            {img(item.poster_path, 'w185') ? <img src={img(item.poster_path, 'w185')} alt="" /> : <div className="imdb-side-ph" />}
            <div><strong>{titleOf(item)}</strong><span><Star size={11} fill="currentColor" /> {ratingOf(item).toFixed(1)} · {yearOf(item)}</span></div>
          </Link>)}
        </aside>
      </section>}
      {top10.length > 0 && <section className="section">
        <div className="section-head"><div><h2 className="section-title">{lang === 'ar' ? 'الأفضل ١٠ هذا الأسبوع' : 'Top 10 this week'}</h2></div></div>
        <div className="top10-row">{top10.map((item, i) => <div className="top10-item" key={`${item.media_type}-${item.id}`}><span className="top10-rank">{i + 1}</span><PosterCard item={item} kind={item.media_type || undefined} /></div>)}</div>
      </section>}
      {!hero && !q.data?.sections?.length && <StateBlock title={t.noResults} text={t.noResultsSub} />}
      {q.data?.sections?.map(section => <Section key={section.id} title={section.title} items={section.items} kind={section.mediaType === 'person' ? undefined : section.mediaType} browseLabel={t.browse} />)}
    </>}
    {playing && trailerKey && hero && <TrailerModal videoKey={trailerKey} title={titleOf(hero)} onClose={() => setPlaying(false)} />}
  </PageFrame>;
}

function TopPage() {
  const { lang, t } = usePreferences();
  usePageMeta(t.topTitle, t.topSub);
  const wl = useWatchlist();
  const [tab, setTab] = useState<'movie' | 'tv'>('movie');
  const [shown, setShown] = useState(50);
  const q = useGetCinemaTop({ mediaType: tab, language: lang });
  useEffect(() => { setShown(50); }, [tab]);
  const items = q.data || [];
  return <PageFrame><div className="eyebrow">{t.top}</div><h1 className="page-title">{t.topTitle}</h1><p className="subhead">{t.topSub}</p>
    <div className="tabs">{([['movie', t.films], ['tv', t.shows]] as Array<['movie' | 'tv', string]>).map(([id, label]) => <button key={id} className={`tab ${tab === id ? 'active' : ''}`} onClick={() => setTab(id)}>{label}</button>)}</div>
    {q.isLoading ? <div className="skeleton" style={{ height: 520, marginTop: 20 }} /> : q.isError ? <StateBlock error title={t.failed} text={t.noResultsSub} action={t.retry} onAction={() => q.refetch()} /> : items.length ? <>
      <ol className="top-list">{items.slice(0, shown).map((item, i) => {
        const saved = wl.has(Number(item.id), tab);
        return <li className="top-row" key={item.id}>
          <span className="top-rank-n">{i + 1}</span>
          <Link href={entryPath(item, tab)} className="top-poster">{img(item.poster_path, 'w185') ? <img src={img(item.poster_path, 'w185')} alt={titleOf(item)} loading="lazy" /> : <div className="top-poster-ph" />}</Link>
          <div className="top-info"><Link href={entryPath(item, tab)} className="top-title">{titleOf(item)}</Link><span className="top-meta">{yearOf(item) || '—'}</span></div>
          <div className="top-score"><span className="top-star"><Star size={14} fill="currentColor" /><strong>{ratingOf(item).toFixed(1)}</strong></span><span className="top-votes">{Number(item.vote_count || 0).toLocaleString()} {t.votes}</span></div>
          <button type="button" className={`top-wl ${saved ? 'on' : ''}`} aria-label={saved ? t.inWatchlist : t.addWatchlist} onClick={() => wl.toggle(toSaved(item, tab))}>{saved ? <BookmarkCheck size={17} /> : <BookmarkPlus size={17} />}</button>
        </li>;
      })}</ol>
      {shown < items.length && <div className="pager"><button type="button" onClick={() => setShown(s => s + 50)}>{t.showMore}</button></div>}
      <p className="wtw-credit">{t.topNote}</p>
    </> : <StateBlock title={t.noResults} text={t.noResultsSub} />}
  </PageFrame>;
}

function CalendarPage() {
  const { lang, t } = usePreferences();
  usePageMeta(t.calendarTitle, t.calendarSub);
  const wl = useWatchlist();
  const q = useGetCinemaUpcoming({ language: lang });
  const locale = lang === 'ar' ? 'ar' : 'en-US';
  const groups = useMemo(() => {
    const map = new Map<string, MediaItem[]>();
    (q.data || []).forEach(item => {
      const key = String(item.release_date).slice(0, 7);
      map.set(key, [...(map.get(key) || []), item]);
    });
    return Array.from(map.entries());
  }, [q.data]);
  const monthLabel = (key: string) => {
    const [y, m] = key.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  };
  const dayParts = (date: string) => {
    const [y, m, d] = date.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return { day: dt.toLocaleDateString(locale, { day: 'numeric', timeZone: 'UTC' }), weekday: dt.toLocaleDateString(locale, { weekday: 'short', timeZone: 'UTC' }) };
  };
  return <PageFrame><div className="eyebrow">{t.calendar}</div><h1 className="page-title">{t.calendarTitle}</h1><p className="subhead">{t.calendarSub}</p>
    {q.isLoading ? <LoadingGrid /> : q.isError ? <StateBlock error title={t.failed} text={t.noResultsSub} action={t.retry} onAction={() => q.refetch()} /> : groups.length ? <>
      {groups.map(([key, items]) => <section className="cal-month-block" key={key}>
        <h2 className="cal-month">{monthLabel(key)}</h2>
        <div className="cal-list">{items.map(item => {
          const parts = dayParts(String(item.release_date));
          const saved = wl.has(Number(item.id), 'movie');
          return <article className="cal-item" key={item.id}>
            <div className="cal-date"><strong>{parts.day}</strong><span>{parts.weekday}</span></div>
            <Link href={entryPath(item, 'movie')} className="cal-poster">{img(item.poster_path, 'w185') ? <img src={img(item.poster_path, 'w185')} alt={titleOf(item)} loading="lazy" /> : <div className="cal-poster-ph" />}</Link>
            <div className="cal-body">
              <Link href={entryPath(item, 'movie')} className="cal-title">{titleOf(item)}</Link>
              <p className="cal-overview">{String(item.overview || '')}</p>
              <div className="cal-actions">
                <span className="cal-count">{countdownLabel(daysUntil(String(item.release_date)), lang)}</span>
                <button type="button" className={`cal-btn ${saved ? 'on' : ''}`} onClick={() => wl.toggle(toSaved(item, 'movie'))}>{saved ? <BookmarkCheck size={15} /> : <BookmarkPlus size={15} />}{saved ? t.inWatchlist : t.addWatchlist}</button>
                <button type="button" className="cal-btn" onClick={() => downloadIcs(item)}><CalendarPlus size={15} />{t.addToCalendar}</button>
              </div>
            </div>
          </article>;
        })}</div>
      </section>)}
      <p className="wtw-credit">{t.calendarNote}</p>
    </> : <StateBlock title={t.noResults} text={t.noResultsSub} />}
  </PageFrame>;
}

function BrowsePage({ kind }: { kind: 'movie' | 'tv' }) {
  const { lang, t } = usePreferences();
  const [genreId, setGenreId] = useState(''); const [year, setYear] = useState(''); const [minRating, setMinRating] = useState(''); const [country, setCountry] = useState(''); const [sortBy, setSortBy] = useState('popularity.desc'); const [page, setPage] = useState(1);
  const genres = useGetCinemaGenres({ mediaType: kind, language: lang }, { query: { queryKey: getGetCinemaGenresQueryKey({ mediaType: kind, language: lang }) } });
  const params = { mediaType: kind, language: lang, page, ...(genreId ? { genreId: Number(genreId) } : {}), ...(year ? { year: Number(year) } : {}), ...(minRating ? { minRating: Number(minRating) } : {}), ...(country ? { country: country.toUpperCase() } : {}), sortBy: sortBy as 'popularity.desc' | 'vote_average.desc' | 'primary_release_date.desc' | 'first_air_date.desc' };
  const results = useDiscoverCinemaTitles(params, { query: { queryKey: getDiscoverCinemaTitlesQueryKey(params) } });
  const title = kind === 'movie' ? t.moviesTitle : t.tvTitle;
  usePageMeta(title);
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
  usePageMeta(t.searchTitle);
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

function EpisodeHeatmap({ id, seasonNumbers }: { id: number; seasonNumbers: number[] }) {
  const { lang, t } = usePreferences();
  const q = useGetCinemaEpisodeRatings({ id, seasonNumbers, language: lang });
  if (q.isLoading) return <section className="section"><h2 className="section-title">{t.episodeRatings}</h2><div className="skeleton" style={{ height: 220, marginTop: 17 }} /></section>;
  const eps: EpisodeRating[] = q.data || [];
  const rated = eps.filter(e => e.votes > 0 && e.rating > 0);
  if (rated.length < 3) return null;
  const pool = rated.filter(e => e.votes >= 3);
  const candidates = pool.length >= 2 ? pool : rated;
  const best = candidates.reduce((a, b) => (b.rating > a.rating || (b.rating === a.rating && b.votes > a.votes) ? b : a));
  const worst = candidates.reduce((a, b) => (b.rating < a.rating || (b.rating === a.rating && b.votes > a.votes) ? b : a));
  const map = new Map(eps.map(e => [`${e.season}-${e.episode}`, e]));
  const maxEp = Math.max(...eps.map(e => e.episode));
  const avg = (s: number) => {
    const list = rated.filter(e => e.season === s);
    return list.length ? list.reduce((sum, e) => sum + e.rating, 0) / list.length : 0;
  };
  const tip = (e: EpisodeRating) => `${t.epSeasonShort}${e.season} · E${e.episode} — ${e.name} · ${e.rating.toFixed(1)} (${e.votes.toLocaleString()})`;
  return <section className="section">
    <div className="section-head"><div><h2 className="section-title">{t.episodeRatings}</h2><p className="section-kicker">{t.epRatingsSub}</p></div></div>
    <div className="hm-stats">
      <div className="hm-stat"><span>{t.epBest}</span><strong style={{ color: heat(best.rating) }}>{best.rating.toFixed(1)}</strong><em>{t.epSeasonShort}{best.season} · E{best.episode} — {best.name}</em></div>
      <div className="hm-stat"><span>{t.epWorst}</span><strong style={{ color: heat(worst.rating) }}>{worst.rating.toFixed(1)}</strong><em>{t.epSeasonShort}{worst.season} · E{worst.episode} — {worst.name}</em></div>
    </div>
    <div className="hm-scroll">
      <div className="hm-grid" style={{ gridTemplateColumns: `34px repeat(${seasonNumbers.length}, 46px)` }}>
        <div className="hm-corner" />
        {seasonNumbers.map(s => <div className="hm-head" key={`h${s}`}>{t.epSeasonShort}{s}</div>)}
        {Array.from({ length: maxEp }, (_, i) => i + 1).map(ep => <Fragment key={ep}>
          <div className="hm-side">{ep}</div>
          {seasonNumbers.map(s => {
            const e = map.get(`${s}-${ep}`);
            return e && e.votes > 0 && e.rating > 0
              ? <div key={`${s}-${ep}`} className="hm-cell" style={{ background: heat(e.rating) }} title={tip(e)}>{e.rating.toFixed(1)}</div>
              : <div key={`${s}-${ep}`} className={`hm-cell ${e ? 'none' : 'void'}`} title={e ? tip(e) : undefined}>{e ? '—' : ''}</div>;
          })}
        </Fragment>)}
        <div className="hm-side avg">{t.epAvg}</div>
        {seasonNumbers.map(s => { const a = avg(s); return <div key={`a${s}`} className={`hm-cell avg ${a ? '' : 'none'}`} style={a ? { background: heat(a) } : undefined}>{a ? a.toFixed(1) : '—'}</div>; })}
      </div>
    </div>
    <div className="hm-legend"><span>5</span><i /><span>9+</span></div>
    <p className="wtw-credit">{t.epNote}</p>
  </section>;
}

function DetailPage({ kind }: { kind: 'movie' | 'tv' }) {
  const p = useParams<{ id: string }>(); const id = Number(p.id); const { lang, t } = usePreferences();
  const wl = useWatchlist();
  const visitor = useVisitorCountry();
  const params = { mediaType: kind, id, language: lang };
  const q = useGetCinemaTitle(params, { query: { enabled: Number.isFinite(id) && id > 0, queryKey: getGetCinemaTitleQueryKey(params) } });
  const [seasonNo, setSeasonNo] = useState<number | null>(null);
  const [trailerOpen, setTrailerOpen] = useState(false);
  const title = q.data as MediaDetails | undefined;
  const seasons = (title?.seasons as Array<Record<string, unknown>> | undefined) || [];
  const seasonNumbers = seasons.map(s => Number(s.season_number)).filter(n => Number.isFinite(n) && n >= 1);
  usePageMeta(title ? `${titleOf(title)}${yearOf(title) ? ` (${yearOf(title)})` : ''}` : null, title ? String(title.overview || '') : undefined);
  useEffect(() => { setSeasonNo(null); setTrailerOpen(false); }, [id]);
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
  const providerResults = (providers?.results as Record<string, Record<string, unknown>> | undefined) || {};
  const providerCountries = Object.keys(providerResults).sort((a, b) => countryName(a, lang).localeCompare(countryName(b, lang)));
  const hasMine = !!visitor.country && !!providerResults[visitor.country];
  const shownCountry = hasMine ? visitor.country : (providerResults.US ? 'US' : providerCountries[0] || '');
  const region = shownCountry ? providerResults[shownCountry] : undefined;
  const groups = ([['flatrate', t.wtwStream], ['free', t.wtwFree], ['ads', t.wtwFree], ['rent', t.wtwRent], ['buy', t.wtwBuy]] as Array<[string, string]>)
    .map(([key, label]) => ({ key, label, items: ((region?.[key] as Array<Record<string, unknown>> | undefined) || []).slice(0, 8) }))
    .filter(g => g.items.length > 0);
  if (q.isLoading) return <PageFrame><div className="skeleton" style={{ height: 400 }} /><div className="skeleton" style={{ height: 230, marginTop: 24 }} /></PageFrame>;
  if (q.isError || !title) return <PageFrame><StateBlock error title={t.failed} text={t.noResultsSub} action={t.retry} onAction={() => q.refetch()} /></PageFrame>;
  const genres = (title.genres as Array<{ id: number; name: string }> | undefined) || [];
  const recommendationsLinkKind = kind;
  const inList = wl.has(id, kind);
  return <div className="page" style={{ paddingTop: 38 }}>
    <section className="detail-hero">{img(title.backdrop_path as string, 'original') && <img className="detail-backdrop" src={img(title.backdrop_path as string, 'original')} alt="" />}
      <div className="detail-head">{img(title.poster_path as string) ? <img className="detail-poster" src={img(title.poster_path as string)} alt={titleOf(title)} /> : <div className="detail-poster" />}
        <div><div className="eyebrow">{kind === 'movie' ? t.movies : t.tv}</div><h1 className="detail-title">{titleOf(title)}</h1><div className="detail-meta">{ratingOf(title) > 0 && <span className="score"><Star size={13} fill="currentColor" /> {ratingOf(title).toFixed(1)} ({Number(title.vote_count || 0).toLocaleString()})</span>}<span><CalendarDays size={13} style={{ verticalAlign: 'middle' }} /> {dateOf(title) || '—'}</span>{typeof title.runtime === 'number' && <span>{title.runtime} min</span>}{typeof title.number_of_seasons === 'number' && <span>{title.number_of_seasons} {t.seasons.toLowerCase()}</span>}</div><p className="detail-overview">{String(title.overview || '')}</p><div className="genre-pills">{genres.map(g => <span key={g.id}>{g.name}</span>)}</div>
          <div className="wl-row">
            {trailer && <button type="button" className="wl-cta play" onClick={() => setTrailerOpen(true)}><Play size={16} fill="currentColor" />{t.trailer}</button>}
            <button type="button" className={`wl-cta ${inList ? 'on' : ''}`} onClick={() => wl.toggle(toSaved(title, kind))}>{inList ? <BookmarkCheck size={17} /> : <BookmarkPlus size={17} />}{inList ? t.inWatchlist : t.addWatchlist}</button>
          </div>
          <RatingBox kind={kind} id={id} /></div>
      </div>
    </section>
    <div className="detail-body"><div className="detail-columns"><div>
      <section className="section"><div className="section-head"><div><h2 className="section-title">{t.castTitle}</h2><p className="section-kicker">{t.crew}</p></div></div>{cast.length ? <div className="cast-row">{cast.slice(0, 18).map((person, i) => <Link href={`/person/${person.id}`} className="cast-card" key={`${person.id}-${i}`} data-testid={`link-cast-${person.id}`}>{img(person.profile_path as string, 'w185') ? <img className="cast-photo" src={img(person.profile_path as string, 'w185')} alt={String(person.name)} loading="lazy" /> : <div className="cast-photo" /> }<div className="cast-name">{String(person.name || '')}</div><div className="cast-role">{t.castRole} {String(person.character || '')}</div></Link>)}</div> : <p className="subhead">—</p>}</section>
      {crew.length > 0 && <section className="section"><h2 className="section-title">{t.crew}</h2><div className="cast-row" style={{ marginTop: 17 }}>{crew.filter(c => ['Director', 'Writer', 'Executive Producer', 'Creator'].includes(String(c.job))).slice(0, 12).map((person, i) => <Link href={`/person/${person.id}`} className="cast-card" key={`${person.id}-${i}`}>{img(person.profile_path as string, 'w185') ? <img className="cast-photo" src={img(person.profile_path as string, 'w185')} alt={String(person.name)} loading="lazy" /> : <div className="cast-photo" />}<div className="cast-name">{String(person.name)}</div><div className="cast-role">{String(person.job)}</div></Link>)}</div></section>}
      {trailer && <section className="section"><h2 className="section-title">{t.trailer}</h2>
        <button type="button" className="trailer-card" onClick={() => setTrailerOpen(true)} aria-label={t.trailer}>
          {img((title.backdrop_path as string) || (stills[0]?.file_path as string), 'w780') && <img src={img((title.backdrop_path as string) || (stills[0]?.file_path as string), 'w780')} alt="" />}
          <span className="trailer-card-play"><Play size={28} fill="currentColor" /></span>
        </button></section>}
      {(stills.length + posters.length) > 0 && <section className="section"><h2 className="section-title">{t.images}</h2><div className="image-strip" style={{ marginTop: 17 }}>{[...stills, ...posters].map((image, i) => <img key={i} src={img(image.file_path as string, 'w500')} alt="" loading="lazy" />)}</div></section>}
      {kind === 'tv' && seasons.length > 0 && <section className="section"><div className="section-head"><div><h2 className="section-title">{t.seasons}</h2></div><select className="field" aria-label={t.season} value={seasonNo ?? ''} onChange={e => setSeasonNo(e.target.value === '' ? null : Number(e.target.value))} data-testid="select-season"><option value="">{t.seasons}</option>{seasons.map(s => <option key={String(s.id)} value={Number(s.season_number)}>{String(s.name || `${t.season} ${s.season_number}`)}</option>)}</select></div>
        {seasonNo !== null && (season.isLoading ? <div className="skeleton" style={{ height: 160 }} /> : season.isError ? <StateBlock error title={t.failed} text={t.noResultsSub} action={t.retry} onAction={() => season.refetch()} /> : <div className="episode-list">{((season.data?.episodes || []) as Array<Record<string, unknown>>).map((episode, i) => <article className="episode" key={String(episode.id || i)}>{img(episode.still_path as string, 'w300') ? <img src={img(episode.still_path as string, 'w300')} alt="" /> : <div className="skeleton" />}<div><h3>{String(episode.episode_number || i + 1)}. {String(episode.name || '')}</h3><p>{String(episode.air_date || '')} · {String(episode.runtime || '')} min</p><p>{String(episode.overview || '')}</p></div></article>)}</div>)}</section>}
      {kind === 'tv' && seasonNumbers.length > 0 && <EpisodeHeatmap id={id} seasonNumbers={seasonNumbers} />}
      {providerCountries.length > 0 && <section className="section">
        <div className="wtw-head"><h2 className="section-title">{t.watchProviders}</h2>
          <select className="field" aria-label="Country" value={shownCountry} onChange={e => visitor.choose(e.target.value)}>{providerCountries.map(c => <option key={c} value={c}>{countryName(c, lang)}</option>)}</select></div>
        {!hasMine && shownCountry && <p className="wtw-note">{t.wtwNoCountry} {countryName(shownCountry, lang)}</p>}
        {groups.length ? groups.map(g => <div className="wtw-group" key={g.key}><h3>{g.label}</h3><div className="wtw-row">{g.items.map((v, i) => <div className="wtw-item" key={`${g.key}-${i}`}>{img(v.logo_path as string, 'w92') && <img src={img(v.logo_path as string, 'w92')} alt={String(v.provider_name)} />}{String(v.provider_name)}</div>)}</div></div>) : <p className="wtw-note">{t.providersEmpty}</p>}
        {typeof region?.link === 'string' && <p className="wtw-note"><a href={region.link} target="_blank" rel="noreferrer noopener">{t.wtwAll}</a></p>}
        <p className="wtw-credit">{t.wtwCredit}</p>
      </section>}
      {recoItems.length > 0 && <Section title={t.recommendations} items={recoItems} kind={recommendationsLinkKind} browseLabel={t.browse} />}
    </div><aside className="info-panel"><h3 style={{ margin: '0 0 5px', font: '800 17px var(--app-font-serif)' }}>{t.details}</h3>{[[t.release, dateOf(title)], [t.runtime, title.runtime ? `${title.runtime} min` : title.episode_run_time ? `${(title.episode_run_time as number[])[0]} min` : '—'], [t.status, String(title.status || '—')], [t.language, String(title.original_language || '—')], [t.knownFor, String(title.tagline || '—')]].map(([label, value]) => <div className="info-line" key={label}><strong>{label}</strong><span>{value}</span></div>)}</aside></div></div>
    {trailerOpen && trailer && <TrailerModal videoKey={String(trailer.key)} title={titleOf(title)} onClose={() => setTrailerOpen(false)} />}
  </div>;
}

function PersonPage() {
  const p = useParams<{ id: string }>(); const id = Number(p.id); const { lang, t } = usePreferences();
  const params = { id, language: lang };
  const q = useGetCinemaPerson(params, { query: { enabled: Number.isFinite(id) && id > 0, queryKey: getGetCinemaPersonQueryKey(params) } });
  const person = q.data as PersonDetails | undefined;
  usePageMeta(person ? person.name : null, person?.biography);
  const credits = person?.combined_credits as Record<string, unknown> | undefined;
  const filmography = ((credits?.cast as MediaItem[] | undefined) || []).slice().sort((a, b) => (dateOf(b) || '').localeCompare(dateOf(a) || ''));
  if (q.isLoading) return <PageFrame><div className="skeleton" style={{ height: 400 }} /></PageFrame>;
  if (q.isError || !person) return <PageFrame><StateBlock error title={t.failed} text={t.noResultsSub} action={t.retry} onAction={() => q.refetch()} /></PageFrame>;
  return <PageFrame><div className="person-layout"><div>{img(person.profile_path, 'h632') ? <img className="person-photo" src={img(person.profile_path, 'h632')} alt={person.name} /> : <div className="person-photo" />}</div><div><div className="eyebrow">{t.people}</div><h1 className="page-title">{person.name}</h1><div className="detail-meta" style={{ color: 'hsl(var(--muted-foreground))' }}>{person.known_for_department && <span>{person.known_for_department}</span>}{person.birthday && <span>{t.born}: {person.birthday}</span>}{person.place_of_birth && <span>{t.birthplace}: {person.place_of_birth}</span>}</div><h2 className="section-title" style={{ marginTop: 27 }}>{t.biography}</h2><p className="bio">{person.biography || t.emptyBio}</p></div></div>
    {filmography.length > 0 && <section className="section"><div className="section-head"><h2 className="section-title">{t.filmography}</h2></div><div className="filmography">{filmography.map(item => <div className="grid-poster" key={`${item.media_type}-${item.id}`}><PosterCard item={item} kind={item.media_type || 'movie'} /></div>)}</div></section>}
  </PageFrame>;
}

function WatchlistPage() {
  const { t } = usePreferences();
  usePageMeta(t.watchlist, t.watchlistSub);
  const wl = useWatchlist();
  return <PageFrame><div className="eyebrow">{t.watchlist}</div><h1 className="page-title">{t.watchlist}</h1><p className="subhead">{t.watchlistSub}</p>
    {wl.items.length ? <div className="media-grid">{wl.items.map(item => <div className="grid-poster" key={`${item.media_type}-${item.id}`}><PosterCard item={{ id: item.id, media_type: item.media_type, title: item.title, poster_path: item.poster_path, vote_average: item.vote_average, release_date: item.date }} kind={item.media_type} /></div>)}</div> : <StateBlock title={t.watchlistEmpty} text={t.watchlistEmptySub} />}
  </PageFrame>;
}

function Router() {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}><Shell><Switch>
    <Route path="/" component={HomePage} />
    <Route path="/movies"><BrowsePage kind="movie" /></Route>
    <Route path="/tv"><BrowsePage kind="tv" /></Route>
    <Route path="/search" component={SearchPage} />
    <Route path="/top" component={TopPage} />
    <Route path="/calendar" component={CalendarPage} />
    <Route path="/watchlist" component={WatchlistPage} />
    <Route path="/movie/:id"><DetailPage kind="movie" /></Route>
    <Route path="/tv/:id"><DetailPage kind="tv" /></Route>
    <Route path="/person/:id" component={PersonPage} />
    <Route component={NotFound} />
  </Switch></Shell></ErrorBoundary>;
}

function App() {
  return <QueryClientProvider client={client}><TooltipProvider><PreferenceProvider><AuthProvider><Router /></AuthProvider></PreferenceProvider><Toaster /></TooltipProvider></QueryClientProvider>;
}

export default App;
