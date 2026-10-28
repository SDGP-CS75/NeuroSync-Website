# NeuroSync Website

The public landing page, beta download, release notes, and legal pages for
NeuroSync, a calm productivity companion for ADHD minds.

Production: [neurosync-website.vercel.app](https://neurosync-website.vercel.app/)

## Stack

- Static HTML, CSS, and browser-native JavaScript
- Self-hosted Lexend variable font
- Responsive AVIF/WebP imagery with original-format fallbacks
- Vercel static hosting
- Dependency-free Node.js checks and a Chrome smoke suite

There is no application build step.

## Local development

Requirements: Node.js 20 or newer.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. The local server serves the repository directly,
including clean 404 responses, without installing a separate static-site tool.

## Quality checks

```bash
# HTML, links, anchors, metadata, APK metadata, icons, sitemap, and headers
npm run check:site

# Responsive layout, keyboard menu, five-step story, download, deep links,
# reduced motion, no-JavaScript fallback, and browser console errors
npm run test:browser

# Both suites
npm test

# Network check for the live APK URL, byte size, and expiry
npm run check:download
```

The browser suite needs Chrome or Chromium. Set `CHROME_BIN` if the executable
is not in a standard macOS or Linux location.

GitHub Actions runs static and browser checks for pull requests into `master`
and pushes to `master` or `sujaya-main`. A separate scheduled workflow checks
the hosted beta download every day.

## Branch and deployment workflow

- `master` is the production branch. Vercel deploys it after a pull request is merged.
- `sujaya-main` is the integration branch for ongoing website work.
- Branch from the latest `master`, commit to `sujaya-main`, and push each logical change.
- Open a pull request from `sujaya-main` into `master`; do not merge the work directly.
- Vercel pull-request previews can be used for review before production deployment.

See [DEPLOYMENT.md](DEPLOYMENT.md) for the full deployment and release procedure.

## Beta download

`public/apk.json` is the source of truth for the download URL, byte size,
publication dates, and feedback link. The page fetches it at runtime and keeps
its static download links synchronized through the automated checks.

The current APK is an Expo EAS temporary artifact. It must be replaced before
`expiresAt` or the monitor will fail. For a durable public beta:

1. Publish the signed APK as a GitHub Release asset or another stable,
   organization-controlled HTTPS host.
2. Update `apkUrl`, `sizeBytes`, `listedAt`, and `expiresAt` in
   `public/apk.json`. Use a conservative `expiresAt` only when the host truly
   expires; do not invent a short expiry for durable hosting.
3. Update the release details in `support.html` and the static fallback values
   in `index.html`.
4. Run `npm run check:download` and `npm test`.
5. Include the refreshed release metadata in the pull request into `master`.

Never distribute an APK from an untrusted mirror. Android users should install
only the build linked by the official site.

## Project structure

```text
.
├── index.html                 # Product landing page
├── support.html               # Installation and release notes
├── privacy.html               # Website and beta privacy notice
├── terms.html                 # Beta terms
├── 404.html                   # Branded not-found page
├── styles.css                 # Landing-page design system and responsive layout
├── legal.css                  # Shared support and legal page styles
├── app.js                     # Progressive interaction and release metadata
├── assets/
│   ├── fonts/                 # Self-hosted Lexend and OFL license
│   ├── icons/                 # Favicon, Apple touch icon, and manifest icons
│   ├── images/                # Responsive AVIF/WebP image variants
│   └── social/                # Open Graph preview
├── public/apk.json            # Beta download release metadata
├── scripts/                   # Local server and automated checks
├── .github/workflows/         # CI and scheduled download monitor
├── manifest.webmanifest       # Installable-site metadata
├── robots.txt                 # Crawler policy
├── sitemap.xml                # Public page index
└── vercel.json                # Security and cache headers
```

## Privacy and performance

The website does not add analytics, advertising scripts, account forms, or
first-party cookies. The privacy notice documents Vercel, Expo, and GitHub
processing that can occur when the site is used.

Unversioned CSS and JavaScript revalidate instead of being cached immutably.
Images and fonts use short-lived caching with stale-while-revalidate, and
responsive image sources avoid loading the multi-megabyte originals on modern
browsers.

## License

The project is released under the MIT License. See [LICENSE](LICENSE).
Lexend is distributed under the SIL Open Font License; see
[assets/fonts/OFL.txt](assets/fonts/OFL.txt).

## Team

- Sujaya De Silva - Project Lead
- Chamath Silva - UI/UX Lead
- Jinalee Subasinghe - Full Stack and Marketing
- Nadil Karunarathna - Full-Stack Developer
- Ravindu Withana - Backend Developer
- Sandun Gunawardana - Full-Stack Developer
