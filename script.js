
const navToggle = document.querySelector('.nav-toggle');
const primaryNav = document.querySelector('.primary-nav');

if (navToggle && primaryNav) {
  navToggle.addEventListener('click', () => {
    const isOpen = primaryNav.classList.toggle('open');
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });

  primaryNav.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', () => {
      primaryNav.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    });
  });
}

function handleSignup(event) {
  event.preventDefault();
  const input = document.getElementById('email');
  const message = document.getElementById('signup-message');

  if (!input.value.trim()) {
    message.textContent = 'Please enter your email address.';
    return false;
  }

  message.textContent = 'Thanks — this form is ready to connect to your email platform.';
  input.value = '';
  return false;
}
