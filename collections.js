/* Film Atlas collections browser v2.
 * Search/sort collections; search/sort the movies in each collection; and
 * drill down by director, actor, country, studio, genre, composer or year.
 * Uses existing local film records and does not alter saved data. */
(function () {
  "use strict";

  let groupSearch = "";
  let groupSort = "most_watched";
  let minWatched = "1";
  let groupPage = 0;
  let filmSearch = "";
  let filmSort = "rating_desc";
  let filmStatus = "all";
  let filmPage = 0;
  let breakdownCategory = "none";
  let breakdownSort = "most_watched";
  let breakdownSearch = "";
  let breakdownPage = 0;
  let selectedBreakdown = null;

  const GROUPS_PER_PAGE = 36, FILMS_PER_PAGE = 48, BREAKDOWNS_PER_PAGE = 24;
  const esc = escapeHtml;
  const categoryLabel = () => categories.find(x => x[0] === state.category)?.[1] || "Collections";

  function rated(f) { return f.watched && f.rating !== null && f.rating !== undefined && f.rating !== ""; }
  function ratedCount(films) { return films.filter(rated).length; }
  function avg(films) { return average(films.filter(f => f.watched)); }
  function countWatched(g) { return g.watched.length; }
  function nameCmp(a,b) { return a.name.localeCompare(b.name, undefined, { numeric: true }); }
  function averageNumber(g) {
    const v = Number(avg(g.films || g.watched));
    return Number.isFinite(v) ? v : null;
  }
  function rankGroups(groups, sort) {
    groups.sort((a,b) => {
      const countA = countWatched(a), countB = countWatched(b);
      const avA = averageNumber(a), avB = averageNumber(b);
      switch (sort) {
        case "least_watched": return countA - countB || nameCmp(a,b);
        case "rating_high": return (avB === null ? -Infinity : avB) - (avA === null ? -Infinity : avA) || countB-countA || nameCmp(a,b);
        case "rating_low": {
          if (avA === null) return avB === null ? nameCmp(a,b) : 1;
          if (avB === null) return -1;
          return avA-avB || countB-countA || nameCmp(a,b);
        }
        case "az": return nameCmp(a,b);
        case "za": return -nameCmp(a,b);
        default: return countB-countA || nameCmp(a,b);
      }
    });
    return groups;
  }
  const groupSortOptions = [
    ["most_watched","Most watched films"],
    ["least_watched","Fewest watched films"],
    ["rating_high","Highest average rating"],
    ["rating_low","Lowest average rating"],
    ["az","Name A–Z"],
    ["za","Name Z–A"]
  ];
  const filmSortOptions = [
    ["rating_desc","Highest personal rating"],
    ["rating_asc","Lowest personal rating"],
    ["watched_first","Watched first"],
    ["unwatched_first","Unwatched first"],
    ["year_desc","Newest release"],
    ["year_asc","Oldest release"],
    ["title_az","Title A–Z"],
    ["title_za","Title Z–A"]
  ];
  function pager(current, max, kind) {
    if (max <= 1) return "";
    return '<div class="between spaced"><button class="button" type="button" data-collection-pager="' + kind +
      ':prev" ' + (current === 0 ? "disabled" : "") + '>← Previous</button>' +
      '<span class="muted small">Page ' + (current+1) + ' / ' + max + '</span>' +
      '<button class="button" type="button" data-collection-pager="' + kind +
      ':next" ' + (current >= max-1 ? "disabled" : "") + '>Next →</button></div>';
  }
  function categoriesBar() {
    return '<div class="panel"><div class="controls">' +
      '<label class="field">Browse by<select id="category">' + options(categories,state.category) +
      '</select></label>' +
      '<span class="muted small">Collections include only the film types enabled in Settings.</span></div></div>';
  }
  function browser() {
    let gs = groupData();
    if (groupSearch.trim()) {
      const q = norm(groupSearch.trim());
      gs = gs.filter(g => norm(g.name).includes(q));
    }
    gs = gs.filter(g => countWatched(g) >= Number(minWatched));
    rankGroups(gs, groupSort);
    const max = Math.max(1,Math.ceil(gs.length/GROUPS_PER_PAGE));
    groupPage = Math.max(0,Math.min(max-1,groupPage));
    const shown = gs.slice(groupPage*GROUPS_PER_PAGE,(groupPage+1)*GROUPS_PER_PAGE);
    const controls = '<div class="panel"><h2 style="margin:0 0 12px">Find and rank collections</h2>' +
      '<div class="controls"><label class="field grow">Search ' + esc(categoryLabel().toLowerCase()) +
      '<input id="collectionSearch" type="search" placeholder="Search '+esc(categoryLabel().toLowerCase())+'…" value="' + esc(groupSearch) + '"></label>' +
      '<label class="field">Sort collections<select id="collectionSort">' + options(groupSortOptions,groupSort) + '</select></label>' +
      '<label class="field">Minimum watched<select id="collectionMinimum">' +
      options([["0","Any (including watchlist only)"],["1","1 film"],["2","2 films"],["3","3 films"],["5","5 films"],["10","10 films"]],minWatched) +
      '</select></label></div></div>';
    const cards = shown.length
      ? '<div class="collections spaced">' + shown.map(g =>
        '<button class="collection-card" type="button" data-group="' + esc(g.name) + '">' +
        '<strong>' + esc(g.name) + '</strong>' +
        '<span>' + countWatched(g) + ' watched · ' + ratedCount(g.films) + ' rated · average ★ ' + esc(avg(g.films)) + '</span>' +
        '<div class="muted small spaced">' + g.remaining.length + ' remaining on your watchlist</div></button>'
      ).join("") + '</div>'
      : '<div class="empty"><h2>No matching collections</h2><p>Try a different search or lower the minimum watched count.</p></div>';
    return layout("Explore collections",
      "Search and rank your release years, directors, actors, composers, studios, countries, and genres.",
      categoriesBar() + controls + '<div class="between"><span class="muted small">' +
      gs.length + ' matching collections</span><span class="muted small">' +
      (shown.length ? (groupPage*GROUPS_PER_PAGE+1) + '–' + (groupPage*GROUPS_PER_PAGE+shown.length) + ' shown' : 'None shown') +
      '</span></div>' + cards + pager(groupPage,max,"groups") +
      '<p class="hint spaced">These counts come from your own collection. A director’s complete filmography is a separate TMDB-based view.</p>'
    );
  }

  function breakdownOptions() {
    return [["none","No breakdown"],...categories.filter(x => x[0] !== state.category)];
  }
  function buildBreakdowns(films) {
    if (breakdownCategory === "none") return [];
    const map = new Map();
    for (const f of films) {
      const labels = [...new Set(values(f,breakdownCategory))];
      for (const label of labels) {
        if (!map.has(label)) map.set(label, []);
        map.get(label).push(f);
      }
    }
    let groups=[...map].map(([name,items]) => ({
      name,films:items,watched:items.filter(x=>x.watched),
      remaining:items.filter(x=>x.watchlist && !x.watched)
    }));
    const q=norm(breakdownSearch.trim());
    if(q) groups=groups.filter(g=>norm(g.name).includes(q));
    return rankGroups(groups,breakdownSort);
  }
  function breakdownPanel(group) {
    const opts = breakdownOptions();
    const activeCategory = opts.some(([id])=>id===breakdownCategory) ? breakdownCategory : "none";
    const groups=activeCategory === "none" ? [] : buildBreakdowns(group.films);
    const max=Math.max(1,Math.ceil(groups.length/BREAKDOWNS_PER_PAGE));
    breakdownPage=Math.max(0,Math.min(breakdownPage,max-1));
    const shown=groups.slice(breakdownPage*BREAKDOWNS_PER_PAGE,(breakdownPage+1)*BREAKDOWNS_PER_PAGE);
    let result='<div class="panel"><h2 style="margin:0 0 8px">Break down this collection</h2>' +
      '<p class="hint">For example, inside a release year, rank its directors or studios by how many of their movies you watched or by your average rating.</p>' +
      '<div class="controls"><label class="field">Group films by<select id="collectionBreakdown">' +
      options(opts,activeCategory) + '</select></label>';
    if(activeCategory!=="none") {
      result+='<label class="field grow">Search groups<input type="search" id="breakdownSearch" value="' + esc(breakdownSearch) +
        '" placeholder="Find within these groups…"></label>' +
        '<label class="field">Rank by<select id="breakdownSort">' + options(groupSortOptions,breakdownSort) +
        '</select></label>';
    }
    result+='</div>';
    if(activeCategory!=="none") {
      result+='<p class="muted small spaced">'+groups.length+' matching groups. Click one to filter the movies below.</p>' +
        (shown.length?'<div class="collections spaced">'+shown.map(g =>
          '<button class="collection-card" type="button" data-breakdown="' + esc(g.name) + '" ' +
          (selectedBreakdown===g.name ? 'style="border-color:var(--a)"' : '') + '>' +
          '<strong>'+esc(g.name)+'</strong>' +
          '<span>'+g.watched.length+' watched · '+ratedCount(g.films)+' rated · average ★ '+esc(avg(g.films))+'</span>' +
          '<div class="muted small spaced">'+g.remaining.length+' unwatched on watchlist</div></button>'
        ).join("")+'</div>':'<p class="hint">No matching groups.</p>') +
        pager(breakdownPage,max,"breakdowns");
    }
    if(selectedBreakdown && activeCategory!=="none") {
      result+='<div class="notice spaced">Showing movies associated with <strong>'+esc(selectedBreakdown)+'</strong>. ' +
        '<button type="button" class="button button-sm" id="clearBreakdown">Clear filter</button></div>';
    }
    return result+'</div>';
  }
  function filmOrder(a,b) {
    const names = a.title.localeCompare(b.title);
    const ya=Number(a.year)||0,yb=Number(b.year)||0;
    const ra=a.rating == null || a.rating==="" ? null:Number(a.rating);
    const rb=b.rating == null || b.rating==="" ? null:Number(b.rating);
    switch(filmSort) {
      case "rating_asc":
        return (ra===null ? 1:rb===null ? -1:ra-rb)||names;
      case "rating_desc":
        return (ra===null ? 1:rb===null ? -1:rb-ra)||names;
      case "watched_first": return Number(b.watched)-Number(a.watched)||names;
      case "unwatched_first": return Number(a.watched)-Number(b.watched)||names;
      case "year_asc": return ya-yb||names;
      case "title_az": return names;
      case "title_za": return -names;
      default: return yb-ya||names;
    }
  }
  function detail() {
    const g=groupData().find(x=>x.name===state.group);
    const cat=categoryLabel();
    if(!g)return layout(esc(state.group),"Collection",
      '<button type="button" class="button" id="backGroups">← Back</button>' +
      '<div class="empty">No films in this group under your current inclusion settings.</div>');
    const watched=g.watched.length, ratedCountHere=ratedCount(g.films);
    const canFilmography=state.category==="actors"||state.category==="directors";
    const header='<div class="between spaced" style="flex-wrap:wrap">' +
      '<button class="button button-ghost" type="button" id="backGroups">← All '+esc(cat)+'</button>' +
      (canFilmography?'<button type="button" class="button button-primary" id="findFullFilmography">Full TMDB filmography</button>':"") +
      '</div>';
    const stats='<div class="stat-grid">'+[
      ["Watched",watched],["Rated",ratedCountHere],["Average ★",avg(g.films)],["On watchlist",g.remaining.length]
    ].map(([label,val])=>'<div class="stat"><div class="label">'+esc(label)+'</div><div class="value">'+esc(val)+'</div></div>').join("")+'</div>';
    let rows=g.films.slice();
    if(selectedBreakdown && breakdownCategory !== "none")
      rows=rows.filter(f=>values(f,breakdownCategory).includes(selectedBreakdown));
    const search=norm(filmSearch.trim());
    if(search)rows=rows.filter(f=>[
      f.title,f.year,f.directors,f.actors,f.composers,f.studios,f.countries,f.genres
    ].some(v=>norm(v).includes(search)));
    if(filmStatus==="watched")rows=rows.filter(f=>f.watched);
    else if(filmStatus==="watchlist")rows=rows.filter(f=>f.watchlist&&!f.watched);
    else if(filmStatus==="unrated")rows=rows.filter(f=>f.watched && !rated(f));
    else if(filmStatus==="rated")rows=rows.filter(rated);
    rows.sort(filmOrder);
    const max=Math.max(1,Math.ceil(rows.length/FILMS_PER_PAGE));
    filmPage=Math.max(0,Math.min(filmPage,max-1));
    const shown=rows.slice(filmPage*FILMS_PER_PAGE,(filmPage+1)*FILMS_PER_PAGE);
    const movieControls='<div class="panel"><h2 style="margin:0 0 12px">Search and sort films in '+esc(g.name)+'</h2>' +
      '<div class="controls"><label class="field grow">Search titles or credits<input id="collectionFilmSearch" type="search" placeholder="Search movies in this collection…" value="' + esc(filmSearch) + '"></label>' +
      '<label class="field">Show<select id="collectionFilmStatus">' +
      options([["all","All movies"],["watched","Watched only"],["rated","Rated only"],["unrated","Watched but unrated"],["watchlist","Unwatched watchlist"]],filmStatus) +
      '</select></label>' +
      '<label class="field">Sort films<select id="collectionFilmSort">' + options(filmSortOptions,filmSort) +
      '</select></label></div></div>';
    return layout(esc(g.name), cat+" · your film collection",
      header + stats +
      '<p class="hint">Statistics above reflect this entire collection, not any search or subgroup filters below. ' +
      'For categories like years and countries, these are counts from your library, not an estimate of all films ever released.</p>' +
      breakdownPanel(g)+movieControls +
      '<div class="between"><span class="muted small">'+rows.length+' movies match your filters</span>' +
      '<span class="muted small">Click a poster to edit a rating</span></div>' +
      (shown.length?grid(shown):'<div class="empty"><h2>No matching movies</h2><p>Try a different search or filter.</p></div>')+
      pager(filmPage,max,"films")
    );
  }
  function resetDetail() {
    filmSearch="";filmSort="rating_desc";filmStatus="all";filmPage=0;
    breakdownCategory="none";breakdownSort="most_watched";
    breakdownSearch="";breakdownPage=0;selectedBreakdown=null;
  }
  collectionsPage=function(){return state.group===null?browser():detail();};

  function bindSearch(id, update) {
    const input=document.querySelector(id);
    if(!input)return;
    input.addEventListener("input",e=>{
      const pos=e.target.selectionStart;
      update(e.target.value);
      render();
      const next=document.querySelector(id);
      if(next){ next.focus(); if(pos!==null)next.setSelectionRange(pos,pos); }
    });
  }
  const originalBind=bind;
  bind=function(){
    originalBind();
    if(state.page!=="collections")return;
    const cat=document.querySelector("#category");
    if(cat)cat.onchange=()=>{
      state.category=cat.value;state.group=null;
      groupPage=0;groupSearch="";resetDetail();render();
    };
    document.querySelectorAll("[data-group]").forEach(el=>el.onclick=()=>{
      state.group=el.dataset.group;resetDetail();render();window.scrollTo(0,0);
    });
    const back=document.querySelector("#backGroups");
    if(back)back.onclick=()=>{state.group=null;resetDetail();render();};
    bindSearch("#collectionSearch",v=>{groupSearch=v;groupPage=0;});
    bindSearch("#collectionFilmSearch",v=>{filmSearch=v;filmPage=0;});
    bindSearch("#breakdownSearch",v=>{breakdownSearch=v;breakdownPage=0;});
    for(const [id,set] of [
      ["#collectionSort",v=>{groupSort=v;groupPage=0;}],
      ["#collectionMinimum",v=>{minWatched=v;groupPage=0;}],
      ["#collectionFilmStatus",v=>{filmStatus=v;filmPage=0;}],
      ["#collectionFilmSort",v=>{filmSort=v;filmPage=0;}],
      ["#breakdownSort",v=>{breakdownSort=v;breakdownPage=0;}],
      ["#collectionBreakdown",v=>{breakdownCategory=v;breakdownSearch="";breakdownPage=0;selectedBreakdown=null;filmPage=0;}]
    ]) {
      const el=document.querySelector(id);
      if(el)el.onchange=()=>{set(el.value);render();};
    }
    document.querySelectorAll("[data-breakdown]").forEach(el=>el.onclick=()=>{
      selectedBreakdown=el.dataset.breakdown;
      filmPage=0;render();
      const movies=document.querySelector("#collectionFilmSearch");
      if(movies)movies.scrollIntoView({behavior:"smooth",block:"center"});
    });
    const clear=document.querySelector("#clearBreakdown");
    if(clear)clear.onclick=()=>{selectedBreakdown=null;filmPage=0;render();};
    document.querySelectorAll("[data-collection-pager]").forEach(el=>el.onclick=()=>{
      const [page,way]=el.dataset.collectionPager.split(":");
      const delta=way==="next"?1:-1;
      if(page==="groups")groupPage+=delta;
      if(page==="films")filmPage+=delta;
      if(page==="breakdowns")breakdownPage+=delta;
      render();window.scrollTo(0,0);
    });
    const full=document.querySelector("#findFullFilmography");
    if(full)full.onclick=()=>{
      const role=state.category==="directors"?"director":"actor";
      if(window.FilmAtlasFilmographies?.openSearch)
        window.FilmAtlasFilmographies.openSearch(state.group,role);
      else toast("Open Filmographies to search this person.");
    };
  };
})();
