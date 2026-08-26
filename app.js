(() => {
  'use strict';

  const CONFIG = window.EGE_CONFIG || window.OGE_CONFIG || {};
  const PAGE_SIZE = 1000;

  // v0.7.2 — OLD/NEW FORMAT BADGES + FILTER. STRICT NO-PROXY preserved.
  window.__EGE_FRONTEND_BUILD__ = '0.7.2-old-new';
  console.info('EGE Navigator frontend build: 0.7.2-old-new');
  // Supabase is ONLY the customs layer: Auth/access, statuses, metadata and short-lived signed URLs.
  // Catalog, media and vocabulary cache bytes are fetched DIRECTLY by the browser from Yandex Object Storage.
  const EGE_DELIVERY_FUNCTION_URL = `${String(CONFIG.supabaseUrl || '').replace(/\/+$/, '')}/functions/v1/ege-delivery`;
  const EGE_MEDIA_DELIVERY_FUNCTION_URL = `${String(CONFIG.supabaseUrl || '').replace(/\/+$/, '')}/functions/v1/ege-media-delivery`;
  const EGE_CACHE_DELIVERY_FUNCTION_URL = `${String(CONFIG.supabaseUrl || '').replace(/\/+$/, '')}/functions/v1/ege-cache-delivery`;
  const EGE_CATALOG_DB_NAME = 'ege-protected-catalog-v1';
  const EGE_CATALOG_DB_VERSION = 1;
  const EGE_CATALOG_STORE = 'catalogs';

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
  const BUCKET_EXAM_RANGES = Object.freeze({
    listening_1: [1, 1],
    listening_2: [2, 2],
    listening_3_9: [3, 9],
    reading_10: [10, 10],
    reading_11: [11, 11],
    reading_12_18: [12, 18],
    grammar_19_24: [19, 24],
    wordformation_25_29: [25, 29],
    vocabulary_30_36: [30, 36],
    writing_37: [37, 37],
    writing_38: [38, 38],
    speaking_1: [1, 1],
    speaking_2: [2, 2],
    speaking_3: [3, 3],
    speaking_4: [4, 4],
  });

  const CONTACT_TEXT = 'Здравствуйте! Хочу получить доступ к тематическому навигатору по открытому банку заданий ЕГЭ ФИПИ (English).';
  const RECOVERY_CONTACT_TEXT = 'Здравствуйте! Не могу восстановить доступ к EGE Navigator: забыл(а) пароль и код восстановления. Помогите, пожалуйста, сбросить пароль.';
  const STATUS_META = {
    new: { label: 'Новое', icon: '○' },
    viewed: { label: 'Просмотрено', icon: '◉' },
    used: { label: 'Использовано', icon: '★' },
  };

  const FORMAT_META = {
    new: { label: 'NEW', title: 'Новый формат ЕГЭ' },
    old: { label: 'OLD', title: 'Старый формат ЕГЭ' },
  };

  // Generation classification is intentionally conservative:
  // no badge is better than a wrong OLD/NEW badge.
  // OLD/NEW is NOT a user progress status and is never written to Supabase.
  const VOCAB_FORMAT_CACHE_KEY = 'ege-vocab-format-generation-v072';

  let supabaseClient = null;
  let currentUser = null;
  let currentAccess = null;
  let currentManagedAuth = null;
  let pendingRecoveryContinuation = null;
  let pendingRecoveredLogin = null;
  let emailRecoveryMode = false;
  let runtimeConfig = { content_source: 'fipi', demo_enabled: true, yandex_backup_ready: false };
  let userSourcePreference = null;
  let adminManagedUsers = new Map();

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
  const unitJsonCache = new Map();

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
    authHint: $('#authHint'),
    loginIdentifierInput: $('#loginIdentifierInput'),
    passwordInput: $('#passwordInput'),
    signInButton: $('#signInButton'),
    forgotPasswordButton: $('#forgotPasswordButton'),
    authError: $('#authError'),

    firstPasswordDialog: $('#firstPasswordDialog'),
    firstPasswordInput: $('#firstPasswordInput'),
    firstPasswordRepeat: $('#firstPasswordRepeat'),
    firstPasswordError: $('#firstPasswordError'),
    saveFirstPasswordButton: $('#saveFirstPasswordButton'),

    recoveryDialog: $('#recoveryDialog'),
    closeRecoveryDialogButton: $('#closeRecoveryDialogButton'),
    recoveryIdentifierInput: $('#recoveryIdentifierInput'),
    recoveryCodeInput: $('#recoveryCodeInput'),
    recoveryPasswordInput: $('#recoveryPasswordInput'),
    recoveryPasswordRepeat: $('#recoveryPasswordRepeat'),
    recoveryError: $('#recoveryError'),
    recoverPasswordButton: $('#recoverPasswordButton'),
    emailRecoveryOption: $('#emailRecoveryOption'),
    sendEmailRecoveryButton: $('#sendEmailRecoveryButton'),
    emailRecoveryStatus: $('#emailRecoveryStatus'),

    emailResetPasswordDialog: $('#emailResetPasswordDialog'),
    cancelEmailResetPasswordButton: $('#cancelEmailResetPasswordButton'),
    emailResetPasswordInput: $('#emailResetPasswordInput'),
    emailResetPasswordRepeat: $('#emailResetPasswordRepeat'),
    emailResetPasswordError: $('#emailResetPasswordError'),
    saveEmailResetPasswordButton: $('#saveEmailResetPasswordButton'),

    recoveryCodeDialog: $('#recoveryCodeDialog'),
    recoveryCodeValue: $('#recoveryCodeValue'),
    copyRecoveryCodeButton: $('#copyRecoveryCodeButton'),
    confirmRecoveryCodeButton: $('#confirmRecoveryCodeButton'),

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
    adminBackupReadyButton: $('#adminBackupReadyButton'),

    createEmailAccessButton: $('#createEmailAccessButton'),
    createVkAccessButton: $('#createVkAccessButton'),
    emailAccessAdminDialog: $('#emailAccessAdminDialog'),
    closeEmailAccessAdminDialogButton: $('#closeEmailAccessAdminDialogButton'),
    emailAccessNameInput: $('#emailAccessNameInput'),
    emailAccessEmailInput: $('#emailAccessEmailInput'),
    emailAccessLevelSelect: $('#emailAccessLevelSelect'),
    emailAccessExpirySelect: $('#emailAccessExpirySelect'),
    emailAccessAdminError: $('#emailAccessAdminError'),
    createEmailAccessSubmitButton: $('#createEmailAccessSubmitButton'),
    vkAccessAdminDialog: $('#vkAccessAdminDialog'),
    closeVkAccessAdminDialogButton: $('#closeVkAccessAdminDialogButton'),
    vkAccessNameInput: $('#vkAccessNameInput'),
    vkAccessIdInput: $('#vkAccessIdInput'),
    vkAccessSourceSelect: $('#vkAccessSourceSelect'),
    vkAccessLevelSelect: $('#vkAccessLevelSelect'),
    vkAccessExpirySelect: $('#vkAccessExpirySelect'),
    vkAccessAdminError: $('#vkAccessAdminError'),
    createVkAccessSubmitButton: $('#createVkAccessSubmitButton'),
    adminCredentialsDialog: $('#adminCredentialsDialog'),
    closeAdminCredentialsDialogButton: $('#closeAdminCredentialsDialogButton'),
    adminCredentialsText: $('#adminCredentialsText'),
    copyAdminCredentialsButton: $('#copyAdminCredentialsButton'),

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
    if (/invalid login credentials/i.test(m)) return 'Неверный email / VK ID или пароль.';
    if (/email not confirmed/i.test(m)) return 'Email ещё не подтверждён.';
    if (/rate limit/i.test(m)) return 'Слишком много попыток. Попробуйте немного позже.';
    return m || 'Не удалось выполнить вход.';
  }

  const MANAGED_VK_EMAIL_DOMAIN = 'example.com';

  function normalizeVkId(value) {
    const raw = String(value ?? '').trim();
    const number = Number(raw);
    return /^\d{1,15}$/.test(raw) && Number.isSafeInteger(number) && number > 0 ? raw : '';
  }

  function managedVkEmail(vkId) {
    return `navigator-vk-${vkId}@${MANAGED_VK_EMAIL_DOMAIN}`;
  }

  function resolveLoginIdentifier(value) {
    const raw = String(value ?? '').trim();
    const vkId = normalizeVkId(raw);
    if (vkId) return { kind:'vk', identifier:vkId, email:managedVkEmail(vkId) };
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw)) {
      return { kind:'email', identifier:raw.toLowerCase(), email:raw.toLowerCase() };
    }
    return null;
  }

  function managedAccessFunctionUrl() {
    const root = String(CONFIG.supabaseUrl || '').replace(/\/+$/, '');
    return root ? `${root}/functions/v1/ege-managed-access` : '';
  }

  async function currentAccessToken() {
    if (!supabaseClient) return '';
    const { data, error } = await supabaseClient.auth.getSession();
    if (error) throw error;
    return data?.session?.access_token || '';
  }

  async function callManagedAccess(body, options = {}) {
    let token = String(options.token || '');
    if (!token && options.requireAuth) token = await currentAccessToken();
    if (options.requireAuth && !token) throw new Error('authentication_required');

    const headers = {
      'Content-Type': 'application/json',
      'apikey': configuredKey(),
    };
    if (token) headers.Authorization = `Bearer ${token}`;

    const response = await fetch(managedAccessFunctionUrl(), {
      method:'POST',
      headers,
      body:JSON.stringify(body),
    });

    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }

    if (!response.ok || payload?.ok === false) {
      const error = new Error(payload?.code || `HTTP ${response.status}`);
      error.code = payload?.code || '';
      error.status = response.status;
      error.retryAfterSeconds = Number(payload?.retry_after_seconds || 0);
      throw error;
    }
    return payload;
  }

  function managedAccessErrorText(error) {
    const code = String(error?.code || error?.message || '');
    const known = {
      admin_only:'Нужны права ADMIN.',
      invalid_email:'Проверьте email.',
      invalid_vk_id:'Проверьте VK ID: нужны только цифры.',
      display_name_required:'Введите имя пользователя.',
      invalid_expiry:'Некорректный срок доступа.',
      authentication_required:'Сессия входа не найдена. Войдите заново.',
      managed_user_required:'Для этого аккаунта не настроен управляемый вход EGE.',
      password_already_set:'Постоянный пароль уже установлен.',
      password_too_short:'Пароль должен содержать не менее 10 символов.',
      password_too_long:'Пароль слишком длинный.',
      invalid_recovery:'Email / VK ID или код восстановления не совпадают.',
      recovery_not_issued:'Для этого EGE-доступа отдельный код восстановления ещё не выдавался.',
      access_ended:'access_ended',
      origin_not_allowed:'Эта площадка пока не разрешена для защищённого входа.',
      invalid_auth_user_id:'Не удалось определить Auth-пользователя.',
      ege_access_not_found:'У пользователя не найдено право EGE.',
    };
    if (code === 'recovery_locked') {
      const mins = Math.max(1, Math.ceil(Number(error?.retryAfterSeconds || 900) / 60));
      return `Слишком много попыток. Повторите примерно через ${mins} мин.`;
    }
    return known[code] || 'Не удалось выполнить действие. Попробуйте ещё раз чуть позже.';
  }

  function clearInlineError(node) {
    if (!node) return;
    node.textContent = '';
    node.classList.add('hidden');
  }

  function showInlineError(node, text) {
    if (!node) return;
    node.textContent = text;
    node.classList.remove('hidden');
  }

  function animateCopyButton(button, successLabel='✓ Скопировано', delay=1400) {
    if (!button) return;
    const original = button.dataset.originalLabel || button.textContent || '';
    button.dataset.originalLabel = original;
    button.textContent = successLabel;
    button.classList.add('copy-success');
    button.disabled = true;
    window.setTimeout(() => {
      button.textContent = original;
      button.classList.remove('copy-success');
      button.disabled = false;
    }, delay);
  }

  function showInlineSuccess(node, text) {
    if (!node) return;
    node.textContent = text;
    node.classList.remove('hidden');
  }

  function clearInlineSuccess(node) {
    if (!node) return;
    node.textContent = '';
    node.classList.add('hidden');
  }

  function resolveCreateExpiry(select) {
    const value = select?.value || 'none';
    if (value === 'none') return null;
    const days = Number(value);
    if (![7,30].includes(days)) return null;
    return new Date(Date.now() + days * 86400000).toISOString();
  }

  function clearInlineErrorBox(box) {
    if (!box) return;
    box.textContent = '';
    box.classList.add('hidden');
  }
  function showInlineErrorBox(box, text) {
    if (!box) return;
    box.textContent = text;
    box.classList.remove('hidden');
  }

  function extractAuthUserId(principalKey) {
    const m = String(principalKey || '').match(/^auth:([0-9a-f-]{36})$/i);
    return m ? m[1].toLowerCase() : '';
  }

  function effectiveContentSource() {
    if (demoMode) return 'fipi';
    const preferred = userSourcePreference || runtimeConfig.content_source || 'fipi';
    if (preferred !== 'yandex_backup') return 'fipi';
    if (runtimeConfig.yandex_backup_ready) return 'yandex_backup';
    return currentAccess?.role === 'admin' ? 'yandex_backup' : 'fipi';
  }

  async function loadUserSourcePreference() {
    userSourcePreference = null;
    if (!currentUser || currentAccess?.access_level !== 'full') return;
    try {
      const { data, error } = await supabaseClient.rpc('ege_my_source_preference_v050');
      if (!error && ['fipi','yandex_backup'].includes(data)) userSourcePreference = data;
    } catch (error) {
      console.warn('EGE source preference unavailable:', error);
    }
  }

  async function setUserSourcePreference(source) {
    if (!currentUser || currentAccess?.access_level !== 'full') return;
    if (!['fipi','yandex_backup'].includes(source)) return;
    if (source === 'yandex_backup' && !runtimeConfig.yandex_backup_ready && currentAccess?.role !== 'admin') {
      showToast('Яндекс-резерв временно выключен администратором');
      return;
    }
    const old = userSourcePreference;
    userSourcePreference = source;
    updateSourceBadge();
    try {
      const { data, error } = await supabaseClient.rpc('ege_set_my_source_preference_v050', { p_source: source });
      if (error) throw error;
      userSourcePreference = data || source;
      updateSourceBadge();
      showToast(source === 'yandex_backup' ? '✓ Ваш источник: Яндекс-резерв' : '✓ Ваш источник: ФИПИ');
    } catch (error) {
      userSourcePreference = old;
      updateSourceBadge();
      showToast(error?.message || 'Не удалось сохранить выбор источника.');
    }
  }

  function toggleUserSource() {
    const next = effectiveContentSource() === 'yandex_backup' ? 'fipi' : 'yandex_backup';
    void setUserSourcePreference(next);
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
    return row.managed_display_name || row.display_name || row.email || (row.managed_vk_user_id ? `VK ID ${row.managed_vk_user_id}` : (row.vk_user_id ? `VK ID ${row.vk_user_id}` : row.principal_key));
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
          ${row.managed_login_kind ? `<button class="admin-mini-button reset-password" type="button" data-reset-password="${esc(row.principal_key)}">Сбросить пароль</button>` : ''}
          <button class="admin-mini-button${quickClass}" type="button" data-quick-status="${esc(row.principal_key)}">${esc(quickLabel)}</button>
        `;

    return `
      <article class="admin-user-card${isSelfAdmin ? ' self-admin-card' : ''}" data-principal="${esc(row.principal_key)}">
        <div class="admin-user-main">
          <div class="admin-user-name" title="${esc(userDisplayName(row))}">${esc(userDisplayName(row))}</div>
          <div class="admin-user-id">${esc(row.managed_vk_user_id ? `VK ID ${row.managed_vk_user_id}` : (row.email || row.principal_key))}</div>
          <div class="admin-user-chips">
            ${accessChip(row.managed_login_kind === 'vk' ? 'VK ID' : (row.managed_login_kind === 'email' ? 'EMAIL' : row.identity_type))}
            ${accessChip(accessSourceLabel(row.access_source))}
            ${row.must_change_password ? '<span class="admin-chip pending">TEMP PASSWORD</span>' : ''}
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
    root.querySelectorAll('[data-reset-password]').forEach(btn => {
      btn.addEventListener('click', () => adminResetManagedPassword(btn.dataset.resetPassword, btn));
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
    const [directoryResult, managedResult] = await Promise.all([
      supabaseClient.rpc('ege_admin_user_directory'),
      supabaseClient.rpc('ege_admin_managed_directory_v050')
    ]);
    if (directoryResult.error) throw directoryResult.error;
    if (managedResult.error) throw managedResult.error;
    adminManagedUsers = new Map((managedResult.data || []).map(row => [String(row.auth_user_id || '').toLowerCase(), row]));
    adminUsers = (directoryResult.data || []).map(row => {
      const managed = adminManagedUsers.get(extractAuthUserId(row.principal_key));
      return managed ? { ...row,
        managed_login_kind: managed.login_kind,
        managed_email: managed.email,
        managed_vk_user_id: managed.vk_user_id,
        managed_display_name: managed.display_name,
        must_change_password: managed.must_change_password,
      } : row;
    });
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
    const effective = effectiveContentSource();
    const backup = effective === 'yandex_backup';
    const fullUser = Boolean(currentAccess?.access_level === 'full' && !demoMode);

    el.sourceBadge.classList.toggle('hidden', !fullUser && !demoMode);
    el.sourceBadge.disabled = !fullUser;
    el.sourceBadge.innerHTML = demoMode
      ? '<span class="source-name">FIPI · DEMO</span>'
      : `<span class="source-prefix">Источник: </span><span class="source-name">${backup ? 'ЯНДЕКС' : 'FIPI'}</span>`;

    if (demoMode) {
      el.sourceBadge.title = 'DEMO открывает официальный источник ФИПИ';
    } else if (!runtimeConfig.yandex_backup_ready && currentAccess?.role !== 'admin') {
      el.sourceBadge.title = 'Яндекс-резерв временно выключен администратором · используется ФИПИ';
    } else if (backup) {
      el.sourceBadge.title = 'Нажмите, чтобы переключиться на ФИПИ';
    } else {
      el.sourceBadge.title = runtimeConfig.yandex_backup_ready || currentAccess?.role === 'admin'
        ? 'Нажмите, чтобы переключиться на Яндекс-резерв'
        : 'Яндекс-резерв временно недоступен';
    }

    if (el.adminSourceState) {
      const availability = runtimeConfig.yandex_backup_ready ? 'ДОСТУПЕН УЧИТЕЛЯМ' : 'ВЫКЛЮЧЕН ДЛЯ УЧИТЕЛЕЙ';
      const defaultLabel = runtimeConfig.content_source === 'yandex_backup' ? 'Яндекс' : 'FIPI';
      el.adminSourceState.textContent = `${availability} · источник по умолчанию: ${defaultLabel}`;
      if (el.adminBackupReadyButton) {
        el.adminBackupReadyButton.textContent = runtimeConfig.yandex_backup_ready ? 'Резерв: ON' : 'Резерв: OFF';
        el.adminBackupReadyButton.className = runtimeConfig.yandex_backup_ready ? 'button secondary backup-ready-on' : 'button ghost backup-ready-off';
      }
      el.useFipiSourceButton?.classList.toggle('active', runtimeConfig.content_source !== 'yandex_backup');
      el.useYandexSourceButton?.classList.toggle('active', runtimeConfig.content_source === 'yandex_backup');
      if (el.useYandexSourceButton) {
        el.useYandexSourceButton.disabled = !runtimeConfig.yandex_backup_ready;
        el.useYandexSourceButton.title = runtimeConfig.yandex_backup_ready
          ? 'Сделать Яндекс источником по умолчанию для пользователей без личного выбора'
          : 'Сначала включите аварийный рубильник резерва';
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


  function openEgeCatalogDb() {
    return new Promise((resolve, reject) => {
      if (!window.indexedDB) return reject(new Error('IndexedDB unavailable'));
      const request = indexedDB.open(EGE_CATALOG_DB_NAME, EGE_CATALOG_DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(EGE_CATALOG_STORE)) {
          db.createObjectStore(EGE_CATALOG_STORE, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB open failed'));
    });
  }

  async function readEgeCatalogCache(meta) {
    let db = null;
    try {
      db = await openEgeCatalogDb();
      const row = await new Promise((resolve, reject) => {
        const tx = db.transaction(EGE_CATALOG_STORE, 'readonly');
        const req = tx.objectStore(EGE_CATALOG_STORE).get('current');
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error || new Error('IndexedDB read failed'));
      });
      if (!row) return null;
      if (
        row.version !== meta.version ||
        row.sha256 !== meta.sha256 ||
        Number(row.bytes) !== Number(meta.bytes) ||
        !row.catalog
      ) return null;
      return row.catalog;
    } catch (error) {
      console.warn('EGE catalog IndexedDB read unavailable:', error);
      return null;
    } finally {
      try { db?.close(); } catch {}
    }
  }

  async function writeEgeCatalogCache(meta, catalog) {
    let db = null;
    try {
      db = await openEgeCatalogDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(EGE_CATALOG_STORE, 'readwrite');
        tx.objectStore(EGE_CATALOG_STORE).put({
          id: 'current',
          version: meta.version,
          sha256: meta.sha256,
          bytes: Number(meta.bytes),
          saved_at: new Date().toISOString(),
          catalog
        });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error || new Error('IndexedDB write failed'));
        tx.onabort = () => reject(tx.error || new Error('IndexedDB write aborted'));
      });
    } catch (error) {
      // Cache failure must never break the Navigator; Object Storage data is already verified.
      console.warn('EGE catalog IndexedDB write unavailable:', error);
    } finally {
      try { db?.close(); } catch {}
    }
  }

  async function sha256HexBytes(bytes) {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)
    );
    return [...new Uint8Array(digest)]
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  }

  async function decodeGzipJson(bytes) {
    if (typeof DecompressionStream !== 'function') {
      throw new Error('Browser does not support gzip DecompressionStream');
    }
    const stream = new Blob([bytes]).stream()
      .pipeThrough(new DecompressionStream('gzip'));
    const text = await new Response(stream).text();
    return JSON.parse(text);
  }

  function validateEgeCatalogObject(catalog, meta) {
    if (!catalog || catalog.format !== 'EGE_NAVIGATOR_CATALOG') {
      throw new Error('Unexpected EGE catalog format');
    }
    const tables = catalog.tables || {};
    const required = [
      'ege_units',
      'ege_items',
      'ege_topics',
      'ege_unit_topics',
      'ege_media',
      'ege_unit_media'
    ];
    for (const key of required) {
      if (!Array.isArray(tables[key])) throw new Error(`EGE catalog table missing: ${key}`);
    }

    const expected = meta.counts || {};
    const actual = {
      units: tables.ege_units.length,
      items: tables.ege_items.length,
      topics: tables.ege_topics.length,
      unit_topics: tables.ege_unit_topics.length,
      media: tables.ege_media.length,
      unit_media: tables.ege_unit_media.length,
    };
    for (const key of Object.keys(actual)) {
      if (Number(expected[key]) !== Number(actual[key])) {
        throw new Error(`EGE catalog count mismatch: ${key} ${actual[key]} != ${expected[key]}`);
      }
    }
    return tables;
  }

  async function requestEgeCatalogDelivery() {
    const token = await currentAccessToken();
    if (!token) throw Object.assign(new Error('EGE catalog auth token missing'), { authFailure: true });

    let response;
    try {
      response = await fetch(EGE_DELIVERY_FUNCTION_URL, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
          'apikey': configuredKey()
        },
        cache: 'no-store'
      });
    } catch (error) {
      throw Object.assign(new Error(`EGE delivery network error: ${error?.message || error}`), { technicalFailure: true });
    }

    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }

    if (response.status === 409 && payload?.error === 'object_storage_not_enabled') {
      throw Object.assign(new Error('EGE Object Storage catalog is not enabled.'), { technicalFailure: true });
    }
    if (response.status === 401 || response.status === 403) {
      throw Object.assign(
        new Error(payload?.error || `EGE delivery HTTP ${response.status}`),
        { authFailure: true }
      );
    }
    if (!response.ok || !payload?.catalog?.url) {
      throw Object.assign(
        new Error(payload?.error || `EGE delivery HTTP ${response.status}`),
        { technicalFailure: true }
      );
    }

    return {
      mode: payload.delivery_mode || 'hybrid',
      meta: {
        version: String(payload.catalog.version || ''),
        sha256: String(payload.catalog.sha256 || '').toLowerCase(),
        bytes: Number(payload.catalog.bytes || 0),
        counts: payload.catalog.counts || {},
        url: payload.catalog.url
      }
    };
  }

  async function fetchEgeCatalogFromObjectStorage(meta) {
    const cached = await readEgeCatalogCache(meta);
    if (cached) {
      const tables = validateEgeCatalogObject(cached, meta);
      console.info(
        `EGE catalog ${meta.version}: IndexedDB cache hit ` +
        `(${tables.ege_units.length} units, ${tables.ege_items.length} items).`
      );
      return tables;
    }

    const response = await fetch(meta.url, { cache: 'no-store' });
    if (!response.ok) throw new Error(`EGE Object Storage HTTP ${response.status}`);

    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.byteLength !== meta.bytes) {
      throw new Error(`EGE catalog byte mismatch: ${bytes.byteLength} != ${meta.bytes}`);
    }

    const sha = await sha256HexBytes(bytes);
    if (sha !== meta.sha256) {
      throw new Error(`EGE catalog SHA-256 mismatch`);
    }

    const catalog = await decodeGzipJson(bytes);
    const tables = validateEgeCatalogObject(catalog, meta);
    await writeEgeCatalogCache(meta, catalog);

    console.info(
      `EGE catalog ${meta.version}: Object Storage download ` +
      `(${tables.ege_units.length} units, ${tables.ege_items.length} items, ${bytes.byteLength} bytes).`
    );
    return tables;
  }

  async function loadProtectedSharedCatalog() {
    const delivery = await requestEgeCatalogDelivery();
    if (!delivery?.meta?.url) {
      throw new Error('EGE Object Storage catalog URL is unavailable.');
    }
    return await fetchEgeCatalogFromObjectStorage(delivery.meta);
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

    // Full/common catalog bytes come only from Yandex Object Storage.
    // Supabase supplies only live metadata: statuses and manual topic overrides.
    const [shared, live] = await Promise.all([
      loadProtectedSharedCatalog(),
      Promise.all([
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
        )
      ])
    ]);

    const [s, o, m] = live;

    units = shared.ege_units || [];
    items = shared.ege_items || [];
    topics = shared.ege_topics || [];
    unitTopicLinks = shared.ege_unit_topics || [];
    media = shared.ege_media || [];
    unitMediaLinks = shared.ege_unit_media || [];

    topicOverrides = o;
    manualTopicLinks = m;

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
      '<option value="all">Тема: все</option>' +
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

    el.subtopicSelect.innerHTML = `<option value="all">Подтема: все</option>${options}`;

    if ([...el.subtopicSelect.options].some(o => o.value === keep)) el.subtopicSelect.value = keep;
    else el.subtopicSelect.value = 'all';
  }

  function populateBuckets() {
    el.bucketSelect.innerHTML =
      '<option value="all">Раздел ЕГЭ: все 15</option>' +
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

  function unitFormatText(unit) {
    return (itemsByUnit.get(unit.id) || [])
      .map(item => String(item?.item_text || ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function loadCachedVocabFormats() {
    try {
      const raw = localStorage.getItem(VOCAB_FORMAT_CACHE_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveCachedVocabFormat(parentZid, generation) {
    const key = String(parentZid || '').trim().toUpperCase();
    if (!/^[A-F0-9]{6}$/.test(key) || !['old','new'].includes(generation)) return;
    try {
      const map = loadCachedVocabFormats();
      if (map[key] === generation) return;
      map[key] = generation;
      localStorage.setItem(VOCAB_FORMAT_CACHE_KEY, JSON.stringify(map));
    } catch {}
  }

  function flattenBackupStrings(value, out = []) {
    if (value == null) return out;
    if (typeof value === 'string' || typeof value === 'number') {
      out.push(String(value));
      return out;
    }
    if (Array.isArray(value)) {
      for (const item of value) flattenBackupStrings(item, out);
      return out;
    }
    if (typeof value === 'object') {
      for (const item of Object.values(value)) flattenBackupStrings(item, out);
    }
    return out;
  }

  function vocabularyFormatFromPayload(payload) {
    if (!payload) return null;
    const text = flattenBackupStrings(payload, []).join(' ').replace(/\s+/g, ' ');
    if (/номерами\s+30\s*[–—-]\s*36\b/iu.test(text) ||
        /заданиям\s+30\s*[–—-]\s*36\b/iu.test(text)) return 'new';
    if (/номерами\s+32\s*[–—-]\s*38\b/iu.test(text) ||
        /заданиям\s+32\s*[–—-]\s*38\b/iu.test(text)) return 'old';
    return null;
  }

  function vocabularyCachedFormat(unit) {
    const parentZid = String(unit?.parent_zid || '').trim().toUpperCase();
    if (!parentZid) return null;

    const payload = unitJsonCache.get(unit.id);
    const fromPayload = vocabularyFormatFromPayload(payload);
    if (fromPayload) {
      saveCachedVocabFormat(parentZid, fromPayload);
      return fromPayload;
    }

    const saved = loadCachedVocabFormats();
    return saved[parentZid] === 'new' || saved[parentZid] === 'old'
      ? saved[parentZid]
      : null;
  }

  function unitFormatGeneration(unit) {
    const bucket = String(unit?.exam_bucket || '');
    const arr = itemsByUnit.get(unit.id) || [];
    const text = unitFormatText(unit);

    // Written/grammar block: old exam had 1–40, new exam has 1–38.
    // The shifted group sizes are reliable even though Navigator normalizes bucket names.
    if (bucket === 'grammar_19_24') {
      if (arr.length === 6) return 'new'; // 19–24
      if (arr.length === 7) return 'old'; // old 19–25
      return null;
    }

    if (bucket === 'wordformation_25_29') {
      if (arr.length === 5) return 'new'; // 25–29
      if (arr.length === 6) return 'old'; // old 26–31
      return null;
    }

    if (bucket === 'vocabulary_30_36') {
      // Exact source wording is available in the structured cache:
      // NEW = 30–36, OLD = 32–38.
      // We deliberately do not guess before that source page has been seen.
      return vocabularyCachedFormat(unit);
    }

    if (bucket === 'writing_37') {
      if (/You have received an email message from\b/iu.test(text)) return 'new';
      if (/You have received a letter from\b/iu.test(text)) return 'old';
      if (/Comment on (?:one of )?the following statements?\b/iu.test(text)) return 'old';
      return null;
    }

    if (bucket === 'writing_38') {
      if (/\bImagine that you are doing a project\b/iu.test(text)) return 'new';
      if (/Comment on (?:one of )?the following statements?\b/iu.test(text)) return 'old';
      return null;
    }

    // Speaking 2 changed from five direct questions to four.
    if (bucket === 'speaking_2') {
      if (/\bask four (?:direct )?questions\b/iu.test(text)) return 'new';
      if (/\bask five (?:direct )?questions\b/iu.test(text)) return 'old';
      return null;
    }

    // User-provided rule: interview + audio = NEW, photo album = OLD.
    // Text rule also works in DEMO, where protected media arrays are intentionally absent.
    if (bucket === 'speaking_3') {
      if (/\bYou are going to give an interview\b/iu.test(text)) return 'new';
      if (/\bThese are photos from your photo album\b/iu.test(text)) return 'old';

      const kinds = (mediaLinksByUnit.get(unit.id) || [])
        .map(link => mediaById.get(link.media_id)?.kind)
        .filter(Boolean);
      if (kinds.includes('audio')) return 'new';
      if (kinds.includes('image')) return 'old';
      return null;
    }

    // Speaking 4: modern project format = NEW; classic compare/contrast = OLD.
    if (bucket === 'speaking_4') {
      if (/\bStudy the two photographs\b/iu.test(text) ||
          /\bcompare and contrast the photographs\b/iu.test(text)) return 'old';
      if (/\bdoing a (?:school )?project\b/iu.test(text)) return 'new';
      return null;
    }

    // Listening, Reading, Speaking 1: no label until a reliable generation marker exists.
    return null;
  }

  function unitFormatBadge(unit) {
    const generation = unitFormatGeneration(unit);
    const meta = FORMAT_META[generation];
    if (!meta) return '';
    return `<span class="format-generation-badge format-${generation}" title="${esc(meta.title)}">${esc(meta.label)}</span>`;
  }

  function statusOrFormatFilterLabel(value) {
    if (value === 'format_new') return 'Формат: NEW';
    if (value === 'format_old') return 'Формат: OLD';
    return STATUS_META[value]?.label || value;
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
      if (status === 'format_new' && unitFormatGeneration(unit) !== 'new') return false;
      if (status === 'format_old' && unitFormatGeneration(unit) !== 'old') return false;
      if (!status.startsWith('format_') && status !== 'all' && unitStatus(unit) !== status) return false;
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
            ${unitFormatBadge(unit)}
            ${hasTopicOverride(unit.id) ? '<span class="manual-override-marker" title="Есть ручная тематическая правка">ручная</span>' : ''}
            ${arr.length > 1 ? `<span class="unit-count-badge">${esc(countLabel(arr.length))}</span>` : ''}
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
    if (status !== 'all') parts.push(statusOrFormatFilterLabel(status));
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

    const hasActiveFilter =
      (el.topicSelect.value || 'all') !== 'all' ||
      (el.subtopicSelect.value || 'all') !== 'all' ||
      (el.bucketSelect.value || 'all') !== 'all' ||
      (el.statusSelect.value || 'all') !== 'all' ||
      Boolean(el.searchInput.value.trim());
    const currentRow = el.currentSelection.closest('.current-row');
    currentRow?.classList.toggle('hidden', !hasActiveFilter);
    el.currentSelection.innerHTML = `<strong>Фильтр:</strong> ${esc(selectionLabel())}`;
    el.sectionMeta.textContent = `Найдено: ${filtered.length} карточек · ${itemCount} заданий`;
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
      showToast(`✓ Источник по умолчанию: ${label}`);
    } catch (error) {
      console.error('Source switch failed:', error);
      showToast(error?.message || 'Не удалось переключить источник.');
    } finally {
      updateSourceBadge();
    }
  }

  async function toggleBackupReady() {
    if (currentAccess?.role !== 'admin') return;
    const next = !runtimeConfig.yandex_backup_ready;
    if (el.adminBackupReadyButton) el.adminBackupReadyButton.disabled = true;
    try {
      const { data, error } = await supabaseClient.rpc('ege_admin_set_backup_ready', { p_ready: next });
      if (error) throw error;
      runtimeConfig.yandex_backup_ready = Boolean(data);
      if (!runtimeConfig.yandex_backup_ready) runtimeConfig.content_source = 'fipi';
      updateSourceBadge();
      showToast(runtimeConfig.yandex_backup_ready
        ? '✓ Яндекс-резерв снова доступен учителям'
        : 'Яндекс-резерв выключен · учителя автоматически переведены на ФИПИ');
    } catch (error) {
      console.error('Backup availability switch failed:', error);
      showToast(error?.message || 'Не удалось изменить доступность резерва.');
    } finally {
      if (el.adminBackupReadyButton) el.adminBackupReadyButton.disabled = false;
      updateSourceBadge();
    }
  }

  async function adminResetManagedPassword(principalKey, button) {
    const authUserId = extractAuthUserId(principalKey);
    if (!authUserId) return showToast('Не удалось определить Auth-пользователя.');

    const row = adminUsers.find(item => item.principal_key === principalKey);
    const label = row ? userDisplayName(row) : principalKey;

    const approved = window.confirm(
      `Сбросить пароль для ${label}?\n\n` +
      `Будет создан новый временный пароль. Старый recovery-код EGE станет недействительным.\n\n` +
      `ВАЖНО: пароль относится к общему Supabase Auth. Если этот же аккаунт используется в ОГЭ, временный/новый пароль будет общим для ОГЭ и ЕГЭ.`
    );
    if (!approved) return;

    if (button) button.disabled = true;
    try {
      const result = await callManagedAccess({
        action:'admin_reset_password',
        auth_user_id:authUserId,
      }, { requireAuth:true });

      showAdminCredentials(result);
      await refreshAdminParticipants();
    } catch (error) {
      showToast(managedAccessErrorText(error));
    } finally {
      if (button) button.disabled = false;
    }
  }

  function openEmailAccessAdminDialog() {
    clearInlineErrorBox(el.emailAccessAdminError);
    el.emailAccessNameInput.value = '';
    el.emailAccessEmailInput.value = '';
    el.emailAccessLevelSelect.value = 'full';
    el.emailAccessExpirySelect.value = 'none';
    el.emailAccessAdminDialog?.showModal();
  }

  function openVkAccessAdminDialog() {
    clearInlineErrorBox(el.vkAccessAdminError);
    el.vkAccessNameInput.value = '';
    el.vkAccessIdInput.value = '';
    el.vkAccessSourceSelect.value = 'donut';
    el.vkAccessLevelSelect.value = 'full';
    el.vkAccessExpirySelect.value = 'none';
    el.vkAccessAdminDialog?.showModal();
  }

  function managedCredentialsMessage(result) {
    const hello = `Здравствуйте${result.display_name ? `, ${result.display_name}` : ''}!`;

    if (result.mode === 'admin_reset') {
      const login = result.kind === 'vk' ? `VK ID: ${result.vk_user_id}` : `Email: ${result.email}`;
      return `${hello}\n\nДля вашего доступа к EGE Navigator создан новый временный пароль.\n${login}\nВременный пароль: ${result.temporary_password}\n\nОткройте Navigator: ${window.location.origin}${window.location.pathname}\n\nВойдите с временным паролем. Navigator попросит придумать свой постоянный пароль и выдаст новый код восстановления. Сохраните этот код.\n\nЕсли вы используете этот же аккаунт в OGE Navigator, пароль Supabase Auth общий для обоих Navigator.`;
    }
    if (result.kind === 'email') {
      if (result.existing_auth) {
        return `${hello}\n\nВам открыт доступ к EGE Navigator.\nEmail: ${result.email}\n\nВаш аккаунт уже существовал, поэтому пароль НЕ менялся. Используйте свой текущий пароль.\n\nОткрыть Navigator: ${window.location.origin}${window.location.pathname}`;
      }
      return `${hello}\n\nДля вас создан доступ к EGE Navigator.\nEmail: ${result.email}\nВременный пароль: ${result.temporary_password}\n\nОткройте Navigator: ${window.location.origin}${window.location.pathname}\n\nПри первом входе Navigator попросит придумать свой постоянный пароль и покажет код восстановления. Сохраните этот код.`;
    }

    if (result.existing_auth) {
      return `${hello}\n\nВам добавлен доступ к EGE Navigator.\nVK ID: ${result.vk_user_id}\n\nИспользуется ваш уже существующий аккаунт (например, от OGE), поэтому пароль НЕ менялся. Введите VK ID и свой текущий пароль.\n\nОткрыть Navigator: ${window.location.origin}${window.location.pathname}`;
    }

    return `${hello}\n\nДля вас создан доступ к EGE Navigator.\nVK ID: ${result.vk_user_id}\nВременный пароль: ${result.temporary_password}\n\nОткройте Navigator: ${window.location.origin}${window.location.pathname}\n\nПри первом входе Navigator попросит придумать свой постоянный пароль и покажет код восстановления. Сохраните этот код.`;
  }

  function showAdminCredentials(result) {
    el.adminCredentialsText.textContent = managedCredentialsMessage(result);
    el.adminCredentialsDialog?.showModal();
  }

  async function createManagedEmailAccess() {
    clearInlineErrorBox(el.emailAccessAdminError);
    const email = el.emailAccessEmailInput.value.trim();
    if (!email) return showInlineErrorBox(el.emailAccessAdminError, 'Введите email.');
    el.createEmailAccessSubmitButton.disabled = true;
    try {
      const result = await callManagedAccess({
        action:'create_email_access',
        email,
        display_name:el.emailAccessNameInput.value.trim(),
        access_level:el.emailAccessLevelSelect.value,
        access_expires_at:resolveCreateExpiry(el.emailAccessExpirySelect),
      }, { requireAuth:true });
      el.emailAccessAdminDialog.close();
      showAdminCredentials(result);
      await refreshAdminParticipants();
    } catch (error) {
      showInlineErrorBox(el.emailAccessAdminError, error?.message || 'Не удалось создать доступ.');
    } finally { el.createEmailAccessSubmitButton.disabled = false; }
  }

  async function createManagedVkAccess() {
    clearInlineErrorBox(el.vkAccessAdminError);
    const vkId = el.vkAccessIdInput.value.trim();
    const name = el.vkAccessNameInput.value.trim();
    if (!/^\d{1,15}$/.test(vkId)) return showInlineErrorBox(el.vkAccessAdminError, 'VK ID — только цифры.');
    if (!name) return showInlineErrorBox(el.vkAccessAdminError, 'Введите имя.');
    el.createVkAccessSubmitButton.disabled = true;
    try {
      const result = await callManagedAccess({
        action:'create_vk_access',
        vk_user_id:vkId,
        display_name:name,
        source:el.vkAccessSourceSelect.value,
        access_level:el.vkAccessLevelSelect.value,
        access_expires_at:resolveCreateExpiry(el.vkAccessExpirySelect),
      }, { requireAuth:true });
      el.vkAccessAdminDialog.close();
      showAdminCredentials(result);
      await refreshAdminParticipants();
    } catch (error) {
      showInlineErrorBox(el.vkAccessAdminError, error?.message || 'Не удалось создать VK-доступ.');
    } finally { el.createVkAccessSubmitButton.disabled = false; }
  }


  function revokeBackupObjectUrls() {
    for (const url of activeBackupObjectUrls) {
      try { URL.revokeObjectURL(url); } catch {}
    }
    activeBackupObjectUrls = [];
  }

  // v0.6.5 — 89 links verified against LIVE FIPI as SERVICE-only.
  // Pair-specific guard: hides only the exact unit↔media relations already removed
  // from live Supabase, even while an older Object Storage catalog is cached.
  const VERIFIED_SERVICE_MEDIA_LINKS = new Set([
    "b496cf7d-fddf-5544-b9e7-0512120b93a0|fipi_455a22c7aa7b0889e940",
    "625145bf-6a9a-51ad-9156-e2f89606bdf2|fipi_edb3c03d34a09ca45620",
    "74cc5030-9edd-542c-a2c9-f2604694bdec|fipi_60f85f83194a68b5ac6e",
    "9ae9be03-4189-5dd3-b8a9-dde61f7bc2ec|fipi_f71d5c43402a9d748487",
    "b9b144f6-daee-59f3-b78c-184bc8d942e3|fipi_37934c155638d7808e51",
    "c112021b-b824-5dde-a3ec-efdc03376899|fipi_10c5d23b770a3f034ebb",
    "f6395d46-ac54-56fa-9fc0-6edb227fd942|fipi_aab8782e852f21700f0c",
    "44d99969-050a-587d-8ab8-c9da86f63b57|fipi_74f1f74fbef72055c7b1",
    "1cb2690d-ea7a-5359-9308-a72787166919|fipi_104437c1524c7655fe0a",
    "c5ef74f2-7617-52d1-8f37-d658f876fe5b|fipi_728e89c711baea52ef54",
    "81afd759-8cd1-5be1-ba35-3f35c52c4bb2|fipi_6f90faf3c3dd0f57b0a6",
    "50565375-e16e-5934-a4ce-6691c2555804|fipi_ca202e19a16a72a01986",
    "5f3f65a0-bb5f-5d08-81e0-7fca746d3b54|fipi_5d79a595fbaea2ef7d06",
    "9a6a1893-5b64-5bce-b061-d427ddd218f8|fipi_4b0e376e5a518b64c6da",
    "76c4839f-372e-5295-b68d-a05cc8f416b4|fipi_d1ec21413e339abaf29e",
    "ab1c5057-81a6-576c-bb32-dac4ee2bf67e|fipi_699d75eec330fe496f8b",
    "7ff8e6d2-0279-5815-b011-d818bfaa502f|fipi_27aaf18bde6add7537d2",
    "fc573237-4aab-52f6-9294-dcb18a27dabf|fipi_abf44d59528f6dbc73c1",
    "a0d81d50-752c-5aaf-8c9a-b4b7d59a2b3e|fipi_fc02ce7c96050940019e",
    "810c17fd-cf80-54d2-b8a7-6f85ea320f1e|fipi_ce52fc90805e513bdb94",
    "fc1061c5-af92-58d9-a6ff-6b8fe5027109|fipi_15dc9b6737ee2f4bd42b",
    "1e71862b-7141-5b27-b130-d305293099d9|fipi_0ae1548a3dd90937bd6c",
    "1160d274-4784-5ef9-857d-13b373efedba|fipi_c517b9746f3144a23dd4",
    "7f251e44-fabf-5a59-8cef-1cbd8ac24d0e|fipi_0923aaf6ea3e1a1c2006",
    "025fb583-ea43-5eef-99c2-edf36d7bf2c6|fipi_c1dc542782ca99556270",
    "97722c24-f6b6-5c55-be77-7d015055d36a|fipi_a3c81b6a7cecdeaccc22",
    "4fb01b4d-de4b-5201-8fa7-1fd58ea33389|fipi_16d66ed053a15494e0fa",
    "c3c86dd1-7000-57d5-ba31-98be88c38dd5|fipi_908588ab6c28f2ed64d9",
    "b412f225-66ed-5485-8201-dd2b64b70f15|fipi_bed7fd69db2e4f5a8341",
    "c6f95762-9e03-5e99-bf7d-e5b64dbb885b|fipi_1f8751c5f5f71ea59c25",
    "acf5529e-4133-5bdf-ac1a-a1ed702fbf3b|fipi_a54c246cacb477620ef5",
    "8a4ceeea-23e9-541e-80a4-684f7a90499e|fipi_3c1cceedd36ecf24bda6",
    "66361119-baa8-5bb8-b8b7-3287b257b302|fipi_b09b522e7a54b5b60b78",
    "8ea58de9-bad8-556e-a1ce-bbc27dc20c9d|fipi_4dafdf12d0dcc4967d36",
    "5cc425f2-1fd2-53b8-becc-3980ca0c6d1b|fipi_09836e1d024f5c9d04ff",
    "26f4ce98-a613-5315-a960-b06d76aa8b52|fipi_e8dcf442d05db1383b8b",
    "14859468-1ac1-56c0-bc7a-74dfa37f226d|fipi_de31dca2b0717f79ebd4",
    "42437e28-1194-5043-af52-54d1f74182d3|fipi_58b81cbabbcd5e65e778",
    "1d4006cc-0553-5dd4-8442-7c3083026c27|fipi_347c16910770685b2853",
    "d07cd940-d4a1-5643-b473-d46d3f713b16|fipi_d20fd9c495f273d7dfb6",
    "0a793f88-b328-5f51-ab38-1f84526886a6|fipi_33df8c34722d5de86546",
    "4a0e26ed-ba01-5949-80ed-f7f5d6997d31|fipi_a1d6d859c7998d7aad56",
    "70125c01-51b2-528c-9725-c88dc53527f1|fipi_686b69e1679e78f419bd",
    "7068d5ce-af99-5883-8314-419b898141c0|fipi_44278c61913925ebbe2e",
    "ba4cb884-d6ed-52ba-8602-be94a469ccbe|fipi_9bf7fb17481d0459c0d6",
    "00a73d54-aa6d-54e9-8882-45e4871d05a0|fipi_9079170fe6c11134dc08",
    "065c2aca-273f-557b-9619-9074600f143e|fipi_e82140d2373ee0f8d9ee",
    "7f4ecfa5-dcc2-5de1-999d-204a1dde91d8|fipi_ea7bc6d40ea170124a4d",
    "1ebcb6d9-14ab-583f-bb74-ff9c64bbeade|fipi_e9701720c95b4eaf2b6c",
    "308a2fbd-6266-5866-b751-ceabea9e3215|fipi_8cbdf78fc78878799f7f",
    "29c9d5f5-f902-59d9-b38d-fecb94f35573|fipi_c0a0c1f8fa783156ac5f",
    "96992611-a69d-5d48-9915-698ab24e1046|fipi_f8de0e62e3f875c4bcd7",
    "0e628270-367a-5bd2-9655-48dbb4fcf04d|fipi_e1cee698336d8636a671",
    "68efce6f-1ee0-5c4d-bced-10cfb318c123|fipi_ff941f7aea0e1e3c7d87",
    "c3f4e316-7ab4-5761-a5a7-f46dee0b500f|fipi_a5c7a6cc92e8a771fe76",
    "93a2f36a-6521-5fa8-80f8-64d362fca4d8|fipi_97877e7a2aa47b28fb14",
    "4aecf24d-d133-50d2-8ca1-a41073c35330|fipi_fb60663b4dbd54e5b3ef",
    "cc7b56cb-5419-52df-a480-654d717b525b|fipi_112aafe1bbd6906c8f98",
    "c2be566c-9dde-5644-878a-d9a3377558a5|fipi_9506e3a36b62eb0f140d",
    "5d6b1e07-701d-5be3-a29d-ddc66a8dcf5d|fipi_559533accae5adfb869c",
    "0f5652ee-6f50-5448-8581-59677698a641|fipi_9d4c94c91066c01470ec",
    "b3545307-aed6-5184-b785-92642d05fb85|fipi_ecb2bb128606a7a6b6a3",
    "c370a41f-d21d-5e64-8e1a-c9cd136570b2|fipi_6dc16fef0738a7eae185",
    "70ff0ba0-50c5-53bb-b631-5c91ed9bac5f|fipi_59ab8b5a389702767f64",
    "71a02a4c-cb67-5837-8ea9-9b576d158dcf|fipi_a3016c7a515b15056c38",
    "e6414791-358e-529b-82f2-aa9a2d38c0f4|fipi_9bf217b34f69402fac0f",
    "70660859-dcf8-56cc-a87f-497d0f0d5025|fipi_b90822f3e73ad77d4b4d",
    "37c2f330-a0a0-5635-889e-a871d6d6bf79|fipi_275b24514272ff39dd89",
    "40a8fed6-3449-518f-a5e9-5a3ba90a0618|fipi_d13d9f6694211952ea31",
    "e75fa9dd-e8c3-5118-ad13-5e9253e59115|fipi_aea2b2565be55844b293",
    "0d2cbe79-0f35-5ff0-839d-61824eb1fdf2|fipi_d6d923c12b01a6af8972",
    "f9cc909c-3500-5ba0-9a8d-ac9da605e2d7|fipi_437c4daad7fa28940508",
    "d83d4dad-0aac-587b-a1b3-74c74cd8755a|fipi_fa5f1c3f9f0537282c45",
    "87dfbb1f-d280-5e99-8c08-66b19b9c4d80|fipi_beb262406f721c33d067",
    "e8054ab6-6650-57ab-949a-3c65c1fcb038|fipi_94d0965dc5aa0f8398f6",
    "459e2e4a-9fd1-5eea-8562-61d582bd92b3|fipi_c54aec5afd33b222c4cd",
    "34004027-0826-5744-b789-eaa723d9c552|fipi_86a3dc8b8bd6aa5356a0",
    "ea1f3d0d-7c27-5fcb-aaeb-3f1e5618a868|fipi_d8c12fa52d959994645f",
    "5226d6af-d438-51ba-a395-a55250bf902a|fipi_ac925dedde23988b81bb",
    "a8375af1-a8fd-506f-a6a1-fc29ebb826d5|fipi_54f1f922e7bd4baad7d3",
    "eecb59ba-bfe2-558d-8856-4d46b855d10c|fipi_f366243f621c600ebe48",
    "50289b68-5412-5417-8d6f-010974f95dee|fipi_3ad58fa5ed98d79d653a",
    "8b2f42b5-1180-5400-8f68-b9d48e380ded|fipi_456671699ab21dc8f93f",
    "d8bf191b-8930-5e4f-8aab-d4e33963a3b0|fipi_ceb02b20339d6cc10091",
    "fbbf7f01-ac6c-575f-ac00-351f50db5652|fipi_7ed537ec5ecb45276158",
    "d652f643-8638-5441-8d90-2746d2f208e6|fipi_0e56ce02cdf7bc23f49d",
    "76df104a-a744-5f9c-ad84-179009d16ff1|fipi_90279d8e8925e3b1db75",
    "71a01e9f-5863-58d7-a2bf-df18b828f90b|fipi_76f6cbebe7ed1f476c46",
    "32b06d75-2660-5ecd-9e68-68827315a3ef|fipi_0b287894bed34ca4fed9"
  ]);

  function backupMediaForUnit(unitId) {
    return (mediaLinksByUnit.get(unitId) || [])
      .filter(link => !VERIFIED_SERVICE_MEDIA_LINKS.has(`${unitId}|${link.media_id}`))
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

  function isReading11Unit(unit) {
    const bucket = String(unit?.exam_bucket || '').trim().toLowerCase();
    if (bucket === 'reading_11') return true;
    const title = backupTextClean(unit?.title || '');
    return /(?:Чтение|Reading)\s*(?:·|-)?\s*(?:задание|task)?\s*11(?:\D|$)/iu.test(title);
  }

  function normalizeReading11Instruction(value) {
    return backupTextClean(value)
      .replace(/A\s*(?:[–—-]\s*)?F(?=\s|[.,;:]|$)/gu, 'A–F')
      .replace(/1\s*(?:[–—-]\s*)?7(?=\s|[.,;:]|$)/gu, '1–7');
  }

  function splitItemInstruction(item, unit) {
    let text = backupTextClean(item?.item_text || '');
    text = text.replace(/^Задание\s*№\s*\d+\.\s*/iu, '').trim();
    if (!text) return { instruction: '', body: '' };

    if (unit?.exam_bucket === 'listening_1') {
      const m = text.match(/^(.*?Занесите свои ответы в таблицу\.)\s*/isu);
      if (m) return { instruction: backupTextClean(m[1]), body: backupTextClean(text.slice(m[0].length)) };
    }

    if (unit?.exam_bucket === 'reading_10') {
      const m = text.match(/^(.*?В задании один заголовок лишний\.)\s*/isu);
      if (m) return { instruction: backupTextClean(m[1]), body: backupTextClean(text.slice(m[0].length)) };
    }

    if (isReading11Unit(unit)) {
      // Reading 11 has two common parser shapes:
      // A–F / 1–7, or the dashless A F / 1 7.
      // Ignore the short generic lead “Установите соответствие...”
      // and keep the full official two-sentence instruction together.
      const startIndex = text.search(/Прочитайте\s+текст\s+и\s+заполните\s+пропуски/iu);
      if (startIndex >= 0) {
        const tail = text.slice(startIndex);
        const endMatch = /Занесите\s+цифры,\s*обозначающие\s+соответствующие\s+части\s+предложений,\s*в\s+таблицу\./iu.exec(tail);
        if (endMatch) {
          const endIndex = startIndex + (endMatch.index || 0) + endMatch[0].length;
          const instruction = normalizeReading11Instruction(text.slice(startIndex, endIndex));
          const body = backupTextClean(text.slice(endIndex));
          return { instruction, body };
        }
      }
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

  function instructionCmp(value) {
    return backupTextClean(value).replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru-RU');
  }

  function bestInstruction(parts, unit) {
    let rows = [...new Set((parts || []).map(backupTextClean).filter(Boolean))];
    if (!rows.length) return '';
    if (rows.length === 1) return rows[0];

    // Remove short generic prompts whenever the same unit contains a full instruction.
    const generic = /^(?:Прочитайте текст и выполните задания|Выберите правильный ответ|Установите соответствие и впишите ответ|Впишите правильный ответ|Запишите правильный ответ)\.?$/iu;
    if (rows.some(row => !generic.test(row) && row.length > 55)) rows = rows.filter(row => !generic.test(row));

    // Remove exact/near-exact fragments already covered by a longer instruction.
    rows = rows.filter((row, index) => {
      const cmp = instructionCmp(row);
      return !rows.some((other, otherIndex) => {
        if (index === otherIndex || other.length <= row.length + 12) return false;
        return instructionCmp(other).includes(cmp);
      });
    });

    const preferSingle = new Set([
      'listening_1','listening_2','listening_3_9',
      'reading_10','reading_11','reading_12_18',
      'grammar_19_24','wordformation_25_29','vocabulary_30_36'
    ]);
    if (preferSingle.has(unit?.exam_bucket) && rows.length > 1) {
      rows.sort((a,b) => b.length - a.length);
      return rows[0];
    }
    return rows.join('\n\n');
  }

  function htmlishText(value) {
    let text = String(value ?? '').trim();
    if (!text) return '';
    if (/<[a-z][\s\S]*>/i.test(text)) {
      try {
        const holder = document.createElement('div');
        holder.innerHTML = text.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p\s*>/gi, '\n\n');
        text = holder.textContent || holder.innerText || text;
      } catch {}
    }
    return backupTextClean(text);
  }

  function collectUnitJsonText(value, path = '', out = [], depth = 0) {
    if (depth > 12 || value === null || value === undefined) return out;
    if (typeof value === 'string') {
      const raw = value.trim();
      if (!raw) return out;
      if ((raw.startsWith('{') || raw.startsWith('[')) && raw.length < 1500000) {
        try {
          const parsed = JSON.parse(raw);
          collectUnitJsonText(parsed, path, out, depth + 1);
          return out;
        } catch {}
      }
      const text = htmlishText(raw);
      if (text) out.push({ path, text });
      return out;
    }
    if (Array.isArray(value)) {
      value.forEach((part, index) => collectUnitJsonText(part, `${path}[${index}]`, out, depth + 1));
      return out;
    }
    if (typeof value === 'object') {
      for (const [key, part] of Object.entries(value)) {
        collectUnitJsonText(part, path ? `${path}.${key}` : key, out, depth + 1);
      }
    }
    return out;
  }

  function consecutiveExamNumbers(value, expectedCount = 0) {
    const text = backupTextClean(value);
    const found = [...text.matchAll(/\b([1-4]?\d)\b/g)]
      .map(match => ({ value: Number(match[1]), index: match.index ?? 0 }))
      .filter(row => row.value >= 10 && row.value <= 45);
    const need = Math.max(2, Number(expectedCount || 0));
    let best = [];
    for (let start = 0; start < found.length; start += 1) {
      const seq = [found[start]];
      for (let i = start + 1; i < found.length; i += 1) {
        const last = seq[seq.length - 1].value;
        if (found[i].value === last + 1) seq.push(found[i]);
        else if (found[i].value > last + 1) break;
        if (expectedCount && seq.length >= expectedCount) break;
      }
      if (seq.length > best.length) best = seq;
      if (expectedCount && seq.length >= expectedCount) return seq.slice(0, expectedCount).map(row => row.value);
    }
    return best.length >= need ? best.map(row => row.value) : [];
  }

  function explicitBlankNumbers(value) {
    const out = [];
    const seen = new Set();
    for (const match of String(value ?? '').matchAll(/\b([1-4]?\d)\s*(?=_{2,}|…{2,}|\.{4,})/g)) {
      const n = Number(match[1]);
      if (n >= 10 && n <= 45 && !seen.has(n)) { seen.add(n); out.push(n); }
    }
    return out;
  }

  function trimVocabularyPassage(value, expectedCount = 0) {
    let text = htmlishText(value);
    if (!text) return '';

    const instructionEndPatterns = [
      /Запишите\s+в\s+поле\s+ответа\s+цифру\s+1\s*,\s*2\s*,\s*3\s+или\s+4\s*,?\s*соответствующую\s+выбранному\s+Вами\s+варианту\s+ответа\./iu,
      /соответствующую\s+выбранному\s+Вами\s+варианту\s+ответа\./iu,
    ];
    for (const re of instructionEndPatterns) {
      const m = re.exec(text);
      if (m) { text = backupTextClean(text.slice((m.index ?? 0) + m[0].length)); break; }
    }

    const taskMarker = text.search(/(?:^|\n|\s)Задание\s*№\s*\d+/iu);
    if (taskMarker > 180) text = backupTextClean(text.slice(0, taskMarker));

    const answerButton = text.search(/\bi\s+Ответить\b/iu);
    if (answerButton > 180) text = backupTextClean(text.slice(0, answerButton));

    const nums = explicitBlankNumbers(text).length ? explicitBlankNumbers(text) : consecutiveExamNumbers(text, expectedCount);
    if (nums.length) {
      const last = nums[nums.length - 1];
      const lastMatch = [...text.matchAll(new RegExp(`\\b${last}\\b`, 'g'))].pop();
      const searchFrom = lastMatch ? (lastMatch.index ?? 0) + String(last).length : Math.floor(text.length * 0.55);
      const tail = text.slice(searchFrom);
      const optionsStart = tail.search(/(?:^|\s)1\s+1[.)]\s+[A-Za-zА-ЯЁ]/u);
      if (optionsStart >= 0) text = backupTextClean(text.slice(0, searchFrom + optionsStart));
    }

    return text;
  }

  function vocabularyInstructionFromCandidates(candidates) {
    for (const row of candidates) {
      const text = row.text;
      const m = text.match(/Прочитайте\s+текст\s+с\s+пропусками[\s\S]{0,900}?соответствующую\s+выбранному\s+Вами\s+варианту\s+ответа\./iu);
      if (m) return backupTextClean(m[0]);
    }
    return '';
  }

  function vocabularyModelFromUnitJson(payload, expectedCount = 0) {
    if (!payload) return { passage: '', examNumbers: [], instruction: '' };
    const candidates = collectUnitJsonText(payload);
    const instruction = vocabularyInstructionFromCandidates(candidates);
    let winner = null;

    for (const row of candidates) {
      if (row.text.length < 220) continue;
      const passage = trimVocabularyPassage(row.text, expectedCount);
      if (passage.length < 180) continue;
      const explicit = explicitBlankNumbers(passage);
      const sequence = explicit.length >= 2 ? explicit : consecutiveExamNumbers(passage, expectedCount);
      const latinWords = (passage.match(/\b[A-Za-z][A-Za-z’'\-]{2,}\b/g) || []).length;
      const underscores = (passage.match(/_{2,}/g) || []).length;
      let score = Math.min(passage.length, 7000) + latinWords * 4 + underscores * 500 + sequence.length * 1400;
      if (expectedCount && sequence.length === expectedCount) score += 5000;
      if (/source_context|context|plain_text|page/i.test(row.path)) score += 700;
      if (/Прочитайте\s+текст\s+с\s+пропусками/iu.test(row.text)) score += 1400;
      if (/\b(?:Reasons|Number of respondents|Write 200[–-]250 words)\b/i.test(passage)) score -= 2500;
      if (!winner || score > winner.score) winner = { passage, examNumbers: sequence, score };
    }

    return {
      passage: winner?.passage || '',
      examNumbers: expectedCount && winner?.examNumbers?.length >= expectedCount
        ? winner.examNumbers.slice(0, expectedCount)
        : (winner?.examNumbers || []),
      instruction
    };
  }

  function unitViewerModel(unit, unitJson = null) {
    const arr = (itemsByUnit.get(unit.id) || []).slice().sort((a,b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    const shared = readableJson(unit.shared_context);
    const sharedInstruction = [];
    const sharedContext = [];
    for (const part of shared) (looksLikeInstruction(part) ? sharedInstruction : sharedContext).push(part);

    const itemModels = arr.map(item => {
      const split = splitItemInstruction(item, unit);
      let body = split.body;
      if (unit?.exam_bucket === 'reading_11') body = cleanReading11Body(body, item.item_tables);
      return { item, instruction: split.instruction, body };
    });

    const instructionParts = [...sharedInstruction];
    for (const row of itemModels) {
      if (row.instruction && !instructionParts.includes(row.instruction)) instructionParts.push(row.instruction);
    }

    const singleContext = itemModels.length === 1 && itemModels[0].body ? [itemModels[0].body] : [];
    let context = [...new Set([...sharedContext, ...singleContext].filter(Boolean))];
    let instruction = bestInstruction(instructionParts, unit);
    let examNumbers = [];
    let vocabularyRecovered = false;

    if (unit?.exam_bucket === 'vocabulary_30_36' && unitJson) {
      const recovered = vocabularyModelFromUnitJson(unitJson, itemModels.length);
      if (recovered.passage) {
        context = [recovered.passage];
        vocabularyRecovered = true;
      }
      if (recovered.instruction && (!instruction || /^Выберите правильный ответ\.?$/iu.test(instruction) || recovered.instruction.length > instruction.length)) {
        instruction = recovered.instruction;
      }
      if (recovered.examNumbers.length === itemModels.length) examNumbers = recovered.examNumbers;
    }

    return {
      items: itemModels,
      instruction,
      context,
      examNumbers,
      vocabularyRecovered,
      unitJsonAvailable: Boolean(unitJson)
    };
  }


  // v0.4.2 — Speaking 2–4: FIPI-like clean layout.
  // Do not render raw item_tables for these tasks: they contain duplicated task text
  // and technical ShowPictureQ(...) paths. Use item_text + trusted media links instead.
  function speakingBucket(unit) {
    return ['speaking_2', 'speaking_3', 'speaking_4'].includes(unit?.exam_bucket);
  }

  function speakingSourceText(model) {
    const row = model?.items?.[0];
    return backupTextClean(row?.body || row?.item?.item_text || model?.context?.[0] || '')
      .replace(/^Дайте\s+развернутый\s+ответ\.\s*/iu, '')
      .trim();
  }

  function speakingCleanTail(value) {
    return backupTextClean(value)
      .replace(/\s+Photo\s*1\.?(?:\s+Photo\s*2\.?)?(?:\s+Photo\s*3\.?)?\s*$/iu, '')
      .trim();
  }

  function splitSpeakingPoints(value, expected = 0) {
    const text = backupTextClean(value);
    if (!text) return [];
    const out = [];
    const re = /(?:^|\s)([1-9])\)\s*([\s\S]*?)(?=(?:\s+[1-9]\)\s)|$)/gu;
    for (const match of text.matchAll(re)) {
      const n = Number(match[1]);
      if (expected && n > expected) continue;
      const point = backupTextClean(match[2]).replace(/[;,.]\s*$/u, '').trim();
      if (point) out.push({ n, text: point });
    }
    return out;
  }

  function speakingTask2Model(model) {
    const source = speakingCleanTail(speakingSourceText(model));
    if (!source) return null;

    const closingMatch = source.match(/You\s+have\s+20\s+seconds\s+to\s+ask\s+each\s+question\./iu);
    const closing = closingMatch?.[0] || '';
    let core = closingMatch ? source.slice(0, closingMatch.index) : source;

    const listStart = core.search(/(?:^|\s)1\)\s*/u);
    const beforeList = listStart >= 0 ? backupTextClean(core.slice(0, listStart)) : core;
    const listText = listStart >= 0 ? core.slice(listStart) : '';
    const points = splitSpeakingPoints(listText, 4);

    let adTitle = '';
    let intro = beforeList;
    const following = beforeList.match(/^([\s\S]*?following:)\s*([\s\S]+)$/iu);
    if (following) {
      intro = backupTextClean(following[1]);
      adTitle = backupTextClean(following[2]);
    }

    return { intro, adTitle, points, closing };
  }

  function speakingTask3Model(model) {
    const source = speakingCleanTail(speakingSourceText(model));
    if (!source) return null;

    const marker = /In\s+your\s+talk\s+remember\s+to\s+speak\s+about:\s*/iu;
    const markerMatch = marker.exec(source);
    if (!markerMatch) return { intro: source, points: [], closing: '' };

    const intro = backupTextClean(source.slice(0, markerMatch.index));
    const after = source.slice(markerMatch.index + markerMatch[0].length);
    const closingIndex = after.search(/You\s+have\s+to\s+talk\s+continuously/iu);
    const bulletText = closingIndex >= 0 ? after.slice(0, closingIndex) : after;
    const closing = speakingCleanTail(closingIndex >= 0 ? after.slice(closingIndex) : '');

    const points = bulletText
      .split(/[·•]\s*/u)
      .map(x => backupTextClean(x).replace(/[;,.]\s*$/u, '').trim())
      .filter(Boolean);

    return { intro, points, closing };
  }

  function speakingTask4SplitPoints(value) {
    const text = backupTextClean(value);
    if (!text) return [];

    // Newer FIPI variants use · / • bullets.
    let points = text
      .split(/[·•]\s*/u)
      .map(x => backupTextClean(x).replace(/^[;:,\s]+|[;,.]\s*$/gu, '').trim())
      .filter(Boolean);

    // Transitional FIPI variants have no bullet glyphs and separate the four
    // requirements only with semicolons.
    if (points.length < 2) {
      points = text
        .split(/;\s+(?=(?:give|say|mention|express|explain|outline|compare|describe)\b)/iu)
        .map(x => backupTextClean(x).replace(/^[;:,\s]+|[;,.]\s*$/gu, '').trim())
        .filter(Boolean);
    }

    return points;
  }

  function speakingTask4Model(model) {
    const source = speakingCleanTail(speakingSourceText(model));
    if (!source) return null;

    // All three FIPI generations are normalized to:
    // intro -> bullet requirements -> closing.
    //
    // 1) Classic:
    //    "... compare and contrast the photographs: · give ... · say ..."
    // 2) Modern:
    //    "In 2.5 minutes be ready to: · explain ... · mention ..."
    // 3) Transitional:
    //    "In 2.5 minutes be ready to: give ...; say ...; mention ...; express ..."
    const readyMarker = /\bIn\s+\d+(?:[.,]\d+)?\s+minutes?\s+be\s+ready\s+to:\s*/iu;
    const classicMarker = /(?:compare\s+and\s+contrast\s+the\s+photographs|photographs):\s*/iu;

    const readyMatch = readyMarker.exec(source);
    const classicMatch = classicMarker.exec(source);
    const marker = readyMatch || classicMatch;

    let intro = source;
    let points = [];
    let closing = '';

    if (marker) {
      const markerIndex = marker.index ?? 0;
      const afterStart = markerIndex + marker[0].length;
      intro = backupTextClean(source.slice(0, afterStart));

      const after = source.slice(afterStart);
      const closingIndex = after.search(
        /You\s+will\s+speak\s+for\s+not\s+more\s+than\s+[23]\s+minutes?(?:\s*\([^)]*\))?\.?/iu
      );

      const bulletText = closingIndex >= 0 ? after.slice(0, closingIndex) : after;
      closing = speakingCleanTail(closingIndex >= 0 ? after.slice(closingIndex) : '');
      points = speakingTask4SplitPoints(bulletText);
    }

    return { intro, points, closing };
  }

  function renderSpeakingInstruction(unit, model) {
    let parsed = null;
    if (unit?.exam_bucket === 'speaking_2') parsed = speakingTask2Model(model);
    if (unit?.exam_bucket === 'speaking_3') parsed = speakingTask3Model(model);
    if (unit?.exam_bucket === 'speaking_4') parsed = speakingTask4Model(model);
    if (!parsed) return '';

    if (unit?.exam_bucket === 'speaking_2') {
      return `
        <section class="backup-learning-section backup-instruction-section backup-speaking-instruction">
          <span class="backup-block-label">ИНСТРУКЦИЯ</span>
          <div class="backup-speaking-lead">Дайте развернутый ответ.</div>
          ${parsed.intro ? `<div class="backup-speaking-intro">${esc(parsed.intro)}</div>` : ''}
          ${parsed.points?.length ? `
            <ol class="backup-speaking-numbered-list">
              ${parsed.points.map(point => `<li value="${point.n}">${esc(point.text)}</li>`).join('')}
            </ol>` : ''}
          ${parsed.closing ? `<div class="backup-speaking-closing">${esc(parsed.closing)}</div>` : ''}
        </section>`;
    }

    return `
      <section class="backup-learning-section backup-instruction-section backup-speaking-instruction">
        <span class="backup-block-label">ИНСТРУКЦИЯ</span>
        <div class="backup-speaking-lead">Дайте развернутый ответ.</div>
        ${parsed.intro ? `<div class="backup-speaking-intro">${esc(parsed.intro)}</div>` : ''}
        ${parsed.points?.length ? `
          <ul class="backup-speaking-bullet-list">
            ${parsed.points.map(point => `<li>${esc(point)}</li>`).join('')}
          </ul>` : ''}
        ${parsed.closing ? `<div class="backup-speaking-closing">${esc(parsed.closing)}</div>` : ''}
      </section>`;
  }

  function collectSpeakingTableStrings(value, out = []) {
    if (value === null || value === undefined) return out;
    if (typeof value === 'string') {
      if (value.trim()) out.push(value);
      return out;
    }
    if (Array.isArray(value)) {
      for (const part of value) collectSpeakingTableStrings(part, out);
      return out;
    }
    if (typeof value === 'object') {
      for (const part of Object.values(value)) collectSpeakingTableStrings(part, out);
    }
    return out;
  }

  function speakingMediaBasename(value) {
    const raw = String(value ?? '').split(/[?#]/)[0];
    const part = raw.split('/').pop() || raw;
    try { return decodeURIComponent(part).toLocaleLowerCase('en-US'); }
    catch { return part.toLocaleLowerCase('en-US'); }
  }

  function speakingPictureRefs(item) {
    const strings = collectSpeakingTableStrings(item?.item_tables || []);
    const labeled = [];
    const all = [];

    for (const raw of strings) {
      const text = String(raw);

      for (const match of text.matchAll(/Photo\s*([1-9])\.?\s*ShowPictureQ\w*\(\s*['"]([^'"]+\.(?:jpe?g|png|gif|webp))['"]/giu)) {
        labeled.push({ label: `Photo ${Number(match[1])}`, path: match[2] });
      }

      for (const match of text.matchAll(/ShowPictureQ\w*\(\s*['"]([^'"]+\.(?:jpe?g|png|gif|webp))['"]/giu)) {
        all.push(match[1]);
      }
    }

    const dedupeLabeled = [];
    const seenLabeled = new Set();
    for (const row of labeled) {
      const key = `${row.label}|${speakingMediaBasename(row.path)}`;
      if (!seenLabeled.has(key)) {
        seenLabeled.add(key);
        dedupeLabeled.push(row);
      }
    }

    return {
      labeled: dedupeLabeled.sort((a,b) => Number(a.label.replace(/\D/g,'')) - Number(b.label.replace(/\D/g,''))),
      all: [...new Set(all)]
    };
  }

  function speakingMediaRows(unit, model) {
    const expected = unit?.exam_bucket === 'speaking_2' ? 1 : unit?.exam_bucket === 'speaking_3' ? 3 : 2;
    const item = model?.items?.[0]?.item;
    const rows = backupMediaForUnit(unit.id).filter(({ media }) => media?.kind === 'image');
    const refs = speakingPictureRefs(item);
    const picked = [];
    const seen = new Set();

    const addByRef = (ref, label = '') => {
      const base = speakingMediaBasename(ref);
      const row = rows.find(({ media }) => speakingMediaBasename(media?.official_url) === base);
      if (!row || seen.has(row.media.media_id)) return;
      seen.add(row.media.media_id);
      picked.push({ ...row, label });
    };

    // Speaking 3/4 tables explicitly label Photo 1 / Photo 2 / Photo 3.
    // This also safely excludes the decorative blue “4” PNG in Speaking 4.
    for (const ref of refs.labeled) addByRef(ref.path, ref.label);

    // Speaking 2 normally has one advertisement image without a Photo label.
    if (picked.length < expected) {
      for (const ref of refs.all) {
        addByRef(ref, '');
        if (picked.length >= expected) break;
      }
    }

    // Defensive fallback for legacy rows where ShowPictureQ paths were not retained.
    if (picked.length < expected) {
      let fallback = rows.filter(({ media }) => !seen.has(media.media_id));
      if (unit?.exam_bucket === 'speaking_4' && fallback.length > expected - picked.length) {
        const nonTechnical = fallback.filter(({ media }) => {
          const url = String(media?.official_url || '');
          return !/_5_\d+\.png(?:[?#]|$)/iu.test(url);
        });
        if (nonTechnical.length >= expected - picked.length) fallback = nonTechnical;
      }
      for (const row of fallback) {
        if (seen.has(row.media.media_id)) continue;
        seen.add(row.media.media_id);
        picked.push({ ...row, label: '' });
        if (picked.length >= expected) break;
      }
    }

    return picked.slice(0, expected).map((row, index) => ({
      ...row,
      label: row.label || (unit?.exam_bucket === 'speaking_2' ? 'Объявление' : `Photo ${index + 1}`)
    }));
  }

  function renderSpeakingMedia(unit, model) {
    const rows = speakingMediaRows(unit, model);
    if (!rows.length) return '';

    const task2 = unit?.exam_bucket === 'speaking_2';
    const adTitle = task2 ? (speakingTask2Model(model)?.adTitle || '') : '';
    const countClass = `speaking-count-${rows.length}`;

    return `
      <section class="backup-learning-section backup-media-section backup-speaking-media-section">
        <span class="backup-block-label">${task2 ? 'ОБЪЯВЛЕНИЕ' : 'ФОТОГРАФИИ'}</span>
        ${adTitle ? `<div class="backup-speaking-ad-title">${esc(adTitle)}</div>` : ''}
        <div class="backup-media-grid backup-speaking-media-grid ${countClass}">
          ${rows.map(({ media, label }) => {
            const ready = Boolean(media.backup_ready && media.backup_path);
            return `
              <article class="backup-media-card image-card backup-speaking-photo-card" data-backup-media-card="${esc(media.media_id)}">
                <div class="backup-media-head">
                  <span class="backup-media-kind">${esc(label)}</span>
                  <span class="backup-media-status">${ready ? 'Яндекс-резерв' : 'недоступно'}</span>
                </div>
                <div class="backup-media-slot" data-backup-media-slot="${esc(media.media_id)}">
                  ${ready
                    ? `<div class="backup-loading"><div class="backup-spinner"></div>Получаю защищённую ссылку…</div>`
                    : `<div class="backup-media-error">Официальный файл изображения ФИПИ повреждён или пуст в исходнике. Текст задания сохранён; используйте кнопку «Оригинал ФИПИ» для контрольной проверки.</div>`}
                </div>
              </article>`;
          }).join('')}
        </div>
      </section>`;
  }

  function renderSpeakingAudio(unit) {
    const rows = backupMediaForUnit(unit.id).filter(({ media }) => media?.kind === 'audio');
    if (!rows.length) return '';

    return `
      <section class="backup-learning-section backup-media-section backup-speaking-media-section">
        <span class="backup-block-label">АУДИО</span>
        <div class="backup-media-grid">
          ${rows.map(({ media }, idx) => {
            const ready = Boolean(media.backup_ready && media.backup_path);
            return `
              <article class="backup-media-card" data-backup-media-card="${esc(media.media_id)}">
                <div class="backup-media-head">
                  <span class="backup-media-kind">Аудио${rows.length > 1 ? ` ${idx + 1}` : ''}</span>
                  <span class="backup-media-status">${ready ? 'Яндекс-резерв' : 'недоступно'}</span>
                </div>
                <div class="backup-media-slot" data-backup-media-slot="${esc(media.media_id)}">
                  ${ready
                    ? `<div class="backup-loading"><div class="backup-spinner"></div>Загружаю…</div>`
                    : `<div class="backup-media-error">Резервное аудио недоступно.</div>`}
                </div>
              </article>`;
          }).join('')}
        </div>
      </section>`;
  }

  function renderSpeakingTask(unit, model) {
    if (!speakingBucket(unit)) return '';
    const instruction = renderSpeakingInstruction(unit, model);
    const speaking3Audio = unit?.exam_bucket === 'speaking_3' ? renderSpeakingAudio(unit) : '';
    return `${instruction}${speaking3Audio || renderSpeakingMedia(unit, model)}`;
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
    return ['reading_10', 'listening_1', 'listening_2'].includes(unit?.exam_bucket);
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
      if (cells.length < 2) continue;

      const normalizedCells = cells.map(cell => cell.replace(/\s+/g, ' ').trim().toLocaleLowerCase('ru-RU'));
      const uniqueCells = [...new Set(normalizedCells)];
      if (uniqueCells.length === 1 && looksLikeInstruction(cells[0])) continue;
      if (cells.every(cell => looksLikeInstruction(cell))) continue;

      // Ignore FIPI answer-selector matrices such as ABCDEF / 1234567.
      const joined = cells.join('').replace(/\s+/g, '');
      if (/^[A-GА-Е]{4,8}(?:1234567){2,}$/iu.test(joined)) continue;
      if (cells.every(cell => /^[A-GА-Е]$|^12345678?$|^Говорящий$|^Утверждение$/iu.test(cell))) continue;

      clean.push(cells);
    }
    const concise = clean.filter(cells => cells.length <= 5 && cells.join(' ').length <= 1200);
    return (concise.length ? concise : clean).slice(0, 40);
  }

  function renderStructuredRows(rows) {
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

  function isOptionNumber(value) {
    return /^[1-8][.)]?$/.test(backupTextClean(value));
  }

  function choiceModelFromTables(value) {
    const leaf = tableLeafRows(value);
    const optionMap = new Map();

    for (const cells of leaf) {
      for (let i = 0; i < cells.length - 1; i += 1) {
        const rawNo = backupTextClean(cells[i]);
        const option = backupTextClean(cells[i + 1]).replace(/\s+/g, ' ');
        if (!isOptionNumber(rawNo) || !option || option.length > 320) continue;
        const no = rawNo.replace(/[.)]/g, '');
        if (!optionMap.has(no) && !/^(?:true|false|not stated)$/iu.test(option)) optionMap.set(no, option);
      }
    }

    const options = [...optionMap.entries()].sort((a,b) => Number(a[0]) - Number(b[0]));
    if (options.length < 2) return null;

    const optionValues = new Set(options.map(([,v]) => instructionCmp(v)));
    const candidates = [];
    for (const cells of leaf) {
      for (const raw of cells) {
        const candidate = backupTextClean(raw).replace(/\s+/g, ' ');
        const cmp = instructionCmp(candidate);
        if (candidate.length < 12 || candidate.length > 700) continue;
        if (looksLikeInstruction(candidate) || optionValues.has(cmp) || isOptionNumber(candidate)) continue;
        if (/^[A-GА-Е]{4,8}(?:12345678?){2,}$/iu.test(candidate.replace(/\s+/g,''))) continue;
        const markers = (candidate.match(/(?:^|\s)[1-8][.)]\s+/g) || []).length;
        if (markers >= 2) continue;
        let score = candidate.length;
        if (/[?？]\s*$/.test(candidate)) score += 500;
        if (/[…]{1}|\.{3}\s*$/.test(candidate)) score += 250;
        if (/_{3,}/.test(candidate)) score += 120;
        candidates.push({ candidate, score });
      }
    }
    candidates.sort((a,b) => b.score - a.score);
    return { prompt: candidates[0]?.candidate || '', options };
  }

  function renderChoiceRows(choice) {
    if (!choice?.options?.length) return '';
    return renderStructuredRows(choice.options.map(([n,v]) => [`${n})`, v]));
  }

  function stripOptionsFromBody(body, options) {
    let text = backupTextClean(body);
    if (!text || !options?.length) return text;
    let cut = text.length;
    for (const [n, value] of options) {
      const exact = `${n}) ${value}`;
      const dot = `${n}. ${value}`;
      for (const needle of [exact, dot, value]) {
        const idx = text.indexOf(needle);
        if (idx >= 0) cut = Math.min(cut, idx);
      }
      if (Number(n) === 1 && cut < text.length) break;
    }
    if (cut < text.length) text = text.slice(0, cut);
    return backupTextClean(text);
  }

  function stripAnswerMatrixTail(value) {
    return backupTextClean(value)
      .replace(/\s+(?:Говорящий|Текст|Утверждение)?\s*[A-GА-Е]{4,8}\s*(?:(?:1\s*2\s*3\s*4\s*5\s*6\s*7(?:\s*8)?\s*){2,})$/iu, '')
      .replace(/\s+[A-GА-Е]{4,8}\s*(?:12345678?\s*){2,}$/iu, '')
      .trim();
  }

  function cleanReading11Body(body, tables) {
    const choice = choiceModelFromTables(tables);
    let text = backupTextClean(body);

    const instructionStart = text.search(/Прочитайте\s+текст\s+и\s+заполните\s+пропуски/iu);
    if (instructionStart === 0) {
      const endMatch = /Занесите\s+цифры,\s*обозначающие\s+соответствующие\s+части\s+предложений,\s*в\s+таблицу\./iu.exec(text);
      if (endMatch) text = backupTextClean(text.slice((endMatch.index || 0) + endMatch[0].length));
    }

    text = stripOptionsFromBody(text, choice?.options || []);
    text = stripAnswerMatrixTail(text);
    return backupTextClean(text);
  }

  function grammarPairFromTables(value, fallbackBody = '') {
    const leaf = tableLeafRows(value);
    for (const cells of leaf) {
      if (cells.length !== 2) continue;
      const left = backupTextClean(cells[0]).replace(/\s+/g, ' ');
      const right = backupTextClean(cells[1]).replace(/\s+/g, ' ');
      if (left.length < 8 || right.length > 45 || /[.!?,;:]/.test(right)) continue;
      const letters = right.replace(/[^A-Za-zА-ЯЁ]/g, '');
      if (!letters || right !== right.toUpperCase()) continue;
      return { text: left, source: right };
    }

    const body = backupTextClean(fallbackBody);
    const m = body.match(/^(.*?)(?:\s+)([A-ZА-ЯЁ]+(?:\s+[A-ZА-ЯЁ]+){0,2})$/u);
    if (m && m[1].length > 8) return { text: backupTextClean(m[1]), source: m[2] };
    return null;
  }

  function bucketExamRange(unit) {
    const configured = BUCKET_EXAM_RANGES[unit?.exam_bucket];
    if (configured) return { start: configured[0], end: configured[1] };
    const title = String(unit?.title || '');
    const m = title.match(/задания?\s+(\d+)(?:\s*[–-]\s*(\d+))?/iu);
    if (!m) return null;
    return { start: Number(m[1]), end: Number(m[2] || m[1]) };
  }

  function examNumberForItem(unit, item, index, examNumbers = null) {
    if (Array.isArray(examNumbers) && Number.isFinite(Number(examNumbers[index]))) return Number(examNumbers[index]);
    const range = bucketExamRange(unit);
    const local = Number(item?.group_position || index + 1 || 1);
    if (!range) return local;

    // If the source already carries a real exam number rather than a local 1..N,
    // preserve it. Local group labels are remapped to the exam range below.
    const labelMatch = String(item?.display_label || '').match(/(?:Задание\s*)?(\d{1,2})/iu);
    if (labelMatch) {
      const n = Number(labelMatch[1]);
      const groupSize = Math.max(1, range.end - range.start + 1);
      const looksLocal = range.start > 1 && n >= 1 && n <= groupSize;
      if (!looksLocal && n >= 1 && n <= 50) return n;
    }
    return range.start + Math.max(0, local - 1);
  }

  function splitStructuredQuestion(value) {
    const choice = choiceModelFromTables(value);
    if (choice) return { question: choice.prompt, rows: choice.options.map(([n,v]) => [`${n})`, v]) };

    const rows = structuredTableRows(value);
    if (!rows.length) return { question: '', rows: [] };
    const first = rows[0];
    if (first.length >= 2) {
      const normalized = first.map(cell => instructionCmp(cell));
      const unique = [...new Set(normalized.filter(Boolean))];
      if (unique.length === 1 && unique[0] && !looksLikeInstruction(first[0])) {
        return { question: backupTextClean(first[0]), rows: rows.slice(1) };
      }
    }
    return { question: '', rows };
  }

  function renderItemTables(value) {
    return renderStructuredRows(structuredTableRows(value));
  }

  function stripGenericExpandedAnswerLead(value) {
    return backupTextClean(value)
      .replace(/^Задание\s*№\s*\d+\.\s*/iu, '')
      .replace(/^Дайте\s+развернутый\s+ответ\.\s*/iu, '')
      .trim();
  }

  function writing37EmailParts(item, remainder) {
    const singleCells = tableLeafRows(item?.item_tables || [])
      .filter(row => row.length === 1)
      .map(row => backupTextClean(row[0]))
      .filter(Boolean);

    const unique = [...new Set(singleCells)];
    const from = unique.find(x => /^(?:From:|FroTAG_HERE\b)/iu.test(x));
    const to = unique.find(x => /^To:/iu.test(x));
    const subject = unique.find(x => /^Subject:/iu.test(x));
    const quote = unique.find(x => /^(?:…|\.{3})/u.test(x));

    if (from || to || subject || quote) {
      const meta = [from, to, subject]
        .filter(Boolean)
        .map(x => x.replace(/^FroTAG_HERE\b/iu, 'From:'));
      return {
        meta,
        quote: backupTextClean(quote || remainder)
      };
    }

    const text = backupTextClean(remainder);
    const ellipsis = text.search(/(?:…|\.{3})/u);
    if (ellipsis >= 0) {
      const metaText = backupTextClean(text.slice(0, ellipsis));
      const meta = metaText
        .split(/\s+(?=(?:To|Subject):)/u)
        .map(backupTextClean)
        .filter(Boolean)
        .map(x => x.replace(/^FroTAG_HERE\b/iu, 'From:'));
      return {
        meta,
        quote: backupTextClean(text.slice(ellipsis))
      };
    }
    return { meta: [], quote: text };
  }

  function writing37Model(model) {
    const row = model?.items?.[0];
    let text = stripGenericExpandedAnswerLead(row?.body || row?.item?.item_text || model?.context?.[0] || '');
    if (!text) return null;

    const letterStart = text.search(/You have received (?:an email message|a letter) from/iu);
    const start = letterStart >= 0 ? letterStart : 0;
    const afterStart = text.slice(start);
    const writeRelative = afterStart.search(/\bWrite\s+(?:a|an)\s+(?:letter|email|message)\s+to\b/iu);
    const writeStart = writeRelative >= 0 ? start + writeRelative : -1;

    const letter = backupTextClean(text.slice(start, writeStart >= 0 ? writeStart : text.length));
    let instruction = writeStart >= 0 ? backupTextClean(text.slice(writeStart)) : backupTextClean(model?.instruction || '');
    if (!instruction || /^Дайте\s+развернутый\s+ответ\.?$/iu.test(instruction)) {
      instruction = 'Напишите ответное электронное письмо, ответьте на вопросы и выполните все пункты задания.';
    }

    let letterLead = '';
    let letterMeta = [];
    let letterQuote = letter;

    const oldLetter = letter.match(/^(You have received a letter from[\s\S]*?who writes:)\s*([\s\S]*)$/iu);
    if (oldLetter) {
      letterLead = backupTextClean(oldLetter[1]);
      letterQuote = backupTextClean(oldLetter[2]);
    } else {
      const email = letter.match(/^(You have received an email message from[^:]+:)\s*([\s\S]*)$/iu);
      if (email) {
        letterLead = backupTextClean(email[1]);
        const parsed = writing37EmailParts(row?.item, email[2]);
        letterMeta = parsed.meta;
        letterQuote = parsed.quote;
      }
    }

    const words = instruction.match(/Write\s+(\d+)\s*[–-]\s*(\d+)\s+words/iu)
      || text.match(/Write\s+(\d+)\s*[–-]\s*(\d+)\s+words/iu);
    const answerTitle = words ? `ВАШ ОТВЕТ (${words[1]}–${words[2]} СЛОВ)` : 'ВАШ ОТВЕТ';
    return { instruction, letter, letterLead, letterMeta, letterQuote, answerTitle };
  }

  function writing37InstructionHtml(value) {
    const text = backupTextClean(value);
    if (!text) return '';

    const marker = /\bIn your (letter|email|message)\b/iu.exec(text);
    const inLetter = marker?.index ?? -1;
    const markerLabel = marker ? `In your ${marker[1]}:` : 'In your letter:';
    const wordCount = text.search(/\bWrite\s+\d+\s*[–-]\s*\d+\s+words\.?/iu);
    const remember = text.search(/\bRemember the rules of (?:letter|email) writing\.?/iu);

    const intro = backupTextClean(text.slice(0, inLetter >= 0 ? inLetter : (wordCount >= 0 ? wordCount : text.length)));
    let bullets = [];
    if (inLetter >= 0) {
      const bulletEnd = wordCount >= 0 ? wordCount : (remember >= 0 ? remember : text.length);
      let block = backupTextClean(text.slice(inLetter, bulletEnd));
      block = block.replace(/^In your (?:letter|email|message)\s*:?\s*/iu, '');
      bullets = block.split(/\s+[-–−]\s+(?=[A-Za-z])/u).map(backupTextClean).filter(Boolean);
    }
    const wordLine = wordCount >= 0
      ? backupTextClean((text.slice(wordCount).match(/^Write\s+\d+\s*[–-]\s*\d+\s+words\.?/iu) || [])[0] || '')
      : '';
    const rememberLine = remember >= 0 ? backupTextClean(text.slice(remember)) : '';

    return `
      ${intro ? `<p class="backup-writing37-action">${esc(intro)}</p>` : ''}
      ${bullets.length ? `<div class="backup-writing37-in-letter">${esc(markerLabel)}</div><ul class="backup-writing37-bullets">${bullets.map(x => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
      ${wordLine ? `<p class="backup-writing37-wordline">${esc(wordLine)}</p>` : ''}
      ${rememberLine ? `<p class="backup-writing37-remember">${esc(rememberLine)}</p>` : ''}
    `;
  }

  function renderWritingAnswerArea(title, placeholder) {
    return `
      <section class="backup-learning-section backup-writing-answer-section">
        <span class="backup-block-label">${esc(title)}</span>
        <p class="backup-writing-answer-hint">Поле можно заполнить на экране или оставить пустым для распечатки.</p>
        <textarea class="backup-answer-textarea" spellcheck="false" placeholder="${esc(placeholder)}"></textarea>
      </section>
    `;
  }

  function renderWriting37(unit, model) {
    const writing = writing37Model(model);
    if (!writing) return '';
    return `
      <section class="backup-learning-section backup-instruction-section backup-writing37-instruction">
        <span class="backup-block-label">ИНСТРУКЦИЯ</span>
        <div class="backup-readable-text backup-instruction-text">${writing37InstructionHtml(writing.instruction)}</div>
      </section>
      ${renderMediaCards(unit)}
      <section class="backup-learning-section backup-writing-letter-section">
        <span class="backup-block-label">ПИСЬМО</span>
        ${writing.letterLead ? `<div class="backup-writing-letter-lead">${esc(writing.letterLead)}</div>` : ''}
        ${writing.letterMeta?.length ? `<div class="backup-writing-letter-lead">${writing.letterMeta.map(line => `<div>${esc(line)}</div>`).join('')}</div>` : ''}
        <div class="backup-writing-letter-quote">${esc(writing.letterQuote || writing.letter)}</div>
      </section>
      ${renderWritingAnswerArea(writing.answerTitle, 'Напишите ответ здесь…')}
    `;
  }

  function writingPlanHtml(value) {
    let text = backupTextClean(value).replace(/^Use the following plan:\s*/iu, '');
    if (!text) return '';
    const parts = text.split(/\s+[–−]\s+(?=[A-Za-zА-ЯЁ])/u).map(backupTextClean).filter(Boolean);
    if (parts.length < 2) {
      const hyphenParts = text.split(/\s+-\s+(?=[A-Za-zА-ЯЁ])/u).map(backupTextClean).filter(Boolean);
      if (hyphenParts.length >= 2) return `<ul class="backup-writing-plan-list">${hyphenParts.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
      return `<div class="backup-readable-text backup-writing-plan-text">${esc(text)}</div>`;
    }
    return `<ul class="backup-writing-plan-list">${parts.map(x => `<li>${esc(x)}</li>`).join('')}</ul>`;
  }

  function writing38TableRows(item) {
    const rows = structuredTableRows(item?.item_tables || []);
    const numeric = value => /^\d+(?:[.,]\d+)?%?$/u.test(backupTextClean(value));

    // FIPI uses many different table headers in task 38:
    // Options / Reasons / Places / Advantages / Item of expenditure / etc.
    // Detect the table by structure instead of one literal header:
    // header row + at least 3 consecutive two-cell rows with numeric values.
    for (let i = 0; i < rows.length; i += 1) {
      const header = rows[i];
      if (header.length < 2) continue;

      const data = [];
      for (let j = i + 1; j < rows.length; j += 1) {
        const row = rows[j];
        if (row.length !== 2 || !numeric(row[1])) break;
        data.push(row);
        if (data.length >= 10) break;
      }
      if (data.length >= 3) return [header, ...data];
    }
    return [];
  }

  function splitWriting38Segments(value) {
    const text = stripGenericExpandedAnswerLead(value);
    if (!text) return [];

    // Covers all modern FIPI wordings:
    // “project on ...”, “project called ...”, and “project “Family budget...””.
    const starts = [...text.matchAll(/\bImagine that you are doing a project\b/giu)].map(m => m.index ?? 0);
    if (!starts.length) return [text];

    const segments = [];
    for (let i = 0; i < starts.length; i += 1) {
      const end = i + 1 < starts.length ? starts[i + 1] : text.length;
      const part = backupTextClean(text.slice(starts[i], end));
      if (part) segments.push(part);
    }
    return segments;
  }

  function writing38StripInlineTable(prompt, tableRows = []) {
    let text = backupTextClean(prompt);
    if (!text || !tableRows.length || tableRows[0].length < 2) return text;

    const escapeRx = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const header = tableRows[0].slice(0, 2).map(backupTextClean);
    const rx = new RegExp(`${escapeRx(header[0])}\\s+${escapeRx(header[1])}`, 'iu');
    const match = rx.exec(text);
    if (match) text = backupTextClean(text.slice(0, match.index));
    return text;
  }

  function writing38AlternativeModel(segment, tableRows = []) {
    let text = backupTextClean(segment);
    const writeIndex = text.search(/\bWrite\s+200\s*[–-]\s*250\s+words\./iu);
    let prompt = backupTextClean(writeIndex >= 0 ? text.slice(0, writeIndex) : text);
    let requirements = backupTextClean(writeIndex >= 0 ? text.slice(writeIndex) : '');

    prompt = writing38StripInlineTable(prompt, tableRows);

    const planIndex = requirements.search(/\bUse the following plan:/iu);
    const wordLine = backupTextClean(planIndex >= 0 ? requirements.slice(0, planIndex) : requirements);
    const plan = backupTextClean(planIndex >= 0 ? requirements.slice(planIndex) : '');
    const wantsGraphic = /\b(?:diagram|pie chart|chart|graph)\s+below\b/iu.test(prompt);
    const wantsTable = /\btable\s+below\b/iu.test(prompt) || tableRows.length > 0;
    return { prompt, wordLine, plan, wantsGraphic, wantsTable };
  }

  function renderWriting38InlineMedia(unit) {
    const rows = backupMediaForUnit(unit.id).filter(({ media }) => media?.kind === 'image');
    if (!rows.length) return '';
    return `
      <div class="backup-writing-data-block">
        <span class="backup-writing-sub-label">ДАННЫЕ / ДИАГРАММА</span>
        <div class="backup-media-grid backup-writing-media-grid">
          ${rows.map(({ media }, idx) => {
            const ready = Boolean(media.backup_ready && media.backup_path);
            return `
              <article class="backup-media-card image-card backup-writing-media-card" data-backup-media-card="${esc(media.media_id)}">
                <div class="backup-media-head">
                  <span class="backup-media-kind">Изображение ${idx + 1}</span>
                  <span class="backup-media-status">${ready ? 'Яндекс-резерв' : 'недоступно'}</span>
                </div>
                <div class="backup-media-slot" data-backup-media-slot="${esc(media.media_id)}">
                  ${ready ? `<div class="backup-loading"><div class="backup-spinner"></div>Загружаю…</div>` : `<div class="backup-media-error">Резервный файл недоступен.</div>`}
                </div>
              </article>`;
          }).join('')}
        </div>
      </div>`;
  }

  function renderWriting38(unit, model) {
    const row = model?.items?.[0];
    const source = row?.body || row?.item?.item_text || model?.context?.[0] || '';
    const segments = splitWriting38Segments(source);
    if (!segments.length) return '';
    const tableRows = writing38TableRows(row?.item);
    let mediaUsed = false;

    const instructionText = segments.length > 1
      ? 'Выберите ОДИН из предложенных вариантов задания и выполните его согласно данному плану.'
      : (model?.instruction && !/^Дайте\s+развернутый\s+ответ\.?$/iu.test(model.instruction)
          ? model.instruction
          : 'Выполните письменное задание согласно данному плану.');

    const variants = segments.map((segment, index) => {
      const alt = writing38AlternativeModel(segment, index === 0 ? tableRows : []);
      const tableHtml = index === 0 && tableRows.length ? renderStructuredRows(tableRows) : '';
      let mediaHtml = '';
      if (alt.wantsGraphic && !mediaUsed) {
        mediaHtml = renderWriting38InlineMedia(unit);
        if (mediaHtml) mediaUsed = true;
      }
      return `
        <article class="backup-writing-variant">
          <div class="backup-writing-variant-head">
            <span>ВАРИАНТ ${index + 1}</span>
          </div>
          <div class="backup-writing-part">
            <span class="backup-writing-sub-label">ЗАДАНИЕ</span>
            <div class="backup-readable-text backup-writing-prompt">${esc(alt.prompt)}</div>
          </div>
          ${tableHtml ? `<div class="backup-writing-data-block"><span class="backup-writing-sub-label">ДАННЫЕ / ТАБЛИЦА</span>${tableHtml}</div>` : ''}
          ${mediaHtml}
          ${alt.wordLine ? `<div class="backup-writing-word-count">${esc(alt.wordLine)}</div>` : ''}
          ${alt.plan ? `<div class="backup-writing-plan"><span class="backup-writing-sub-label">ПЛАН</span>${writingPlanHtml(alt.plan)}</div>` : ''}
        </article>`;
    }).join('');

    // If a legacy task has an image but its text does not explicitly say diagram/chart,
    // keep the media visible instead of silently losing it.
    const leftoverMedia = !mediaUsed && backupMediaForUnit(unit.id).some(({ media }) => media?.kind === 'image')
      ? renderWriting38InlineMedia(unit)
      : '';

    return `
      <section class="backup-learning-section backup-instruction-section">
        <span class="backup-block-label">ИНСТРУКЦИЯ</span>
        <div class="backup-readable-text backup-instruction-text">${esc(instructionText)}</div>
      </section>
      <section class="backup-learning-section backup-writing38-section">
        <span class="backup-block-label">МАТЕРИАЛ ЗАДАНИЯ</span>
        <div class="backup-writing-variants">${variants}</div>
        ${leftoverMedia}
      </section>
      ${renderWritingAnswerArea('ВАШЕ ЭССЕ (200–250 СЛОВ)', 'Напишите эссе здесь…')}
    `;
  }

  function renderAnswerSheet(unit, model = null) {
    let labels = [];
    let rowLabel = 'Задание';

    if (unit?.exam_bucket === 'reading_10') {
      labels = ['A','B','C','D','E','F','G'];
      rowLabel = 'Текст';
    } else if (unit?.exam_bucket === 'reading_11') {
      labels = ['A','B','C','D','E','F'];
      rowLabel = 'Пропуск';
    } else if (unit?.exam_bucket === 'listening_1') {
      labels = ['A','B','C','D','E','F'];
      rowLabel = 'Говорящий';
    } else if (unit?.exam_bucket === 'listening_2') {
      labels = ['A','B','C','D','E','F','G'];
      rowLabel = 'Утверждение';
    } else if (['listening_3_9','reading_12_18','grammar_19_24','wordformation_25_29','vocabulary_30_36'].includes(unit?.exam_bucket)) {
      if (Array.isArray(model?.examNumbers) && model.examNumbers.length) {
        labels = model.examNumbers.map(String);
      } else {
        const range = bucketExamRange(unit);
        if (range) labels = Array.from({ length: range.end - range.start + 1 }, (_, i) => String(range.start + i));
      }
    } else {
      return '';
    }

    if (!labels.length) return '';
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

    if (model.items.length === 1) {
      const only = model.items[0];
      let table = '';

      if (unit?.exam_bucket === 'reading_11') {
        const choice = choiceModelFromTables(only.item.item_tables);
        table = renderChoiceRows(choice);
      } else {
        table = renderItemTables(only.item.item_tables);
      }
      if (!table) return '';

      const listening2Legend = unit?.exam_bucket === 'listening_2'
        ? `
          <div class="backup-answer-legend" aria-label="Варианты ответа">
            <span><b>1</b> — True</span>
            <span><b>2</b> — False</span>
            <span><b>3</b> — Not stated</span>
          </div>
        `
        : '';

      return `
        <section class="backup-learning-section backup-options-section">
          <span class="backup-block-label">${unit?.exam_bucket === 'listening_2' ? 'УТВЕРЖДЕНИЯ И ВАРИАНТЫ ОТВЕТА' : 'ВАРИАНТЫ / ТАБЛИЦА'}</span>
          ${listening2Legend}
          ${table}
        </section>
      `;
    }

    const grammarLike = ['grammar_19_24','wordformation_25_29'].includes(unit?.exam_bucket);
    const choiceLike = ['listening_3_9','reading_12_18','vocabulary_30_36'].includes(unit?.exam_bucket);

    return `
      <section class="backup-learning-section backup-subtasks-section">
        <span class="backup-block-label">ОТДЕЛЬНЫЕ ЗАДАНИЯ</span>
        <div class="backup-items">
          ${model.items.map(({ item, body }, index) => {
            const examNo = examNumberForItem(unit, item, index, model.examNumbers);
            const choice = choiceModelFromTables(item.item_tables);
            const grammar = grammarLike ? grammarPairFromTables(item.item_tables, body) : null;

            let displayBody = body;
            let detailHtml = '';

            if (grammar) {
              displayBody = grammar.text;
              detailHtml = `<div class="backup-source-word-line"><span>Исходное слово</span><strong>${esc(grammar.source)}</strong></div>`;
            } else if (choiceLike || choice) {
              displayBody = choice?.prompt || stripOptionsFromBody(body, choice?.options || []);
              if (/^\d+[.)]?$/.test(backupTextClean(displayBody))) displayBody = '';
              detailHtml = renderChoiceRows(choice);
            } else {
              const structured = splitStructuredQuestion(item.item_tables);
              displayBody = structured.question || body;
              detailHtml = renderStructuredRows(structured.rows);
            }

            return `
              <article class="backup-item-card">
                <div class="backup-item-head">
                  <div>
                    <div class="backup-item-number">Задание ${esc(examNo)}</div>
                    <span class="backup-item-ref">FIPI ${esc(item.fipi_id || '—')}</span>
                  </div>
                  <span class="backup-kes">${esc(item.live_kes_code ? `КЭС ${item.live_kes_code}` : 'КЭС —')}</span>
                </div>
                ${displayBody ? `<div class="backup-readable-text backup-item-text">${esc(displayBody)}</div>` : ''}
                ${detailHtml}
              </article>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }

  function visibleMediaRows(unit) {
    let rows = backupMediaForUnit(unit.id);

    // Reading 11 is a text matching task. The one historical GIF linked to 01CE56
    // is a known failed/tiny legacy FIPI asset, not learning content for the task.
    if (isReading11Unit(unit)) return [];

    // Listening pages contain a tiny FIPI “listen” companion GIF beside the real MP3.
    // In Navigator the native HTML audio player replaces that service button.
    if (['listening_1', 'listening_2', 'listening_3_9'].includes(unit?.exam_bucket)) {
      const audioRows = rows.filter(({ media }) => media?.kind === 'audio');
      if (audioRows.length) rows = audioRows;
    }

    return rows;
  }

  function renderMediaCards(unit) {
    const rows = visibleMediaRows(unit);
    if (!rows.length) return '';

    return `
      <section class="backup-learning-section backup-media-section">
        <span class="backup-block-label">МЕДИА К ЗАДАНИЮ</span>
        <div class="backup-media-grid">
          ${rows.map(({ media }, idx) => {
            const ready = Boolean(media.backup_ready && media.backup_path && media.integrity_status === 'verified');
            const kind = media.kind || 'other';
            return `
              <article class="backup-media-card ${kind === 'image' ? 'image-card' : ''}" data-backup-media-card="${esc(media.media_id)}">
                <div class="backup-media-head">
                  <span class="backup-media-kind">${esc(kind === 'audio' ? 'Аудио' : kind === 'image' ? 'Изображение' : kind === 'video' ? 'Видео' : 'Media')} ${idx + 1}</span>
                  <span class="backup-media-status">${ready ? 'Яндекс-резерв' : 'недоступно'}</span>
                </div>
                <div class="backup-media-slot" data-backup-media-slot="${esc(media.media_id)}">
                  ${ready
                    ? `<div class="backup-loading"><div class="backup-spinner"></div>Получаю защищённую ссылку…</div>`
                    : `<div class="backup-media-error">Резервный файл недоступен. Текст задания сохранён.</div>`}
                </div>
              </article>
            `;
          }).join('')}
        </div>
      </section>
    `;
  }

  let vocabularyCacheIndexPromise = null;

  async function requestDirectEgeCache(kind, pageName = '') {
    const { data } = await supabaseClient.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) {
      throw Object.assign(new Error('Сессия Supabase не найдена.'), { authFailure: true });
    }

    const params = new URLSearchParams({ kind });
    if (pageName) params.set('name', pageName);

    let response;
    try {
      response = await fetch(`${EGE_CACHE_DELIVERY_FUNCTION_URL}?${params.toString()}`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          apikey: configuredKey()
        },
        cache: 'no-store'
      });
    } catch (error) {
      throw Object.assign(
        new Error(`ege-cache-delivery network error: ${error?.message || error}`),
        { technicalFailure: true }
      );
    }

    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }

    if (response.status === 401 || response.status === 403) {
      throw Object.assign(
        new Error(payload?.error || `ege-cache-delivery HTTP ${response.status}`),
        { authFailure: true }
      );
    }
    if (!response.ok || !payload?.cache?.url) {
      throw Object.assign(
        new Error(payload?.error || `ege-cache-delivery HTTP ${response.status}`),
        { technicalFailure: true }
      );
    }

    return payload.cache;
  }

  async function fetchDirectCacheJson(kind, pageName = '') {
    const signed = await requestDirectEgeCache(kind, pageName);
    const response = await fetch(signed.url, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`Yandex Object Storage cache HTTP ${response.status}`);
    }
    return await response.json();
  }

  async function loadVocabularyCacheIndexDirect() {
    if (!vocabularyCacheIndexPromise) {
      vocabularyCacheIndexPromise = (async () => {
        const index = await fetchDirectCacheJson('index');
        if (!index || index.artifact !== 'ege_vocab_cache_index' || !index.groups || typeof index.groups !== 'object') {
          throw new Error('Некорректный EGE vocabulary cache index.');
        }
        if (Number(index.target_groups_total || 0) !== 64 || Number(index.mapped_groups_total || 0) !== 64 || Number(index.missing_groups_total || 0) !== 0) {
          throw new Error(
            `EGE vocabulary cache incomplete: mapped=${Number(index.mapped_groups_total || 0)}/64, missing=${Number(index.missing_groups_total || 0)}`
          );
        }
        return index;
      })().catch(error => {
        vocabularyCacheIndexPromise = null;
        throw error;
      });
    }
    return await vocabularyCacheIndexPromise;
  }

  async function fetchVocabularyUnitJsonDirect(unit) {
    if (!unit?.id) throw new Error('EGE unit id is missing.');
    if (unitJsonCache.has(unit.id)) return unitJsonCache.get(unit.id);

    const parentZid = String(unit.parent_zid || '').trim().toUpperCase();
    if (!/^[A-F0-9]{6}$/.test(parentZid)) {
      throw new Error('Vocabulary parent_zid is missing or invalid.');
    }

    const index = await loadVocabularyCacheIndexDirect();
    const route = index.groups?.[parentZid];
    if (!route) throw new Error(`Vocabulary cache route not found for ${parentZid}.`);

    const candidates = [route.primary_path, ...(Array.isArray(route.candidate_paths) ? route.candidate_paths : [])]
      .filter(Boolean)
      .map(value => String(value).replace(/\\/g, '/'));

    const unique = [...new Set(candidates)];
    let lastError = null;

    for (const path of unique) {
      const match = path.match(/(?:^|\/)page_(\d{4})\.json$/i);
      if (!match) continue;
      const pageName = `page_${match[1]}.json`;
      try {
        const payload = await fetchDirectCacheJson('page', pageName);
        unitJsonCache.set(unit.id, payload);
        const generation = vocabularyFormatFromPayload(payload);
        if (generation) saveCachedVocabFormat(parentZid, generation);
        console.info(`EGE vocabulary ${parentZid}: Object Storage direct ${pageName}`);
        return payload;
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError || new Error(`Vocabulary cache page unavailable for ${parentZid}.`);
  }

  async function requestDirectEgeMedia(mediaId) {
    const { data } = await supabaseClient.auth.getSession();
    const token = data?.session?.access_token;
    if (!token) {
      throw Object.assign(new Error('Сессия Supabase не найдена.'), { authFailure: true });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    let response;
    try {
      response = await fetch(
        `${EGE_MEDIA_DELIVERY_FUNCTION_URL}?media_id=${encodeURIComponent(mediaId)}`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            apikey: configuredKey()
          },
          cache: 'no-store',
          signal: controller.signal
        }
      );
    } catch (error) {
      const label = error?.name === 'AbortError'
        ? 'ege-media-delivery timeout (15 s)'
        : `ege-media-delivery network error: ${error?.message || error}`;
      throw Object.assign(new Error(label), { technicalFailure: true });
    } finally {
      clearTimeout(timeout);
    }

    let payload = null;
    try { payload = await response.json(); } catch { payload = null; }

    if (response.status === 401 || response.status === 403) {
      throw Object.assign(
        new Error(payload?.error || `ege-media-delivery HTTP ${response.status}`),
        { authFailure: true }
      );
    }

    if (!response.ok || !payload?.media?.url) {
      throw Object.assign(
        new Error(payload?.error || `ege-media-delivery HTTP ${response.status}`),
        { technicalFailure: true }
      );
    }

    // IMPORTANT: do NOT browser-fetch/probe the object here.
    // <img>/<audio>/<video> receive the signed Yandex URL directly. This avoids
    // Range/CORS preflight stalls and keeps all content bytes on the Yandex -> browser path.
    return {
      url: payload.media.url,
      objectKey: payload.media.object_key || '',
      contentType: payload.media.content_type || '',
      direct: true
    };
  }

  async function resolveBackupMediaSource(mediaId) {
    const direct = await requestDirectEgeMedia(mediaId);
    console.info(`EGE media ${mediaId}: Object Storage direct`);
    return direct;
  }

  async function loadBackupMedia(mediaId) {
    const m = mediaById.get(mediaId);
    const slot = el.backupTaskBody.querySelector(`[data-backup-media-slot="${CSS.escape(mediaId)}"]`);
    if (!m || !slot || slot.dataset.loaded === '1') return;

    try {
      const source = await resolveBackupMediaSource(mediaId);
      slot.dataset.loaded = '1';
      slot.dataset.mediaSource = 'object-storage';

      if (m.kind === 'image') {
        slot.innerHTML = `<img src="${esc(source.url)}" alt="Изображение задания">`;
      } else if (m.kind === 'audio') {
        slot.innerHTML = `<audio controls preload="metadata" src="${esc(source.url)}"></audio><div class="backup-print-media-note">Аудио к заданию доступно в электронной версии Navigator.</div>`;
      } else if (m.kind === 'video') {
        slot.innerHTML = `<video controls preload="metadata" src="${esc(source.url)}"></video><div class="backup-print-media-note">Видео к заданию доступно в электронной версии Navigator.</div>`;
      } else {
        slot.innerHTML = `<a class="button secondary wide backup-media-open" href="${esc(source.url)}" target="_blank" rel="noopener noreferrer">Открыть media</a><div class="backup-print-media-note">Дополнительный media-файл доступен в электронной версии Navigator.</div>`;
      }

      const mediaElement = slot.querySelector('img, audio, video');
      if (mediaElement) {
        mediaElement.addEventListener('error', () => {
          slot.innerHTML = `<div class="backup-media-error">Яндекс-объект не открылся по временной ссылке. Обновите страницу; если ошибка повторится, пришлите FIPI ID задания.</div>`;
        }, { once: true });
      }
    } catch (error) {
      console.error('Backup media load failed:', error);
      slot.innerHTML = `<div class="backup-media-error">Не удалось получить прямую ссылку на media из Яндекс Object Storage.<br>${esc(error?.message || error)}</div>`;
    }
  }

  async function loadAllBackupMedia(unit) {
    const rows = visibleMediaRows(unit).filter(({ media }) =>
      media.backup_ready && media.backup_path && media.integrity_status === 'verified'
    );
    await Promise.allSettled(rows.map(({ media }) => loadBackupMedia(media.media_id)));
  }

  function printBackupTask() {
    // Print from a clean, isolated document instead of printing the dark <dialog>.
    // This avoids Chromium painting leftover dialog/background fragments as dark blocks.
    const source = el.backupTaskDialog?.querySelector('.backup-task-card');
    if (!source) return;

    const clone = source.cloneNode(true);
    const sourceAreas = [...source.querySelectorAll('.backup-answer-textarea')];
    const cloneAreas = [...clone.querySelectorAll('.backup-answer-textarea')];
    cloneAreas.forEach((area, index) => {
      const replacement = document.createElement('div');
      replacement.className = 'backup-print-answer-area';
      const value = sourceAreas[index]?.value?.trim() || '';
      if (value) replacement.textContent = value;
      area.replaceWith(replacement);
    });
    clone.querySelectorAll('.dialog-close, .backup-task-actions, .backup-technical-audio-image, audio, video, .backup-media-open, .backup-spinner, .backup-media-status').forEach(node => node.remove());
    clone.querySelectorAll('.backup-media-card').forEach(card => {
      const hasImage = Boolean(card.querySelector('img'));
      const hasNote = Boolean(card.querySelector('.backup-print-media-note'));
      const hasError = Boolean(card.querySelector('.backup-media-error'));
      if (!hasImage && !hasNote && !hasError) card.remove();
    });
    clone.querySelectorAll('.backup-media-grid').forEach(grid => {
      if (!grid.children.length) grid.closest('.backup-media-section')?.remove();
    });

    const frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.position = 'fixed';
    frame.style.right = '0';
    frame.style.bottom = '0';
    frame.style.width = '1px';
    frame.style.height = '1px';
    frame.style.border = '0';
    frame.style.opacity = '0';
    document.body.appendChild(frame);

    const doc = frame.contentDocument;
    if (!doc) { frame.remove(); return; }

    doc.open();
    doc.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(el.backupTaskTitle?.textContent || 'EGE Navigator')}</title><style>
      @page { size: A4 portrait; margin: 12mm; }
      * { box-sizing: border-box; }
      html, body { margin: 0; padding: 0; background: #fff !important; color: #111; }
      body { font-family: Arial, Helvetica, sans-serif; font-size: 10.5pt; line-height: 1.45; }
      .backup-task-card { background:#fff !important; color:#111 !important; padding:0; margin:0; border:0; box-shadow:none; }
      .backup-task-head { display:block; padding:0 0 6mm; margin:0 0 5mm; border-bottom:1px solid #777; }
      .gold-kicker, .backup-block-label, .backup-item-number { color:#6b541b; font-weight:800; }
      .gold-kicker, .backup-block-label { font-size:8pt; letter-spacing:.08em; text-transform:uppercase; }
      .backup-task-head h3 { margin:2mm 0 1mm; font:700 22pt/1.1 Georgia, 'Times New Roman', serif; color:#111; }
      .backup-task-meta, .backup-item-ref, .backup-kes { color:#555; font-size:8.5pt; }
      .backup-task-body { display:block; overflow:visible; margin:0; padding:0; }
      .backup-learning-section, .backup-item-card, .backup-media-card { display:block; margin:0 0 4mm; padding:4mm; border:1px solid #aaa; border-radius:3mm; background:#fff !important; color:#111 !important; break-inside:avoid; }
      .backup-readable-text, .backup-instruction-text, .backup-context-text, .backup-item-text { color:#111 !important; white-space:pre-wrap; overflow-wrap:anywhere; }
      .backup-instruction-text { font-weight:650; }
      .backup-items { display:block; }
      .backup-item-card { margin-bottom:4mm; }
      .backup-item-head { display:flex; justify-content:space-between; gap:6mm; padding-bottom:2.5mm; margin-bottom:3mm; border-bottom:1px solid #ccc; }
      .backup-item-number { font:700 13pt Georgia, 'Times New Roman', serif; }
      .backup-table-wrap, .backup-answer-wrap { overflow:visible; margin-top:3mm; }
      table { width:100%; border-collapse:collapse; color:#111; background:#fff !important; }
      td, th { padding:2.4mm; border:1px solid #888; vertical-align:top; background:#fff !important; color:#111 !important; }
      .backup-answer-table { table-layout:fixed; text-align:center; }
      .backup-answer-table th:first-child { width:24mm; text-align:left; }
      .backup-answer-entry-row td { height:11mm; }
      .backup-answer-legend { display:flex; gap:4mm; flex-wrap:wrap; margin:0 0 3mm; }
      .backup-answer-legend span { border:1px solid #aaa; border-radius:2mm; padding:1.5mm 2.5mm; background:#fff; }
      .backup-source-word-line { display:flex; justify-content:space-between; gap:4mm; margin-top:3mm; padding:2.4mm; border:1px solid #aaa; background:#fff !important; }
      .backup-source-word-line span { color:#555; font-size:8.5pt; font-weight:700; text-transform:uppercase; }
      .backup-source-word-line strong { color:#111; }
      .backup-writing-variant { margin:0 0 5mm; padding:4mm; border:1px solid #999; background:#fff !important; break-inside:auto; }
      .backup-writing-variant-head { font-weight:800; margin-bottom:3mm; }
      .backup-writing-sub-label { display:block; margin:0 0 2mm; color:#555; font-size:8pt; font-weight:800; letter-spacing:.06em; text-transform:uppercase; }
      .backup-writing-data-block, .backup-writing-plan, .backup-writing-part { margin-top:3mm; }
      .backup-writing-plan-list { margin:2mm 0 0 6mm; padding-left:5mm; }
      .backup-writing-plan-list li { margin:0 0 1.5mm; }
      .backup-writing-word-count { margin-top:3mm; font-weight:800; }
      .backup-writing-answer-hint { display:none; }
      .backup-print-answer-area { min-height:92mm; padding:4mm; border:1px solid #999; white-space:pre-wrap; overflow-wrap:anywhere; background:#fff !important; color:#111; }
      .backup-writing-letter-section { break-inside:auto; }
      .backup-writing-letter-lead { margin:0 0 3mm; color:#222; }
      .backup-writing-letter-quote { margin:0; padding:3mm 4mm; border-left:1.2mm solid #888; background:#fff !important; color:#111; font:italic 11pt/1.55 Georgia, 'Times New Roman', serif; white-space:pre-wrap; }
      .backup-writing37-bullets { margin:2mm 0 3mm 7mm; padding-left:4mm; }
      .backup-writing37-bullets li { margin:0 0 1mm; }
      .backup-writing37-wordline { font-weight:700; }
      .backup-speaking-lead { margin:0 0 2.5mm; font-weight:700; }
      .backup-speaking-intro { margin:0 0 3mm; font-weight:650; line-height:1.5; }
      .backup-speaking-numbered-list, .backup-speaking-bullet-list { margin:2mm 0 3mm 7mm; padding-left:5mm; }
      .backup-speaking-numbered-list li, .backup-speaking-bullet-list li { margin:0 0 1.5mm; }
      .backup-speaking-closing { margin-top:3mm; font-weight:700; }
      .backup-speaking-ad-title { margin:0 0 3mm; font:700 12pt Georgia, 'Times New Roman', serif; color:#111; }
      .backup-speaking-media-grid { display:grid !important; gap:4mm; }
      .backup-speaking-media-grid.speaking-count-1 { grid-template-columns:1fr; }
      .backup-speaking-media-grid.speaking-count-2 { grid-template-columns:repeat(2,minmax(0,1fr)); }
      .backup-speaking-media-grid.speaking-count-3 { grid-template-columns:repeat(3,minmax(0,1fr)); }
      .backup-speaking-photo-card { padding:2.5mm; margin:0; break-inside:avoid; }
      .backup-speaking-photo-card img { max-height:95mm; }

      .backup-media-grid { display:block; }
      .backup-media-card img { display:block; max-width:100%; max-height:145mm; margin:0 auto; object-fit:contain; }
      .backup-print-media-note { display:block !important; color:#555; font-size:9pt; padding:1mm 0; }
      .backup-media-head { margin-bottom:2mm; }
      .backup-media-kind { font-weight:700; font-size:8pt; }
      .backup-media-error { color:#555; }
    </style></head><body>${clone.outerHTML}</body></html>`);
    doc.close();

    const printWhenReady = () => {
      const images = [...doc.images];
      const pending = images.filter(img => !img.complete).map(img => new Promise(resolve => {
        img.addEventListener('load', resolve, { once:true });
        img.addEventListener('error', resolve, { once:true });
      }));
      Promise.allSettled(pending).then(() => {
        setTimeout(() => {
          try { frame.contentWindow?.focus(); frame.contentWindow?.print(); }
          finally { setTimeout(() => frame.remove(), 1200); }
        }, 80);
      });
    };
    printWhenReady();
  }

  function viewerUnitTitle(unit, model) {
    if (unit?.exam_bucket === 'vocabulary_30_36' && Array.isArray(model?.examNumbers) && model.examNumbers.length >= 2) {
      const start = model.examNumbers[0];
      const end = model.examNumbers[model.examNumbers.length - 1];
      return `Лексика · задания ${start}–${end}`;
    }
    return unitTitle(unit);
  }

  async function openBackupUnit(unit) {
    revokeBackupObjectUrls();

    el.backupTaskTitle.textContent = unitTitle(unit);
    el.backupTaskMeta.textContent = `${unitReference(unit)} · ${unitKes(unit)}`;
    el.backupOfficialLink.href = unit.official_fipi_url;
    el.backupTaskBody.innerHTML = '<div class="backup-viewer-loading"><div class="backup-spinner"></div>Собираю учебную страницу…</div>';
    if (typeof el.backupTaskDialog.showModal === 'function') el.backupTaskDialog.showModal();

    let unitJson = null;
    let unitJsonError = null;
    if (unit?.exam_bucket === 'vocabulary_30_36' && unit.backup_json_path) {
      try { unitJson = await fetchVocabularyUnitJsonDirect(unit); }
      catch (error) {
        unitJsonError = error;
        console.warn('Unit JSON backup unavailable:', error);
      }
    }

    const model = unitViewerModel(unit, unitJson);
    el.backupTaskTitle.textContent = viewerUnitTitle(unit, model);

    if (speakingBucket(unit)) {
      el.backupTaskBody.innerHTML = renderSpeakingTask(unit, model)
        || `${renderInstructionSection(model)}${renderMediaCards(unit)}`;
    } else if (unit?.exam_bucket === 'writing_37') {
      el.backupTaskBody.innerHTML = renderWriting37(unit, model)
        || `${renderInstructionSection(model)}${renderMediaCards(unit)}${renderContextSection(unit, model)}`;
    } else if (unit?.exam_bucket === 'writing_38') {
      el.backupTaskBody.innerHTML = renderWriting38(unit, model)
        || `${renderInstructionSection(model)}${renderMediaCards(unit)}${renderContextSection(unit, model)}`;
    } else {
      const vocabNotice = unit?.exam_bucket === 'vocabulary_30_36' && !model.vocabularyRecovered
        ? `<section class="backup-learning-section backup-recovery-note"><span class="backup-block-label">МАТЕРИАЛ ЗАДАНИЯ</span><div class="backup-readable-text">Основной текст этой группы пока не найден в прямом Яндекс-резерве. Проверьте загрузку ege/cache в Object Storage.</div></section>`
        : '';
      el.backupTaskBody.innerHTML = `
        ${renderInstructionSection(model)}
        ${renderMediaCards(unit)}
        ${renderContextSection(unit, model)}
        ${vocabNotice}
        ${renderBackupItems(unit, model)}
        ${renderAnswerSheet(unit, model)}
      `;
    }

    await markViewed(unit);
    // Media loads automatically, exactly like the OGE reserve viewer.
    void loadAllBackupMedia(unit);
  }

  function openUnit(unit) {
    if (demoMode || effectiveContentSource() === 'fipi') {
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

    // Tiny metadata write only. Supabase remains the customs/status layer;
    // no catalog/media/cache bytes pass through this RPC.
    const { error } = await supabaseClient.rpc('ege_set_unit_status', {
      p_unit_id: unit.id,
      p_status: status
    });

    if (error) {
      console.error('Status save failed:', error);
      for (const [itemId, oldStatus] of previous) {
        if (oldStatus === 'new') itemStatus.delete(itemId);
        else itemStatus.set(itemId, oldStatus);
      }
      render(false);
      showInfo('Не удалось сохранить статус', `Supabase вернул: ${error.message || 'неизвестная ошибка'}`, 'СТАТУС');
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
    userSourcePreference = null;
    updateSourceBadge();

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
    el.sourceBadge.classList.remove('hidden');
    el.modeKicker.textContent = access.role === 'admin'
      ? 'ADMIN · TOPIC-FIRST · 15 EXAM BUCKETS'
      : 'TOPIC-FIRST · 15 EXAM BUCKETS';
    startPresenceHeartbeat();
  }

  function leaveApp() {
    stopPresenceHeartbeat();
    stopAdminAutoRefresh();

    currentAccess = null;
    currentManagedAuth = null;
    userSourcePreference = null;
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
    el.sourceBadge.classList.add('hidden');
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

    const [accessResult, managedResult] = await Promise.all([
      supabaseClient.rpc('ege_my_access'),
      supabaseClient.rpc('ege_my_managed_auth_v060')
    ]);
    if (accessResult.error) {
      leaveApp();
      showMessage('Не удалось проверить доступ к EGE Navigator.', 'error');
      return;
    }
    if (managedResult.error) {
      console.error('Managed auth metadata failed:', managedResult.error);
      leaveApp();
      showMessage('Не удалось проверить параметры защищённого входа EGE.', 'error');
      return;
    }

    const access = accessResult.data?.[0];
    currentManagedAuth = Array.isArray(managedResult.data)
      ? (managedResult.data[0] || null)
      : (managedResult.data || null);
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

    if (currentManagedAuth?.must_change_password) {
      currentAccess = access;
      showForcedPasswordDialog();
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
      await loadUserSourcePreference();
      updateSourceBadge();
      await loadCatalog();
      await touchPresence();
    } catch (e) {
      console.error(e);
      leaveApp();
      showMessage(`Не удалось загрузить каталог ЕГЭ: ${e?.message || e}`, 'error');
    }
  }

  function openAuthDialog() {
    clearAuthError();
    if (el.authHint) el.authHint.textContent = 'Введите email или VK ID, который вы получили для доступа.';
    if (typeof el.authDialog?.showModal === 'function' && !el.authDialog.open) el.authDialog.showModal();
    window.setTimeout(() => el.loginIdentifierInput?.focus(), 40);
  }

  function showForcedPasswordDialog() {
    document.body.classList.remove('workspace-mode');
    el.accessGate.classList.add('hidden');
    el.appShell.classList.add('hidden');
    el.signOutButton.classList.add('hidden');
    el.adminButton.classList.add('hidden');
    el.sourceBadge.classList.add('hidden');
    clearInlineError(el.firstPasswordError);
    el.firstPasswordInput.value = '';
    el.firstPasswordRepeat.value = '';
    if (typeof el.firstPasswordDialog?.showModal === 'function' && !el.firstPasswordDialog.open) {
      el.firstPasswordDialog.showModal();
    }
    window.setTimeout(() => el.firstPasswordInput?.focus(), 40);
  }

  async function signIn() {
    clearAuthError();
    const login = resolveLoginIdentifier(el.loginIdentifierInput?.value || '');
    const password = el.passwordInput.value;
    if (!login || !password) return showAuthError('Введите email или числовой VK ID и пароль.');

    el.signInButton.disabled = true;
    try {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email:login.email,
        password,
      });
      if (error) return showAuthError(authErrorText(error));

      if (el.authDialog?.open) el.authDialog.close();

      // Explicit activation avoids the old race where a valid login looked like a failure
      // until the page was refreshed.
      if (data?.user) await activateUser(data.user);
    } finally {
      el.signInButton.disabled = false;
    }
  }

  function updateEmailRecoveryOption() {
    const login = resolveLoginIdentifier(el.recoveryIdentifierInput?.value || '');
    const available = Boolean(login?.kind === 'email' && !/@example\.com$/i.test(login.email));
    el.emailRecoveryOption?.classList.toggle('hidden', !available);
    if (!available) clearInlineSuccess(el.emailRecoveryStatus);
  }

  function openRecoveryDialog() {
    clearInlineError(el.recoveryError);
    clearInlineSuccess(el.emailRecoveryStatus);
    el.recoveryIdentifierInput.value = el.loginIdentifierInput?.value?.trim() || '';
    el.recoveryCodeInput.value = '';
    el.recoveryPasswordInput.value = '';
    el.recoveryPasswordRepeat.value = '';
    updateEmailRecoveryOption();
    if (el.authDialog?.open) el.authDialog.close();
    if (typeof el.recoveryDialog?.showModal === 'function' && !el.recoveryDialog.open) {
      el.recoveryDialog.showModal();
    }
    window.setTimeout(() => (el.recoveryIdentifierInput.value ? el.recoveryCodeInput : el.recoveryIdentifierInput)?.focus(), 40);
  }

  function emailRecoveryRedirectUrl() {
    const url = new URL(window.location.href);
    url.hash = '';
    url.search = '';
    url.searchParams.set('ege_email_recovery','1');
    return url.toString();
  }

  async function sendEmailRecovery() {
    clearInlineError(el.recoveryError);
    clearInlineSuccess(el.emailRecoveryStatus);
    const login = resolveLoginIdentifier(el.recoveryIdentifierInput.value);
    if (!login || login.kind !== 'email' || /@example\.com$/i.test(login.email)) {
      return showInlineError(el.recoveryError, 'Восстановление письмом доступно только для настоящего email. Для VK ID используйте код или напишите администратору.');
    }

    el.sendEmailRecoveryButton.disabled = true;
    try {
      const { error } = await supabaseClient.auth.resetPasswordForEmail(login.email, {
        redirectTo: emailRecoveryRedirectUrl(),
      });
      if (error) throw error;
      showInlineSuccess(
        el.emailRecoveryStatus,
        'Письмо для восстановления отправлено. Откройте ссылку из письма на этом устройстве. Если письма нет, проверьте «Спам» или напишите администратору.'
      );
    } catch (error) {
      showInlineError(el.recoveryError, authErrorText(error));
    } finally {
      el.sendEmailRecoveryButton.disabled = false;
    }
  }

  function showEmailResetPasswordDialog() {
    emailRecoveryMode = true;
    document.body.classList.remove('workspace-mode');
    el.accessGate.classList.add('hidden');
    el.appShell.classList.add('hidden');
    el.signOutButton.classList.add('hidden');
    el.adminButton.classList.add('hidden');
    el.sourceBadge.classList.add('hidden');
    clearInlineError(el.emailResetPasswordError);
    el.emailResetPasswordInput.value = '';
    el.emailResetPasswordRepeat.value = '';
    if (el.authDialog?.open) el.authDialog.close();
    if (el.recoveryDialog?.open) el.recoveryDialog.close();
    if (typeof el.emailResetPasswordDialog?.showModal === 'function' && !el.emailResetPasswordDialog.open) {
      el.emailResetPasswordDialog.showModal();
    }
    window.setTimeout(() => el.emailResetPasswordInput?.focus(), 50);
  }

  function cleanEmailRecoveryUrl() {
    try {
      const url = new URL(window.location.href);
      url.searchParams.delete('ege_email_recovery');
      const query = url.searchParams.toString();
      window.history.replaceState({}, '', `${url.pathname}${query ? `?${query}` : ''}${url.hash || ''}`);
    } catch {}
  }

  async function cancelEmailResetPassword() {
    if (el.emailResetPasswordDialog?.open) el.emailResetPasswordDialog.close();
    emailRecoveryMode = false;
    cleanEmailRecoveryUrl();
    try { await supabaseClient.auth.signOut(); } catch {}
    leaveApp();
  }

  async function saveEmailResetPassword() {
    clearInlineError(el.emailResetPasswordError);
    const password = el.emailResetPasswordInput.value;
    const repeat = el.emailResetPasswordRepeat.value;
    if (password.length < 10) return showInlineError(el.emailResetPasswordError, 'Пароль должен содержать не менее 10 символов.');
    if (password !== repeat) return showInlineError(el.emailResetPasswordError, 'Пароли не совпадают.');

    el.saveEmailResetPasswordButton.disabled = true;
    try {
      const { error } = await supabaseClient.auth.updateUser({ password });
      if (error) throw error;

      const result = await callManagedAccess({
        action:'finalize_email_recovery',
      }, { requireAuth:true });

      emailRecoveryMode = false;
      cleanEmailRecoveryUrl();
      showRecoveryCode(result.recovery_code, 'activate');
    } catch (error) {
      showInlineError(el.emailResetPasswordError, managedAccessErrorText(error) === 'Не удалось выполнить действие. Попробуйте ещё раз чуть позже.'
        ? authErrorText(error)
        : managedAccessErrorText(error));
    } finally {
      el.saveEmailResetPasswordButton.disabled = false;
    }
  }

  function showRecoveryCode(code, continuation, recoveredLogin = null) {
    pendingRecoveryContinuation = continuation;
    pendingRecoveredLogin = recoveredLogin;
    el.recoveryCodeValue.textContent = code;
    if (el.firstPasswordDialog?.open) el.firstPasswordDialog.close();
    if (el.recoveryDialog?.open) el.recoveryDialog.close();
    if (typeof el.recoveryCodeDialog?.showModal === 'function' && !el.recoveryCodeDialog.open) {
      el.recoveryCodeDialog.showModal();
    }
  }

  async function saveFirstPassword() {
    clearInlineError(el.firstPasswordError);
    const password = el.firstPasswordInput.value;
    const repeat = el.firstPasswordRepeat.value;
    if (password.length < 10) return showInlineError(el.firstPasswordError, 'Пароль должен содержать не менее 10 символов.');
    if (password !== repeat) return showInlineError(el.firstPasswordError, 'Пароли не совпадают.');

    el.saveFirstPasswordButton.disabled = true;
    try {
      const result = await callManagedAccess({
        action:'set_first_password',
        new_password:password,
      }, { requireAuth:true });

      if (currentManagedAuth) currentManagedAuth.must_change_password = false;
      showRecoveryCode(result.recovery_code, 'activate');
    } catch (error) {
      const text = managedAccessErrorText(error);
      if (text === 'access_ended') {
        if (el.firstPasswordDialog?.open) el.firstPasswordDialog.close();
        leaveApp();
        showMessage('Активного доступа к EGE Navigator нет или срок доступа завершён.', 'error');
      } else {
        showInlineError(el.firstPasswordError, text);
      }
    } finally {
      el.saveFirstPasswordButton.disabled = false;
    }
  }

  async function recoverPassword() {
    clearInlineError(el.recoveryError);
    const login = resolveLoginIdentifier(el.recoveryIdentifierInput.value);
    const recoveryCode = el.recoveryCodeInput.value.trim();
    const password = el.recoveryPasswordInput.value;
    const repeat = el.recoveryPasswordRepeat.value;

    if (!login) return showInlineError(el.recoveryError, 'Введите корректный email или числовой VK ID.');
    if (!recoveryCode) return showInlineError(el.recoveryError, 'Введите код восстановления.');
    if (password.length < 10) return showInlineError(el.recoveryError, 'Пароль должен содержать не менее 10 символов.');
    if (password !== repeat) return showInlineError(el.recoveryError, 'Пароли не совпадают.');

    el.recoverPasswordButton.disabled = true;
    try {
      const result = await callManagedAccess({
        action:'recover_password',
        identifier:login.identifier,
        recovery_code:recoveryCode,
        new_password:password,
      });

      showRecoveryCode(result.recovery_code, 'login', {
        identifier:login.identifier,
        email:login.email,
        password,
      });
    } catch (error) {
      const text = managedAccessErrorText(error);
      if (text === 'access_ended') {
        if (el.recoveryDialog?.open) el.recoveryDialog.close();
        showMessage('Активного доступа к EGE Navigator нет или срок доступа завершён.', 'error');
      } else {
        showInlineError(el.recoveryError, text);
      }
    } finally {
      el.recoverPasswordButton.disabled = false;
    }
  }

  async function confirmRecoveryCodeAndContinue() {
    if (el.recoveryCodeDialog?.open) el.recoveryCodeDialog.close();
    const continuation = pendingRecoveryContinuation;
    const recovered = pendingRecoveredLogin;
    pendingRecoveryContinuation = null;
    pendingRecoveredLogin = null;

    if (continuation === 'activate' && currentUser) {
      await activateUser(currentUser);
      return;
    }

    if (continuation === 'login' && recovered) {
      const { data, error } = await supabaseClient.auth.signInWithPassword({
        email:recovered.email,
        password:recovered.password,
      });
      if (error) {
        leaveApp();
        openAuthDialog();
        el.loginIdentifierInput.value = recovered.identifier;
        showAuthError('Пароль изменён, но автоматический вход не удался. Введите новый пароль ещё раз.');
      } else if (data?.user) {
        await activateUser(data.user);
      }
    }
  }

  async function copyRecoveryCode() {
    const code = el.recoveryCodeValue?.textContent || '';
    if (!code) return;
    const ok = await copyText(code);
    if (ok) animateCopyButton(el.copyRecoveryCodeButton, '✓ Код скопирован');
    showToast(ok ? '✓ Код восстановления скопирован' : 'Не удалось скопировать код');
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

    let recoveryEventSeen = false;
    supabaseClient.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session?.user) {
        recoveryEventSeen = true;
        currentUser = session.user;
        setTimeout(showEmailResetPasswordDialog, 0);
        return;
      }
      if (demoMode && !demoUsesAuth) return;
      const nextUser = session?.user || null;
      if (!nextUser) {
        currentUser = null;
        if (!emailRecoveryMode) leaveApp();
      } else if (event === 'SIGNED_IN' && currentUser?.id !== nextUser.id && !emailRecoveryMode) {
        setTimeout(() => activateUser(nextUser), 0);
      }
    });

    await loadRuntimeConfig();

    const params = new URLSearchParams(window.location.search);
    const forceDemo = params.get('demo') === '1';
    const emailRecoveryRedirect = params.get('ege_email_recovery') === '1';

    if (forceDemo) {
      await startDemo('public');
    } else {
      const { data, error } = await supabaseClient.auth.getSession();
      if (error) console.error('Session read failed:', error);
      const user = data?.session?.user || null;

      if (user && (recoveryEventSeen || emailRecoveryRedirect)) {
        currentUser = user;
        showEmailResetPasswordDialog();
      } else if (user) {
        await activateUser(user);
      }
    }
  }

  el.openLoginButton.addEventListener('click', openAuthDialog);
  el.closeAuthDialogButton.addEventListener('click', () => el.authDialog.close());
  el.signInButton.addEventListener('click', signIn);
  el.passwordInput.addEventListener('keydown', e => { if (e.key === 'Enter') signIn(); });
  el.loginIdentifierInput?.addEventListener('keydown', e => { if (e.key === 'Enter') el.passwordInput?.focus(); });
  el.forgotPasswordButton?.addEventListener('click', openRecoveryDialog);

  el.saveFirstPasswordButton?.addEventListener('click', saveFirstPassword);
  el.firstPasswordRepeat?.addEventListener('keydown', e => { if (e.key === 'Enter') saveFirstPassword(); });

  el.closeRecoveryDialogButton?.addEventListener('click', () => el.recoveryDialog.close());
  el.recoveryIdentifierInput?.addEventListener('input', updateEmailRecoveryOption);
  el.sendEmailRecoveryButton?.addEventListener('click', sendEmailRecovery);
  el.recoverPasswordButton?.addEventListener('click', recoverPassword);
  el.recoveryPasswordRepeat?.addEventListener('keydown', e => { if (e.key === 'Enter') recoverPassword(); });

  el.cancelEmailResetPasswordButton?.addEventListener('click', cancelEmailResetPassword);
  el.saveEmailResetPasswordButton?.addEventListener('click', saveEmailResetPassword);
  el.emailResetPasswordRepeat?.addEventListener('keydown', e => { if (e.key === 'Enter') saveEmailResetPassword(); });
  el.emailResetPasswordDialog?.addEventListener('cancel', event => {
    event.preventDefault();
    void cancelEmailResetPassword();
  });

  el.copyRecoveryCodeButton?.addEventListener('click', copyRecoveryCode);
  el.confirmRecoveryCodeButton?.addEventListener('click', confirmRecoveryCodeAndContinue);

  // Direct VK OAuth/Donut login is intentionally hidden. Donors use the same
  // "Войти" form and enter their numeric VK ID + password.
  el.openDonutButton?.addEventListener('click', openAuthDialog);

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

  document.querySelectorAll('[data-admin-recovery-contact]').forEach(link => {
    link.addEventListener('click', event => {
      event.preventDefault();
      const href = link.href;
      window.open(href, '_blank', 'noopener,noreferrer');
      void copyText(RECOVERY_CONTACT_TEXT).then(ok => {
        showToast(ok
          ? '✓ Сообщение для восстановления скопировано'
          : 'Открылся VK. Текст не удалось скопировать автоматически.');
      });
    });
  });

  el.sourceBadge.addEventListener('click', toggleUserSource);

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
  el.adminBackupReadyButton?.addEventListener('click', toggleBackupReady);

  el.createEmailAccessButton?.addEventListener('click', openEmailAccessAdminDialog);
  el.createVkAccessButton?.addEventListener('click', openVkAccessAdminDialog);
  el.closeEmailAccessAdminDialogButton?.addEventListener('click', () => el.emailAccessAdminDialog.close());
  el.closeVkAccessAdminDialogButton?.addEventListener('click', () => el.vkAccessAdminDialog.close());
  el.createEmailAccessSubmitButton?.addEventListener('click', createManagedEmailAccess);
  el.createVkAccessSubmitButton?.addEventListener('click', createManagedVkAccess);
  el.closeAdminCredentialsDialogButton?.addEventListener('click', () => el.adminCredentialsDialog.close());
  el.copyAdminCredentialsButton?.addEventListener('click', async () => {
    const ok = await copyText(el.adminCredentialsText?.textContent || '');
    if (ok) animateCopyButton(el.copyAdminCredentialsButton, '✓ Сообщение скопировано');
    showToast(ok ? '✓ Сообщение скопировано' : 'Не удалось скопировать сообщение');
  });

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
