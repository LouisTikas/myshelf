# MyShelf

A self-hosted media journal and virtual bookshelf for books, movies, TV, music, video games, and board games. Search a database, pick the match, and the cover and details import automatically. Write your thoughts, add it to collections, and it appears on your shelves.

**Cost: $0.** It runs on a free GitHub repo plus Cloudflare Pages' free plan.

## How it works

```
You (admin page) ──► /api/* (Cloudflare Pages Functions, holds your API keys)
                        ├─► searches Open Library / Google Books / TMDB / Spotify / IGDB / BGG
                        └─► commits a Markdown file + cover image to your GitHub repo
GitHub push ──► Cloudflare Pages rebuilds the static site (~1 min) ──► your shelves update
```

- **Your data is plain files** in this repo. There's one Markdown file per item in `src/content/items/`, and covers live in `public/covers/`. You can edit them by hand anytime.
- **Collections** are in `src/data/collections.json`. Each one shows up as a shelf on the home page.
- **Site title and tagline** are in `src/data/site.json`.

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

### 3. Make a GitHub token (so the app can save entries)
GitHub → Settings → Developer settings → **Fine-grained personal access tokens** → Generate new token.
- Repository access: **Only select repositories** → your shelf repo
- Permissions → Repository → **Contents: Read and write**
- Set a long expiration and put a reminder on your calendar to renew it.

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
| `GITHUB_TOKEN` | The token from step 3 |
| `GITHUB_REPO` | `your-username/myshelf` |
| `GITHUB_BRANCH` | `main` (optional, `main` is the default) |
| `TMDB_TOKEN` | TMDB Read Access Token |
| `TWITCH_CLIENT_ID` / `TWITCH_CLIENT_SECRET` | From Twitch |
| `BGG_TOKEN` | From BGG |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | From Spotify |
| `GOOGLE_BOOKS_KEY` | Optional |
| `CONTACT_EMAIL` | Optional. Sent in the User-Agent to Open Library and MusicBrainz, as they request. |

Then go to **Deployments** → **Retry deployment** on the latest one. Variables only apply to new deployments.

### 6. Use it
Go to `https://<project>.pages.dev/admin/` and enter your `ADMIN_TOKEN`. The header shows any API keys that are still missing.

- **＋ Add:** pick a type, search, click a result, adjust the details, write your notes, and save.
- **Library:** edit or delete anything.
- **Collections:** create, rename, reorder, and remove shelves.
- Every item page has a small **Edit** link that goes straight to the editor.

New entries appear on the public site after the roughly one-minute rebuild.

## Optional: make the site private
By default the shelves are public (anyone with the URL can see them), but only you can add or edit. To hide everything, use **Cloudflare Zero Trust → Access → Applications → Add → Self-hosted**: enter your `*.pages.dev` domain and add a policy that allows only your email. It's free for up to 50 users. To protect only the admin area, use the path `admin*`. The `/api` is already locked by your token either way.

## Free-tier limits worth knowing
- Each save, edit, or delete is one commit, which triggers one Cloudflare build. The free plan allows **500 builds a month**.
- Spotify Development Mode requires Premium and caps search at 10 results per type.
- Attribution for TMDB and BGG is in the site footer, as their terms require. Leave it in.

## Local development
```bash
npm install
npm run dev          # public site only, at http://localhost:4321
npm test             # offline tests for the API layer
```
To run the admin and API locally, copy `.dev.vars.example` to `.dev.vars`, fill it in, and run `npm run preview`. That builds the site and serves it with `wrangler pages dev` at http://localhost:8788.

## Item file format
```markdown
---
title: Dune
type: book            # book | movie | tv | music | videogame | boardgame
creator: Frank Herbert
year: "1965"
cover: /covers/book-dune-1965.jpg
status: finished      # want | in-progress | finished | abandoned
rating: 4.5           # 0–5, halves allowed
dateStarted: 2026-10-01
dateFinished: 2026-10-28
collections: [favorites, "2026"]
tags: [sci-fi]
genres: [Science fiction]
details: { pages: 612 }
source: { name: Open Library, id: OL893415W, url: https://openlibrary.org/works/OL893415W }
---

Your journal / review in Markdown.
```

## Project map
```
src/content/items/      your entries (Markdown)
src/data/               collections.json, site.json
src/pages/              home, /shelf/[slug], /type/[type], /item/[slug], /journal, /admin
src/styles/global.css   colors and shelf look (CSS variables at the top)
functions/api/          Cloudflare Pages Functions: search, details, item, save, delete, collections, ping
server/                 provider integrations + GitHub commit helper (used by the functions)
public/covers/          downloaded cover images
```
