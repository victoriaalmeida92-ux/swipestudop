import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT_DIR } from './env.mjs';
import { deleteMediaForItem } from './media.mjs';
import {
  getCurationStore,
  getNicheModel,
  rebuildNicheModel,
  renderCurationMarkdown,
  scoreItemWithModel,
  shouldAutoFilter,
} from './curation.mjs';

export const DATA_DIR = path.join(ROOT_DIR, 'data');
export const LIBRARY_DIR = path.join(ROOT_DIR, 'library');
export const LIBRARY_ITEMS_DIR = path.join(LIBRARY_DIR, 'items');

const FILES = {
  brandDna: path.join(DATA_DIR, 'brand-dna.json'),
  profiles: path.join(DATA_DIR, 'profiles.json'),
  items: path.join(DATA_DIR, 'swipe-items.json'),
  syncLogs: path.join(DATA_DIR, 'sync-logs.json'),
};

const DEFAULT_BRAND_DNA = {
  brandName: '',
  instagramHandle: '',
  niche: '',
  productName: '',
  productOffer: '',
  targetAudience: '',
  mainPains: '',
  mainDesires: '',
  commonObjections: '',
  uniqueMechanism: '',
  toneOfVoice: 'Direto, próximo, prático e sem enrolação',
  proofsAndResults: '',
  forbiddenCliches: 'Arrasta pra cima, oportunidade imperdível, segredo milionário',
  extraNotes: '',
  updatedAt: new Date().toISOString(),
};

const DEFAULT_PROFILES = [];

const DEFAULT_ITEMS = [
  {
    id: 'SWP-001',
    source: 'exemplo',
    sourceId: 'example-reel-001',
    format: 'Reel',
    profileHandle: 'perfil_referencia_exemplo',
    niche: 'Exemplo',
    title: '[EXEMPLO] Erro invisível que faz o cliente travar antes de comprar',
    url: 'https://www.instagram.com/',
    thumbnailUrl: '',
    videoUrl: '',
    publishedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
    collectedAt: new Date().toISOString(),
    metrics: {
      views: 48200,
      likes: 2340,
      comments: 184,
      durationSec: 34,
    },
    hook: 'Se você tenta resolver [DOR PRINCIPAL] fazendo [MÉTODO COMUM], é por isso que o resultado nunca dura.',
    hookType: 'Dor / Erro Comum',
    funnelStage: 'Topo',
    structure:
      '1. Gancho quebrando crença (0-3s) -> 2. Demonstração rápida do erro comum (3-12s) -> 3. Apresentação do mecanismo certo em 2 passos visuais (12-26s) -> 4. CTA para comentário/palavra-chave (26-34s)',
    scriptOrTranscript:
      '[0-3s | Câmera próxima + texto grande na tela]\n"Se você tenta resolver [dor] desse jeito, para tudo agora."\n\n[3-12s | Mostra o jeito errado acontecendo]\n"A maioria das pessoas faz exatamente isso achando que vai economizar tempo, mas na prática só gera [consequência negativa]."\n\n[12-26s | Demonstração prática do produto/método]\n"O segredo está nesses 2 ajustes simples: primeiro [passo 1], depois [passo 2]. Olha a diferença imediata."\n\n[26-34s | CTA direto]\n"Comenta QUERO que eu te mando os detalhes no Direct."',
    caption:
      'A maioria trava nesse detalhe simples e acha que o problema está nela.\n\nSalva esse Reel pra consultar depois e comenta QUERO se quiser conhecer a solução completa.',
    storyFrames: [],
    cta: 'Comenta "QUERO" para receber os detalhes no Direct',
    whyItWorked:
      'Abre atacando um erro extremamente familiar para o público (alta retenção nos primeiros 3s), entrega uma micro-vitória visual rápida e usa CTA de comentário com palavra-chave que aumenta o alcance orgânico.',
    tags: ['exemplo', 'quebra-de-crenca', 'palavra-chave-direct', 'retencao'],
    status: 'Para Modelar',
    favorite: true,
    notes: 'Item de exemplo para mostrar como a biblioteca desconstruída funciona. Pode apagar quando adicionar seus perfis reais.',
    analyzedWith: 'template',
  },
  {
    id: 'SWP-002',
    source: 'exemplo',
    sourceId: 'example-story-001',
    format: 'Story',
    profileHandle: 'perfil_referencia_exemplo',
    niche: 'Exemplo',
    title: '[EXEMPLO] Sequência de 5 Stories: Caixinha -> Quebra de Objeção -> Oferta',
    url: 'https://www.instagram.com/',
    thumbnailUrl: '',
    videoUrl: '',
    publishedAt: new Date(Date.now() - 86400000).toISOString(),
    collectedAt: new Date().toISOString(),
    metrics: {
      views: 0,
      likes: 0,
      comments: 0,
      durationSec: 0,
    },
    hook: 'Recebi essa pergunta no Direct hoje e acho que 80% de vocês têm a mesma dúvida...',
    hookType: 'Prova Social',
    funnelStage: 'Fundo',
    structure:
      'Story 1: Print/Pergunta real de objeção -> Story 2: Validação + Empatia -> Story 3: Explicação prática / Demonstração do produto -> Story 4: Prova real de cliente -> Story 5: Oferta com Enquete / Link direto',
    scriptOrTranscript: '',
    caption: 'Sequência clássica de conversão diária nos Stories usando uma objeção real como ponte para oferta.',
    storyFrames: [
      {
        order: 1,
        type: 'Print / Contexto',
        content: 'Fundo neutro com print de dúvida real (ou caixinha): "Será que funciona mesmo pra quem não tem tempo / está começando?" + Enquete: "Você também tinha essa dúvida? Sim / Não"',
      },
      {
        order: 2,
        type: 'Falado (15s)',
        content: 'Olhando pra câmera em ambiente natural: valida a dúvida sem defensiva ("Eu também pensava exatamente assim antes de testar...").',
      },
      {
        order: 3,
        type: 'Demonstração / Bastidores',
        content: 'Mostra o produto em uso real na prática, destacando em texto curto o diferencial que mata a objeção.',
      },
      {
        order: 4,
        type: 'Prova Social',
        content: 'Print de feedback de cliente ou resultado real com seta destacando a frase exata que confirma a promessa.',
      },
      {
        order: 5,
        type: 'CTA / Oferta',
        content: 'Chamada clara e sem pressão: "Se quiser garantir o seu com [condição], toca no link aqui embaixo ou responde EU QUERO nesse story."',
      },
    ],
    cta: 'Responder "EU QUERO" no Story ou clicar no link',
    whyItWorked:
      'A enquete no Story 1 aquece o algoritmo e filtra quem tem a dor; o Story 2 humaniza; os Stories 3 e 4 matam a objeção com prova visual antes do link no Story 5.',
    tags: ['exemplo', 'sequencia-de-venda', 'quebra-de-objecao', 'stories'],
    status: 'Para Modelar',
    favorite: true,
    notes: 'Use o botão "+ Novo Item -> Sequência de Stories" sempre que vir uma sequência forte nos Stories antes de expirar em 24h.',
    analyzedWith: 'template',
  },
];

async function ensureDirs() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.mkdir(LIBRARY_ITEMS_DIR, { recursive: true });
}

async function readJsonFile(filePath, fallbackValue) {
  await ensureDirs();
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.writeFile(filePath, JSON.stringify(fallbackValue, null, 2), 'utf8');
      return structuredClone(fallbackValue);
    }
    throw err;
  }
}

async function writeJsonFile(filePath, data) {
  await ensureDirs();
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

export function normalizeHandle(handle) {
  return String(handle || '')
    .trim()
    .replace(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\//i, '')
    .replace(/^@+/, '')
    .split(/[/?#]/)[0]
    .trim()
    .toLowerCase();
}

export async function getBrandDna() {
  return readJsonFile(FILES.brandDna, DEFAULT_BRAND_DNA);
}

export async function saveBrandDna(payload) {
  const current = await getBrandDna();
  const updated = {
    ...current,
    brandName: String(payload.brandName ?? current.brandName).trim(),
    instagramHandle: normalizeHandle(payload.instagramHandle ?? current.instagramHandle),
    niche: String(payload.niche ?? current.niche).trim(),
    productName: String(payload.productName ?? current.productName).trim(),
    productOffer: String(payload.productOffer ?? current.productOffer).trim(),
    targetAudience: String(payload.targetAudience ?? current.targetAudience).trim(),
    mainPains: String(payload.mainPains ?? current.mainPains).trim(),
    mainDesires: String(payload.mainDesires ?? current.mainDesires).trim(),
    commonObjections: String(payload.commonObjections ?? current.commonObjections).trim(),
    uniqueMechanism: String(payload.uniqueMechanism ?? current.uniqueMechanism).trim(),
    toneOfVoice: String(payload.toneOfVoice ?? current.toneOfVoice).trim(),
    proofsAndResults: String(payload.proofsAndResults ?? current.proofsAndResults).trim(),
    forbiddenCliches: String(payload.forbiddenCliches ?? current.forbiddenCliches).trim(),
    extraNotes: String(payload.extraNotes ?? current.extraNotes).trim(),
    updatedAt: new Date().toISOString(),
  };
  await writeJsonFile(FILES.brandDna, updated);
  await syncMarkdownLibrary();
  return updated;
}

export function normalizeNiche(niche) {
  const cleaned = String(niche || '').trim().replace(/\s+/g, ' ');
  return cleaned || 'Geral';
}

export function getUniqueNiches(profiles = [], items = []) {
  const set = new Set();
  for (const p of profiles) {
    if (p?.niche) set.add(normalizeNiche(p.niche));
  }
  for (const it of items) {
    if (it?.niche) set.add(normalizeNiche(it.niche));
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'));
}

export async function getProfiles() {
  const profiles = await readJsonFile(FILES.profiles, DEFAULT_PROFILES);
  return profiles.map((p) => ({ ...p, niche: normalizeNiche(p.niche) }));
}

export async function saveProfiles(profiles) {
  await writeJsonFile(FILES.profiles, profiles);
  await syncMarkdownLibrary();
  return profiles;
}

export async function addProfile(payload) {
  const handle = normalizeHandle(payload.handle);
  if (!handle) {
    throw new Error('Informe um @handle válido do Instagram.');
  }
  const profiles = await getProfiles();
  if (profiles.some((p) => p.handle === handle)) {
    throw new Error(`O perfil @${handle} já está cadastrado.`);
  }
  const profile = {
    id: `prf_${Date.now().toString(36)}`,
    handle,
    displayName: String(payload.displayName || `@${handle}`).trim(),
    niche: normalizeNiche(payload.niche),
    category: String(payload.category || 'Concorrente / Referência').trim(),
    whyFollow: String(payload.whyFollow || '').trim(),
    active: payload.active !== false,
    monitorReels: payload.monitorReels !== false,
    monitorStories: Boolean(payload.monitorStories),
    maxItemsPerSync: Math.max(1, Math.min(50, Number(payload.maxItemsPerSync) || 10)),
    createdAt: new Date().toISOString(),
    lastSyncAt: null,
  };
  profiles.unshift(profile);
  await saveProfiles(profiles);
  return profile;
}

export async function updateProfile(id, payload) {
  const profiles = await getProfiles();
  const idx = profiles.findIndex((p) => p.id === id);
  if (idx === -1) return null;
  const current = profiles[idx];
  const oldNiche = normalizeNiche(current.niche);
  const nextNiche = payload.niche !== undefined ? normalizeNiche(payload.niche) : oldNiche;
  const updated = {
    ...current,
    displayName: payload.displayName !== undefined ? String(payload.displayName).trim() : current.displayName,
    niche: nextNiche,
    category: payload.category !== undefined ? String(payload.category).trim() : current.category,
    whyFollow: payload.whyFollow !== undefined ? String(payload.whyFollow).trim() : current.whyFollow,
    active: payload.active !== undefined ? Boolean(payload.active) : current.active,
    monitorReels: payload.monitorReels !== undefined ? Boolean(payload.monitorReels) : current.monitorReels,
    monitorStories: payload.monitorStories !== undefined ? Boolean(payload.monitorStories) : current.monitorStories,
    maxItemsPerSync:
      payload.maxItemsPerSync !== undefined
        ? Math.max(1, Math.min(50, Number(payload.maxItemsPerSync) || 10))
        : current.maxItemsPerSync,
    lastSyncAt: payload.lastSyncAt !== undefined ? payload.lastSyncAt : current.lastSyncAt,
  };
  profiles[idx] = updated;

  // Se o assunto/nicho do perfil mudou, atualiza itens do mesmo perfil que herdavam o nicho anterior
  if (nextNiche !== oldNiche) {
    const items = await getItems();
    let changed = false;
    for (const it of items) {
      if (it.profileHandle === current.handle && (!it.niche || it.niche === oldNiche || it.niche === 'Geral')) {
        it.niche = nextNiche;
        changed = true;
      }
    }
    if (changed) {
      await writeJsonFile(FILES.items, items);
    }
  }

  await saveProfiles(profiles);
  return updated;
}

export async function deleteProfile(id) {
  const profiles = await getProfiles();
  const next = profiles.filter((p) => p.id !== id);
  if (next.length === profiles.length) return false;
  await saveProfiles(next);
  return true;
}

export async function getItems() {
  const items = await readJsonFile(FILES.items, DEFAULT_ITEMS);
  return items.map((it) => ({
    ...it,
    niche: normalizeNiche(it.niche || (it.source === 'exemplo' ? 'Exemplo' : '')),
    reviewStatus: ['approved', 'rejected', 'pending'].includes(it.reviewStatus) ? it.reviewStatus : 'pending',
    reviewReason: it.reviewReason || '',
    reviewedAt: it.reviewedAt || null,
    autoFiltered: Boolean(it.autoFiltered),
    relevanceScore: typeof it.relevanceScore === 'number' ? it.relevanceScore : 50,
    relevanceReasons: Array.isArray(it.relevanceReasons) ? it.relevanceReasons : [],
  }));
}

export function generateNextItemId(items) {
  let maxNum = 0;
  for (const item of items) {
    const match = String(item.id || '').match(/^SWP-(\d+)$/);
    if (match) {
      maxNum = Math.max(maxNum, Number(match[1]));
    }
  }
  return `SWP-${String(maxNum + 1).padStart(3, '0')}`;
}

export async function createItem(payload) {
  const [items, profiles] = await Promise.all([getItems(), getProfiles()]);
  const id = generateNextItemId(items);
  const format = payload.format === 'Story' ? 'Story' : 'Reel';
  const profileHandle = normalizeHandle(payload.profileHandle) || 'referencia';
  const matchedProfile = profiles.find((p) => p.handle === profileHandle);
  const niche = payload.niche && String(payload.niche).trim()
    ? normalizeNiche(payload.niche)
    : matchedProfile?.niche || 'Geral';
  const tags = Array.isArray(payload.tags)
    ? payload.tags.map((t) => String(t).trim().replace(/^#/, '')).filter(Boolean)
    : String(payload.tags || '')
        .split(',')
        .map((t) => t.trim().replace(/^#/, ''))
        .filter(Boolean);

  const storyFrames = Array.isArray(payload.storyFrames)
    ? payload.storyFrames
        .map((f, i) => ({
          order: i + 1,
          type: String(f.type || 'Tela').trim(),
          content: String(f.content || '').trim(),
        }))
        .filter((f) => f.content)
    : [];

  const item = {
    id,
    source: payload.source || 'manual',
    sourceId: payload.sourceId || `manual-${Date.now().toString(36)}`,
    format,
    profileHandle,
    niche,
    title: String(payload.title || payload.hook || `${format} sem título`).trim().slice(0, 120),
    url: String(payload.url || '').trim(),
    thumbnailUrl: String(payload.thumbnailUrl || '').trim(),
    videoUrl: String(payload.videoUrl || '').trim(),
    publishedAt: payload.publishedAt || new Date().toISOString(),
    collectedAt: new Date().toISOString(),
    metrics: {
      views: Number(payload.metrics?.views) || 0,
      likes: Number(payload.metrics?.likes) || 0,
      comments: Number(payload.metrics?.comments) || 0,
      durationSec: Number(payload.metrics?.durationSec) || 0,
    },
    hook: String(payload.hook || '').trim(),
    hookType: String(payload.hookType || 'Curiosidade').trim(),
    funnelStage: String(payload.funnelStage || 'Topo').trim(),
    structure: String(payload.structure || '').trim(),
    scriptOrTranscript: String(payload.scriptOrTranscript || '').trim(),
    caption: String(payload.caption || '').trim(),
    storyFrames,
    cta: String(payload.cta || '').trim(),
    whyItWorked: String(payload.whyItWorked || '').trim(),
    tags,
    status: String(payload.status || 'Novo').trim(),
    favorite: Boolean(payload.favorite),
    notes: String(payload.notes || '').trim(),
    analyzedWith: payload.analyzedWith || 'manual',
    reviewStatus: ['approved', 'rejected', 'pending'].includes(payload.reviewStatus)
      ? payload.reviewStatus
      : payload.source === 'manual'
        ? 'approved'
        : 'pending',
    reviewReason: String(payload.reviewReason || '').trim(),
    reviewedAt: payload.reviewStatus === 'approved' || payload.source === 'manual' ? new Date().toISOString() : null,
    autoFiltered: Boolean(payload.autoFiltered),
    relevanceScore: 50,
    relevanceReasons: [],
  };

  const model = await getNicheModel(niche);
  const scored = scoreItemWithModel(item, model);
  item.relevanceScore = scored.relevanceScore;
  item.relevanceReasons = scored.relevanceReasons;

  items.unshift(item);
  await writeJsonFile(FILES.items, items);
  if (item.reviewStatus === 'approved' || item.reviewStatus === 'rejected') {
    await rebuildNicheModel(niche, items);
  }
  await syncMarkdownLibrary();
  return item;
}

export async function saveItemsBulk(items) {
  await writeJsonFile(FILES.items, items);
  await syncMarkdownLibrary();
  return items;
}

export async function updateItem(id, payload) {
  const items = await getItems();
  const idx = items.findIndex((it) => it.id === id);
  if (idx === -1) return null;
  const current = items[idx];

  let tags = current.tags;
  if (payload.tags !== undefined) {
    tags = Array.isArray(payload.tags)
      ? payload.tags.map((t) => String(t).trim().replace(/^#/, '')).filter(Boolean)
      : String(payload.tags)
          .split(',')
          .map((t) => t.trim().replace(/^#/, ''))
          .filter(Boolean);
  }

  let storyFrames = current.storyFrames;
  if (payload.storyFrames !== undefined && Array.isArray(payload.storyFrames)) {
    storyFrames = payload.storyFrames
      .map((f, i) => ({
        order: i + 1,
        type: String(f.type || 'Tela').trim(),
        content: String(f.content || '').trim(),
      }))
      .filter((f) => f.content);
  }

  const updated = {
    ...current,
    format: payload.format !== undefined ? (payload.format === 'Story' ? 'Story' : 'Reel') : current.format,
    profileHandle:
      payload.profileHandle !== undefined
        ? normalizeHandle(payload.profileHandle) || current.profileHandle
        : current.profileHandle,
    niche: payload.niche !== undefined ? normalizeNiche(payload.niche) : normalizeNiche(current.niche),
    title: payload.title !== undefined ? String(payload.title).trim() : current.title,
    url: payload.url !== undefined ? String(payload.url).trim() : current.url,
    hook: payload.hook !== undefined ? String(payload.hook).trim() : current.hook,
    hookType: payload.hookType !== undefined ? String(payload.hookType).trim() : current.hookType,
    funnelStage: payload.funnelStage !== undefined ? String(payload.funnelStage).trim() : current.funnelStage,
    structure: payload.structure !== undefined ? String(payload.structure).trim() : current.structure,
    scriptOrTranscript:
      payload.scriptOrTranscript !== undefined ? String(payload.scriptOrTranscript).trim() : current.scriptOrTranscript,
    caption: payload.caption !== undefined ? String(payload.caption).trim() : current.caption,
    storyFrames,
    cta: payload.cta !== undefined ? String(payload.cta).trim() : current.cta,
    whyItWorked: payload.whyItWorked !== undefined ? String(payload.whyItWorked).trim() : current.whyItWorked,
    tags,
    status: payload.status !== undefined ? String(payload.status).trim() : current.status,
    favorite: payload.favorite !== undefined ? Boolean(payload.favorite) : current.favorite,
    notes: payload.notes !== undefined ? String(payload.notes).trim() : current.notes,
    analyzedWith: payload.analyzedWith !== undefined ? payload.analyzedWith : current.analyzedWith,
    metrics: payload.metrics
      ? {
          views: Number(payload.metrics.views ?? current.metrics?.views) || 0,
          likes: Number(payload.metrics.likes ?? current.metrics?.likes) || 0,
          comments: Number(payload.metrics.comments ?? current.metrics?.comments) || 0,
          durationSec: Number(payload.metrics.durationSec ?? current.metrics?.durationSec) || 0,
        }
      : current.metrics,
  };

  items[idx] = updated;
  await writeJsonFile(FILES.items, items);
  await syncMarkdownLibrary();
  return updated;
}

export async function deleteItem(id) {
  const items = await getItems();
  const target = items.find((it) => it.id === id);
  const next = items.filter((it) => it.id !== id);
  if (next.length === items.length) return false;
  await writeJsonFile(FILES.items, next);
  await deleteMediaForItem(id);
  if (target?.niche) {
    await rebuildNicheModel(target.niche, next);
  }
  await syncMarkdownLibrary();
  return true;
}

/**
 * Registra avaliação humana (aprovar 👍 / reprovar 👎 / pendente) em um item,
 * retreina o algoritmo do nicho e recalcula a relevância dos itens do mesmo nicho.
 */
export async function reviewItem(id, { reviewStatus, reviewReason = '' }) {
  if (!['approved', 'rejected', 'pending'].includes(reviewStatus)) {
    throw new Error('Status de avaliação inválido (use approved, rejected ou pending).');
  }
  const items = await getItems();
  const idx = items.findIndex((it) => it.id === id);
  if (idx === -1) return null;

  const target = items[idx];
  target.reviewStatus = reviewStatus;
  target.reviewReason = String(reviewReason || '').trim();
  target.reviewedAt = reviewStatus === 'pending' ? null : new Date().toISOString();
  target.autoFiltered = false;

  if (reviewStatus === 'approved' && target.status === 'Novo') {
    target.status = 'Para Modelar';
  } else if (reviewStatus === 'rejected') {
    target.status = 'Arquivado';
  } else if (reviewStatus === 'pending' && target.status === 'Arquivado') {
    target.status = 'Novo';
  }

  const nicheKey = normalizeNiche(target.niche);
  const model = await rebuildNicheModel(nicheKey, items);

  // Recalcula pontuação de relevância de todos os itens do mesmo nicho
  for (const it of items) {
    if (normalizeNiche(it.niche) === nicheKey) {
      const scored = scoreItemWithModel(it, model);
      it.relevanceScore = scored.relevanceScore;
      it.relevanceReasons = scored.relevanceReasons;
    }
  }

  await writeJsonFile(FILES.items, items);
  await syncMarkdownLibrary();
  return { item: target, model };
}

/**
 * Reavalia todos os itens de um nicho após ajustes manuais nas palavras-chave/nota mínima.
 */
export async function rescoreNicheItems(niche, { applyAutoFilter = false } = {}) {
  const nicheKey = normalizeNiche(niche);
  const items = await getItems();
  const model = await rebuildNicheModel(nicheKey, items);

  let autoFilteredCount = 0;
  for (const it of items) {
    if (normalizeNiche(it.niche) !== nicheKey) continue;
    const scored = scoreItemWithModel(it, model);
    it.relevanceScore = scored.relevanceScore;
    it.relevanceReasons = scored.relevanceReasons;

    if (applyAutoFilter && it.reviewStatus === 'pending' && shouldAutoFilter(model, scored.relevanceScore)) {
      it.reviewStatus = 'rejected';
      it.autoFiltered = true;
      it.reviewReason = `Filtrado automaticamente pelo algoritmo (relevância ${scored.relevanceScore}%)`;
      it.status = 'Arquivado';
      autoFilteredCount++;
    }
  }

  await writeJsonFile(FILES.items, items);
  await syncMarkdownLibrary();
  return { model, autoFilteredCount };
}

export async function getSyncLogs() {
  return readJsonFile(FILES.syncLogs, []);
}

export async function appendSyncLog(logEntry) {
  const logs = await getSyncLogs();
  logs.unshift(logEntry);
  const trimmed = logs.slice(0, 50);
  await writeJsonFile(FILES.syncLogs, trimmed);
  return logEntry;
}

function formatNumber(n) {
  return new Intl.NumberFormat('pt-BR').format(Number(n) || 0);
}

function renderBrandDnaMarkdown(dna) {
  return `# DNA da Marca e do Produto

> Última atualização: ${dna.updatedAt || '-'}

- **Marca / Projeto:** ${dna.brandName || '*(não preenchido)*'}
- **Perfil Instagram:** ${dna.instagramHandle ? `@${dna.instagramHandle}` : '*(não preenchido)*'}
- **Nicho:** ${dna.niche || '*(não preenchido)*'}
- **Produto Principal:** ${dna.productName || '*(não preenchido)*'}

## Oferta & Promessa Principal
${dna.productOffer || '*(preencha no Dashboard em "DNA da Marca")*'}

## Público-Alvo (ICP)
${dna.targetAudience || '*(não preenchido)*'}

## Principais Dores
${dna.mainPains || '*(não preenchido)*'}

## Principais Desejos
${dna.mainDesires || '*(não preenchido)*'}

## Objeções Comuns antes de Comprar
${dna.commonObjections || '*(não preenchido)*'}

## Diferenciais & Mecanismo Único
${dna.uniqueMechanism || '*(não preenchido)*'}

## Tom de Voz & Personalidade
${dna.toneOfVoice || '*(não preenchido)*'}

## Provas, Resultados e Bastidores Disponíveis
${dna.proofsAndResults || '*(não preenchido)*'}

## Palavras e Clichês Proibidos
${dna.forbiddenCliches || '*(nenhum definido)*'}

## Notas Extras
${dna.extraNotes || '*(sem notas extras)*'}
`;
}

function renderProfilesMarkdown(profiles) {
  const niches = Array.from(new Set(profiles.map((p) => normalizeNiche(p.niche)))).sort((a, b) =>
    a.localeCompare(b, 'pt-BR')
  );
  const header = `# Perfis de Referência Monitorados\n\nTotal: **${profiles.length}** perfis (${
    profiles.filter((p) => p.active).length
  } ativos) em **${niches.length}** assunto(s)/nicho(s)\n\n`;
  if (!profiles.length) {
    return `${header}_Nenhum perfil cadastrado ainda. Adicione perfis no Dashboard na aba "Perfis Monitorados"._\n`;
  }

  let md = header;
  for (const niche of niches) {
    const group = profiles.filter((p) => normalizeNiche(p.niche) === niche);
    md += `## ${niche} (${group.length})\n\n`;
    md += `| Perfil | Categoria | Status | Reels | Stories | Motivo de Referência |\n| :--- | :--- | :--- | :--- | :--- | :--- |\n`;
    md += group
      .map(
        (p) =>
          `| @${p.handle} | ${p.category || '-'} | ${p.active ? 'Ativo' : 'Pausado'} | ${
            p.monitorReels ? 'Sim' : 'Não'
          } | ${p.monitorStories ? 'Sim' : 'Não'} | ${(p.whyFollow || '-').replace(/\|/g, '/')} |`
      )
      .join('\n');
    md += '\n\n';
  }
  return md;
}

function renderItemMarkdown(item) {
  const framesSection =
    item.format === 'Story' && Array.isArray(item.storyFrames) && item.storyFrames.length
      ? `## Sequência de Stories (${item.storyFrames.length} frames)\n${item.storyFrames
          .map((f, idx) => `${idx + 1}. **[${f.type || 'Tela'}]** ${f.content}`)
          .join('\n')}\n\n`
      : '';

  return `# ${item.id} — ${item.title}

- **Formato:** ${item.format}
- **Assunto / Nicho:** ${normalizeNiche(item.niche)}
- **Perfil de Referência:** @${item.profileHandle}
- **Estágio do Funil:** ${item.funnelStage}
- **Tipo de Gancho:** ${item.hookType}
- **Status:** ${item.status}${item.favorite ? ' ⭐ Favorito' : ''}
- **Métricas:** ${formatNumber(item.metrics?.views)} views · ${formatNumber(item.metrics?.likes)} likes · ${formatNumber(item.metrics?.comments)} comentários
- **Link Original:** ${item.url || 'N/A'}
- **Tags:** ${item.tags?.length ? item.tags.map((t) => `\`#${t}\``).join(' ') : 'nenhuma'}
- **Publicado em:** ${item.publishedAt || '-'}

## Gancho (0–3s / Abertura)
> ${item.hook || '*(sem gancho registrado)*'}

## Estrutura Narrativa (Esqueleto para Modelar)
${item.structure || '*(não mapeada)*'}

## CTA (Chamada para Ação)
${item.cta || '*(sem CTA explícito)*'}

## Por que Funcionou (Análise Estratégica)
${item.whyItWorked || '*(sem análise)*'}

${framesSection}${
    item.scriptOrTranscript
      ? `## Roteiro / Transcrição\n${item.scriptOrTranscript}\n\n`
      : ''
  }## Legenda Original
${item.caption || '*(sem legenda)*'}

${item.notes ? `## Notas Pessoais\n${item.notes}\n` : ''}`;
}

function renderHooksBankMarkdown(items) {
  const grouped = new Map();
  for (const item of items) {
    if (!item.hook) continue;
    const type = item.hookType || 'Outros';
    if (!grouped.has(type)) grouped.set(type, []);
    grouped.get(type).push(item);
  }

  let md = `# Banco de Ganchos (Hooks Bank)\n\n> Extraído automaticamente dos **${items.length}** itens do Swipe File.\n\n`;
  if (!grouped.size) {
    return `${md}_Nenhum gancho catalogado ainda._\n`;
  }

  for (const [type, list] of grouped.entries()) {
    md += `## ${type} (${list.length})\n`;
    for (const item of list) {
      md += `- **[${item.id}](./items/${item.id}.md)** (${item.format} · ${normalizeNiche(item.niche)} · @${item.profileHandle} · ${item.funnelStage}): "${item.hook}"\n`;
    }
    md += '\n';
  }
  return md;
}

function renderSwipeIndexMarkdown(items) {
  let md = `# Índice do Swipe File\n\n> Biblioteca pronta para consulta e modelagem. Total de referências: **${items.length}**.\n\n`;
  if (!items.length) {
    return `${md}_Nenhum item na biblioteca ainda._\n`;
  }
  md += `| ID | Formato | Assunto / Nicho | Perfil | Funil | Tipo de Gancho | Gancho | Views | Status |\n`;
  md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- | ---: | :--- |\n`;
  for (const it of items) {
    const cleanHook = (it.hook || it.title || '').replace(/\|/g, '/').replace(/\r?\n/g, ' ').slice(0, 90);
    const cleanNiche = normalizeNiche(it.niche).replace(/\|/g, '/');
    md += `| [${it.id}](./items/${it.id}.md) | ${it.format} | ${cleanNiche} | @${it.profileHandle} | ${it.funnelStage} | ${it.hookType} | ${cleanHook} | ${formatNumber(it.metrics?.views)} | ${it.status} |\n`;
  }
  md += '\n';
  return md;
}

/**
 * Regera todos os arquivos Markdown em library/ para manter a IA 100% sincronizada com o Dashboard.
 */
export async function syncMarkdownLibrary() {
  await ensureDirs();
  const [dna, profiles, allItems, curationStore] = await Promise.all([
    getBrandDna(),
    getProfiles(),
    getItems(),
    getCurationStore(),
  ]);

  // Apenas itens válidos (aprovados ou pendentes — nunca reprovados) entram na biblioteca de modelagem da IA!
  const items = allItems.filter((it) => it.reviewStatus !== 'rejected');

  await Promise.all([
    fs.writeFile(path.join(LIBRARY_DIR, 'brand-dna.md'), renderBrandDnaMarkdown(dna), 'utf8'),
    fs.writeFile(path.join(LIBRARY_DIR, 'profiles.md'), renderProfilesMarkdown(profiles), 'utf8'),
    fs.writeFile(path.join(LIBRARY_DIR, 'hooks-bank.md'), renderHooksBankMarkdown(items), 'utf8'),
    fs.writeFile(path.join(LIBRARY_DIR, 'swipe-file-index.md'), renderSwipeIndexMarkdown(items), 'utf8'),
    fs.writeFile(path.join(LIBRARY_DIR, 'curation-rules.md'), renderCurationMarkdown(curationStore), 'utf8'),
  ]);

  const validFiles = new Set();
  for (const item of items) {
    const fileName = `${item.id}.md`;
    validFiles.add(fileName);
    await fs.writeFile(path.join(LIBRARY_ITEMS_DIR, fileName), renderItemMarkdown(item), 'utf8');
  }

  // Remove arquivos .md órfãos de itens excluídos
  const existingFiles = await fs.readdir(LIBRARY_ITEMS_DIR);
  for (const file of existingFiles) {
    if (file.endsWith('.md') && !validFiles.has(file)) {
      await fs.unlink(path.join(LIBRARY_ITEMS_DIR, file));
    }
  }
}
