document.documentElement.classList.add("js");

const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const desktopStory = window.matchMedia("(min-width: 901px)");

const revealElements = [...document.querySelectorAll(".reveal")];

if ("IntersectionObserver" in window && !prefersReducedMotion.matches) {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
  );

  revealElements.forEach((element) => {
    element.classList.add("reveal-pending");
    revealObserver.observe(element);
  });
} else {
  revealElements.forEach((element) => element.classList.add("visible"));
}

function setupLiveStep() {
  const liveStep = document.querySelector("[data-live-step]");
  if (!liveStep) return;

  const stepButtons = [...liveStep.querySelectorAll("[data-step-button]")];
  const progressRoot = liveStep.querySelector("[data-progress-root]");
  const progressBar = liveStep.querySelector("[data-progress-bar]");
  const nextCopy = liveStep.querySelector("[data-next-copy]");
  const resetButton = liveStep.querySelector("[data-reset-step]");

  if (!stepButtons.length || !progressRoot || !progressBar || !nextCopy || !resetButton) {
    return;
  }

  function getStepLabel(button) {
    const copy = button.querySelector(".ui-step-copy");
    return copy?.firstChild?.textContent?.trim().toLowerCase() || "the next step";
  }

  function updateLiveStep() {
    const completed = stepButtons.filter(
      (button) => button.getAttribute("aria-pressed") === "true"
    ).length;
    const nextButton = stepButtons.find(
      (button) => button.getAttribute("aria-pressed") !== "true"
    );

    progressRoot.setAttribute("aria-valuenow", String(completed));
    progressBar.style.width = `${(completed / stepButtons.length) * 100}%`;
    resetButton.hidden = completed === 0;

    if (completed === stepButtons.length) {
      nextCopy.textContent = "All three steps complete. Take a breath.";
      return;
    }

    nextCopy.textContent = nextButton
      ? `Next: ${getStepLabel(nextButton)}.`
      : "Next: take a short pause.";
  }

  stepButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const isPressed = button.getAttribute("aria-pressed") === "true";
      button.setAttribute("aria-pressed", String(!isPressed));
      updateLiveStep();
    });
  });

  resetButton.addEventListener("click", () => {
    stepButtons.forEach((button) => button.setAttribute("aria-pressed", "false"));
    updateLiveStep();
  });

  updateLiveStep();
}

function setupStory() {
  const storySection = document.querySelector(".experience");
  const storySteps = [...document.querySelectorAll(".story-step")];
  const storyScreens = [...document.querySelectorAll(".screen-state")];

  if (!storySection || !storySteps.length || !storyScreens.length) return;

  let ticking = false;
  let currentIndex = -1;

  function isPinnedStory() {
    return desktopStory.matches && !prefersReducedMotion.matches;
  }

  function setStoryState(index) {
    const pinned = isPinnedStory();

    storySteps.forEach((step, stepIndex) => {
      const isActive = !pinned || stepIndex === index;
      step.classList.toggle("active", isActive);
      step.setAttribute("aria-hidden", String(!isActive));
      step.toggleAttribute("inert", !isActive);
    });

    storyScreens.forEach((screen, screenIndex) => {
      const isVisible = !pinned || screenIndex === index;
      screen.classList.toggle("is-visible", isVisible);
      screen.setAttribute("aria-hidden", String(!isVisible));
    });
  }

  function updateStoryProgress() {
    if (!isPinnedStory()) {
      if (currentIndex !== -2) {
        currentIndex = -2;
        setStoryState(0);
      }
      return;
    }

    const sectionTop = storySection.offsetTop;
    const travel = Math.max(storySection.offsetHeight - window.innerHeight * 0.45, 1);
    const progress = Math.min(
      Math.max((window.scrollY - sectionTop + window.innerHeight * 0.2) / travel, 0),
      0.999
    );
    const index = Math.min(
      storySteps.length - 1,
      Math.floor(progress * storySteps.length)
    );

    if (index !== currentIndex) {
      currentIndex = index;
      setStoryState(index);
    }
  }

  function requestStoryUpdate() {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => {
      updateStoryProgress();
      ticking = false;
    });
  }

  window.addEventListener("scroll", requestStoryUpdate, { passive: true });
  window.addEventListener("resize", requestStoryUpdate);
  desktopStory.addEventListener("change", requestStoryUpdate);
  prefersReducedMotion.addEventListener("change", requestStoryUpdate);

  setStoryState(0);
  requestStoryUpdate();
}

function setupMobileMenu() {
  const toggle = document.getElementById("mobileMenuToggle");
  const mobileNav = document.getElementById("mobileNav");
  if (!toggle || !mobileNav) return;

  const links = [...mobileNav.querySelectorAll("a")];

  function setMenu(open, returnFocus = false) {
    toggle.classList.toggle("active", open);
    mobileNav.classList.toggle("active", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    mobileNav.setAttribute("aria-hidden", String(!open));

    if (returnFocus) toggle.focus();
  }

  toggle.addEventListener("click", () => {
    setMenu(!mobileNav.classList.contains("active"));
  });

  links.forEach((link) => {
    link.addEventListener("click", () => setMenu(false));
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".site-header")) {
      setMenu(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && mobileNav.classList.contains("active")) {
      setMenu(false, true);
    }
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) {
      setMenu(false);
    }
  });
}

function setupClock() {
  const clock = document.getElementById("device-clock");
  if (!clock) return;

  function updateClock() {
    const now = new Date();
    clock.textContent = new Intl.DateTimeFormat([], {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }).format(now);
    clock.dateTime = now.toISOString();
  }

  updateClock();
  window.setInterval(updateClock, 60_000);
}

function setupDownloadMetadata() {
  const downloadTargets = [...document.querySelectorAll("[data-download-link]")];
  const downloadSizes = [...document.querySelectorAll("[data-download-size]")];
  const downloadChannel = document.querySelector("[data-download-channel]");
  const downloadListed = document.querySelector("[data-download-listed]");
  const downloadAvailability = document.querySelector("[data-download-availability]");

  if (!downloadTargets.length) return;

  const dateFormatter = new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });

  function applyMetadata(data) {
    if (!data.apkUrl) return false;

    downloadTargets.forEach((target) => {
      target.href = data.apkUrl;
      target.target = "_blank";
      target.rel = "noopener noreferrer";
    });

    if (downloadChannel && data.channel) {
      downloadChannel.textContent = data.channel;
    }

    if (Number.isFinite(data.sizeBytes)) {
      const size = `${(data.sizeBytes / 1024 / 1024).toFixed(1)} MB`;
      downloadSizes.forEach((element) => {
        element.textContent = size;
      });
    }

    if (downloadListed && data.listedAt) {
      downloadListed.textContent = dateFormatter.format(new Date(data.listedAt));
    }

    if (downloadAvailability && data.expiresAt) {
      const expiresAt = new Date(data.expiresAt);
      downloadAvailability.textContent =
        Date.now() > expiresAt.getTime()
          ? "This hosted build may have expired. Download it if it is still available, or request a fresh build in the issue tracker."
          : `This Expo-hosted beta build is listed until ${dateFormatter.format(expiresAt)}.`;
    }

    return true;
  }

  async function loadMetadata() {
    for (const path of ["./public/apk.json", "./apk.json"]) {
      try {
        const response = await fetch(path, { cache: "no-store" });
        if (!response.ok) continue;
        const data = await response.json();
        if (applyMetadata(data)) return;
      } catch {
        // The direct APK links remain usable if metadata cannot be loaded.
      }
    }
  }

  loadMetadata();
}

function setupCurrentYear() {
  document.querySelectorAll("[data-current-year]").forEach((element) => {
    element.textContent = String(new Date().getFullYear());
  });
}

function restoreDeepLink() {
  if (!window.location.hash) return;

  let targetId;
  try {
    targetId = decodeURIComponent(window.location.hash.slice(1));
  } catch {
    return;
  }

  const target = document.getElementById(targetId);
  if (!target) return;

  const root = document.documentElement;
  const previousScrollBehavior = root.style.scrollBehavior;
  root.style.scrollBehavior = "auto";
  target.scrollIntoView({ block: "start" });
  root.style.scrollBehavior = previousScrollBehavior;
}

setupLiveStep();
setupStory();
setupMobileMenu();
setupClock();
setupDownloadMetadata();
setupCurrentYear();

if (document.readyState === "complete") {
  restoreDeepLink();
} else {
  window.addEventListener("load", restoreDeepLink, { once: true });
}
