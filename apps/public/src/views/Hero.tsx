import type { JSX } from 'react'

// Cards-landing hero strip. Background image is decorative — it sits as a
// CSS background-image, NOT an <img alt> (spec §6.5: an alt-text on a
// purely-visual hero photo announces noise). The path is `/hero.jpg`,
// served from `apps/public/public/hero.jpg` (Vite copies that directory
// to the build output verbatim — same dev/build resolution).
//
// The headline copy gives the page its single <h1>; the rest of the
// landing uses <h2> and below per the heading-order rule.
export default function Hero(): JSX.Element {
  return (
    <section
      className="sta-hero"
      aria-labelledby="sta-hero-heading"
      style={{ backgroundImage: 'url(/hero.jpg)' }}
    >
      <div className="sta-hero__overlay">
        <h1 id="sta-hero-heading" className="sta-hero__heading">
          Compare European ski resorts side-by-side
        </h1>
        <p className="sta-hero__sub">
          Durable resort facts and live market signals — with visible source
          provenance. You rank the shortlist.
        </p>
      </div>
    </section>
  )
}
