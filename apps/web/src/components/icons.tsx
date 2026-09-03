import type { SVGProps } from 'react';

const base = {
  width: 22,
  height: 22,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

export function IconeInicio(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M3 10.5 12 3l9 7.5" />
      <path d="M5 9.5V21h14V9.5" />
      <path d="M9.5 21v-6h5v6" />
    </svg>
  );
}

export function IconeBola(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <circle cx="12" cy="12" r="9" />
      <path d="m12 7 3 2.2-1.1 3.5h-3.8L9 9.2 12 7Z" />
      <path d="m12 7 .5-4M15 9.2l3.6-1.1M13.9 12.7l2.3 3M10.1 12.7l-2.3 3M9 9.2 5.4 8.1" />
    </svg>
  );
}

export function IconeTrofeu(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M7 4h10v4a5 5 0 0 1-10 0V4Z" />
      <path d="M17 5h3v2a3 3 0 0 1-3 3M7 5H4v2a3 3 0 0 0 3 3" />
      <path d="M12 13v4M9 21h6M10 17h4v4h-4z" />
    </svg>
  );
}

export function IconePerfil(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M5 20c1-3.6 3.8-5.5 7-5.5S18 16.4 19 20" />
    </svg>
  );
}

export function IconeApito(p: SVGProps<SVGSVGElement>) {
  return (
    <svg {...base} {...p}>
      <path d="M3 11a4 4 0 0 1 4-4h9l4-2v10l-4-2H7a4 4 0 0 1-4-4Z" />
      <circle cx="8.5" cy="11" r="1.4" />
    </svg>
  );
}
