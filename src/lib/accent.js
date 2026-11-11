const BRAND = {
  dark: { hex: '#2ee0cc', rgb: [46, 224, 204], ink: '#04221f', readable: [138, 247, 232] },
  light: { hex: '#0c7d74', rgb: [12, 125, 116], ink: '#ffffff', readable: [10, 107, 100] },
};

/** Couleurs du logo. L’argument est ignoré : il n’y a plus de palette personnalisée. */
export function applyAccent() {
  const root = document.documentElement;
  const brand = root.dataset.theme === 'light' ? BRAND.light : BRAND.dark;
  root.style.setProperty('--accent-color', brand.hex);
  root.style.setProperty('--accent-color-rgb', brand.rgb.join(', '));
  root.style.setProperty('--accent-ink', brand.ink);
  root.style.setProperty('--accent-readable', `rgb(${brand.readable.join(', ')})`);
}
