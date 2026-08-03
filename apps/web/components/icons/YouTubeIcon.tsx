/**
 * The official YouTube icon mark (red rounded badge, white play triangle),
 * per https://developers.google.com/youtube/terms/branding-guidelines —
 * always rendered in YouTube's own fixed colors (never `currentColor`).
 *
 * The previous version used a path lifted from an icon set that normalizes
 * every brand's mark into a square 24x24 grid — YouTube's actual icon is
 * wider than tall, so that path only filled about 70% of its box
 * vertically. A 20px-tall box rendered a ~14px-tall mark, silently failing
 * the "never smaller than 20dp" rule even though the box itself measured
 * 20px. This viewBox is cropped tightly to the badge's own true bounds (no
 * padding), so the mark always fills exactly the height it's given —
 * callers should size by height (e.g. `h-5`) and let width scale with it,
 * not force a square box.
 */
export function YouTubeIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 28 20"
      className={className}
      aria-hidden="true"
    >
      <rect width="28" height="20" rx="4" fill="#FF0000" />
      <polygon points="11,6 11,14 19,10" fill="#fff" />
    </svg>
  )
}
