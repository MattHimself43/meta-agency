(() => {
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  /* ---------------- Brand ---------------- */
  const params = new URLSearchParams(location.search);
  const brands = window.BRANDS || {};
  let brandKey = (params.get("brand") || "").toLowerCase();
  if (!brands[brandKey]) brandKey = window.ACTIVE_BRAND in brands ? window.ACTIVE_BRAND : Object.keys(brands)[0];

  function applyBrand(key) {
    const b = brands[key];
    if (!b) return;
    document.querySelectorAll("[data-brand]").forEach((el) => {
      const v = b[el.dataset.brand];
      if (v) el.textContent = v;
    });
    document.querySelectorAll("[data-brand-mark]").forEach((el) => (el.innerHTML = b.mark));
    document.querySelectorAll("[data-brand-email]").forEach((el) => {
      el.textContent = b.email;
      el.href = `mailto:${b.email}`;
    });
    document.title = `${b.name} | Meta Ads, Creative & Landing Pages`;
    const fav = document.querySelector('link[rel="icon"]');
    if (fav) fav.href = "data:image/svg+xml," + encodeURIComponent(b.mark.trim().replace("<svg ", '<svg xmlns="http://www.w3.org/2000/svg" ')) ;
    document.querySelectorAll(".brand-options button").forEach((btn) => btn.classList.toggle("active", btn.dataset.key === key));
  }

  const switcher = document.querySelector(".brand-switcher");
  if (switcher && window.SHOW_BRAND_SWITCHER) {
    const opts = switcher.querySelector(".brand-options");
    Object.entries(brands).forEach(([key, b]) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.key = key;
      btn.textContent = b.name;
      btn.addEventListener("click", () => {
        brandKey = key;
        applyBrand(key);
        const url = new URL(location.href);
        url.searchParams.set("brand", key);
        history.replaceState(null, "", url);
      });
      opts.appendChild(btn);
    });
    switcher.hidden = false;
  }
  applyBrand(brandKey);

  document.querySelectorAll("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));

  /* ---------------- Nav ---------------- */
  const nav = document.getElementById("nav");
  const toggle = nav.querySelector(".nav-toggle");
  toggle.addEventListener("click", () => {
    const open = nav.classList.toggle("open");
    toggle.setAttribute("aria-expanded", open);
  });
  nav.querySelectorAll(".mobile-menu a").forEach((a) =>
    a.addEventListener("click", () => {
      nav.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
    })
  );

  /* ---------------- Reveal + counters ---------------- */
  // Stagger siblings that reveal together
  document.querySelectorAll(".services, .why-cards, .faq, .hero-copy, .section-head, .process-sticky, .why-copy").forEach((group) => {
    group.querySelectorAll(":scope > .reveal, :scope > * > .reveal").forEach((el, i) => el.style.setProperty("--d", `${i * 0.08}s`));
  });

  function countUp(el) {
    const target = parseFloat(el.dataset.count);
    const decimals = parseInt(el.dataset.decimals || "0", 10);
    if (reduceMotion) { el.textContent = target.toFixed(decimals); return; }
    const dur = 1800;
    const start = performance.now();
    const tick = (now) => {
      const t = Math.min((now - start) / dur, 1);
      const eased = 1 - Math.pow(1 - t, 4);
      el.textContent = (target * eased).toFixed(decimals);
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  const io = new IntersectionObserver(
    (entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("in-view");
        e.target.querySelectorAll("[data-count]").forEach(countUp);
        io.unobserve(e.target);
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
  );
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));

  /* ---------------- Cursor glow on service cards ---------------- */
  document.querySelectorAll("[data-glow]").forEach((card) => {
    card.addEventListener("pointermove", (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty("--mx", `${e.clientX - r.left}px`);
      card.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
  });

  /* ---------------- Hero tilt ---------------- */
  const tilt = document.querySelector("[data-tilt]");
  if (tilt && !reduceMotion && matchMedia("(pointer: fine)").matches) {
    const dash = tilt.querySelector(".dash");
    const phone = tilt.querySelector(".phone");
    tilt.addEventListener("pointermove", (e) => {
      const r = tilt.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      dash.style.transform = `rotateY(${x * 8}deg) rotateX(${-y * 8}deg)`;
      phone.style.transform = `translate3d(${x * 18}px, ${y * 18}px, 0)`;
    });
    tilt.addEventListener("pointerleave", () => {
      dash.style.transform = "";
      phone.style.transform = "";
    });
  }

  /* ---------------- Scroll-driven effects ---------------- */
  const orbs = [...document.querySelectorAll("[data-parallax]")];
  const steps = [...document.querySelectorAll(".step")];
  const stepsList = document.querySelector(".steps");
  const stepsLine = document.querySelector(".steps-line span");
  const meterFill = document.querySelector(".process-meter-fill");
  const meterLabel = document.querySelector(".process-meter-label");
  const work = document.querySelector(".work");
  const track = document.querySelector(".work-track");
  const pinMQ = matchMedia("(min-width: 861px)");

  function onScroll() {
    const y = window.scrollY;
    const vh = window.innerHeight;

    nav.classList.toggle("scrolled", y > 20);

    if (!reduceMotion) orbs.forEach((o) => (o.style.transform = `translate3d(0, ${y * parseFloat(o.dataset.parallax)}px, 0)`));

    // Process: fill line + activate the step nearest the viewport centre
    if (stepsList) {
      const r = stepsList.getBoundingClientRect();
      const p = Math.min(Math.max((vh * 0.55 - r.top) / r.height, 0), 1);
      stepsLine.style.transform = `scaleY(${p})`;
      let active = 0;
      steps.forEach((s, i) => {
        const sr = s.getBoundingClientRect();
        if (sr.top < vh * 0.6) active = i;
      });
      steps.forEach((s, i) => s.classList.toggle("active", i <= active && r.top < vh * 0.6));
      meterFill.style.transform = `scaleX(${(active + 1) / steps.length})`;
      meterLabel.textContent = `0${active + 1} / 0${steps.length}`;
    }

    // Work: pinned horizontal scroll
    if (work && track) {
      if (pinMQ.matches) {
        const r = work.getBoundingClientRect();
        const total = work.offsetHeight - vh;
        const p = Math.min(Math.max(-r.top / total, 0), 1);
        const maxX = track.scrollWidth - window.innerWidth;
        track.style.transform = `translate3d(${-p * Math.max(maxX, 0)}px, 0, 0)`;
      } else {
        track.style.transform = "";
      }
    }
  }

  let ticking = false;
  const requestTick = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      onScroll();
      ticking = false;
    });
  };
  window.addEventListener("scroll", requestTick, { passive: true });
  window.addEventListener("resize", requestTick);
  onScroll();

  /* ---------------- Contact form ---------------- */
  // Front-end only for now. Connect to Formspree, a CRM or an API route before launch.
  const form = document.querySelector(".contact-form");
  const note = form.querySelector(".form-note");
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    let ok = true;
    form.querySelectorAll("[required]").forEach((input) => {
      const valid = input.value.trim() && (input.type !== "email" || /\S+@\S+\.\S+/.test(input.value));
      input.closest(".field").classList.toggle("invalid", !valid);
      if (!valid) ok = false;
    });
    if (!ok) {
      note.className = "form-note";
      note.textContent = "Please fill in the highlighted fields.";
      return;
    }
    note.className = "form-note ok";
    note.textContent = "Thanks! We'll be in touch within one working day.";
    form.reset();
  });
})();
