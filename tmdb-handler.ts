const TMDB_API = "https://api.themoviedb.org/3";
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { expiresAt: number; value: unknown }>();
const pending = new Map<string, Promise<unknown>>();

type ProviderObject = Record<string, unknown>;
type ProviderPage = {
  page?: number;
  results?: ProviderObject[];
  total_pages?: number;
  total_results?: number;
};

class ProviderError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": status < 400 ? "public, max-age=60, s-maxage=600" : "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function invalid(message: string): Response {
  return json({ error: message }, 400);
}

function languageFrom(url: URL): "ar" | "en" | null {
  const language = url.searchParams.get("language") ?? "ar";
  return language === "ar" || language === "en" ? language : null;
}

function languageParams(language: "ar" | "en"): Record<string, string> {
  return { language: language === "en" ? "en-US" : "ar" };
}

function integerParam(
  url: URL,
  name: string,
  minimum: number,
  maximum = Number.MAX_SAFE_INTEGER,
  defaultValue?: number,
): number | null {
  const raw = url.searchParams.get(name);
  if (raw === null || raw === "") return defaultValue ?? null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= minimum && value <= maximum
    ? value
    : null;
}

function mediaTypeFrom(url: URL): "movie" | "tv" | null {
  const value = url.searchParams.get("mediaType");
  return value === "movie" || value === "tv" ? value : null;
}

function cacheKey(path: string, params: Record<string, string>): string {
  const query = new URLSearchParams(
    Object.entries(params).sort(([left], [right]) => left.localeCompare(right)),
  );
  return `${path}?${query.toString()}`;
}

async function tmdb<T>(
  path: string,
  params: Record<string, string>,
  apiKey: string,
): Promise<T> {
  const key = cacheKey(path, params);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;
  if (cached) cache.delete(key);

  const existing = pending.get(key);
  if (existing) return (await existing) as T;

  const request = (async (): Promise<unknown> => {
    const url = new URL(`${TMDB_API}${path}`);
    url.searchParams.set("api_key", apiKey);
    for (const [name, value] of Object.entries(params)) {
      url.searchParams.set(name, value);
    }

    let response: Response;
    try {
      response = await fetch(url, { signal: AbortSignal.timeout(8_000) });
    } catch {
      throw new ProviderError(502, "تعذر الاتصال بمصدر بيانات الأفلام.");
    }

    if (response.status === 404) {
      throw new ProviderError(404, "لم يتم العثور على هذا المحتوى.");
    }
    if (!response.ok) {
      throw new ProviderError(502, "تعذر تحميل بيانات الأفلام حاليًا.");
    }

    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new ProviderError(502, "وصلت استجابة غير صالحة من مصدر البيانات.");
    }

    cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, value: body });
    if (cache.size > 2_000) {
      const now = Date.now();
      for (const [cacheKeyValue, entry] of cache) {
        if (entry.expiresAt <= now) cache.delete(cacheKeyValue);
      }
    }
    return body;
  })();

  pending.set(key, request);
  try {
    return (await request) as T;
  } finally {
    pending.delete(key);
  }
}

function resultsOf(value: unknown): ProviderObject[] {
  if (
    typeof value === "object" &&
    value !== null &&
    "results" in value &&
    Array.isArray(value.results)
  ) {
    return value.results.filter(
      (item): item is ProviderObject =>
        typeof item === "object" && item !== null,
    );
  }
  return [];
}

function withMediaType(
  items: ProviderObject[],
  mediaType: "movie" | "tv" | "person",
): ProviderObject[] {
  return items.map((item) => ({
    ...item,
    media_type:
      typeof item.media_type === "string" ? item.media_type : mediaType,
  }));
}

function uniqueItems(
  items: ProviderObject[],
  mediaType: "movie" | "tv" | "person",
  seen: Set<string>,
  limit = 10,
): ProviderObject[] {
  const unique: ProviderObject[] = [];
  for (const item of items) {
    if (typeof item.id !== "number") continue;
    const key = `${mediaType}:${item.id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push({ ...item, media_type: mediaType });
    if (unique.length >= limit) break;
  }
  return unique;
}

function providerPage(data: ProviderPage, requestedPage: number) {
  const results = resultsOf(data);
  return {
    page: data.page ?? requestedPage,
    results,
    total_pages: data.total_pages ?? 0,
    total_results: data.total_results ?? results.length,
  };
}

async function routeRequest(
  route: string,
  url: URL,
  apiKey: string,
): Promise<Response> {
  const language = languageFrom(url);
  if (!language) return invalid("لغة العرض غير صالحة.");

  if (route === "home") {
    const languageQuery = languageParams(language);
    const [
      trendingWeek,
      trendingDay,
      popularMovies,
      topMovies,
      upcomingMovies,
      nowPlaying,
      popularTv,
      topTv,
      popularPeople,
    ] = await Promise.all([
      tmdb<ProviderPage>("/trending/all/week", languageQuery, apiKey),
      tmdb<ProviderPage>("/trending/all/day", languageQuery, apiKey),
      tmdb<ProviderPage>("/movie/popular", languageQuery, apiKey),
      tmdb<ProviderPage>("/movie/top_rated", languageQuery, apiKey),
      tmdb<ProviderPage>("/movie/upcoming", languageQuery, apiKey),
      tmdb<ProviderPage>("/movie/now_playing", languageQuery, apiKey),
      tmdb<ProviderPage>("/tv/popular", languageQuery, apiKey),
      tmdb<ProviderPage>("/tv/top_rated", languageQuery, apiKey),
      tmdb<ProviderPage>("/person/popular", languageQuery, apiKey),
    ]);

    const hero: ProviderObject[] = resultsOf(trendingWeek)
      .filter((item) => item.media_type !== "person" && item.backdrop_path)
      .slice(0, 5)
      .map((item) => ({
        ...item,
        media_type: item.media_type === "tv" ? "tv" : "movie",
      }));
    const seen = new Set<string>();
    for (const item of hero) {
      if (typeof item.id === "number") {
        seen.add(`${item.media_type}:${item.id}`);
      }
    }

    const section = (
      id: string,
      title: string,
      mediaType: "movie" | "tv" | "person",
      data: ProviderPage,
    ) => ({
      id,
      title,
      mediaType,
      items: uniqueItems(resultsOf(data), mediaType, seen),
    });

    return json({
      hero,
      sections: [
        section("trending", "رائج الآن", "movie", trendingDay),
        section("top-movies", "أعلى الأفلام تقييمًا", "movie", topMovies),
        section("popular-movies", "الأفلام الأكثر شعبية", "movie", popularMovies),
        section("upcoming", "الأفلام القادمة", "movie", upcomingMovies),
        section("now-playing", "يعرض الآن", "movie", nowPlaying),
        section("popular-tv", "أشهر المسلسلات", "tv", popularTv),
        section("top-tv", "أعلى المسلسلات تقييمًا", "tv", topTv),
        section("popular-people", "أشهر صناع السينما", "person", popularPeople),
      ],
    });
  }

  if (route === "discover") {
    const mediaType = mediaTypeFrom(url);
    if (!mediaType) return invalid("نوع المحتوى غير صالح.");
    const page = integerParam(url, "page", 1, 500, 1);
    const genreId = integerParam(url, "genreId", 1);
    const year = integerParam(url, "year", 1870, 2100);
    const minRatingRaw = url.searchParams.get("minRating");
    const minRating =
      minRatingRaw === null
        ? undefined
        : Number.isFinite(Number(minRatingRaw)) &&
            Number(minRatingRaw) >= 0 &&
            Number(minRatingRaw) <= 10
          ? Number(minRatingRaw)
          : null;
    const countryRaw = url.searchParams.get("country");
    const country = countryRaw?.toUpperCase();
    const sortBy =
      url.searchParams.get("sortBy") || "popularity.desc";
    const allowedSorts = new Set([
      "popularity.desc",
      "vote_average.desc",
      "primary_release_date.desc",
      "first_air_date.desc",
    ]);
    if (
      page === null ||
      (url.searchParams.has("genreId") && genreId === null) ||
      (url.searchParams.has("year") && year === null) ||
      minRating === null ||
      (country !== undefined && !/^[A-Z]{2}$/.test(country)) ||
      !allowedSorts.has(sortBy)
    ) {
      return invalid("فلاتر البحث غير صالحة.");
    }

    const params: Record<string, string> = {
      ...languageParams(language),
      page: String(page),
      sort_by: sortBy,
      include_adult: "false",
      "vote_count.gte": "20",
    };
    if (genreId !== null) params.with_genres = String(genreId);
    if (year !== null) {
      params[mediaType === "movie" ? "primary_release_year" : "first_air_date_year"] =
        String(year);
    }
    if (minRating !== undefined) params["vote_average.gte"] = String(minRating);
    if (country) params.with_origin_country = country;

    const data = await tmdb<ProviderPage>(
      `/discover/${mediaType}`,
      params,
      apiKey,
    );
    return json({
      ...providerPage(data, page),
      results: withMediaType(resultsOf(data), mediaType),
    });
  }

  if (route === "search") {
    const query = (url.searchParams.get("query") ?? "").trim();
    const page = integerParam(url, "page", 1, 500, 1);
    if (query.length < 2 || query.length > 120 || page === null) {
      return invalid("اكتب حرفين على الأقل للبحث.");
    }
    const data = await tmdb<ProviderPage>("/search/multi", {
      ...languageParams(language),
      query,
      page: String(page),
      include_adult: "false",
    }, apiKey);
    const results = resultsOf(data).filter((item) =>
      ["movie", "tv", "person"].includes(String(item.media_type)),
    );
    return json({
      page: data.page ?? page,
      results,
      total_pages: data.total_pages ?? 0,
      total_results: data.total_results ?? results.length,
    });
  }

  if (route === "genres") {
    const mediaType = mediaTypeFrom(url);
    if (!mediaType) return invalid("نوع المحتوى غير صالح.");
    return json(
      await tmdb(`/genre/${mediaType}/list`, languageParams(language), apiKey),
    );
  }

  if (route === "title") {
    const mediaType = mediaTypeFrom(url);
    const id = integerParam(url, "id", 1);
    if (!mediaType || id === null) {
      return invalid("رقم العمل أو نوعه غير صالح.");
    }
    const data = await tmdb<ProviderObject>(`/${mediaType}/${id}`, {
      ...languageParams(language),
      append_to_response:
        "credits,videos,recommendations,similar,images,keywords,watch/providers,release_dates",
    }, apiKey);
    return json({ ...data, media_type: mediaType });
  }

  if (route === "person") {
    const id = integerParam(url, "id", 1);
    if (id === null) return invalid("رقم الشخص غير صالح.");
    return json(
      await tmdb(`/person/${id}`, {
        ...languageParams(language),
        append_to_response: "combined_credits,images,external_ids",
      }, apiKey),
    );
  }

  if (route === "season") {
    const id = integerParam(url, "id", 1);
    const seasonNumber = integerParam(url, "seasonNumber", 0);
    if (id === null || seasonNumber === null) {
      return invalid("رقم الموسم أو المسلسل غير صالح.");
    }
    return json(
      await tmdb(
        `/tv/${id}/season/${seasonNumber}`,
        languageParams(language),
        apiKey,
      ),
    );
  }

  return json({ error: "المسار غير موجود." }, 404);
}

export async function handleTmdbRequest(
  request: Request,
  apiKey?: string,
): Promise<Response> {
  if (request.method !== "GET") {
    return json({ error: "الطريقة غير مدعومة." }, 405);
  }
  if (!apiKey) {
    return json({ error: "مصدر بيانات الأفلام غير مُعدّ حاليًا." }, 503);
  }

  const url = new URL(request.url);
  const route = url.pathname.replace(/^\/api\/tmdb\/?/, "").replace(/\/+$/, "");
  try {
    return await routeRequest(route, url, apiKey);
  } catch (error) {
    if (error instanceof ProviderError) {
      return json({ error: error.message }, error.statusCode);
    }
    return json({ error: "تعذر تحميل بيانات الأفلام حاليًا." }, 502);
  }
}
