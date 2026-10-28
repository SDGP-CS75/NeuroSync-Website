document.documentElement.classList.add("js");

const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const desktopStoryQuery = window.matchMedia("(min-width: 1081px)");

const clamp = (value, minimum, maximum) =>
  Math.min(Math.max(value, minimum), maximum);

const lerp = (current, target, ease) => current + (target - current) * ease;

function setupReveals() {
  const revealElements = [...document.querySelectorAll(".reveal")];
  if (!revealElements.length) return;

  if (!("IntersectionObserver" in window) || reducedMotionQuery.matches) {
    revealElements.forEach((element) => element.classList.add("visible"));
    return;
  }

  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("visible");
        revealObserver.unobserve(entry.target);
      });
    },
    { rootMargin: "0px 0px -8% 0px", threshold: 0.12 }
  );

  revealElements.forEach((element) => {
    const initialBounds = element.getBoundingClientRect();
    if (initialBounds.top < window.innerHeight * 0.95 && initialBounds.bottom > 0) {
      element.classList.add("visible");
      return;
    }

    element.classList.add("reveal-pending");
    revealObserver.observe(element);
  });

  reducedMotionQuery.addEventListener("change", (event) => {
    if (!event.matches) return;
    revealObserver.disconnect();
    revealElements.forEach((element) => {
      element.classList.remove("reveal-pending");
      element.classList.add("visible");
    });
  });
}

function setupStory() {
  const storySection = document.querySelector(".story");
  const storySteps = [...document.querySelectorAll(".story-step")];
  const storyScreens = [...document.querySelectorAll(".screen-state")];

  if (!storySection || !storySteps.length || !storyScreens.length) return;

  let currentIndex = -1;
  let ticking = false;

  function isPinned() {
    return desktopStoryQuery.matches && !reducedMotionQuery.matches;
  }

  function setStoryState(index) {
    const pinned = isPinned();
    document.documentElement.classList.toggle("story-enhanced", pinned);

    storySteps.forEach((step, stepIndex) => {
      const isActive = !pinned || stepIndex === index;
      step.classList.toggle("active", isActive);

      if (isActive) {
        step.removeAttribute("aria-hidden");
        step.removeAttribute("inert");
      } else {
        step.setAttribute("aria-hidden", "true");
        step.setAttribute("inert", "");
      }
    });

    storyScreens.forEach((screen, screenIndex) => {
      const isVisible = !pinned || screenIndex === index;
      screen.classList.toggle("is-visible", isVisible);
      screen.setAttribute("aria-hidden", String(!isVisible));
    });
  }

  function updateStoryProgress() {
    if (!isPinned()) {
      document.documentElement.classList.remove("story-enhanced");
      if (currentIndex !== -2) {
        currentIndex = -2;
        setStoryState(0);
      }
      return;
    }

    document.documentElement.classList.add("story-enhanced");

    const sectionTop = storySection.getBoundingClientRect().top + window.scrollY;
    const travel = Math.max(storySection.offsetHeight - window.innerHeight, 1);
    const progress = clamp((window.scrollY - sectionTop) / travel, 0, 0.999);
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
  desktopStoryQuery.addEventListener("change", requestStoryUpdate);
  reducedMotionQuery.addEventListener("change", requestStoryUpdate);

  updateStoryProgress();
}

function setupMobileMenu() {
  const toggle = document.getElementById("mobileMenuToggle");
  const mobileNav = document.getElementById("mobileNav");
  if (!toggle || !mobileNav) return;

  const links = [...mobileNav.querySelectorAll("a")];

  function setMenu(open, returnFocus = false) {
    const focusWasInside = mobileNav.contains(document.activeElement);

    toggle.classList.toggle("active", open);
    mobileNav.classList.toggle("active", open);
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    mobileNav.setAttribute("aria-hidden", String(!open));

    if (returnFocus || (!open && focusWasInside)) {
      toggle.focus();
    }
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
    if (window.innerWidth > 1080) {
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
        // Static download links remain usable if metadata cannot be loaded.
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

function setupPhoneMotion() {
  const heroPhone = document.querySelector(".hero-phone");
  const storyPhone = document.querySelector(".story-device");
  const heroUi = document.querySelector(".hero-ui");
  const scenes = [...document.querySelectorAll("[data-phone-scene]")];

  if (
    !heroPhone ||
    !scenes.length ||
    reducedMotionQuery.matches ||
    !window.matchMedia("(pointer: fine)").matches
  ) {
    return;
  }

  const heroMotion = {
    scale: 0.9,
    targetScale: 0.9,
    rotateX: -8,
    targetRotateX: -8,
    rotateY: 12,
    targetRotateY: 12,
    twist: -6,
    targetTwist: -6,
    uiShiftX: 0,
    targetUiShiftX: 0,
    uiShiftY: 0,
    targetUiShiftY: 0,
  };
  const storyMotion = {
    scale: 0.95,
    targetScale: 0.95,
    rotateX: -5,
    targetRotateX: -5,
    rotateY: -10,
    targetRotateY: -10,
    twist: 4,
    targetTwist: 4,
  };

  let frame = 0;

  function render() {
    frame = 0;

    heroMotion.scale = lerp(heroMotion.scale, heroMotion.targetScale, 0.12);
    heroMotion.rotateX = lerp(heroMotion.rotateX, heroMotion.targetRotateX, 0.14);
    heroMotion.rotateY = lerp(heroMotion.rotateY, heroMotion.targetRotateY, 0.12);
    heroMotion.twist = lerp(heroMotion.twist, heroMotion.targetTwist, 0.1);
    heroMotion.uiShiftX = lerp(heroMotion.uiShiftX, heroMotion.targetUiShiftX, 0.12);
    heroMotion.uiShiftY = lerp(heroMotion.uiShiftY, heroMotion.targetUiShiftY, 0.12);

    heroPhone.style.setProperty("--hero-scale", heroMotion.scale.toFixed(3));
    heroPhone.style.setProperty("--tilt-x", heroMotion.rotateX.toFixed(3));
    heroPhone.style.setProperty("--tilt-y", heroMotion.rotateY.toFixed(3));
    heroPhone.style.setProperty("--twist", heroMotion.twist.toFixed(3));
    heroUi?.style.setProperty("--ui-shift-x", `${heroMotion.uiShiftX.toFixed(2)}px`);
    heroUi?.style.setProperty("--ui-shift-y", `${heroMotion.uiShiftY.toFixed(2)}px`);

    if (storyPhone) {
      storyMotion.scale = lerp(storyMotion.scale, storyMotion.targetScale, 0.12);
      storyMotion.rotateX = lerp(storyMotion.rotateX, storyMotion.targetRotateX, 0.14);
      storyMotion.rotateY = lerp(storyMotion.rotateY, storyMotion.targetRotateY, 0.12);
      storyMotion.twist = lerp(storyMotion.twist, storyMotion.targetTwist, 0.1);

      storyPhone.style.setProperty("--story-scale", storyMotion.scale.toFixed(3));
      storyPhone.style.setProperty("--story-tilt-x", storyMotion.rotateX.toFixed(3));
      storyPhone.style.setProperty("--story-tilt-y", storyMotion.rotateY.toFixed(3));
      storyPhone.style.setProperty("--story-twist", storyMotion.twist.toFixed(3));
    }

    const heroSettled =
      Math.abs(heroMotion.scale - heroMotion.targetScale) < 0.001 &&
      Math.abs(heroMotion.rotateX - heroMotion.targetRotateX) < 0.01 &&
      Math.abs(heroMotion.rotateY - heroMotion.targetRotateY) < 0.01 &&
      Math.abs(heroMotion.twist - heroMotion.targetTwist) < 0.01 &&
      Math.abs(heroMotion.uiShiftX - heroMotion.targetUiShiftX) < 0.01 &&
      Math.abs(heroMotion.uiShiftY - heroMotion.targetUiShiftY) < 0.01;
    const storySettled =
      !storyPhone ||
      (Math.abs(storyMotion.scale - storyMotion.targetScale) < 0.001 &&
        Math.abs(storyMotion.rotateX - storyMotion.targetRotateX) < 0.01 &&
        Math.abs(storyMotion.rotateY - storyMotion.targetRotateY) < 0.01 &&
        Math.abs(storyMotion.twist - storyMotion.targetTwist) < 0.01);

    if (!heroSettled || !storySettled) {
      frame = window.requestAnimationFrame(render);
    }
  }

  function requestRender() {
    if (!frame) frame = window.requestAnimationFrame(render);
  }

  function updateScrollTargets() {
    const hero = document.getElementById("hero");
    if (hero) {
      const heroTop = hero.offsetTop - window.scrollY;
      const progress = clamp(1 - heroTop / window.innerHeight, 0, 1);
      heroMotion.targetScale = 0.76 + progress * 0.18;
      heroMotion.targetRotateY = 12 - progress * 16;
      heroMotion.targetRotateX = -8 + progress * 10;
      heroMotion.targetTwist = -6 + progress * 5;
    }

    const story = document.querySelector(".story");
    if (story && desktopStoryQuery.matches) {
      const sectionTop = story.getBoundingClientRect().top + window.scrollY;
      const travel = Math.max(story.offsetHeight - window.innerHeight, 1);
      const progress = clamp((window.scrollY - sectionTop) / travel, 0, 1);
      storyMotion.targetScale = 0.86 + progress * 0.08;
      storyMotion.targetRotateY = -10 + progress * 18;
      storyMotion.targetRotateX = -5 + progress * 8;
      storyMotion.targetTwist = 4 - progress * 8;
    }

    requestRender();
  }

  scenes.forEach((scene) => {
    const phone = scene.querySelector("[data-phone]");
    if (!phone) return;

    scene.addEventListener("pointermove", (event) => {
      const rect = scene.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - 0.5;
      const y = (event.clientY - rect.top) / rect.height - 0.5;

      if (phone.classList.contains("hero-phone")) {
        heroMotion.targetRotateY = x * 20;
        heroMotion.targetRotateX = -y * 13;
        heroMotion.targetTwist = x * 4;
        heroMotion.targetUiShiftX = x * 18;
        heroMotion.targetUiShiftY = y * 18;
      } else {
        storyMotion.targetRotateY = x * 12;
        storyMotion.targetRotateX = -y * 8;
      }

      requestRender();
    });

    scene.addEventListener("pointerleave", () => {
      heroMotion.targetUiShiftX = 0;
      heroMotion.targetUiShiftY = 0;
      updateScrollTargets();
    });
  });

  window.addEventListener("scroll", updateScrollTargets, { passive: true });
  window.addEventListener("resize", updateScrollTargets);
  updateScrollTargets();
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

setupReveals();
setupStory();
setupMobileMenu();
setupClock();
setupDownloadMetadata();
setupCurrentYear();
setupPhoneMotion();

if (document.readyState === "complete") {
  window.requestAnimationFrame(restoreDeepLink);
} else {
  window.addEventListener(
    "load",
    () => window.requestAnimationFrame(restoreDeepLink),
    { once: true }
  );
}
