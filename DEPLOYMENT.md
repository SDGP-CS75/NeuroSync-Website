# Vercel Deployment Guide

Production site: [neurosync-website.vercel.app](https://neurosync-website.vercel.app/)

## Branch model

- `master` is the production branch.
- `sujaya-main` is the working integration branch.
- Website work is committed and pushed to `sujaya-main`.
- A pull request merges `sujaya-main` into `master`.
- Vercel creates a preview deployment for pull requests and deploys production
  when the pull request is merged into `master`.

Do not deploy an unmerged local directory directly to production. It bypasses
the checks and review history in the pull request.

## Vercel project settings

Use the repository root with these settings:

- Framework preset: Other
- Build command: `npm run build` or leave empty
- Output directory: `.`
- Install command: `npm ci`
- Production branch: `master`

The site is static. `npm run build` only confirms that no compilation step is
required.

## CLI deployment

Install and authenticate the CLI if a dashboard deployment is not available:

```bash
npm install --global vercel
vercel login
```

Create a preview from the current branch:

```bash
vercel
```

Promote only a reviewed `master` revision:

```bash
vercel --prod
```

## Headers and caching

`vercel.json` defines the production security and cache policy:

- Content Security Policy, `nosniff`, frame denial, strict referrer policy, and
  a restrictive permissions policy
- HTML, CSS, and JavaScript revalidate so an unversioned deployment cannot be
  stranded on a one-year immutable cache
- Images and fonts use one-day caching plus seven-day stale-while-revalidate
- `public/apk.json` is explicitly `no-store`

The obsolete `X-XSS-Protection` header is intentionally not used.

## Beta APK release procedure

The current APK is an Expo EAS temporary artifact. Expo artifact links expire,
so the project includes both a visible expiry notice and an automated monitor.

1. Build and sign the Android APK.
2. Publish it to a durable HTTPS location controlled by the project, preferably
   a GitHub Release asset.
3. Update `public/apk.json`:

   ```json
   {
     "channel": "Android beta",
     "hosting": "GitHub Releases",
     "apkUrl": "https://github.com/ORG/REPO/releases/download/TAG/neurosync.apk",
     "sizeBytes": 93131705,
     "listedAt": "2026-10-28T07:33:41Z",
     "feedbackUrl": "https://github.com/SDGP-CS75/NeuroSync-Website/issues/new?title=NeuroSync%20beta%20feedback"
   }
   ```

   `expiresAt` is optional. Include it only when the host actually expires the
   artifact; omit it for a durable GitHub Release or equivalent host. Add
   `sha256` with the verified 64-character checksum when one is available.

   Compute the checksum from the exact file uploaded to the host:

   ```bash
   shasum -a 256 path/to/neurosync.apk
   ```

4. Update the static fallback values and release list in `index.html` and
   `support.html`.
5. Run:

   ```bash
   npm run check:download
   npm test
   ```

6. Commit to `sujaya-main`, push, and include the update in the pull request to
   `master`.

The scheduled `Beta download check` workflow makes a one-byte range request,
compares the host's byte size with `sizeBytes`, and fails when an `expiresAt`
value is present and has passed. A failed scheduled workflow is the signal to
publish a replacement build before users encounter a dead link.

## Pre-merge checklist

- `npm test` passes.
- `npm run check:download` passes for any APK metadata change.
- Desktop, tablet, and mobile previews have no horizontal overflow.
- Download, support, privacy, and terms links open the intended destination.
- No new console errors or failed image requests appear.
- The pull request targets `master`.

## Troubleshooting

### A page returns 404

Confirm the requested file exists at the repository root. `404.html` is served
for unmatched routes.

### An asset changed but users see the old version

Confirm the deployment includes the current `vercel.json`. CSS and JavaScript
must revalidate; do not restore one-year immutable caching for unversioned
files.

### The beta download fails

Run `npm run check:download`. If the Expo artifact expired, publish a new APK,
update `public/apk.json` and the support page, then repeat the release
procedure. For the current 11 November 2026 deadline, move the APK to a GitHub
Release asset or another durable HTTPS host instead of rebuilding only another
temporary EAS artifact. Never point users to an unverified mirror.

### Browser tests cannot find Chrome

Install Chrome or Chromium, or set `CHROME_BIN` to its executable path before
running `npm run test:browser`.

## Support

- [Vercel documentation](https://vercel.com/docs)
- [Project support page](https://neurosync-website.vercel.app/support.html)
- [Project issue tracker](https://github.com/SDGP-CS75/NeuroSync-Website/issues)
