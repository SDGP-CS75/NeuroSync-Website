import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const failures = [];
const warnings = [];

function fail(message) {
  failures.push(message);
}

function warn(message) {
  warnings.push(message);
}

function check(condition, message) {
  if (!condition) fail(message);
}

async function exists(filePath) {
  try {
    return (await stat(filePath)).isFile();
  } catch {
    return false;
  }
}

async function readJson(relativePath) {
  return JSON.parse(await readFile(path.join(root, relativePath), "utf8"));
}

function parseAttributes(tag) {
  const attributes = {};
  const source = tag.replace(/^<\s*[^\s>]+/, "");
  const attributePattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match;

  while ((match = attributePattern.exec(source))) {
    attributes[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? "";
  }

  return attributes;
}

function localReference(reference, sourceFile) {
  if (
    !reference ||
    reference.startsWith("#") ||
    /^(?:https?:|mailto:|tel:|data:|javascript:)/i.test(reference)
  ) {
    return null;
  }

  const base = new URL(`https://neurosync.test/${path.relative(root, sourceFile)}`);
  const resolved = new URL(reference, base);
  if (resolved.origin !== base.origin) return null;

  let pathname = decodeURIComponent(resolved.pathname);
  if (pathname.endsWith("/")) pathname += "index.html";
  return path.join(root, pathname.replace(/^\/+/, ""));
}

function pngDimensions(buffer) {
  const signature = "89504e470d0a1a0a";
  if (buffer.subarray(0, 8).toString("hex") !== signature) return null;
  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

async function findHtmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    if (["node_modules", ".git", ".taste-skill", "assets"].includes(entry.name)) continue;
    const filePath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await findHtmlFiles(filePath)));
    } else if (entry.name.endsWith(".html")) {
      files.push(filePath);
    }
  }

  return files;
}

const htmlFiles = (await findHtmlFiles(root)).sort();
const htmlByPath = new Map();

check(htmlFiles.length >= 5, "Expected the landing page, support, privacy, terms, and 404 pages.");

for (const filePath of htmlFiles) {
  const relativePath = path.relative(root, filePath);
  const html = await readFile(filePath, "utf8");
  htmlByPath.set(filePath, html);

  check(/^<!DOCTYPE html>/i.test(html.trimStart()), `${relativePath} is missing a doctype.`);
  check(/<html\s+lang="en"/i.test(html), `${relativePath} is missing a language declaration.`);
  check((html.match(/<main\b/gi) || []).length === 1, `${relativePath} should contain exactly one main landmark.`);
  check((html.match(/<h1\b/gi) || []).length === 1, `${relativePath} should contain exactly one h1.`);
  check(/<title>[^<]+<\/title>/i.test(html), `${relativePath} is missing a non-empty title.`);

  const ids = [...html.matchAll(/\bid="([^"]+)"/gi)].map((match) => match[1]);
  const idSet = new Set(ids);
  check(idSet.size === ids.length, `${relativePath} contains duplicate IDs.`);

  const mainMatch = html.match(/<main\b([^>]*)>/i);
  if (mainMatch) {
    const mainAttributes = parseAttributes(mainMatch[0]);
    check(Boolean(mainAttributes.id), `${relativePath} main landmark needs an id for the skip link.`);
    if (mainAttributes.id) {
      check(
        html.includes(`href="#${mainAttributes.id}"`),
        `${relativePath} is missing a skip link to its main landmark.`
      );
    }
  }

  if (relativePath !== "404.html") {
    check(
      /<meta\s+name="description"\s+content="[^"]+"/i.test(html),
      `${relativePath} is missing a meta description.`
    );
    check(
      /<link\s+rel="canonical"\s+href="https:\/\/neurosync-website\.vercel\.app\//i.test(html),
      `${relativePath} is missing the production canonical URL.`
    );
  } else {
    check(/<meta\s+name="robots"\s+content="noindex"/i.test(html), "404.html should be noindex.");
  }

  for (const match of html.matchAll(/\bhref="([^"]+)"/gi)) {
    const reference = match[1];
    if (reference.startsWith("#") && reference.length > 1) {
      const target = decodeURIComponent(reference.slice(1));
      check(idSet.has(target), `${relativePath} links to missing anchor #${target}.`);
    }

    const targetPath = localReference(reference, filePath);
    if (targetPath) {
      check(await exists(targetPath), `${relativePath} links to missing file ${reference}.`);
    }
  }

  for (const match of html.matchAll(/\bsrc="([^"]+)"/gi)) {
    const targetPath = localReference(match[1], filePath);
    if (targetPath) {
      check(await exists(targetPath), `${relativePath} references missing file ${match[1]}.`);
    }
  }

  for (const match of html.matchAll(/\bsrcset="([^"]+)"/gi)) {
    for (const candidate of match[1].split(",")) {
      const reference = candidate.trim().split(/\s+/)[0];
      const targetPath = localReference(reference, filePath);
      if (targetPath) {
        check(await exists(targetPath), `${relativePath} references missing responsive asset ${reference}.`);
      }
    }
  }

  for (const match of html.matchAll(/<img\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    check("alt" in attributes, `${relativePath} contains an image without an alt attribute.`);
    check(Boolean(attributes.width && attributes.height), `${relativePath} contains an image without dimensions.`);
  }

  for (const match of html.matchAll(/<a\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    if (attributes.target === "_blank") {
      check(
        /\bnoopener\b/i.test(attributes.rel || ""),
        `${relativePath} contains a new-tab link without rel="noopener".`
      );
    }
  }

  for (const match of html.matchAll(/<button\b[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    check(Boolean(attributes.type), `${relativePath} contains a button without an explicit type.`);
  }

  for (const match of html.matchAll(/\baria-controls="([^"]+)"/gi)) {
    check(idSet.has(match[1]), `${relativePath} aria-controls points to missing #${match[1]}.`);
  }
}

const indexHtml = htmlByPath.get(path.join(root, "index.html")) || "";
check(/<meta\s+property="og:image"\s+content="https:\/\/neurosync-website\.vercel\.app\/assets\/social\/neurosync-preview\.png"/i.test(indexHtml), "The landing page is missing its Open Graph image.");
check(/<meta\s+name="twitter:card"\s+content="summary_large_image"/i.test(indexHtml), "The landing page is missing its Twitter card.");
check(/<link\s+rel="manifest"\s+href="\.\/manifest\.webmanifest"/i.test(indexHtml), "The landing page is missing its web manifest.");
check(/<script\s+src="\.\/app\.js"\s+defer><\/script>/i.test(indexHtml), "The landing page must load app.js with defer.");
check(/<html\s+lang="en"\s+class="no-js"/i.test(indexHtml), "The landing page must start in no-JS mode.");
check(
  /<nav\s+class="mobile-nav"[^>]*aria-hidden="false"/i.test(indexHtml),
  "The mobile navigation must remain available when JavaScript is unavailable."
);
check(!/<form\b/i.test(indexHtml), "The landing page should not reintroduce a non-functional form.");
check(!/href="#"/i.test(indexHtml), "The landing page contains an empty placeholder link.");

const manifest = await readJson("manifest.webmanifest");
check(Boolean(manifest.name && manifest.short_name && manifest.start_url), "The manifest is missing required identity fields.");
check(manifest.icons?.length >= 2, "The manifest needs at least two icons.");
check(manifest.theme_color === "#f5f7fb", "The manifest theme color must match the landing page.");
for (const icon of manifest.icons || []) {
  const iconPath = path.join(root, icon.src.replace(/^\/+/, ""));
  check(await exists(iconPath), `Manifest icon is missing: ${icon.src}`);
}

for (const [relativePath, expected] of [
  ["assets/icons/favicon-32.png", 32],
  ["assets/icons/apple-touch-icon.png", 180],
  ["assets/icons/icon-192.png", 192],
  ["assets/icons/icon-512.png", 512],
]) {
  const dimensions = pngDimensions(await readFile(path.join(root, relativePath)));
  check(Boolean(dimensions), `${relativePath} is not a valid PNG.`);
  check(dimensions?.width === expected && dimensions?.height === expected, `${relativePath} has unexpected dimensions.`);
}

const socialDimensions = pngDimensions(await readFile(path.join(root, "assets/social/neurosync-preview.png")));
check(
  socialDimensions?.width === 1200 && socialDimensions?.height === 630,
  "The social preview must be 1200x630."
);

const apk = await readJson("public/apk.json");
for (const field of ["channel", "hosting", "apkUrl", "sizeBytes", "listedAt", "feedbackUrl"]) {
  check(Boolean(apk[field]), `public/apk.json is missing ${field}.`);
}
check(Number.isFinite(apk.sizeBytes) && apk.sizeBytes > 0, "APK size must be a positive number.");
check(new URL(apk.apkUrl).protocol === "https:", "The APK URL must use HTTPS.");
check(new URL(apk.feedbackUrl).protocol === "https:", "The feedback URL must use HTTPS.");
const listedAt = new Date(apk.listedAt);
check(Number.isFinite(listedAt.getTime()), "APK listedAt must be a valid date.");
if (apk.expiresAt !== undefined) {
  const expiresAt = new Date(apk.expiresAt);
  check(Number.isFinite(expiresAt.getTime()), "APK expiresAt must be a valid date.");
  check(expiresAt > listedAt, "APK expiresAt must be later than listedAt.");
  check(expiresAt > new Date(), "The hosted APK has expired; publish a fresh beta build.");
}
if (apk.sha256 !== undefined) {
  check(
    typeof apk.sha256 === "string" && /^[a-f0-9]{64}$/i.test(apk.sha256),
    "APK sha256 must be a 64-character hexadecimal checksum."
  );
}

for (const match of indexHtml.matchAll(/<a\b[^>]*data-download-link[^>]*>/gi)) {
  const attributes = parseAttributes(match[0]);
  check(attributes.href === apk.apkUrl, "A download link is out of sync with public/apk.json.");
}
for (const [relativePath, html] of htmlByPath) {
  for (const match of html.matchAll(/<a\b[^>]*data-feedback-link[^>]*>/gi)) {
    const attributes = parseAttributes(match[0]);
    check(
      attributes.href === apk.feedbackUrl,
      `${relativePath} has a feedback link out of sync with public/apk.json.`
    );
  }
}

const sitemap = await readFile(path.join(root, "sitemap.xml"), "utf8");
const sitemapLocations = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
check(sitemapLocations.length >= 4, "The sitemap should list the public pages.");
for (const location of sitemapLocations) {
  const url = new URL(location);
  const relativePath = url.pathname === "/" ? "index.html" : url.pathname.replace(/^\/+/, "");
  check(await exists(path.join(root, relativePath)), `Sitemap URL has no matching file: ${location}`);
}

const robots = await readFile(path.join(root, "robots.txt"), "utf8");
check(
  robots.includes("Sitemap: https://neurosync-website.vercel.app/sitemap.xml"),
  "robots.txt does not point to the production sitemap."
);

const vercel = await readJson("vercel.json");
const vercelText = JSON.stringify(vercel);
check(!vercelText.includes("immutable"), "Unversioned assets must not use immutable caching.");
check(!vercelText.includes("31536000"), "Unversioned assets must not use a one-year cache.");
check(!vercelText.includes("X-XSS-Protection"), "Remove the obsolete X-XSS-Protection header.");
check(vercelText.includes("Content-Security-Policy"), "vercel.json is missing a Content Security Policy.");
check(vercelText.includes("Referrer-Policy"), "vercel.json is missing a Referrer Policy.");

const packageJson = await readJson("package.json");
check(Boolean(packageJson.scripts?.test), "package.json is missing a test script.");
check(Boolean(packageJson.scripts?.["test:browser"]), "package.json is missing a browser test script.");
check(await exists(path.join(root, "LICENSE")), "LICENSE is missing.");

if (warnings.length) {
  console.warn(`Site check warnings (${warnings.length}):`);
  warnings.forEach((message) => console.warn(`- ${message}`));
}

if (failures.length) {
  console.error(`Site check failures (${failures.length}):`);
  failures.forEach((message) => console.error(`- ${message}`));
  process.exitCode = 1;
} else {
  console.log(`Site checks passed across ${htmlFiles.length} HTML pages.`);
}
