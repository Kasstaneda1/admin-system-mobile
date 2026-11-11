export const colors = {
  // Tokens of the colour system (COLOR_SYSTEM_2026-11-05.md, frontend tokens.css): new screens
  // use these names; the older names below stay for the screens not redrawn yet
  brand: '#00685F',          // --brand
  brandPressed: '#134E4A',   // --brand-pressed
  brandSoft: '#E0F2F1',      // --brand-soft
  brandSoftFg: '#134E4A',    // --brand-soft-fg: text on brandSoft, 8.18:1
  headerFgMuted: '#D1E4E2',  // --header-fg-muted
  fgOnFill: '#FFFFFF',       // --fg-on-fill
  fgSecondary: '#3D4947',    // --fg-secondary
  fgDefault: '#151C27',      // --fg-default
  fgMutedField: '#525252',   // --fg-muted-field
  borderControl: '#6D7A77',  // --border-control
  bgCard: '#FFFFFF',         // --bg-card
  warningSolid: '#F59E0B',   // --warning-solid (accent)
  warningOnSolid: '#431407', // --warning-on-solid (on-accent), 7.29:1 on warningSolid
  shadow: '#000000',

  // My day (design A3, design-mockups/tech-app/README.md «Итог»)
  accent: '#F59E0B',         // --accent (= --warning-solid): main button, NOW, the current visit
  onAccent: '#431407',       // --on-accent (= --warning-on-solid), 7.3:1 on accent
  bgPage: '#F9F9FF',         // --bg-page
  scrim: 'rgba(21, 28, 39, 0.45)', // --fg-default at 45%: behind a sheet (design src3/add.css .scrim)
  bgSubtle: '#FAFAFA',       // --bg-subtle
  bgSunken: '#F5F5F5',       // --bg-sunken
  focusRing: '#00685F',      // --focus-ring: the field being typed in (design src3/add.css .ta)
  borderSubtle: '#E5E5E5',   // --border-subtle
  borderDefault: '#D4D4D4',  // --border-default
  borderStrong: '#737373',   // --border-strong
  nowLine: '#1E3A8A',        // --now-line
  stateDone: '#E5E5E5',      // --state-done: a closed visit's number
  stateDoneFg: '#404040',    // --state-done-fg
  stateDoneBorder: '#737373', // --state-done-border
  infoFg: '#1E40AF',         // --info-fg = --visit-onway-fg = --pd-recall-fg
  infoBg: '#DBEAFE',         // --info-bg
  infoBorder: '#1D4ED8',     // --info-border
  successFg: '#064E3B',      // --success-fg = --pd-done-fg: free time, Repaired
  successBg: '#D1FAE5',      // --success-bg
  successBorder: '#047857',  // --success-border
  warningFg: '#78350F',      // --warning-fg = --pd-diagnostics-fg: offline, how to get in
  warningBg: '#FEF3C7',      // --warning-bg
  warningBorder: '#B45309',  // --warning-border
  violetFg: '#5B21B6',       // --violet-fg: the helper
  violetBg: '#EDE9FE',       // --violet-bg
  violetBorder: '#7C3AED',   // --violet-border
  indigoFg: '#3730A3',       // --indigo-fg = --pd-deposit-fg
  indigoBg: '#E0E7FF',       // --indigo-bg
  indigoBorder: '#4F46E5',   // --indigo-border
  neutralFg: '#404040',      // --neutral-fg: no access, old task
  neutralBg: '#F5F5F5',      // --neutral-bg
  neutralBorder: '#737373',  // --neutral-border

  // Primary
  primary: '#14B8A6',
  primaryDark: '#0D9488',
  primaryLight: '#f0fdfa',
  primaryBorder: '#99f6e4',

  // Status
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  info: '#3b82f6',

  // Earnings
  earningsDark: '#2E7D32',
  earningsBg: '#E8F5E9',
  earningsBorder: '#81C784',

  // Text
  textDark: '#333',
  textMedium: '#666',
  textLight: '#999',
  textDarkGray: '#374151',

  // Background
  background: '#f5f5f5',
  white: '#fff',
  cardBg: '#f9fafb',
  chipBg: '#f3f4f6',

  // Borders
  border: '#e5e5e5',
  borderMedium: '#e5e7eb',
  borderDark: '#d1d5db',

  // Overlay
  overlay: 'rgba(0, 0, 0, 0.5)',
  overlayLight: 'rgba(255, 255, 255, 0.8)',
  whiteTransparent90: 'rgba(255, 255, 255, 0.9)',
  whiteTransparent80: 'rgba(255, 255, 255, 0.8)',
  whiteTransparent25: 'rgba(255,255,255,0.25)',
};
