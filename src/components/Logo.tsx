export default function Logo({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <circle cx="50" cy="50" r="50" fill="url(#nexusGrad)" />
      <text x="50" y="52" textAnchor="middle" dominantBaseline="middle" fill="#fff" fontSize="25" fontWeight="800" letterSpacing="-0.5">Nexus</text>
      <defs>
        <linearGradient id="nexusGrad" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
    </svg>
  );
}
