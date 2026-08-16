(() => {
  'use strict';

  const CONFIG = window.EGE_CONFIG || window.OGE_CONFIG || {};
  const PAGE_SIZE = 1000;

  const BUCKETS = [
    ['all', 'Все разделы'],
    ['listening_1', 'Аудирование · задание 1'],
    ['listening_2', 'Аудирование · задание 2'],
    ['listening_3_9', 'Аудирование · задания 3–9'],
    ['reading_10', 'Чтение · задание 10'],
    ['reading_11', 'Чтение · задание 11'],
    ['reading_12_18', 'Чтение · задания 12–18'],
    ['grammar_19_24', 'Грамматика · задания 19–24'],
    ['wordformation_25_29', 'Словообразование · задания 25–29'],
    ['vocabulary_30_36', 'Лексика · задания 30–36'],
    ['writing_37', 'Письмо · задание 37'],
    ['writing_38', 'Письмо · задание 38'],
    ['speaking_1', 'Говорение · задание 1'],
    ['speaking_2', 'Говорение · задание 2'],
    ['speaking_3', 'Говорение · задание 3'],
    ['speaking_4', 'Говорение · задание 4'],
  ];
  const BUCKET_LABEL = Object.fromEntries(BUCKETS);

  const CONTACT_TEXT = 'Здравствуйте! Хочу получить доступ к тематическому навигатору по открытому банку заданий ЕГЭ ФИПИ (English).';

  let supabaseClient = null;
  let currentUser = null;
  let currentAccess = null;
  let runtimeConfig = { content_source: 'fipi', demo_enabled: true, yandex_backup_ready: false };
  let units = [];
  let items = [];
  let itemsByUnit = new Map();

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
    bucketSelect: $('#bucketSelect'),
    searchInput: $('#searchInput'),
    resetButton: $('#resetButton'),
    sectionTitle: $('#sectionTitle'),
    sectionMeta: $('#sectionMeta'),
    unitGrid: $('#unitGrid'),
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

  function showInfo(title, text, kicker = 'NEXT STEP') {
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

  function updateSourceBadge() {
    const backup = runtimeConfig.content_source === 'yandex_backup';
    el.sourceBadge.textContent = backup ? 'ЯНДЕКС-РЕЗЕРВ' : 'FIPI';
    el.sourceBadge.title = backup
      ? 'Navigator использует резервный источник'
      : 'Navigator открывает официальный источник ФИПИ';
  }

  async function loadRuntimeConfig() {
    if (!supabaseClient) return;
    const { data, error } = await supabaseClient.rpc('ege_runtime_config');
    if (!error && data?.[0]) {
      runtimeConfig = data[0];
      updateSourceBadge();
    }
  }

  async function fetchAllRows(table, columns, orderColumn = null) {
    const result = [];
    let from = 0;
    while (true) {
      let q = supabaseClient.from(table).select(columns).range(from, from + PAGE_SIZE - 1);
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

  async function loadCatalog() {
    const [u, i] = await Promise.all([
      fetchAllRows('ege_units', 'id,unit_key,title,exam_bucket,parent_zid,official_fipi_url,items_total,shared_context', 'exam_bucket'),
      fetchAllRows('ege_items', 'id,unit_id,card_key,fipi_id,display_label,group_position,item_text,item_tables,sort_order', 'sort_order')
    ]);

    units = u;
    items = i;
    itemsByUnit = new Map();

    for (const item of items) {
      if (!itemsByUnit.has(item.unit_id)) itemsByUnit.set(item.unit_id, []);
      itemsByUnit.get(item.unit_id).push(item);
    }
    for (const arr of itemsByUnit.values()) {
      arr.sort((a,b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    }

    el.unitCount.textContent = String(units.length);
    el.itemCount.textContent = String(items.length);
    render();
  }

  function unitMatches(unit, query) {
    if (!query) return true;
    const q = query.toLowerCase();
    const unitItems = itemsByUnit.get(unit.id) || [];
    const hay = [
      unit.title, unit.unit_key, unit.parent_zid,
      ...unitItems.flatMap(x => [x.fipi_id, x.display_label, x.item_text])
    ].filter(Boolean).join(' ').toLowerCase();
    return hay.includes(q);
  }

  function displayItemLabel(item, index) {
    const label = String(item.display_label || '').trim();
    if (label) return label.replace(/^задание\s*№?\s*/i, '').trim() || label;
    if (item.group_position != null) return String(item.group_position);
    return item.fipi_id || String(index + 1);
  }

  function openUnitItem(unit, item) {
    if (runtimeConfig.content_source === 'fipi') {
      window.open(unit.official_fipi_url, '_blank', 'noopener,noreferrer');
      return;
    }
    showInfo(
      'Резервная страница — следующий этап',
      'Источник уже переключаемый на уровне базы. Внутренний рендер текста, таблиц, аудио и изображений подключим после проверки основного каталога.',
      'ЯНДЕКС-РЕЗЕРВ'
    );
  }

  function render() {
    const bucket = el.bucketSelect.value || 'all';
    const query = el.searchInput.value.trim();
    const filtered = units.filter(unit =>
      (bucket === 'all' || unit.exam_bucket === bucket) &&
      unitMatches(unit, query)
    );

    el.sectionTitle.textContent = BUCKET_LABEL[bucket] || bucket;
    const filteredItems = filtered.reduce((n, u) => n + (itemsByUnit.get(u.id)?.length || 0), 0);
    el.sectionMeta.textContent = `${filtered.length} units · ${filteredItems} позиций`;
    el.visibleCount.textContent = String(filteredItems);

    el.unitGrid.innerHTML = filtered.map(unit => {
      const arr = itemsByUnit.get(unit.id) || [];
      const title = unit.title || BUCKET_LABEL[unit.exam_bucket] || unit.exam_bucket;
      return `
        <article class="unit-card" data-unit-id="${esc(unit.id)}">
          <div class="unit-top">
            <div class="unit-title">
              <h4>${esc(title)}</h4>
              <div class="unit-sub">
                ${esc(BUCKET_LABEL[unit.exam_bucket] || unit.exam_bucket)}
                ${unit.parent_zid ? ` · group ${esc(unit.parent_zid)}` : ''}
              </div>
            </div>
            <span class="unit-badge">${arr.length} ${arr.length === 1 ? 'позиция' : 'позиций'}</span>
          </div>
          <div class="item-row">
            ${arr.map((item, idx) => `
              <button class="item-chip" type="button"
                data-unit="${esc(unit.id)}"
                data-item="${esc(item.id)}"
                title="FIPI ID: ${esc(item.fipi_id)}">
                ${esc(displayItemLabel(item, idx))}
              </button>
            `).join('')}
          </div>
        </article>
      `;
    }).join('');

    el.emptyState.classList.toggle('hidden', filtered.length !== 0);

    el.unitGrid.querySelectorAll('.item-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const unit = units.find(x => x.id === btn.dataset.unit);
        const item = items.find(x => x.id === btn.dataset.item);
        if (unit && item) openUnitItem(unit, item);
      });
    });
  }

  function enterApp(access) {
    currentAccess = access;
    el.accessGate.classList.add('hidden');
    el.appShell.classList.remove('hidden');
    el.signOutButton.classList.remove('hidden');
    el.cloudBadge.textContent = access.role === 'admin' ? 'ADMIN · FULL' : 'FULL';
    el.cloudBadge.className = 'cloud-badge live';
    el.adminButton.classList.toggle('hidden', access.role !== 'admin');
    el.modeKicker.textContent = access.role === 'admin' ? 'ADMIN · FULL CATALOG' : 'FULL CATALOG';
  }

  function leaveApp() {
    currentAccess = null;
    units = [];
    items = [];
    itemsByUnit = new Map();
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
    if (access.access_level !== 'full') {
      leaveApp();
      showMessage('Для этого аккаунта установлен DEMO-доступ. Персональный DEMO подключим следующим этапом.', 'error');
      return;
    }

    try {
      await registerLoginOnce(user);
      enterApp(access);
      await loadRuntimeConfig();
      await loadCatalog();
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

  async function init() {
    el.footerYear.textContent = String(new Date().getFullYear());

    BUCKETS.forEach(([value, label]) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = label;
      el.bucketSelect.appendChild(option);
    });

    el.brandLogo.addEventListener('error', () => {
      el.brandLogo.src = 'assets/brand-logo-fallback.svg';
    }, { once: true });

    if (!isConfigured()) {
      showMessage(
        'Не найден config.js с подключением Supabase. На следующем шаге скопируйте рабочий config.js из Navigator_FIPI_OGE — EGE использует тот же Supabase-проект.',
        'error'
      );
      el.openLoginButton.disabled = true;
      return;
    }

    supabaseClient = window.supabase.createClient(CONFIG.supabaseUrl, configuredKey(), {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
    });

    await loadRuntimeConfig();

    const { data, error } = await supabaseClient.auth.getSession();
    if (error) console.error('Session read failed:', error);
    const user = data?.session?.user || null;
    if (user) await activateUser(user);

    supabaseClient.auth.onAuthStateChange((event, session) => {
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
      'Кнопка уже стоит на стартовом экране. Серверную проверку VK Donut подключим после первой проверки каталога и email-входа, не затрагивая ОГЭ.',
      'VK DONUT'
    );
  });

  el.openDemoButton.addEventListener('click', () => {
    if (!runtimeConfig.demo_enabled) {
      showInfo('DEMO временно выключен', 'Администратор отключил публичный DEMO-режим.', 'DEMO');
      return;
    }
    showInfo(
      'DEMO включён',
      'Глобальный флаг DEMO уже работает. Заранее подобранную демонстрационную коллекцию подключим после проверки структуры 15 разделов и групповых заданий.',
      'DEMO'
    );
  });

  el.adminButton.addEventListener('click', () => {
    showInfo(
      'ADMIN подтверждён',
      `Администратор распознан. Текущий источник: ${runtimeConfig.content_source === 'fipi' ? 'FIPI' : 'Яндекс-резерв'}. Полную панель пользователей, DEMO и переключатель источника подключим отдельным следующим этапом.`,
      'ADMIN'
    );
  });

  el.signOutButton.addEventListener('click', async () => {
    if (supabaseClient) await supabaseClient.auth.signOut();
    currentUser = null;
    leaveApp();
    clearMessage();
  });

  el.bucketSelect.addEventListener('change', render);
  el.searchInput.addEventListener('input', render);
  el.resetButton.addEventListener('click', () => {
    el.bucketSelect.value = 'all';
    el.searchInput.value = '';
    render();
  });

  el.closeInfoDialogButton.addEventListener('click', () => el.infoDialog.close());
  el.closeInfoButton.addEventListener('click', () => el.infoDialog.close());

  document.querySelectorAll('[data-admin-contact]').forEach(link => {
    link.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(CONTACT_TEXT); } catch {}
    });
  });

  init();
})();
