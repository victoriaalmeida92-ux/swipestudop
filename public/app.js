(() => {
  const state = {
    brandDna: {},
    profiles: [],
    items: [],
    syncLogs: [],
    settings: {},
    curation: { models: {} },
    discovery: { candidates: [], dismissedCount: 0, lastDiscoveryAt: null },
    studio: { jobs: [], renders: [], models: [], captionPresets: {}, hasFfmpeg: false },
    meta: { hookTypes: [], funnelStages: ['Topo', 'Meio', 'Fundo'], niches: [], isSyncRunning: false },
    activeTab: 'library',
    activeStudioSubtab: 'generate',
    activeStudioModel: 'gemini-omni',
    selectedItemId: null,
    selectedCurationNiche: null,
    filters: {
      search: '',
      review: 'VALID',
      format: 'ALL',
      niche: 'ALL',
      profile: 'ALL',
      funnel: 'ALL',
      hookType: 'ALL',
      status: 'ALL',
      sort: 'newest',
    },
    hooksFilterType: 'ALL',
    hooksFilterNiche: 'ALL',
    profilesFilterNiche: 'ALL',
  };

  const TAB_HEADERS = {
    library: {
      title: 'Swipe File',
      subtitle: 'Referências desconstruídas de Reels e Stories prontas para modelar',
    },
    hooks: {
      title: 'Banco de Ganchos',
      subtitle: 'Padrões de abertura testados para criar roteiros de alta retenção',
    },
    profiles: {
      title: 'Perfis Monitorados',
      subtitle: 'Gerencie os perfis de Instagram coletados automaticamente via Apify',
    },
    radar: {
      title: 'Radar de Perfis & Treino do Algoritmo',
      subtitle: 'Treine o filtro de relevância com seus votos e descubra novos perfis automaticamente',
    },
    studio: {
      title: 'Studio de Vídeo & Legendas',
      subtitle: 'Modele vídeos via API com Seedance 2.0 e OmniHuman v2, legende com FFmpeg ou edite no Google Vids',
    },
    dna: {
      title: 'DNA da Marca & Produto',
      subtitle: 'A base que garante que toda modelagem saia 100% original e com a sua voz',
    },
    settings: {
      title: 'Configurações & Automação',
      subtitle: 'Tokens Apify/Gemini e agendamento de coleta automática diária',
    },
  };

  const STORY_FRAME_TYPES = [
    'Falado (15s)',
    'Print / Contexto',
    'Texto / Fundo',
    'Demonstração / Bastidores',
    'Enquete / Caixinha',
    'Prova Social',
    'CTA / Oferta',
  ];

  // Helpers
  function esc(str) {
    return String(str ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function fmtNum(n) {
    const num = Number(n) || 0;
    if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
    if (num >= 1_000) return `${(num / 1_000).toFixed(1)}k`;
    return String(num);
  }

  function fmtDuration(sec) {
    const s = Math.round(Number(sec) || 0);
    if (!s) return '';
    const mins = Math.floor(s / 60);
    const rem = s % 60;
    return `${mins}:${String(rem).padStart(2, '0')}`;
  }

  function getInstagramEmbedUrl(url) {
    const match = String(url || '').match(/instagram\.com\/(?:p|reel|tv)\/([A-Za-z0-9_-]+)/i);
    if (!match) return '';
    return `https://www.instagram.com/p/${match[1]}/embed/`;
  }

  function fmtDate(iso) {
    if (!iso) return 'Nunca';
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(iso));
    } catch {
      return iso;
    }
  }

  function toast(message, type = 'success') {
    const container = document.getElementById('toastContainer');
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => {
      el.remove();
    }, 4200);
  }

  async function api(url, options = {}) {
    const res = await fetch(url, {
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
      ...options,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || `Erro HTTP ${res.status}`);
    }
    return data;
  }

  async function copyText(text, successMsg = 'Copiado para a área de transferência!') {
    try {
      await navigator.clipboard.writeText(text);
      toast(successMsg, 'success');
    } catch {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
      toast(successMsg, 'success');
    }
  }

  function buildModelingPrompt(item) {
    const formatNote =
      item.format === 'Story'
        ? 'Crie uma sequência completa de Stories frame a frame (indicando tipo de tela, fala/texto, enquete/interação e CTA final).'
        : 'Crie um roteiro completo de Reel com: 3 opções de Gancho (0-3s), Roteiro cena a cena com indicação visual/falada, Legenda otimizada e CTA.';
    return `Usando a skill modelar-conteudo, o meu DNA da Marca em library/brand-dna.md e a referência ${item.id} (library/items/${item.id}.md):

Quero MODELAR (sem copiar) o padrão estratégico desse ${item.format} do @${item.profileHandle} (Assunto/Nicho: ${item.niche || 'Geral'}) para o meu produto.
- Gancho de referência (${item.hookType}): "${item.hook}"
- Estágio do funil desejado: ${item.funnelStage}
- ${formatNote}`;
  }

  // Bootstrap
  async function loadBootstrap() {
    const data = await api('/api/bootstrap');
    state.brandDna = data.brandDna || {};
    state.profiles = data.profiles || [];
    state.items = data.items || [];
    state.syncLogs = data.syncLogs || [];
    state.settings = data.settings || {};
    state.curation = data.curation || { models: {} };
    state.discovery = data.discovery || { candidates: [], dismissedCount: 0, lastDiscoveryAt: null };
    state.studio = data.studio || { jobs: [], renders: [], models: [], captionPresets: {}, hasFfmpeg: false };
    state.meta = data.meta || state.meta;
    populateStaticSelects();
    renderAll();
    scheduleStudioPolling();
  }

  function populateStaticSelects() {
    const hookTypes = state.meta.hookTypes || [];
    const fillHookSelect = (el, includeAll) => {
      const current = el.value;
      el.innerHTML = includeAll ? '<option value="ALL">Todos Ganchos</option>' : '';
      for (const ht of hookTypes) {
        el.innerHTML += `<option value="${esc(ht)}">${esc(ht)}</option>`;
      }
      if (current && [...el.options].some((o) => o.value === current)) {
        el.value = current;
      }
    };

    fillHookSelect(document.getElementById('filterHookType'), true);
    fillHookSelect(document.getElementById('hooksFilterType'), true);
    fillHookSelect(document.getElementById('newItemHookType'), false);

    // Filter profile select
    const profileSel = document.getElementById('filterProfile');
    const prevProf = profileSel.value;
    const handles = Array.from(
      new Set([
        ...state.profiles.map((p) => p.handle),
        ...state.items.map((i) => i.profileHandle),
      ].filter(Boolean))
    ).sort();
    profileSel.innerHTML = '<option value="ALL">Todos Perfis</option>';
    for (const h of handles) {
      profileSel.innerHTML += `<option value="${esc(h)}">@${esc(h)}</option>`;
    }
    if (prevProf && [...profileSel.options].some((o) => o.value === prevProf)) {
      profileSel.value = prevProf;
    }

    // Niches selects + datalist
    const niches = Array.from(
      new Set([
        ...(state.meta.niches || []),
        ...state.profiles.map((p) => p.niche || 'Geral'),
        ...state.items.map((i) => i.niche || 'Geral'),
      ].filter(Boolean))
    ).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    const fillNicheSelect = (el) => {
      if (!el) return;
      const prev = el.value;
      el.innerHTML = '<option value="ALL">Todos Assuntos/Nichos</option>';
      for (const n of niches) {
        el.innerHTML += `<option value="${esc(n)}">${esc(n)}</option>`;
      }
      if (prev && [...el.options].some((o) => o.value === prev)) {
        el.value = prev;
      }
    };
    fillNicheSelect(document.getElementById('filterNiche'));
    fillNicheSelect(document.getElementById('hooksFilterNiche'));

    const datalist = document.getElementById('nicheSuggestions');
    if (datalist) {
      datalist.innerHTML = niches.map((n) => `<option value="${esc(n)}"></option>`).join('');
    }
  }

  function scoreClass(score) {
    const s = Number(score) || 0;
    if (s >= 65) return 'score-high';
    if (s >= 35) return 'score-mid';
    return 'score-low';
  }

  function renderAll() {
    const validItems = state.items.filter((i) => i.reviewStatus !== 'rejected');
    document.getElementById('badgeTotalItems').textContent = validItems.length;
    document.getElementById('badgeProfiles').textContent = state.profiles.length;
    const candBadge = document.getElementById('badgeCandidates');
    if (candBadge) candBadge.textContent = (state.discovery.candidates || []).length;
    const studioBadge = document.getElementById('badgeStudioJobs');
    if (studioBadge) studioBadge.textContent = (state.studio.jobs || []).length;

    const apifyStatus = document.getElementById('apifyStatusBadge');
    if (state.settings.hasApifyToken) {
      apifyStatus.textContent = 'Apify conectada ✓';
      apifyStatus.style.color = '#6ee7b7';
    } else {
      apifyStatus.textContent = 'Configure APIFY_TOKEN em Config';
      apifyStatus.style.color = '#ffbe76';
    }

    renderKpis();
    renderReviewTabs();
    renderLibraryGrid();
    renderHooksBank();
    renderProfiles();
    renderRadarAndCuration();
    renderStudio();
    renderSyncLogs();
    renderBrandDnaForm();
    renderSettingsForm();
  }

  function renderReviewTabs() {
    const bar = document.getElementById('reviewTabsBar');
    if (!bar) return;
    const pending = state.items.filter((i) => i.reviewStatus === 'pending').length;
    const approved = state.items.filter((i) => i.reviewStatus === 'approved').length;
    const rejected = state.items.filter((i) => i.reviewStatus === 'rejected').length;
    const valid = pending + approved;

    const tabs = [
      { key: 'VALID', label: '✨ Válidos', count: valid },
      { key: 'pending', label: '📥 Para Avaliar', count: pending },
      { key: 'approved', label: '✅ Aprovados', count: approved },
      { key: 'rejected', label: '🚫 Reprovados / Filtrados', count: rejected },
    ];

    bar.innerHTML = tabs
      .map(
        (t) => `
      <button type="button" class="review-tab-pill ${state.filters.review === t.key ? 'active' : ''}" data-review-tab="${t.key}">
        <span>${t.label}</span>
        <span class="niche-filter-count">${t.count}</span>
      </button>
    `
      )
      .join('');
  }

  function renderKpis() {
    const valid = state.items.filter((i) => i.reviewStatus !== 'rejected');
    const approved = state.items.filter((i) => i.reviewStatus === 'approved').length;
    const pending = state.items.filter((i) => i.reviewStatus === 'pending').length;
    const rejected = state.items.filter((i) => i.reviewStatus === 'rejected').length;
    const activeProfiles = state.profiles.filter((p) => p.active).length;
    const nicheCount = new Set(state.profiles.map((p) => p.niche || 'Geral')).size;

    document.getElementById('kpiGrid').innerHTML = `
      <div class="kpi-card">
        <div class="kpi-label">Swipe File Válido</div>
        <div class="kpi-value">${valid.length}</div>
        <div class="kpi-sub">${approved} aprovados · ${pending} para avaliar</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Treinamento do Filtro</div>
        <div class="kpi-value">${approved + rejected}</div>
        <div class="kpi-sub">${approved} 👍 · ${rejected} 👎 filtrados</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Perfis Monitorados</div>
        <div class="kpi-value">${activeProfiles}</div>
        <div class="kpi-sub">${state.profiles.length} perfis · ${nicheCount} nicho(s)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-label">Radar de Perfis</div>
        <div class="kpi-value">${(state.discovery.candidates || []).length}</div>
        <div class="kpi-sub">Novas sugestões aguardando você</div>
      </div>
    `;
  }

  function getFilteredItems() {
    const f = state.filters;
    const q = f.search.trim().toLowerCase();

    let list = state.items.filter((item) => {
      const rv = item.reviewStatus || 'pending';
      if (f.review === 'VALID' && rv === 'rejected') return false;
      if (f.review === 'pending' && rv !== 'pending') return false;
      if (f.review === 'approved' && rv !== 'approved') return false;
      if (f.review === 'rejected' && rv !== 'rejected') return false;

      if (f.format !== 'ALL' && item.format !== f.format) return false;
      if (f.niche !== 'ALL' && (item.niche || 'Geral') !== f.niche) return false;
      if (f.profile !== 'ALL' && item.profileHandle !== f.profile) return false;
      if (f.funnel !== 'ALL' && item.funnelStage !== f.funnel) return false;
      if (f.hookType !== 'ALL' && item.hookType !== f.hookType) return false;
      if (f.status !== 'ALL' && item.status !== f.status) return false;
      if (q) {
        const hay = [
          item.id,
          item.title,
          item.hook,
          item.caption,
          item.profileHandle,
          item.niche,
          item.cta,
          item.whyItWorked,
          ...(item.tags || []),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    list = [...list];
    if (f.sort === 'relevance') {
      list.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    } else if (f.sort === 'views') {
      list.sort((a, b) => (b.metrics?.views || 0) - (a.metrics?.views || 0));
    } else if (f.sort === 'likes') {
      list.sort((a, b) => (b.metrics?.likes || 0) - (a.metrics?.likes || 0));
    } else if (f.sort === 'favorites') {
      list.sort((a, b) => Number(Boolean(b.favorite)) - Number(Boolean(a.favorite)));
    } else {
      list.sort((a, b) => new Date(b.collectedAt || 0) - new Date(a.collectedAt || 0));
    }
    return list;
  }

  function renderLibraryGrid() {
    const list = getFilteredItems();
    const grid = document.getElementById('itemsGrid');

    if (!list.length) {
      grid.innerHTML = `
        <div class="empty-state">
          <h3>Nenhuma referência encontrada com esses filtros</h3>
          <p>Adicione perfis em <strong>Perfis Monitorados</strong> para coletar automaticamente via Apify ou clique em <strong>+ Nova Referência</strong>.</p>
        </div>
      `;
      return;
    }

    grid.innerHTML = list
      .map((item) => {
        const formatClass = item.format === 'Story' ? 'pill-story' : 'pill-reel';
        const funnelClass = `pill-${(item.funnelStage || 'topo').toLowerCase()}`;
        const statusSlug = (item.status || 'novo').toLowerCase().replace(/\s+/g, '-');
        const tagsHtml = (item.tags || [])
          .slice(0, 4)
          .map((t) => `<span class="tag-chip">#${esc(t)}</span>`)
          .join('');
        const metricsHtml =
          item.format === 'Story'
            ? `<span>📱 ${item.storyFrames?.length || 0} frames</span>`
            : `<span>👁️ ${fmtNum(item.metrics?.views)}</span><span>❤️ ${fmtNum(item.metrics?.likes)}</span><span>💬 ${fmtNum(item.metrics?.comments)}</span>`;

        const hasPlayableMedia = Boolean(item.videoUrl || item.thumbnailUrl);
        const durationLabel = fmtDuration(item.metrics?.durationSec);
        const thumbSrc = `/api/media/${encodeURIComponent(item.id)}/thumb`;
        const previewHtml =
          item.format === 'Reel' && hasPlayableMedia
            ? `
              <div class="card-media-preview" data-media-box="${esc(item.id)}">
                ${
                  item.thumbnailUrl
                    ? `<img class="card-media-thumb" src="${thumbSrc}" alt="Capa do Reel ${esc(item.id)}" loading="lazy" onerror="this.style.display='none'" />`
                    : ''
                }
                <button type="button" class="card-play-overlay" data-play-inline="${esc(item.id)}" title="Assistir Reel aqui no card">
                  <span class="card-play-pill">▶ Assistir</span>
                </button>
                ${durationLabel ? `<span class="card-duration-badge">${esc(durationLabel)}</span>` : ''}
              </div>
            `
            : '';

        const rv = item.reviewStatus || 'pending';
        const cardReviewClass = rv === 'approved' ? 'is-approved' : rv === 'rejected' ? 'is-rejected' : '';
        const score = typeof item.relevanceScore === 'number' ? item.relevanceScore : 50;

        return `
          <article class="swipe-card ${cardReviewClass}" data-open-item="${esc(item.id)}">
            ${previewHtml}
            <div class="card-top">
              <span class="pill ${formatClass}">${item.format === 'Story' ? '📱 Story' : '🎬 Reel'}</span>
              <span class="pill pill-niche">${esc(item.niche || 'Geral')}</span>
              <span class="score-pill ${scoreClass(score)}" title="${esc((item.relevanceReasons || []).join(' | '))}">🎯 ${score}%</span>
              <span class="item-id-chip">${esc(item.id)}</span>
              <button class="card-fav-btn ${item.favorite ? 'active' : ''}" data-toggle-fav="${esc(item.id)}" title="Favoritar">★</button>
            </div>

            <div class="card-profile-row">
              <span class="card-handle">@${esc(item.profileHandle)}</span>
              <span>${fmtDate(item.publishedAt || item.collectedAt)}</span>
            </div>

            <div class="card-hook-box">
              <div class="card-hook-type">${esc(item.hookType || 'Gancho')} · ${esc(item.funnelStage)}</div>
              "${esc(item.hook || item.title)}"
            </div>

            <p class="card-title">${esc(item.title)}</p>

            <div class="card-metrics">${metricsHtml}</div>

            ${tagsHtml ? `<div class="card-tags">${tagsHtml}</div>` : ''}
            ${rv === 'rejected' && item.reviewReason ? `<div class="small" style="color:#fca5a5;">Motivo: ${esc(item.reviewReason)}</div>` : ''}

            <div class="card-footer">
              <div class="card-review-actions">
                <button type="button" class="btn-vote approve ${rv === 'approved' ? 'active' : ''}" data-vote-item="${esc(item.id)}" data-vote-status="${rv === 'approved' ? 'pending' : 'approved'}" title="Aprovar e treinar o algoritmo positivamente">👍 ${rv === 'approved' ? 'Aprovado' : ''}</button>
                <button type="button" class="btn-vote reject ${rv === 'rejected' ? 'active' : ''}" data-vote-item="${esc(item.id)}" data-vote-status="${rv === 'rejected' ? 'pending' : 'rejected'}" title="Reprovar conteúdo irrelevante e treinar o filtro">👎 ${rv === 'rejected' ? 'Restaurar' : ''}</button>
              </div>
              <button class="btn btn-sm btn-secondary" data-copy-prompt="${esc(item.id)}">✨ Modelar</button>
            </div>
          </article>
        `;
      })
      .join('');
  }

  function renderHooksBank() {
    const container = document.getElementById('hooksContainer');
    const filterType = state.hooksFilterType;
    const filterNiche = state.hooksFilterNiche;
    const filtered = state.items.filter(
      (it) =>
        it.hook &&
        it.reviewStatus !== 'rejected' &&
        (filterType === 'ALL' || it.hookType === filterType) &&
        (filterNiche === 'ALL' || (it.niche || 'Geral') === filterNiche)
    );

    if (!filtered.length) {
      container.innerHTML = `<div class="empty-state">Nenhum gancho encontrado para esse filtro.</div>`;
      return;
    }

    const groups = new Map();
    for (const item of filtered) {
      const key = item.hookType || 'Outros';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }

    container.innerHTML = Array.from(groups.entries())
      .map(
        ([type, list]) => `
        <div class="hook-group-card">
          <div class="hook-group-title">${esc(type)} (${list.length})</div>
          ${list
            .map(
              (item) => `
            <div class="hook-row">
              <div>
                <div class="hook-row-quote">"${esc(item.hook)}"</div>
                <div class="hook-row-meta">${esc(item.id)} · ${esc(item.format)} · ${esc(item.niche || 'Geral')} · @${esc(item.profileHandle)} · Funil: ${esc(item.funnelStage)}</div>
              </div>
              <div class="hook-row-actions">
                <button class="btn btn-sm btn-ghost" data-copy-hook="${esc(item.id)}">Copiar Gancho</button>
                <button class="btn btn-sm btn-secondary" data-open-item="${esc(item.id)}">Abrir</button>
              </div>
            </div>
          `
            )
            .join('')}
        </div>
      `
      )
      .join('');
  }

  function renderProfiles() {
    const container = document.getElementById('profilesList');
    const tabsBar = document.getElementById('profilesNicheTabs');

    if (!state.profiles.length) {
      if (tabsBar) tabsBar.innerHTML = '';
      container.innerHTML = `
        <div class="empty-state">
          Nenhum perfil monitorado ainda. Cadastre acima os @perfis e escolha o Assunto / Nicho de cada um!
        </div>
      `;
      return;
    }

    // Agrupa perfis por assunto/nicho
    const nicheCounts = new Map();
    for (const p of state.profiles) {
      const n = p.niche || 'Geral';
      nicheCounts.set(n, (nicheCounts.get(n) || 0) + 1);
    }
    const sortedNiches = Array.from(nicheCounts.keys()).sort((a, b) => a.localeCompare(b, 'pt-BR'));

    if (state.profilesFilterNiche !== 'ALL' && !nicheCounts.has(state.profilesFilterNiche)) {
      state.profilesFilterNiche = 'ALL';
    }

    // Renderiza pills de filtro por nicho
    if (tabsBar) {
      const allBtn = `
        <button type="button" class="niche-filter-pill ${state.profilesFilterNiche === 'ALL' ? 'active' : ''}" data-filter-profile-niche="ALL">
          <span>Todos</span>
          <span class="niche-filter-count">${state.profiles.length}</span>
        </button>
      `;
      const nicheBtns = sortedNiches
        .map(
          (n) => `
        <button type="button" class="niche-filter-pill ${state.profilesFilterNiche === n ? 'active' : ''}" data-filter-profile-niche="${esc(n)}">
          <span>${esc(n)}</span>
          <span class="niche-filter-count">${nicheCounts.get(n)}</span>
        </button>
      `
        )
        .join('');
      tabsBar.innerHTML = allBtn + nicheBtns;
    }

    const visibleNiches =
      state.profilesFilterNiche === 'ALL' ? sortedNiches : [state.profilesFilterNiche];

    container.innerHTML = visibleNiches
      .map((nicheName) => {
        const groupProfiles = state.profiles.filter((p) => (p.niche || 'Geral') === nicheName);
        const cardsHtml = groupProfiles
          .map((p) => {
            const count = state.items.filter((i) => i.profileHandle === p.handle).length;
            return `
              <div class="profile-card ${p.active ? '' : 'paused'}">
                <div class="profile-card-top">
                  <div>
                    <div class="profile-handle-big">@${esc(p.handle)}</div>
                    <div class="muted small">${esc(p.displayName)} · ${esc(p.category)}</div>
                  </div>
                  <span class="pill ${p.active ? 'pill-fundo' : 'pill-neutral'}">${p.active ? 'Ativo' : 'Pausado'}</span>
                </div>
                <div class="small muted">${esc(p.whyFollow || 'Sem notas de referência')}</div>
                <div class="small">
                  <strong>Coleta:</strong> ${p.monitorReels ? 'Reels ✓' : 'Reels ✕'} · ${p.monitorStories ? 'Stories ✓' : 'Stories ✕'} · até ${p.maxItemsPerSync}/sync
                </div>
                <div class="small muted">Itens na biblioteca: <strong>${count}</strong> · Última coleta: ${fmtDate(p.lastSyncAt)}</div>
                <div class="profile-actions">
                  <button class="btn btn-sm btn-secondary" data-sync-profile="${esc(p.id)}">↻ Coletar</button>
                  <button class="btn btn-sm btn-ghost" data-edit-profile="${esc(p.id)}">Editar / Nicho</button>
                  <button class="btn btn-sm btn-ghost" data-toggle-profile="${esc(p.id)}">${p.active ? 'Pausar' : 'Ativar'}</button>
                  <button class="btn btn-sm btn-danger" data-delete-profile="${esc(p.id)}">Remover</button>
                </div>
              </div>
            `;
          })
          .join('');

        return `
          <div class="niche-group-section">
            <div class="niche-group-header">
              <div class="niche-group-title">
                <span class="pill pill-niche">${esc(nicheName)}</span>
                <span class="muted small">${groupProfiles.length} perfil(is)</span>
              </div>
              <button class="btn btn-sm btn-secondary" data-sync-niche="${esc(nicheName)}">↻ Coletar Nicho</button>
            </div>
            <div class="profiles-grid">${cardsHtml}</div>
          </div>
        `;
      })
      .join('');
  }

  function openEditProfileModal(profileId) {
    const p = state.profiles.find((x) => x.id === profileId);
    if (!p) return;
    const form = document.getElementById('formEditProfile');
    document.getElementById('editProfileTitle').textContent = `Editar @${p.handle}`;
    form.elements.id.value = p.id;
    form.elements.niche.value = p.niche || 'Geral';
    form.elements.category.value = p.category || 'Concorrente Direto';
    form.elements.displayName.value = p.displayName || '';
    form.elements.maxItemsPerSync.value = p.maxItemsPerSync || 10;
    form.elements.whyFollow.value = p.whyFollow || '';
    form.elements.monitorReels.checked = p.monitorReels !== false;
    form.elements.monitorStories.checked = Boolean(p.monitorStories);
    document.getElementById('editProfileModal').classList.remove('hidden');
  }

  function renderSyncLogs() {
    const container = document.getElementById('syncLogsList');
    if (!state.syncLogs.length) {
      container.innerHTML = `<div class="muted small">Nenhuma coleta executada ainda. Configure seu token da Apify e clique em "Rodar Coleta Agora".</div>`;
      return;
    }

    container.innerHTML = state.syncLogs
      .slice(0, 12)
      .map((log) => {
        const badgeClass =
          log.status === 'success' ? 'pill-fundo' : log.status === 'partial' ? 'pill-meio' : 'pill-reel';
        return `
          <div class="log-item">
            <div class="log-item-top">
              <strong>${fmtDate(log.finishedAt || log.startedAt)}</strong>
              <span class="pill ${badgeClass}">${esc(log.status)} · +${log.newItemsCount} válidos${
                log.filteredOutCount ? ` · 🧹 ${log.filteredOutCount} filtrados` : ''
              }</span>
            </div>
            <div class="muted">Perfis: ${(log.profilesChecked || []).map((h) => '@' + esc(h)).join(', ') || '-'}</div>
            ${
              log.errors?.length
                ? `<div class="log-errors">${log.errors.map((e) => `• ${esc(e)}`).join('<br/>')}</div>`
                : ''
            }
          </div>
        `;
      })
      .join('');
  }

  function renderRadarAndCuration() {
    const models = state.curation?.models || {};
    const niches = Object.keys(models).sort((a, b) => a.localeCompare(b, 'pt-BR'));
    const sel = document.getElementById('curationNicheSelect');
    const discoverNicheInput = document.getElementById('discoverNicheInput');

    if (sel) {
      if (!state.selectedCurationNiche || !niches.includes(state.selectedCurationNiche)) {
        state.selectedCurationNiche = niches.find((n) => n !== 'Exemplo') || niches[0] || 'Geral';
      }
      sel.innerHTML = niches.length
        ? niches.map((n) => `<option value="${esc(n)}" ${n === state.selectedCurationNiche ? 'selected' : ''}>${esc(n)}</option>`).join('')
        : '<option value="Geral">Geral</option>';
    }

    if (discoverNicheInput && !discoverNicheInput.value.trim() && state.selectedCurationNiche && state.selectedCurationNiche !== 'Geral') {
      discoverNicheInput.value = state.selectedCurationNiche;
    }

    const activeNiche = state.selectedCurationNiche || 'Geral';
    const model = models[activeNiche] || {
      niche: activeNiche,
      autoFilterThreshold: 35,
      autoRejectEnabled: true,
      manualPositiveKeywords: [],
      manualNegativeKeywords: [],
      approvedCount: 0,
      rejectedCount: 0,
      topLearned: { positive: [], negative: [] },
    };

    const statsEl = document.getElementById('curationStatsSummary');
    if (statsEl) {
      const totalVotes = (model.approvedCount || 0) + (model.rejectedCount || 0);
      const isTrained = totalVotes >= 2 || (model.manualPositiveKeywords || []).length > 0 || (model.manualNegativeKeywords || []).length > 0;
      statsEl.innerHTML = `
        <span><strong>Nicho:</strong> ${esc(activeNiche)}</span>
        <span>·</span>
        <span style="color:#6ee7b7;"><strong>${model.approvedCount || 0}</strong> aprovados 👍</span>
        <span>·</span>
        <span style="color:#fca5a5;"><strong>${model.rejectedCount || 0}</strong> reprovados 👎</span>
        <span>·</span>
        <span class="${isTrained ? 'score-high' : 'score-mid'} score-pill">${isTrained ? 'Algoritmo ativo ✓' : 'Avalie 2+ itens p/ ativar'}</span>
      `;
    }

    const chk = document.getElementById('curationAutoReject');
    const thr = document.getElementById('curationThreshold');
    const posInput = document.getElementById('curationPosKw');
    const negInput = document.getElementById('curationNegKw');
    if (chk) chk.checked = model.autoRejectEnabled !== false;
    if (thr) thr.value = model.autoFilterThreshold ?? 35;
    if (posInput) posInput.value = (model.manualPositiveKeywords || []).join(', ');
    if (negInput) negInput.value = (model.manualNegativeKeywords || []).join(', ');

    const learnedBox = document.getElementById('learnedTermsBox');
    if (learnedBox) {
      const posTerms = model.topLearned?.positive || [];
      const negTerms = model.topLearned?.negative || [];
      learnedBox.innerHTML = `
        <div>
          <div class="small" style="font-weight:600; margin-bottom:6px; color:#6ee7b7;">Termos positivos aprendidos (usados no filtro e no Radar de Perfis):</div>
          <div class="terms-chips">
            ${
              posTerms.length
                ? posTerms.map((t) => `<span class="term-chip pos">+ ${esc(t.term)} (${t.count})</span>`).join('')
                : '<span class="muted small">Aprove (👍) alguns Reels bons no Swipe File para o algoritmo aprender o que você quer.</span>'
            }
          </div>
        </div>
        <div>
          <div class="small" style="font-weight:600; margin-bottom:6px; color:#fca5a5;">Termos negativos aprendidos (penalizam conteúdo inútil):</div>
          <div class="terms-chips">
            ${
              negTerms.length
                ? negTerms.map((t) => `<span class="term-chip neg">- ${esc(t.term)} (${t.count})</span>`).join('')
                : '<span class="muted small">Reprove (👎) os Reels fora do assunto para o filtro aprender a bloqueá-los.</span>'
            }
          </div>
        </div>
      `;
    }

    // Renderizar Perfis Candidatos (Radar)
    const candList = document.getElementById('candidatesList');
    const metaInfo = document.getElementById('discoveryMetaInfo');
    const candidates = state.discovery?.candidates || [];
    if (metaInfo) {
      metaInfo.textContent = state.discovery?.lastDiscoveryAt
        ? `Última busca: ${fmtDate(state.discovery.lastDiscoveryAt)} · ${state.discovery.dismissedCount || 0} dispensados`
        : 'Nenhuma busca executada ainda';
    }
    if (!candList) return;
    if (!candidates.length) {
      candList.innerHTML = `
        <div class="empty-state">
          <h3>Nenhum perfil sugerido aguardando avaliação</h3>
          <p>Escolha o assunto/nicho acima e clique em <strong>🔎 Descobrir Novos Perfis (Apify)</strong> para trazer de 3 a 5 novos perfis alinhados ao seu treino.</p>
        </div>
      `;
      return;
    }

    candList.innerHTML = candidates
      .map(
        (c) => `
      <div class="candidate-card">
        <div class="candidate-head">
          <div>
            <div class="profile-handle-big">@${esc(c.handle)} ${c.isVerified ? '✓' : ''}</div>
            <div class="muted small">${esc(c.fullName || '')}</div>
          </div>
          <span class="score-pill ${scoreClass(c.matchScore)}">🎯 ${c.matchScore}% match</span>
        </div>
        <div style="display:flex; gap:8px; flex-wrap:wrap; align-items:center;">
          <span class="pill pill-niche">${esc(c.niche || 'Geral')}</span>
          ${c.followersCount ? `<span class="small muted">👥 ${fmtNum(c.followersCount)} seg.</span>` : ''}
          ${c.postsCount ? `<span class="small muted">📸 ${fmtNum(c.postsCount)} posts</span>` : ''}
          <a class="small" href="${esc(c.url)}" target="_blank" rel="noreferrer" style="margin-left:auto;">Ver perfil ↗</a>
        </div>
        ${c.biography ? `<div class="candidate-bio">${esc(c.biography)}</div>` : ''}
        ${
          c.reasons?.length
            ? `<div class="candidate-reasons">${c.reasons.map((r) => `<span>• ${esc(r)}</span>`).join('')}</div>`
            : ''
        }
        <div class="candidate-actions">
          <button type="button" class="btn btn-sm btn-primary" style="flex:1;" data-approve-candidate="${esc(c.id)}">✓ Aprovar e Monitorar</button>
          <button type="button" class="btn btn-sm btn-ghost" data-dismiss-candidate="${esc(c.id)}">✕ Dispensar</button>
        </div>
      </div>
    `
      )
      .join('');
  }

  function renderBrandDnaForm() {
    const form = document.getElementById('formBrandDna');
    const dna = state.brandDna || {};
    for (const field of [
      'brandName',
      'instagramHandle',
      'niche',
      'productName',
      'productOffer',
      'targetAudience',
      'mainPains',
      'mainDesires',
      'commonObjections',
      'uniqueMechanism',
      'toneOfVoice',
      'proofsAndResults',
      'forbiddenCliches',
      'extraNotes',
    ]) {
      const el = form.elements[field];
      if (el) el.value = dna[field] || '';
    }
  }

  let studioPollTimer = null;
  function scheduleStudioPolling() {
    if (studioPollTimer) {
      clearTimeout(studioPollTimer);
      studioPollTimer = null;
    }
    const activeJobs = (state.studio?.jobs || []).filter(
      (j) => j.status === 'IN_QUEUE' || j.status === 'IN_PROGRESS'
    );
    if (!activeJobs.length) return;
    studioPollTimer = setTimeout(async () => {
      try {
        for (const j of activeJobs.slice(0, 3)) {
          await api(`/api/studio/jobs/${encodeURIComponent(j.id)}/refresh`, { method: 'POST', body: '{}' });
        }
        await loadBootstrap();
      } catch {
        scheduleStudioPolling();
      }
    }, 6500);
  }

  function switchMainTab(tab) {
    state.activeTab = tab;
    document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${tab}`));
    const meta = TAB_HEADERS[tab];
    if (meta) {
      document.getElementById('pageTitle').textContent = meta.title;
      document.getElementById('pageSubtitle').textContent = meta.subtitle;
    }
  }

  function switchStudioSubtab(sub) {
    state.activeStudioSubtab = sub;
    document.querySelectorAll('[data-studio-subtab]').forEach((b) => {
      b.classList.toggle('active', b.dataset.studioSubtab === sub);
    });
    document.getElementById('studioSub-generate')?.classList.toggle('hidden', sub !== 'generate');
    document.getElementById('studioSub-subtitles')?.classList.toggle('hidden', sub !== 'subtitles');
  }

  function updateStudioFormForModel(modelKey) {
    state.activeStudioModel = modelKey;
    const models = state.studio?.models || [];
    const model = models.find((m) => m.key === modelKey) || models[0];
    const hiddenInput = document.getElementById('studioModelKeyInput');
    if (hiddenInput) hiddenInput.value = modelKey;

    document.querySelectorAll('[data-studio-model]').forEach((card) => {
      card.classList.toggle('active', card.dataset.studioModel === modelKey);
    });

    const descEl = document.getElementById('studioActiveModelDesc');
    if (descEl && model) {
      descEl.textContent = `${model.name} — Endpoint: ${model.endpoint}`;
    }

    const isGeminiOmni = modelKey === 'gemini-omni';
    const isOmniHuman = modelKey === 'omnihuman';
    const isRef = modelKey === 'seedance-ref';
    const isI2v = modelKey === 'seedance-i2v';
    const isT2v = modelKey === 'seedance-t2v';

    document.getElementById('studioSwipeRefField')?.classList.toggle('hidden', !isRef && !isGeminiOmni);
    document.getElementById('studioVideoCustomBox')?.classList.toggle('hidden', !isRef && !isGeminiOmni);
    document.getElementById('studioImageBox')?.classList.toggle('hidden', isT2v);
    document.getElementById('studioAudioBox')?.classList.toggle('hidden', isI2v || isT2v || isGeminiOmni);
    document.getElementById('studioPromptBox')?.classList.toggle('hidden', isOmniHuman);
    document.getElementById('studioTagInsertRow')?.classList.toggle('hidden', !isRef);
    document.getElementById('studioAspectField')?.classList.toggle('hidden', isOmniHuman);
    document.getElementById('studioDurationField')?.classList.toggle('hidden', isOmniHuman);
    document.getElementById('studioGenAudioField')?.classList.toggle('hidden', isOmniHuman || isGeminiOmni);

    const imgTag = document.getElementById('studioImageTag');
    if (imgTag) imgTag.textContent = isOmniHuman ? 'obrigatório' : isI2v ? 'quadro inicial' : isGeminiOmni ? 'opcional' : '@Image1';
    const audTag = document.getElementById('studioAudioTag');
    if (audTag) audTag.textContent = isOmniHuman ? 'obrigatório' : '@Audio1';

    const statusBadge = document.getElementById('studioFalStatusBadge');
    const submitBtn = document.getElementById('btnSubmitVideoJob');
    if (isGeminiOmni) {
      if (statusBadge) {
        statusBadge.textContent = state.settings?.hasGeminiApiKey ? 'Gemini API conectada ✓' : 'Configure GEMINI_API_KEY em Config';
        statusBadge.className = `pill ${state.settings?.hasGeminiApiKey ? 'pill-fundo' : 'pill-meio'}`;
      }
      if (submitBtn && !submitBtn.disabled) {
        submitBtn.textContent = '🚀 Gerar Vídeo via Gemini Omni (Google)';
      }
    } else {
      if (statusBadge) {
        statusBadge.textContent = state.settings?.hasFalKey ? 'fal.ai conectada ✓' : 'Configure FAL_KEY em Config';
        statusBadge.className = `pill ${state.settings?.hasFalKey ? 'pill-fundo' : 'pill-meio'}`;
      }
      if (submitBtn && !submitBtn.disabled) {
        submitBtn.textContent = '🚀 Gerar Vídeo via API (fal.ai)';
      }
    }
  }

  function renderStudio() {
    const models = state.studio?.models || [];
    const grid = document.getElementById('studioModelsGrid');
    if (grid && models.length) {
      grid.innerHTML = models
        .map(
          (m) => `
        <button type="button" class="studio-model-card ${state.activeStudioModel === m.key ? 'active' : ''}" data-studio-model="${esc(m.key)}">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
            <span class="pill pill-niche">${esc(m.badge)}</span>
            <span class="small muted">${esc(m.provider)}</span>
          </div>
          <div class="studio-model-name">${esc(m.name)}</div>
          <div class="small muted">${esc(m.description)}</div>
        </button>
      `
        )
        .join('');
    }

    const falBadge = document.getElementById('studioFalStatusBadge');
    if (falBadge) {
      if (state.settings?.hasFalKey) {
        falBadge.textContent = 'fal.ai conectada ✓';
        falBadge.className = 'pill pill-fundo';
      } else {
        falBadge.textContent = 'Configure FAL_KEY em Config';
        falBadge.className = 'pill pill-meio';
      }
    }

    const ffmpegBadge = document.getElementById('ffmpegStatusBadge');
    if (ffmpegBadge) {
      ffmpegBadge.textContent = state.studio?.hasFfmpeg ? 'FFmpeg local pronto ✓' : 'FFmpeg indisponível';
      ffmpegBadge.className = `pill ${state.studio?.hasFfmpeg ? 'pill-fundo' : 'pill-reel'}`;
    }

    // Popula select de Reels do Swipe File para referência
    const swipeSel = document.getElementById('studioSwipeItemSelect');
    const validReels = state.items.filter((i) => i.format === 'Reel' && i.reviewStatus !== 'rejected');
    if (swipeSel) {
      const prev = swipeSel.value;
      swipeSel.innerHTML = '<option value="">(Nenhum — opcional)</option>';
      for (const r of validReels) {
        const star = r.reviewStatus === 'approved' ? '✅ ' : '';
        swipeSel.innerHTML += `<option value="${esc(r.id)}">${star}${esc(r.id)} · @${esc(r.profileHandle)} — ${esc(
          (r.hook || r.title || '').slice(0, 48)
        )}</option>`;
      }
      if (prev && [...swipeSel.options].some((o) => o.value === prev)) swipeSel.value = prev;
    }

    // Popula select de origem no Editor de Legendas
    const subSel = document.getElementById('subVideoSourceSelect');
    const completedJobs = (state.studio?.jobs || []).filter((j) => j.status === 'COMPLETED' && j.localVideoUrl);
    if (subSel) {
      const prev = subSel.value;
      let html = '<option value="">Selecione um vídeo do Studio ou Swipe File...</option>';
      if (completedJobs.length) {
        html += '<optgroup label="🎬 Vídeos Gerados no Studio">';
        for (const j of completedJobs) {
          html += `<option value="studio-job::${esc(j.id)}">${esc(j.title)} (${esc(j.modelKey)})</option>`;
        }
        html += '</optgroup>';
      }
      if (validReels.length) {
        html += '<optgroup label="📚 Reels do Swipe File">';
        for (const r of validReels.slice(0, 40)) {
          html += `<option value="swipe-item::${esc(r.id)}">${esc(r.id)} · @${esc(r.profileHandle)} — ${esc(
            (r.title || '').slice(0, 42)
          )}</option>`;
        }
        html += '</optgroup>';
      }
      subSel.innerHTML = html;
      if (prev && [...subSel.options].some((o) => o.value === prev)) subSel.value = prev;
    }

    updateStudioFormForModel(state.activeStudioModel);

    // Lista de Jobs gerados
    const jobsList = document.getElementById('studioJobsList');
    const jobs = state.studio?.jobs || [];
    if (jobsList) {
      if (!jobs.length) {
        jobsList.innerHTML = `
          <div class="empty-state">
            <h4>Nenhum vídeo gerado ainda</h4>
            <p class="small">Configure sua <strong>FAL_KEY</strong> em <strong>Config &amp; Automação</strong>, escolha Seedance ou OmniHuman ao lado e gere seu primeiro vídeo modelado!</p>
          </div>
        `;
      } else {
        jobsList.innerHTML = jobs
          .map((j) => {
            const stClass =
              j.status === 'COMPLETED'
                ? 'pill-fundo'
                : j.status === 'FAILED'
                  ? 'pill-reel'
                  : 'pill-meio';
            const videoSrc = j.localVideoUrl || j.remoteVideoUrl;
            return `
              <div class="studio-job-card">
                <div class="studio-job-head">
                  <div>
                    <div style="font-weight:700; color:#fff;">${esc(j.title)}</div>
                    <div class="small muted">${esc(j.modelName)} · ${fmtDate(j.createdAt)}</div>
                  </div>
                  <span class="pill ${stClass}">${esc(j.status)}</span>
                </div>
                ${
                  j.status === 'COMPLETED' && videoSrc
                    ? `<video class="studio-job-video" controls playsinline preload="metadata" src="${esc(videoSrc)}"></video>`
                    : ''
                }
                ${j.error ? `<div class="small" style="color:#fca5a5;">${esc(j.error)}</div>` : ''}
                ${j.prompt ? `<div class="small muted">"${esc(j.prompt.slice(0, 140))}${j.prompt.length > 140 ? '...' : ''}"</div>` : ''}
                <div class="studio-job-actions">
                  ${
                    j.status !== 'COMPLETED' && j.status !== 'FAILED'
                      ? `<button type="button" class="btn btn-sm btn-secondary" data-refresh-job="${esc(j.id)}">↻ Atualizar</button>`
                      : ''
                  }
                  ${
                    j.status === 'COMPLETED' && j.localVideoUrl
                      ? `<button type="button" class="btn btn-sm btn-primary" data-subtitle-job="${esc(j.id)}">💬 Legendar</button>
                         <a class="btn btn-sm btn-secondary" href="${esc(j.localVideoUrl)}" download="${esc(j.id)}.mp4">⬇ MP4</a>
                         <a class="btn btn-sm btn-ghost" href="https://vids.new" target="_blank" rel="noreferrer">🎞️ Google Vids ↗</a>`
                      : ''
                  }
                  <button type="button" class="btn btn-sm btn-danger" data-delete-job="${esc(j.id)}">Excluir</button>
                </div>
              </div>
            `;
          })
          .join('');
      }
    }

    // Lista de Vídeos Legendados (FFmpeg Renders)
    const rendersList = document.getElementById('studioRendersList');
    const renders = state.studio?.renders || [];
    if (rendersList) {
      if (!renders.length) {
        rendersList.innerHTML = `<div class="muted small">Nenhum vídeo legendado ainda. Escolha um vídeo ao lado, gere o .SRT e clique em "Renderizar Vídeo Legendado".</div>`;
      } else {
        rendersList.innerHTML = renders
          .map(
            (r) => `
          <div class="studio-job-card">
            <div class="studio-job-head">
              <div>
                <div style="font-weight:700; color:#fff;">${esc(r.title)}</div>
                <div class="small muted">${r.cuesCount} blocos de legenda · ${esc(r.stylePreset)} · ${fmtDate(r.createdAt)}</div>
              </div>
              <span class="pill pill-fundo">Pronto ✓</span>
            </div>
            <video class="studio-job-video" controls playsinline preload="metadata" src="${esc(r.videoUrl)}"></video>
            <div class="studio-job-actions">
              <a class="btn btn-sm btn-primary" href="${esc(r.videoUrl)}" download="${esc(r.mp4FileName)}">⬇ Baixar MP4 Legendado</a>
              <a class="btn btn-sm btn-secondary" href="${esc(r.srtUrl)}" download="${esc(r.srtFileName)}">📄 Baixar .SRT</a>
              <button type="button" class="btn btn-sm btn-danger" data-delete-render="${esc(r.id)}">Excluir</button>
            </div>
          </div>
        `
          )
          .join('');
      }
    }
  }

  function renderSettingsForm() {
    const form = document.getElementById('formSettings');
    const s = state.settings || {};
    form.elements.apifyReelsActor.value = s.apifyReelsActor || 'apify~instagram-reel-scraper';
    form.elements.apifyStoriesActor.value = s.apifyStoriesActor || '';
    form.elements.geminiModel.value = s.geminiModel || 'gemini-2.5-flash';
    if (form.elements.geminiOmniModel) {
      form.elements.geminiOmniModel.value = s.geminiOmniModel || 'gemini-omni-1.2-flash';
    }
    form.elements.defaultMaxItemsPerProfile.value = s.defaultMaxItemsPerProfile || 10;
    if (form.elements.falSeedanceRefModel) {
      form.elements.falSeedanceRefModel.value = s.falSeedanceRefModel || 'bytedance/seedance-2.0/reference-to-video';
    }
    if (form.elements.falOmnihumanModel) {
      form.elements.falOmnihumanModel.value = s.falOmnihumanModel || 'bytedance/omnihuman/v2';
    }

    document.getElementById('settingsApifyState').textContent = s.hasApifyToken
      ? `Configurado (${s.apifyTokenMasked})`
      : 'Não configurado';
    document.getElementById('settingsGeminiState').textContent = s.hasGeminiApiKey
      ? `Configurado (${s.geminiApiKeyMasked})`
      : 'Opcional (usando heurística local)';
    const falState = document.getElementById('settingsFalState');
    if (falState) {
      falState.textContent = s.hasFalKey ? `Configurado (${s.falKeyMasked})` : 'Não configurado';
    }
  }

  // Detail Modal
  function openItemDetail(itemId) {
    const item = state.items.find((i) => i.id === itemId);
    if (!item) return;
    state.selectedItemId = itemId;

    const pill = document.getElementById('detailFormatPill');
    pill.textContent = item.format === 'Story' ? '📱 Story' : '🎬 Reel';
    pill.className = `pill ${item.format === 'Story' ? 'pill-story' : 'pill-reel'}`;
    document.getElementById('detailIdChip').textContent = item.id;
    document.getElementById('detailTitle').textContent = item.title;

    const hookOptions = (state.meta.hookTypes || [])
      .map((ht) => `<option value="${esc(ht)}" ${ht === item.hookType ? 'selected' : ''}>${esc(ht)}</option>`)
      .join('');

    const framesHtml =
      item.format === 'Story'
        ? `
          <div class="detail-section">
            <div class="detail-section-label">Sequência de Stories (${item.storyFrames?.length || 0} frames)</div>
            ${
              item.storyFrames?.length
                ? item.storyFrames
                    .map(
                      (f, idx) => `
                    <div class="story-frame-card">
                      <div class="story-frame-head">Story ${idx + 1} · ${esc(f.type || 'Tela')}</div>
                      <div>${esc(f.content)}</div>
                    </div>
                  `
                    )
                    .join('')
                : '<p class="muted small">Nenhum frame cadastrado.</p>'
            }
          </div>
        `
        : '';

    const embedUrl = getInstagramEmbedUrl(item.url);
    const hasVideo = Boolean(item.videoUrl);
    const showPlayerColumn = item.format === 'Reel' && (hasVideo || embedUrl || item.thumbnailUrl);
    const videoSrc = `/api/media/${encodeURIComponent(item.id)}/video`;
    const thumbSrc = `/api/media/${encodeURIComponent(item.id)}/thumb`;

    const playerColumnHtml = showPlayerColumn
      ? `
        <div class="reel-player-column">
          <div class="reel-player-shell">
            <div class="reel-player-stage" id="detailPlayerStage">
              ${
                hasVideo
                  ? `<video id="detailReelVideo" class="reel-player-video" controls playsinline preload="metadata" ${
                      item.thumbnailUrl ? `poster="${thumbSrc}"` : ''
                    } src="${videoSrc}"></video>`
                  : embedUrl
                    ? `<iframe class="reel-player-iframe" src="${esc(embedUrl)}" allowtransparency="true" allowfullscreen></iframe>`
                    : `<div class="reel-player-empty">Sem vídeo direto disponível.</div>`
              }
            </div>
            <div class="reel-player-bar">
              <div class="small muted">${fmtDuration(item.metrics?.durationSec) ? `⏱️ ${fmtDuration(item.metrics?.durationSec)}` : '🎬 Player local'}</div>
              <div style="display:flex; gap:6px; flex-wrap:wrap;">
                ${
                  hasVideo && embedUrl
                    ? `<button type="button" class="btn btn-sm btn-ghost" id="btnToggleEmbedMode" data-mode="mp4">Embed IG</button>`
                    : ''
                }
                ${
                  hasVideo
                    ? `<a class="btn btn-sm btn-secondary" href="${videoSrc}" download="${esc(item.id)}.mp4">⬇ MP4</a>`
                    : ''
                }
              </div>
            </div>
          </div>
        </div>
      `
      : '';

    const rv = item.reviewStatus || 'pending';
    const score = typeof item.relevanceScore === 'number' ? item.relevanceScore : 50;
    const reviewBannerHtml = `
      <div class="review-banner">
        <div class="review-banner-top">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
            <span class="score-pill ${scoreClass(score)}">🎯 Relevância: ${score}%</span>
            <span class="small muted">Avaliação atual: <strong>${
              rv === 'approved' ? '✅ Aprovado' : rv === 'rejected' ? '🚫 Reprovado' : '📥 Pendente'
            }</strong></span>
          </div>
          <div class="card-review-actions">
            <button type="button" class="btn-vote approve ${rv === 'approved' ? 'active' : ''}" id="btnDetailApprove">👍 Aprovar</button>
            <button type="button" class="btn-vote reject ${rv === 'rejected' ? 'active' : ''}" id="btnDetailReject">👎 Reprovar</button>
            ${rv !== 'pending' ? `<button type="button" class="btn-vote" id="btnDetailPending">↩ Pendente</button>` : ''}
          </div>
        </div>
        <div class="small muted">${(item.relevanceReasons || []).map((r) => esc(r)).join(' · ')}</div>
        <div class="field-row">
          <input type="text" id="detailReviewReason" class="input" style="flex:1;" placeholder="Motivo opcional se reprovar (ex: Fora do nicho Lipedema, conteúdo pessoal/aleatório...)" value="${esc(item.reviewReason || '')}" />
        </div>
      </div>
    `;

    const body = document.getElementById('detailModalBody');
    body.innerHTML = `
      <form id="formEditItem" class="detail-grid ${showPlayerColumn ? 'with-player' : ''}">
        ${playerColumnHtml}
        <div>
          ${reviewBannerHtml}
          <div class="detail-section">
            <div class="detail-section-label">Gancho (0–3s / Abertura)</div>
            <textarea name="hook" class="textarea" rows="2">${esc(item.hook)}</textarea>
          </div>

          <div class="detail-section">
            <div class="detail-section-label">Estrutura Narrativa (Esqueleto para Modelar)</div>
            <textarea name="structure" class="textarea" rows="2">${esc(item.structure)}</textarea>
          </div>

          ${framesHtml}

          <div class="detail-section">
            <div class="detail-section-label">Roteiro / Transcrição</div>
            <textarea name="scriptOrTranscript" class="textarea" rows="6" placeholder="Cole a transcrição do áudio ou descreva as cenas do Reel...">${esc(item.scriptOrTranscript)}</textarea>
          </div>

          <div class="detail-section">
            <div class="detail-section-label">Por que Funcionou (Análise Estratégica)</div>
            <textarea name="whyItWorked" class="textarea" rows="3">${esc(item.whyItWorked)}</textarea>
          </div>

          <div class="detail-section">
            <div class="detail-section-label">Legenda Original</div>
            <textarea name="caption" class="textarea" rows="3">${esc(item.caption)}</textarea>
          </div>
        </div>

        <div>
          <div class="detail-section stack-form">
            <div class="detail-section-label">Metadados &amp; Classificação</div>
            <div class="small">
              <strong>Perfil:</strong> @${esc(item.profileHandle)}
              ${item.url ? ` · <a href="${esc(item.url)}" target="_blank" rel="noreferrer">Abrir no Instagram ↗</a>` : ''}
            </div>
            ${
              item.format === 'Reel'
                ? `<div class="card-metrics">
                     <span>👁️ ${fmtNum(item.metrics?.views)} views</span>
                     <span>❤️ ${fmtNum(item.metrics?.likes)} likes</span>
                     <span>💬 ${fmtNum(item.metrics?.comments)} com.</span>
                   </div>`
                : ''
            }
            <label class="field">
              <span>Título</span>
              <input type="text" name="title" class="input" value="${esc(item.title)}" />
            </label>
            <label class="field">
              <span>Assunto / Nicho</span>
              <input type="text" name="niche" class="input" list="nicheSuggestions" value="${esc(item.niche || 'Geral')}" />
            </label>
            <label class="field">
              <span>Status na Produção</span>
              <select name="status" class="select">
                ${['Novo', 'Para Modelar', 'Modelado', 'Arquivado']
                  .map((st) => `<option value="${st}" ${st === item.status ? 'selected' : ''}>${st}</option>`)
                  .join('')}
              </select>
            </label>
            <label class="field">
              <span>Estágio do Funil</span>
              <select name="funnelStage" class="select">
                ${['Topo', 'Meio', 'Fundo']
                  .map((st) => `<option value="${st}" ${st === item.funnelStage ? 'selected' : ''}>${st}</option>`)
                  .join('')}
              </select>
            </label>
            <label class="field">
              <span>Tipo de Gancho</span>
              <select name="hookType" class="select">${hookOptions}</select>
            </label>
            <label class="field">
              <span>CTA (Chamada para Ação)</span>
              <input type="text" name="cta" class="input" value="${esc(item.cta)}" />
            </label>
            <label class="field">
              <span>Tags (vírgula)</span>
              <input type="text" name="tags" class="input" value="${esc((item.tags || []).join(', '))}" />
            </label>
            <label class="field">
              <span>Notas Pessoais / Ideias de Adaptação</span>
              <textarea name="notes" class="textarea" rows="3" placeholder="Como adaptar isso pro meu produto?">${esc(item.notes)}</textarea>
            </label>
            <div class="small muted">Fonte: ${esc(item.source)} · Análise: ${esc(item.analyzedWith || 'manual')}</div>
            <div class="field-row" style="margin-top:8px;">
              <button type="submit" class="btn btn-primary" style="flex:1;">Salvar Alterações</button>
              <button type="button" class="btn btn-danger" id="btnDeleteCurrentItem">Excluir</button>
            </div>
          </div>
        </div>
      </form>
    `;

    document.getElementById('detailModal').classList.remove('hidden');

    // Fallback automático para Embed do Instagram caso o MP4 tenha expirado, + botão manual de alternar
    const videoEl = document.getElementById('detailReelVideo');
    const stageEl = document.getElementById('detailPlayerStage');
    const toggleEmbedBtn = document.getElementById('btnToggleEmbedMode');

    const switchToEmbed = () => {
      if (!stageEl || !embedUrl) return;
      stageEl.innerHTML = `<iframe class="reel-player-iframe" src="${esc(embedUrl)}" allowtransparency="true" allowfullscreen></iframe>`;
      if (toggleEmbedBtn) {
        toggleEmbedBtn.dataset.mode = 'embed';
        toggleEmbedBtn.textContent = 'Player MP4';
      }
    };

    const switchToMp4 = () => {
      if (!stageEl || !hasVideo) return;
      stageEl.innerHTML = `<video id="detailReelVideo" class="reel-player-video" controls playsinline preload="metadata" ${
        item.thumbnailUrl ? `poster="${thumbSrc}"` : ''
      } src="${videoSrc}"></video>`;
      if (toggleEmbedBtn) {
        toggleEmbedBtn.dataset.mode = 'mp4';
        toggleEmbedBtn.textContent = 'Embed IG';
      }
    };

    if (videoEl && embedUrl) {
      videoEl.addEventListener('error', () => {
        switchToEmbed();
      });
    }

    if (toggleEmbedBtn) {
      toggleEmbedBtn.addEventListener('click', () => {
        if (toggleEmbedBtn.dataset.mode === 'mp4') {
          switchToEmbed();
        } else {
          switchToMp4();
        }
      });
    }

    const sendDetailVote = async (reviewStatus) => {
      const reasonEl = document.getElementById('detailReviewReason');
      try {
        await api(`/api/items/${encodeURIComponent(item.id)}/review`, {
          method: 'POST',
          body: JSON.stringify({
            reviewStatus,
            reviewReason: reasonEl ? reasonEl.value.trim() : '',
          }),
        });
        toast(
          reviewStatus === 'approved'
            ? '👍 Aprovado! Algoritmo do nicho atualizado.'
            : reviewStatus === 'rejected'
              ? '👎 Reprovado! Filtro treinado para evitar conteúdo parecido.'
              : 'Item retornado para Pendente.',
          'success'
        );
        await loadBootstrap();
        openItemDetail(item.id);
      } catch (err) {
        toast(err.message, 'error');
      }
    };
    document.getElementById('btnDetailApprove')?.addEventListener('click', () => sendDetailVote('approved'));
    document.getElementById('btnDetailReject')?.addEventListener('click', () => sendDetailVote('rejected'));
    document.getElementById('btnDetailPending')?.addEventListener('click', () => sendDetailVote('pending'));

    document.getElementById('formEditItem').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api(`/api/items/${encodeURIComponent(item.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            title: fd.get('title'),
            niche: fd.get('niche'),
            hook: fd.get('hook'),
            structure: fd.get('structure'),
            scriptOrTranscript: fd.get('scriptOrTranscript'),
            whyItWorked: fd.get('whyItWorked'),
            caption: fd.get('caption'),
            status: fd.get('status'),
            funnelStage: fd.get('funnelStage'),
            hookType: fd.get('hookType'),
            cta: fd.get('cta'),
            tags: fd.get('tags'),
            notes: fd.get('notes'),
          }),
        });
        toast('Referência atualizada e Markdown sincronizado!', 'success');
        await loadBootstrap();
        openItemDetail(item.id);
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    document.getElementById('btnDeleteCurrentItem').addEventListener('click', async () => {
      if (!confirm(`Remover ${item.id} do Swipe File?`)) return;
      try {
        await api(`/api/items/${encodeURIComponent(item.id)}`, { method: 'DELETE' });
        closeModal('detailModal');
        toast('Referência removida.', 'success');
        await loadBootstrap();
      } catch (err) {
        toast(err.message, 'error');
      }
    });
  }

  function closeModal(id) {
    const modal = document.getElementById(id);
    if (!modal) return;
    modal.querySelectorAll('video').forEach((v) => {
      v.pause();
    });
    if (id === 'detailModal') {
      const stage = document.getElementById('detailPlayerStage');
      if (stage) stage.innerHTML = '';
    }
    modal.classList.add('hidden');
  }

  // Story Frames Builder (New Item Modal)
  function addStoryFrameRow(defaultType = 'Falado (15s)', defaultContent = '') {
    const builder = document.getElementById('storyFramesBuilder');
    const idx = builder.children.length + 1;
    const row = document.createElement('div');
    row.className = 'frame-row';
    row.innerHTML = `
      <div class="frame-row-top">
        <strong class="frame-label">Story ${idx}</strong>
        <select class="select frame-type-select">
          ${STORY_FRAME_TYPES.map((t) => `<option value="${esc(t)}" ${t === defaultType ? 'selected' : ''}>${esc(t)}</option>`).join('')}
        </select>
        <button type="button" class="btn btn-sm btn-ghost btn-remove-frame">Remover</button>
      </div>
      <textarea class="textarea frame-content-input" rows="2" placeholder="O que acontece / o que é dito ou escrito nesse Story?">${esc(defaultContent)}</textarea>
    `;
    row.querySelector('.btn-remove-frame').addEventListener('click', () => {
      row.remove();
      [...builder.children].forEach((r, i) => {
        r.querySelector('.frame-label').textContent = `Story ${i + 1}`;
      });
    });
    builder.appendChild(row);
  }

  function resetNewItemForm(format = 'Reel') {
    const form = document.getElementById('formNewItem');
    form.reset();
    setNewItemFormat(format);
    const builder = document.getElementById('storyFramesBuilder');
    builder.innerHTML = '';
    addStoryFrameRow('Print / Contexto', '');
    addStoryFrameRow('Falado (15s)', '');
    addStoryFrameRow('CTA / Oferta', '');
  }

  function setNewItemFormat(format) {
    document.getElementById('newItemFormatInput').value = format;
    document.querySelectorAll('[data-new-format]').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.newFormat === format);
    });
    document.getElementById('reelOnlyFields').classList.toggle('hidden', format === 'Story');
    document.getElementById('storyOnlyFields').classList.toggle('hidden', format !== 'Story');
  }

  // Sync Trigger
  async function triggerSync(profileId = null, niche = null) {
    const btnMain = document.getElementById('btnSyncNow');
    const btnTab = document.getElementById('btnSyncProfilesTab');
    btnMain.disabled = true;
    btnTab.disabled = true;
    btnMain.innerHTML = '<span>⏳ Coletando...</span>';
    try {
      const result = await api('/api/sync', {
        method: 'POST',
        body: JSON.stringify({ profileId, niche }),
      });
      await loadBootstrap();
      if (result.errors?.length) {
        toast(
          `Coleta concluída (+${result.newItemsCount} válidos${
            result.filteredOutCount ? `, ${result.filteredOutCount} filtrados` : ''
          }) com avisos.`,
          'error'
        );
      } else {
        toast(
          `Coleta Apify concluída! +${result.newItemsCount} novos itens${
            result.filteredOutCount ? ` (${result.filteredOutCount} irrelevantes filtrados)` : ''
          }.`,
          'success'
        );
      }
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btnMain.disabled = false;
      btnTab.disabled = false;
      btnMain.innerHTML = '<span class="btn-icon">↻</span><span>Sincronizar Apify</span>';
    }
  }

  // Event Wiring
  function initEvents() {
    // Tabs
    document.getElementById('navMenu').addEventListener('click', (e) => {
      const btn = e.target.closest('[data-tab]');
      if (!btn) return;
      const tab = btn.dataset.tab;
      state.activeTab = tab;
      document.querySelectorAll('.nav-item').forEach((b) => b.classList.toggle('active', b === btn));
      document.querySelectorAll('.tab-panel').forEach((p) => p.classList.toggle('active', p.id === `tab-${tab}`));
      const meta = TAB_HEADERS[tab];
      if (meta) {
        document.getElementById('pageTitle').textContent = meta.title;
        document.getElementById('pageSubtitle').textContent = meta.subtitle;
      }
    });

    // Filters
    const bindFilter = (id, key) => {
      const el = document.getElementById(id);
      const evt = el.tagName === 'INPUT' ? 'input' : 'change';
      el.addEventListener(evt, () => {
        state.filters[key] = el.value;
        renderLibraryGrid();
      });
    };
    bindFilter('filterSearch', 'search');
    bindFilter('filterFormat', 'format');
    bindFilter('filterNiche', 'niche');
    bindFilter('filterProfile', 'profile');
    bindFilter('filterFunnel', 'funnel');
    bindFilter('filterHookType', 'hookType');
    bindFilter('filterStatus', 'status');
    bindFilter('filterSort', 'sort');

    document.getElementById('hooksFilterType').addEventListener('change', (e) => {
      state.hooksFilterType = e.target.value;
      renderHooksBank();
    });
    document.getElementById('hooksFilterNiche').addEventListener('change', (e) => {
      state.hooksFilterNiche = e.target.value;
      renderHooksBank();
    });

    // Auto-preenche assunto/nicho no modal de novo item ao digitar um @perfil já cadastrado
    const newHandleEl = document.getElementById('newItemProfileHandle');
    const newNicheEl = document.getElementById('newItemNicheInput');
    if (newHandleEl && newNicheEl) {
      newHandleEl.addEventListener('blur', () => {
        if (newNicheEl.value.trim()) return;
        const clean = newHandleEl.value.trim().replace(/^@+/, '').toLowerCase();
        const found = state.profiles.find((p) => p.handle === clean);
        if (found?.niche) newNicheEl.value = found.niche;
      });
    }

    // Delegated clicks on Library & Hooks
    document.body.addEventListener('click', async (e) => {
      const closeBtn = e.target.closest('[data-close-modal]');
      if (closeBtn) {
        closeModal(closeBtn.dataset.closeModal);
        return;
      }

      const reviewTab = e.target.closest('[data-review-tab]');
      if (reviewTab) {
        state.filters.review = reviewTab.dataset.reviewTab;
        renderReviewTabs();
        renderLibraryGrid();
        return;
      }

      const voteBtn = e.target.closest('[data-vote-item]');
      if (voteBtn) {
        e.stopPropagation();
        const id = voteBtn.dataset.voteItem;
        const reviewStatus = voteBtn.dataset.voteStatus;
        try {
          await api(`/api/items/${encodeURIComponent(id)}/review`, {
            method: 'POST',
            body: JSON.stringify({
              reviewStatus,
              reviewReason: reviewStatus === 'rejected' ? 'Fora do nicho / irrelevante' : '',
            }),
          });
          toast(
            reviewStatus === 'approved'
              ? '👍 Aprovado! Algoritmo do nicho atualizado.'
              : reviewStatus === 'rejected'
                ? '👎 Reprovado! Filtro atualizado para evitar conteúdo parecido.'
                : 'Item restaurado para Pendente.',
            'success'
          );
          await loadBootstrap();
        } catch (err) {
          toast(err.message, 'error');
        }
        return;
      }

      const approveCand = e.target.closest('[data-approve-candidate]');
      if (approveCand) {
        const id = approveCand.dataset.approveCandidate;
        approveCand.disabled = true;
        try {
          const res = await api(`/api/discovery/candidates/${encodeURIComponent(id)}/approve`, {
            method: 'POST',
            body: JSON.stringify({}),
          });
          toast(`✓ @${res.profile.handle} aprovado e adicionado ao nicho "${res.profile.niche}"!`, 'success');
          await loadBootstrap();
        } catch (err) {
          toast(err.message, 'error');
          approveCand.disabled = false;
        }
        return;
      }

      const dismissCand = e.target.closest('[data-dismiss-candidate]');
      if (dismissCand) {
        const id = dismissCand.dataset.dismissCandidate;
        try {
          await api(`/api/discovery/candidates/${encodeURIComponent(id)}/dismiss`, {
            method: 'POST',
            body: JSON.stringify({}),
          });
          toast('Perfil dispensado (não será sugerido novamente).', 'success');
          await loadBootstrap();
        } catch (err) {
          toast(err.message, 'error');
        }
        return;
      }

      const favBtn = e.target.closest('[data-toggle-fav]');
      if (favBtn) {
        e.stopPropagation();
        const id = favBtn.dataset.toggleFav;
        const item = state.items.find((i) => i.id === id);
        if (!item) return;
        await api(`/api/items/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ favorite: !item.favorite }),
        });
        await loadBootstrap();
        return;
      }

      const promptBtn = e.target.closest('[data-copy-prompt]');
      if (promptBtn) {
        e.stopPropagation();
        const item = state.items.find((i) => i.id === promptBtn.dataset.copyPrompt);
        if (item) copyText(buildModelingPrompt(item), 'Prompt de modelagem copiado! Cole no chat do Antigravity.');
        return;
      }

      const copyHookBtn = e.target.closest('[data-copy-hook]');
      if (copyHookBtn) {
        e.stopPropagation();
        const item = state.items.find((i) => i.id === copyHookBtn.dataset.copyHook);
        if (item) copyText(item.hook, 'Gancho copiado!');
        return;
      }

      const playInlineBtn = e.target.closest('[data-play-inline]');
      if (playInlineBtn) {
        e.stopPropagation();
        const id = playInlineBtn.dataset.playInline;
        const item = state.items.find((i) => i.id === id);
        if (!item) return;
        const box = playInlineBtn.closest('[data-media-box]');
        if (!box) return;

        // Pausa outros vídeos inline tocando no grid
        document.querySelectorAll('.card-inline-video').forEach((v) => v.pause());

        if (item.videoUrl) {
          box.classList.add('playing');
          box.innerHTML = `<video class="card-inline-video" controls autoplay playsinline src="/api/media/${encodeURIComponent(
            item.id
          )}/video"></video>`;
          const vid = box.querySelector('video');
          vid.addEventListener('click', (ev) => ev.stopPropagation());
          vid.addEventListener('error', () => {
            openItemDetail(item.id);
          });
        } else {
          openItemDetail(item.id);
        }
        return;
      }

      const openCard = e.target.closest('[data-open-item]');
      if (openCard) {
        if (e.target.closest('video')) return;
        openItemDetail(openCard.dataset.openItem);
        return;
      }

      const filterProfNiche = e.target.closest('[data-filter-profile-niche]');
      if (filterProfNiche) {
        state.profilesFilterNiche = filterProfNiche.dataset.filterProfileNiche;
        renderProfiles();
        return;
      }

      const syncNiche = e.target.closest('[data-sync-niche]');
      if (syncNiche) {
        triggerSync(null, syncNiche.dataset.syncNiche);
        return;
      }

      const editProf = e.target.closest('[data-edit-profile]');
      if (editProf) {
        openEditProfileModal(editProf.dataset.editProfile);
        return;
      }

      const syncProf = e.target.closest('[data-sync-profile]');
      if (syncProf) {
        triggerSync(syncProf.dataset.syncProfile, null);
        return;
      }

      const toggleProf = e.target.closest('[data-toggle-profile]');
      if (toggleProf) {
        const p = state.profiles.find((x) => x.id === toggleProf.dataset.toggleProfile);
        if (!p) return;
        await api(`/api/profiles/${encodeURIComponent(p.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ active: !p.active }),
        });
        await loadBootstrap();
        return;
      }

      const delProf = e.target.closest('[data-delete-profile]');
      if (delProf) {
        if (!confirm('Remover esse perfil da lista de monitoramento?')) return;
        await api(`/api/profiles/${encodeURIComponent(delProf.dataset.deleteProfile)}`, { method: 'DELETE' });
        toast('Perfil removido.', 'success');
        await loadBootstrap();
        return;
      }

      const copyTargetBtn = e.target.closest('[data-copy-target]');
      if (copyTargetBtn) {
        const el = document.getElementById(copyTargetBtn.dataset.copyTarget);
        if (el) copyText(el.textContent.trim(), 'Comando copiado!');
      }
    });

    // Topbar buttons
    document.getElementById('btnSyncNow').addEventListener('click', () => triggerSync(null));
    document.getElementById('btnSyncProfilesTab').addEventListener('click', () => triggerSync(null));

    document.getElementById('btnOpenNewModal').addEventListener('click', () => {
      resetNewItemForm('Reel');
      document.getElementById('newItemModal').classList.remove('hidden');
    });

    document.querySelectorAll('[data-new-format]').forEach((btn) => {
      btn.addEventListener('click', () => setNewItemFormat(btn.dataset.newFormat));
    });

    document.getElementById('btnAddStoryFrame').addEventListener('click', () => {
      addStoryFrameRow('Falado (15s)', '');
    });

    // Submit New Item
    document.getElementById('formNewItem').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const format = fd.get('format');
      const storyFrames = [];
      if (format === 'Story') {
        document.querySelectorAll('#storyFramesBuilder .frame-row').forEach((row, idx) => {
          const content = row.querySelector('.frame-content-input').value.trim();
          const type = row.querySelector('.frame-type-select').value;
          if (content) storyFrames.push({ order: idx + 1, type, content });
        });
      }

      try {
        await api('/api/items', {
          method: 'POST',
          body: JSON.stringify({
            format,
            profileHandle: fd.get('profileHandle'),
            niche: fd.get('niche'),
            url: fd.get('url'),
            title: fd.get('title'),
            hookType: fd.get('hookType'),
            funnelStage: fd.get('funnelStage'),
            status: fd.get('status'),
            hook: fd.get('hook'),
            scriptOrTranscript: fd.get('scriptOrTranscript'),
            structure: fd.get('structure'),
            cta: fd.get('cta'),
            whyItWorked: fd.get('whyItWorked'),
            caption: fd.get('caption'),
            tags: fd.get('tags'),
            storyFrames,
            metrics: {
              views: Number(fd.get('views')) || 0,
              likes: Number(fd.get('likes')) || 0,
              comments: Number(fd.get('comments')) || 0,
            },
          }),
        });
        closeModal('newItemModal');
        toast('Referência salva no Swipe File e na biblioteca Markdown!', 'success');
        await loadBootstrap();
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    // Detail Header Actions
    document.getElementById('btnSendToVideoStudio')?.addEventListener('click', () => {
      const item = state.items.find((i) => i.id === state.selectedItemId);
      if (!item) return;
      closeModal('detailModal');
      switchMainTab('studio');
      switchStudioSubtab('generate');
      updateStudioFormForModel('seedance-ref');
      const sel = document.getElementById('studioSwipeItemSelect');
      if (sel) sel.value = item.id;
      const titleEl = document.getElementById('studioTitleInput');
      if (titleEl) titleEl.value = `Modelagem ${item.id} (${item.niche || 'Reel'})`;
      const promptEl = document.getElementById('studioPromptInput');
      if (promptEl) {
        promptEl.value = `Recreate the pacing, camera framing, and natural energy of @Video1, featuring the person/product from @Image1. Topic: ${
          item.niche || 'product'
        }. Opening visual hook inspired by: "${(item.hook || item.title || '').slice(
          0,
          120
        )}". Vertical 9:16 smartphone UGC aesthetic, realistic lighting, high retention.`;
      }
      toast(`${item.id} carregado no Studio de Vídeo como referência @Video1!`, 'success');
    });

    document.getElementById('btnCopyModelPrompt').addEventListener('click', () => {
      const item = state.items.find((i) => i.id === state.selectedItemId);
      if (item) copyText(buildModelingPrompt(item), 'Prompt de modelagem copiado! Cole no chat do Antigravity.');
    });

    document.getElementById('btnAnalyzeItem').addEventListener('click', async () => {
      if (!state.selectedItemId) return;
      const btn = document.getElementById('btnAnalyzeItem');
      btn.disabled = true;
      btn.textContent = '⏳ Analisando...';
      try {
        await api(`/api/items/${encodeURIComponent(state.selectedItemId)}/analyze`, { method: 'POST' });
        toast('Desconstrução concluída!', 'success');
        await loadBootstrap();
        openItemDetail(state.selectedItemId);
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '🧠 Desconstruir (IA)';
      }
    });

    // Add Profile
    document.getElementById('formAddProfile').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api('/api/profiles', {
          method: 'POST',
          body: JSON.stringify({
            handle: fd.get('handle'),
            niche: fd.get('niche'),
            displayName: fd.get('displayName'),
            category: fd.get('category'),
            whyFollow: fd.get('whyFollow'),
            monitorReels: e.target.elements.monitorReels.checked,
            monitorStories: e.target.elements.monitorStories.checked,
            maxItemsPerSync: Number(fd.get('maxItemsPerSync')) || 10,
          }),
        });
        e.target.reset();
        e.target.elements.monitorReels.checked = true;
        e.target.elements.maxItemsPerSync.value = 10;
        toast('Perfil adicionado ao monitoramento!', 'success');
        await loadBootstrap();
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    // Edit Profile Modal Submit
    document.getElementById('formEditProfile').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const id = fd.get('id');
      try {
        await api(`/api/profiles/${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            niche: fd.get('niche'),
            category: fd.get('category'),
            displayName: fd.get('displayName'),
            whyFollow: fd.get('whyFollow'),
            maxItemsPerSync: Number(fd.get('maxItemsPerSync')) || 10,
            monitorReels: e.target.elements.monitorReels.checked,
            monitorStories: e.target.elements.monitorStories.checked,
          }),
        });
        closeModal('editProfileModal');
        toast('Perfil e assunto/nicho atualizados!', 'success');
        await loadBootstrap();
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    // Save Brand DNA
    const submitBrandDna = async (e) => {
      if (e) e.preventDefault();
      const form = document.getElementById('formBrandDna');
      const fd = new FormData(form);
      const payload = Object.fromEntries(fd.entries());
      try {
        await api('/api/brand-dna', {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        toast('DNA da Marca salvo e library/brand-dna.md atualizado!', 'success');
        await loadBootstrap();
      } catch (err) {
        toast(err.message, 'error');
      }
    };
    document.getElementById('formBrandDna').addEventListener('submit', submitBrandDna);
    document.getElementById('btnSaveDnaTop').addEventListener('click', submitBrandDna);

    // Save Settings
    document.getElementById('formSettings').addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      try {
        await api('/api/settings', {
          method: 'PUT',
          body: JSON.stringify({
            apifyToken: fd.get('apifyToken'),
            apifyReelsActor: fd.get('apifyReelsActor'),
            apifyStoriesActor: fd.get('apifyStoriesActor'),
            geminiApiKey: fd.get('geminiApiKey'),
            geminiModel: fd.get('geminiModel'),
            geminiOmniModel: fd.get('geminiOmniModel'),
            falKey: fd.get('falKey'),
            falSeedanceRefModel: fd.get('falSeedanceRefModel'),
            falOmnihumanModel: fd.get('falOmnihumanModel'),
            defaultMaxItemsPerProfile: Number(fd.get('defaultMaxItemsPerProfile')) || 10,
          }),
        });
        e.target.elements.apifyToken.value = '';
        e.target.elements.geminiApiKey.value = '';
        if (e.target.elements.falKey) e.target.elements.falKey.value = '';
        toast('Configurações salvas no arquivo .env!', 'success');
        await loadBootstrap();
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    // Curation Niche Selector
    document.getElementById('curationNicheSelect')?.addEventListener('change', (e) => {
      state.selectedCurationNiche = e.target.value;
      const discoverInput = document.getElementById('discoverNicheInput');
      if (discoverInput) discoverInput.value = e.target.value;
      renderRadarAndCuration();
    });

    // Save Curation Config & Rescore
    document.getElementById('formCurationConfig')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const niche = state.selectedCurationNiche || 'Geral';
      try {
        await api(`/api/curation/${encodeURIComponent(niche)}`, {
          method: 'PUT',
          body: JSON.stringify({
            autoRejectEnabled: document.getElementById('curationAutoReject').checked,
            autoFilterThreshold: Number(document.getElementById('curationThreshold').value) || 35,
            manualPositiveKeywords: document.getElementById('curationPosKw').value,
            manualNegativeKeywords: document.getElementById('curationNegKw').value,
            applyAutoFilter: false,
          }),
        });
        toast(`Regras do nicho "${niche}" salvas e relevância recalculada!`, 'success');
        await loadBootstrap();
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    // Apply Auto-Filter to Pending items now
    document.getElementById('btnApplyAutoFilterNow')?.addEventListener('click', async () => {
      const niche = state.selectedCurationNiche || 'Geral';
      try {
        const res = await api(`/api/curation/${encodeURIComponent(niche)}/rescore`, {
          method: 'POST',
          body: JSON.stringify({ applyAutoFilter: true }),
        });
        toast(
          res.autoFilteredCount > 0
            ? `🧹 ${res.autoFilteredCount} item(ns) irrelevante(s) movido(s) para Reprovados!`
            : 'Nenhum item pendente ficou abaixo da nota mínima.',
          'success'
        );
        await loadBootstrap();
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    // Radar: Discover New Profiles via Apify
    document.getElementById('formDiscoverProfiles')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btnRunDiscovery');
      const fd = new FormData(e.target);
      btn.disabled = true;
      btn.textContent = '⏳ Buscando novos perfis no Instagram...';
      try {
        const res = await api('/api/discovery/search', {
          method: 'POST',
          body: JSON.stringify({
            niche: fd.get('niche'),
            limit: Number(fd.get('limit')) || 5,
            customQuery: fd.get('customQuery'),
          }),
        });
        await loadBootstrap();
        if (res.discovered?.length) {
          toast(`🧭 ${res.discovered.length} novo(s) perfil(is) encontrado(s) para "${res.niche}"!`, 'success');
        } else {
          toast('Nenhum perfil novo encontrado com essa busca. Tente um termo extra diferente.', 'error');
        }
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '🔎 Descobrir Novos Perfis (Apify)';
      }
    });

    // === STUDIO DE VÍDEO & LEGENDAS ===
    const uploadLocalAsset = async (file, hiddenInputId, statusElId) => {
      if (!file) return null;
      const statusEl = document.getElementById(statusElId);
      if (statusEl) statusEl.textContent = `Enviando ${file.name}...`;
      const base64Data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(new Error('Falha ao ler arquivo local.'));
        reader.readAsDataURL(file);
      });
      const res = await api('/api/studio/upload', {
        method: 'POST',
        body: JSON.stringify({
          fileName: file.name,
          mimeType: file.type,
          base64Data,
        }),
      });
      const hidden = document.getElementById(hiddenInputId);
      if (hidden) hidden.value = res.assetId;
      if (statusEl) {
        statusEl.textContent = `✓ ${res.fileName} (${Math.round(res.size / 1024)} KB) pronto!`;
        statusEl.style.color = '#6ee7b7';
      }
      toast(`Arquivo ${res.fileName} carregado no Studio!`, 'success');
      return res;
    };

    document.getElementById('studioImageFile')?.addEventListener('change', (e) => {
      uploadLocalAsset(e.target.files?.[0], 'studioImageAssetId', 'studioImageStatus').catch((err) =>
        toast(err.message, 'error')
      );
    });
    document.getElementById('studioAudioFile')?.addEventListener('change', (e) => {
      uploadLocalAsset(e.target.files?.[0], 'studioAudioAssetId', 'studioAudioStatus').catch((err) =>
        toast(err.message, 'error')
      );
    });
    document.getElementById('studioVideoFile')?.addEventListener('change', (e) => {
      uploadLocalAsset(e.target.files?.[0], 'studioVideoAssetId', 'studioVideoStatus').catch((err) =>
        toast(err.message, 'error')
      );
    });
    document.getElementById('subLocalVideoFile')?.addEventListener('change', async (e) => {
      try {
        const res = await uploadLocalAsset(e.target.files?.[0], 'subLocalAssetId', null);
        if (res) {
          const sel = document.getElementById('subVideoSourceSelect');
          if (sel) {
            const optVal = `asset::${res.assetId}`;
            const opt = document.createElement('option');
            opt.value = optVal;
            opt.textContent = `📁 Upload Local: ${res.fileName}`;
            sel.appendChild(opt);
            sel.value = optVal;
          }
        }
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    // Quando escolhe um Reel do Swipe File no Studio, sugere prompt se estiver vazio
    document.getElementById('studioSwipeItemSelect')?.addEventListener('change', (e) => {
      const id = e.target.value;
      const item = state.items.find((i) => i.id === id);
      const promptEl = document.getElementById('studioPromptInput');
      if (item && promptEl && !promptEl.value.trim()) {
        promptEl.value = `Recreate the pacing and camera framing of @Video1, featuring the person/product from @Image1. Niche: ${
          item.niche || 'product'
        }. Hook inspiration: "${(item.hook || item.title || '').slice(0, 120)}". Vertical 9:16 UGC style.`;
      }
    });

    // Delegated clicks do Studio (subtabs, modelos, tags, jobs, renders, abrir pastas)
    document.getElementById('tab-studio')?.addEventListener('click', async (e) => {
      const subBtn = e.target.closest('[data-studio-subtab]');
      if (subBtn) {
        switchStudioSubtab(subBtn.dataset.studioSubtab);
        return;
      }

      const modelBtn = e.target.closest('[data-studio-model]');
      if (modelBtn) {
        updateStudioFormForModel(modelBtn.dataset.studioModel);
        return;
      }

      const tagBtn = e.target.closest('[data-insert-tag]');
      if (tagBtn) {
        const ta = document.getElementById('studioPromptInput');
        if (ta) {
          const tag = tagBtn.dataset.insertTag;
          ta.value = `${ta.value}${ta.value && !ta.value.endsWith(' ') ? ' ' : ''}${tag} `;
          ta.focus();
        }
        return;
      }

      const refreshJobBtn = e.target.closest('[data-refresh-job]');
      if (refreshJobBtn) {
        const id = refreshJobBtn.dataset.refreshJob;
        refreshJobBtn.disabled = true;
        try {
          await api(`/api/studio/jobs/${encodeURIComponent(id)}/refresh`, { method: 'POST', body: '{}' });
          await loadBootstrap();
        } catch (err) {
          toast(err.message, 'error');
        }
        return;
      }

      const subtitleJobBtn = e.target.closest('[data-subtitle-job]');
      if (subtitleJobBtn) {
        const id = subtitleJobBtn.dataset.subtitleJob;
        switchStudioSubtab('subtitles');
        const sel = document.getElementById('subVideoSourceSelect');
        if (sel) sel.value = `studio-job::${id}`;
        toast('Vídeo carregado no Editor de Legendas!', 'success');
        return;
      }

      const delJobBtn = e.target.closest('[data-delete-job]');
      if (delJobBtn) {
        if (!confirm('Remover esse vídeo gerado do Studio?')) return;
        try {
          await api(`/api/studio/jobs/${encodeURIComponent(delJobBtn.dataset.deleteJob)}`, { method: 'DELETE' });
          toast('Vídeo removido.', 'success');
          await loadBootstrap();
        } catch (err) {
          toast(err.message, 'error');
        }
        return;
      }

      const delRenderBtn = e.target.closest('[data-delete-render]');
      if (delRenderBtn) {
        if (!confirm('Remover esse vídeo legendado?')) return;
        try {
          await api(`/api/studio/renders/${encodeURIComponent(delRenderBtn.dataset.deleteRender)}`, { method: 'DELETE' });
          toast('Render removido.', 'success');
          await loadBootstrap();
        } catch (err) {
          toast(err.message, 'error');
        }
        return;
      }

      const openFolderBtn = e.target.closest('[data-open-folder]');
      if (openFolderBtn) {
        try {
          const res = await api('/api/studio/open-folder', {
            method: 'POST',
            body: JSON.stringify({ folder: openFolderBtn.dataset.openFolder }),
          });
          toast(`Pasta aberta: ${res.path}`, 'success');
        } catch (err) {
          toast(err.message, 'error');
        }
      }
    });

    document.getElementById('btnOpenOutputsFolder')?.addEventListener('click', async () => {
      try {
        const res = await api('/api/studio/open-folder', {
          method: 'POST',
          body: JSON.stringify({ folder: 'outputs' }),
        });
        toast(`Pasta aberta: ${res.path}`, 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    document.getElementById('btnCopyStudioPromptFlow')?.addEventListener('click', () => {
      const text = document.getElementById('studioPromptInput')?.value.trim();
      if (!text) {
        toast('Escreva ou selecione um Reel para preencher o prompt primeiro.', 'error');
        return;
      }
      copyText(text, 'Prompt copiado! Cole direto no Google Flow Web.');
    });

    // Submit Vídeo Generation (Gemini Omni ou fal.ai)
    document.getElementById('formStudioGenerate')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btnSubmitVideoJob');
      const fd = new FormData(e.target);
      const isGemini = fd.get('modelKey') === 'gemini-omni';
      btn.disabled = true;
      btn.textContent = isGemini ? '⏳ Enviando para Gemini Omni (Google)...' : '⏳ Enviando para fila da fal.ai...';
      try {
        await api('/api/studio/jobs', {
          method: 'POST',
          body: JSON.stringify({
            modelKey: fd.get('modelKey'),
            title: fd.get('title'),
            swipeItemId: fd.get('swipeItemId'),
            imageAssetId: fd.get('imageAssetId'),
            imageUrl: fd.get('imageUrl'),
            audioAssetId: fd.get('audioAssetId'),
            audioUrl: fd.get('audioUrl'),
            videoAssetId: fd.get('videoAssetId'),
            prompt: fd.get('prompt'),
            resolution: fd.get('resolution'),
            aspectRatio: fd.get('aspectRatio'),
            duration: fd.get('duration'),
            generateAudio: e.target.elements.generateAudio?.checked !== false,
          }),
        });
        toast(
          isGemini
            ? '🚀 Vídeo enviado para o Gemini Omni (Google)! Acompanhe o progresso ao lado.'
            : '🚀 Vídeo enviado para a fila da fal.ai! Acompanhe o progresso ao lado.',
          'success'
        );
        await loadBootstrap();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        btn.disabled = false;
        updateStudioFormForModel(state.activeStudioModel);
      }
    });

    // Auto-split script em timestamps .SRT
    document.getElementById('btnAutoGenerateSrt')?.addEventListener('click', async () => {
      const scriptText = document.getElementById('subRawScript')?.value.trim();
      if (!scriptText) {
        toast('Cole o texto falado primeiro para gerar os timestamps.', 'error');
        return;
      }
      const sourceVal = document.getElementById('subVideoSourceSelect')?.value || '';
      const [sourceType, sourceId] = sourceVal.split('::');
      try {
        const res = await api('/api/studio/subtitles/auto-split', {
          method: 'POST',
          body: JSON.stringify({
            scriptText,
            wordsPerCue: Number(document.getElementById('subWordsPerCue')?.value) || 4,
            sourceType: sourceType || null,
            sourceId: sourceId || null,
          }),
        });
        document.getElementById('subSrtEditor').value = res.srt;
        toast(`⏱️ Timestamps gerados para vídeo de ${res.durationSec}s!`, 'success');
      } catch (err) {
        toast(err.message, 'error');
      }
    });

    // Download .SRT apenas
    document.getElementById('btnDownloadSrtOnly')?.addEventListener('click', () => {
      const srt = document.getElementById('subSrtEditor')?.value.trim();
      if (!srt) {
        toast('Nenhuma legenda .SRT no editor ainda.', 'error');
        return;
      }
      const blob = new Blob([srt + '\n'], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `legendas-${Date.now()}.srt`;
      a.click();
      URL.revokeObjectURL(a.href);
    });

    // Burn subtitles with FFmpeg
    document.getElementById('formRenderSubtitles')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const sourceVal = document.getElementById('subVideoSourceSelect')?.value || '';
      const [sourceType, sourceId] = sourceVal.split('::');
      const srtText = document.getElementById('subSrtEditor')?.value.trim();
      if (!sourceType || !sourceId) {
        toast('Selecione um vídeo de origem primeiro.', 'error');
        return;
      }
      if (!srtText) {
        toast('Preencha ou gere as legendas .SRT antes de renderizar.', 'error');
        return;
      }
      const btn = document.getElementById('btnBurnSubtitles');
      btn.disabled = true;
      btn.textContent = '⏳ Queimando legendas com FFmpeg...';
      try {
        await api('/api/studio/subtitles/render', {
          method: 'POST',
          body: JSON.stringify({
            sourceType,
            sourceId,
            srtText,
            stylePreset: document.getElementById('subStylePreset')?.value || 'viral-yellow',
            fontSize: Number(document.getElementById('subFontSize')?.value) || 68,
            position: document.getElementById('subPosition')?.value || 'bottom',
          }),
        });
        toast('🔥 Vídeo legendado renderizado com sucesso!', 'success');
        await loadBootstrap();
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        btn.disabled = false;
        btn.textContent = '🔥 Renderizar Vídeo Legendado (MP4)';
      }
    });
  }

  initEvents();
  loadBootstrap().catch((err) => {
    toast(`Erro ao carregar dados: ${err.message}`, 'error');
  });
})();
