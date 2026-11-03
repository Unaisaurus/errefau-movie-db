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

## Publish with GitHub Pages

On GitHub, open **Settings → Pages → Build and deployment**. Choose **Deploy from a branch**, `main`, `/ (root)`, then save. After GitHub Pages is enabled, the site is typically hosted at:

`https://unaisaurus.github.io/errefau-movie-db/`

This is an expected address, **not confirmation the site is deployed yet**.

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

- TMDB integration to enrich films with posters, types, cast, crew, studios, production countries, genres and composers.
- Progress counters based on relevant filmographies (separate from watchlist-only completion).
- Better filters, faster bulk editing, film matching review.
- Private synced database and account sign-in if desired.

Film metadata attribution: This product uses the TMDB API but is not endorsed or certified by TMDB. https://www.themoviedb.org/
