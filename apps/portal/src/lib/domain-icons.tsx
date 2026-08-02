import type { ReactNode } from 'react';

/** Inner SVG geometry (traço) per território key — domains (Taxonomia §5) and verticais (§6).
 *  Rendered inside <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" ...>. */
export const TERRITORY_ICON: Record<string, ReactNode> = {
  // domains
  'finance': (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 7v10" />
      <path d="M14.5 9.3a2.5 2 0 0 0-2.5-1.3c-1.5 0-2.6.8-2.6 2s1.1 1.7 2.6 1.7 2.6.6 2.6 1.8-1.1 2-2.6 2a2.5 2 0 0 1-2.5-1.3" />
    </>
  ),
  'crm': (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M4 20v-1a5 5 0 0 1 10 0v1" />
      <path d="M16 9l2 2 3-3" />
    </>
  ),
  'hr': (
    <>
      <circle cx="8" cy="8" r="3" />
      <circle cx="16" cy="9" r="2.5" />
      <path d="M3 20v-1a5 5 0 0 1 9-3" />
      <path d="M13 20v-1a4 4 0 0 1 8 0v1" />
    </>
  ),
  'legal': (
    <>
      <path d="M12 4v15" />
      <path d="M8 20h8" />
      <path d="M4 7h16" />
      <path d="M2 12a3 3 0 0 0 6 0zm14 0a3 3 0 0 0 6 0z" />
    </>
  ),
  'marketing': (
    <>
      <path d="M4 10v4h3l7 4V6l-7 4H4z" />
      <path d="M17 9a4 4 0 0 1 0 6" />
    </>
  ),
  'procurement': (
    <>
      <circle cx="9" cy="20" r="1.5" />
      <circle cx="17" cy="20" r="1.5" />
      <path d="M3 4h2l2.5 12h10l2-8H6" />
    </>
  ),
  'operations': (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.5 5.5l2 2M16.5 16.5l2 2M18.5 5.5l-2 2M7.5 16.5l-2 2" />
    </>
  ),
  'supply-chain': (
    <>
      <rect x="3" y="9" width="6" height="6" rx="1" />
      <rect x="15" y="9" width="6" height="6" rx="1" />
      <path d="M9 12h6" />
    </>
  ),
  'pmo': (
    <>
      <rect x="4" y="4" width="16" height="16" rx="2" />
      <path d="M8 9h6M8 13h4M8 17h8" />
    </>
  ),
  'quality': (
    <>
      <circle cx="12" cy="10" r="6" />
      <path d="M9 10l2 2 4-4" />
      <path d="M8 15l-1 5 5-2 5 2-1-5" />
    </>
  ),
  'cx': (
    <>
      <path d="M4 5h16v11H9l-4 4v-4H4z" />
      <path d="M8 10h8M8 13h5" />
    </>
  ),
  'bi': (
    <>
      <path d="M4 4v16h16" />
      <path d="M7 17v-4M12 17v-7M17 17v-10" />
    </>
  ),
  'ai-applied': (
    <>
      <rect x="7" y="7" width="10" height="10" rx="1" />
      <circle cx="12" cy="12" r="2" />
      <path d="M10 3v2M14 3v2M10 19v2M14 19v2M3 10h2M3 14h2M19 10h2M19 14h2" />
    </>
  ),
  'grc': (
    <>
      <path d="M12 3l7 3v5c0 4-3 8-7 10-4-2-7-6-7-10V6z" />
      <path d="M9 12l2 2 4-4" />
    </>
  ),
  'infosec': (
    <>
      <rect x="5" y="11" width="14" height="9" rx="2" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
      <circle cx="12" cy="15" r="1.5" />
    </>
  ),
  'esg': (
    <>
      <path d="M5 19c0-8 6-14 14-14 0 8-6 14-14 14z" />
      <path d="M9 15c2-3 5-5 8-6" />
    </>
  ),
  'rnd': (
    <>
      <path d="M8 14a5 5 0 1 1 8 0c-1 1-1.5 2-1.5 3.5h-5C9.5 16 9 15 8 14z" />
      <path d="M9.5 18h5" />
      <path d="M10.5 21h3" />
    </>
  ),
  'accounting': (
    <>
      <path d="M6 3h9l4 4v14l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z" />
      <path d="M9 8h6M9 12h6M9 16h4" />
    </>
  ),
  // verticals
  'shopping-centers': (
    <>
      <path d="M6 8h12l-1 12H7z" />
      <path d="M9 8V6a3 3 0 0 1 6 0v2" />
    </>
  ),
  'retail': (
    <>
      <path d="M3 11l8-8h7v7l-8 8a2 2 0 0 1-2.8 0L3 13.8A2 2 0 0 1 3 11z" />
      <circle cx="15" cy="9" r="1.5" />
    </>
  ),
  'energy': (
    <path d="M13 3L5 13h5l-1 8 8-11h-5z" />
  ),
  'health': (
    <>
      <path d="M12 20s-7-4.5-7-9.5A3.5 3.5 0 0 1 12 8a3.5 3.5 0 0 1 7 2.5c0 5-7 9.5-7 9.5z" />
      <path d="M7 12h2l1.5-2 2 4 1.5-2h2" />
    </>
  ),
  'government': (
    <>
      <path d="M3 9l9-5 9 5" />
      <path d="M4 9v9M9 9v9M15 9v9M20 9v9" />
      <path d="M3 20h18" />
    </>
  ),
  'events': (
    <>
      <path d="M4 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2 2 2 0 0 0 0 8 2 2 0 0 1-2 2H6a2 2 0 0 1-2-2 2 2 0 0 0 0-8z" />
      <path d="M13 6v12" />
    </>
  ),
  'beauty': (
    <>
      <circle cx="6" cy="7" r="2.5" />
      <circle cx="6" cy="17" r="2.5" />
      <path d="M8 8.5L20 17M8 15.5L20 7" />
    </>
  ),
  'agro': (
    <>
      <path d="M12 20v-8" />
      <path d="M12 12C12 8 9 6 5 6c0 4 3 6 7 6z" />
      <path d="M12 14c0-3 2.5-5 6-5 0 3-2.5 5-6 5z" />
    </>
  ),
  'logistics': (
    <>
      <path d="M3 6h11v9H3z" />
      <path d="M14 9h4l3 3v3h-7z" />
      <circle cx="7" cy="18" r="1.5" />
      <circle cx="17" cy="18" r="1.5" />
    </>
  ),
  'heavy-fleet': (
    <>
      <rect x="3" y="13" width="10" height="5" rx="1" />
      <circle cx="6" cy="20" r="1" />
      <circle cx="10" cy="20" r="1" />
      <path d="M8 13l4-6 5 2-1 4" />
    </>
  ),
  'industry': (
    <>
      <path d="M3 20V10l6 4V10l6 4V6l3 2v12z" />
      <path d="M3 20h18" />
    </>
  ),
  'construction': (
    <>
      <path d="M5 15v-1a7 7 0 0 1 14 0v1" />
      <path d="M3 15h18v3H3z" />
      <path d="M12 7V5" />
    </>
  ),
  'real-estate': (
    <>
      <path d="M4 11l8-6 8 6" />
      <path d="M6 10v9h12v-9" />
    </>
  ),
  'condos': (
    <>
      <rect x="6" y="3" width="12" height="18" rx="1" />
      <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2" />
      <path d="M10 21v-3h4v3" />
    </>
  ),
  'education': (
    <>
      <path d="M3 9l9-4 9 4-9 4z" />
      <path d="M7 11v4c0 1 2.5 2 5 2s5-1 5-2v-4" />
      <path d="M21 9v5" />
    </>
  ),
  'hospitality': (
    <>
      <path d="M3 8v10" />
      <path d="M3 12h18v6" />
      <path d="M3 12v-1a2 2 0 0 1 2-2h5a2 2 0 0 1 2 2v1" />
    </>
  ),
  'restaurants': (
    <>
      <path d="M7 3v18M5 3v5a2 2 0 0 0 4 0V3" />
      <path d="M17 3c-2 0-3 2-3 5s1 4 3 4v9" />
    </>
  ),
  'fitness': (
    <>
      <path d="M4 9v6M7 7v10M17 7v10M20 9v6" />
      <path d="M7 12h10" />
    </>
  ),
  'pet': (
    <>
      <circle cx="8" cy="9" r="1.5" />
      <circle cx="16" cy="9" r="1.5" />
      <circle cx="12" cy="7.5" r="1.5" />
      <path d="M12 20c-3 0-5-2-5-4.5S9 11 12 11s5 1.5 5 4.5S15 20 12 20z" />
    </>
  ),
  'churches-ngos': (
    <>
      <path d="M12 9s-3-2.5-5-1c-1.5 1-1 3 0 4l5 4 5-4c1-1 1.5-3 0-4-2-1.5-5 1-5 1z" />
      <path d="M4 18c2 2 5 3 8 3s6-1 8-3" />
    </>
  ),
  'ecommerce': (
    <>
      <rect x="3" y="4" width="18" height="12" rx="1" />
      <path d="M9 20h6M12 16v4" />
      <path d="M10 8h4l-.5 4h-3z" />
    </>
  ),
  'labs': (
    <>
      <path d="M9 3h6" />
      <path d="M10 3v15a2 2 0 0 0 4 0V3" />
      <path d="M10 12h4" />
    </>
  ),
  'insurance': (
    <>
      <path d="M3 11a9 9 0 0 1 18 0z" />
      <path d="M12 11v7a2 2 0 0 1-4 0" />
    </>
  ),
  'cooperatives': (
    <>
      <circle cx="12" cy="6" r="2" />
      <circle cx="6" cy="16" r="2" />
      <circle cx="18" cy="16" r="2" />
      <path d="M10.5 7.5L7.5 14.5M13.5 7.5l3 7M8 16h8" />
    </>
  ),
  'mining': (
    <>
      <path d="M3 9c5-4 13-4 18 0" />
      <path d="M9 8l8 12" />
    </>
  ),
  'ports-airports': (
    <>
      <circle cx="12" cy="5" r="2" />
      <path d="M12 7v13" />
      <path d="M6 12h12" />
      <path d="M4 14a8 8 0 0 0 16 0" />
    </>
  ),
  'telecom': (
    <>
      <circle cx="12" cy="12" r="1.5" />
      <path d="M8 8a5.5 5.5 0 0 0 0 8M16 8a5.5 5.5 0 0 1 0 8" />
      <path d="M5.5 5a9 9 0 0 0 0 14M18.5 5a9 9 0 0 1 0 14" />
    </>
  ),
  'franchises': (
    <>
      <rect x="4" y="4" width="6" height="6" rx="1" />
      <rect x="14" y="4" width="6" height="6" rx="1" />
      <rect x="4" y="14" width="6" height="6" rx="1" />
      <rect x="14" y="14" width="6" height="6" rx="1" />
    </>
  ),
  'metaverse': (
    <>
      <path d="M3 9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-4l-2-2h-2l-2 2H5a2 2 0 0 1-2-2z" />
      <path d="M8 11h.01M16 11h.01" />
    </>
  ),
};

/** Fallback glyph when a key has no icon (a simple neutral mark). */
export const TERRITORY_ICON_FALLBACK: ReactNode = (<circle cx="12" cy="12" r="7" />);
