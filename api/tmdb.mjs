// Vercel serverless proxy. Never put a TMDB credential in browser JavaScript.
// Using a fixed allowlist prevents arbitrary URLs and secret forwarding.
const ALLOWED_MEDIA = new Set(["movie", "tv"]);
export default async function handler(req, res) {
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  if (req.method !== "GET") return res.status(405).json({ error: "Only GET is supported." });
  const token = process.env.TMDB_READ_ACCESS_TOKEN;
  if (!token) return res.status(503).json({ error: "TMDB_READ_ACCESS_TOKEN is not configured on Vercel." });

  const params = new URL(req.url, "https://film-atlas.invalid").searchParams;
  const mode = params.get("mode");
  let path, query = new URLSearchParams({ language: "en-US" });
  if (mode === "health") {
    try {
      const status = await fetch("https://api.themoviedb.org/3/authentication", {
        headers: { Authorization: "Bearer " + token, Accept: "application/json" },
        signal: AbortSignal.timeout(11000)
      });
      if (!status.ok) return res.status(status.status === 401 ? 401 : 502).json({
        error: status.status === 401 ? "TMDB rejected the token. Check the API Read Access Token on Vercel." : "TMDB credential check failed."
      });
      const body = await status.json();
      if (body.success !== true) return res.status(502).json({error:"TMDB did not confirm the credentials."});
      return res.status(200).json({configured:true,verified:true});
    } catch {
      return res.status(502).json({error:"Could not reach TMDB to verify credentials."});
    }
  }
  if (mode === "search") {
    const term = (params.get("query") || "").trim();
    if (term.length < 2 || term.length > 120) return res.status(400).json({ error: "Search query must be between 2 and 120 characters." });
    path = "/3/search/multi";
    query.set("query", term);
    query.set("include_adult", "false");
    query.set("page", "1");
  } else if (mode === "details") {
    const media = params.get("media");
    const id = params.get("id") || "";
    if (!ALLOWED_MEDIA.has(media) || !/^[1-9][0-9]{0,9}$/.test(id)) return res.status(400).json({ error: "Invalid film identifier." });
    path = "/3/" + media + "/" + id;
    query.set("append_to_response", "credits");
  } else {
    return res.status(400).json({ error: "Unknown operation." });
  }

  const target = "https://api.themoviedb.org" + path + "?" + query.toString();
  try {
    const upstream = await fetch(target, {
      headers: { Authorization: "Bearer " + token, Accept: "application/json" },
      signal: AbortSignal.timeout(11000)
    });
    if (!upstream.ok) {
      const status = [401, 403, 404, 429].includes(upstream.status) ? upstream.status : 502;
      return res.status(status).json({
        error: upstream.status === 401 ? "TMDB rejected the token. Check the API Read Access Token on Vercel."
          : upstream.status === 429 ? "TMDB rate limit reached. Try again later."
          : "TMDB request failed (status " + upstream.status + ")."
      });
    }
    const data = await upstream.json();
    if (mode === "search") {
      const results = Array.isArray(data.results) ? data.results.filter(x => ALLOWED_MEDIA.has(x.media_type)).slice(0, 20) : [];
      return res.status(200).json({ results: results.map(x => ({
        id: x.id, media_type: x.media_type, title: x.title || x.name,
        original_title: x.original_title || x.original_name,
        release_date: x.release_date || x.first_air_date || "", poster_path: x.poster_path || "",
        overview: x.overview || ""
      })) });
    }
    return res.status(200).json(data);
  } catch (e) {
    return res.status(502).json({ error: "TMDB connection timed out or failed." });
  }
}
