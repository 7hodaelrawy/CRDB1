import { useQuery } from '@tanstack/react-query';

const TMDB_API_KEY = '5e11ae6a3daf0069b9c7c9f603bb2355';
const BASE = 'https://api.themoviedb.org/3';

const fetchTMDB = async (path: string) => {
  const res = await fetch(`${BASE}${path}?api_key=${TMDB_API_KEY}&language=ar`);
  if (!res.ok) throw new Error('Error');
  return res.json();
};

export const useGetCinemaHome = () => useQuery({
  queryKey: ['home'],
  queryFn: () => fetchTMDB('/trending/all/week')
});

export const useDiscoverCinemaTitles = () => useQuery({
  queryKey: ['discover'],
  queryFn: () => fetchTMDB('/discover/movie')
});

export const useSearchCinema = (query: string) => useQuery({
  queryKey: ['search', query],
  queryFn: () => fetchTMDB(`/search/multi?query=${query}`),
  enabled: !!query
});

export const useGetCinemaGenres = () => useQuery({
  queryKey: ['genres'],
  queryFn: () => fetchTMDB('/genre/movie/list')
});

export const useGetCinemaTitle = (id: string) => useQuery({
  queryKey: ['title', id],
  queryFn: () => fetchTMDB(`/movie/${id}`),
  enabled: !!id
});

export const useGetCinemaPerson = (id: string) => useQuery({
  queryKey: ['person', id],
  queryFn: () => fetchTMDB(`/person/${id}`),
  enabled: !!id
});

export const useGetCinemaSeason = (id: string) => useQuery({
  queryKey: ['season', id],
  queryFn: () => fetchTMDB(`/tv/${id}`),
  enabled: !!id
});

export const getDiscoverCinemaTitlesQueryKey = () => ['discover'];
export const getSearchCinemaQueryKey = (q: string) => ['search', q];
export const getGetCinemaGenresQueryKey = () => ['genres'];
export const getGetCinemaTitleQueryKey = (id: string) => ['title', id];
export const getGetCinemaPersonQueryKey = (id: string) => ['person', id];
export const getGetCinemaSeasonQueryKey = (id: string) => ['season', id];
