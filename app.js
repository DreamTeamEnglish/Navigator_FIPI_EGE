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
    return currentUser ? `auth:${currentUser.id}` : null;
  }

  async function loadCatalog() {
    const principal = currentPrincipalKey();

    const [u, i, t, l, s] = await Promise.all([
      fetchAllRows(
        'ege_units',
        'id,unit_key,title,exam_bucket,parent_zid,official_fipi_url,items_total,shared_context',
        'exam_bucket'
      ),
      fetchAllRows(
        'ege_items',
        'id,unit_id,card_key,fipi_id,display_label,group_position,live_kes_code,item_text,sort_order',
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
        : Promise.resolve([])
    ]);

    units = u;
    items = i;
    topics = t;
    unitTopicLinks = l;

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

  function unitTopicRecords(unitId) {
    return (linksByUnit.get(unitId) || [])
      .map(link => ({ link, topic: topicById.get(link.topic_id) }))
      .filter(x => x.topic);
  }

  function unitTopicIdSet(unitId) {
    return new Set((linksByUnit.get(unitId) || []).map(x => x.topic_id));
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
          <span class="unit-count-badge">${esc(countLabel(arr.length))}</span>
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

  function openUnit(unit) {
    if (runtimeConfig.content_source === 'fipi') {
      window.open(unit.official_fipi_url, '_blank', 'noopener,noreferrer');
      void markViewed(unit);
      return;
    }

    showInfo(
      'Яндекс-резерв',
      'Источник уже переключаемый. Внутренний рендер текста, таблиц, аудио и изображений подключается отдельным этапом; сам тематический Navigator уже работает на общей матрице.',
      'ЯНДЕКС-РЕЗЕРВ'
    );
    void markViewed(unit);
  }

  async function markViewed(unit) {
    if (unitStatus(unit) !== 'new') return;
    await setUnitStatus(unit, 'viewed');
  }

  async function setUnitStatus(unit, status) {
    const principal = currentPrincipalKey();
    if (!principal) return;

    const arr = itemsByUnit.get(unit.id) || [];
    if (!arr.length) return;

    const previous = new Map(arr.map(item => [item.id, itemStatus.get(item.id) || 'new']));
    for (const item of arr) itemStatus.set(item.id, status);
    render(false);

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

  function enterApp(access) {
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
  }

  function leaveApp() {
    currentAccess = null;
    units = [];
    items = [];
    topics = [];
    unitTopicLinks = [];
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
    if (access.access_level !== 'full') {
      leaveApp();
      showMessage('Для этого аккаунта установлен DEMO-доступ. Персональный DEMO подключим отдельным этапом.', 'error');
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
      'Кнопка остаётся на стартовом экране. Серверную проверку VK Donut подключим отдельным этапом, не затрагивая ОГЭ.',
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
      'Глобальный флаг DEMO работает. Безопасную ограниченную выборку подключим отдельным этапом через специальный EGE endpoint/RPC, не ослабляя RLS полного каталога.',
      'DEMO'
    );
  });

  el.adminButton.addEventListener('click', () => {
    showInfo(
      'ADMIN подтверждён',
      `Администратор распознан. Текущий источник: ${runtimeConfig.content_source === 'fipi' ? 'FIPI' : 'Яндекс-резерв'}. Полная админ-панель подключается отдельным этапом.`,
      'ADMIN'
    );
  });

  el.signOutButton.addEventListener('click', async () => {
    if (supabaseClient) await supabaseClient.auth.signOut();
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
    link.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(CONTACT_TEXT); } catch {}
    });
  });

  document.addEventListener('visibilitychange', refreshStatusesWhenVisible);

  init();
})();
