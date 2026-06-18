# Intranet Portal

A static employee portal with configurable service cards, built with
[Eleventy](https://www.11ty.dev/) and [UIkit](https://getuikit.com/), using
[Font Awesome](https://fontawesome.com/) icons and a dark theme, and served by
a [Cloudflare Worker](https://developers.cloudflare.com/workers/).

## Features

- **Configurable cards** — add, remove, group and re-style services by editing a
  single JSON file (`src/_data/services.json`). No template edits required.
- **Font Awesome icons** with a per-card accent colour.
- **Dark theme** layered on UIkit, with a gradient backdrop and hover effects.
- **Instant search** — filter cards by name/description; press `/` to focus.
- **Offline-friendly** — UIkit and Font Awesome are vendored from npm at build
  time, so the portal has no external CDN dependency (good for isolated
  networks).
- **Served by a Cloudflare Worker** that adds basic security headers.

## Project layout

```
.
├── .eleventy.js              # Eleventy config + asset passthrough
├── wrangler.toml             # Cloudflare Worker / static-assets config
├── worker/
│   └── index.js              # Worker: serves _site/ + security headers
├── src/
│   ├── _data/
│   │   ├── site.json         # Title, company name, tagline, footer
│   │   └── services.json     # ← the configurable cards live here
│   ├── _includes/
│   │   ├── base.njk          # Page shell (loads UIkit / FA / theme)
│   │   └── card.njk          # Single card markup
│   ├── css/theme.css         # Dark theme
│   ├── js/portal.js          # Client-side search/filter
│   ├── index.njk             # Portal home page
│   └── 404.njk               # Not-found page
└── _site/                    # Build output (git-ignored)
```

## Configuring cards

Edit `src/_data/services.json`. Each group renders as a titled section; each
service renders as a card:

```json
{
  "groups": [
    {
      "name": "Engineering",
      "icon": "fa-solid fa-code",
      "services": [
        {
          "name": "GitHub",
          "description": "Source code and pull requests.",
          "url": "https://github.com",
          "icon": "fa-brands fa-github",
          "color": "#f0f6fc"
        }
      ]
    }
  ]
}
```

| Field         | Where        | Notes                                              |
| ------------- | ------------ | -------------------------------------------------- |
| `name`        | group / card | Section heading / card title.                      |
| `icon`        | group / card | Any Font Awesome class, e.g. `fa-brands fa-slack`. |
| `description` | card         | Short text under the card title.                   |
| `url`         | card         | Link target (opens in a new tab).                  |
| `color`       | card         | Accent colour (top bar + icon tint). Optional.     |

Site-wide text (title, company name, tagline, footer) lives in
`src/_data/site.json`.

## Develop

```bash
npm install
npm run serve     # Eleventy dev server with live reload (http://localhost:8080)
```

## Build & deploy

```bash
npm run build     # generate the static site into _site/
npm run dev       # run the Worker locally via Wrangler (serves _site/)
npm run deploy    # build + wrangler deploy to Cloudflare
```

`npm run deploy` requires a Cloudflare account; authenticate with
`npx wrangler login` (or set `CLOUDFLARE_API_TOKEN`) first.
