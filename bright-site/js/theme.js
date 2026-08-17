(function () {
  const root = document.documentElement;
  const stored = localStorage.getItem('bright-theme');
  if (stored) root.setAttribute('data-theme', stored);

  function currentIsDark() {
    const attr = root.getAttribute('data-theme');
    if (attr === 'dark') return true;
    if (attr === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function paintIcon(btn) {
    const dark = currentIsDark();
    btn.innerHTML = dark
      ? '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2.5M12 19.5V22M4.2 4.2l1.8 1.8M18 18l1.8 1.8M2 12h2.5M19.5 12H22M4.2 19.8L6 18M18 6l1.8-1.8"/></svg>'
      : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 12.6A9 9 0 1 1 11.4 3a7 7 0 0 0 9.6 9.6Z"/></svg>';
    btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
  }

  document.querySelectorAll('.theme-toggle').forEach((btn) => {
    paintIcon(btn);
    btn.addEventListener('click', () => {
      const next = currentIsDark() ? 'light' : 'dark';
      root.setAttribute('data-theme', next);
      localStorage.setItem('bright-theme', next);
      document.querySelectorAll('.theme-toggle').forEach(paintIcon);
    });
  });
})();
