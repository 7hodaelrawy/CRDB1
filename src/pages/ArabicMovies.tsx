
import { useQuery } from '@tanstack/react-query';

interface Movie {
  id: number;
  title: string;
  poster_path: string | null;
  vote_average: number;
  release_date: string;
}

interface ApiResponse {
  results: Movie[];
}

export default function ArabicMovies() {
  const { data, isLoading, isError } = useQuery<ApiResponse>({
    queryKey: ['arabic-movies'],
    queryFn: async () => {
      const res = await fetch('/api/arabic-movies');
      if (!res.ok) throw new Error('Network response was not ok');
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="text-xl font-bold animate-pulse text-gray-500">جاري تحميل الأفلام العربية...</div>
      </div>
    );
  }

  if (isError || !data?.results) {
    return (
      <div className="text-center text-red-500 mt-10">
        حدث خطأ أثناء تحميل الأفلام. يرجى المحاولة لاحقاً.
      </div>
    );
  }

  return (
    <div className="p-4 md:p-8 max-w-7xl mx-auto" dir="rtl">
      <h1 className="text-3xl font-extrabold mb-8 text-gray-900 dark:text-white">
        أفلام عربية <span className="text-sm font-normal text-gray-500">(الأكثر شعبية)</span>
      </h1>
      
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
        {data.results.map((movie) => (
          <a key={movie.id} href={`/movie/${movie.id}`} className="group relative rounded-xl overflow-hidden shadow-lg transition-transform duration-300 hover:scale-105 hover:shadow-2xl block bg-gray-100 dark:bg-gray-800">
            {movie.poster_path ? (
              <img 
                src={`/img/w500${movie.poster_path}`} 
                alt={movie.title} 
                className="w-full h-auto object-cover aspect-[2/3]"
                loading="lazy"
              />
            ) : (
              <div className="w-full aspect-[2/3] flex items-center justify-center text-gray-400 bg-gray-200 dark:bg-gray-700">
                لا توجد صورة
              </div>
            )}
            
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>
            
            <div className="absolute bottom-0 left-0 right-0 p-3 text-white transform translate-y-2 group-hover:translate-y-0 transition-transform duration-300">
              <h3 className="font-bold text-sm md:text-base line-clamp-2">{movie.title}</h3>
              <div className="flex items-center justify-between mt-1 text-xs md:text-sm">
                <span className="text-yellow-400 font-bold">★ {movie.vote_average.toFixed(1)}</span>
                <span className="text-gray-300">{movie.release_date?.split('-')[0] || ''}</span>
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  );
}
