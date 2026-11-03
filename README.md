# Film Atlas 🎬

A personal film-tracking website inspired by the things you wish Letterboxd could do: collections, editable ratings, watchlists, and statistics.

## What's included in the first version

- Import your own Letterboxd `watched.csv` and `ratings.csv` **locally in your browser**.
- Ignore CSV dates, reviews, diary entries, personal lists and old watchlists.
- Preserve watched-but-unrated films.
- Change ratings in 0.5-star steps, add films, mark watched/unwatched, or build a fresh watchlist.
- Browse release-year collections and rating statistics immediately.
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

## Planned next steps

- Improve TMDB matching for alternate titles and tricky releases; review uncertain matches in bulk.
- Progress counters based on relevant filmographies (separate from watchlist-only completion).
- Better filters, faster bulk editing, film matching review.
- Private synced database and account sign-in if desired.

Film metadata attribution: This product uses the TMDB API but is not endorsed or certified by TMDB. https://www.themoviedb.org/
