import { supabase } from './supabase-config.js';

const $ = (id) => document.getElementById(id);
const authCard = $('auth-card');
const ageCard = $('age-card');
const dashboard = $('dashboard');
const statusLine = $('status-line');

const setStatus = (t) => { statusLine.textContent = t || ''; };

// The daily quota resets at Asia/Seoul midnight (same as the database).
const seoulToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

$('google-sign-in')?.addEventListener('click', async () => {
  setStatus('Redirecting to Google…');
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin + window.location.pathname }
  });
  if (error) setStatus('Sign-in failed. Please try again.');
});

$('sign-out')?.addEventListener('click', async () => {
  await supabase.auth.signOut();
});

$('age-confirm')?.addEventListener('change', (e) => {
  $('age-continue').disabled = !e.target.checked;
});

$('age-continue')?.addEventListener('click', async () => {
  const { error } = await supabase.rpc('confirm_age');
  if (error) { setStatus('Could not save. Please try again.'); return; }
  setStatus('');
  await render();
});

async function render() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    authCard.style.display = 'block';
    ageCard.style.display = 'none';
    dashboard.classList.remove('visible');
    return;
  }
  authCard.style.display = 'none';

  const user = session.user;
  const meta = user.user_metadata || {};
  const avatar = $('dash-avatar');
  if (meta.avatar_url) avatar.src = meta.avatar_url; else avatar.removeAttribute('src');
  $('dash-name').textContent = meta.full_name || 'Signed in';
  $('dash-email').textContent = user.email || '';

  // RLS: these reads only ever return the signed-in user's own rows.
  const { data: profile, error } = await supabase
    .from('profiles').select('tier, age_confirmed').maybeSingle();
  if (error || !profile) { setStatus('Could not load your account.'); return; }

  if (!profile.age_confirmed) {
    ageCard.style.display = 'block';
    dashboard.classList.remove('visible');
    return;
  }
  ageCard.style.display = 'none';
  dashboard.classList.add('visible');

  const [{ data: tier }, { data: usage }] = await Promise.all([
    supabase.from('tiers').select('daily_message_limit').eq('name', profile.tier).maybeSingle(),
    supabase.from('usage_daily').select('messages').eq('day', seoulToday()).maybeSingle()
  ]);
  const limit = tier?.daily_message_limit ?? 0;
  const used = usage?.messages ?? 0;
  $('tier-name').textContent = profile.tier;
  $('usage-today').textContent = `${used} / ${limit}`;
  $('usage-left').textContent = String(Math.max(limit - used, 0));
}

supabase.auth.onAuthStateChange(() => { render(); });
render();
