# MyShelf

A self-hosted media journal and virtual bookshelf for books, movies, TV, music, video games, and board games. Search a database, pick the match, and the cover and details import automatically. Write your thoughts, add it to collections, and it appears on your shelves.

**Cost: $0.** It runs on Cloudflare's free plan (Pages + D1 database + KV storage — no credit card needed). The code lives in a free GitHub repo.

## How it works

```
You (admin page) ──► /api/* (runs on Cloudflare, holds your API keys)
                        ├─► searches Open Library / Google Books / TMDB / Spotify / IGDB / BGG
                        └─► saves the entry to D1 and the cover image to KV
Visitors ──► pages render straight from D1, so every change is live immediately
```

- **Your entries** (details, notes, collections, shelf orders) live in a **Cloudflare D1** database. The tables create themselves.
- **Cover images** live in **Cloudflare KV** and are served from `/img/…`.
- **Site title and tagline** are in `src/data/site.json` (changing it is a code change, so it redeploys).
- **Backups:** Manage → Library → **Download backup** saves everything as one JSON file. Do this now and then.
- GitHub only holds the code now. Pushing code changes still redeploys the site, but adding or editing entries never does, so the 500-builds-a-month limit no longer matters.

## One-time setup (about 30–45 minutes, mostly collecting free API keys)

### 1. Put the code in a private GitHub repo
Create a new **private** repo (for example `myshelf`), then push this folder to it:
```bash
git init && git add . && git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR-USERNAME/myshelf.git
git push -u origin main
```

### 2. Create the Cloudflare Pages project
Cloudflare dashboard → **Workers & Pages** → **Create** → choose the **Pages** tab → **Connect to Git** → pick the repo.
- Framework preset: **Astro**
- Build command: `npm run build`
- Build output directory: `dist`

Deploy it. Your site will be live at `https://<project>.pages.dev`.

### 3. Create the database and cover storage
Cloudflare dashboard → **Storage & Databases**:
- **D1 SQL Database** → **Create** → name it `myshelf`.
- **Workers KV** → **Create** → name it `myshelf-covers`.

Then open your Pages project → **Settings → Bindings** → **Add**:
- **D1 database**: variable name `DB` → pick `myshelf`.
- **KV namespace**: variable name `COVERS` → pick `myshelf-covers`.

Add both for **Production** (and Preview if you use preview deployments).

### 4. Get the free API keys
| Source | Where | What to copy |
|---|---|---|
| **TMDB** (movies, TV) | themoviedb.org → Settings → API → request a personal key | **API Read Access Token** (the long one) |
| **IGDB** (video games) | dev.twitch.tv/console → Register Your Application (redirect URL `http://localhost`, client type Confidential). Your Twitch account needs 2FA turned on. | Client ID + Client Secret |
| **BoardGameGeek** | boardgamegeek.com/applications → register a non-commercial app → create a token. Approval can take a little while. | Token |
| **Spotify** (music) | developer.spotify.com/dashboard → Create app → check **Web API** → redirect URI `http://127.0.0.1:8788/callback` (required, but unused) | Client ID + Client Secret |
| Open Library | No key needed | |
| Google Books | Optional. Works without a key at low volume. | API key (optional) |

If Spotify isn't set up or ever fails, music search falls back to **MusicBrainz + Cover Art Archive** automatically.

### 5. Add the secrets to Cloudflare
Pages project → **Settings → Variables and Secrets** → add each one as a **Secret** for Production:

| Name | Value |
|---|---|
| `ADMIN_TOKEN` | A long random password you make up. This is your login. |
| `TMDB_TOKEN` | TMDB Read Access Token |
| `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` | From Twitch |
| `BGG_TOKEN` | From BGG |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | From Spotify |
| `GOOGLE_BOOKS_KEY` | Optional |
| `CONTACT_EMAIL` | Optional. Sent in the User-Agent to Open Library and MusicBrainz, as they request. |

Then go to **Deployments** → **Retry deployment** on the latest one. Variables and bindings only apply to new deployments.

### 6. Use it
Go to `https://<project>.pages.dev/admin/` and enter your `ADMIN_TOKEN`. The header shows any API keys that are still missing, and a banner appears if the database or cover storage isn't connected.

- **＋ Add:** pick a type, search, click a result, adjust the details, write your notes, and save.
- **Library:** edit or delete anything.
- **Collections:** create, rename, reorder, and remove shelves.
- Every item page has a small **Edit** link that goes straight to the editor.

Changes are live on the public site as soon as you save.

## Optional: make the site private
By default the shelves are public (anyone with the URL can see them), but only you can add or edit. To hide everything, use **Cloudflare Zero Trust → Access → Applications → Add → Self-hosted**: enter your `*.pages.dev` domain and add a policy that allows only your email. It's free for up to 50 users. To protect only the admin area, use the path `admin*`. The `/api` is already locked by your token either way.

## Moving from the old Git-based version
Older versions stored entries as Markdown files in `src/content/items/` and covers in `public/covers/`. After connecting D1 and KV (step 3), open the admin page: a banner offers to **Import** anything that isn't in the database yet. It copies the entries, covers, collections and shelf orders, and is safe to run more than once. Once you've checked the import, those folders (plus `src/data/collections.json` and `arrangements.json`) can be deleted, and `GITHUB_TOKEN` / `GITHUB_REPO` removed from Cloudflare.

## Free-tier limits worth knowing
- D1 free: 5 GB storage, 5 million rows read a day. KV free: 1 GB, 100,000 reads and 1,000 writes a day. A personal shelf won't come close.
- Builds now happen only when you push code (500 a month on the free plan).
- Spotify Development Mode requires Premium and caps search at 10 results per type.
- Attribution for TMDB and BGG is in the site footer, as their terms require. Leave it in.

## Local development
```bash
npm install
npm run dev          # public site only, at http://localhost:4321
npm test             # offline tests for the API layer
```
`npm run dev` works too, using a local D1/KV if you've copied `wrangler.toml.example` to `wrangler.toml`. To run the full site locally, also copy `.dev.vars.example` to `.dev.vars`, fill it in, and run `npm run preview` (builds, then serves with `wrangler pages dev` at http://localhost:8788). Local data lives in `.wrangler/` and never touches your live database.

## Item format
Each item is stored as JSON in D1 (and that's what **Download backup** gives you):
```json
{
  "slug": "book-dune-1965",
  "item": {
    "title": "Dune", "type": "book", "creator": "Frank Herbert", "year": "1965",
    "cover": "/img/book-dune-1965-m1a2b3.jpg", "coverAspect": 0.6667,
    "status": "finished", "rating": 4.5,
    "dateStarted": "2026-10-01", "dateFinished": "2026-10-28",
    "collections": ["favorites", "2026"], "tags": ["sci-fi"], "genres": ["Science fiction"],
    "details": { "pages": 612 },
    "source": { "name": "Open Library", "id": "OL893415W", "url": "https://openlibrary.org/works/OL893415W" }
  },
  "body": "Your journal / review in Markdown."
}
```
`type` is book | movie | tv | music | videogame | boardgame; `status` is want | in-progress | finished | abandoned; `rating` is 0–5 in halves.

## Project map
```
src/pages/              home, /shelf/[slug], /type/[type], /item/[slug], /journal, /admin, /img/[name]
src/pages/api/          search, details, item, save, delete, collections, arrangements, import, export, ping
src/middleware.js       locks /api/* behind your ADMIN_TOKEN
server/                 D1 + KV storage, provider integrations, import of the old Markdown shelf
src/data/site.json      site title and tagline
src/styles/global.css   colors and shelf look (CSS variables at the top)
```
