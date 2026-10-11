/** Read a px token (e.g. 'size-rail-w') from the live CSS variables. */
export const cssPx = (name: string, fallback = 0) => parseFloat(getComputedStyle(document.documentElement).getPropertyValue(`--${name}`)) || fallback;
