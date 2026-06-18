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
- **Served by a Cloudflare Worker** that adds basic security headers and
  verifies the Cloudflare Access identity token (see below).

## Project layout

```
.
├── .eleventy.js              # Eleventy config + asset passthrough
├── wrangler.toml             # Cloudflare Worker / static-assets config
├── worker/
│   ├── index.js              # Worker: serves _site/ + security headers
│   └── access.js             # Cloudflare Access JWT verification
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

## Cloudflare Access verification

The portal is meant to sit behind [Cloudflare
Access](https://developers.cloudflare.com/cloudflare-one/applications/). Access
authenticates the user at the edge and forwards a signed identity JWT
(`Cf-Access-Jwt-Assertion` header / `CF_Authorization` cookie). The Worker
**verifies that token on every request** as defence-in-depth — confirming the
request really came through *our* Access organisation and carries a genuine,
unexpired identity — before serving any page.

Verification (`worker/access.js`) follows
[Cloudflare's guidance](https://developers.cloudflare.com/cloudflare-one/identity/authorization-cookie/validating-json/):

- only `RS256` is accepted (rejects `alg: none` and algorithm-confusion);
- the signature is checked against the org's public keys (the JWKS at
  `https://<team-domain>/cdn-cgi/access/certs`, cached and refreshed on key
  rotation), using the runtime's WebCrypto — no third-party dependencies;
- the `iss`, `aud` and `exp`/`nbf`/`iat` claims are validated.

A request that fails verification is rejected (`403`); the Worker fails closed.

### Configuration

Set both [vars](https://developers.cloudflare.com/workers/configuration/environment-variables/)
in `wrangler.toml` (or the dashboard) for any deployment behind Access:

| Var                  | Value                                                              |
| -------------------- | ----------------------------------------------------------------- |
| `ACCESS_TEAM_DOMAIN` | Your team domain, e.g. `your-team.cloudflareaccess.com`.          |
| `ACCESS_AUD`         | The application's **Audience (AUD)** tag from the Access app's Overview tab. |

When either var is unset (e.g. local `wrangler dev` with no Access in front),
enforcement is skipped and the Worker logs a warning, so local development
keeps working.
