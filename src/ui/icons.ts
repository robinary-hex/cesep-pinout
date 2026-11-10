/**
 * Pictogrammes SVG inline : boîte 24 × 24, trait de la couleur courante, sans remplissage.
 * Un tableau de tracés (`d`) par nom ; Icon.vue les dessine.
 */
export const ICONS = {
  'file-plus': [
    'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z',
    'M14 3v6h6',
    'M12 12v6',
    'M9 15h6'
  ],
  'folder-open': ['M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'],
  clock: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z', 'M12 7v5l3 2'],
  save: [
    'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z',
    'M17 21v-8H7v8',
    'M7 3v5h8'
  ],
  'save-as': [
    'M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z',
    'M7 3v5h8',
    'M12 11v7',
    'M8.5 14.5h7'
  ],
  export: ['M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4', 'M7 10l5 5 5-5', 'M12 15V3'],
  settings: [
    'M4 21v-7',
    'M4 10V3',
    'M12 21v-9',
    'M12 8V3',
    'M20 21v-5',
    'M20 12V3',
    'M1 14h6',
    'M9 8h6',
    'M17 16h6'
  ],
  power: ['M18.36 6.64a9 9 0 1 1-12.73 0', 'M12 2v10'],
  help: [
    'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z',
    'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3',
    'M12 17h.01'
  ],
  undo: ['M9 14 4 9l5-5', 'M4 9h10.5a5.5 5.5 0 0 1 0 11H11'],
  redo: ['m15 14 5-5-5-5', 'M20 9H9.5a5.5 5.5 0 0 0 0 11H13'],
  'rotate-cw': ['M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8', 'M21 3v5h-5'],
  'rotate-ccw': ['M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8', 'M3 3v5h5'],
  'flip-h': ['M12 3v18', 'M8 6H4v12h4', 'M16 6h4v12h-4'],
  'flip-v': ['M3 12h18', 'M6 8V4h12v4', 'M6 16v4h12v-4'],
  copy: ['M8 8h12v12H8z', 'M16 8V4H4v12h4'],
  clipboard: [
    'M9 3h6v3H9z',
    'M15 4h3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h3'
  ],
  trash: ['M3 6h18', 'M8 6V4h8v2', 'M19 6l-1 14H6L5 6', 'M10 11v6', 'M14 11v6'],
  cursor: ['M4 4l7 17 2-7 7-2z'],
  wire: ['M3 18h8V6h8', 'M1 18a2 2 0 1 0 4 0a2 2 0 1 0-4 0', 'M17 6a2 2 0 1 0 4 0a2 2 0 1 0-4 0'],
  type: ['M4 7V4h16v3', 'M9 20h6', 'M12 4v16'],
  'zoom-in': ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.3-4.3', 'M11 8v6', 'M8 11h6'],
  'zoom-out': ['M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16z', 'M21 21l-4.3-4.3', 'M8 11h6'],
  fit: [
    'M8 3H5a2 2 0 0 0-2 2v3',
    'M21 8V5a2 2 0 0 0-2-2h-3',
    'M3 16v3a2 2 0 0 0 2 2h3',
    'M16 21h3a2 2 0 0 0 2-2v-3'
  ],
  'arrow-up': ['M12 19V5', 'M5 12l7-7 7 7'],
  'arrow-down': ['M12 5v14', 'M19 12l-7 7-7-7'],
  'arrow-up-line': ['M5 3h14', 'M12 21V7', 'M6 13l6-6 6 6'],
  'arrow-down-line': ['M5 21h14', 'M12 3v14', 'M6 11l6 6 6-6'],
  panel: ['M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z', 'M15 3v18'],
  square: ['M4 4h16v16H4z'],
  circle: ['M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z'],
  line: ['M4 20L20 4'],
  polyline: ['M3 17l6-10 4 8 8-12'],
  pin: ['M3 12h6', 'M9 12a3 3 0 1 0 6 0a3 3 0 1 0-6 0', 'M15 12h6'],
  plus: ['M12 5v14', 'M5 12h14'],
  check: ['M20 6 9 17l-5-5'],
  'chevron-down': ['M6 9l6 6 6-6'],
  image: [
    'M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    'M8 9a1 1 0 1 0 2 0a1 1 0 1 0-2 0',
    'M21 16l-5-5-9 9'
  ],
  duplicate: ['M8 8h12v12H8z', 'M16 8V4H4v12h4', 'M14 11v6', 'M11 14h6'],
  tag: [
    'M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z',
    'M7 7h.01'
  ],
  edit: ['M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5z'],
  refresh: ['M21 12a9 9 0 1 1-2.64-6.36', 'M21 3v6h-6'],
  'arrow-right': ['M5 12h14', 'M12 5l7 7-7 7'],
  'select-all': ['M4 4h16v16H4z', 'M9 9h6v6H9z'],
  sun: [
    'M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8z',
    'M12 2v2',
    'M12 20v2',
    'M4.93 4.93l1.41 1.41',
    'M17.66 17.66l1.41 1.41',
    'M2 12h2',
    'M20 12h2',
    'M6.34 17.66l-1.41 1.41',
    'M19.07 4.93l-1.41 1.41'
  ],
  moon: ['M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z'],
  dots: ['M5 12h.01', 'M12 12h.01', 'M19 12h.01'],
  bold: ['M6 4h8a4 4 0 0 1 0 8H6z', 'M6 12h9a4 4 0 0 1 0 8H6z'],
  // Palette de peintre : le profil de style.
  palette: [
    'M12 3a9 9 0 1 0 0 18c1 0 1.7-.8 1.7-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.4-.7-.4-1.1 0-.9.7-1.6 1.6-1.6H16.5a4.5 4.5 0 0 0 4.5-4.5C21 6.6 16.97 3 12 3z',
    'M13.5 7h.01',
    'M17 10.5h.01',
    'M8.5 8h.01',
    'M7 12.5h.01'
  ],
  // Disque plein : deux cercles concentriques dont les traits se touchent.
  dot: ['M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z', 'M12 11a1 1 0 1 0 0 2a1 1 0 1 0 0-2z'],
  italic: ['M19 4h-9', 'M14 20H5', 'M15 4L9 20'],
  underline: ['M6 4v6a6 6 0 0 0 12 0V4', 'M4 20h16'],
  strikethrough: ['M16 4H9a3 3 0 0 0-2.83 4', 'M14 12a4 4 0 0 1 1.17 7.83H8', 'M4 12h16']
} as const satisfies Record<string, readonly string[]>

export type IconName = keyof typeof ICONS
