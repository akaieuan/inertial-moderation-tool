interface LogoProps {
  className?: string;
  size?: number;
}

export function Logo({ className, size = 24 }: LogoProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
      shapeRendering="crispEdges"
    >
      <defs>
        <linearGradient
          id="inertial-logo-bg"
          x1="0"
          y1="0"
          x2="24"
          y2="24"
          gradientUnits="userSpaceOnUse"
        >
          <stop offset="0" stopColor="#3a3a3a" />
          <stop offset="0.55" stopColor="#161616" />
          <stop offset="1" stopColor="#000000" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="5" fill="url(#inertial-logo-bg)" />
      {/* left bracket */}
      <rect x="2" y="3" width="1" height="18" fill="#fafafa" />
      <rect x="2" y="3" width="4" height="1" fill="#fafafa" />
      <rect x="2" y="20" width="4" height="1" fill="#fafafa" />
      {/* right bracket */}
      <rect x="21" y="3" width="1" height="18" fill="#fafafa" />
      <rect x="18" y="3" width="4" height="1" fill="#fafafa" />
      <rect x="18" y="20" width="4" height="1" fill="#fafafa" />
      {/* contained mark */}
      <rect x="11" y="11" width="2" height="2" fill="#fafafa" />
    </svg>
  );
}
