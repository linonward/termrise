// A stub fetch that answers like DataForSEO v3 (response shapes from
// docs.dataforseo.com/v3): tests never call the real API.
export type DataForSeoRoute = {
  status?: number;
  statusCode?: number;
  taskStatusCode?: number;
  cost?: number;
  result?: unknown[];
};

export function dataForSeoFetch(routes: Record<string, DataForSeoRoute>) {
  const calls: { path: string; headers: Headers; body: unknown }[] = [];
  const fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input)).pathname.replace(/^\/v3\//, "");
    calls.push({
      path,
      headers: new Headers(init?.headers),
      body: JSON.parse(String(init?.body)),
    });
    const route = routes[path];
    if (!route) return new Response("not found", { status: 404 });
    return new Response(
      JSON.stringify({
        version: "0.1",
        status_code: route.statusCode ?? 20000,
        status_message: "Ok.",
        cost: route.cost ?? 0,
        tasks_count: 1,
        tasks_error: 0,
        tasks: [
          {
            id: "task-1",
            status_code: route.taskStatusCode ?? 20000,
            status_message: "Ok.",
            cost: route.cost ?? 0,
            result_count: route.result?.length ?? 0,
            result: route.result ?? null,
          },
        ],
      }),
      {
        status: route.status ?? 200,
        headers: { "content-type": "application/json" },
      },
    );
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

export const ADS = "keywords_data/google_ads/keywords_for_keywords/live";
export const KD = "dataforseo_labs/google/bulk_keyword_difficulty/live";
export const SERP = "serp/google/organic/live/advanced";
