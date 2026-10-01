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


// Replace expired one-day event details with a safe link to the current official X feed.
const eventExpiry = document.querySelector('[data-event-expiry]')?.dataset.eventExpiry;
if (eventExpiry) {
  const expiryTime = Date.parse(eventExpiry);
  if (Number.isFinite(expiryTime) && Date.now() >= expiryTime) {
    const schedule = document.querySelector('.hero-schedule[data-event-expiry]');
    if (schedule) {
      schedule.classList.add('is-stale');
      [...schedule.children].forEach((item) => {
        if (!item.classList.contains('schedule-date') && !item.classList.contains('schedule-x')) {
          item.hidden = true;
        }
      });

      const dateLabel = schedule.querySelector('.schedule-date span');
      const dateStatus = schedule.querySelector('.schedule-date strong');
      const latestLink = schedule.querySelector('.schedule-x');
      if (dateLabel) dateLabel.textContent = 'LATEST';
      if (dateStatus) dateStatus.textContent = '最新情報';
      if (latestLink) {
        latestLink.href = 'https://x.com/ChonmageNiigata';
        const latestStrong = latestLink.querySelector('strong');
        if (latestStrong) latestStrong.textContent = '公式Xで確認 ↗';
      }
      schedule.setAttribute('aria-label', '最新の営業・イベント情報');
    }

    const today = document.querySelector('.today[data-event-expiry]');
    if (today) {
      today.querySelector('.event-list')?.setAttribute('hidden', '');
      today.querySelector('.ring-banner')?.setAttribute('hidden', '');
      today.querySelector('.schedule-note')?.setAttribute('hidden', '');
      const notice = today.querySelector('.stale-event-notice');
      if (notice) notice.hidden = false;

      const summaryDate = today.querySelector('.today-summary span');
      const summaryOpen = today.querySelector('.today-summary strong');
      const summaryText = today.querySelector('.today-summary p');
      if (summaryDate) summaryDate.textContent = '最新情報';
      if (summaryOpen) summaryOpen.textContent = '公式Xで確認';
      if (summaryText) summaryText.innerHTML = '当日のゲーム・営業時間・空席状況は<br />公式Xで随時更新しています。';
    }
  }
}
