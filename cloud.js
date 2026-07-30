import { supabase, isSupabaseConfigured } from './supabase.js';

if (!isSupabaseConfigured || !supabase) {
  console.info('Harbour North cloud save is disabled in local alpha mode.');
} else {

const TABLE = 'retirement_plans';
const PLAN_NAME = 'My Retirement Plan';
const DEBOUNCE_MS = 1800;

let user = null;
let rowId = null;
let timer = null;
let saving = false;
let pending = false;
let applyingRemote = false;

const statusEl = document.getElementById('hnCloudStatus');

function setStatus(text, state = '') {
  if (!statusEl) return;
  statusEl.textContent = text;
  statusEl.classList.remove('syncing', 'saved', 'error');
  if (state) statusEl.classList.add(state);
}

function bridge() {
  return window.HNCloudBridge;
}

function timeOf(plan) {
  const value = plan?.meta?.updatedAt;
  const parsed = value ? Date.parse(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

async function findCloudPlan() {
  const { data, error } = await supabase
    .from(TABLE)
    .select('id, plan_name, plan_data, created_at, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (data?.id) rowId = data.id;
  return data || null;
}

async function writeCloudPlan() {
  if (!user || !bridge() || applyingRemote) return;
  if (saving) {
    pending = true;
    return;
  }

  saving = true;
  pending = false;
  setStatus('Cloud: saving…', 'syncing');

  try {
    const plan = bridge().getPlan();
    const values = {
      user_id: user.id,
      plan_name: PLAN_NAME,
      plan_data: plan,
      updated_at: new Date().toISOString()
    };

    if (rowId) {
      const { error } = await supabase.from(TABLE).update(values).eq('id', rowId).eq('user_id', user.id);
      if (error) throw error;
    } else {
      const { data, error } = await supabase.from(TABLE).insert(values).select('id').single();
      if (error) throw error;
      rowId = data.id;
    }

    setStatus('Cloud: saved', 'saved');
    window.dispatchEvent(new CustomEvent('hn:cloud-saved'));
  } catch (error) {
    console.error('Harbour North cloud save failed:', error);
    setStatus('Cloud: save failed', 'error');
  } finally {
    saving = false;
    if (pending) scheduleSave(250);
  }
}

function scheduleSave(delay = DEBOUNCE_MS) {
  if (!user || applyingRemote) return;
  clearTimeout(timer);
  setStatus('Cloud: changes pending', 'syncing');
  timer = setTimeout(writeCloudPlan, delay);
}

async function reconcile() {
  const b = bridge();
  if (!b) throw new Error('Planner storage bridge is unavailable.');

  setStatus('Cloud: checking…', 'syncing');
  const cloudRow = await findCloudPlan();
  const localPlan = b.getPlan();

  if (!cloudRow?.plan_data) {
    await writeCloudPlan();
    return;
  }

  const cloudPlan = cloudRow.plan_data;
  const cloudTime = Math.max(timeOf(cloudPlan), Date.parse(cloudRow.updated_at || '') || 0);
  const localTime = timeOf(localPlan);

  // The newest copy wins. On equal timestamps, keep the browser copy and refresh cloud.
  if (cloudTime > localTime + 1000) {
    applyingRemote = true;
    setStatus('Cloud: loading plan…', 'syncing');
    try {
      b.applyPlan(cloudPlan);
      setStatus('Cloud: loaded', 'saved');
    } finally {
      applyingRemote = false;
    }
  } else {
    await writeCloudPlan();
  }
}

async function initialise() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    user = data.session?.user || null;
    if (!user) return;
    await reconcile();
  } catch (error) {
    console.error('Harbour North cloud connection failed:', error);
    setStatus('Cloud: unavailable', 'error');
  }
}

window.addEventListener('hn:plan-saved', () => scheduleSave());
statusEl?.addEventListener('click', () => writeCloudPlan());
window.addEventListener('beforeunload', () => {
  if (timer) writeCloudPlan();
});

supabase.auth.onAuthStateChange((event, session) => {
  if (event === 'SIGNED_OUT') {
    user = null;
    clearTimeout(timer);
    return;
  }
  if (session?.user && !user) {
    user = session.user;
    reconcile().catch(error => {
      console.error(error);
      setStatus('Cloud: unavailable', 'error');
    });
  }
});

initialise();

}
