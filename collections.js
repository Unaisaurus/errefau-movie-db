/* Film Atlas – collections exploration, search, and rating summaries.
   Designed for thousands of actor-credit groups without rendering every card. */
(function () {
  "use strict";

  let groupSearch = "";
  let groupSort = "count";
  let minimumWatched = "1";
  let groupPage = 0;
  let filmPage = 0;
  let filmSort = "year";
  let filmStatus = "all";
  const PAGE_SIZE = 36, FILMS_PER_PAGE = 48;

  const esc = escapeHtml;
  const nameOfCategory = () => categories.find(x => x[0] === state.category)?.[1] || "Collections";
  function resetDetail() {
    filmPage = 0; filmSort = "year"; filmStatus = "all";
  }
  function getGroups() {
    // Reuses the existing source of truth. This includes only allowed films
    // (settings and excluded entries), never every work on TMDB.
    let groups = groupData();
    if (groupSearch.trim()) {
      const q = norm(groupSearch.trim());
      groups = groups.filter(g => norm(g.name).includes(q));
    }
    const threshold = Number(minimumWatched);
    if (threshold > 0) groups = groups.filter(g => g.watched.length >= threshold);
    switch (groupSort) {
      case "name":
        groups.sort((a,b) => a.name.localeCompare(b.name, undefined, {numeric:true}));
        break;
      case "average":
        groups.sort((a,b) => {
          const scoreA = Number(average(a.watched)), scoreB = Number(average(b.watched));
          return (Number.isFinite(scoreB) ? scoreB : -1) -
            (Number.isFinite(scoreA) ? scoreA : -1) ||
            b.watched.length - a.watched.length || a.name.localeCompare(b.name);
        });
        break;
      case "recent":
        groups.sort((a,b) => Number(b.name) - Number(a.name) || a.name.localeCompare(b.name));
        break;
      default:
        groups.sort((a,b) => b.watched.length-a.watched.length || a.name.localeCompare(b.name));
    }
    return groups;
  }
  function pagers(current, max, key) {
    if (max <= 1) return "";
    return '<div class="between spaced"><button type="button" class="button" data-collection-page="' +
      key + ':previous" ' + (current <= 0 ? "disabled" : "") + '>← Previous</button>' +
      '<span class="muted small">Page ' + (current + 1) + ' of ' + max + '</span>' +
      '<button type="button" class="button" data-collection-page="' + key + ':next" ' +
      (current >= max-1 ? "disabled" : "") + '>Next →</button></div>';
  }
  function categoryChooser() {
    return '<div class="panel"><div class="controls">' +
      '<label class="field">Collection category<select id="category">' +
      options(categories, state.category) + '</select></label></div></div>';
  }
  function collectionBrowser() {
    const groups = getGroups();
    const maxPages = Math.max(1, Math.ceil(groups.length/PAGE_SIZE));
    groupPage = Math.max(0,Math.min(groupPage,maxPages-1));
    const shown = groups.slice(groupPage*PAGE_SIZE,(groupPage+1)*PAGE_SIZE);
    const controls = '<div class="panel"><div class="controls">' +
      '<label class="field grow">Find a ' + esc(nameOfCategory().toLowerCase().replace(/s$/, "")) +
      '<input id="collectionSearch" type="search" placeholder="Search collections…" value="' + esc(groupSearch) + '"></label>' +
      '<label class="field">Sort by<select id="collectionSort">' +
      options([["count","Most watched"],["average","Highest average rating"],["name","Name A–Z"]],groupSort) +
      '</select></label>' +
      '<label class="field">At least<select id="collectionMinimum">' +
      options([["1","1 watched film"],["2","2 watched films"],["3","3 watched films"],["5","5 watched films"],["10","10 watched films"]],minimumWatched) +
      '</select></label></div></div>';
    const cards = shown.map(g => {
      const rated = g.watched.filter(f => f.rating != null && f.rating !== "");
      return '<button class="collection-card" type="button" data-group="' + esc(g.name) + '">' +
        '<strong>' + esc(g.name) + '</strong>' +
        '<span>' + g.watched.length + ' watched · ' + rated.length + ' rated · ★ ' +
        esc(average(g.watched)) + '</span>' +
        '<div class="spaced muted small">' +
        g.remaining.length + ' from your watchlist still unwatched</div></button>';
    }).join("");
    return layout("Explore collections",
      "Find your favourite directors, actors, composers, studios, countries, years and genres.",
      categoryChooser() + controls +
      '<div class="between"><span class="muted small">' + groups.length +
      ' collections match your filters · ' + (shown.length ? (groupPage*PAGE_SIZE+1) + '–' +
      (groupPage*PAGE_SIZE+shown.length) + ' displayed' : 'none displayed') + '</span></div>' +
      (shown.length ? '<div class="collections spaced">' + cards + '</div>' :
      '<div class="empty"><h2>No collections found</h2><p>Try a different search or reduce the minimum watched count.</p></div>') +
      pagers(groupPage,maxPages,"groups") +
      '<p class="hint spaced">These are <strong>your own library groups</strong>, not all films that exist in a year or country. ' +
      'For director and actor filmography completion, open a person’s collection and choose their full TMDB filmography.</p>'
    );
  }
  function collectionDetail() {
    const group = groupData().find(g=>g.name===state.group);
    const cat = nameOfCategory();
    if (!group) return layout(esc(state.group), "Collection",'<button type="button" id="backGroups" class="button">← Back to collections</button><div class="empty">This group no longer contains films under your current inclusion settings.</div>');
    const watched=group.watched.length, rated=group.watched.filter(f=>f.rating != null&&f.rating!=="").length;
    let rows = group.films.filter(f => filmStatus==="all" ? true : filmStatus==="watched" ? f.watched : filmStatus==="watchlist" ? f.watchlist&&!f.watched : f.watched && (f.rating===null || f.rating===""));
    const cmp=(a,b)=>a.title.localeCompare(b.title);
    if(filmSort==="title")rows.sort(cmp);
    else if(filmSort==="rating")rows.sort((a,b)=>Number(b.rating||0)-Number(a.rating||0)||cmp(a,b));
    else rows.sort((a,b)=>Number(b.year||0)-Number(a.year||0)||cmp(a,b));
    const maxPages = Math.max(1,Math.ceil(rows.length/FILMS_PER_PAGE));
    filmPage=Math.max(0,Math.min(filmPage,maxPages-1));
    const paged=rows.slice(filmPage*FILMS_PER_PAGE,(filmPage+1)*FILMS_PER_PAGE);
    const canFilmography=state.category==="directors"||state.category==="actors";
    const summary='<div class="stat-grid">' + [
      ["Watched",watched],["Rated",rated],["Average ★",average(group.watched)],["On watchlist",group.remaining.length]
    ].map(([label,num])=>'<div class="stat"><div class="label">'+esc(label)+'</div><div class="value">'+esc(num)+'</div></div>').join("")+'</div>';
    const actions='<div class="between spaced" style="flex-wrap:wrap"><button type="button" id="backGroups" class="button button-ghost">← Back to '+esc(cat)+'</button>' +
      (canFilmography ? '<button type="button" id="findFullFilmography" class="button button-primary">Browse full TMDB filmography</button>' : "") +
      '</div>';
    const filters = '<div class="panel"><div class="controls"><label class="field">Films<select id="collectionFilmStatus">' +
      options([["all","All films"],["watched","Watched"],["watchlist","Unwatched watchlist"],["unrated","Watched but unrated"]],filmStatus) +
      '</select></label><label class="field">Sort by<select id="collectionFilmSort">' +
      options([["year","Newest release"],["rating","Highest rated"],["title","Title A–Z"]],filmSort) +
      '</select></label></div></div>';
    const info = '<p class="hint">These numbers reflect only titles in your saved library and watchlist. ' +
      'For ' + esc(cat.toLowerCase()) + ', they are not a claim that you have seen every film in existence.' +
      (canFilmography ? ' Use the TMDB filmography button to find titles you have not added yet.' : "") + '</p>';
    return layout(esc(group.name),cat+' · your collection',actions + summary + info +
      filters + '<div class="between"><span class="muted small">' + rows.length +
      ' titles matching this filter</span><span class="muted small">Click a poster to edit its rating</span></div>' +
      grid(paged) + pagers(filmPage,maxPages,"films"));
  }
  collectionsPage = function () {
    return state.group===null ? collectionBrowser() : collectionDetail();
  };

  const originalBind = bind;
  bind = function () {
    originalBind();
    if (state.page !== "collections") return;
    const category=document.querySelector("#category");
    if (category) category.onchange=()=>{state.category=category.value;state.group=null;groupPage=0;groupSearch="";resetDetail();render();};
    document.querySelectorAll("[data-group]").forEach(el=>el.onclick=()=>{
      state.group=el.dataset.group;resetDetail();render();window.scrollTo({top:0,behavior:"instant"});
    });
    const back=document.querySelector("#backGroups");
    if(back)back.onclick=()=>{state.group=null;render();};
    const search=document.querySelector("#collectionSearch");
    if(search)search.addEventListener("input",e=>{
      const pos=e.target.selectionStart;
      groupSearch=e.target.value;groupPage=0;render();
      const target=document.querySelector("#collectionSearch");
      if(target){target.focus();target.setSelectionRange(pos,pos);}
    });
    for(const [id,onChange] of [
      ["#collectionSort",v=>{groupSort=v;groupPage=0;}],
      ["#collectionMinimum",v=>{minimumWatched=v;groupPage=0;}],
      ["#collectionFilmStatus",v=>{filmStatus=v;filmPage=0;}],
      ["#collectionFilmSort",v=>{filmSort=v;filmPage=0;}]
    ]) {
      const el=document.querySelector(id);
      if(el)el.onchange=()=>{onChange(el.value);render();};
    }
    document.querySelectorAll("[data-collection-page]").forEach(el=>el.onclick=()=>{
      const [scope,way]=el.dataset.collectionPage.split(":");
      if(scope==="groups") groupPage+=way==="next"?1:-1;
      else filmPage+=way==="next"?1:-1;
      render();window.scrollTo({top:0,behavior:"instant"});
    });
    const full=document.querySelector("#findFullFilmography");
    if(full)full.onclick=()=>{
      const role=state.category==="directors"?"director":"actor";
      if(window.FilmAtlasFilmographies?.openSearch) {
        window.FilmAtlasFilmographies.openSearch(state.group,role);
      } else {
        toast("Filmography search is not available. Open the Filmographies tab.");
      }
    };
  };
})();