/* Film Atlas TMDB enrichment. Uses the secure /api/tmdb endpoint; credentials never reach the browser. */
(function () {
  "use strict";
  const API = "/api/tmdb";
  const escape = escapeHtml;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  let running = false, cancel = false, currentEditor = null;
  function yearOf(item) { return String(item.release_date || "").slice(0, 4); }
  async function call(params) {
    const url = API + "?" + new URLSearchParams(params);
    const res = await fetch(url, { headers: { Accept: "application/json" } });
    let data;
    try { data = await res.json(); } catch { throw Error("Invalid response. Is this site deployed on Vercel?"); }
    if (!res.ok) throw Error(data.error || "TMDB request failed (" + res.status + ").");
    return data;
  }
  function normalized(s) {
    return String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  function selectMatch(f, list) {
    const title = normalized(f.title), yr = Number(f.year);
    const exact = list.filter(x => normalized(x.title) === title || normalized(x.original_title) === title);
    const candidates = exact.filter(x => x.media_type === "movie" && Math.abs(Number(yearOf(x)) - yr) <= 1);
    if (candidates.length !== 1) return null;
    if (String(candidates[0].title || "") === "" || !candidates[0].id) return null;
    // A strict, unique movie + title + release year match minimizes false positives.
    return candidates[0];
  }
  function names(people) { return [...new Set(people.filter(Boolean).map(x => typeof x === "string" ? x : x.name).filter(Boolean))].join("|"); }
  function deriveType(data, media) {
    if (media === "tv") return "series";
    const documentary = (data.genres || []).some(g => g.id === 99 || String(g.name).toLowerCase() === "documentary");
    if (documentary) return "documentary";
    if (data.runtime && data.runtime < 40) return "short";
    return "feature";
  }
  function toFields(data, media) {
    const crew = data.credits?.crew || [], cast = data.credits?.cast || [];
    return {
      tmdbId: Number(data.id), tmdbMedia: media, tmdbStatus: "matched",
      poster: data.poster_path ? "https://image.tmdb.org/t/p/w500" + data.poster_path : "",
      type: deriveType(data, media),
      directors: names(crew.filter(p => p.job === "Director")),
      actors: names(cast.slice(0, 40)),
      composers: names(crew.filter(p => /original music composer|music by|composer/i.test(p.job || ""))),
      studios: names(data.production_companies || []),
      countries: names((data.production_countries || []).map(x => x.name)),
      genres: names(data.genres || []),
      runtime: data.runtime || null
    };
  }
  async function apply(f, result) {
    const data = await call({ mode: "details", media: result.media_type, id: String(result.id) });
    Object.assign(f, toFields(data, result.media_type));
    save();
  }
  function refreshReviewQueue() {
    const holder = document.querySelector("#tmdbReviewQueue");
    if (!holder) return;
    const items = state.records.filter(f => f.tmdbStatus === "review" && !f.tmdbId);
    holder.innerHTML = '<div class="between spaced"><h3 style="margin:0">Needs manual review: ' + items.length +
      '</h3><span class="muted small">From all imported titles, including hidden types</span></div>' +
      (items.length
        ? '<p class="hint">These titles were not matched automatically. Click <strong>Review</strong>, search for the right film (try an alternate or original title), select the correct result, and save.</p>' +
          '<div class="stack">' + items.slice(0,100).map(f =>
            '<div class="between" style="border-bottom:1px solid var(--border);padding:9px 0">' +
            '<div><strong>' + escape(f.title) + '</strong> <span class="muted">(' + escape(f.year || "year unknown") + ')</span></div>' +
            '<button type="button" class="button button-sm" data-review-id="' + escape(f.id) + '">Review</button></div>'
          ).join("") + '</div>' +
          (items.length > 100 ? '<p class="hint">Showing the first 100. More will appear as you resolve these.</p>' : '')
        : '<p class="hint">All caught up! Films requiring manual review will appear here after future batches.</p>');
    holder.querySelectorAll("[data-review-id]").forEach(button => {
      button.addEventListener("click", () => {
        openEditor(button.dataset.reviewId);
        const search = document.querySelector("#tmdbSearchButton");
        if (search) search.click();
      });
    });
  }
  function panel() {
    if (state.page !== "settings") return;
    const main = document.querySelector("#app");
    if (!main || main.querySelector("#tmdbPanel")) return;
    const article = document.createElement("div");
    article.className = "panel";
    article.id = "tmdbPanel";
    article.innerHTML = '<h2>Automatic movie metadata</h2><p class="hint">Connects through the server-side TMDB proxy. Films only auto-match when exactly one movie has the same normalized title and a release year within one year. Otherwise they appear in the review queue below. Your ratings and watched status are never overwritten.</p><div class="controls"><button id="testTmdb" class="button">Test connection</button><button id="enrichTmdb" class="button button-primary">Enrich next 25 films</button><button id="stopTmdb" class="button" disabled>Stop</button></div><p id="tmdbFeedback" class="hint" aria-live="polite"></p><div id="tmdbReviewQueue"></div>';
    const settingSections = main.querySelectorAll(".panel");
    if (settingSections[0]) settingSections[0].after(article); else main.append(article);
    article.querySelector("#testTmdb").onclick = async () => {
      const feedback = document.querySelector("#tmdbFeedback");
      feedback.textContent = "Testing TMDB connection…";
      try {
        const result = await call({ mode: "health" });
        feedback.textContent = result.verified ? "✓ TMDB credentials verified and connection working." : "✓ Server responded; credential verification not confirmed.";
      } catch(e) { feedback.textContent = "Connection issue: " + e.message; }
    };
    article.querySelector("#stopTmdb").onclick = () => { cancel = true; };
    article.querySelector("#enrichTmdb").onclick = enrichBatch;
    refreshReviewQueue();
  }
  async function enrichBatch() {
    if (running) return;
    const feedback = document.querySelector("#tmdbFeedback"), run = document.querySelector("#enrichTmdb"), stop = document.querySelector("#stopTmdb");
    if (!feedback) return;
    running = true; cancel = false; run.disabled = true; stop.disabled = false;
    let matched=0,review=0,processed=0;
    const targets=state.records.filter(f => !f.tmdbId && f.tmdbStatus !== "review").slice(0,25);
    try {
      await call({ mode: "health" });
      for (const f of targets) {
        if (cancel) break;
        feedback.textContent = "Checking " + (processed+1) + " of " + targets.length + ": " + f.title + "…";
        try {
          const search = await call({mode:"search",query:f.title});
          const match=selectMatch(f,search.results || []);
          if (match) { await apply(f,match);matched++; }
          else { f.tmdbStatus="review";review++;save(); }
        } catch(e) {
          feedback.textContent = "Stopped on " + f.title + ": " + e.message;
          break;
        }
        processed++;
        await wait(180);
      }
      feedback.textContent = "Processed " + processed + " films: " + matched + " matched, " + review + " need manual review. " + (cancel?"Stopped.":"Run again for another batch.");
    } catch(e) {feedback.textContent="Could not connect: "+e.message;}
    finally {running=false;run.disabled=false;stop.disabled=true;refreshReviewQueue();}
  }
  function setupEditor(filmId) {
    const form = document.querySelector("#filmForm");
    if (!form || form.querySelector("#tmdbSearchButton")) return;
    const p = document.createElement("div");
    p.className = "panel spaced";
    p.style.marginBottom = "0";
    p.innerHTML = '<div class="between"><strong>TMDB metadata lookup</strong></div>' +
      '<p class="hint">Search for the correct movie or series; if needed, try its original-language title. Choose the correct result by title and year, then press Save changes. Your personal rating is preserved.</p>' +
      '<div class="controls"><label class="field grow">TMDB title search<input id="tmdbTitleQuery" type="search" placeholder="Film title…"></label><button id="tmdbSearchButton" class="button button-sm" type="button">Search TMDB</button></div>' +
      '<div id="tmdbEditorResults" aria-live="polite"></div>';
    const actions = form.querySelector(".modal-actions");
    if (actions) actions.before(p); else form.append(p);
    const input = p.querySelector("#tmdbTitleQuery");
    input.value = form.elements.namedItem("title").value;
    p.querySelector("#tmdbSearchButton").onclick = async () => {
      const title = input.value.trim();
      const target = p.querySelector("#tmdbEditorResults");
      currentEditor = null;
      if (title.length < 2) { target.textContent = "Enter at least two characters."; return; }
      target.textContent = "Searching TMDB…";
      try {
        const data = await call({ mode: "search", query: title });
        const matches = (data.results || []).slice(0, 12);
        if (!matches.length) { target.textContent = "No results. Try another title or enter metadata manually."; return; }
        target.innerHTML = '<div class="stack spaced">' + matches.map((m,i) =>
          '<button type="button" class="collection-card" data-result="' + i + '"><strong>' + escape(m.title) + '</strong><span>' +
          escape(yearOf(m) || "Year unknown") + ' · ' + escape(m.media_type) + '</span></button>'
        ).join("") + '</div>';
        for (const btn of target.querySelectorAll("[data-result]")) {
          btn.onclick = async () => {
            const choice = matches[Number(btn.dataset.result)];
            target.textContent = "Loading credits for " + choice.title + "…";
            try {
              const details = await call({ mode: "details", media: choice.media_type, id: String(choice.id) });
              const fields = toFields(details, choice.media_type);
              for (const [key, value] of Object.entries(fields)) {
                const control = form.elements.namedItem(key);
                if (control && typeof value === "string") control.value = value;
              }
              const type = form.elements.namedItem("type");
              if (type) type.value = fields.type;
              currentEditor = fields;
              target.innerHTML = '<div class="notice">Selected ' + escape(choice.title) + ' (' +
                escape(yearOf(choice) || "year unknown") +
                '). Check that this is the right film, then press <strong>Save changes</strong> below.</div>';
            } catch (e) { target.textContent = "Could not load details: " + e.message; }
          };
        }
      } catch (e) { target.textContent = "TMDB search failed: " + e.message; }
    };
    input.addEventListener("keydown", event => {
      if (event.key === "Enter") {event.preventDefault();p.querySelector("#tmdbSearchButton").click();}
    });
    // The original editor saves normal fields; after that, attach the chosen
    // TMDB ID and metadata to the EXACT edited record, not a title duplicate.
    const originalSubmit = form.onsubmit;
    form.onsubmit = function(event) {
      const pending = currentEditor;
      const previousIds = new Set(state.records.map(f => f.id));
      originalSubmit.call(form, event);
      if (pending) {
        const item = filmId
          ? state.records.find(f => f.id === filmId)
          : state.records.find(f => !previousIds.has(f.id));
        if (item) {
          Object.assign(item, pending);
          save();
          render();
        }
      }
      currentEditor = null;
    };
  }
  const renderOld=render;
  render=function(){renderOld();panel();};
  const editorOld=openEditor;
  openEditor=function(filmId){currentEditor=null;editorOld(filmId);setupEditor(filmId);};
  panel();
})();
