import { handleTmdbRequest } from "../../../shared/tmdb-handler";

type CloudflareEnv = { TMDB_API_KEY?: string };

export function onRequest({
  request,
  env,
}: {
  request: Request;
  env: CloudflareEnv;
}): Promise<Response> {
  return handleTmdbRequest(request, env.TMDB_API_KEY);
}
