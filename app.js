(() => {
  'use strict';

  const CONFIG = window.EGE_CONFIG || window.OGE_CONFIG || {};
  const PAGE_SIZE = 1000;

  const BUCKETS = [
    { id: 'listening_1', label: 'Аудирование · задание 1', short: 'Аудирование 1', group: 'Аудирование' },
    { id: 'listening_2', label: 'Аудирование · задание 2', short: 'Аудирование 2', group: 'Аудирование' },
    { id: 'listening_3_9', label: 'Аудирование · задания 3–9', short: 'Аудирование 3–9', group: 'Аудирование' },
    { id: 'reading_10', label: 'Чтение · задание 10', short: 'Чтение 10', group: 'Чтение' },
    { id: 'reading_11', label: 'Чтение · задание 11', short: 'Чтение 11', group: 'Чтение' },
    { id: 'reading_12_18', label: 'Чтение · задания 12–18', short: 'Чтение 12–18', group: 'Чтение' },
    { id: 'grammar_19_24', label: 'Грамматика · задания 19–24', short: 'Грамматика 19–24', group: 'Грамматика' },
    { id: 'wordformation_25_29', label: 'Словообразование · задания 25–29', short: 'Словообразование 25–29', group: 'Словообразование' },
    { id: 'vocabulary_30_36', label: 'Лексика · задания 30–36', short: 'Лексика 30–36', group: 'Лексика' },
    { id: 'writing_37', label: 'Письмо · задание 37', short: 'Письмо 37', group: 'Письмо' },
    { id: 'writing_38', label: 'Письмо · задание 38', short: 'Письмо 38', group: 'Письмо' },
    { id: 'speaking_1', label: 'Говорение · задание 1', short: 'Говорение 1', group: 'Говорение' },
    { id: 'speaking_2', label: 'Говорение · задание 2', short: 'Говорение 2', group: 'Говорение' },
    { id: 'speaking_3', label: 'Говорение · задание 3', short: 'Говорение 3', group: 'Говорение' },
    { id: 'speaking_4', label: 'Говорение · задание 4', short: 'Говорение 4', group: 'Говорение' },
  ];
  const BUCKET_MAP = new Map(BUCKETS.map(x => [x.id, x]));

  const CONTACT_TEXT = 'Здравствуйте! Хочу получить доступ к тематическому навигатору по открытому банку заданий ЕГЭ ФИПИ (English).';
  const STATUS_META = {
    new: { label: 'Новое', icon: '○' },
    viewed: { label: 'Просмотрено', icon: '◉' },
    used: { label: 'Использовано', icon: '★' },
  };

  let supabaseClient = null;
  let currentUser = null;
  let currentAccess = null;
  let runtimeConfig = { content_source: 'fipi', demo_enabled: true, yandex_backup_ready: false };

  let units = [];
  let items = [];
  let topics = [];
  let unitTopicLinks = [];
  let itemsByUnit = new Map();
  let topicById = new Map();
  let linksByUnit = new Map();
  let itemStatus = new Map();
  let topicOverrides = [];
  let manualTopicLinks = [];
  let overrideByUnit = new Map();
  let manualLinksByUnit = new Map();
  let editingTopicUnitId = null;

  let media = [];
  let unitMediaLinks = [];
  let mediaById = new Map();
  let mediaLinksByUnit = new Map();
  let activeBackupObjectUrls = [];

  let demoMode = false;
  let demoUsesAuth = false;
  const DEMO_STATUS_KEY = 'ege-public-demo-status-v035';

  let adminUsers = [];
  let adminOnline = [];
  let adminActiveTab = 'participants';
  let editingPrincipalKey = null;
  let presenceTimer = null;
  let adminRefreshTimer = null;
  let toastTimer = null;

  const $ = (s) => document.querySelector(s);
  const el = {
    accessGate: $('#accessGate'),
    appShell: $('#appShell'),
    accessMessage: $('#accessMessage'),
    openLoginButton: $('#openLoginButton'),
    openDonutButton: $('#openDonutButton'),
    openDemoButton: $('#openDemoButton'),
    signOutButton: $('#signOutButton'),
    adminButton: $('#adminButton'),
    sourceBadge: $('#sourceBadge'),
    cloudBadge: $('#cloudBadge'),
    modeKicker: $('#modeKicker'),

    unitCount: $('#unitCount'),
    itemCount: $('#itemCount'),
    visibleCount: $('#visibleCount'),

    topicSelect: $('#topicSelect'),
    subtopicSelect: $('#subtopicSelect'),
    bucketSelect: $('#bucketSelect'),
    statusSelect: $('#statusSelect'),
    searchInput: $('#searchInput'),
    resetButton: $('#resetButton'),
    currentSelection: $('#currentSelection'),
    sectionMeta: $('#sectionMeta'),

    matrixViewport: $('#matrixViewport'),
    matrixTrack: $('#matrixTrack'),
    scrollLeftButton: $('#scrollLeftButton'),
    scrollRightButton: $('#scrollRightButton'),
    emptyState: $('#emptyState'),

    footerYear: $('#footerYear'),
    brandLogo: $('#brandLogo'),

    authDialog: $('#authDialog'),
    closeAuthDialogButton: $('#closeAuthDialogButton'),
    emailInput: $('#emailInput'),
    passwordInput: $('#passwordInput'),
    signInButton: $('#signInButton'),
    authError: $('#authError'),

    infoDialog: $('#infoDialog'),
    closeInfoDialogButton: $('#closeInfoDialogButton'),
    closeInfoButton: $('#closeInfoButton'),
    infoKicker: $('#infoKicker'),
    infoTitle: $('#infoTitle'),
    infoText: $('#infoText'),

    adminDialog: $('#adminDialog'),
    closeAdminDialogButton: $('#closeAdminDialogButton'),
    refreshAdminButton: $('#refreshAdminButton'),
    participantsTabButton: $('#participantsTabButton'),
    onlineTabButton: $('#onlineTabButton'),
    participantsCountBadge: $('#participantsCountBadge'),
    onlineCountBadge: $('#onlineCountBadge'),
    participantsPanel: $('#participantsPanel'),
    onlinePanel: $('#onlinePanel'),
    participantsList: $('#participantsList'),
    onlineList: $('#onlineList'),

    accessEditorDialog: $('#accessEditorDialog'),
    closeAccessEditorButton: $('#closeAccessEditorButton'),
    cancelAccessEditorButton: $('#cancelAccessEditorButton'),
    saveAccessEditorButton: $('#saveAccessEditorButton'),
    accessEditorTitle: $('#accessEditorTitle'),
    accessEditorMeta: $('#accessEditorMeta'),
    accessStatusSelect: $('#accessStatusSelect'),
    accessLevelSelect: $('#accessLevelSelect'),
    accessExpiryPreset: $('#accessExpiryPreset'),
    accessCustomDateLabel: $('#accessCustomDateLabel'),
    accessCustomDate: $('#accessCustomDate'),
    accessCurrentExpiry: $('#accessCurrentExpiry'),

    historyDialog: $('#historyDialog'),
    closeHistoryDialogButton: $('#closeHistoryDialogButton'),
    historyTitle: $('#historyTitle'),
    historyList: $('#historyList'),

    toast: $('#toast'),

    topicEditorDialog: $('#topicEditorDialog'),
    closeTopicEditorButton: $('#closeTopicEditorButton'),
    topicEditorTitle: $('#topicEditorTitle'),
    baseTopicChips: $('#baseTopicChips'),
    topicOverrideMode: $('#topicOverrideMode'),
    addManualTopicRowButton: $('#addManualTopicRowButton'),
    manualTopicRows: $('#manualTopicRows'),
    topicAdminNote: $('#topicAdminNote'),
    resetTopicOverrideButton: $('#resetTopicOverrideButton'),
    saveTopicOverrideButton: $('#saveTopicOverrideButton'),

    adminSourceState: $('#adminSourceState'),
    useFipiSourceButton: $('#useFipiSourceButton'),
    useYandexSourceButton: $('#useYandexSourceButton'),

    adminDemoState: $('#adminDemoState'),
    toggleDemoButton: $('#toggleDemoButton'),
    previewDemoButton: $('#previewDemoButton'),

    backupTaskDialog: $('#backupTaskDialog'),
    closeBackupTaskButton: $('#closeBackupTaskButton'),
    backupTaskTitle: $('#backupTaskTitle'),
    backupTaskMeta: $('#backupTaskMeta'),
    backupOfficialLink: $('#backupOfficialLink'),
    printBackupTaskButton: $('#printBackupTaskButton'),
    backupTaskBody: $('#backupTaskBody'),
  };

  function configuredKey() {
    return CONFIG.supabasePublishableKey || CONFIG.supabaseAnonKey || '';
  }

  function isConfigured() {
    return Boolean(CONFIG.supabaseUrl && configuredKey() && window.supabase?.createClient);
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>'"]/g, ch => ({
      '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;'
    }[ch]));
  }

  function showMessage(text, type = '') {
    el.accessMessage.textContent = text;
    el.accessMessage.className = 'access-message' + (type ? ` ${type}` : '');
  }

  function clearMessage() {
    el.accessMessage.textContent = '';
    el.accessMessage.className = 'access-message hidden';
  }

  function showInfo(title, text, kicker = 'INFO') {
    el.infoKicker.textContent = kicker;
    el.infoTitle.textContent = title;
    el.infoText.textContent = text;
    if (typeof el.infoDialog.showModal === 'function') el.infoDialog.showModal();
  }

  function showAuthError(text) {
    el.authError.textContent = text;
    el.authError.classList.remove('hidden');
  }

  function clearAuthError() {
    el.authError.textContent = '';
    el.authError.classList.add('hidden');
  }

  function authErrorText(error) {
    const m = String(error?.message || error || '');
    if (/invalid login credentials/i.test(m)) return 'Неверный email или пароль.';
    if (/email not confirmed/i.test(m)) return 'Email ещё не подтверждён.';
    if (/rate limit/i.test(m)) return 'Слишком много попыток. Попробуйте немного позже.';
    return m || 'Не удалось выполнить вход.';
  }


  function formatDateTime(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    }).format(d);
  }

  function formatDate(value) {
    if (!value) return '—';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '—';
    return new Intl.DateTimeFormat('ru-RU', {
      day: '2-digit', month: '2-digit', year: 'numeric'
    }).format(d);
  }

  function showToast(text) {
    clearTimeout(toastTimer);
    el.toast.textContent = text;
    el.toast.classList.remove('hidden');
    toastTimer = setTimeout(() => el.toast.classList.add('hidden'), 2600);
  }

  async function copyText(text) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch {}
    try {
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly','');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      return ok;
    } catch {
      return false;
    }
  }

  function accessSourceLabel(source) {
    if (source === 'donut') return 'VK DONUT';
    if (source === 'invite') return 'INVITE';
    if (source === 'admin') return 'ADMIN';
    return String(source || '—').toUpperCase();
  }

  function sessionKindLabel(kind) {
    return kind === 'vk_donut' ? 'VK Donut' : 'Email';
  }

  function userDisplayName(row) {
    return row.display_name || row.email || (row.vk_user_id ? `VK ID ${row.vk_user_id}` : row.principal_key);
  }

  function accessChip(value, extra = '') {
    return `<span class="admin-chip ${esc(extra || String(value || '').toLowerCase())}">${esc(String(value || '—').toUpperCase())}</span>`;
  }

  async function touchPresence() {
    if (!supabaseClient || !currentUser) return;
    try {
      const { error } = await supabaseClient.rpc('ege_touch_presence');
      if (error) console.warn('EGE presence heartbeat:', error.message || error);
    } catch (error) {
      console.warn('EGE presence heartbeat:', error);
    }
  }

  function stopPresenceHeartbeat() {
    if (presenceTimer) clearInterval(presenceTimer);
    presenceTimer = null;
  }

  function startPresenceHeartbeat() {
    stopPresenceHeartbeat();
    void touchPresence();
    presenceTimer = setInterval(() => {
      if (document.visibilityState === 'visible' && currentUser) void touchPresence();
    }, 60000);
  }

  function stopAdminAutoRefresh() {
    if (adminRefreshTimer) clearInterval(adminRefreshTimer);
    adminRefreshTimer = null;
  }

  function startAdminAutoRefresh() {
    stopAdminAutoRefresh();
    adminRefreshTimer = setInterval(() => {
      if (el.adminDialog.open && adminActiveTab === 'online') void refreshAdminOnline();
    }, 60000);
  }

  function setAdminTab(tab) {
    adminActiveTab = tab === 'online' ? 'online' : 'participants';
    const online = adminActiveTab === 'online';
    el.participantsTabButton.classList.toggle('active', !online);
    el.onlineTabButton.classList.toggle('active', online);
    el.participantsPanel.classList.toggle('hidden', online);
    el.onlinePanel.classList.toggle('hidden', !online);
    if (online) void refreshAdminOnline();
  }

  function participantCard(row) {
    const entered = Boolean(row.first_seen_at);
    const donutSession = row.active_donut_session_until
      ? `<div>Donut-сессия: <strong>до ${esc(formatDateTime(row.active_donut_session_until))}</strong></div>`
      : '';
    const donutCheck = row.last_donut_check_at
      ? `<div>Donut-проверка: <strong>${esc(formatDateTime(row.last_donut_check_at))}${row.last_donut_active === true ? ' · активен' : ''}</strong></div>`
      : '';

    const isSelfAdmin = Boolean(
      currentAccess?.role === 'admin' &&
      row.principal_key === currentPrincipalKey()
    );

    const quickLabel = row.status === 'blocked' ? 'Разблокировать' : 'Блокировать';
    const quickClass = row.status === 'blocked' ? '' : ' danger';

    const adminActions = isSelfAdmin
      ? `
          <button class="admin-mini-button" type="button" data-history="${esc(row.principal_key)}">Входы</button>
          <span class="self-admin-lock" title="Текущий ADMIN защищён от блокировки и изменения собственного доступа">👑 Вы · ADMIN</span>
        `
      : `
          <button class="admin-mini-button" type="button" data-history="${esc(row.principal_key)}">Входы</button>
          <button class="admin-mini-button" type="button" data-edit-access="${esc(row.principal_key)}">Изменить</button>
          <button class="admin-mini-button${quickClass}" type="button" data-quick-status="${esc(row.principal_key)}">${esc(quickLabel)}</button>
        `;

    return `
      <article class="admin-user-card${isSelfAdmin ? ' self-admin-card' : ''}" data-principal="${esc(row.principal_key)}">
        <div class="admin-user-main">
          <div class="admin-user-name" title="${esc(userDisplayName(row))}">${esc(userDisplayName(row))}</div>
          <div class="admin-user-id">${esc(row.principal_key)}</div>
          <div class="admin-user-chips">
            ${accessChip(row.identity_type)}
            ${accessChip(accessSourceLabel(row.access_source))}
            ${accessChip(row.access_level)}
            ${accessChip(row.status)}
            ${isSelfAdmin ? '<span class="admin-chip self">CURRENT ADMIN</span>' : ''}
            ${!entered ? '<span class="admin-chip pending">ЕЩЁ НЕ ВХОДИЛ</span>' : ''}
          </div>
        </div>

        <div class="admin-user-info">
          <div>Первый вход: <strong>${esc(formatDateTime(row.first_seen_at))}</strong></div>
          <div>Последний вход: <strong>${esc(formatDateTime(row.last_seen_at))}</strong></div>
          <div>Входов: <strong>${esc(row.login_count ?? 0)}</strong></div>
        </div>

        <div class="admin-user-info">
          <div>Доступ до: <strong>${esc(row.access_expires_at ? formatDateTime(row.access_expires_at) : 'бессрочно')}</strong></div>
          ${donutCheck}
          ${donutSession}
        </div>

        <div class="admin-user-actions">
          ${adminActions}
        </div>
      </article>
    `;
  }

  function onlineCard(row) {
    return `
      <article class="admin-user-card online-now">
        <div class="admin-user-main">
          <div class="admin-user-name">${esc(userDisplayName(row))}</div>
          <div class="admin-user-id">${esc(row.principal_key)}</div>
          <div class="admin-user-chips">
            ${accessChip(sessionKindLabel(row.session_kind))}
            ${accessChip(accessSourceLabel(row.access_source))}
            ${accessChip(row.access_level)}
            ${accessChip(row.status)}
          </div>
        </div>

        <div class="admin-user-info">
          <div>Сессия началась: <strong>${esc(formatDateTime(row.session_started_at))}</strong></div>
          <div>Последняя активность: <strong>${esc(formatDateTime(row.presence_last_seen_at))}</strong></div>
        </div>

        <div class="admin-user-info">
          <div>Всего входов: <strong>${esc(row.login_count ?? 0)}</strong></div>
          <div>Последний вход: <strong>${esc(formatDateTime(row.last_login_at))}</strong></div>
          ${row.active_donut_session_until ? `<div>Donut до: <strong>${esc(formatDateTime(row.active_donut_session_until))}</strong></div>` : ''}
        </div>

        <div class="admin-user-actions">
          <button class="admin-mini-button" type="button" data-history="${esc(row.principal_key)}">Входы</button>
        </div>
      </article>
    `;
  }

  function bindAdminListActions(root) {
    root.querySelectorAll('[data-edit-access]').forEach(btn => {
      btn.addEventListener('click', () => openAccessEditor(btn.dataset.editAccess));
    });
    root.querySelectorAll('[data-quick-status]').forEach(btn => {
      btn.addEventListener('click', () => quickToggleStatus(btn.dataset.quickStatus));
    });
    root.querySelectorAll('[data-history]').forEach(btn => {
      btn.addEventListener('click', () => openLoginHistory(btn.dataset.history));
    });
  }

  function renderAdminParticipants() {
    el.participantsCountBadge.textContent = String(adminUsers.length);
    el.participantsList.innerHTML = adminUsers.length
      ? adminUsers.map(participantCard).join('')
      : '<div class="admin-empty">В EGE пока нет пользователей.</div>';
    bindAdminListActions(el.participantsList);
  }

  function renderAdminOnline() {
    el.onlineCountBadge.textContent = String(adminOnline.length);
    el.onlineList.innerHTML = adminOnline.length
      ? adminOnline.map(onlineCard).join('')
      : '<div class="admin-empty">Сейчас активных пользователей не видно.</div>';
    bindAdminListActions(el.onlineList);
  }

  async function refreshAdminParticipants() {
    if (currentAccess?.role !== 'admin') return;
    const { data, error } = await supabaseClient.rpc('ege_admin_user_directory');
    if (error) throw error;
    adminUsers = data || [];
    renderAdminParticipants();
  }

  async function refreshAdminOnline() {
    if (currentAccess?.role !== 'admin') return;
    const { data, error } = await supabaseClient.rpc('ege_admin_online_directory', { p_window_minutes: 3 });
    if (error) throw error;
    adminOnline = data || [];
    renderAdminOnline();
  }


  async function refreshAdminDemoStatus() {
    if (currentAccess?.role !== 'admin') return;
    const { data, error } = await supabaseClient.rpc('ege_admin_demo_status');
    if (error) throw error;

    const row = data?.[0] || {};
    runtimeConfig.demo_enabled = Boolean(row.demo_enabled);
    const count = Number(row.demo_units || 0);

    el.adminDemoState.textContent = runtimeConfig.demo_enabled
      ? `Включён · ${count} фиксированных карточек · 4 × 15 разделов`
      : `Выключен · подборка сохранена (${count} карточек)`;

    el.toggleDemoButton.textContent = runtimeConfig.demo_enabled ? 'Выключить DEMO' : 'Включить DEMO';
    el.toggleDemoButton.className = runtimeConfig.demo_enabled ? 'button ghost' : 'button secondary';
  }

  async function toggleDemoEnabled() {
    if (currentAccess?.role !== 'admin') return;
    el.toggleDemoButton.disabled = true;
    try {
      const next = !runtimeConfig.demo_enabled;
      const { data, error } = await supabaseClient.rpc('ege_admin_set_demo_enabled', {
        p_enabled: next
      });
      if (error) throw error;
      runtimeConfig.demo_enabled = Boolean(data);
      await refreshAdminDemoStatus();
      showToast(runtimeConfig.demo_enabled ? '✓ PUBLIC DEMO включён' : 'PUBLIC DEMO выключен');
    } catch (error) {
      console.error(error);
      showToast(error?.message || 'Не удалось изменить DEMO.');
    } finally {
      el.toggleDemoButton.disabled = false;
    }
  }

  function previewPublicDemo() {
    const url = new URL(window.location.href);
    url.searchParams.set('demo','1');
    window.open(url.toString(), '_blank', 'noopener,noreferrer');
  }

  async function refreshAdminPanel() {
    el.refreshAdminButton.disabled = true;
    try {
      await loadRuntimeConfig();
      await Promise.all([refreshAdminParticipants(), refreshAdminOnline(), refreshAdminDemoStatus()]);
    } catch (error) {
      console.error('Admin panel refresh failed:', error);
      showToast('Не удалось обновить ADMIN.');
    } finally {
      el.refreshAdminButton.disabled = false;
    }
  }

  async function openAdminPanel() {
    if (currentAccess?.role !== 'admin') return;
    setAdminTab('participants');
    if (typeof el.adminDialog.showModal === 'function') el.adminDialog.showModal();
    startAdminAutoRefresh();
    await refreshAdminPanel();
  }

  function closeAdminPanel() {
    stopAdminAutoRefresh();
    if (el.adminDialog.open) el.adminDialog.close();
  }

  function openAccessEditor(principalKey) {
    const row = adminUsers.find(x => x.principal_key === principalKey);
    if (!row) return;
    editingPrincipalKey = principalKey;
    el.accessEditorTitle.textContent = userDisplayName(row);
    el.accessEditorMeta.textContent = `${row.principal_key} · ${accessSourceLabel(row.access_source)}`;
    el.accessStatusSelect.value = row.status;
    el.accessLevelSelect.value = row.access_level;
    el.accessExpiryPreset.value = 'keep';
    el.accessCustomDate.value = '';
    el.accessCustomDateLabel.classList.add('hidden');
    el.accessCurrentExpiry.textContent = row.access_expires_at ? formatDateTime(row.access_expires_at) : 'бессрочно';
    if (typeof el.accessEditorDialog.showModal === 'function') el.accessEditorDialog.showModal();
  }

  function resolveEditorExpiry(row) {
    const preset = el.accessExpiryPreset.value;
    if (preset === 'keep') return row.access_expires_at || null;
    if (preset === 'none') return null;
    if (preset === 'custom') {
      if (!el.accessCustomDate.value) throw new Error('Выберите дату окончания доступа.');
      const [y,m,d] = el.accessCustomDate.value.split('-').map(Number);
      return new Date(y,m-1,d,23,59,59,999).toISOString();
    }
    const days = Number(preset);
    if (![1,3,7].includes(days)) throw new Error('Некорректный срок.');
    return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
  }

  async function saveAccessEditor() {
    const row = adminUsers.find(x => x.principal_key === editingPrincipalKey);
    if (!row) return;
    el.saveAccessEditorButton.disabled = true;
    try {
      const expiry = resolveEditorExpiry(row);
      const { error } = await supabaseClient.rpc('ege_admin_set_principal_access', {
        p_principal_key: row.principal_key,
        p_status: el.accessStatusSelect.value,
        p_access_level: el.accessLevelSelect.value,
        p_access_expires_at: expiry,
        p_note: null
      });
      if (error) throw error;
      el.accessEditorDialog.close();
      editingPrincipalKey = null;
      await refreshAdminPanel();
      showToast('✓ Доступ обновлён');
    } catch (error) {
      console.error(error);
      showToast(error?.message || 'Не удалось изменить доступ.');
    } finally {
      el.saveAccessEditorButton.disabled = false;
    }
  }

  async function quickToggleStatus(principalKey) {
    const row = adminUsers.find(x => x.principal_key === principalKey);
    if (!row) return;
    const next = row.status === 'blocked' ? 'active' : 'blocked';
    try {
      const { error } = await supabaseClient.rpc('ege_admin_set_principal_access', {
        p_principal_key: row.principal_key,
        p_status: next,
        p_access_level: row.access_level,
        p_access_expires_at: row.access_expires_at,
        p_note: null
      });
      if (error) throw error;
      await refreshAdminPanel();
      showToast(next === 'blocked' ? 'Пользователь заблокирован' : 'Пользователь разблокирован');
    } catch (error) {
      console.error(error);
      showToast(error?.message || 'Не удалось изменить статус.');
    }
  }

  async function openLoginHistory(principalKey) {
    const row = adminUsers.find(x => x.principal_key === principalKey) ||
                adminOnline.find(x => x.principal_key === principalKey);
    el.historyTitle.textContent = `Входы · ${userDisplayName(row || { principal_key: principalKey })}`;
    el.historyList.innerHTML = '<div class="admin-empty">Загружаю…</div>';
    if (typeof el.historyDialog.showModal === 'function') el.historyDialog.showModal();

    try {
      const { data, error } = await supabaseClient.rpc('ege_admin_login_history', {
        p_principal_key: principalKey,
        p_limit: 100
      });
      if (error) throw error;
      const rows = data || [];
      el.historyList.innerHTML = rows.length
        ? rows.map(x => `
            <div class="history-row">
              <span class="history-method">${esc(x.login_method === 'vk_donut' ? 'VK Donut' : 'Email')}</span>
              <span class="history-time">${esc(formatDateTime(x.created_at))}</span>
            </div>
          `).join('')
        : '<div class="admin-empty">Успешных входов ещё нет.</div>';
    } catch (error) {
      el.historyList.innerHTML = `<div class="admin-empty">${esc(error?.message || 'Ошибка загрузки истории.')}</div>`;
    }
  }

  function updateSourceBadge() {
    const backup = runtimeConfig.content_source === 'yandex_backup';
    el.sourceBadge.textContent = backup ? 'ЯНДЕКС-РЕЗЕРВ' : 'FIPI';
    el.sourceBadge.title = backup
      ? 'Navigator использует резервный источник'
      : 'Navigator открывает официальный источник ФИПИ';

    if (el.adminSourceState) {
      el.adminSourceState.textContent = backup
        ? 'Сейчас: Яндекс-резерв · лёгкие внутренние страницы'
        : 'Сейчас: FIPI · официальный сайт';
      el.useFipiSourceButton?.classList.toggle('active', !backup);
      el.useYandexSourceButton?.classList.toggle('active', backup);
      if (el.useYandexSourceButton) {
        el.useYandexSourceButton.disabled = !runtimeConfig.yandex_backup_ready;
        el.useYandexSourceButton.title = runtimeConfig.yandex_backup_ready
          ? 'Переключить весь EGE Navigator на резерв'
          : 'Резерв ещё не отмечен как готовый';
      }
    }
  }

  async function loadRuntimeConfig() {
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient.rpc('ege_runtime_config');
    if (!error && data?.[0]) {
      runtimeConfig = data[0];
      updateSourceBadge();
    }
  }

  async function fetchAllRows(table, columns, orderColumn = null, filter = null) {
    const result = [];
    let from = 0;
    while (true) {
      let q = supabaseClient.from(table).select(columns).range(from, from + PAGE_SIZE - 1);
      if (filter?.column) q = q.eq(filter.column, filter.value);
      if (orderColumn) q = q.order(orderColumn, { ascending: true });
      const { data, error } = await q;
      if (error) throw error;
      const rows = data || [];
      result.push(...rows);
      if (rows.length < PAGE_SIZE) break;
      from += PAGE_SIZE;
    }
    return result;
  }

  function currentPrincipalKey() {
    if (demoMode && !demoUsesAuth) return null;
    return currentUser ? `auth:${currentUser.id}` : null;
  }


  function loadPublicDemoStatuses() {
    try {
      const raw = JSON.parse(localStorage.getItem(DEMO_STATUS_KEY) || '{}');
      return new Map(Object.entries(raw));
    } catch {
      return new Map();
    }
  }

  function savePublicDemoStatuses() {
    if (!demoMode || demoUsesAuth) return;
    try {
      localStorage.setItem(DEMO_STATUS_KEY, JSON.stringify(Object.fromEntries(itemStatus)));
    } catch {}
  }

  function applyCatalogArrays(u, i, t, l) {
    units = u || [];
    items = i || [];
    topics = t || [];
    unitTopicLinks = l || [];

    topicOverrides = [];
    manualTopicLinks = [];
    overrideByUnit = new Map();
    manualLinksByUnit = new Map();

    media = [];
    unitMediaLinks = [];
    mediaById = new Map();
    mediaLinksByUnit = new Map();

    itemsByUnit = new Map();
    for (const item of items) {
      if (!itemsByUnit.has(item.unit_id)) itemsByUnit.set(item.unit_id, []);
      itemsByUnit.get(item.unit_id).push(item);
    }
    for (const arr of itemsByUnit.values()) {
      arr.sort((a,b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }

    topicById = new Map(topics.map(x => [x.id, x]));
    linksByUnit = new Map();
    for (const link of unitTopicLinks) {
      if (!linksByUnit.has(link.unit_id)) linksByUnit.set(link.unit_id, []);
      linksByUnit.get(link.unit_id).push(link);
    }
  }

  async function loadDemoCatalog() {
    const { data, error } = await supabaseClient.rpc('ege_demo_catalog');
    if (error) throw error;
    if (!data?.enabled) throw new Error('DEMO временно выключен администратором.');

    applyCatalogArrays(
      data.units || [],
      data.items || [],
      data.topics || [],
      data.unit_topics || []
    );

    if (demoUsesAuth && currentUser) {
      const principal = currentPrincipalKey();
      const rows = await fetchAllRows(
        'ege_task_status',
        'principal_key,item_id,status,updated_at',
        'updated_at',
        { column: 'principal_key', value: principal }
      );
      const allowedItems = new Set(items.map(x => x.id));
      itemStatus = new Map(
        rows.filter(x => allowedItems.has(x.item_id)).map(x => [x.item_id, x.status])
      );
    } else {
      itemStatus = loadPublicDemoStatuses();
    }

    el.unitCount.textContent = String(units.length);
    el.itemCount.textContent = String(items.length);

    populateTopics();
    populateSubtopics();
    render(true);
  }

  async function loadCatalog() {
    const principal = currentPrincipalKey();

    const [u, i, t, l, s, o, m, mm, uml] = await Promise.all([
      fetchAllRows(
        'ege_units',
        'id,unit_key,title,exam_bucket,parent_zid,official_fipi_url,items_total,shared_context',
        'exam_bucket'
      ),
      fetchAllRows(
        'ege_items',
        'id,unit_id,card_key,fipi_id,display_label,group_position,live_kes_code,item_text,item_tables,sort_order',
        'sort_order'
      ),
      fetchAllRows(
        'ege_topics',
        'id,parent_id,level,slug,label,official_code,sort_order,is_active',
        'sort_order'
      ),
      fetchAllRows(
        'ege_unit_topics',
        'unit_id,topic_id,source,confidence,is_primary,note',
        'unit_id'
      ),
      principal
        ? fetchAllRows(
            'ege_task_status',
            'principal_key,item_id,status,updated_at',
            'updated_at',
            { column: 'principal_key', value: principal }
          )
        : Promise.resolve([]),
      fetchAllRows(
        'ege_unit_topic_overrides',
        'unit_id,mode,note,updated_at,updated_by',
        'unit_id'
      ),
      fetchAllRows(
        'ege_unit_topic_manual',
        'unit_id,topic_id,updated_at,updated_by',
        'unit_id'
      ),
      fetchAllRows(
        'ege_media',
        'media_id,kind,extension,official_url,backup_path,backup_ready,integrity_status,content_type,note',
        'media_id'
      ),
      fetchAllRows(
        'ege_unit_media',
        'unit_id,media_id,sort_order',
        'unit_id'
      )
    ]);

    units = u;
    items = i;
    topics = t;
    unitTopicLinks = l;
    topicOverrides = o;
    manualTopicLinks = m;
    media = mm;
    unitMediaLinks = uml;

    mediaById = new Map(media.map(x => [x.media_id, x]));
    mediaLinksByUnit = new Map();
    for (const link of unitMediaLinks) {
      if (!mediaLinksByUnit.has(link.unit_id)) mediaLinksByUnit.set(link.unit_id, []);
      mediaLinksByUnit.get(link.unit_id).push(link);
    }
    for (const links of mediaLinksByUnit.values()) {
      links.sort((a,b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }

    itemsByUnit = new Map();
    for (const item of items) {
      if (!itemsByUnit.has(item.unit_id)) itemsByUnit.set(item.unit_id, []);
      itemsByUnit.get(item.unit_id).push(item);
    }
    for (const arr of itemsByUnit.values()) {
      arr.sort((a,b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }

    topicById = new Map(topics.map(x => [x.id, x]));
    linksByUnit = new Map();
    for (const link of unitTopicLinks) {
      if (!linksByUnit.has(link.unit_id)) linksByUnit.set(link.unit_id, []);
      linksByUnit.get(link.unit_id).push(link);
    }

    rebuildManualTopicMaps();

    itemStatus = new Map(s.map(row => [row.item_id, row.status]));

    el.unitCount.textContent = String(units.length);
    el.itemCount.textContent = String(items.length);

    populateTopics();
    populateSubtopics();
    render(true);
  }

  function topTopics() {
    return topics
      .filter(x => x.level === 'topic' && x.is_active)
      .sort((a,b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }

  function subtopicsForSelect() {
    const topicId = el.topicSelect.value || 'all';
    return topics
      .filter(x =>
        x.level === 'subtopic' &&
        x.is_active &&
        (topicId === 'all' || x.parent_id === topicId)
      )
      .sort((a,b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
  }

  function populateTopics() {
    const keep = el.topicSelect.value || 'all';
    el.topicSelect.innerHTML =
      '<option value="all">Все темы</option>' +
      topTopics().map(t => `<option value="${esc(t.id)}">${esc(t.label)}</option>`).join('');

    if ([...el.topicSelect.options].some(o => o.value === keep)) el.topicSelect.value = keep;
    else el.topicSelect.value = 'all';
  }

  function populateSubtopics() {
    const keep = el.subtopicSelect.value || 'all';
    const topicId = el.topicSelect.value || 'all';
    const subs = subtopicsForSelect();

    const options = subs.map(s => {
      let label = s.label;
      if (topicId === 'all' && s.parent_id) {
        const parent = topicById.get(s.parent_id);
        if (parent) label = `${parent.label} — ${s.label}`;
      }
      return `<option value="${esc(s.id)}">${esc(label)}</option>`;
    }).join('');

    el.subtopicSelect.innerHTML = `<option value="all">Все подтемы</option>${options}`;

    if ([...el.subtopicSelect.options].some(o => o.value === keep)) el.subtopicSelect.value = keep;
    else el.subtopicSelect.value = 'all';
  }

  function populateBuckets() {
    el.bucketSelect.innerHTML =
      '<option value="all">Все 15 разделов</option>' +
      BUCKETS.map(b => `<option value="${esc(b.id)}">${esc(b.label)}</option>`).join('');
  }


  function rebuildManualTopicMaps() {
    overrideByUnit = new Map(topicOverrides.map(x => [x.unit_id, x]));
    manualLinksByUnit = new Map();
    for (const link of manualTopicLinks) {
      if (!manualLinksByUnit.has(link.unit_id)) manualLinksByUnit.set(link.unit_id, []);
      manualLinksByUnit.get(link.unit_id).push(link);
    }
  }

  async function refreshManualTopicData() {
    const [o, m] = await Promise.all([
      fetchAllRows(
        'ege_unit_topic_overrides',
        'unit_id,mode,note,updated_at,updated_by',
        'unit_id'
      ),
      fetchAllRows(
        'ege_unit_topic_manual',
        'unit_id,topic_id,updated_at,updated_by',
        'unit_id'
      ),
      fetchAllRows(
        'ege_media',
        'media_id,kind,extension,official_url,backup_path,backup_ready,integrity_status,content_type,note',
        'media_id'
      ),
      fetchAllRows(
        'ege_unit_media',
        'unit_id,media_id,sort_order',
        'unit_id'
      )
    ]);
    topicOverrides = o;
    manualTopicLinks = m;
    rebuildManualTopicMaps();
  }

  function baseUnitTopicRecords(unitId) {
    return (linksByUnit.get(unitId) || [])
      .map(link => ({ link, topic: topicById.get(link.topic_id), origin: 'base' }))
      .filter(x => x.topic);
  }

  function manualUnitTopicRecords(unitId) {
    return (manualLinksByUnit.get(unitId) || [])
      .map(link => ({ link, topic: topicById.get(link.topic_id), origin: 'manual' }))
      .filter(x => x.topic);
  }

  function effectiveUnitTopicRecords(unitId) {
    const base = baseUnitTopicRecords(unitId);
    const override = overrideByUnit.get(unitId);
    if (!override) return base;

    const manual = manualUnitTopicRecords(unitId);
    const merged = override.mode === 'replace' ? manual : [...base, ...manual];
    const seen = new Set();
    return merged.filter(x => {
      if (seen.has(x.topic.id)) return false;
      seen.add(x.topic.id);
      return true;
    });
  }

  function hasTopicOverride(unitId) {
    return overrideByUnit.has(unitId);
  }

  function unitTopicRecords(unitId) {
    return effectiveUnitTopicRecords(unitId);
  }

  function unitTopicIdSet(unitId) {
    return new Set(effectiveUnitTopicRecords(unitId).map(x => x.topic.id));
  }

  function statusRank(status) {
    return status === 'used' ? 2 : status === 'viewed' ? 1 : 0;
  }

  function unitStatus(unit) {
    const arr = itemsByUnit.get(unit.id) || [];
    let best = 'new';
    for (const item of arr) {
      const status = itemStatus.get(item.id) || 'new';
      if (statusRank(status) > statusRank(best)) best = status;
    }
    return best;
  }

  function nextStatus(status) {
    if (status === 'new') return 'viewed';
    if (status === 'viewed') return 'used';
    return 'new';
  }

  function topicMatches(unit, topicId, subtopicId) {
    if (topicId === 'all' && subtopicId === 'all') return true;
    const ids = unitTopicIdSet(unit.id);
    const topMatch = topicId === 'all' || ids.has(topicId);
    const subMatch = subtopicId === 'all' || ids.has(subtopicId);
    return topMatch && subMatch;
  }

  function unitSearchText(unit) {
    const arr = itemsByUnit.get(unit.id) || [];
    const topicLabels = unitTopicRecords(unit.id).flatMap(({ topic }) => [
      topic.label, topic.slug, topic.official_code || ''
    ]);
    return [
      unit.title,
      unit.unit_key,
      unit.parent_zid,
      ...arr.flatMap(x => [x.fipi_id, x.live_kes_code, x.display_label, x.item_text]),
      ...topicLabels
    ].filter(Boolean).join(' ').toLowerCase();
  }

  function filteredUnits() {
    const topicId = el.topicSelect.value || 'all';
    const subtopicId = el.subtopicSelect.value || 'all';
    const bucketId = el.bucketSelect.value || 'all';
    const status = el.statusSelect.value || 'all';
    const query = el.searchInput.value.trim().toLowerCase();

    return units.filter(unit => {
      if (bucketId !== 'all' && unit.exam_bucket !== bucketId) return false;
      if (!topicMatches(unit, topicId, subtopicId)) return false;
      if (status !== 'all' && unitStatus(unit) !== status) return false;
      if (query && !unitSearchText(unit).includes(query)) return false;
      return true;
    });
  }

  function visibleBuckets() {
    const bucketId = el.bucketSelect.value || 'all';
    return bucketId === 'all'
      ? BUCKETS
      : BUCKETS.filter(x => x.id === bucketId);
  }

  function unitReference(unit) {
    if (unit.parent_zid) return `FIPI GROUP ${unit.parent_zid}`;
    const first = (itemsByUnit.get(unit.id) || [])[0];
    return first?.fipi_id ? `FIPI ${first.fipi_id}` : unit.unit_key;
  }

  function unitTitle(unit) {
    const raw = String(unit.title || '').trim();
    if (raw) return raw;
    return BUCKET_MAP.get(unit.exam_bucket)?.label || unit.exam_bucket;
  }

  function unitKes(unit) {
    const unique = [...new Set(
      (itemsByUnit.get(unit.id) || [])
        .map(x => String(x.live_kes_code || '').trim())
        .filter(Boolean)
    )];
    if (!unique.length) return 'КЭС —';
    const visible = unique.slice(0, 3).join(' · ');
    return `КЭС ${visible}${unique.length > 3 ? ` · +${unique.length - 3}` : ''}`;
  }

  function cardTags(unit) {
    const records = unitTopicRecords(unit.id);
    const selectedTopic = el.topicSelect.value || 'all';
    const selectedSubtopic = el.subtopicSelect.value || 'all';

    let chosen = records.filter(({ topic }) => {
      if (selectedSubtopic !== 'all' && topic.id === selectedSubtopic) return true;
      if (selectedTopic !== 'all' && (topic.id === selectedTopic || topic.parent_id === selectedTopic)) return true;
      return false;
    });
    if (!chosen.length) chosen = records;

    chosen.sort((a,b) => {
      const pa = a.topic.level === 'subtopic' ? 1 : 0;
      const pb = b.topic.level === 'subtopic' ? 1 : 0;
      if (pa !== pb) return pb - pa;
      if (Boolean(a.link.is_primary) !== Boolean(b.link.is_primary)) return a.link.is_primary ? -1 : 1;
      return (a.topic.sort_order ?? 0) - (b.topic.sort_order ?? 0);
    });

    const seen = new Set();
    const tags = [];
    for (const { topic } of chosen) {
      if (seen.has(topic.id)) continue;
      seen.add(topic.id);
      if (topic.level === 'subtopic' && topic.label === 'Общее') continue;
      tags.push(topic);
      if (tags.length >= 3) break;
    }

    return tags.map(topic => `
      <span class="topic-tag${topic.level === 'subtopic' ? ' subtopic' : ''}"
            title="${esc(topic.level === 'subtopic' ? 'Подтема' : 'Тема')}">
        ${esc(topic.label)}
      </span>
    `).join('');
  }

  function countLabel(n) {
    if (n === 1) return '1 задание';
    if (n >= 2 && n <= 4) return `${n} задания`;
    return `${n} заданий`;
  }

  function unitCard(unit) {
    const arr = itemsByUnit.get(unit.id) || [];
    const status = unitStatus(unit);
    const sm = STATUS_META[status];
    return `
      <article class="unit-card status-${esc(status)}"
               tabindex="0"
               role="button"
               data-open-unit="${esc(unit.id)}"
               aria-label="Открыть ${esc(unitReference(unit))}">
        <div class="card-top">
          <span class="fipi-ref" title="${esc(unit.unit_key)}">${esc(unitReference(unit))}</span>
          <span class="card-top-actions">
            ${hasTopicOverride(unit.id) ? '<span class="manual-override-marker" title="Есть ручная тематическая правка">ручная</span>' : ''}
            <span class="unit-count-badge">${esc(countLabel(arr.length))}</span>
            ${currentAccess?.role === 'admin'
              ? `<button class="topic-edit-button" type="button" data-edit-topic="${esc(unit.id)}" title="Изменить темы и подтемы">✎</button>`
              : ''}
          </span>
        </div>
        <h4>${esc(unitTitle(unit))}</h4>
        <div class="kes-line">${esc(unitKes(unit))}</div>
        <div class="topic-tags">${cardTags(unit)}</div>
        <div class="card-footer">
          <button class="status-button"
                  type="button"
                  data-status-unit="${esc(unit.id)}"
                  data-status="${esc(status)}"
                  title="Нажмите, чтобы изменить статус">
            ${esc(sm.icon)} ${esc(sm.label)}
          </button>
          <span class="open-hint">ОТКРЫТЬ ↗</span>
        </div>
      </article>
    `;
  }

  function selectionLabel() {
    const topicId = el.topicSelect.value || 'all';
    const subtopicId = el.subtopicSelect.value || 'all';
    const bucketId = el.bucketSelect.value || 'all';
    const status = el.statusSelect.value || 'all';

    const parts = [];
    const topic = topicById.get(topicId);
    const sub = topicById.get(subtopicId);
    if (topic) parts.push(topic.label);
    else parts.push('Все темы');
    if (sub) parts.push(sub.label);
    if (bucketId !== 'all') parts.push(BUCKET_MAP.get(bucketId)?.short || bucketId);
    if (status !== 'all') parts.push(STATUS_META[status]?.label || status);
    if (el.searchInput.value.trim()) parts.push(`«${el.searchInput.value.trim()}»`);
    return parts.join(' · ');
  }

  function render(resetScroll = false) {
    const oldLeft = el.matrixViewport.scrollLeft;
    const oldTop = el.matrixViewport.scrollTop;

    const filtered = filteredUnits();
    const visible = visibleBuckets();
    const grouped = new Map(visible.map(b => [b.id, []]));

    for (const unit of filtered) {
      if (grouped.has(unit.exam_bucket)) grouped.get(unit.exam_bucket).push(unit);
    }

    for (const arr of grouped.values()) {
      arr.sort((a,b) => {
        const aa = (itemsByUnit.get(a.id) || [])[0]?.fipi_id || a.unit_key;
        const bb = (itemsByUnit.get(b.id) || [])[0]?.fipi_id || b.unit_key;
        return String(aa).localeCompare(String(bb), 'ru', { numeric: true, sensitivity: 'base' });
      });
    }

    el.matrixTrack.style.setProperty('--matrix-cols', String(Math.max(1, visible.length)));
    el.matrixTrack.innerHTML = visible.map(bucket => {
      const arr = grouped.get(bucket.id) || [];
      return `
        <section class="bucket-column" data-bucket="${esc(bucket.id)}">
          <header class="bucket-header">
            <span class="bucket-kicker">${esc(bucket.group)}</span>
            <h3>${esc(bucket.short)}</h3>
            <div class="bucket-count">${arr.length} ${arr.length === 1 ? 'карточка' : 'карточек'}</div>
          </header>
          <div class="card-stack">
            ${arr.length
              ? arr.map(unitCard).join('')
              : '<div class="column-empty">По текущему фильтру заданий нет</div>'}
          </div>
        </section>
      `;
    }).join('');

    const itemCount = filtered.reduce((sum, unit) => sum + (itemsByUnit.get(unit.id)?.length || 0), 0);
    el.visibleCount.textContent = String(filtered.length);
    el.currentSelection.innerHTML = `<strong>Сейчас:</strong> ${esc(selectionLabel())}`;
    el.sectionMeta.textContent = `${filtered.length} карточек · ${itemCount} позиций`;
    el.emptyState.classList.toggle('hidden', filtered.length !== 0);

    bindMatrixEvents();

    if (resetScroll) {
      el.matrixViewport.scrollTo({ left: 0, top: 0, behavior: 'auto' });
    } else {
      el.matrixViewport.scrollLeft = oldLeft;
      el.matrixViewport.scrollTop = oldTop;
    }
  }

  function bindMatrixEvents() {
    el.matrixTrack.querySelectorAll('[data-open-unit]').forEach(card => {
      card.addEventListener('click', e => {
        if (e.target.closest('[data-status-unit]')) return;
        const unit = units.find(x => x.id === card.dataset.openUnit);
        if (unit) openUnit(unit);
      });
      card.addEventListener('keydown', e => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        if (e.target.closest('[data-status-unit]')) return;
        e.preventDefault();
        const unit = units.find(x => x.id === card.dataset.openUnit);
        if (unit) openUnit(unit);
      });
    });

    el.matrixTrack.querySelectorAll('[data-edit-topic]').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        openTopicEditor(btn.dataset.editTopic);
      });
    });

    el.matrixTrack.querySelectorAll('[data-status-unit]').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const unit = units.find(x => x.id === btn.dataset.statusUnit);
        if (!unit) return;
        const next = nextStatus(unitStatus(unit));
        await setUnitStatus(unit, next);
      });
    });
  }


  function topicPairsFromRecords(records) {
    const ids = new Set(records.map(x => x.topic.id));
    const rows = [];
    const topRecords = records.filter(x => x.topic.level === 'topic')
      .sort((a,b) => (a.topic.sort_order ?? 0) - (b.topic.sort_order ?? 0));

    for (const top of topRecords) {
      const children = records
        .filter(x => x.topic.level === 'subtopic' && x.topic.parent_id === top.topic.id)
        .sort((a,b) => (a.topic.sort_order ?? 0) - (b.topic.sort_order ?? 0));
      if (children.length) {
        for (const child of children) {
          rows.push({ top: top.topic, sub: child.topic });
        }
      } else {
        rows.push({ top: top.topic, sub: null });
      }
    }

    const orphans = records
      .filter(x => x.topic.level === 'subtopic' && !x.topic.parent_id)
      .sort((a,b) => (a.topic.sort_order ?? 0) - (b.topic.sort_order ?? 0));
    for (const orphan of orphans) rows.push({ top: null, sub: orphan.topic });

    // If data is unusual (child without parent link in the record set), still show it.
    const childIdsAlready = new Set(rows.filter(x => x.sub).map(x => x.sub.id));
    for (const rec of records.filter(x => x.topic.level === 'subtopic' && x.topic.parent_id)) {
      if (!childIdsAlready.has(rec.topic.id)) {
        rows.push({ top: topicById.get(rec.topic.parent_id) || null, sub: rec.topic });
      }
    }
    return rows;
  }

  function renderBaseTopicChips(unitId) {
    const pairs = topicPairsFromRecords(baseUnitTopicRecords(unitId));
    el.baseTopicChips.innerHTML = pairs.length
      ? pairs.map(pair => `
          <span class="base-topic-chip">
            ${esc(pair.top ? pair.top.label : 'Без верхней темы')}
            ${pair.sub ? ` · ${esc(pair.sub.label)}` : ''}
          </span>
        `).join('')
      : '<span class="base-topic-chip empty">Базовой тематической разметки нет</span>';
  }

  function topTopicOptions(selected = '') {
    const tops = topTopics();
    const orphanExists = topics.some(x => x.level === 'subtopic' && x.is_active && !x.parent_id);
    return [
      '<option value="">Выберите тему</option>',
      ...tops.map(t => `<option value="${esc(t.id)}"${t.id === selected ? ' selected' : ''}>${esc(t.label)}</option>`),
      ...(orphanExists
        ? [`<option value="__orphan__"${selected === '__orphan__' ? ' selected' : ''}>Без верхней темы · отдельная подтема</option>`]
        : [])
    ].join('');
  }

  function subtopicOptionsForManual(topicValue, selected = '') {
    let subs = [];
    if (topicValue === '__orphan__') {
      subs = topics.filter(x => x.level === 'subtopic' && x.is_active && !x.parent_id);
    } else if (topicValue) {
      subs = topics.filter(x => x.level === 'subtopic' && x.is_active && x.parent_id === topicValue);
    }

    subs.sort((a,b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

    const firstLabel = topicValue === '__orphan__' ? 'Выберите отдельную подтему' : 'Без подтемы';
    return `<option value="">${esc(firstLabel)}</option>` +
      subs.map(s => `<option value="${esc(s.id)}"${s.id === selected ? ' selected' : ''}>${esc(s.label)}</option>`).join('');
  }

  function makeManualTopicRow(pair = null) {
    const row = document.createElement('div');
    row.className = 'manual-topic-row';

    let topValue = '';
    let subValue = '';
    if (pair?.top) topValue = pair.top.id;
    if (!pair?.top && pair?.sub) topValue = '__orphan__';
    if (pair?.sub) subValue = pair.sub.id;

    row.innerHTML = `
      <select class="manual-topic-select" aria-label="Тема">
        ${topTopicOptions(topValue)}
      </select>
      <select class="manual-subtopic-select" aria-label="Подтема" ${topValue ? '' : 'disabled'}>
        ${subtopicOptionsForManual(topValue, subValue)}
      </select>
      <button class="remove-manual-row" type="button" title="Удалить эту тему">×</button>
    `;

    const topicSelect = row.querySelector('.manual-topic-select');
    const subSelect = row.querySelector('.manual-subtopic-select');
    const removeButton = row.querySelector('.remove-manual-row');

    topicSelect.addEventListener('change', () => {
      const value = topicSelect.value;
      subSelect.disabled = !value;
      subSelect.innerHTML = subtopicOptionsForManual(value, '');
    });
    removeButton.addEventListener('click', () => {
      row.remove();
      if (!el.manualTopicRows.children.length) el.manualTopicRows.appendChild(makeManualTopicRow());
    });

    return row;
  }

  function manualPairsForUnit(unitId) {
    const records = manualUnitTopicRecords(unitId);
    return topicPairsFromRecords(records);
  }

  function openTopicEditor(unitId) {
    if (currentAccess?.role !== 'admin') return;
    const unit = units.find(x => x.id === unitId);
    if (!unit) return;

    editingTopicUnitId = unitId;
    el.topicEditorTitle.textContent = `Темы задания ${unitReference(unit).replace(/^FIPI (GROUP )?/,'')}`;
    renderBaseTopicChips(unitId);

    const override = overrideByUnit.get(unitId);
    el.topicOverrideMode.value = override?.mode || 'add';
    el.topicAdminNote.value = override?.note || '';

    el.manualTopicRows.innerHTML = '';
    const pairs = manualPairsForUnit(unitId);
    if (pairs.length) {
      for (const pair of pairs) el.manualTopicRows.appendChild(makeManualTopicRow(pair));
    } else {
      el.manualTopicRows.appendChild(makeManualTopicRow());
    }

    el.resetTopicOverrideButton.disabled = !override;
    if (typeof el.topicEditorDialog.showModal === 'function') el.topicEditorDialog.showModal();
  }

  function collectManualTopicIds() {
    const ids = new Set();

    for (const row of el.manualTopicRows.querySelectorAll('.manual-topic-row')) {
      const topValue = row.querySelector('.manual-topic-select').value;
      const subValue = row.querySelector('.manual-subtopic-select').value;

      if (!topValue) continue;

      if (topValue === '__orphan__') {
        if (!subValue) throw new Error('Для «Без верхней темы» выберите отдельную подтему.');
        ids.add(subValue);
        continue;
      }

      ids.add(topValue);
      if (subValue) ids.add(subValue);
    }

    return [...ids];
  }

  async function saveTopicOverride() {
    if (currentAccess?.role !== 'admin' || !editingTopicUnitId) return;

    el.saveTopicOverrideButton.disabled = true;
    try {
      const topicIds = collectManualTopicIds();
      if (!topicIds.length) throw new Error('Добавьте хотя бы одну тему или подтему.');

      const { error } = await supabaseClient.rpc('ege_admin_save_topic_override', {
        p_unit_id: editingTopicUnitId,
        p_mode: el.topicOverrideMode.value,
        p_topic_ids: topicIds,
        p_note: el.topicAdminNote.value.trim() || null
      });
      if (error) throw error;

      await refreshManualTopicData();
      el.topicEditorDialog.close();
      editingTopicUnitId = null;
      render(false);
      showToast('✓ Ручная тематическая правка сохранена');
    } catch (error) {
      console.error(error);
      showToast(error?.message || 'Не удалось сохранить разметку.');
    } finally {
      el.saveTopicOverrideButton.disabled = false;
    }
  }

  async function resetTopicOverride() {
    if (currentAccess?.role !== 'admin' || !editingTopicUnitId) return;
    const unitId = editingTopicUnitId;

    el.resetTopicOverrideButton.disabled = true;
    try {
      const { error } = await supabaseClient.rpc('ege_admin_reset_topic_override', {
        p_unit_id: unitId
      });
      if (error) throw error;

      await refreshManualTopicData();
      el.topicEditorDialog.close();
      editingTopicUnitId = null;
      render(false);
      showToast('Ручная правка сброшена · восстановлена базовая разметка');
    } catch (error) {
      console.error(error);
      showToast(error?.message || 'Не удалось сбросить ручную правку.');
    } finally {
      el.resetTopicOverrideButton.disabled = false;
    }
  }


  async function setContentSource(source) {
    if (currentAccess?.role !== 'admin') return;
    if (!['fipi','yandex_backup'].includes(source)) return;

    if (source === 'yandex_backup' && !runtimeConfig.yandex_backup_ready) {
      showToast('Яндекс-резерв ещё не отмечен как готовый');
      return;
    }

    const current = runtimeConfig.content_source;
    if (current === source) return;

    const label = source === 'yandex_backup' ? 'Яндекс-резерв' : 'FIPI';
    const button = source === 'yandex_backup' ? el.useYandexSourceButton : el.useFipiSourceButton;
    if (button) button.disabled = true;

    try {
      const { data, error } = await supabaseClient.rpc('ege_admin_set_content_source', {
        p_source: source
      });
      if (error) throw error;

      runtimeConfig.content_source = data || source;
      updateSourceBadge();
      showToast(`✓ Источник переключён: ${label}`);
    } catch (error) {
      console.error('Source switch failed:', error);
      showToast(error?.message || 'Не удалось переключить источник.');
    } finally {
      updateSourceBadge();
    }
  }

  function revokeBackupObjectUrls() {
    for (const url of activeBackupObjectUrls) {
      try { URL.revokeObjectURL(url); } catch {}
    }
    activeBackupObjectUrls = [];
  }

  function backupMediaForUnit(unitId) {
    return (mediaLinksByUnit.get(unitId) || [])
      .map(link => ({ link, media: mediaById.get(link.media_id) }))
      .filter(x => x.media);
  }

  function backupTextClean(value) {
    return String(value ?? '')
      .replace(/ShowPictureQ\w*\([^)]*\);?/giu, ' ')
      .replace(/\bi\s+Номер:\s*[A-Z0-9]+(?:\s+\d+\s*\([A-Z0-9]+\))?\s+Статус задания:\s*НЕ РЕШЕНО\b/giu, ' ')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function readableJson(value, depth = 0) {
    if (value === null || value === undefined || value === '') return [];
    if (typeof value === 'string') {
      const text = value.trim();
      if (!text) return [];
      try { return readableJson(JSON.parse(text), depth); }
      catch { return [backupTextClean(text)].filter(Boolean); }
    }
    if (Array.isArray(value)) {
      const out = [];
      for (const item of value) out.push(...readableJson(item, depth + 1));
      return [...new Set(out.filter(Boolean))];
    }
    if (typeof value === 'object') {
      if (Array.isArray(value.paragraphs)) return readableJson(value.paragraphs, depth + 1);
      if (typeof value.plain_text === 'string' && value.plain_text.trim()) {
        return value.plain_text.split(/\n{2,}/).map(backupTextClean).filter(Boolean);
      }
      const out = [];
      for (const [key, val] of Object.entries(value)) {
        if (['format','plain_text'].includes(key)) continue;
        out.push(...readableJson(val, depth + 1));
      }
      return [...new Set(out.filter(Boolean))];
    }
    return [String(value)];
  }

  function looksLikeInstruction(text) {
    const t = backupTextClean(text);
    if (!t || t.length > 1300) return false;
    return /^(?:Прочитайте|Прослушайте|Вы услышите|Установите|Определите|Выберите|Впишите|Запишите|Дайте|В заданиях|Выполните|Imagine\b|Task\s*\d+\b|You (?:have|are|will)\b)/iu.test(t);
  }

  function splitItemInstruction(item, unit) {
    let text = backupTextClean(item?.item_text || '');
    text = text.replace(/^Задание\s*№\s*\d+\.\s*/iu, '').trim();
    if (!text) return { instruction: '', body: '' };

    if (unit?.exam_bucket === 'listening_1') {
      // FIPI often stores a short generic lead followed by the complete listening instruction.
      // Keep the whole instruction block together and leave the statements for the structured table.
      const m = text.match(/^(.*?Занесите свои ответы в таблицу\.)\s*/isu);
      if (m) return { instruction: backupTextClean(m[1]), body: backupTextClean(text.slice(m[0].length)) };
    }

    if (unit?.exam_bucket === 'reading_10') {
      const m = text.match(/^(.*?В задании один заголовок лишний\.)\s*/isu);
      if (m) return { instruction: backupTextClean(m[1]), body: backupTextClean(text.slice(m[0].length)) };
    }

    const leadPatterns = [
      /^Установите соответствие и впишите ответ\.\s*/iu,
      /^Дайте развернутый ответ\.\s*/iu,
      /^Выберите правильный ответ\.\s*/iu,
      /^Впишите правильный ответ\.\s*/iu,
      /^Запишите правильный ответ\.\s*/iu,
    ];
    for (const re of leadPatterns) {
      const m = text.match(re);
      if (m) return { instruction: backupTextClean(m[0]), body: backupTextClean(text.slice(m[0].length)) };
    }

    const firstSentence = text.match(/^(.{1,650}?[.!?])\s+(?=[A-ZА-ЯЁ0-9«“])/u);
    if (firstSentence && looksLikeInstruction(firstSentence[1])) {
      return { instruction: backupTextClean(firstSentence[1]), body: backupTextClean(text.slice(firstSentence[0].length)) };
    }
    return { instruction: '', body: text };
  }

  function unitViewerModel(unit) {
    const arr = (itemsByUnit.get(unit.id) || []).slice().sort((a,b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const shared = readableJson(unit.shared_context);
    const sharedInstruction = [];
    const sharedContext = [];
    for (const part of shared) (looksLikeInstruction(part) ? sharedInstruction : sharedContext).push(part);

    const itemModels = arr.map(item => ({ item, ...splitItemInstruction(item, unit) }));
    const instructionParts = [...sharedInstruction];
    for (const row of itemModels) {
      if (row.instruction && !instructionParts.some(x => x === row.instruction)) instructionParts.push(row.instruction);
    }

    // For a single-card unit the remaining item body is the main task material.
    // For grouped units every remaining body stays with its own subtask.
    const singleContext = itemModels.length === 1 && itemModels[0].body ? [itemModels[0].body] : [];
    return {
      items: itemModels,
      instruction: [...new Set(instructionParts)].join('\n\n'),
      context: [...new Set([...sharedContext, ...singleContext].filter(Boolean))]
    };
  }

  function renderInstructionSection(model) {
    if (!model.instruction) return '';
    return `
      <section class="backup-learning-section backup-instruction-section">
        <span class="backup-block-label">ИНСТРУКЦИЯ</span>
        <div class="backup-readable-text backup-instruction-text">${esc(model.instruction)}</div>
      </section>
    `;
  }

  function hasStructuredItemTable(model) {
    return model.items.some(({ item }) => structuredTableRows(item?.item_tables).length > 0);
  }

  function shouldSuppressLegacyContext(unit, model) {
    if (!model.context.length || !hasStructuredItemTable(model)) return false;
    // These FIPI buckets import one legacy merged text blob AND a clean structured table.
    // Showing both duplicates the same exercise. Prefer the structured representation.
    return ['reading_10', 'listening_1'].includes(unit?.exam_bucket);
  }

  function renderContextSection(unit, model) {
    if (!model.context.length || shouldSuppressLegacyContext(unit, model)) return '';
    return `
      <section class="backup-learning-section backup-context-card">
        <span class="backup-block-label">МАТЕРИАЛ ЗАДАНИЯ</span>
        <div class="backup-readable-text backup-context-text">${model.context.map(x => esc(x)).join('\n\n')}</div>
      </section>
    `;
  }

  function tableLeafRows(value, out = []) {
    if (!Array.isArray(value)) return out;
    const scalar = value.every(cell => !Array.isArray(cell) && (cell === null || ['string','number','boolean'].includes(typeof cell)));
    if (scalar) {
      const cells = value.map(x => backupTextClean(x)).filter(Boolean);
      if (cells.length) out.push(cells);
      return out;
    }
    for (const part of value) tableLeafRows(part, out);
    return out;
  }

  function structuredTableRows(value) {
    const rows = tableLeafRows(value);
    const seen = new Set();
    const clean = [];
    for (const cells of rows) {
      if (cells.some(c => /^КЭС:|^Тип ответа:/iu.test(c))) continue;
      if (cells.some(c => /ShowPictureQ/iu.test(c))) continue;
      const normalized = cells.join(' | ').replace(/\s+/g,' ').trim();
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      // One-cell rows are usually duplicates of the visible task text, not a table.
      if (cells.length < 2) continue;

      // Some FIPI imports repeat the complete instruction in both columns of the first row.
      // The instruction is already rendered above, so this row must not appear in the options table.
      const normalizedCells = cells.map(cell => cell.replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru-RU'));
      const uniqueCells = [...new Set(normalizedCells)];
      if (uniqueCells.length === 1 && looksLikeInstruction(cells[0])) continue;
      if (cells.every(cell => looksLikeInstruction(cell))) continue;

      clean.push(cells);
    }
    // Prefer concise rows: imported FIPI tables often contain one giant duplicate row
    // followed by the actual two-column rows we need.
    const concise = clean.filter(cells => cells.length <= 5 && cells.join(' ').length <= 1200);
    return (concise.length ? concise : clean).slice(0, 40);
  }

  function renderItemTables(value) {
    const rows = structuredTableRows(value);
    if (!rows.length) return '';
    const width = Math.max(...rows.map(r => r.length));
    return `
      <div class="backup-table-wrap">
        <table class="backup-task-table">
          <tbody>
            ${rows.map(row => `<tr>${row.map(cell => `<td${row.length < width ? ` colspan="${width - row.length + 1}"` : ''}>${esc(cell)}</td>`).join('')}</tr>`).join('')}
          </tbody>
        </table>
      </div>
    `;
  }

  function renderAnswerSheet(unit) {
    let labels = [];
    let rowLabel = 'Задание';

    if (unit?.exam_bucket === 'reading_10') {
      labels = ['A','B','C','D','E','F','G'];
      rowLabel = 'Текст';
    } else if (unit?.exam_bucket === 'listening_1') {
      labels = ['A','B','C','D','E','F'];
      rowLabel = 'Говорящий';
    } else {
      return '';
    }

    return `
      <section class="backup-learning-section backup-answer-section">
        <span class="backup-block-label">ТАБЛИЦА ОТВЕТОВ</span>
        <div class="backup-answer-wrap">
          <table class="backup-answer-table" aria-label="Таблица ответов">
            <tbody>
              <tr>
                <th>${esc(rowLabel)}</th>
                ${labels.map(label => `<th>${esc(label)}</th>`).join('')}
              </tr>
              <tr class="backup-answer-entry-row">
                <th>Ответ</th>
                ${labels.map(() => '<td>&nbsp;</td>').join('')}
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function renderBackupItems(unit, model) {
    if (!model.items.length) return '';

    // A single item already appears above as the main context. Here we only keep
    // genuinely structured variants/table data underneath it.
    if (model.items.length === 1) {
      const only = model.items[0];
      const table = renderItemTables(only.item.item_tables);
      if (!table) return '';
      return `
        <section class="backup-learning-section backup-options-section">
          <span class="backup-block-label">ВАРИАНТЫ / ТАБЛИЦА</span>
          ${table}
        </section>
      `;
    }

    return `
      <section class="backup-learning-section backup-subtasks-section">
        <span class="backup-block-label">ОТДЕЛЬНЫЕ ЗАДАНИЯ</span>
        <div class="backup-items">
          ${model.items.map(({ item, body }, index) => `
            <article class="backup-item-card">
              <div class="backup-item-head">
                <div>
                  <div class="backup-item-number">${esc(item.display_label || `Задание ${item.group_position || index + 1}`)}</div>
                  <span class="backup-item-ref">FIPI ${esc(item.fipi_id || '—')}</span>
                </div>
                <span class="backup-kes">${esc(item.live_kes_code ? `КЭС ${item.live_kes_code}` : 'КЭС —')}</span>
              </div>
              ${body ? `<div class="backup-readable-text backup-item-text">${esc(body)}</div>` : ''}
              ${renderItemTables(item.item_tables)}
            </article>
          `).join('')}
        </div>
      </section>
    `;
  }

  function renderMediaCards(unit) {
    const rows = backupMediaForUnit(unit.id);
    if (!rows.length) return '';
    const hasAudio = rows.some(({ media }) => media?.kind === 'audio');

    return `
      <section class="backup-learning-section backup-media-section">
        <span class="backup-block-label">МЕДИА К ЗАДАНИЮ</span>
        <div class="backup-media-grid">
          ${rows.map(({ media }, idx) => {
            const ready = Boolean(media.backup_ready && media.backup_path);
            const kind = media.kind || 'other';
            // Listening tasks in FIPI often contain a purely technical “Прослушать аудиозапись” image.
            // Keep it on screen for fidelity, but mark it so eco-print can omit it.
            const technicalAudioPrompt = hasAudio && kind === 'image';
            return `
              <article class="backup-media-card ${kind === 'image' ? 'image-card' : ''} ${technicalAudioPrompt ? 'backup-technical-audio-image' : ''}" data-backup-media-card="${esc(media.media_id)}">
                <div class="backup-media-head">
                  <span class="backup-media-kind">${esc(kind === 'audio' ? 'Аудио' : kind === 'image' ? 'Изображение' : kind === 'video' ? 'Видео' : 'Media')} ${idx + 1}</span>
                  <span class="backup-media-status">${ready ? 'Яндекс-резерв' : 'недоступно'}</span>
                </div>
                <div class="backup-media-slot" data-backup-media-slot="${esc(media.media_id)}">
                  ${ready
                    ? `<div class="backup-loading"><div class="backup-spinner"></div>Загружаю…</div>`
                    : `<div class="backup-media-error">Резервный файл недоступен. Текст задания сохранён.</div>`}
                </div>
              </article>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }

  async function gatewayFetchMedia(mediaId) {
    const { data } = await supabaseClient.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) throw new Error('Сессия Supabase не найдена.');

    const url = `${CONFIG.supabaseUrl.replace(/\/$/,'')}/functions/v1/ege-backup-gateway?media_id=${encodeURIComponent(mediaId)}`;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`${response.status}: ${text || 'резервный файл недоступен'}`);
    }
    return await response.blob();
  }

  async function loadBackupMedia(mediaId) {
    const m = mediaById.get(mediaId);
    const slot = el.backupTaskBody.querySelector(`[data-backup-media-slot="${CSS.escape(mediaId)}"]`);
    if (!m || !slot || slot.dataset.loaded === '1') return;

    try {
      const blob = await gatewayFetchMedia(mediaId);
      const objectUrl = URL.createObjectURL(blob);
      activeBackupObjectUrls.push(objectUrl);
      slot.dataset.loaded = '1';

      if (m.kind === 'image') {
        slot.innerHTML = `<img src="${esc(objectUrl)}" alt="Изображение задания">`;
      } else if (m.kind === 'audio') {
        slot.innerHTML = `<audio controls preload="metadata" src="${esc(objectUrl)}"></audio><div class="backup-print-media-note">Аудио к заданию доступно в электронной версии Navigator.</div>`;
      } else if (m.kind === 'video') {
        slot.innerHTML = `<video controls preload="metadata" src="${esc(objectUrl)}"></video><div class="backup-print-media-note">Видео к заданию доступно в электронной версии Navigator.</div>`;
      } else {
        slot.innerHTML = `<a class="button secondary wide backup-media-open" href="${esc(objectUrl)}" target="_blank" rel="noopener noreferrer">Открыть media</a><div class="backup-print-media-note">Дополнительный media-файл доступен в электронной версии Navigator.</div>`;
      }
    } catch (error) {
      console.error('Backup media load failed:', error);
      slot.innerHTML = `<div class="backup-media-error">Не удалось загрузить media с Яндекс Диска.<br>${esc(error?.message || error)}</div>`;
    }
  }

  async function loadAllBackupMedia(unit) {
    const rows = backupMediaForUnit(unit.id).filter(({ media }) => media.backup_ready && media.backup_path);
    await Promise.allSettled(rows.map(({ media }) => loadBackupMedia(media.media_id)));
  }

  function printBackupTask() {
    document.body.classList.add('printing-backup-task');
    window.print();
  }

  async function openBackupUnit(unit) {
    revokeBackupObjectUrls();

    const model = unitViewerModel(unit);
    el.backupTaskTitle.textContent = unitTitle(unit);
    el.backupTaskMeta.textContent = `${unitReference(unit)} · ${unitKes(unit)}`;
    el.backupOfficialLink.href = unit.official_fipi_url;
    el.backupTaskBody.innerHTML = `
      ${renderInstructionSection(model)}
      ${renderMediaCards(unit)}
      ${renderContextSection(unit, model)}
      ${renderBackupItems(unit, model)}
      ${renderAnswerSheet(unit)}
    `;

    if (typeof el.backupTaskDialog.showModal === 'function') el.backupTaskDialog.showModal();
    await markViewed(unit);
    // Media loads automatically, exactly like the OGE reserve viewer.
    void loadAllBackupMedia(unit);
  }

  function openUnit(unit) {
    if (demoMode || runtimeConfig.content_source === 'fipi') {
      window.open(unit.official_fipi_url, '_blank', 'noopener,noreferrer');
      void markViewed(unit);
      return;
    }

    void openBackupUnit(unit);
  }

  async function markViewed(unit) {
    if (unitStatus(unit) !== 'new') return;
    await setUnitStatus(unit, 'viewed');
  }

  async function setUnitStatus(unit, status) {
    const principal = currentPrincipalKey();

    const arr = itemsByUnit.get(unit.id) || [];
    if (!arr.length) return;

    const previous = new Map(arr.map(item => [item.id, itemStatus.get(item.id) || 'new']));
    for (const item of arr) itemStatus.set(item.id, status);
    render(false);

    if (demoMode && !demoUsesAuth) {
      savePublicDemoStatuses();
      return;
    }

    if (!principal) return;

    const now = new Date().toISOString();
    const payload = arr.map(item => ({
      principal_key: principal,
      item_id: item.id,
      status,
      updated_at: now,
    }));

    const { error } = await supabaseClient
      .from('ege_task_status')
      .upsert(payload, { onConflict: 'principal_key,item_id' });

    if (error) {
      console.error('Status save failed:', error);
      for (const [itemId, oldStatus] of previous) {
        if (oldStatus === 'new') itemStatus.delete(itemId);
        else itemStatus.set(itemId, oldStatus);
      }
      render(false);
      showInfo('Не удалось сохранить статус', 'Статус карточки не записался в Supabase. Обновите страницу и попробуйте ещё раз.', 'СТАТУС');
    }
  }


  function enterDemoApp(kind = 'public') {
    demoMode = true;
    demoUsesAuth = kind === 'invited';

    document.body.classList.add('workspace-mode','demo-workspace');
    el.accessGate.classList.add('hidden');
    el.appShell.classList.remove('hidden');
    el.signOutButton.classList.remove('hidden');
    el.adminButton.classList.add('hidden');

    el.cloudBadge.textContent = demoUsesAuth ? `DEMO · INVITED · ${units.length}` : `DEMO · ${units.length}`;
    el.cloudBadge.className = 'cloud-badge demo';
    el.sourceBadge.textContent = 'FIPI · DEMO';
    el.sourceBadge.title = 'DEMO всегда открывает только официальные страницы выбранных заданий ФИПИ';

    el.signOutButton.textContent = demoUsesAuth ? 'Выйти' : 'Выйти из DEMO';
    el.modeKicker.textContent = `DEMO · ${units.length} FIXED CARDS · 15 EXAM BUCKETS`;

    if (demoUsesAuth) startPresenceHeartbeat();
  }

  async function startDemo(kind = 'public') {
    if (!runtimeConfig.demo_enabled) {
      showInfo('DEMO временно выключен', 'Администратор отключил публичный DEMO-режим.', 'DEMO');
      return;
    }

    el.openDemoButton.disabled = true;
    const oldText = el.openDemoButton.textContent;
    el.openDemoButton.textContent = 'Открываю DEMO…';

    try {
      demoMode = true;
      demoUsesAuth = kind === 'invited';
      await loadDemoCatalog();
      enterDemoApp(kind);
    } catch (error) {
      demoMode = false;
      demoUsesAuth = false;
      console.error('DEMO load failed:', error);
      showInfo('DEMO недоступен', error?.message || 'Не удалось загрузить демонстрационную подборку.', 'DEMO');
    } finally {
      el.openDemoButton.disabled = false;
      el.openDemoButton.textContent = oldText;
    }
  }

  function enterApp(access) {
    demoMode = false;
    demoUsesAuth = false;
    document.body.classList.remove('demo-workspace');
    currentAccess = access;
    document.body.classList.add('workspace-mode');
    el.accessGate.classList.add('hidden');
    el.appShell.classList.remove('hidden');
    el.signOutButton.classList.remove('hidden');
    el.cloudBadge.textContent = access.role === 'admin' ? 'ADMIN · FULL' : 'FULL';
    el.cloudBadge.className = 'cloud-badge live';
    el.adminButton.classList.toggle('hidden', access.role !== 'admin');
    el.modeKicker.textContent = access.role === 'admin'
      ? 'ADMIN · TOPIC-FIRST · 15 EXAM BUCKETS'
      : 'TOPIC-FIRST · 15 EXAM BUCKETS';
    startPresenceHeartbeat();
  }

  function leaveApp() {
    stopPresenceHeartbeat();
    stopAdminAutoRefresh();

    currentAccess = null;
    demoMode = false;
    demoUsesAuth = false;
    document.body.classList.remove('demo-workspace');
    units = [];
    items = [];
    topics = [];
    unitTopicLinks = [];
    topicOverrides = [];
    manualTopicLinks = [];
    overrideByUnit = new Map();
    manualLinksByUnit = new Map();
    editingTopicUnitId = null;
    media = [];
    unitMediaLinks = [];
    mediaById = new Map();
    mediaLinksByUnit = new Map();
    revokeBackupObjectUrls();
    itemsByUnit = new Map();
    topicById = new Map();
    linksByUnit = new Map();
    itemStatus = new Map();

    document.body.classList.remove('workspace-mode');
    el.appShell.classList.add('hidden');
    el.accessGate.classList.remove('hidden');
    el.signOutButton.classList.add('hidden');
    el.adminButton.classList.add('hidden');
    el.cloudBadge.textContent = 'PROTECTED';
    el.cloudBadge.className = 'cloud-badge protected';
  }

  function expired(value) {
    return Boolean(value && new Date(value).getTime() <= Date.now());
  }

  async function registerLoginOnce(user) {
    const key = `ege-login-registered:${user.id}`;
    if (sessionStorage.getItem(key)) return;
    const { error } = await supabaseClient.rpc('ege_register_auth_login');
    if (error) throw error;
    sessionStorage.setItem(key, '1');
  }

  async function activateUser(user) {
    currentUser = user;
    clearMessage();

    const { data, error } = await supabaseClient.rpc('ege_my_access');
    if (error) {
      leaveApp();
      showMessage('Не удалось проверить доступ к EGE Navigator.', 'error');
      return;
    }

    const access = data?.[0];
    if (!access) {
      await supabaseClient.auth.signOut();
      showMessage('Для этого аккаунта доступ к EGE Navigator ещё не выдан.', 'error');
      return;
    }

    if (access.status === 'pending') {
      leaveApp();
      showMessage('Доступ ожидает подтверждения администратора.', 'error');
      return;
    }
    if (access.status === 'blocked') {
      leaveApp();
      showMessage('Доступ к EGE Navigator приостановлен администратором.', 'error');
      return;
    }
    if (access.status !== 'active' || expired(access.access_expires_at)) {
      leaveApp();
      showMessage('Активного доступа к EGE Navigator нет или срок доступа завершён.', 'error');
      return;
    }
    if (access.access_level === 'demo') {
      try {
        await registerLoginOnce(user);
        await loadRuntimeConfig();
        demoMode = true;
        demoUsesAuth = true;
        await loadDemoCatalog();
        enterDemoApp('invited');
        await touchPresence();
      } catch (e) {
        console.error(e);
        leaveApp();
        showMessage(`Не удалось загрузить персональный DEMO: ${e?.message || e}`, 'error');
      }
      return;
    }

    if (access.access_level !== 'full') {
      leaveApp();
      showMessage('Для этого аккаунта нет подходящего уровня доступа.', 'error');
      return;
    }

    try {
      await registerLoginOnce(user);
      enterApp(access);
      await loadRuntimeConfig();
      await loadCatalog();
      await touchPresence();
    } catch (e) {
      console.error(e);
      leaveApp();
      showMessage(`Не удалось загрузить каталог ЕГЭ: ${e?.message || e}`, 'error');
    }
  }

  async function signIn() {
    clearAuthError();
    const email = el.emailInput.value.trim();
    const password = el.passwordInput.value;
    if (!email || !password) return showAuthError('Введите email и пароль.');

    el.signInButton.disabled = true;
    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({ email, password });
      if (error) return showAuthError(authErrorText(error));
      el.authDialog.close();
      if (data?.user) await activateUser(data.user);
    } finally {
      el.signInButton.disabled = false;
    }
  }

  function resetFilters() {
    el.topicSelect.value = 'all';
    populateSubtopics();
    el.subtopicSelect.value = 'all';
    el.bucketSelect.value = 'all';
    el.statusSelect.value = 'all';
    el.searchInput.value = '';
    render(true);
  }

  function scrollMatrix(direction) {
    const width = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--col-width')) || 286;
    el.matrixViewport.scrollBy({
      left: direction * (width + 12) * 2,
      top: 0,
      behavior: 'smooth'
    });
  }

  async function refreshStatusesWhenVisible() {
    if (demoMode && !demoUsesAuth) return;
    if (document.visibilityState !== 'visible' || !currentUser || !supabaseClient || !units.length) return;
    try {
      const principal = currentPrincipalKey();
      const rows = await fetchAllRows(
        'ege_task_status',
        'principal_key,item_id,status,updated_at',
        'updated_at',
        { column: 'principal_key', value: principal }
      );
      itemStatus = new Map(rows.map(row => [row.item_id, row.status]));
      render(false);
    } catch (error) {
      console.error('Status refresh failed:', error);
    }
  }

  async function init() {
    el.footerYear.textContent = String(new Date().getFullYear());
    populateBuckets();

    el.brandLogo.addEventListener('error', () => {
      el.brandLogo.src = 'assets/brand-logo-fallback.svg';
    }, { once: true });

    if (!isConfigured()) {
      showMessage(
        'Не найден рабочий config.js с подключением Supabase. config.js из вашего EGE-репозитория заменять не нужно.',
        'error'
      );
      el.openLoginButton.disabled = true;
      return;
    }

    supabaseClient = window.supabase.createClient(CONFIG.supabaseUrl, configuredKey(), {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    await loadRuntimeConfig();

    const forceDemo = new URLSearchParams(window.location.search).get('demo') === '1';
    if (forceDemo) {
      await startDemo('public');
    } else {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) console.error('Session read failed:', error);
      const user = data?.session?.user || null;
      if (user) await activateUser(user);
    }

    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (demoMode && !demoUsesAuth) return;
      const nextUser = session?.user || null;
      if (!nextUser) {
        currentUser = null;
        leaveApp();
      } else if (event === 'SIGNED_IN' && currentUser?.id !== nextUser.id) {
        setTimeout(() => activateUser(nextUser), 0);
      }
    });
  }

  el.openLoginButton.addEventListener('click', () => {
    clearAuthError();
    if (typeof el.authDialog.showModal === 'function') el.authDialog.showModal();
  });
  el.closeAuthDialogButton.addEventListener('click', () => el.authDialog.close());
  el.signInButton.addEventListener('click', signIn);
  el.passwordInput.addEventListener('keydown', e => { if (e.key === 'Enter') signIn(); });

  el.openDonutButton.addEventListener('click', () => {
    showInfo(
      'VK Donut предусмотрен',
      'Кнопка остаётся на стартовом экране. Серверную проверку VK Donut подключим отдельным этапом, не затрагивая ОГЭ.',
      'VK DONUT'
    );
  });

  el.openDemoButton.addEventListener('click', () => startDemo('public'));

  el.adminButton.addEventListener('click', openAdminPanel);

  el.signOutButton.addEventListener('click', async () => {
    if (demoMode && !demoUsesAuth) {
      leaveApp();
      clearMessage();
      const url = new URL(window.location.href);
      url.searchParams.delete('demo');
      window.history.replaceState({},'',url.toString());
      return;
    }

    if (supabaseClient && currentUser) {
      try { await supabaseClient.rpc('ege_clear_presence'); } catch {}
      await supabaseClient.auth.signOut();
    }
    currentUser = null;
    leaveApp();
    clearMessage();
  });

  el.topicSelect.addEventListener('change', () => {
    populateSubtopics();
    render(true);
  });
  el.subtopicSelect.addEventListener('change', () => render(true));
  el.bucketSelect.addEventListener('change', () => render(true));
  el.statusSelect.addEventListener('change', () => render(true));
  el.searchInput.addEventListener('input', () => render(true));
  el.resetButton.addEventListener('click', resetFilters);

  el.scrollLeftButton.addEventListener('click', () => scrollMatrix(-1));
  el.scrollRightButton.addEventListener('click', () => scrollMatrix(1));

  el.closeInfoDialogButton.addEventListener('click', () => el.infoDialog.close());
  el.closeInfoButton.addEventListener('click', () => el.infoDialog.close());

  document.querySelectorAll('[data-admin-contact]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      const href = link.href;
      window.open(href, '_blank', 'noopener,noreferrer');
      void copyText(CONTACT_TEXT).then(ok => {
        showToast(ok
          ? '✓ Текст сообщения про ЕГЭ скопирован'
          : 'Открылся VK. Текст не удалось скопировать автоматически.');
      });
    });
  });

  el.closeAdminDialogButton.addEventListener('click', closeAdminPanel);
  el.refreshAdminButton.addEventListener('click', refreshAdminPanel);
  el.participantsTabButton.addEventListener('click', () => setAdminTab('participants'));
  el.onlineTabButton.addEventListener('click', () => setAdminTab('online'));

  el.closeAccessEditorButton.addEventListener('click', () => el.accessEditorDialog.close());
  el.cancelAccessEditorButton.addEventListener('click', () => el.accessEditorDialog.close());
  el.saveAccessEditorButton.addEventListener('click', saveAccessEditor);
  el.accessExpiryPreset.addEventListener('change', () => {
    el.accessCustomDateLabel.classList.toggle('hidden', el.accessExpiryPreset.value !== 'custom');
  });

  el.closeHistoryDialogButton.addEventListener('click', () => el.historyDialog.close());

  el.useFipiSourceButton.addEventListener('click', () => setContentSource('fipi'));
  el.useYandexSourceButton.addEventListener('click', () => setContentSource('yandex_backup'));

  el.toggleDemoButton.addEventListener('click', toggleDemoEnabled);
  el.previewDemoButton.addEventListener('click', previewPublicDemo);

  el.closeBackupTaskButton.addEventListener('click', () => {
    revokeBackupObjectUrls();
    el.backupTaskDialog.close();
  });
  el.printBackupTaskButton?.addEventListener('click', printBackupTask);
  window.addEventListener('afterprint', () => document.body.classList.remove('printing-backup-task'));
  el.backupTaskDialog.addEventListener('close', () => {
    document.body.classList.remove('printing-backup-task');
    revokeBackupObjectUrls();
  });

  el.closeTopicEditorButton.addEventListener('click', () => el.topicEditorDialog.close());
  el.addManualTopicRowButton.addEventListener('click', () => {
    el.manualTopicRows.appendChild(makeManualTopicRow());
  });
  el.saveTopicOverrideButton.addEventListener('click', saveTopicOverride);
  el.resetTopicOverrideButton.addEventListener('click', resetTopicOverride);

  document.addEventListener('visibilitychange', () => {
    refreshStatusesWhenVisible();
    if (document.visibilityState === 'visible' && currentUser) {
      void touchPresence();
      void loadRuntimeConfig();
    }
  });

  init();
})();
