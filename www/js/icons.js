// Icônes SVG (traits arrondis, couleur héritée du texte).
const svg = (body, vb = "0 0 24 24") =>
  `<svg viewBox="${vb}" width="1em" height="1em" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  heart: svg('<path fill="currentColor" stroke="none" d="M12 21s-7.5-4.6-9.6-9.3C.9 8.2 3 4.5 6.6 4.5c2.1 0 3.7 1.2 5.4 3.2 1.7-2 3.3-3.2 5.4-3.2 3.6 0 5.7 3.7 4.2 7.2C19.5 16.4 12 21 12 21z"/>'),
  star: svg('<path fill="currentColor" stroke="none" d="M12 2.5l2.9 6 6.6.8-4.9 4.5 1.3 6.5L12 17.1l-5.9 3.2 1.3-6.5L2.5 9.3l6.6-.8z"/>'),
  gear: svg('<circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.6M12 18.6v2.6M21.2 12h-2.6M5.4 12H2.8M18.5 5.5l-1.8 1.8M7.3 16.7l-1.8 1.8M18.5 18.5l-1.8-1.8M7.3 7.3L5.5 5.5"/>'),
  pause: svg('<path d="M8 5v14M16 5v14" stroke-width="3.4"/>'),
  back: svg('<path d="M15 5l-7 7 7 7" stroke-width="3"/>'),
  lock: svg('<rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor" stroke="none"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'),
  play: svg('<path fill="currentColor" stroke="none" d="M7 4.5v15l12.5-7.5z"/>'),
  hammer: svg('<path d="M13.5 6.5l4 4"/><path fill="currentColor" d="M11 4l5-1.5 4 4L18.5 11.5l-4-4z"/><path d="M14.5 9.5L4.5 19.5" stroke-width="3"/>'),
  shuffle: svg('<path d="M3 7h3.5c4 0 6.5 10 11 10H21M3 17h3.5c1.8 0 3.2-2 4.4-4.3M13.6 9.2C14.8 7.6 16 7 17.5 7H21"/><path d="M18.5 4.5L21 7l-2.5 2.5M18.5 14.5L21 17l-2.5 2.5"/>'),
  gift: svg('<rect x="3.5" y="9" width="17" height="11.5" rx="2"/><path d="M2.5 9h19M12 9v11.5M12 9c-1-3.5-5.5-5-6-2.5S9.5 9 12 9zm0 0c1-3.5 5.5-5 6-2.5S14.5 9 12 9z"/>'),
  help: svg('<circle cx="12" cy="12" r="9.5"/><path d="M9.3 9.2a2.8 2.8 0 0 1 5.4 1c0 2-2.7 2.3-2.7 4"/><circle cx="12" cy="17.6" r=".6" fill="currentColor"/>'),
  video: svg('<rect x="2.5" y="5.5" width="13" height="13" rx="2.5"/><path d="M15.5 10l6-3.5v11l-6-3.5"/>'),
  close: svg('<path d="M6 6l12 12M18 6L6 18" stroke-width="3"/>'),
  music: svg('<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.6" fill="currentColor"/><circle cx="17.5" cy="16" r="2.6" fill="currentColor"/>'),
  sound: svg('<path fill="currentColor" d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4.5 4.5 0 0 1 0 6M18.3 6.3a8.4 8.4 0 0 1 0 11.4"/>'),
  vibrate: svg('<rect x="7.5" y="3.5" width="9" height="17" rx="2"/><path d="M4 8.5v7M20 8.5v7"/>'),
  cart: svg('<path d="M3 4h2.5l2.2 11h10.6l2.2-8H7"/><circle cx="9.5" cy="19.5" r="1.6" fill="currentColor"/><circle cx="17" cy="19.5" r="1.6" fill="currentColor"/>'),
  bell: svg('<path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 2h-15z"/><path d="M10 21h4"/>'),
  noads: svg('<rect x="3" y="6" width="18" height="12" rx="2.5"/><path d="M8.5 15l1.8-6h.4l1.8 6M9 13.2h2.8M14.5 9h1.6a2.2 2.2 0 0 1 0 6h-1.6z"/><path d="M3.5 3.5l17 17" stroke-width="2.6"/>'),
  chest: svg('<path d="M3.5 10.5h17v9a1.5 1.5 0 0 1-1.5 1.5H5a1.5 1.5 0 0 1-1.5-1.5z" fill="currentColor" fill-opacity=".25"/><path d="M3.5 10.5V8a4 4 0 0 1 4-4h9a4 4 0 0 1 4 4v2.5z"/><rect x="10" y="9" width="4" height="4.5" rx="1" fill="currentColor"/><path d="M3.5 10.5h17"/>'),
  bomb: svg('<circle cx="10.5" cy="14" r="7" fill="currentColor" fill-opacity=".3"/><path d="M15.5 9l2.5-2.5"/><path d="M18 4.5v-1M20.5 6.5h1M19.8 4.7l.8-.8"/><circle cx="8" cy="11.5" r="1.3" fill="currentColor"/>'),
  wand: svg('<path d="M4 20L15 9" stroke-width="2.8"/><path fill="currentColor" stroke="none" d="M17 2.5l1.2 2.6 2.8.4-2 2 .5 2.8L17 9l-2.5 1.3.5-2.8-2-2 2.8-.4z"/><path d="M20.5 13v2M19.5 14h2M7 4v2M6 5h2"/>'),
  clock: svg('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2.5M9.5 2.5h5"/>'),
  map: svg('<path d="M9 4L3.5 6v14L9 18l6 2 5.5-2V4L15 6z"/><path d="M9 4v14M15 6v14"/>'),
};
