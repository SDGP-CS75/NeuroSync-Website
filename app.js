const revealElements = document.querySelectorAll(".reveal");
const splitTargets = document.querySelectorAll(".split-text");
const storySection = document.querySelector(".story");
const storySteps = [...document.querySelectorAll(".story-step")];
const storyScreens = [...document.querySelectorAll(".screen-state")];
const heroPhone = document.querySelector(".hero-phone");
const storyPhone = document.querySelector(".story-device");
const heroUi = document.querySelector(".hero-ui");
const phoneScenes = document.querySelectorAll("[data-phone-scene]");
const ctaForm = document.querySelector(".cta-form");
const formStatus = document.getElementById("form-status");
const deviceClock = document.getElementById("device-clock");

const featureOrder = ["focus", "breakdown", "routine", "mood", "dashboard"];
const motionState = {
  currentScroll: window.scrollY,
  targetScroll: window.scrollY,
  lastScroll: window.scrollY,
  ticking: false,
};
const heroMotion = {
  scale: 0.84,
  targetScale: 0.84,
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
  scale: 0.88,
  targetScale: 0.88,
  rotateX: -5,
  targetRotateX: -5,
  rotateY: -10,
  targetRotateY: -10,
  twist: 4,
  targetTwist: 4,
};

if ("scrollRestoration" in history) {
  history.scrollRestoration = "manual";
}

function splitText(target) {
  const text = target.textContent.trim();
  target.textContent = "";

  let globalIndex = 0;
  const words = text.split(" ");

  words.forEach((word, wordIndex) => {
    const wordSpan = document.createElement("span");
    wordSpan.className = "split-word";
    wordSpan.style.display = "inline-block";
    wordSpan.style.whiteSpace = "nowrap";

    [...word].forEach((char) => {
      const charSpan = document.createElement("span");
      charSpan.className = "split-char";
      charSpan.textContent = char;
      charSpan.style.transitionDelay = `${globalIndex * 22}ms`;
      wordSpan.appendChild(charSpan);
      globalIndex++;
    });

    target.appendChild(wordSpan);

    if (wordIndex < words.length - 1) {
      const spaceSpan = document.createElement("span");
      spaceSpan.className = "split-space";
      spaceSpan.textContent = " ";
      target.appendChild(spaceSpan);
      globalIndex++;
    }
  });
}

splitTargets.forEach(splitText);

const revealObserver = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");

        if (entry.target.classList.contains("split-text")) {
          entry.target.classList.add("is-visible");
        }
      }
    });
  },
  { threshold: 0.2 }
);

revealElements.forEach((element) => revealObserver.observe(element));
splitTargets.forEach((element) => revealObserver.observe(element));

function setStoryState(index) {
  storySteps.forEach((step, stepIndex) => {
    step.classList.toggle("active", stepIndex === index);
  });

  storyScreens.forEach((screen, screenIndex) => {
    screen.classList.toggle("is-visible", screenIndex === index);
  });
}

function updateStoryProgress() {
  if (!storySection) return;

  const storyTop = storySection.offsetTop;
  const viewportHeight = window.innerHeight;
  const total = Math.max(storySection.offsetHeight - viewportHeight, 1);
  const progress = Math.min(Math.max((motionState.currentScroll - storyTop) / total, 0), 1);
  const index = Math.min(featureOrder.length - 1, Math.floor(progress * featureOrder.length));

  setStoryState(index);

  const scale = 0.86 + progress * 0.08;
  const rotateY = -10 + progress * 18;
  const rotateX = -5 + progress * 8;
  const twist = 4 - progress * 8;

  storyMotion.targetScale = scale;
  storyMotion.targetRotateY = rotateY;
  storyMotion.targetRotateX = rotateX;
  storyMotion.targetTwist = twist;
}

function updateHeroPhone() {
  const hero = document.getElementById("hero");
  if (!hero || !heroPhone) return;

  const viewportHeight = window.innerHeight;
  const heroTop = hero.offsetTop;
  const relativeTop = heroTop - motionState.currentScroll;
  const progress = Math.min(Math.max(1 - relativeTop / viewportHeight, 0), 1.25);
  const scale = 0.76 + Math.min(progress, 1) * 0.18;
  const rotateY = 12 - Math.min(progress, 1) * 16;
  const rotateX = -8 + Math.min(progress, 1) * 10;
  const twist = -6 + Math.min(progress, 1) * 5;

  heroMotion.targetScale = scale;
  heroMotion.targetRotateY = rotateY;
  heroMotion.targetRotateX = rotateX;
  heroMotion.targetTwist = twist;
}

function applyScrollDirectionTilt() {
  const delta = motionState.currentScroll - motionState.lastScroll;
  const directionTilt = Math.max(Math.min(delta * 0.035, 1.8), -1.8);

  heroMotion.targetRotateX += -directionTilt * 0.7;
  storyMotion.targetRotateX += -directionTilt * 0.45;

  motionState.lastScroll = motionState.currentScroll;
}

function lerp(current, target, ease) {
  return current + (target - current) * ease;
}

function renderPhoneMotion() {
  if (heroPhone) {
    heroMotion.scale = lerp(heroMotion.scale, heroMotion.targetScale, 0.12);
    heroMotion.rotateX = lerp(heroMotion.rotateX, heroMotion.targetRotateX, 0.14);
    heroMotion.rotateY = lerp(heroMotion.rotateY, heroMotion.targetRotateY, 0.12);
    heroMotion.twist = lerp(heroMotion.twist, heroMotion.targetTwist, 0.1);

    heroPhone.style.setProperty("--hero-scale", heroMotion.scale.toFixed(3));
    heroPhone.style.setProperty("--tilt-x", heroMotion.rotateX.toFixed(3));
    heroPhone.style.setProperty("--tilt-y", heroMotion.rotateY.toFixed(3));
    heroPhone.style.setProperty("--twist", heroMotion.twist.toFixed(3));

    if (heroUi) {
      heroMotion.uiShiftX = lerp(heroMotion.uiShiftX, heroMotion.targetUiShiftX, 0.12);
      heroMotion.uiShiftY = lerp(heroMotion.uiShiftY, heroMotion.targetUiShiftY, 0.12);
      heroUi.style.setProperty("--ui-shift-x", `${heroMotion.uiShiftX.toFixed(2)}px`);
      heroUi.style.setProperty("--ui-shift-y", `${heroMotion.uiShiftY.toFixed(2)}px`);
    }
  }

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
}

function handlePointerTilt(scene) {
  const phone = scene.querySelector("[data-phone]");
  if (!phone) return;

  scene.addEventListener("mousemove", (event) => {
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
  });

  scene.addEventListener("mouseleave", () => {
    if (phone.classList.contains("hero-phone")) {
      heroMotion.targetUiShiftX = 0;
      heroMotion.targetUiShiftY = 0;
    }
    updateHeroPhone();
    updateStoryProgress();
  });
}

phoneScenes.forEach(handlePointerTilt);

function updateClock() {
  const now = new Date();
  deviceClock.textContent = now.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function handleScroll() {
  motionState.targetScroll = window.scrollY;
  if (!motionState.ticking) {
    motionState.ticking = true;
    requestAnimationFrame(animateScroll);
  }
}

function animateScroll() {
  const distance = motionState.targetScroll - motionState.currentScroll;
  motionState.currentScroll += distance * 0.12;

  updateHeroPhone();
  updateStoryProgress();
  applyScrollDirectionTilt();
  renderPhoneMotion();

  if (Math.abs(distance) > 0.2) {
    requestAnimationFrame(animateScroll);
  } else {
    motionState.currentScroll = motionState.targetScroll;
    updateHeroPhone();
    updateStoryProgress();
    renderPhoneMotion();
    motionState.ticking = false;
  }
}

window.addEventListener("scroll", handleScroll, { passive: true });
window.addEventListener("resize", () => {
  motionState.targetScroll = window.scrollY;
  motionState.currentScroll = window.scrollY;
  handleScroll();
});

ctaForm.addEventListener("submit", (event) => {
  event.preventDefault();

  const email = ctaForm.querySelector("input").value.trim();
  formStatus.textContent = email
    ? `You're in, ${email}. We'll share NeuroSync as soon as beta opens.`
    : "Enter an email if you'd like to join the NeuroSync beta.";
});

// Mobile menu toggle functionality
const mobileMenuToggle = document.getElementById("mobileMenuToggle");
const mobileNav = document.getElementById("mobileNav");
const mobileNavLinks = mobileNav.querySelectorAll("a");

function closeMobileMenu() {
  mobileMenuToggle.classList.remove("active");
  mobileNav.classList.remove("active");
  mobileMenuToggle.setAttribute("aria-expanded", "false");
}

mobileMenuToggle.addEventListener("click", () => {
  mobileMenuToggle.classList.toggle("active");
  mobileNav.classList.toggle("active");
  mobileMenuToggle.setAttribute(
    "aria-expanded",
    mobileMenuToggle.classList.contains("active")
  );
});

// Close mobile menu when a link is clicked
mobileNavLinks.forEach((link) => {
  link.addEventListener("click", closeMobileMenu);
});

// Close mobile menu when clicking outside
document.addEventListener("click", (event) => {
  if (
    !event.target.closest(".site-header") &&
    mobileNav.classList.contains("active")
  ) {
    closeMobileMenu();
  }
});

// Close mobile menu on window resize
window.addEventListener("resize", () => {
  if (window.innerWidth > 768) {
    closeMobileMenu();
  }
});

updateClock();
setInterval(updateClock, 30000);
setStoryState(0);
window.scrollTo(0, 0);
motionState.currentScroll = 0;
motionState.targetScroll = 0;
motionState.lastScroll = 0;
handleScroll();
