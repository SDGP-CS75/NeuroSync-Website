import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startStaticServer } from "./lib/static-server.mjs";

const downloadMetadata = JSON.parse(
  await readFile(new URL("../public/apk.json", import.meta.url), "utf8")
);
const expectedSizeLabel = `${(downloadMetadata.sizeBytes / 1024 / 1024).toFixed(1)} MB`;

const delay = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

function reportFatalError(error) {
  console.error(error instanceof Error ? error.stack : error);
  if (process.env.GITHUB_ACTIONS === "true") {
    const message = String(error instanceof Error ? error.message : error)
      .replaceAll("%", "%25")
      .replaceAll("\r", "%0D")
      .replaceAll("\n", "%0A");
    console.log(`::error title=Browser smoke failure::${message}`);
  }
}

process.on("uncaughtException", (error) => {
  reportFatalError(error);
  process.exitCode = 1;
});

process.on("unhandledRejection", (error) => {
  reportFatalError(error);
  process.exitCode = 1;
});

async function findChrome() {
  const candidates = [
    process.env.CHROME_BIN,
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      await access(candidate, constants.X_OK);
      return candidate;
    } catch {
      // Try the next common browser location.
    }
  }

  throw new Error("Chrome was not found. Set CHROME_BIN to a Chrome or Chromium executable.");
}

async function waitForFile(filePath, timeout = 10_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    try {
      return await readFile(filePath, "utf8");
    } catch {
      await delay(100);
    }
  }
  throw new Error(`Timed out waiting for ${filePath}`);
}

class CdpClient {
  constructor(webSocketUrl) {
    this.webSocket = new WebSocket(webSocketUrl);
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Map();
    this.errors = [];
  }

  async connect() {
    await new Promise((resolve, reject) => {
      this.webSocket.addEventListener("open", resolve, { once: true });
      this.webSocket.addEventListener("error", reject, { once: true });
    });

    this.webSocket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (message.id) {
        const pending = this.pending.get(message.id);
        if (!pending) return;
        this.pending.delete(message.id);
        if (message.error) pending.reject(new Error(message.error.message));
        else pending.resolve(message.result);
        return;
      }

      if (message.method === "Runtime.exceptionThrown") {
        this.errors.push(message.params.exceptionDetails?.text || "Unhandled browser exception");
      }
      if (message.method === "Runtime.consoleAPICalled" && message.params.type === "error") {
        this.errors.push("A console.error was emitted.");
      }
      if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
        this.errors.push(message.params.entry.text);
      }

      for (const listener of this.events.get(message.method) || []) {
        listener(message.params);
      }
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.webSocket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  on(method, listener) {
    const listeners = this.events.get(method) || [];
    listeners.push(listener);
    this.events.set(method, listeners);
  }

  async evaluate(expression) {
    const response = await this.send("Runtime.evaluate", {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    });

    if (response.exceptionDetails) {
      throw new Error(response.exceptionDetails.text || "Browser evaluation failed.");
    }

    return response.result?.value;
  }

  close() {
    this.webSocket.close();
  }
}

async function waitFor(client, expression, label, timeout = 8_000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await client.evaluate(expression)) return;
    await delay(100);
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function navigate(client, url) {
  await client.send("Page.navigate", { url });
  await waitFor(client, 'document.readyState === "complete"', `page load: ${url}`);
  await delay(350);
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function runViewportChecks(client, origin, { width, height, mobile }) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile,
  });
  await navigate(client, origin);

  const layout = await client.evaluate(`({
    title: document.title,
    h1: document.querySelector("h1")?.textContent.trim(),
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    brokenImages: [...document.images].filter(
      (image) => image.complete && image.naturalWidth === 0
    ).length,
    size: document.querySelector("[data-download-size]")?.textContent.trim(),
    host: document.querySelector("[data-download-host]")?.textContent.trim(),
    availability: document.querySelector("[data-download-availability]")?.textContent.trim(),
    checksum: document.querySelector("[data-download-checksum]")?.textContent.trim()
  })`);
  assert(layout.title.includes("NeuroSync"), `${width}px: page title is missing.`);
  assert(
    layout.h1?.toLowerCase().includes("focus without pressure"),
    `${width}px: hero heading is missing.`
  );
  assert(layout.overflow <= 1, `${width}px: horizontal overflow is ${layout.overflow}px.`);
  assert(layout.brokenImages === 0, `${width}px: ${layout.brokenImages} image(s) failed to load.`);
  assert(layout.size === expectedSizeLabel, `${width}px: APK size metadata did not load.`);
  assert(
    layout.host === downloadMetadata.hosting,
    `${width}px: APK hosting metadata did not load.`
  );
  assert(
    layout.availability?.includes(downloadMetadata.hosting),
    `${width}px: APK availability copy does not identify the host.`
  );
  assert(
    layout.checksum === downloadMetadata.sha256,
    `${width}px: APK checksum metadata did not load.`
  );

  await client.evaluate(
    'document.querySelector(".story-step-phone").scrollIntoView({ block: "center" })'
  );
  await delay(500);
  const mobileScreenshot = await client.evaluate(`(async () => {
    const image = document.querySelector(".story-step-phone img");
    const bitmap = await createImageBitmap(await (await fetch(image.currentSrc)).blob());
    return {
      width: bitmap.width,
      height: bitmap.height,
      src: image.currentSrc
    };
  })()`);
  assert(
    mobileScreenshot.width >= 220 && mobileScreenshot.height >= 478,
    `${width}px: story screenshot ${mobileScreenshot.src} is ${mobileScreenshot.width}x${mobileScreenshot.height}; expected at least 220x478.`
  );

  const downloadLinks = await client.evaluate(`[
    ...document.querySelectorAll("[data-download-link]")
  ].every((link) => link.href.endsWith(".apk"))`);
  assert(downloadLinks, `${width}px: one or more download links are invalid.`);

  if (width < 1081) {
    const menuResult = await client.evaluate(`(() => {
      const toggle = document.querySelector("#mobileMenuToggle");
      const nav = document.querySelector("#mobileNav");
      toggle.focus();
      toggle.click();
      const opened = toggle.getAttribute("aria-expanded") === "true" && nav.classList.contains("active");
      const lastLink = nav.querySelector("a:last-child");
      document.querySelector("main").focus();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
      const trappedFromOutside = document.activeElement === toggle;
      lastLink.focus();
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
      const tabWraps = document.activeElement === toggle;
      toggle.focus();
      document.dispatchEvent(new KeyboardEvent("keydown", {
        key: "Tab",
        shiftKey: true,
        bubbles: true
      }));
      const shiftTabWraps = document.activeElement === lastLink;
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return {
        opened,
        trappedFromOutside,
        tabWraps,
        shiftTabWraps,
        closed: toggle.getAttribute("aria-expanded") === "false" && !nav.classList.contains("active"),
        focusReturned: document.activeElement === toggle
      };
    })()`);
    assert(menuResult.opened, `${width}px: mobile menu did not open.`);
    assert(menuResult.trappedFromOutside, `${width}px: focus escaped the open mobile menu.`);
    assert(menuResult.tabWraps, `${width}px: Tab did not wrap inside the mobile menu.`);
    assert(menuResult.shiftTabWraps, `${width}px: Shift+Tab did not wrap inside the mobile menu.`);
    assert(menuResult.closed, `${width}px: Escape did not close the mobile menu.`);
    assert(menuResult.focusReturned, `${width}px: closing the mobile menu did not restore focus.`);

    const mobileStory = await client.evaluate(`({
      stepCount: document.querySelectorAll(".story-step").length,
      visibleSteps: [...document.querySelectorAll(".story-step")].every(
        (step) => getComputedStyle(step).opacity === "1"
      ),
      hiddenStates: [...document.querySelectorAll(".story-step")].filter(
        (step) => step.getAttribute("aria-hidden") === "true"
      ).length,
      inlinePhoneVisible: getComputedStyle(document.querySelector(".story-step-phone")).display !== "none",
      stickyPhoneHidden: getComputedStyle(document.querySelector(".story-phone")).display === "none"
    })`);
    assert(mobileStory.stepCount === 5, `${width}px: expected five restored story steps.`);
    assert(mobileStory.visibleSteps, `${width}px: mobile story copy is not visible without pinning.`);
    assert(mobileStory.hiddenStates === 0, `${width}px: mobile story copy is incorrectly hidden from assistive tech.`);
    assert(mobileStory.inlinePhoneVisible, `${width}px: mobile story screenshots are missing.`);
    assert(mobileStory.stickyPhoneHidden, `${width}px: the pinned phone is still shown on mobile.`);
  }
}

async function runInteractionChecks(client, origin) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await navigate(client, origin);

  const storyGeometry = await client.evaluate(`(() => {
    const story = document.querySelector(".story");
    return {
      top: story.getBoundingClientRect().top + window.scrollY,
      height: story.offsetHeight,
      viewport: window.innerHeight,
      enhanced: document.documentElement.classList.contains("story-enhanced"),
      stepCount: document.querySelectorAll(".story-step").length
    };
  })()`);
  assert(storyGeometry.enhanced, "The desktop story did not enter its pinned presentation.");
  assert(storyGeometry.stepCount === 5, "The desktop story is missing one or more steps.");

  await client.evaluate('document.querySelector(".story").scrollIntoView()');
  await delay(500);
  const desktopScreenshot = await client.evaluate(`(async () => {
    const image = document.querySelector(".screen-state.is-visible img");
    const bitmap = await createImageBitmap(await (await fetch(image.currentSrc)).blob());
    return {
      width: bitmap.width,
      height: bitmap.height,
      src: image.currentSrc
    };
  })()`);
  assert(
    desktopScreenshot.width >= 440 && desktopScreenshot.height >= 956,
    `Desktop story screenshot ${desktopScreenshot.src} is ${desktopScreenshot.width}x${desktopScreenshot.height}; expected at least 440x956.`
  );

  const travel = storyGeometry.height - storyGeometry.viewport;
  const fractions = [0.05, 0.25, 0.45, 0.65, 0.85];
  for (const [expectedIndex, fraction] of fractions.entries()) {
    await client.evaluate(`window.scrollTo(0, ${storyGeometry.top + travel * fraction})`);
    await delay(550);

    const storyState = await client.evaluate(`({
      activeIndex: [...document.querySelectorAll(".story-step")].findIndex(
        (step) => step.classList.contains("active")
      ),
      hiddenSteps: [...document.querySelectorAll(".story-step")].filter(
        (step) => step.getAttribute("aria-hidden") === "true"
      ).length,
      visibleScreens: [...document.querySelectorAll(".screen-state")].filter(
        (screen) => screen.classList.contains("is-visible")
      ).length
    })`);
    assert(
      storyState.activeIndex === expectedIndex,
      `Desktop story advanced to step ${storyState.activeIndex} instead of ${expectedIndex}.`
    );
    assert(storyState.hiddenSteps === 4, "The desktop story exposes more than one step to assistive tech.");
    assert(storyState.visibleScreens === 1, "The desktop story should show exactly one product screen.");
  }

  await navigate(client, `${origin}/?deep-link-test=1#story`);
  await delay(650);
  const deepLinkTop = await client.evaluate(
    'document.querySelector("#story").getBoundingClientRect().top'
  );
  assert(deepLinkTop >= 76 && deepLinkTop <= 148, `Deep link landed at ${deepLinkTop}px instead of the section.`);

  await client.send("Page.reload", { ignoreCache: true });
  await delay(200);
  await waitFor(client, 'document.readyState === "complete"', "deep-link reload");
  await delay(350);
  const reloadTop = await client.evaluate(
    'document.querySelector("#story").getBoundingClientRect().top'
  );
  assert(reloadTop >= 76 && reloadTop <= 148, `Reloaded deep link landed at ${reloadTop}px.`);
}

async function runProgressiveEnhancementChecks(client, origin) {
  await client.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-reduced-motion", value: "reduce" }],
  });
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: true,
  });
  await navigate(client, origin);

  const reducedMotion = await client.evaluate(`({
    allVisible: [...document.querySelectorAll(".reveal")].every(
      (element) => getComputedStyle(element).opacity === "1"
    ),
    storyVisible: [...document.querySelectorAll(".story-step")].every(
      (step) => step.getAttribute("aria-hidden") !== "true" && getComputedStyle(step).opacity === "1"
    ),
    inlinePhoneVisible: getComputedStyle(document.querySelector(".story-step-phone")).display !== "none",
    stickyPhoneHidden: getComputedStyle(document.querySelector(".story-phone")).display === "none"
  })`);
  assert(reducedMotion.allVisible, "Reduced-motion content is not fully visible.");
  assert(reducedMotion.storyVisible, "Reduced-motion story content is hidden.");
  assert(reducedMotion.inlinePhoneVisible, "Reduced-motion story screenshots are hidden.");
  assert(reducedMotion.stickyPhoneHidden, "Reduced motion still uses the pinned story phone.");

  await client.send("Emulation.setScriptExecutionDisabled", { value: true });
  await navigate(client, origin);
  const noScript = await client.evaluate(`({
    htmlClass: document.documentElement.className,
    heroVisible: getComputedStyle(document.querySelector(".hero-copy")).opacity === "1",
    storyVisible: [...document.querySelectorAll(".story-step")].every(
      (step) => getComputedStyle(step).opacity === "1"
    ),
    inlinePhoneVisible: getComputedStyle(document.querySelector(".story-step-phone")).display !== "none",
    mobileNavDisplay: getComputedStyle(document.querySelector("#mobileNav")).display,
    mobileNavHidden: document.querySelector("#mobileNav").getAttribute("aria-hidden"),
    mobileNavLinks: document.querySelectorAll("#mobileNav a").length,
    toggleDisplay: getComputedStyle(document.querySelector("#mobileMenuToggle")).display
  })`);
  assert(noScript.htmlClass.includes("no-js"), "No-JS mode lost its no-js class.");
  assert(noScript.heroVisible, "Hero content is hidden when JavaScript is unavailable.");
  assert(noScript.storyVisible, "Story content is hidden when JavaScript is unavailable.");
  assert(noScript.inlinePhoneVisible, "Story screenshots are hidden when JavaScript is unavailable.");
  assert(noScript.mobileNavDisplay === "flex", "Mobile navigation is hidden when JavaScript is unavailable.");
  assert(noScript.mobileNavHidden === "false", "No-JS mobile navigation is hidden from assistive technology.");
  assert(noScript.mobileNavLinks === 5, "No-JS mobile navigation is missing links.");
  assert(noScript.toggleDisplay === "none", "The mobile menu toggle is shown without JavaScript.");
  await client.send("Emulation.setScriptExecutionDisabled", { value: false });
}

async function runHighDensityImageChecks(client, origin) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width: 1440,
    height: 900,
    deviceScaleFactor: 2,
    mobile: false,
  });
  await navigate(client, origin);
  await client.evaluate('document.querySelector(".story").scrollIntoView()');
  await delay(500);

  const screenshot = await client.evaluate(`(async () => {
    const image = document.querySelector(".screen-state.is-visible img");
    const bitmap = await createImageBitmap(await (await fetch(image.currentSrc)).blob());
    return {
      src: image.currentSrc,
      width: bitmap.width,
      height: bitmap.height
    };
  })()`);

  assert(
    screenshot.src.includes("-440."),
    `High-density desktop selected ${screenshot.src} instead of the 440w variant.`
  );
  assert(
    screenshot.width >= 440 && screenshot.height >= 956,
    `High-density desktop selected ${screenshot.width}x${screenshot.height} instead of at least 440x956.`
  );
}

const chromePath = await findChrome();
const userDataDir = await mkdtemp(path.join(os.tmpdir(), "neurosync-chrome-"));
const server = await startStaticServer({ root: process.cwd() });
let chrome;
let client;

try {
  chrome = spawn(
    chromePath,
    [
      "--headless=new",
      "--disable-background-networking",
      "--disable-component-update",
      "--disable-default-apps",
      "--disable-extensions",
      "--disable-gpu",
      "--disable-sync",
      "--hide-scrollbars",
      "--no-first-run",
      "--no-default-browser-check",
      "--no-sandbox",
      "--remote-debugging-port=0",
      `--user-data-dir=${userDataDir}`,
      "about:blank",
    ],
    { stdio: ["ignore", "ignore", "pipe"] }
  );

  const activePort = await waitForFile(path.join(userDataDir, "DevToolsActivePort"));
  const [debugPort] = activePort.trim().split("\n");
  const targets = await fetch(`http://127.0.0.1:${debugPort}/json/list`).then((response) => response.json());
  const pageTarget = targets.find((target) => target.type === "page");
  assert(pageTarget?.webSocketDebuggerUrl, "Chrome did not expose a page debugging target.");

  client = new CdpClient(pageTarget.webSocketDebuggerUrl);
  await client.connect();
  await Promise.all([
    client.send("Page.enable"),
    client.send("Runtime.enable"),
    client.send("Log.enable"),
  ]);

  await runViewportChecks(client, server.origin, { width: 1440, height: 900, mobile: false });
  await runViewportChecks(client, server.origin, { width: 768, height: 1024, mobile: true });
  await runViewportChecks(client, server.origin, { width: 390, height: 844, mobile: true });
  await runInteractionChecks(client, server.origin);
  await runHighDensityImageChecks(client, server.origin);
  await runProgressiveEnhancementChecks(client, server.origin);

  assert(client.errors.length === 0, `Browser errors:\n${client.errors.join("\n")}`);
  console.log("Browser smoke checks passed at 1440px, 768px, and 390px.");
} finally {
  client?.close();
  if (chrome && chrome.exitCode === null) {
    await new Promise((resolve) => {
      const timer = setTimeout(resolve, 2_000);
      chrome.once("exit", () => {
        clearTimeout(timer);
        resolve();
      });
      chrome.kill("SIGTERM");
    });
  }
  await server.close();
  await rm(userDataDir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
