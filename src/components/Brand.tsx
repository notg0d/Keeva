export default function Brand({ href = '#main-content' }: { href?: string }) {
  return <a href={href} className="brand" aria-label="Keeva home">
    <img src="/keeva-logo.webp" alt="" width={48} height={48} />
    <span>keeva</span>
  </a>;
}
