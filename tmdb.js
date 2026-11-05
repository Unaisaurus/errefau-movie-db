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
    if (!res.ok) {
      const error = Error(data.error || "TMDB request failed (" + res.status + ").");
      error.status = res.status;
      throw error;
    }
    return data;
  }
  // TMDB's proxy allows at most 120 characters for a movie search.
  // For exceptionally long titles, search by the complete main title
  // (before a colon) or a safe word boundary; never rename the saved film.
  function searchTitle(title) {
    const full = String(title || "").trim();
    if (full.length <= 120) return full;
    const colon = full.indexOf(":");
    if (colon >= 8 && colon <= 120) return full.slice(0, colon).trim();
    const prefix = full.slice(0, 120);
    const wordBoundary = prefix.lastIndexOf(" ");
    return (wordBoundary >= 15 ? prefix.slice(0, wordBoundary) : prefix).trim();
  }
  function normalized(s) {
    return String(s || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  function selectMatch(f, list) {
    const title = normalized(f.title), yr = Number(f.year);
    const shortened = searchTitle(f.title);
    const shortTitle = shortened.length < String(f.title || "").trim().length ? normalized(shortened) : null;
    // We accept a TV series ONLY when its title and year also match uniquely.
    // Episodes are not automatically mapped to the parent series.
    const candidates = list.filter(x =>
      (x.media_type === "movie" || x.media_type === "tv") &&
      Number(x.id) > 0 &&
      (normalized(x.title) === title || normalized(x.original_title) === title ||
        (shortTitle && (normalized(x.title) === shortTitle || normalized(x.original_title) === shortTitle))) &&
      yr > 1800 && Math.abs(Number(yearOf(x)) - yr) <= 1
    );
    const unique = [...new Map(candidates.map(x=>[x.media_type+":"+x.id,x])).values()];
    return unique.length === 1 ? unique[0] : null;
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
  function getProgress() {
    const records = state.records.filter(f => !f.excluded);
    return {
      total: records.length,
      completed: records.filter(f => f.tmdbId && f.type && f.type !== "unknown").length,
      pending: records.filter(f => !f.tmdbId && f.tmdbStatus !== "review" && f.tmdbStatus !== "manual").length,
      manual: records.filter(f => !f.tmdbId && f.tmdbStatus === "manual").length,
      review: records.filter(f => !f.tmdbId && f.tmdbStatus === "review").length,
      repair: records.filter(f => f.tmdbId && (!f.type || f.type === "unknown")).length,
      excluded: state.records.filter(f => f.excluded).length
    };
  }
  function refreshProgress() {
    const target = document.querySelector("#tmdbProgress");
    if (!target) return;
    const p = getProgress();
    target.innerHTML =
      '<div class="stat-grid">' + [
        ["Enriched via TMDB", p.completed], ["Manually catalogued", p.manual],
        ["Not yet tried", p.pending], ["Needs review", p.review], ["Incomplete match", p.repair]
      ].map(([label,n]) => '<div class="stat"><div class="label">' + escape(label) + '</div><div class="value">' + n + '</div></div>').join("") +
      '</div><p class="hint">Of ' + p.total + ' active entries, ' + p.excluded +
      ' separately excluded. These counts include TV and other hidden categories. Missing posters alone do not imply an incomplete match; TMDB sometimes has no poster.</p>';
    const first = document.querySelector("#enrichTmdb");
    const retry = document.querySelector("#retryTmdb");
    const repair = document.querySelector("#repairTmdb");
    if (first) first.disabled = running || p.pending === 0;
    if (retry) retry.disabled = running || p.review === 0;
    if (repair) repair.disabled = running || p.repair === 0;
    const stop = document.querySelector("#stopTmdb");
    if (stop) stop.disabled = !running;
  }
  function refreshReviewQueue() {
    const holder = document.querySelector("#tmdbReviewQueue");
    if (!holder) return;
    const items = state.records.filter(f => f.tmdbStatus === "review" && !f.tmdbId && !f.excluded);
    holder.innerHTML = '<div class="between spaced"><h3 style="margin:0">Needs manual review: ' + items.length +
      '</h3><span class="muted small">From all imported titles, including hidden types</span></div>' +
      (items.length
        ? '<p class="hint">These titles were not matched automatically. Choose <strong>Review on TMDB</strong> to link the right result, or <strong>Resolve manually</strong> to keep a standalone film without a TMDB match.</p>' +
          '<div class="stack">' + items.slice(0,100).map(f =>
            '<div class="between" style="border-bottom:1px solid var(--border);padding:9px 0">' +
            '<div><strong>' + escape(f.title) + '</strong> <span class="muted">(' + escape(f.year || "year unknown") + ')</span></div>' +
            '<span style="display:flex;gap:6px;flex-wrap:wrap"><button type="button" class="button button-sm" data-review-id="' + escape(f.id) + '">Review on TMDB</button>' +
            '<button type="button" class="button button-sm" data-manual-id="' + escape(f.id) + '">Resolve manually</button>' +
            '<button type="button" class="button button-sm" data-exclude-id="' + escape(f.id) + '">Exclude (episode)</button></span></div>'
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
    holder.querySelectorAll("[data-manual-id]").forEach(button => {
      button.addEventListener("click", () => openEditor(button.dataset.manualId, true));
    });
    holder.querySelectorAll("[data-exclude-id]").forEach(button => {
      button.addEventListener("click", () => {
        const entry = state.records.find(f => f.id === button.dataset.excludeId);
        if (!entry) return;
        entry.excluded = true;
        entry.tmdbStatus = "excluded";
        save();
        refreshReviewQueue();
        toast("Excluded from your movie library: " + entry.title);
        refreshProgress();
      });
    });
    const hidden = state.records.filter(f => f.excluded);
    const restored = document.createElement("div");
    restored.className = "spaced";
    restored.innerHTML = '<details><summary class="muted" style="cursor:pointer">Excluded entries (' + hidden.length + ') — restore if needed</summary>' +
      '<div class="stack spaced">' + hidden.map(f => '<div class="between"><span>' + escape(f.title) + ' (' + escape(f.year || "—") + ')</span>' +
      '<button class="button button-sm" data-restore-id="' + escape(f.id) + '">Restore</button></div>').join("") + '</div></details>';
    holder.append(restored);
    restored.querySelectorAll("[data-restore-id]").forEach(button => button.onclick = () => {
      const entry = state.records.find(f => f.id === button.dataset.restoreId);
      if (!entry) return;
      entry.excluded = false;
      entry.tmdbStatus = "review";
      save();
      refreshReviewQueue();
      toast("Restored " + entry.title);
      refreshProgress();
    });
  }
  function panel() {
    if (state.page !== "settings") return;
    const main = document.querySelector("#app");
    if (!main || main.querySelector("#tmdbPanel")) return;
    const article = document.createElement("div");
    article.className = "panel";
    article.id = "tmdbPanel";
    article.innerHTML = '<h2>Automatic movie metadata</h2><p class="hint">TMDB results are linked by title and release year, including unique TV series matches. Ambiguous results are never linked automatically. Your watched status and personal rating stay unchanged.</p>' +
      '<div id="tmdbProgress"></div>' +
      '<div class="controls"><button id="testTmdb" class="button">Test connection</button>' +
      '<button id="enrichTmdb" class="button button-primary">Enrich next 25 unprocessed</button>' +
      '<button id="retryTmdb" class="button">Retry 25 needing review</button>' +
      '<button id="repairTmdb" class="button">Repair 25 incomplete matches</button>' +
      '<button id="stopTmdb" class="button" disabled>Stop</button></div>' +
      '<p id="tmdbFeedback" class="hint" aria-live="polite"></p><div id="tmdbReviewQueue"></div>';
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
    article.querySelector("#enrichTmdb").onclick = () => enrichBatch("pending");
    article.querySelector("#retryTmdb").onclick = () => enrichBatch("review");
    article.querySelector("#repairTmdb").onclick = () => enrichBatch("repair");
    refreshReviewQueue();
    refreshProgress();
  }
  async function enrichBatch(mode = "pending") {
    if (running) return;
    const feedback = document.querySelector("#tmdbFeedback");
    if (!feedback) return;
    const matchesMode = mode === "review" || mode === "repair" ? mode : "pending";
    const targets = state.records.filter(f => !f.excluded && (
      matchesMode === "repair"
        ? !!f.tmdbId && (!f.type || f.type === "unknown")
        : matchesMode === "review"
          ? !f.tmdbId && f.tmdbStatus === "review"
          : !f.tmdbId && f.tmdbStatus !== "review" && f.tmdbStatus !== "manual"
    )).slice(0,25);
    if (!targets.length) {
      feedback.textContent = matchesMode === "pending"
        ? "There are no unprocessed entries left. See Needs review and Incomplete match above."
        : matchesMode === "review"
          ? "There are no entries awaiting manual review."
          : "There are no incomplete TMDB matches to repair.";
      refreshProgress();
      return;
    }
    running = true; cancel = false;
    refreshProgress();
    let matched = 0, stillReview = 0, processed = 0, error = "";
    try {
      await call({ mode: "health" });
      for (const f of targets) {
        if (cancel || state.page !== "settings") break;
        feedback.textContent = (matchesMode === "repair" ? "Repairing" : "Checking") + " " +
          (processed + 1) + " of " + targets.length + ": " + f.title + "…";
        try {
          if (matchesMode === "repair") {
            const data = await call({mode:"details",media:f.tmdbMedia || "movie",id:String(f.tmdbId)});
            Object.assign(f, toFields(data,f.tmdbMedia || "movie"));
            matched++;
          } else {
            const search = await call({ mode:"search", query:searchTitle(f.title) });
            const match = selectMatch(f, search.results || []);
            if (match) { await apply(f,match); matched++; }
            else { f.tmdbStatus = "review"; stillReview++; }
          }
          save();
        } catch (e) {
          // A single malformed title should not block the entire queue.
          // Leave temporary/server/rate-limit failures pending for a later retry.
          if (matchesMode !== "repair" && e.status === 400) {
            f.tmdbStatus = "review";
            stillReview++;
            processed++;
            save();
            refreshProgress();
            await wait(180);
            continue;
          }
          error = f.title + ": " + e.message;
          break;
        }
        processed++;
        refreshProgress();
        await wait(180);
      }
      feedback.textContent =
        "Processed " + processed + " of " + targets.length + " in this batch: " +
        matched + " enriched, " + stillReview + " still need review." +
        (cancel ? " Stopped by you." : "") +
        (error ? " Stopped after an error: " + error : "") +
        (matchesMode === "review" && stillReview ? " Unresolved entries remain in the review queue; you can select their TMDB match manually." : "");
    } catch (e) {
      feedback.textContent = "Connection problem: " + e.message;
    } finally {
      running = false;
      refreshProgress();
      refreshReviewQueue();
    }
  }
  function setupEditor(filmId, manualRequested = false) {
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
    if (manualRequested) {
      const note = document.createElement("div");
      note.className = "notice";
      note.innerHTML = "<strong>Manual cataloguing:</strong> Fill in the release year, film type, and any credits you know, then click Save changes. The film stays as one entry with its existing rating. No TMDB ID will be assigned.";
      p.prepend(note);
    }
    const input = p.querySelector("#tmdbTitleQuery");
    input.value = form.elements.namedItem("title").value;
    p.querySelector("#tmdbSearchButton").onclick = async () => {
      const title = input.value.trim();
      const target = p.querySelector("#tmdbEditorResults");
      currentEditor = null;
      if (title.length < 2) { target.textContent = "Enter at least two characters."; return; }
      target.textContent = "Searching TMDB…";
      try {
        const data = await call({ mode: "search", query: searchTitle(title) });
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
              // Selecting a TMDB result should complete the basic movie fields too.
              // A new entry takes the canonical TMDB title/year. When editing an
              // existing Letterboxd entry, preserve its title and release year,
              // except that a missing year can safely be filled in.
              const canonicalTitle = String(details.title || details.name || choice.title || "").trim();
              const date = String(details.release_date || details.first_air_date || choice.release_date || "");
              const tmdbYear = /^\\d{4}/.test(date) ? date.slice(0, 4) : "";
              const titleField = form.elements.namedItem("title");
              const yearField = form.elements.namedItem("year");
              if (!filmId && titleField && canonicalTitle) titleField.value = canonicalTitle;
              if (yearField && tmdbYear && (!filmId || !yearField.value.trim())) yearField.value = tmdbYear;
              for (const [key, value] of Object.entries(fields)) {
                const control = form.elements.namedItem(key);
                if (control && typeof value === "string") control.value = value;
              }
              const type = form.elements.namedItem("type");
              if (type) type.value = fields.type;
              currentEditor = fields;
              target.innerHTML = '<div class="notice">Selected ' + escape(canonicalTitle || choice.title) + ' (' +
                escape(tmdbYear || yearOf(choice) || "year unknown") +
                '). ' + (filmId ? 'Original title and year kept where already filled. ' : 'Title and year filled from TMDB. ') +
                'Your personal rating is unchanged. Press <strong>Save changes</strong> below.</div>';
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
      if (manualRequested && !pending && form.elements.namedItem("type").value === "unknown") {
        event.preventDefault();
        alert("Please choose the film type before resolving it manually.");
        return;
      }
      const previousIds = new Set(state.records.map(f => f.id));
      originalSubmit.call(form, event);
      const item = filmId
        ? state.records.find(f => f.id === filmId)
        : state.records.find(f => !previousIds.has(f.id));
      if (manualRequested && !pending && item) {
        item.tmdbStatus = "manual";
        save();
        render();
      }
      if (pending) {
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
  openEditor=function(filmId, manualRequested = false){currentEditor=null;editorOld(filmId);setupEditor(filmId, manualRequested);};
  panel();
})();
