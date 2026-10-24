import { handleTmdbRequest } from "../../shared/tmdb-handler";

export const config = { runtime: "edge" };

export default function handler(request: Request): Promise<Response> {
  return handleTmdbRequest(request, process.env.TMDB_API_KEY);
}
