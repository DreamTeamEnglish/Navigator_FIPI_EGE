const VK_DOMAIN = 'dreamteam.invalid';

export function firebaseEmail(identifier) {
  const value = String(identifier || '').trim().toLowerCase();
  if (/^\d{1,15}$/.test(value)) return `vk-${value}@${VK_DOMAIN}`;
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return value;
  throw new Error('Введите email или числовой VK ID.');
}

export function createEgeFirebaseBridge({ auth, ops, accessUrl, fetchImpl = fetch }) {
  let snapshot = null;
  const user = value => value ? { ...value, id: value.uid } : null;
  async function token() { if (!auth.currentUser) return ''; return auth.currentUser.getIdToken(true); }
  async function request(params = {}, input = null) {
    const url = new URL(accessUrl); Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
    const idToken = await token();
    const response = await fetchImpl(url, {
      method: input ? 'POST' : 'GET', cache: 'no-store',
      headers: { ...(idToken ? { 'X-Firebase-Token': idToken } : {}), ...(input ? { 'Content-Type': 'application/json' } : {}) },
      ...(input ? { body: JSON.stringify(input) } : {}),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || payload.ok === false) { const error = new Error(payload.error || `HTTP ${response.status}`); error.code = payload.error || ''; throw error; }
    return payload;
  }
  async function full(refresh = false) { if (!snapshot || refresh) snapshot = await request(); return snapshot; }
  const result = promise => promise.then(data => ({ data, error: null })).catch(error => ({ data: null, error }));
  const principal = row => ({
    principal_key: `auth:${row.firebase_uid}`, role: row.role, status: row.ege_status,
    access_level: row.ege_access_level, access_expires_at: row.ege_access_expires_at,
    access_source: row.ege_access_source, email: row.email, display_name: row.display_name,
    first_seen_at: row.firebase_last_login_at || null,
    last_seen_at: row.firebase_last_login_at || null,
    login_count: row.firebase_last_login_at ? 1 : 0,
    last_login_at: row.firebase_last_login_at || null,
    created_at: row.firebase_created_at || null,
  });

  async function rpc(name, args = {}) {
    if (name === 'ege_demo_catalog') return (await request({ mode: 'demo' })).demo;
    if (name === 'ege_runtime_config') return [(snapshot || {}).runtime || { content_source: 'fipi', demo_enabled: true, yandex_backup_ready: false }];
    if (name === 'ege_my_access') { const value = (await full(true)).profile; return [principal(value)]; }
    if (name === 'ege_my_managed_auth_v060') { const value = (await full()).profile; return [{ auth_user_id: value.firebase_uid, must_change_password: value.must_change_password, login_kind: value.login_kind, display_name: value.display_name }]; }
    if (name === 'ege_my_source_preference_v050') return (await full()).progress.source_preference;
    if (name === 'ege_set_my_source_preference_v050') { const value = await request({}, { action: 'set-source-preference', source: args.p_source }); snapshot = null; return value.source; }
    if (name === 'ege_set_unit_status') { await request({}, { action: 'set-task-status', item_id: args.p_item_id || args.p_unit_id, status: args.p_status }); snapshot = null; return true; }
    if (['ege_touch_presence', 'ege_clear_presence', 'ege_register_auth_login'].includes(name)) return true;
    if (name === 'ege_admin_user_directory') return (await request({ mode: 'admin-directory' })).users.map(principal);
    if (name === 'ege_admin_managed_directory_v050') return (await request({ mode: 'admin-directory' })).users.map(row => ({ auth_user_id: row.firebase_uid, login_kind: row.login_kind, email: row.email, vk_user_id: row.login_kind === 'vk_manual' ? row.login_label : null, display_name: row.display_name, must_change_password: row.must_change_password }));
    if (name === 'ege_admin_online_directory' || name === 'ege_admin_login_history') return [];
    if (name === 'ege_admin_demo_status') { const runtime = (await request({ mode: 'admin-directory' })).runtime; return [{ demo_enabled: runtime.demo_enabled, demo_units: 60 }]; }
    if (name === 'ege_admin_set_demo_enabled') return (await request({}, { action: 'set-runtime', runtime: { demo_enabled: Boolean(args.p_enabled) } })).runtime.demo_enabled;
    if (name === 'ege_admin_set_content_source') return (await request({}, { action: 'set-runtime', runtime: { content_source: args.p_source } })).runtime.content_source;
    if (name === 'ege_admin_set_backup_ready') return (await request({}, { action: 'set-runtime', runtime: { yandex_backup_ready: Boolean(args.p_ready) } })).runtime.yandex_backup_ready;
    if (name === 'ege_admin_set_principal_access') { const uid = String(args.p_principal_key || '').replace(/^auth:/, ''); await request({}, { action: 'update-ege-access', user: { firebase_uid: uid, status: args.p_status, access_level: args.p_access_level, access_expires_at: args.p_access_expires_at } }); return true; }
    if (name === 'ege_admin_import_existing_access') return (await request({}, { action: 'import-ege-access', users: args.p_users })).result;
    if (name === 'ege_admin_save_topic_override') { await request({}, { action: 'save-topic-override', override: { unit_id: args.p_unit_id, mode: args.p_mode, topic_ids: args.p_topic_ids, note: args.p_note } }); snapshot = null; return true; }
    if (name === 'ege_admin_reset_topic_override') { await request({}, { action: 'reset-topic-override', unit_id: args.p_unit_id }); snapshot = null; return true; }
    throw new Error(`Unsupported Firebase RPC: ${name}`);
  }

  function table(name) {
    const query = { select() { return query; }, range() { return query; }, eq() { return query; }, order() { return query; }, then(resolve) {
      return full().then(value => {
        let rows = [];
        if (name === 'ege_task_status') rows = Object.entries(value.progress.statuses || {}).map(([item_id, status]) => ({ principal_key: `auth:${value.profile.firebase_uid}`, item_id, status, updated_at: null }));
        if (name === 'ege_unit_topic_overrides') rows = value.topics?.overrides || [];
        if (name === 'ege_unit_topic_manual') rows = value.topics?.manual_links || [];
        return resolve({ data: rows, error: null });
      }).catch(error => resolve({ data: null, error }));
    } };
    return query;
  }

  return Object.freeze({
    request, full,
    auth: {
      getSession: () => result((async () => ({ session: auth.currentUser ? { user: user(auth.currentUser), access_token: await token() } : null }))()),
      signInWithPassword: ({ email, password }) => result(ops.signInWithEmailAndPassword(auth, firebaseEmail(email.replace(/^navigator-vk-(\d+)@example\.com$/i, '$1')), password).then(value => ({ user: user(value.user), session: value.user }))),
      signOut: () => result(ops.signOut(auth).then(() => true)),
      updateUser: ({ password }) => result(ops.updatePassword(auth.currentUser, password).then(async () => { await request({}, { action: 'complete-password-change' }); snapshot = null; return { user: user(auth.currentUser) }; })),
      resetPasswordForEmail: (email, settings) => result(ops.sendPasswordResetEmail(auth, email, { url: settings?.redirectTo || location.href }).then(() => true)),
      onAuthStateChange(callback) { const unsubscribe = ops.onAuthStateChanged(auth, value => callback(value ? 'SIGNED_IN' : 'SIGNED_OUT', value ? { user: user(value) } : null)); return { data: { subscription: { unsubscribe } } }; },
    },
    rpc: (name, args) => result(rpc(name, args)),
    from: table,
  });
}

async function bootstrap() {
  const config = window.EGE_CONFIG || {};
  if (config.authProvider !== 'firebase') return;
  const publicRequest = async () => {
    const response = await fetch(`${config.firebaseAccessUrl}?mode=demo`, { cache:'no-store' });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    return payload.demo;
  };
  const publicBridge = {
    auth: { getSession: async () => ({ data:{ session:null }, error:null }), onAuthStateChange: () => ({ data:{ subscription:{ unsubscribe() {} } } }), signOut: async () => ({ data:true, error:null }) },
    rpc: async name => name === 'ege_demo_catalog' ? { data:await publicRequest(), error:null } : { data:name === 'ege_runtime_config' ? [{ content_source:'fipi', demo_enabled:true, yandex_backup_ready:false }] : null, error:null },
    from: () => ({ select() { return this; }, range() { return this; }, eq() { return this; }, order() { return this; }, then(resolve) { resolve({ data:[], error:null }); } }),
  };
  window.supabase = { createClient: () => publicBridge };
  try {
    const [{ initializeApp }, authOps] = await Promise.all([
      import('https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js'),
      import('https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js'),
    ]);
    const auth = authOps.getAuth(initializeApp(config.firebase));
    await authOps.setPersistence(auth, authOps.browserLocalPersistence);
    const bridge = createEgeFirebaseBridge({ auth, ops: authOps, accessUrl: config.firebaseAccessUrl });
    window.supabase = { createClient: () => bridge };
    window.dispatchEvent(new CustomEvent('ege-firebase-ready'));
  } catch (error) {
    console.error('Firebase bootstrap delayed:', error);
    window.dispatchEvent(new CustomEvent('ege-firebase-error', { detail:{ message:error.message } }));
  }
}

if (typeof window !== 'undefined') await bootstrap();
