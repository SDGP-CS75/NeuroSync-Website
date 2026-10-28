import { readFile } from "node:fs/promises";

const metadata = JSON.parse(await readFile(new URL("../public/apk.json", import.meta.url), "utf8"));
const expiresAt = metadata.expiresAt ? new Date(metadata.expiresAt) : null;

if (expiresAt && !Number.isFinite(expiresAt.getTime())) {
  throw new Error("public/apk.json contains an invalid expiresAt date.");
}

if (expiresAt && expiresAt <= new Date()) {
  throw new Error(
    `The hosted APK expired on ${expiresAt.toISOString()}. Publish a fresh build and update public/apk.json.`
  );
}

if (metadata.sha256 && !/^[a-f0-9]{64}$/i.test(metadata.sha256)) {
  throw new Error("public/apk.json contains an invalid sha256 checksum.");
}

const response = await fetch(metadata.apkUrl, {
  headers: {
    Range: "bytes=0-0",
    "User-Agent": "NeuroSync-Website-Download-Check/1.0",
  },
  redirect: "follow",
  signal: AbortSignal.timeout(20_000),
});

await response.body?.cancel();

if (!response.ok && response.status !== 206) {
  throw new Error(`APK download returned HTTP ${response.status}.`);
}

const contentRange = response.headers.get("content-range");
const rangeSize = contentRange?.match(/\/(\d+)$/)?.[1];
const reportedSize = rangeSize ? Number(rangeSize) : Number(response.headers.get("content-length"));

if (Number.isFinite(reportedSize) && reportedSize > 1 && reportedSize !== metadata.sizeBytes) {
  throw new Error(
    `APK size mismatch: public/apk.json reports ${metadata.sizeBytes} bytes, host reports ${reportedSize}.`
  );
}

if (!Number.isFinite(reportedSize) || reportedSize <= 1) {
  console.warn("The host did not return a byte size; availability and expiry were verified.");
}

console.log(
  expiresAt
    ? `APK is available (${metadata.sizeBytes} bytes) and listed until ${expiresAt.toISOString()}.`
    : `APK is available (${metadata.sizeBytes} bytes) from ${metadata.hosting || "its configured host"}; no expiry is listed.`
);
