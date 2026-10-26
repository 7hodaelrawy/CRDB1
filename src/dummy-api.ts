export const useGetCinemaHome = () => ({ data: null, isLoading: false, error: null });
export const useDiscoverCinemaTitles = () => ({ data: { results: [] }, isLoading: false, error: null });
export const useSearchCinema = () => ({ data: { results: [] }, isLoading: false, error: null });
export const useGetCinemaGenres = () => ({ data: [], isLoading: false, error: null });
export const useGetCinemaTitle = () => ({ data: null, isLoading: false, error: null });
export const useGetCinemaPerson = () => ({ data: null, isLoading: false, error: null });
export const useGetCinemaSeason = () => ({ data: null, isLoading: false, error: null });

export const getDiscoverCinemaTitlesQueryKey = () => ['discover'];
export const getSearchCinemaQueryKey = () => ['search'];
export const getGetCinemaGenresQueryKey = () => ['genres'];
export const getGetCinemaTitleQueryKey = () => ['title'];
export const getGetCinemaPersonQueryKey = () => ['person'];
export const getGetCinemaSeasonQueryKey = () => ['season'];
