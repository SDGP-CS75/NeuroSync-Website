import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { spawn } from "node:child_process";
import { constants } from "node:fs";
import os from "node:os";
import path from "node:path";
import { startStaticServer } from "./lib/static-server.mjs";

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
    size: document.querySelector("[data-download-size]")?.textContent.trim()
  })`);
  assert(layout.title.includes("NeuroSync"), `${width}px: page title is missing.`);
  assert(layout.h1?.includes("Focus without pressure."), `${width}px: hero heading is missing.`);
  assert(layout.overflow <= 1, `${width}px: horizontal overflow is ${layout.overflow}px.`);
  assert(layout.brokenImages === 0, `${width}px: ${layout.brokenImages} image(s) failed to load.`);
  assert(layout.size === "88.8 MB", `${width}px: APK metadata did not load.`);

  const downloadLinks = await client.evaluate(`[
    ...document.querySelectorAll("[data-download-link]")
  ].every((link) => link.href.endsWith(".apk"))`);
  assert(downloadLinks, `${width}px: one or more download links are invalid.`);

  if (width < 901) {
    const menuResult = await client.evaluate(`(() => {
      const toggle = document.querySelector("#mobileMenuToggle");
      const nav = document.querySelector("#mobileNav");
      toggle.focus();
      toggle.click();
      const opened = toggle.getAttribute("aria-expanded") === "true" && nav.classList.contains("active");
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
      return {
        opened,
        closed: toggle.getAttribute("aria-expanded") === "false" && !nav.classList.contains("active"),
        focusReturned: document.activeElement === toggle
      };
    })()`);
    assert(menuResult.opened, `${width}px: mobile menu did not open.`);
    assert(menuResult.closed, `${width}px: Escape did not close the mobile menu.`);
    assert(menuResult.focusReturned, `${width}px: closing the mobile menu did not restore focus.`);

    const mobileStory = await client.evaluate(`({
      visibleSteps: [...document.querySelectorAll(".story-step")].every(
        (step) => getComputedStyle(step).opacity === "1"
      ),
      hiddenStates: [...document.querySelectorAll(".story-step")].filter(
        (step) => step.getAttribute("aria-hidden") === "true"
      ).length
    })`);
    assert(mobileStory.visibleSteps, `${width}px: mobile story copy is not visible without pinning.`);
    assert(mobileStory.hiddenStates === 0, `${width}px: mobile story copy is incorrectly hidden from assistive tech.`);
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

  const liveStep = await client.evaluate(`(() => {
    const first = document.querySelector("[data-step-button]");
    const reset = document.querySelector("[data-reset-step]");
    const progress = document.querySelector("[data-progress-root]");
    first.click();
    const advanced = first.getAttribute("aria-pressed") === "true" && progress.getAttribute("aria-valuenow") === "1";
    reset.click();
    return {
      advanced,
      reset: progress.getAttribute("aria-valuenow") === "0" && reset.hidden
    };
  })()`);
  assert(liveStep.advanced, "The hero task interaction did not advance.");
  assert(liveStep.reset, "The hero task reset did not clear progress.");

  await navigate(client, `${origin}/?deep-link-test=1#experience`);
  const deepLinkTop = await client.evaluate(
    'document.querySelector("#experience").getBoundingClientRect().top'
  );
  assert(deepLinkTop >= 60 && deepLinkTop <= 140, `Deep link landed at ${deepLinkTop}px instead of the section.`);
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
      (step) => step.getAttribute("aria-hidden") === "false" && getComputedStyle(step).opacity === "1"
    )
  })`);
  assert(reducedMotion.allVisible, "Reduced-motion content is not fully visible.");
  assert(reducedMotion.storyVisible, "Reduced-motion story content is hidden.");

  await client.send("Emulation.setScriptExecutionDisabled", { value: true });
  await navigate(client, origin);
  const noScript = await client.evaluate(`({
    heroVisible: getComputedStyle(document.querySelector(".hero-copy")).opacity === "1",
    storyVisible: [...document.querySelectorAll(".story-step")].every(
      (step) => getComputedStyle(step).opacity === "1"
    )
  })`);
  assert(noScript.heroVisible, "Hero content is hidden when JavaScript is unavailable.");
  assert(noScript.storyVisible, "Story content is hidden when JavaScript is unavailable.");
  await client.send("Emulation.setScriptExecutionDisabled", { value: false });
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
