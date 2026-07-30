import { supabase } from './supabase.js';

const loginUrl = new URL('../login.html', window.location.href);

function displayName(user) {
  const metadataName = user?.user_metadata?.full_name?.trim();
  if (metadataName) return metadataName;
  const emailName = user?.email?.split('@')[0] || 'Member';
  return emailName.charAt(0).toUpperCase() + emailName.slice(1);
}

function setAccountUi(user) {
  const name = displayName(user);
  const email = user?.email || '';

  const nameEl = document.getElementById('hnAccountName');
  const emailEl = document.getElementById('hnAccountEmail');
  const triggerEmailEl = document.getElementById('hnAccountTriggerEmail');
  if (nameEl) nameEl.textContent = name;
  if (emailEl) emailEl.textContent = email;
  if (triggerEmailEl) triggerEmailEl.textContent = email || name;

  const welcome = document.getElementById('hnOverviewWelcome');
  if (welcome && /^Welcome back/i.test(welcome.textContent.trim())) {
    welcome.textContent = `Welcome back, ${name}`;
  }
}

async function requireSession() {
  const gate = document.getElementById('hnAuthGate');
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session) {
    loginUrl.searchParams.set('returnTo', window.location.pathname);
    window.location.replace(loginUrl.href);
    return;
  }

  setAccountUi(data.session.user);
  if (gate) gate.remove();
  document.documentElement.classList.add('hn-auth-ready');
}

async function signOut() {
  const button = document.getElementById('hnSignOut');
  if (button) {
    button.disabled = true;
    button.textContent = 'Signing out…';
  }

  await supabase.auth.signOut();
  window.location.replace(loginUrl.href);
}

const accountTrigger = document.getElementById('hnAccountTrigger');
const accountMenu = document.getElementById('hnAccountMenu');

function closeAccountMenu() {
  accountMenu?.classList.remove('open');
  accountTrigger?.setAttribute('aria-expanded', 'false');
}

accountTrigger?.addEventListener('click', (event) => {
  event.stopPropagation();
  const willOpen = !accountMenu?.classList.contains('open');
  accountMenu?.classList.toggle('open', willOpen);
  accountTrigger.setAttribute('aria-expanded', String(willOpen));
});

document.addEventListener('click', (event) => {
  if (!event.target.closest('.hn-account')) closeAccountMenu();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    closeAccountMenu();
    accountTrigger?.focus();
  }
});

document.getElementById('hnSignOut')?.addEventListener('click', signOut);

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT' || !session) return;
  setAccountUi(session.user);
});

requireSession().catch(() => window.location.replace(loginUrl.href));
