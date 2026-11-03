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
  function panel() {
    if (state.page !== "settings") return;
    const main = document.querySelector("#app");
    if (!main || main.querySelector("#tmdbPanel")) return;
    const article = document.createElement("div");
    article.className = "panel";
    article.id = "tmdbPanel";
    article.innerHTML = '<h2>Automatic movie metadata</h2><p class="hint">Connects through a private Vercel server function. Film Atlas only auto-matches a film when TMDB has exactly one movie with the same normalized title and a release year within one year. Other films stay untouched for manual review. Existing ratings and watched status are never overwritten.</p><div class="controls"><button id="testTmdb" class="button">Test connection</button><button id="enrichTmdb" class="button button-primary">Enrich next 25 films</button><button id="stopTmdb" class="button" disabled>Stop</button></div><p id="tmdbFeedback" class="hint" aria-live="polite"></p>';
    const settingSections = main.querySelectorAll(".panel");
    if (settingSections[0]) settingSections[0].after(article); else main.append(article);
    article.querySelector("#testTmdb").onclick = async () => {
      const feedback = document.querySelector("#tmdbFeedback");
      feedback.textContent = "Testing secure connection…";
      try { await call({mode:"health"});feedback.textContent = "✓ TMDB API is configured and the server is responding."; }
      catch(e) { feedback.textContent = "Connection issue: " + e.message; }
    };
    article.querySelector("#stopTmdb").onclick = () => { cancel = true; };
    article.querySelector("#enrichTmdb").onclick = enrichBatch;
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
    finally {running=false;run.disabled=false;stop.disabled=true;}
  }
  function setupEditor() {
    const form=document.querySelector("#filmForm");
    if (!form || form.querySelector("#tmdbSearchButton")) return;
    const p=document.createElement("div");
    p.className="panel spaced";
    p.style.marginBottom="0";
    p.innerHTML='<div class="between"><strong>TMDB metadata lookup</strong><button id="tmdbSearchButton" class="button button-sm" type="button">Search TMDB</button></div><p class="hint">Search by title, then choose the correct movie or series. This fills in credits, poster, type and countries without changing your rating.</p><div id="tmdbEditorResults"></div>';
    const actions=form.querySelector(".modal-actions");
    if (actions) actions.before(p); else form.append(p);
    p.querySelector("#tmdbSearchButton").onclick=async()=>{
      const title=form.querySelector('[name="title"]').value.trim();
      const target=p.querySelector("#tmdbEditorResults");
      if (title.length<2) {target.textContent="Enter a film title first.";return;}
      target.textContent="Searching TMDB…";
      try {
        const data=await call({mode:"search",query:title});
        const matches=(data.results||[]).slice(0,12);
        if(!matches.length){target.textContent="No matching titles. You can still enter metadata manually.";return;}
        target.innerHTML='<div class="stack spaced">'+matches.map((m,i)=>'<button type="button" class="collection-card" data-result="'+i+'"><strong>'+escape(m.title)+'</strong><span>'+escape(yearOf(m)||"Year unknown")+' · '+escape(m.media_type)+'</span></button>').join("")+'</div>';
        for (const btn of target.querySelectorAll("[data-result]")) {
          btn.onclick=async()=>{
            const choice=matches[Number(btn.dataset.result)];
            target.textContent="Loading credits for "+choice.title+"…";
            try {
              const details=await call({mode:"details",media:choice.media_type,id:String(choice.id)});
              const fields=toFields(details,choice.media_type);
              for(const [k,v] of Object.entries(fields)){
                const input=form.elements.namedItem(k);
                if(input && typeof v==="string") input.value=v;
              }
              const type=form.elements.namedItem("type");if(type)type.value=fields.type;
              // Existing form does not serialize TMDB IDs, so retain this choice until Save.
              currentEditor={id:choice.id,media:choice.media_type,fields};
              target.innerHTML='<div class="notice">Matched '+escape(choice.title)+' ('+escape(yearOf(choice))+'). Press <strong>Save changes</strong> to store the enriched metadata.</div>';
            }catch(e){target.textContent="Could not load details: "+e.message;}
          };
        }
      }catch(e){target.textContent="Search unavailable: "+e.message;}
    };
    const originalSubmit=form.onsubmit;
    form.onsubmit=function(event){
      const movieId=event.target.closest(".modal")?.querySelector('[name="uri"]')?.value;
      originalSubmit.call(form,event);
      if(currentEditor){
        const matched=state.records.find(f=>f.uri && movieId && f.uri===movieId) || state.records.find(f=>f.title===form.elements.namedItem("title").value);
        if(matched){ Object.assign(matched,currentEditor.fields);save(); }
        currentEditor=null;
        render();
      }
    };
  }
  const renderOld=render;
  render=function(){renderOld();panel();};
  const editorOld=openEditor;
  openEditor=function(filmId){currentEditor=null;editorOld(filmId);setupEditor();};
  panel();
})();
