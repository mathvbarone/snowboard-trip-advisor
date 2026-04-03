export default function Hero() {
  return (
    <section className="hero" aria-label="Snowboard Trip Advisor introduction">
      <p className="eyebrow">Europe resort research</p>
      <h1>Snowboard Trip Advisor</h1>
      <p className="hero-copy">
        Best ski resorts in Europe, ranked by objective metrics and published
        data.
      </p>
      <ul className="hero-points" aria-label="Key features">
        <li>Compare size, price, and snow reliability.</li>
        <li>Filter the published dataset without live scraping.</li>
        <li>Keep shortlist state in the URL for sharing.</li>
      </ul>
    </section>
  )
}
