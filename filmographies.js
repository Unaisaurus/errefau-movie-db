/* Film Atlas: TMDB filmography explorer.
   Counts are based on TMDB's movie credits and your matched TMDB movie IDs.
   These are NOT necessarily complete feature-film-only filmographies. */
(function () {
  "use strict";
  const api = "/api/tmdb";
  const esc = escapeHtml;
  let kind = "director", selected = null, results = [], loading = false, failure = "";
  let query = "", credits = [], crewTotal = 0, searchQuery = "";
  let requestSerial = 0, show = "all", sort = "year", showAdult = false;
  const types = [
    ["all", "All credits"], ["watched", "Watched"], ["watchlist", "On watchlist"], ["missing", "Not watched"]
  ];
  function year(f) { return String(f.release_date || "").slice(0, 4); }
  function poster(f) {
    return f.poster_path
      ? '<img loading="lazy" src="https://image.tmdb.org/t/p/w342' + esc(f.poster_path) + '" alt="">'
      : '<span class="placeholder">✦</span>';
  }
  function normalize(value) {
    return String(value || "").normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
  }
  async function request(params) {
    const res = await fetch(api + "?" + new URLSearchParams(params));
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) throw Error(data?.error || "TMDB is unavailable. Try again later.");
    return data;
  }
  function cleanCredits(data) {
    const raw = kind === "director"
      ? (data.crew || []).filter(x => x.job === "Director")
      : (data.cast || []);
    const unique = new Map();
    for (const item of raw) {
      if (!Number.isInteger(Number(item.id)) || Number(item.id) <= 0 || !item.title) continue;
      if (!unique.has(Number(item.id))) unique.set(Number(item.id), item);
    }
    return [...unique.values()];
  }
  function localByTmdb(id) {
    return state.records.find(f => !f.excluded && f.tmdbMedia === "movie" && Number(f.tmdbId) === Number(id));
  }
  function statusOf(c) {
    const film = localByTmdb(c.id);
    if (film?.watched) return "watched";
    if (film?.watchlist) return "watchlist";
    return "missing";
  }
  function averageRating(items) {
    const scored = items.map(c => localByTmdb(c.id))
      .filter(x => x?.watched && x.rating != null && x.rating !== "")
      .map(x => Number(x.rating)).filter(Number.isFinite);
    if (!scored.length) return "—";
    return (scored.reduce((a,b)=>a+b,0)/scored.length).toFixed(2);
  }
  function eligible() {
    return credits.filter(x => !x.video && (showAdult || !x.adult));
  }
  function filmographyHtml() {
    const allCredits = eligible();
    const watched = allCredits.filter(c => statusOf(c) === "watched");
    const watchlist = allCredits.filter(c => statusOf(c) === "watchlist");
    let filtered = allCredits.filter(c => show === "all" || statusOf(c) === show);
    filtered.sort((a,b) => sort === "title" || sort === "title_za"
      ? (sort === "title_za" ? -1 : 1) * a.title.localeCompare(b.title)
      : sort === "oldest"
      ? (year(a) || "9999").localeCompare(year(b) || "9999") || a.title.localeCompare(b.title)
      : (year(b) || "0000").localeCompare(year(a) || "0000") || a.title.localeCompare(b.title));
    const summary = '<div class="stat-grid">' +
      [["Watched",watched.length],["TMDB movie credits",allCredits.length],["Average ★",averageRating(watched)],["Watchlist",watchlist.length]]
      .map(([name,value]) => '<div class="stat"><div class="label">' + esc(name) + '</div><div class="value">' + esc(value) + '</div></div>').join("") + '</div>';
    const percent = allCredits.length ? Math.round(100*watched.length/allCredits.length) : 0;
    const cards = filtered.length
      ? '<div class="film-grid">' + filtered.map(c => {
          const film = localByTmdb(c.id);
          const status = statusOf(c);
          return '<div class="film" style="cursor:default;position:relative">' +
            '<div class="poster">' + poster(c) + '<span class="year-badge">' + esc(year(c) || "—") + '</span></div>' +
            (film ? '<button type="button" class="favorite-toggle' + (film.favorite ? ' is-favorite' : '') + '" style="top:9px;left:9px" data-filmography-favorite="' + esc(film.id) + '" aria-label="Toggle favorite for ' + esc(film.title) + '" aria-pressed="' + (!!film.favorite) + '">' + (film.favorite ? '♥' : '♡') + '</button>' : '') +
            '<div class="film-details"><div class="film-title">' + esc(c.title) + '</div>' +
            '<div class="film-sub">' + (status === "watched" ? '✓ Watched' : status === "watchlist" ? '◷ Watchlist' : 'Not watched') + '</div>' +
            '<div class="film-rating">' + (film?.watched ? (film.rating != null ? '★ ' + esc(film.rating) + ' / 5' : 'Watched · unrated') : '') + '</div>' +
            (status === "missing"
              ? '<button type="button" class="button button-sm spaced" data-filmography-watchlist="' + esc(c.id) + '">+ Watchlist</button>'
              : '<button type="button" class="button button-sm spaced" data-filmography-edit="' + esc(film.id) + '">Edit film</button>') +
            '</div></div>';
        }).join("") + '</div>'
      : '<div class="empty">No movies in this filter.</div>';
    return '<div class="between spaced"><div><h2 style="margin:0">' + esc(selected.name) + '</h2>' +
      '<p class="muted small">' + (kind === "director" ? 'Director credits' : 'Acting credits') + ' · TMDB</p></div>' +
      '<button type="button" id="changePerson" class="button">Change person</button></div>' +
      summary +
      '<div class="panel"><div class="between"><strong>Movie-credit progress</strong><strong>' + percent + '%</strong></div>' +
      '<div class="progress"><div style="width:' + percent + '%"></div></div>' +
      '<p class="hint">' + watched.length + ' of ' + allCredits.length + ' TMDB movie credits marked watched; ' +
      (allCredits.length-watched.length) + ' not watched. ' +
      'These totals are based on movie credits, which can include shorts, documentaries, unreleased films and other non-feature entries. ' +
      'Only titles matched to your library by TMDB movie ID count as watched. Excluded library entries do not count. ' +
      'Unrated watched films still count as watched.</p></div>' +
      '<div class="panel"><div class="controls">' +
      '<label class="field">Show<select id="filmographyStatus">' + options(types,show) + '</select></label>' +
      '<label class="field">Sort<select id="filmographySort">' +
      options([["year","Newest first"],["oldest","Oldest first"],["title","Title A–Z"],["title_za","Title Z–A"]],sort) + '</select></label>' +
      '<label class="check"><input type="checkbox" id="filmographyAdult" ' + (showAdult ? "checked" : "") + '> Include adult-tagged credits</label>' +
      '</div></div>' +
      '<div class="between"><span class="muted small">' + filtered.length + ' titles shown</span>' +
      '<span class="muted small">Titles are sourced from TMDB</span></div>' + cards;
  }
  function searchHtml() {
    return '<div class="panel"><div class="controls"><label class="field">Role<select id="personRole">' +
      options([["director","Director"],["actor","Actor"]],kind) + '</select></label>' +
      '<label class="field grow">Person name<input id="personName" type="search" value="' + esc(query) +
      '" placeholder="Search a director or actor…" autocomplete="off"></label>' +
      '<button class="button button-primary" id="findPerson" type="button">Find filmography</button></div></div>' +
      (loading ? '<div class="panel">Loading filmography from TMDB…</div>' : '') +
      (failure ? '<div class="warning">' + esc(failure) + '</div>' : '') +
      (results.length ? '<h2>Choose the correct person</h2><div class="collections">' +
        results.map((p,i) => '<button class="collection-card" data-person-index="' + i + '"><strong>' +
          esc(p.name) + '</strong><span>' + esc(p.known_for_department || "") + '</span>' +
          '<div class="muted small spaced">' + esc((p.known_for || []).join(" · ")) + '</div></button>').join("") + '</div>' : '') +
      (!results.length && !loading ? '<p class="hint">Search for someone whose work you want to explore. You can compare their TMDB movie credits against the films in your own library, then add missing titles to your watchlist.</p>' : '');
  }
  function view() {
    return layout("Filmographies",
      "Explore complete TMDB movie-credit lists for directors and actors, and compare them with your own collection.",
      '<div class="notice">Feature preview: These are <strong>TMDB movie credits</strong>, not necessarily feature-film-only totals. We can add more precise film-type filters later.</div>' +
      (selected ? (loading ? '<div class="panel">Loading movie credits…</div>' : failure ? '<div class="warning">' + esc(failure) +
        '</div><button class="button" id="changePerson">Change person</button>' : filmographyHtml()) : searchHtml())
    );
  }
  function redraw() {
    if (state.page !== "filmographies") return;
    document.querySelectorAll("[data-nav]").forEach(el => el.classList.toggle("active",el.dataset.nav === "filmographies"));
    document.querySelector("#app").innerHTML = view();
    attach();
  }
  async function searchPerson() {
    const q = document.querySelector("#personName")?.value.trim() || query;
    if (q.length < 2) {failure="Please enter at least two characters.";redraw();return;}
    query=q;results=[];failure="";loading=true;const current=++requestSerial;redraw();
    try {
      const data=await request({mode:"search_person",query:q});
      if (current !== requestSerial || state.page !== "filmographies") return;
      results=data.results || [];
      if (!results.length)failure="No people found. Check the spelling or try an alternate name.";
    } catch (e) { if(current===requestSerial) failure=e.message; }
    finally {if(current===requestSerial){loading=false;redraw();}}
  }
  async function loadPerson(person) {
    selected=person;results=[];credits=[];failure="";loading=true;show="all";
    const current=++requestSerial;redraw();
    try {
      const data=await request({mode:"person_credits",id:String(person.id)});
      if(current!==requestSerial || state.page!=="filmographies")return;
      credits=cleanCredits(data);
      crewTotal=credits.length;
    }catch(e){if(current===requestSerial)failure=e.message;}
    finally{if(current===requestSerial){loading=false;redraw();}}
  }
  async function addToWatchlist(id,button) {
    const credit=credits.find(x=>Number(x.id)===Number(id));
    if(!credit)return;
    if(localByTmdb(id)) {toast("This title is already in your library");return;}
    button.disabled=true;button.textContent="Adding…";
    try {
      const data=await request({mode:"details",media:"movie",id:String(credit.id)});
      // Keep the information minimal and accurate rather than guessing a film type.
      const crew=data.credits?.crew||[],cast=data.credits?.cast||[];
      const names = arr => [...new Set(arr.filter(Boolean).map(x=>x.name).filter(Boolean))].join("|");
      const genreList=data.genres||[];
      const item={
        id:"tmdb-"+data.id, tmdbId:Number(data.id), tmdbMedia:"movie",tmdbStatus:"matched",
        title:data.title||credit.title, year:String(data.release_date||credit.release_date||"").slice(0,4),
        poster:data.poster_path?"https://image.tmdb.org/t/p/w500"+data.poster_path:"",
        type:genreList.some(x=>x.id===99)?"documentary":data.runtime>0&&data.runtime<40?"short":"feature",
        uri:"",watched:false,watchlist:true,rating:null,excluded:false,
        directors:names(crew.filter(x=>x.job==="Director")),
        actors:names(cast.slice(0,40)),
        composers:names(crew.filter(x=>/original music composer|music by|composer/i.test(x.job||""))),
        studios:names(data.production_companies||[]),
        countries:names((data.production_countries||[]).map(x=>({name:x.name}))),
        genres:names(genreList),runtime:data.runtime||null
      };
      if(state.records.some(x=>x.id===item.id)){toast("Already added");return;}
      state.records.push(item);save();redraw();toast("Added to watchlist: "+item.title);
    }catch(e){button.disabled=false;button.textContent="+ Watchlist";alert("Could not add film: "+e.message);}
  }
  function attach() {
    const role=document.querySelector("#personRole");
    if(role)role.onchange=()=>{kind=role.value;results=[];failure="";redraw();};
    const input=document.querySelector("#personName");
    if(input)input.onkeydown=e=>{if(e.key==="Enter"){e.preventDefault();searchPerson();}};
    const button=document.querySelector("#findPerson");
    if(button)button.onclick=searchPerson;
    document.querySelectorAll("[data-person-index]").forEach(el=>el.onclick=()=>loadPerson(results[Number(el.dataset.personIndex)]));
    const change=document.querySelector("#changePerson");
    if(change)change.onclick=()=>{selected=null;credits=[];failure="";loading=false;requestSerial++;redraw();};
    const status=document.querySelector("#filmographyStatus");
    if(status)status.onchange=()=>{show=status.value;redraw();};
    const sorter=document.querySelector("#filmographySort");
    if(sorter)sorter.onchange=()=>{sort=sorter.value;redraw();};
    const adult=document.querySelector("#filmographyAdult");
    if(adult)adult.onchange=()=>{showAdult=adult.checked;redraw();};
    document.querySelectorAll("[data-filmography-watchlist]").forEach(el=>el.onclick=()=>addToWatchlist(Number(el.dataset.filmographyWatchlist),el));
    document.querySelectorAll("[data-filmography-edit]").forEach(el=>el.onclick=()=>openEditor(el.dataset.filmographyEdit));
    document.querySelectorAll("[data-filmography-favorite]").forEach(el=>el.onclick=()=>{const item=state.records.find(f=>f.id===el.dataset.filmographyFavorite);if(!item)return;item.favorite=!item.favorite;save();redraw();});
  }
  window.FilmAtlasFilmographies = {
    openSearch(name,role) {
      kind = role === "actor" ? "actor" : "director";
      query = String(name || "").trim();
      selected = null;
      credits = [];
      results = [];
      failure = "";
      loading = false;
      requestSerial++;
      state.page = "filmographies";
      state.group = null;
      render();
      if (query.length >= 2) searchPerson();
      window.scrollTo(0,0);
    }
  };
  const oldRender=render;
  render=function() { oldRender(); if(state.page==="filmographies")redraw(); };
})();
