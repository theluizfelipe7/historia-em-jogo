const dialog = document.querySelector('#aboutDialog');
const openButtons = [document.querySelector('#aboutButton'), document.querySelector('#creditsButton')];
const closeButton = document.querySelector('#closeDialog');

openButtons.forEach((button) => button?.addEventListener('click', () => dialog.showModal()));
closeButton?.addEventListener('click', () => dialog.close());
dialog?.addEventListener('click', (event) => {
  const bounds = dialog.getBoundingClientRect();
  const outside = event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
  if (outside) dialog.close();
});

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
if (!reducedMotion) {
  const layers = [...document.querySelectorAll('[data-parallax]')];
  let ticking = false;
  const updateParallax = () => {
    const viewportCenter = window.innerHeight / 2;
    layers.forEach((layer) => {
      const section = layer.closest('section');
      const rect = section.getBoundingClientRect();
      const speed = Number(layer.dataset.parallax || 0);
      const offset = (rect.top + rect.height / 2 - viewportCenter) * speed;
      layer.style.transform = `translate3d(0, ${offset}px, 0)`;
    });
    ticking = false;
  };
  window.addEventListener('scroll', () => {
    if (!ticking) {
      requestAnimationFrame(updateParallax);
      ticking = true;
    }
  }, { passive: true });
  updateParallax();
}
