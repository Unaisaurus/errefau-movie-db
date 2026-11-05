# Film Atlas 🎬

A personal film-tracking website inspired by the things you wish Letterboxd could do: collections, editable ratings, watchlists, and statistics.

## What's included in the first version

- Import your own Letterboxd `watched.csv` and `ratings.csv` **locally in your browser**.
- Ignore CSV dates, reviews, diary entries, personal lists and old watchlists.
- Preserve watched-but-unrated films.
- Change ratings in 0.5-star steps, add films, mark watched/unwatched, or build a fresh watchlist.
- Browse release-year collections and rating statistics immediately.
- **Filmographies**: search a director or actor using TMDB, browse their movie credits, compare watched and missing titles, calculate your rating average, and add missing movies to your watchlist.
- Edit director, actor, composer, studio, country and genre metadata; collections are generated from these fields.
- Hide/show shorts, documentaries, series, TV movies and unclassified entries with settings.
- Export/restore JSON backups.

## Start locally

Download the project and open `index.html` in a browser. It needs no build step or dependencies.

## Deploy with Vercel (required for TMDB integration)

GitHub Pages can serve the static pages but **cannot run the private TMDB proxy**. To use automatic movie metadata, deploy the repository on [Vercel](https://vercel.com/) instead:

1. Sign in to Vercel with GitHub and choose **Add New → Project**.
2. Import `Unaisaurus/errefau-movie-db`.
3. Select **Other** (no framework), leave build command blank and set output directory to `.` / repository root if requested.
4. Open the new project's **Settings → Environment Variables**.
5. Add `TMDB_READ_ACCESS_TOKEN` with the **API Read Access Token** from your TMDB account (not your API key). Add it for **Production** (and Preview if desired).
6. **Redeploy** the project so the new environment variable takes effect.
7. Open the Vercel URL, visit Film Atlas **Settings → Automatic movie metadata → Test connection**.
8. Once it says the connection is working, click **Enrich next 25 films**. Repeat to enrich further batches. Uncertain matches are flagged for manual review; you can open any film and choose **Search TMDB** to pick the correct result.

Do not enter your secret token directly into the website UI or a GitHub file. TMDB requests go through `api/tmdb.mjs` on Vercel, where the token stays in environment variables. The proxy itself is publicly callable; this is intended as a lightweight personal prototype, not a hardened production authentication/rate-limiting setup.

## Data and privacy

This is a **public source-code repository** and includes **no personal movie collection**. Your imports, ratings and watchlist are stored in your current browser's localStorage. They do not sync between browsers or devices and are not protected by an account password. Export a JSON backup frequently. Clearing browser data can delete your collection.

Never commit your Letterboxd CSV files or personal backups into this public repository unless you explicitly wish to publish them.

## Importing

1. Log in to Letterboxd and export account data.
2. Extract `watched.csv` and `ratings.csv` from the ZIP.
3. Open **Settings** in Film Atlas, select both CSVs, and click **Import**.

Imported films start as **Unclassified**, rather than assuming every Letterboxd entry is a feature film. They are visible until you classify them and choose which types to include.

Reimporting matches films by their Letterboxd URI. It does **not** overwrite edited ratings on existing films, so your changes are safe.

## Combined releases without a matching TMDB entry

If a film was originally broadcast in parts but you watched and rated the combined version, you can **keep one film entry** and resolve it manually rather than assigning an incorrect ID for one part. Open **Settings → Automatic movie metadata → Needs manual review**, click **Resolve manually**, choose the film type, enter director / composer / studio / country metadata, and save. The film is retained once with its original rating and excluded from future TMDB matching attempts. You can still edit it from the Library later.

These manually resolved entries count towards your library and collection statistics (according to the inclusion settings), but are **not yet recognized as watched** in TMDB-person filmography progress, because they have no TMDB movie ID. The enrichment dashboard tracks them under **Manually catalogued**.

## Favorites and reversible sorting

Film cards in **Library**, **Watchlist** and **Collections** have a separate heart button. Use it to add or remove a favorite without changing watched status or star ratings. The Library and Watchlist have a **Favorites only** filter and a **Reverse order** button for their title/year/rating sorts. Collection group and subgroup sorting include most/fewest watched, highest/lowest average rating, and A–Z/Z–A; individual collection films include highest/lowest rating, newest/oldest, and A–Z/Z–A. Individual collections also support a **♥ Favorites** filter. Matched films in **Filmographies** can be favorited, too.

Favorite flags are stored on each local record and included in JSON backups and restores. Letterboxd CSV reimports keep existing favorites because matching records are updated in place. For now favorites are browser-local like the rest of Film Atlas data.

## Upgraded Collections

**Collections → category browser:** Search by collection name, sort by most/fewest watched films, highest/lowest personal average rating, or alphabetical order, and filter by minimum watched count.

**Collections → selected year/director/actor/etc.:** Search film titles and credits inside the collection, filter watched/rated/unrated/watchlist, and sort individual movies by rating, watched status, release year, or title.

**Break down this collection:** Select a secondary category (such as the directors of films released in 2024), search those groups, and rank them by most/fewest watched films or highest/lowest average rating. Click a subgroup to filter the film posters. The summary at the top reflects the whole collection, not these temporary filters.

All counts represent your **saved local collection**, not all films ever made. Director and actor collection pages link to their wider TMDB filmographies.

## Filmography counting caveats

The Filmographies tab uses TMDB's **person/movie credits** data. It is not a definitive list of feature films: credits may include shorts, documentaries, unreleased titles, and other productions. Adult-tagged titles and video releases are excluded from the default credits display. A watched film is recognized only if its saved TMDB **movie** ID matches a credit (so unmatched titles won't accidentally count). Totals are specific to the selected person's director or actor credits; filmography totals are distinct from the counts of films in your own library.

To try it, open **Filmographies** and search for a director or actor. Select the correct person, then browse watched, missing and watchlisted film credits. Adding an unwatched credit to the watchlist retrieves its metadata and saves it locally.

## Planned next steps

- Improve TMDB matching for alternate titles and tricky releases; add bulk review resolution. The Settings page now reports enriched, unprocessed, manual-review and incomplete-match counts, with separate next-25, retry and repair actions.
- Progress counters based on relevant filmographies (separate from watchlist-only completion).
- Better filters, faster bulk editing, film matching review.
- Private synced database and account sign-in if desired.

Film metadata attribution: This product uses the TMDB API but is not endorsed or certified by TMDB. https://www.themoviedb.org/

## When enrichment stops before all films have credits

Go to **Settings → Automatic movie metadata**. The counters distinguish **Enriched via TMDB**, **Manually catalogued**, **Not yet tried**, **Needs review**, and **Incomplete match**. Use **Enrich next 25 unprocessed** until the unprocessed count reaches zero. If the remaining titles are in **Needs review**, the algorithm could not confidently match them: you can use **Retry 25 needing review** to try with improved matching, but unresolved entries may still need individual TMDB selection. Use **Repair 25 incomplete matches** if some matched entries retain an unclassified type. A TMDB-matched movie can legitimately have no poster if TMDB has none. Back up your local JSON regularly; this browser-only prototype does not synchronize data.
