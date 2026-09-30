const revealItems = document.querySelectorAll('.reveal');
const observer = new IntersectionObserver((entries) => {
  entries.forEach((entry) => {
    if (entry.isIntersecting) {
      entry.target.classList.add('in');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.14 });
revealItems.forEach((item, index) => {
  item.style.transitionDelay = `${Math.min(index % 4, 3) * 70}ms`;
  observer.observe(item);
});
requestAnimationFrame(() => document.querySelector('.hero').classList.add('loaded'));

const rail = document.querySelector('[data-drag-scroll]');
let dragging = false;
let dragStart = 0;
let scrollStart = 0;
rail.addEventListener('pointerdown', (event) => {
  dragging = true;
  dragStart = event.clientX;
  scrollStart = rail.scrollLeft;
  rail.setPointerCapture(event.pointerId);
});
rail.addEventListener('pointermove', (event) => {
  if (!dragging) return;
  rail.scrollLeft = scrollStart - (event.clientX - dragStart);
});
rail.addEventListener('pointerup', () => dragging = false);
rail.addEventListener('pointercancel', () => dragging = false);

window.addEventListener('scroll', () => {
  const image = document.querySelector('.hero-media img');
  if (image && window.scrollY < window.innerHeight) {
    image.style.transform = `scale(${1 + window.scrollY * 0.00008})`;
  }
}, { passive: true });
