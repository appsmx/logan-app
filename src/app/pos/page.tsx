/**
 * Logan POS Landing Page — /pos
 * 
 * Public marketing page for selling Logan POS to local businesses.
 * Renders the standalone HTML landing (v5) via an iframe to preserve
 * all animations, scripts, and Tailwind CDN styles without conflicting
 * with the Next.js app's own Tailwind setup.
 */
export default function POSLandingPage() {
  return (
    <iframe
      src="/pos-landing.html"
      className="w-full h-screen border-0"
      title="Logan POS"
    />
  );
}
