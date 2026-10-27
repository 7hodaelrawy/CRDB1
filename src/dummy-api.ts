import { useQuery } from '@tanstack/react-query';

export interface MediaItem {
  id: number;
  media_type?: string | null;
  title?: string;
  name?: string;
  original_title?: string;
  original_name?: string;
  overview?: string;
  poster_path?: string | null;
  backdrop_path?: string | null;
  release_date?: string;
  first_air_date?: string;
  vote_average?: number;
  [key: string]: unknown;
}
export type MediaDetails = MediaItem;
export interface PersonDetails {
  id: number;
  name: string;
  biography?: string;
  birthday?: string | null;
  place_of_birth?: string | null;
  profile_path?: string | null;
  known_for_department?: string;
  [key: string]: unknown;
}

type Opts = { query?: { enabled?: boolean; queryKey?: readonly unknown[] } };
type Lang = string | undefined;

async function tmdb<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
  const url = new URL(`/api/tmdb${path}`, window.location.origin);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  });
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json() as Promise<T>;
}

/* ---------- Query keys ---------- */
export const getDiscoverCinemaTitlesQueryKey = (p: unknown) => ['cinema', 'discover', p] as const;
export const getSearchCinemaQueryKey = (p: unknown) => ['cinema', 'search', p] as const;
export const getGetCinemaGenresQueryKey = (p: unknown) => ['cinema', 'genres', p] as const;
export const getGetCinemaTitleQueryKey = (p: unknown) => ['cinema', 'title', p] as const;
export const getGetCinemaPersonQueryKey = (p: unknown) => ['cinema', 'person', p] as const;
export const getGetCinemaSeasonQueryKey = (p: unknown) => ['cinema', 'season', p] as const;

/* ---------- Home ---------- */
interface HomeSection { id: string; title: string; mediaType?: string; items: MediaItem[] }
interface HomeData { hero: MediaItem[]; sections: HomeSection[] }
interface Paged { results: MediaItem[]; total_pages: number; total_results: number; page: number }

export function useGetCinemaHome(params: { language?: Lang }, opts?: Opts) {
  const language = params.language || 'en';
  const ar = language === 'ar';
  return useQuery<HomeData>({
    queryKey: ['cinema', 'home', params],
    ...opts?.query,
    queryFn: async () => {
      const today = new Date().toISOString().slice(0, 10);
      const get = async (path: string, extra: Record<string, unknown> = {}): Promise<MediaItem[]> => {
        try {
          return (await tmdb<Paged>(path, { language, ...extra })).results || [];
        } catch {
          return [];
        }
      };
      const soonParams = { 'primary_release_date.gte': today, sort_by: 'popularity.desc' };
      const [trending, nowPlaying, upcoming, soon1, soon2, onAir, movies, tv, topMovies, topTv] = await Promise.all([
        get('/trending/all/week'), get('/movie/now_playing'), get('/movie/upcoming'),
        get('/discover/movie', { ...soonParams, page: 1 }), get('/discover/movie', { ...soonParams, page: 2 }),
        get('/tv/on_the_air'), get('/movie/popular'), get('/tv/popular'), get('/movie/top_rated'), get('/tv/top_rated'),
      ]);
      if (![trending, nowPlaying, upcoming, onAir, movies, tv, topMovies, topTv].some(a => a.length)) {
        throw new Error('No data from TMDB');
      }
      const tr = trending.filter(i => i.media_type !== 'person');
      const hero = tr.filter(i => i.backdrop_path).slice(0, 6);
      const released = nowPlaying
        .filter(i => i.poster_path && String(i.release_date || '') <= today)
        .sort((a, b) => String(b.release_date || '').localeCompare(String(a.release_date || '')));
      const seen = new Set<number>();
      const soon = [...upcoming, ...soon1, ...soon2]
        .filter(i => {
          if (seen.has(i.id)) return false;
          seen.add(i.id);
          return i.poster_path && String(i.release_date || '') > today;
        })
        .sort((a, b) => String(a.release_date || '').localeCompare(String(b.release_date || '')))
        .slice(0, 20);
      return {
        hero,
        sections: [
          { id: 'now-playing', title: ar ? 'في السينما الآن' : 'In theaters now', mediaType: 'movie', items: released },
          { id: 'upcoming', title: ar ? 'قريباً في السينما' : 'Coming soon', mediaType: 'movie', items: soon },
          { id: 'on-air', title: ar ? 'مسلسلات تُعرض حالياً' : 'Currently airing series', mediaType: 'tv', items: onAir },
          { id: 'trending', title: ar ? 'الرائج هذا الأسبوع' : 'Trending this week', items: tr },
          { id: 'movies', title: ar ? 'أفلام شائعة' : 'Popular movies', mediaType: 'movie', items: movies },
          { id: 'tv', title: ar ? 'مسلسلات شائعة' : 'Popular series', mediaType: 'tv', items: tv },
          { id: 'top-movies', title: ar ? 'أفضل الأفلام تقييماً' : 'Top rated movies', mediaType: 'movie', items: topMovies },
          { id: 'top-tv', title: ar ? 'أفضل المسلسلات تقييماً' : 'Top rated series', mediaType: 'tv', items: topTv },
        ],
      };
    },
  });
}

/* ---------- Discover ---------- */
interface DiscoverParams {
  mediaType: 'movie' | 'tv'; language?: Lang; page?: number; genreId?: number;
  year?: number; minRating?: number; country?: string; sortBy?: string;
}
export function useDiscoverCinemaTitles(p: DiscoverParams, opts?: Opts) {
  return useQuery<Paged>({
    queryKey: getDiscoverCinemaTitlesQueryKey(p),
    ...opts?.query,
    queryFn: () => {
      const today = new Date().toISOString().slice(0, 10);
      const isTv = p.mediaType === 'tv';
      const sort = p.sortBy || 'popularity.desc';
      return tmdb<Paged>(`/discover/${p.mediaType}`, {
        language: p.language, page: p.page || 1,
        sort_by: sort,
        with_genres: p.genreId,
        [isTv ? 'first_air_date_year' : 'primary_release_year']: p.year,
        'vote_average.gte': p.minRating,
        with_origin_country: p.country,
        'vote_count.gte': sort.startsWith('vote_average') ? 200 : undefined,
        [isTv ? 'first_air_date.lte' : 'primary_release_date.lte']: sort.includes('date') ? today : undefined,
      });
    },
  });
}

/* ---------- Search ---------- */
export function useSearchCinema(p: { query: string; language?: Lang; page?: number }, opts?: Opts) {
  return useQuery<Paged>({
    queryKey: getSearchCinemaQueryKey(p),
    ...opts?.query,
    queryFn: () => tmdb<Paged>('/search/multi', { query: p.query, language: p.language, page: p.page || 1 }),
  });
}

/* ---------- Genres ---------- */
export function useGetCinemaGenres(p: { mediaType: 'movie' | 'tv'; language?: Lang }, opts?: Opts) {
  return useQuery<{ genres: { id: number; name: string }[] }>({
    queryKey: getGetCinemaGenresQueryKey(p),
    ...opts?.query,
    queryFn: () => tmdb(`/genre/${p.mediaType}/list`, { language: p.language }),
  });
}

/* ---------- Title details ---------- */
export function useGetCinemaTitle(p: { mediaType: 'movie' | 'tv'; id: number; language?: Lang }, opts?: Opts) {
  return useQuery<MediaDetails>({
    queryKey: getGetCinemaTitleQueryKey(p),
    ...opts?.query,
    queryFn: () => tmdb<MediaDetails>(`/${p.mediaType}/${p.id}`, {
      language: p.language,
      append_to_response: 'credits,images,videos,recommendations,similar,watch/providers',
      include_image_language: `${p.language || 'en'},en,null`,
      include_video_language: `${p.language || 'en'},en`,
    }),
  });
}

/* ---------- Person ---------- */
export function useGetCinemaPerson(p: { id: number; language?: Lang }, opts?: Opts) {
  return useQuery<PersonDetails>({
    queryKey: getGetCinemaPersonQueryKey(p),
    ...opts?.query,
    queryFn: () => tmdb<PersonDetails>(`/person/${p.id}`, { language: p.language, append_to_response: 'combined_credits' }),
  });
}

/* ---------- Season ---------- */
export function useGetCinemaSeason(p: { id: number; seasonNumber: number; language?: Lang }, opts?: Opts) {
  return useQuery<{ episodes?: unknown[]; [key: string]: unknown }>({
    queryKey: getGetCinemaSeasonQueryKey(p),
    ...opts?.query,
    queryFn: () => tmdb(`/tv/${p.id}/season/${p.seasonNumber}`, { language: p.language }),
  });
}
