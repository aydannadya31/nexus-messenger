export default function Logo({ className = 'w-8 h-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <rect width="100" height="100" rx="26" fill="url(#nexusGrad)" />
      <path d="M32 70V30l36 40V30" stroke="#fff" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" />
      <defs>
        <linearGradient id="nexusGrad" x1="0" y1="0" x2="100" y2="100" gradientUnits="userSpaceOnUse">
          <stop stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
    </svg>
  );
}
