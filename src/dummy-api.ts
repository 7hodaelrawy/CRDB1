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

const KEY = (import.meta.env.VITE_TMDB_API_KEY as string | undefined)?.trim();

async function tmdb<T>(path: string, params: Record<string, unknown> = {}): Promise<T> {
  if (!KEY) throw new Error('Missing VITE_TMDB_API_KEY');
  const url = new URL(`https://api.themoviedb.org/3${path}`);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
  });
  const headers: Record<string, string> = {};
  if (KEY.length > 40) headers.Authorization = `Bearer ${KEY}`;
  else url.searchParams.set('api_key', KEY);
  const res = await fetch(url.toString(), { headers });
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
      const [trending, movies, tv, topMovies, topTv] = await Promise.all([
        tmdb<Paged>('/trending/all/week', { language }),
        tmdb<Paged>('/movie/popular', { language }),
        tmdb<Paged>('/tv/popular', { language }),
        tmdb<Paged>('/movie/top_rated', { language }),
        tmdb<Paged>('/tv/top_rated', { language }),
      ]);
      const tr = trending.results.filter(i => i.media_type !== 'person');
      const hero = tr.filter(i => i.backdrop_path).slice(0, 1);
      return {
        hero,
        sections: [
          { id: 'trending', title: ar ? 'الرائج هذا الأسبوع' : 'Trending this week', items: tr },
          { id: 'movies', title: ar ? 'أفلام شائعة' : 'Popular movies', mediaType: 'movie', items: movies.results },
          { id: 'tv', title: ar ? 'مسلسلات شائعة' : 'Popular series', mediaType: 'tv', items: tv.results },
          { id: 'top-movies', title: ar ? 'أفضل الأفلام تقييماً' : 'Top rated movies', mediaType: 'movie', items: topMovies.results },
          { id: 'top-tv', title: ar ? 'أفضل المسلسلات تقييماً' : 'Top rated series', mediaType: 'tv', items: topTv.results },
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
