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
export interface EpisodeRating {
  season: number;
  episode: number;
  name: string;
  rating: number;
  votes: number;
  airDate: string;
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
      const released = nowPlaying
        .filter(i => i.poster_path && String(i.release_date || '') <= today)
        .sort((a, b) => String(b.release_date || '').localeCompare(String(a.release_date || '')));
      const seen = new Set<number>();
      const soonAll = [...soon1, ...soon2, ...upcoming]
        .filter(i => {
          if (seen.has(i.id)) return false;
          seen.add(i.id);
          return i.poster_path && String(i.release_date || '') > today;
        })
        .map(i => ({ ...i, media_type: 'movie' }));
      const soon = soonAll
        .slice()
        .sort((a, b) => String(a.release_date || '').localeCompare(String(b.release_date || '')))
        .slice(0, 20);
      const upcomingHero = soonAll
        .filter(i => i.backdrop_path)
        .sort((a, b) => Number(b.popularity || 0) - Number(a.popularity || 0))
        .slice(0, 6);
      const hero = upcomingHero.length >= 3
        ? upcomingHero
        : [...upcomingHero, ...tr.filter(i => i.backdrop_path)].slice(0, 6);
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

/* ---------- Top 250 (weighted rating) ---------- */
export function useGetCinemaTop(p: { mediaType: 'movie' | 'tv'; language?: Lang }, opts?: Opts) {
  return useQuery<MediaItem[]>({
    queryKey: ['cinema', 'top250', p],
    staleTime: 60 * 60 * 1000,
    ...opts?.query,
    queryFn: async () => {
      const pages = await Promise.all(
        Array.from({ length: 13 }, (_, i) => i + 1).map(page =>
          tmdb<Paged>(`/${p.mediaType}/top_rated`, { language: p.language, page })
            .then(r => r.results || [])
            .catch(() => [] as MediaItem[]),
        ),
      );
      const seen = new Set<number>();
      const pool = pages.flat().filter(i => {
        if (seen.has(i.id) || !i.poster_path) return false;
        seen.add(i.id);
        return true;
      });
      if (!pool.length) throw new Error('No data from TMDB');
      const m = p.mediaType === 'tv' ? 400 : 2000;
      const mean = pool.reduce((sum, i) => sum + Number(i.vote_average || 0), 0) / pool.length;
      const weighted = (i: MediaItem) => {
        const v = Number(i.vote_count || 0);
        const r = Number(i.vote_average || 0);
        return (v / (v + m)) * r + (m / (v + m)) * mean;
      };
      return pool
        .map(i => ({ ...i, media_type: p.mediaType, wr: weighted(i) }))
        .sort((a, b) => Number(b.wr) - Number(a.wr))
        .slice(0, 250);
    },
  });
}

/* ---------- Upcoming calendar ---------- */
export function useGetCinemaUpcoming(p: { language?: Lang }, opts?: Opts) {
  return useQuery<MediaItem[]>({
    queryKey: ['cinema', 'upcoming', p],
    staleTime: 30 * 60 * 1000,
    ...opts?.query,
    queryFn: async () => {
      const now = new Date();
      const iso = (d: Date) => d.toISOString().slice(0, 10);
      const from = iso(now);
      const to = iso(new Date(now.getTime() + 150 * 86400000));
      const pages = await Promise.all(
        [1, 2, 3, 4, 5].map(page =>
          tmdb<Paged>('/discover/movie', {
            language: p.language,
            page,
            sort_by: 'popularity.desc',
            'primary_release_date.gte': from,
            'primary_release_date.lte': to,
            with_release_type: '2|3',
          })
            .then(r => r.results || [])
            .catch(() => [] as MediaItem[]),
        ),
      );
      const seen = new Set<number>();
      return pages
        .flat()
        .filter(i => {
          if (seen.has(i.id) || !i.poster_path || !i.release_date) return false;
          seen.add(i.id);
          return true;
        })
        .map(i => ({ ...i, media_type: 'movie' }))
        .sort((a, b) => String(a.release_date).localeCompare(String(b.release_date)));
    },
  });
}

/* ---------- Episode ratings (all seasons) ---------- */
export function useGetCinemaEpisodeRatings(p: { id: number; seasonNumbers: number[]; language?: Lang }, opts?: Opts) {
  return useQuery<EpisodeRating[]>({
    queryKey: ['cinema', 'episode-ratings', p],
    staleTime: 60 * 60 * 1000,
    ...opts?.query,
    queryFn: async () => {
      const seasons = await Promise.all(
        p.seasonNumbers.slice(0, 30).map(n =>
          tmdb<{ episodes?: Array<Record<string, unknown>> }>(`/tv/${p.id}/season/${n}`, { language: p.language })
            .then(r => ({ n, eps: r.episodes || [] }))
            .catch(() => ({ n, eps: [] as Array<Record<string, unknown>> })),
        ),
      );
      return seasons.flatMap(({ n, eps }) =>
        eps.map(e => ({
          season: n,
          episode: Number(e.episode_number || 0),
          name: String(e.name || ''),
          rating: Number(e.vote_average || 0),
          votes: Number(e.vote_count || 0),
          airDate: String(e.air_date || ''),
        })),
      );
    },
  });
}

/* ---------- Trailer (YouTube key) ---------- */
export function useGetCinemaTrailer(p: { mediaType: 'movie' | 'tv'; id: number; language?: Lang }, opts?: Opts) {
  return useQuery<string | null>({
    queryKey: ['cinema', 'trailer', p],
    staleTime: 30 * 60 * 1000,
    ...opts?.query,
    queryFn: async () => {
      const lang = p.language || 'en';
      const data = await tmdb<{ results?: Array<{ key: string; site: string; type: string; official?: boolean }> }>(
        `/${p.mediaType}/${p.id}/videos`,
        { include_video_language: `en,${lang}` },
      );
      const vids = (data.results || []).filter(v => v.site === 'YouTube');
      const best =
        vids.find(v => v.type === 'Trailer' && v.official) ||
        vids.find(v => v.type === 'Trailer') ||
        vids.find(v => v.type === 'Teaser');
      return best ? best.key : null;
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
