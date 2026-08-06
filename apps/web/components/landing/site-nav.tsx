/*
 * Landing-page navigation.
 *
 * Deliberately not a client component and deliberately without a mobile menu.
 * The page is five sections long, so a hamburger would hide four links behind a
 * tap to save one row of space. Below the breakpoint the section links drop out
 * and the wordmark and the one real call to action stay, which is the whole
 * navigation anyone needs on a phone.
 */

const SECTIONS = [
  { href: "#gap", label: "The gap" },
  { href: "#guardrail", label: "Guardrail" },
  { href: "#benchmark", label: "Benchmark" },
  { href: "#limits", label: "Limits" },
] as const;

export function SiteNav() {
  return (
    <>
      {/* A sticky bar hides whatever an in-page anchor lands on, so keyboard
          users get a way past it before they meet it. */}
      <a className="skip-link" href="#main">
        Skip to content
      </a>

      <header className="site-nav">
        <nav className="site-nav-inner" aria-label="Primary">
          <a className="site-wordmark" href="#top">
            Parley
          </a>

          <ul className="site-nav-links">
            {SECTIONS.map((section) => (
              <li key={section.href}>
                <a href={section.href}>{section.label}</a>
              </li>
            ))}
          </ul>

          <a className="button button-primary site-nav-cta" href="/app">
            Open the dashboard
          </a>
        </nav>
      </header>
    </>
  );
}
