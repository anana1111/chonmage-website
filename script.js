// Mobile links remain visible if JavaScript never initializes.
const menuButton = document.querySelector('.menu-button');
const mobileNav = document.getElementById('mobile-nav');
const header = document.querySelector('.site-header');

if (menuButton && mobileNav && header && typeof window.matchMedia === 'function') {
  const mobileView = window.matchMedia('(max-width: 900px)');
  let menuOpen = false;

  const setMenuOpen = (open) => {
    menuOpen = mobileView.matches && open;
    mobileNav.hidden = !menuOpen;
    menuButton.setAttribute('aria-expanded', String(menuOpen));
    menuButton.setAttribute('aria-label', menuOpen ? 'メニューを閉じる' : 'メニューを開く');
  };

  const syncMenu = () => {
    const focusedLink = mobileNav.contains(document.activeElement) ? document.activeElement : null;
    menuButton.hidden = !mobileView.matches;
    setMenuOpen(false);
    if (focusedLink) {
      const desktopLink = [...header.querySelectorAll('nav:not(.mobile-nav) a')]
        .find((link) => link.getAttribute('href') === focusedLink.getAttribute('href'));
      (mobileView.matches ? menuButton : desktopLink || header.querySelector('.brand'))?.focus();
    }
  };

  menuButton.addEventListener('click', () => setMenuOpen(!menuOpen));
  mobileNav.addEventListener('click', (event) => {
    const link = event.target.closest('a[href^="#"]');
    if (!link || !mobileNav.contains(link)) return;
    setMenuOpen(false);
    const target = document.getElementById(link.hash.slice(1));
    if (target) {
      if (!target.hasAttribute('tabindex')) {
        target.setAttribute('tabindex', '-1');
        target.addEventListener('blur', () => target.removeAttribute('tabindex'), { once: true });
      }
      target.focus({ preventScroll: true });
    }
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && menuOpen) {
      event.preventDefault();
      setMenuOpen(false);
      menuButton.focus();
    }
  });
  document.addEventListener('click', (event) => {
    if (menuOpen && !header.contains(event.target)) setMenuOpen(false);
  });
  header.addEventListener('focusout', () => {
    requestAnimationFrame(() => {
      if (menuOpen && !header.contains(document.activeElement)) setMenuOpen(false);
    });
  });
  if (mobileView.addEventListener) mobileView.addEventListener('change', syncMenu);
  else mobileView.addListener?.(syncMenu);
  syncMenu();
  header.classList.add('nav-ready');
}

const rail = document.querySelector('[data-drag-scroll]');
if (rail) {
  let dragging = false;
  let dragStart = 0;
  let scrollStart = 0;
  rail.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || event.pointerType === 'touch') return;
    dragging = true;
    dragStart = event.clientX;
    scrollStart = rail.scrollLeft;
    rail.setPointerCapture?.(event.pointerId);
  });
  rail.addEventListener('pointermove', (event) => {
    if (dragging) rail.scrollLeft = scrollStart - (event.clientX - dragStart);
  });
  const stopDragging = () => { dragging = false; };
  rail.addEventListener('pointerup', stopDragging);
  rail.addEventListener('pointercancel', stopDragging);
  rail.addEventListener('lostpointercapture', stopDragging);
}

// The page is readable before and without this optional animation.
if ('IntersectionObserver' in window && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('in');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.14 });
  document.querySelectorAll('.reveal').forEach((item, index) => {
    item.style.setProperty('--reveal-delay', String(Math.min(index % 4, 3) * 70) + 'ms');
    observer.observe(item);
  });
}
