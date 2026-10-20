(() => {
  const key = 'themeColor';
  const fallback = '#7460d6';
  let current = fallback;
  const valid = (color) => /^#[0-9a-f]{6}$/i.test(color);
  function apply(color) {
    color = valid(color) ? color.toLowerCase() : fallback;
    current = color;
    const rgb = [1, 3, 5].map((offset) => parseInt(color.slice(offset, offset + 2), 16));
    const mix = (white) => `rgb(${rgb.map((value) => Math.round(value + (255 - value) * white)).join(',')})`;
    const luminance = (values) => values.map((v) => {
      v /= 255;
      return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
    let ink = rgb.slice();
    while (luminance(ink) > 0.16) ink = ink.map((v) => Math.floor(v * 0.9));
    const style = document.documentElement.style;
    style.setProperty('--theme-color', color);
    style.setProperty('--theme-ink', `rgb(${ink.join(',')})`);
    style.setProperty('--theme-soft', mix(0.91));
    style.setProperty('--theme-hover', mix(0.85));
    style.setProperty('--theme-border', mix(0.65));
    style.setProperty('--theme-focus', mix(0.4));
    style.setProperty('--theme-on-color', luminance(rgb) > 0.4 ? '#202432' : '#ffffff');
    window.dispatchEvent(new CustomEvent('themechange', { detail: color }));
    return color;
  }
  function read() {
    try { return localStorage.getItem(key) || fallback; } catch { return fallback; }
  }
  window.toolboxTheme = {
    get: () => current,
    set(color) {
      if (!valid(color)) return;
      let saved = true;
      try { localStorage.setItem(key, color.toLowerCase()); } catch { saved = false; }
      apply(color);
      return saved;
    }
  };
  apply(read());
  window.addEventListener('storage', (event) => {
    if (event.key === key || event.key === null) apply(read());
  });
})();
