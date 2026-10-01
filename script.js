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

// --------------------------------------------------
// Today's event freshness check
// Uses Japan Standard Time regardless of visitor timezone.
// --------------------------------------------------

const todaySection = document.querySelector(
  '#today[data-event-date]'
);

if (todaySection) {
  const getJapanDate = () => {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(new Date());

    const values = Object.fromEntries(
      parts
        .filter((part) => part.type !== 'literal')
        .map((part) => [part.type, part.value])
    );

    return `${values.year}-${values.month}-${values.day}`;
  };

  const eventDate = todaySection.dataset.eventDate;
  const japanToday = getJapanDate();

  const liveContent =
    todaySection.querySelector('.today-live-content');

  const staleMessage =
    todaySection.querySelector('.today-stale-message');

  const heroStatusText =
    document.getElementById('hero-business-status-text');

  const heroScheduleDate =
    document.getElementById('hero-schedule-date');

  const heroEventDetails =
    document.querySelectorAll('.hero-event-detail');

  const heroSchedule = document.querySelector('.hero-schedule');
  const heroLatestLink = document.querySelector('.hero-schedule .schedule-x');

  const isCurrentEventDay =
    eventDate === japanToday;

  if (!isCurrentEventDay) {
    if (liveContent) {
      liveContent.hidden = true;
    }

    if (staleMessage) {
      staleMessage.hidden = false;
    }

    todaySection.classList.add('is-stale');
    todaySection.setAttribute('aria-labelledby', 'today-stale-title');
    heroSchedule?.classList.add('is-stale');
    heroSchedule?.setAttribute('aria-label', '最新の営業・イベント情報');
    if (heroLatestLink) heroLatestLink.href = 'https://x.com/ChonmageNiigata';

    if (heroStatusText) {
      heroStatusText.textContent = '最新情報はXで確認';
    }

    if (heroScheduleDate) {
      heroScheduleDate.textContent = 'LATEST INFO';
    }

    heroEventDetails.forEach((item) => {
      item.hidden = true;
    });
  } else {
    if (liveContent) {
      liveContent.hidden = false;
    }

    if (staleMessage) {
      staleMessage.hidden = true;
    }

    todaySection.classList.remove('is-stale');
    todaySection.setAttribute('aria-labelledby', 'today-title');
    heroSchedule?.classList.remove('is-stale');
  }
}
