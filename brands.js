/*
 * Brand configuration
 * --------------------------------------------------------------
 * The whole site is driven by this file. To go live under one name,
 * set ACTIVE_BRAND below and SHOW_BRAND_SWITCHER to false.
 *
 * Any brand can also be previewed with a URL parameter:
 *   /?brand=scalora   /?brand=scalence   /?brand=convertive
 */
window.ACTIVE_BRAND = "scalora";
window.SHOW_BRAND_SWITCHER = true;

window.BRANDS = {
  scalora: {
    name: "Scalora",
    tagline: "Ads that scale. Pages that convert.",
    heroLine1: "Ads that scale.",
    heroLine2: "Pages that convert.",
    email: "hello@scalora.co",
    domain: "scalora.co",
    // Logo mark: ascending bars inside an orbit
    mark: `
      <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <defs><linearGradient id="lg-s" x1="0" y1="40" x2="40" y2="0"><stop offset="0" stop-color="#2E6BFF"/><stop offset="1" stop-color="#5FE3FF"/></linearGradient></defs>
        <rect x="1" y="1" width="38" height="38" rx="11" stroke="url(#lg-s)" stroke-width="2"/>
        <rect x="10" y="22" width="4.5" height="9" rx="2.25" fill="url(#lg-s)"/>
        <rect x="17.75" y="16" width="4.5" height="15" rx="2.25" fill="url(#lg-s)"/>
        <rect x="25.5" y="9" width="4.5" height="22" rx="2.25" fill="url(#lg-s)"/>
      </svg>`,
  },
  scalence: {
    name: "Scalence",
    tagline: "Scale is a science.",
    heroLine1: "Scale is a science.",
    heroLine2: "We run the tests.",
    email: "hello@scalence.co",
    domain: "scalence.co",
    // Logo mark: stacked rising chevrons
    mark: `
      <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <defs><linearGradient id="lg-c" x1="0" y1="40" x2="40" y2="0"><stop offset="0" stop-color="#2E6BFF"/><stop offset="1" stop-color="#5FE3FF"/></linearGradient></defs>
        <circle cx="20" cy="20" r="18.5" stroke="url(#lg-c)" stroke-width="2"/>
        <path d="M11 25l9-7 9 7" stroke="url(#lg-c)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M11 17l9-7 9 7" stroke="url(#lg-c)" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round" opacity=".55"/>
      </svg>`,
  },
  convertive: {
    name: "Convertive",
    tagline: "Built to convert.",
    heroLine1: "Every click,",
    heroLine2: "built to convert.",
    email: "hello@convertive.co",
    domain: "convertive.co",
    // Logo mark: funnel resolving into an arrow
    mark: `
      <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
        <defs><linearGradient id="lg-v" x1="0" y1="40" x2="40" y2="0"><stop offset="0" stop-color="#2E6BFF"/><stop offset="1" stop-color="#5FE3FF"/></linearGradient></defs>
        <rect x="1" y="1" width="38" height="38" rx="19" stroke="url(#lg-v)" stroke-width="2"/>
        <path d="M10 12h20l-7 9v7l-6 3V21z" fill="url(#lg-v)"/>
      </svg>`,
  },
};
