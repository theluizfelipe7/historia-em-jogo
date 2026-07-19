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
