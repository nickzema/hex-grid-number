// The seven fonts in Owlbear's text toolbar, by the names Owlbear shows.
// `obr` is the fontFamily value written to the label items.
// Only Rounded (Roboto, the SDK default) is confirmed. The rest are best guesses
// until checked against the "Selected text font" line in the popover.
// `css` is only for the popover preview and the dropdown, so it is approximate.
export const FONTS = [
  { name: "Rounded", obr: "Roboto", css: "ui-rounded, 'SF Pro Rounded', 'Varela Round', system-ui, sans-serif" },
  { name: "Fantasy", obr: "Metamorphous", css: "fantasy, Papyrus, 'Luminari', serif" },
  { name: "Marker", obr: "Permanent Marker", css: "'Permanent Marker', 'Marker Felt', 'Chalkboard SE', cursive" },
  { name: "Script", obr: "Kaushan Script", css: "'Snell Roundhand', 'Brush Script MT', cursive" },
  { name: "Cursive", obr: "Dancing Script", css: "'Apple Chancery', 'Segoe Script', cursive" },
  { name: "Mono", obr: "Roboto Mono", css: "ui-monospace, 'SF Mono', Menlo, Consolas, monospace" },
  { name: "Serif", obr: "Roboto Slab", css: "'Times New Roman', Georgia, serif" },
];

export const DEFAULT_FONT = "Rounded";

export const fontByName = (name) => FONTS.find((f) => f.name === name) || FONTS[0];
