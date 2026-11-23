import { loadSettings } from './env.mjs';
import {
  appendSyncLog,
  generateNextItemId,
  getBrandDna,
  getItems,
  getProfiles,
  normalizeHandle,
  normalizeNiche,
  saveItemsBulk,
  saveProfiles,
} from './store.mjs';
import { analyzeSwipeItem } from './ai-analyzer.mjs';
import { prefetchMediaForItem } from './media.mjs';
import { getNicheModel, scoreItemWithModel, shouldAutoFilter } from './curation.mjs';

const APIFY_BASE = 'https://api.apify.com/v2';

function formatActorId(actorId) {
  // A API v2 da Apify aceita "owner~actor-name" no path
  return String(actorId || '').trim().replace('/', '~');
}

async function runApifyActorSync(actorId, token, inputPayload) {
  const formatted = formatActorId(actorId);
  const url = `${APIFY_BASE}/acts/${encodeURIComponent(
    formatted
  )}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&format=json&clean=true`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(inputPayload),
    signal: AbortSignal.timeout(180_000),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Apify (${formatted}) falhou com HTTP ${res.status}: ${errBody.slice(0, 260)}`);
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error(`Resposta inesperada da Apify para ${formatted} (esperado array de itens).`);
  }
  return data;
}

function mapApifyReelToItem(raw, fallbackHandle, niche = 'Geral') {
  const handle = normalizeHandle(raw.ownerUsername || raw.username || fallbackHandle) || fallbackHandle;
  const shortCode = raw.shortCode || raw.code || raw.id || '';
  const url =
    raw.url ||
    (shortCode ? `https://www.instagram.com/reel/${shortCode}/` : `https://www.instagram.com/${handle}/`);
  const caption = String(raw.caption || raw.alt || '').trim();
  const firstLine = caption
    .split(/\r?\n/)
    .map((l) => l.trim())
    .find(Boolean);

  return {
    source: 'apify-reels',
    sourceId: shortCode ? `ig-reel-${shortCode}` : `ig-url-${url}`,
    format: 'Reel',
    profileHandle: handle,
    niche: normalizeNiche(niche),
    title: (firstLine || `Reel de @${handle}`).slice(0, 90),
    url,
    thumbnailUrl: raw.displayUrl || raw.thumbnailUrl || '',
    videoUrl: raw.videoUrl || '',
    publishedAt: raw.timestamp || new Date().toISOString(),
    collectedAt: new Date().toISOString(),
    metrics: {
      views: Number(raw.videoPlayCount || raw.videoViewCount || raw.playCount || 0),
      likes: Number(raw.likesCount || raw.likeCount || 0),
      comments: Number(raw.commentsCount || raw.commentCount || 0),
      durationSec: Math.round(Number(raw.videoDuration || 0)),
    },
    hook: firstLine || '',
    hookType: 'Curiosidade',
    funnelStage: 'Topo',
    structure: '',
    scriptOrTranscript: raw.transcript || '',
    caption,
    storyFrames: [],
    cta: '',
    whyItWorked: '',
    tags: Array.isArray(raw.hashtags) ? raw.hashtags.slice(0, 6) : [],
    status: 'Novo',
    favorite: false,
    notes: '',
    analyzedWith: 'pending',
  };
}

function mapApifyStoriesGroupToItem(rawStories, handle, niche = 'Geral') {
  const sorted = [...rawStories].sort((a, b) => {
    const ta = new Date(a.timestamp || a.takenAt || 0).getTime();
    const tb = new Date(b.timestamp || b.takenAt || 0).getTime();
    return ta - tb;
  });

  const dateKey = new Date().toISOString().slice(0, 10);
  const frames = sorted.map((st, idx) => ({
    order: idx + 1,
    type: st.videoUrl || st.isVideo ? 'Vídeo / Falado' : 'Imagem / Texto',
    content: [
      st.caption || st.text || st.accessibilityCaption || '(Conteúdo visual — abra o link para revisar)',
      st.linkUrl || st.ctaUrl ? `Link/CTA: ${st.linkUrl || st.ctaUrl}` : '',
      st.videoUrl || st.imageUrl || st.displayUrl ? `Mídia: ${st.videoUrl || st.imageUrl || st.displayUrl}` : '',
    ]
      .filter(Boolean)
      .join(' | '),
  }));

  return {
    source: 'apify-stories',
    sourceId: `ig-stories-${handle}-${dateKey}-${sorted.length}`,
    format: 'Story',
    profileHandle: handle,
    niche: normalizeNiche(niche),
    title: `Sequência de Stories (${sorted.length} frames) — @${handle} (${dateKey})`,
    url: `https://www.instagram.com/stories/${handle}/`,
    thumbnailUrl: sorted[0]?.displayUrl || sorted[0]?.imageUrl || '',
    videoUrl: sorted[0]?.videoUrl || '',
    publishedAt: sorted[0]?.timestamp || new Date().toISOString(),
    collectedAt: new Date().toISOString(),
    metrics: { views: 0, likes: 0, comments: 0, durationSec: 0 },
    hook: frames[0]?.content?.slice(0, 160) || `Sequência capturada em ${dateKey}`,
    hookType: 'História / Bastidores',
    funnelStage: 'Meio',
    structure: `Sequência automática com ${frames.length} stories capturados em ${dateKey}.`,
    scriptOrTranscript: '',
    caption: `Capturado automaticamente via Apify Stories em ${dateKey}.`,
    storyFrames: frames,
    cta: '',
    whyItWorked: '',
    tags: ['stories-auto', dateKey],
    status: 'Novo',
    favorite: false,
    notes: '',
    analyzedWith: 'pending',
  };
}

/**
 * Executa a coleta automática na Apify para todos os perfis ativos (ou um perfil específico).
 */
export async function syncWithApify({ profileId = null, niche = null } = {}) {
  const settings = await loadSettings();
  if (!settings.APIFY_TOKEN) {
    throw new Error(
      'APIFY_TOKEN não configurado. Vá na aba "Configurações" do Dashboard (ou edite o arquivo .env) e informe seu token da Apify.'
    );
  }

  const profiles = await getProfiles();
  const targetNiche = niche ? normalizeNiche(niche) : null;
  const targetProfiles = profiles.filter((p) => {
    if (profileId) return p.id === profileId;
    if (targetNiche) return p.active && normalizeNiche(p.niche) === targetNiche;
    return p.active;
  });

  if (!targetProfiles.length) {
    throw new Error(
      profileId
        ? 'Perfil não encontrado.'
        : targetNiche
          ? `Nenhum perfil ativo encontrado no assunto/nicho "${targetNiche}".`
          : 'Nenhum perfil ativo para monitorar. Adicione pelo menos um @perfil na aba "Perfis Monitorados".'
    );
  }

  const startedAt = new Date().toISOString();
  const existingItems = await getItems();
  const brandDna = await getBrandDna();

  const existingKeys = new Set();
  for (const it of existingItems) {
    if (it.sourceId) existingKeys.add(it.sourceId);
    if (it.url) existingKeys.add(it.url);
  }

  const errors = [];
  const newlyImported = [];
  let filteredOutCount = 0;
  const nicheModelCache = new Map();
  const getCachedNicheModel = async (nicheName) => {
    const key = normalizeNiche(nicheName);
    if (!nicheModelCache.has(key)) {
      nicheModelCache.set(key, await getNicheModel(key));
    }
    return nicheModelCache.get(key);
  };
  const defaultLimit = Number(settings.DEFAULT_MAX_ITEMS_PER_PROFILE) || 10;

  // 1) Coleta de REELS por perfil ativo que monitora Reels
  const reelProfiles = targetProfiles.filter((p) => p.monitorReels !== false);
  for (const profile of reelProfiles) {
    try {
      const limit = profile.maxItemsPerSync || defaultLimit;
      const actorId = settings.APIFY_REELS_ACTOR || 'apify~instagram-reel-scraper';
      const isGenericScraper = actorId.includes('instagram-scraper') && !actorId.includes('reel');

      const inputPayload = isGenericScraper
        ? {
            directUrls: [`https://www.instagram.com/${profile.handle}/reels/`],
            resultsType: 'posts',
            resultsLimit: limit,
          }
        : {
            username: [profile.handle],
            resultsLimit: limit,
          };

      const rawList = await runApifyActorSync(actorId, settings.APIFY_TOKEN, inputPayload);

      for (const raw of rawList) {
        if (!raw || raw.error) continue;
        const mapped = mapApifyReelToItem(raw, profile.handle, profile.niche);
        if (existingKeys.has(mapped.sourceId) || (mapped.url && existingKeys.has(mapped.url))) {
          continue;
        }
        existingKeys.add(mapped.sourceId);
        if (mapped.url) existingKeys.add(mapped.url);

        const analysis = await analyzeSwipeItem(mapped, brandDna);
        const nicheModel = await getCachedNicheModel(profile.niche);
        const draftItem = {
          ...mapped,
          ...analysis,
          id: generateNextItemId([...newlyImported, ...existingItems]),
        };
        const scored = scoreItemWithModel(draftItem, nicheModel);
        const autoRejected = shouldAutoFilter(nicheModel, scored.relevanceScore);
        if (autoRejected) filteredOutCount++;

        const finalItem = {
          ...draftItem,
          relevanceScore: scored.relevanceScore,
          relevanceReasons: scored.relevanceReasons,
          reviewStatus: autoRejected ? 'rejected' : 'pending',
          autoFiltered: autoRejected,
          reviewReason: autoRejected
            ? `Filtrado automaticamente pelo algoritmo (relevância ${scored.relevanceScore}%)`
            : '',
          status: autoRejected ? 'Arquivado' : 'Novo',
        };
        newlyImported.push(finalItem);
      }

      profile.lastSyncAt = new Date().toISOString();
    } catch (err) {
      errors.push(`@${profile.handle} (Reels): ${err.message}`);
    }
  }

  // 2) Coleta de STORIES (opcional, caso APIFY_STORIES_ACTOR esteja configurado)
  const storyProfiles = targetProfiles.filter((p) => p.monitorStories);
  if (storyProfiles.length) {
    if (!settings.APIFY_STORIES_ACTOR) {
      errors.push(
        `Stories: ${storyProfiles.length} perfil(is) marcado(s) para Stories, mas APIFY_STORIES_ACTOR ainda não foi configurado em Configurações.`
      );
    } else {
      for (const profile of storyProfiles) {
        try {
          const rawStories = await runApifyActorSync(settings.APIFY_STORIES_ACTOR, settings.APIFY_TOKEN, {
            usernames: [profile.handle],
            username: [profile.handle],
          });
          const valid = rawStories.filter((r) => r && !r.error);
          if (valid.length) {
            const mapped = mapApifyStoriesGroupToItem(valid, profile.handle, profile.niche);
            if (!existingKeys.has(mapped.sourceId)) {
              existingKeys.add(mapped.sourceId);
              const analysis = await analyzeSwipeItem(mapped, brandDna);
              const finalItem = {
                ...mapped,
                ...analysis,
                id: generateNextItemId([...newlyImported, ...existingItems]),
              };
              newlyImported.push(finalItem);
            }
          }
          profile.lastSyncAt = new Date().toISOString();
        } catch (err) {
          errors.push(`@${profile.handle} (Stories): ${err.message}`);
        }
      }
    }
  }

  // Salva novos itens e atualiza lastSyncAt dos perfis
  if (newlyImported.length) {
    const merged = [...newlyImported, ...existingItems];
    await saveItemsBulk(merged);
    // Baixa capas e vídeos MP4 localmente apenas para itens não descartados pelo filtro automático
    for (const item of newlyImported) {
      if (item.reviewStatus !== 'rejected') {
        await prefetchMediaForItem(item);
      }
    }
  }
  await saveProfiles(profiles);

  const validImportedCount = newlyImported.filter((i) => i.reviewStatus !== 'rejected').length;
  const logEntry = {
    id: `sync_${Date.now().toString(36)}`,
    startedAt,
    finishedAt: new Date().toISOString(),
    profilesChecked: targetProfiles.map((p) => p.handle),
    newItemsCount: validImportedCount,
    filteredOutCount,
    newItemIds: newlyImported.filter((i) => i.reviewStatus !== 'rejected').map((i) => i.id),
    errors,
    status: errors.length === 0 ? 'success' : newlyImported.length > 0 ? 'partial' : 'error',
  };
  await appendSyncLog(logEntry);
  return logEntry;
}
