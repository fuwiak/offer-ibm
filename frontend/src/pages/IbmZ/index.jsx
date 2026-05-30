import { useState } from "react";
import { Link } from "react-router-dom";
import "./ibm-z.css";

const NAV_ITEMS = [
  "Products",
  "Solutions",
  "Industries",
  "Resources",
  "Support",
];

const FEATURES = [
  {
    title: "AI on IBM Z",
    body: "Run foundation models and inferencing close to mission-critical data with built-in governance and isolation.",
    link: "Explore AI on Z",
  },
  {
    title: "Hybrid cloud ready",
    body: "Extend z/OS workloads to public and private cloud with consistent security policies and operational models.",
    link: "Hybrid cloud",
  },
  {
    title: "Quantum-safe security",
    body: "Protect transactions and data with pervasive encryption and post-quantum cryptography roadmaps.",
    link: "Security",
  },
  {
    title: "Five-nines availability",
    body: "Deliver continuous operations with hardware redundancy, dynamic capacity, and proven resiliency.",
    link: "Resiliency",
  },
];

const CUSTOMERS = [
  "Finance",
  "Insurance",
  "Retail",
  "Government",
  "Healthcare",
  "Telecom",
];

const TABS = ["Overview", "AI & analytics", "DevOps", "Security"];

const ENTERPRISE = {
  title: "Enterprise-grade by design",
  body: "IBM Z integrates compute, storage, and networking for predictable performance at scale. Modernize in place or connect to cloud-native services without compromising SLAs.",
  bullets: [
    "Linux and z/OS workloads on one platform",
    "OpenShift and Kubernetes integration",
    "Centralized policy and compliance controls",
  ],
};

const TRAINING = [
  { meta: "Course · 4 hrs", title: "Introduction to IBM Z fundamentals" },
  { meta: "Lab · Self-paced", title: "Deploy a Linux on Z development environment" },
  { meta: "Webinar · On demand", title: "Mainframe modernization patterns" },
  { meta: "Certification", title: "IBM Z System Administrator" },
];

const FOOTER_COLUMNS = [
  {
    title: "Products",
    links: ["IBM z16", "Linux on Z", "z/OS", "IBM Z Hardware"],
  },
  {
    title: "Solutions",
    links: ["AI inference", "Payments", "Core banking", "Insurance"],
  },
  {
    title: "Resources",
    links: ["Documentation", "Redbooks", "Community", "Support"],
  },
  {
    title: "Company",
    links: ["About IBM", "Careers", "Investor relations", "Contact"],
  },
  {
    title: "Legal",
    links: ["Privacy", "Terms of use", "Accessibility", "Cookie preferences"],
  },
];

function IbmLogo() {
  return (
    <Link to="/ibm-z" className="ibm-z-logo">
      <span className="ibm-z-logo__mark" aria-hidden="true" />
      <span>
        IBM <span className="ibm-z-logo__product">Z</span>
      </span>
    </Link>
  );
}

export default function IbmZPage() {
  const [activeTab, setActiveTab] = useState(0);
  const [email, setEmail] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <div className="ibm-z-page">
      <header>
        <div className="ibm-z-utility-bar">
          <div className="ibm-z-container ibm-z-utility-bar__inner">
            <a href="#location">United States</a>
            <a href="#contact">Contact IBM</a>
            <a href="#search">Search</a>
          </div>
        </div>

        <nav className="ibm-z-top-nav" aria-label="Main">
          <div className="ibm-z-container ibm-z-top-nav__inner">
            <IbmLogo />
            <ul className="ibm-z-nav-links">
              {NAV_ITEMS.map((item) => (
                <li key={item}>
                  <a href={`#${item.toLowerCase()}`}>{item}</a>
                </li>
              ))}
            </ul>
            <div className="ibm-z-nav-actions">
              <button type="button" aria-label="Search" onClick={() => setSearchOpen((o) => !o)}>
                Search
              </button>
              <Link to="/login" className="ibm-z-btn ibm-z-btn--ghost">
                Sign in
              </Link>
              <button
                type="button"
                className="ibm-z-hamburger"
                aria-label={menuOpen ? "Close menu" : "Open menu"}
                onClick={() => setMenuOpen((o) => !o)}
              >
                {menuOpen ? "✕" : "☰"}
              </button>
            </div>
          </div>
        </nav>

        {searchOpen && (
          <div className="ibm-z-container" style={{ padding: "0.75rem var(--ibm-spacing-lg)", borderTop: "1px solid var(--ibm-border-subtle)" }}>
            <input
              autoFocus
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && setSearchOpen(false)}
              placeholder="Search IBM Z…"
              className="ibm-z-text-input"
              style={{ width: "100%", maxWidth: 480 }}
            />
          </div>
        )}

        {menuOpen && (
          <nav className="ibm-z-mobile-menu" aria-label="Mobile">
            <div className="ibm-z-container">
              <ul style={{ listStyle: "none", padding: "1rem 0", margin: 0 }}>
                {NAV_ITEMS.map((item) => (
                  <li key={item} style={{ borderBottom: "1px solid var(--ibm-border-subtle)" }}>
                    <a
                      href={`#${item.toLowerCase()}`}
                      style={{ display: "block", padding: "0.75rem 0", color: "var(--ibm-text-primary)", textDecoration: "none" }}
                      onClick={() => setMenuOpen(false)}
                    >
                      {item}
                    </a>
                  </li>
                ))}
                <li style={{ paddingTop: "1rem" }}>
                  <Link to="/login" className="ibm-z-btn ibm-z-btn--ghost" onClick={() => setMenuOpen(false)}>
                    Sign in
                  </Link>
                </li>
              </ul>
            </div>
          </nav>
        )}
      </header>

      <main>
        <section className="ibm-z-hero" aria-labelledby="hero-heading">
          <div className="ibm-z-container ibm-z-hero__grid">
            <div>
              <p className="ibm-z-eyebrow">IBM Z · Enterprise computing</p>
              <h1 id="hero-heading" className="ibm-z-display-xl">
                The platform for mission-critical AI
              </h1>
              <p className="ibm-z-body-lg">
                Run trusted workloads at scale with the reliability, security,
                and performance that only IBM Z delivers—now with AI where your
                data lives.
              </p>
              <div className="ibm-z-hero__actions">
                <a href="#contact" className="ibm-z-btn ibm-z-btn--primary">
                  Request a briefing
                </a>
                <a
                  href="#features"
                  className="ibm-z-btn ibm-z-btn--tertiary ibm-z-btn__chevron"
                >
                  View capabilities
                </a>
              </div>
            </div>
            <article className="ibm-z-hero-card">
              <div className="ibm-z-hero-card__pattern" aria-hidden="true" />
              <h2 className="ibm-z-display-md">IBM z16</h2>
              <p className="ibm-z-card-body">
                Next-generation processors with on-chip AI acceleration for
                real-time fraud detection, personalization, and operational
                intelligence.
              </p>
              <a href="#z16" className="ibm-z-link ibm-z-btn__chevron">
                Discover z16
              </a>
            </article>
          </div>
        </section>

        <section
          id="features"
          className="ibm-z-section ibm-z-section--surface"
          aria-labelledby="features-heading"
        >
          <div className="ibm-z-container">
            <h2 id="features-heading" className="ibm-z-display-lg">
              Built for what matters most
            </h2>
            <div className="ibm-z-card-grid ibm-z-card-grid--4">
              {FEATURES.map((card) => (
                <article key={card.title} className="ibm-z-feature-card">
                  <h3 className="ibm-z-card-title">{card.title}</h3>
                  <p className="ibm-z-card-body">{card.body}</p>
                  <a href="#learn" className="ibm-z-link ibm-z-btn__chevron">
                    {card.link}
                  </a>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="ibm-z-section" aria-labelledby="customers-heading">
          <div className="ibm-z-container">
            <h2 id="customers-heading" className="ibm-z-headline">
              Trusted by industries that cannot fail
            </h2>
            <div className="ibm-z-marquee" role="list">
              {CUSTOMERS.map((name) => (
                <div key={name} className="ibm-z-logo-tile" role="listitem">
                  {name}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="ibm-z-section ibm-z-section--surface">
          <div className="ibm-z-container">
            <div className="ibm-z-tabs" role="tablist">
              {TABS.map((tab, i) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  aria-selected={activeTab === i}
                  className={`ibm-z-tab${activeTab === i ? " ibm-z-tab--selected" : ""}`}
                  onClick={() => setActiveTab(i)}
                >
                  {tab}
                </button>
              ))}
            </div>
            <div className="ibm-z-product-row">
              <div>
                <h2 className="ibm-z-display-lg">{ENTERPRISE.title}</h2>
                <p className="ibm-z-body-lg">{ENTERPRISE.body}</p>
                <ul className="ibm-z-card-body" style={{ paddingLeft: "1.25rem" }}>
                  {ENTERPRISE.bullets.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
                <p style={{ marginTop: "var(--ibm-spacing-lg)" }}>
                  <a href="#demo" className="ibm-z-btn ibm-z-btn--primary">
                    Schedule a demo
                  </a>
                </p>
              </div>
              <article className="ibm-z-product-card">
                <p className="ibm-z-eyebrow">Recommended</p>
                <h3 className="ibm-z-subhead">{TABS[activeTab]} for IBM Z</h3>
                <p className="ibm-z-card-body">
                  Explore curated guides, reference architectures, and product
                  updates tailored to your modernization goals on IBM Z.
                </p>
                <a href="#resources" className="ibm-z-link ibm-z-btn__chevron">
                  Read the guide
                </a>
              </article>
            </div>
          </div>
        </section>

        <section
          id="training"
          className="ibm-z-section"
          aria-labelledby="training-heading"
        >
          <div className="ibm-z-container">
            <h2 id="training-heading" className="ibm-z-headline">
              Learn and get certified
            </h2>
            <p
              className="ibm-z-card-body"
              style={{ marginBottom: "var(--ibm-spacing-xl)" }}
            >
              Build skills with hands-on labs, courses, and credentials designed
              for systems programmers, architects, and operators.
            </p>
            <div className="ibm-z-resource-list">
              {TRAINING.map((item) => (
                <a
                  key={item.title}
                  href="#training"
                  className="ibm-z-resource-tile"
                >
                  <p className="ibm-z-resource-tile__meta">{item.meta}</p>
                  <h3 className="ibm-z-resource-tile__title">{item.title}</h3>
                </a>
              ))}
            </div>
          </div>
        </section>

        <div className="ibm-z-container">
          <section className="ibm-z-cta-banner" aria-labelledby="cta-heading">
            <h2 id="cta-heading" className="ibm-z-headline">
              Start your IBM Z modernization journey
            </h2>
            <p>
              Connect with specialists who understand regulated workloads,
              capacity planning, and hybrid architectures.
            </p>
            <a href="#contact" className="ibm-z-btn ibm-z-btn--secondary">
              Talk to an expert
            </a>
          </section>
        </div>

        <section className="ibm-z-section ibm-z-section--surface" id="newsletter">
          <div className="ibm-z-container ibm-z-newsletter">
            <div>
              <h2 className="ibm-z-headline">Stay connected</h2>
              <p className="ibm-z-card-body">
                Get IBM Z product news, event invitations, and technical content
                delivered to your inbox.
              </p>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
              }}
            >
              <div className="ibm-z-input-group">
                <label htmlFor="ibm-z-email" className="sr-only">
                  Email address
                </label>
                <input
                  id="ibm-z-email"
                  type="email"
                  className="ibm-z-text-input"
                  placeholder="Business email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
                <button type="submit" className="ibm-z-btn ibm-z-btn--primary">
                  Subscribe
                </button>
              </div>
            </form>
          </div>
        </section>
      </main>

      <footer className="ibm-z-footer">
        <div className="ibm-z-container">
          <div className="ibm-z-footer__grid">
            <div className="ibm-z-footer__brand">
              <IbmLogo />
              <p style={{ marginTop: "var(--ibm-spacing-lg)" }}>
                Enterprise computing for the AI era.
              </p>
            </div>
            {FOOTER_COLUMNS.map((col) => (
              <div key={col.title}>
                <h4>{col.title}</h4>
                <ul>
                  {col.links.map((link) => (
                    <li key={link}>
                      <a href="#footer">{link}</a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <p className="ibm-z-footer__legal">
            © {new Date().getFullYear()} IBM Corporation. This page implements
            the Carbon marketing design spec for demonstration.{" "}
            <Link to="/" style={{ color: "var(--ibm-inverse-ink-muted)" }}>
              Return to app
            </Link>
          </p>
        </div>
      </footer>
    </div>
  );
}
