import fs from 'node:fs/promises';
import path from 'node:path';
import { loadSettings, ROOT_DIR } from './env.mjs';
import { addProfile, getItems, getProfiles, normalizeHandle, normalizeNiche } from './store.mjs';
import { extractTokens, getNicheModel, getTopLearnedTerms } from './curation.mjs';

const DATA_DIR = path.join(ROOT_DIR, 'data');
const CANDIDATES_FILE = path.join(DATA_DIR, 'profile-candidates.json');
const APIFY_BASE = 'https://api.apify.com/v2';

const DEFAULT_STORE = {
  candidates: [],
  dismissedHandles: [],
  lastDiscoveryAt: null,
};

async function readDiscoveryStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(CANDIDATES_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      candidates: Array.isArray(parsed.candidates) ? parsed.candidates : [],
      dismissedHandles: Array.isArray(parsed.dismissedHandles) ? parsed.dismissedHandles : [],
      lastDiscoveryAt: parsed.lastDiscoveryAt || null,
    };
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.writeFile(CANDIDATES_FILE, JSON.stringify(DEFAULT_STORE, null, 2), 'utf8');
      return structuredClone(DEFAULT_STORE);
    }
    throw err;
  }
}

async function writeDiscoveryStore(store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(CANDIDATES_FILE, JSON.stringify(store, null, 2), 'utf8');
  return store;
}

export async function getDiscoveryState() {
  return readDiscoveryStore();
}

function buildSearchQueries(niche, model, customQuery = '') {
  const queries = [];
  if (customQuery && customQuery.trim()) {
    queries.push(customQuery.trim());
  }

  const cleanNiche = normalizeNiche(niche);
  if (cleanNiche && cleanNiche !== 'Geral' && cleanNiche !== 'Exemplo') {
    queries.push(cleanNiche);
  }

  // Adiciona combinações baseadas nas palavras positivas manuais e aprendidas pelo treino
  const manualPos = (model?.manualPositiveKeywords || []).slice(0, 2);
  for (const kw of manualPos) {
    const q = cleanNiche && !kw.toLowerCase().includes(cleanNiche.toLowerCase()) ? `${cleanNiche} ${kw}` : kw;
    queries.push(q);
  }

  const learned = getTopLearnedTerms(model, 5).positive.map((t) => t.term);
  for (const term of learned) {
    if (term.toLowerCase() === cleanNiche.toLowerCase()) continue;
    queries.push(`${cleanNiche} ${term}`);
    if (queries.length >= 3) break;
  }

  // Deduplica mantendo no máximo 3 buscas para economizar créditos da Apify
  return Array.from(new Set(queries.map((q) => q.trim()).filter(Boolean))).slice(0, 3);
}

function scoreCandidateProfile(raw, niche, model, matchedQuery) {
  const handle = normalizeHandle(raw.username || raw.handle);
  const fullName = String(raw.fullName || raw.name || '').trim();
  const bio = String(raw.biography || raw.bio || '').trim();
  const followers = Number(raw.followersCount || raw.followers || 0);
  const postsCount = Number(raw.postsCount || raw.mediaCount || 0);

  const combined = `${handle} ${fullName} ${bio}`
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');

  let score = 50;
  const reasons = [];

  const nicheTokens = extractTokens(niche);
  const nicheHits = nicheTokens.filter((t) => combined.includes(t));
  if (nicheHits.length) {
    score += 25;
    reasons.push(`Bio/nome menciona ${nicheHits.join(', ')}`);
  }

  const posKws = model?.manualPositiveKeywords || [];
  const matchedPosKws = posKws.filter((kw) =>
    combined.includes(String(kw).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, ''))
  );
  if (matchedPosKws.length) {
    score += Math.min(20, matchedPosKws.length * 10);
    reasons.push(`Combina com: ${matchedPosKws.slice(0, 3).join(', ')}`);
  }

  const negKws = model?.manualNegativeKeywords || [];
  const matchedNegKws = negKws.filter((kw) =>
    combined.includes(String(kw).toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, ''))
  );
  if (matchedNegKws.length) {
    score -= Math.min(50, matchedNegKws.length * 25);
    reasons.push(`Atenção: contém termo bloqueado (${matchedNegKws.join(', ')})`);
  }

  const learned = getTopLearnedTerms(model, 10);
  const learnedPosHits = learned.positive
    .map((t) => t.term)
    .filter((term) => combined.includes(term));
  if (learnedPosHits.length) {
    score += Math.min(18, learnedPosHits.length * 6);
    reasons.push(`Alinhado ao treino: ${learnedPosHits.slice(0, 3).join(', ')}`);
  }

  if (followers >= 1000 && followers <= 500000) {
    score += 8;
  } else if (followers > 500000) {
    score += 4;
  }

  if (raw.sourceType === 'mention') {
    score += 10;
    reasons.push('Mencionado em um Reel que você aprovou');
  } else if (matchedQuery) {
    reasons.push(`Encontrado na busca "${matchedQuery}"`);
  }

  return {
    id: `cand_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    handle,
    fullName: fullName || `@${handle}`,
    biography: bio,
    profilePicUrl: raw.profilePicUrl || raw.profilePicUrlHD || '',
    followersCount: followers,
    postsCount,
    isVerified: Boolean(raw.verified || raw.isVerified),
    niche: normalizeNiche(niche),
    matchScore: Math.max(5, Math.min(99, Math.round(score))),
    reasons: reasons.slice(0, 3),
    url: `https://www.instagram.com/${handle}/`,
    discoveredAt: new Date().toISOString(),
  };
}

async function runApifyUserSearch(token, searchQuery, searchLimit = 15) {
  const actorId = 'apify~instagram-search-scraper';
  const url = `${APIFY_BASE}/acts/${encodeURIComponent(
    actorId
  )}/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&format=json&clean=true`;

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      search: searchQuery,
      searchType: 'user',
      searchLimit,
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Apify Search falhou (HTTP ${res.status}): ${errText.slice(0, 220)}`);
  }

  const data = await res.json();
  return Array.isArray(data) ? data : [];
}

/**
 * Roda uma busca inteligente no Instagram via Apify usando o nicho + algoritmo treinado
 * e retorna de 3 a 5 novos perfis candidatos prontos para aprovação.
 */
export async function discoverProfilesForNiche({ niche, limit = 5, customQuery = '' }) {
  const settings = await loadSettings();
  if (!settings.APIFY_TOKEN) {
    throw new Error('APIFY_TOKEN não configurado. Configure em "Config & Automação" antes de buscar novos perfis.');
  }

  const cleanNiche = normalizeNiche(niche);
  const targetCount = Math.max(3, Math.min(10, Number(limit) || 5));

  const [existingProfiles, allItems, model, discoveryStore] = await Promise.all([
    getProfiles(),
    getItems(),
    getNicheModel(cleanNiche),
    readDiscoveryStore(),
  ]);

  const excludedHandles = new Set([
    ...existingProfiles.map((p) => normalizeHandle(p.handle)),
    ...(discoveryStore.dismissedHandles || []).map((h) => normalizeHandle(h)),
    ...(discoveryStore.candidates || []).map((c) => normalizeHandle(c.handle)),
  ]);

  const queries = buildSearchQueries(cleanNiche, model, customQuery);
  if (!queries.length) {
    throw new Error('Informe um Assunto / Nicho ou termo de busca para descobrir novos perfis.');
  }

  const candidateMap = new Map();
  const errors = [];

  // 1) Busca no Instagram via Apify Search Scraper
  for (const query of queries) {
    try {
      const results = await runApifyUserSearch(settings.APIFY_TOKEN, query, 15);
      for (const raw of results) {
        if (!raw || raw.error) continue;
        if (raw.private === true || raw.isPrivate === true) continue;
        const handle = normalizeHandle(raw.username || raw.handle);
        if (!handle || excludedHandles.has(handle)) continue;

        const scored = scoreCandidateProfile(raw, cleanNiche, model, query);
        const existing = candidateMap.get(handle);
        if (!existing || scored.matchScore > existing.matchScore) {
          candidateMap.set(handle, scored);
        }
      }
    } catch (err) {
      errors.push(`Busca "${query}": ${err.message}`);
    }
  }

  // 2) Bônus: extrai @menções encontradas nos Reels já APROVADOS desse nicho
  const approvedItems = allItems.filter(
    (it) => normalizeNiche(it.niche) === cleanNiche && it.reviewStatus === 'approved'
  );
  for (const item of approvedItems) {
    const text = `${item.caption || ''} ${item.hook || ''}`;
    const mentions = text.match(/@([a-zA-Z0-9._]{3,30})/g) || [];
    for (const m of mentions) {
      const handle = normalizeHandle(m);
      if (!handle || excludedHandles.has(handle) || candidateMap.has(handle)) continue;
      const scored = scoreCandidateProfile(
        { username: handle, fullName: `@${handle}`, biography: '', sourceType: 'mention' },
        cleanNiche,
        model,
        ''
      );
      candidateMap.set(handle, scored);
    }
  }

  const ranked = Array.from(candidateMap.values())
    .sort((a, b) => b.matchScore - a.matchScore || (b.followersCount || 0) - (a.followersCount || 0))
    .slice(0, targetCount);

  if (ranked.length) {
    discoveryStore.candidates = [...ranked, ...discoveryStore.candidates].slice(0, 40);
  }
  discoveryStore.lastDiscoveryAt = new Date().toISOString();
  await writeDiscoveryStore(discoveryStore);

  return {
    niche: cleanNiche,
    queriesUsed: queries,
    discovered: ranked,
    errors,
    totalPendingCandidates: discoveryStore.candidates.length,
  };
}

export async function approveCandidate(candidateId, overrides = {}) {
  const store = await readDiscoveryStore();
  const idx = store.candidates.findIndex((c) => c.id === candidateId);
  if (idx === -1) throw new Error('Candidato não encontrado.');
  const cand = store.candidates[idx];

  const profile = await addProfile({
    handle: cand.handle,
    displayName: cand.fullName || `@${cand.handle}`,
    niche: overrides.niche || cand.niche || 'Geral',
    category: overrides.category || 'Descoberto pelo Radar',
    whyFollow: cand.reasons?.join(' · ') || cand.biography?.slice(0, 140) || '',
    monitorReels: true,
    monitorStories: false,
    maxItemsPerSync: Number(overrides.maxItemsPerSync) || 10,
  });

  store.candidates.splice(idx, 1);
  await writeDiscoveryStore(store);
  return { profile, remainingCandidates: store.candidates.length };
}

export async function dismissCandidate(candidateId) {
  const store = await readDiscoveryStore();
  const idx = store.candidates.findIndex((c) => c.id === candidateId);
  if (idx === -1) throw new Error('Candidato não encontrado.');
  const cand = store.candidates[idx];
  const handle = normalizeHandle(cand.handle);
  if (handle && !store.dismissedHandles.includes(handle)) {
    store.dismissedHandles.push(handle);
  }
  store.candidates.splice(idx, 1);
  await writeDiscoveryStore(store);
  return { ok: true, dismissedHandle: handle };
}
