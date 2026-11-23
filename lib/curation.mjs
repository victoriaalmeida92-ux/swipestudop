import fs from 'node:fs/promises';
import path from 'node:path';
import { ROOT_DIR } from './env.mjs';

const DATA_DIR = path.join(ROOT_DIR, 'data');
const CURATION_FILE = path.join(DATA_DIR, 'curation-model.json');

const STOPWORDS = new Set([
  // English
  'the', 'and', 'for', 'that', 'this', 'with', 'from', 'your', 'you', 'are', 'was', 'were',
  'have', 'has', 'had', 'not', 'but', 'all', 'can', 'will', 'just', 'like', 'what', 'when',
  'where', 'who', 'why', 'how', 'out', 'about', 'into', 'over', 'after', 'then', 'them',
  'they', 'their', 'there', 'here', 'been', 'being', 'more', 'most', 'some', 'such', 'only',
  'own', 'same', 'than', 'too', 'very', 'our', 'her', 'his', 'she', 'him', 'its', 'my', 'me',
  'we', 'us', 'one', 'two', 'get', 'got', 'make', 'made', 'know', 'see', 'time', 'day', 'today',
  'video', 'post', 'reel', 'reels', 'instagram', 'follow', 'link', 'bio', 'comment', 'share',
  'january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september',
  'october', 'november', 'december', '2024', '2025', '2026',
  // Portuguese
  'que', 'com', 'para', 'por', 'uma', 'uns', 'umas', 'dos', 'das', 'nos', 'nas', 'seu', 'sua',
  'seus', 'suas', 'como', 'mais', 'mas', 'foi', 'ser', 'ter', 'tem', 'está', 'estao', 'isso',
  'esse', 'essa', 'esses', 'essas', 'aqui', 'ali', 'muito', 'muita', 'tambem', 'também',
  'sobre', 'entre', 'depois', 'antes', 'quando', 'onde', 'quem', 'qual', 'porque', 'voce',
  'você', 'voces', 'vocês', 'meu', 'minha', 'nosso', 'nossa', 'ele', 'ela', 'eles', 'elas',
  'nao', 'não', 'sim', 'pra', 'pro', 'pelo', 'pela', 'todo', 'toda', 'todos', 'todas',
]);

function normalizeNicheKey(niche) {
  return String(niche || '').trim().replace(/\s+/g, ' ') || 'Geral';
}

export function extractTokens(text) {
  const cleaned = String(text || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/@[\w.]+/g, ' ')
    .replace(/[^a-z0-9#\s]/g, ' ');

  const rawWords = cleaned.split(/\s+/).filter(Boolean);
  const tokens = [];
  for (const raw of rawWords) {
    const word = raw.replace(/^#+/, '');
    if (word.length < 3) continue;
    if (/^\d+$/.test(word)) continue;
    if (STOPWORDS.has(word)) continue;
    tokens.push(word);
  }
  return Array.from(new Set(tokens));
}

export function extractItemText(item) {
  const frames = Array.isArray(item.storyFrames)
    ? item.storyFrames.map((f) => f.content).filter(Boolean).join(' ')
    : '';
  return [
    item.title,
    item.hook,
    item.caption,
    item.scriptOrTranscript,
    frames,
    (item.tags || []).join(' '),
  ]
    .filter(Boolean)
    .join(' ');
}

export function createDefaultNicheModel(niche) {
  return {
    niche: normalizeNicheKey(niche),
    autoFilterThreshold: 35,
    autoRejectEnabled: true,
    manualPositiveKeywords: [],
    manualNegativeKeywords: [],
    learnedPositiveTokens: {},
    learnedNegativeTokens: {},
    approvedCount: 0,
    rejectedCount: 0,
    profileStats: {},
    updatedAt: new Date().toISOString(),
  };
}

export async function getCurationStore() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  try {
    const raw = await fs.readFile(CURATION_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : { models: {} };
  } catch (err) {
    if (err.code === 'ENOENT') {
      const init = { models: {} };
      await fs.writeFile(CURATION_FILE, JSON.stringify(init, null, 2), 'utf8');
      return init;
    }
    throw err;
  }
}

export async function saveCurationStore(store) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(CURATION_FILE, JSON.stringify(store, null, 2), 'utf8');
  return store;
}

export async function getNicheModel(niche) {
  const key = normalizeNicheKey(niche);
  const store = await getCurationStore();
  return store.models[key] ? { ...createDefaultNicheModel(key), ...store.models[key] } : createDefaultNicheModel(key);
}

/**
 * Calcula a pontuação de relevância (0-100) de um item com base no modelo treinado do nicho.
 */
export function scoreItemWithModel(item, model) {
  const nicheName = normalizeNicheKey(item.niche || model?.niche);
  const m = model || createDefaultNicheModel(nicheName);
  // Avalia apenas o conteúdo do post (título, gancho, legenda, transcrição, tags), sem o @handle para evitar falsos positivos
  const fullText = extractItemText(item);
  const lowerText = fullText
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '');
  const tokens = extractTokens(fullText);

  let score = 50;
  const reasons = [];

  // 1) Palavras do próprio nome do assunto/nicho (ex: "lipedema")
  const nicheTokens = extractTokens(nicheName);
  const matchedNicheTokens = nicheTokens.filter((nt) => lowerText.includes(nt));
  if (matchedNicheTokens.length > 0) {
    score += 24;
    reasons.push(`+24 contém termo do nicho (${matchedNicheTokens.join(', ')})`);
  } else if (nicheTokens.length > 0 && nicheName !== 'Geral' && nicheName !== 'Exemplo') {
    const totalReviewed = (m.approvedCount || 0) + (m.rejectedCount || 0);
    if (totalReviewed >= 2 || (m.manualPositiveKeywords || []).length > 0) {
      score -= 14;
      reasons.push(`-14 não menciona "${nicheName}"`);
    }
  }

  // 2) Palavras-chave positivas manuais
  const manualPosMatches = [];
  for (const kw of m.manualPositiveKeywords || []) {
    const normKw = String(kw).trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    if (normKw && lowerText.includes(normKw)) {
      manualPosMatches.push(kw);
    }
  }
  if (manualPosMatches.length) {
    const pts = Math.min(36, manualPosMatches.length * 18);
    score += pts;
    reasons.push(`+${pts} palavras positivas (${manualPosMatches.slice(0, 3).join(', ')})`);
  }

  // 3) Palavras-chave bloqueadas (negativas manuais)
  const manualNegMatches = [];
  for (const kw of m.manualNegativeKeywords || []) {
    const normKw = String(kw).trim().toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
    if (normKw && lowerText.includes(normKw)) {
      manualNegMatches.push(kw);
    }
  }
  if (manualNegMatches.length) {
    const pts = Math.min(65, manualNegMatches.length * 35);
    score -= pts;
    reasons.push(`-${pts} palavras bloqueadas (${manualNegMatches.slice(0, 3).join(', ')})`);
  }

  // 4) Termos aprendidos com base nos votos 👍 / 👎
  const posMap = m.learnedPositiveTokens || {};
  const negMap = m.learnedNegativeTokens || {};

  let posBoost = 0;
  let negPenalty = 0;
  const posHits = [];
  const negHits = [];

  for (const tok of tokens) {
    const pCount = Number(posMap[tok]) || 0;
    const nCount = Number(negMap[tok]) || 0;
    if (pCount > nCount) {
      const weight = Math.min(8, Math.round(Math.log2(1 + (pCount - nCount)) * 4.5));
      posBoost += weight;
      posHits.push(tok);
    } else if (nCount > pCount) {
      const weight = Math.min(12, Math.round(Math.log2(1 + (nCount - pCount)) * 6.5));
      negPenalty += weight;
      negHits.push(tok);
    }
  }

  if (posBoost > 0) {
    const capped = Math.min(28, posBoost);
    score += capped;
    reasons.push(`+${capped} padrões aprovados (${posHits.slice(0, 3).join(', ')})`);
  }
  if (negPenalty > 0) {
    const capped = Math.min(40, negPenalty);
    score -= capped;
    reasons.push(`-${capped} padrões reprovados (${negHits.slice(0, 3).join(', ')})`);
  }

  // 5) Histórico de aprovação do perfil
  const pStat = m.profileStats?.[item.profileHandle];
  if (pStat) {
    const totalP = (pStat.approved || 0) + (pStat.rejected || 0);
    if (totalP >= 3) {
      const rate = (pStat.approved || 0) / totalP;
      const delta = Math.round((rate - 0.5) * 18);
      if (delta !== 0) {
        score += delta;
        reasons.push(`${delta > 0 ? '+' : ''}${delta} taxa de aprovação de @${item.profileHandle} (${Math.round(rate * 100)}%)`);
      }
    }
  }

  const finalScore = Math.max(0, Math.min(100, Math.round(score)));
  return {
    relevanceScore: finalScore,
    relevanceReasons: reasons.length ? reasons : ['Pontuação base inicial (avalie mais itens para treinar o filtro)'],
  };
}

/**
 * Recalcula o modelo treinado de um nicho a partir dos votos reais (approved/rejected) nos itens.
 */
export async function rebuildNicheModel(niche, allItems) {
  const key = normalizeNicheKey(niche);
  const store = await getCurationStore();
  const prev = store.models[key] ? { ...createDefaultNicheModel(key), ...store.models[key] } : createDefaultNicheModel(key);

  const nicheItems = allItems.filter((it) => normalizeNicheKey(it.niche) === key);
  const learnedPositiveTokens = {};
  const learnedNegativeTokens = {};
  const profileStats = {};
  let approvedCount = 0;
  let rejectedCount = 0;

  for (const item of nicheItems) {
    const status = item.reviewStatus || 'pending';
    if (status !== 'approved' && status !== 'rejected') continue;

    // Itens rejeitados automaticamente pelo próprio algoritmo não realimentam o treino para evitar viés circular
    if (status === 'rejected' && item.autoFiltered) continue;

    const handle = item.profileHandle || 'desconhecido';
    if (!profileStats[handle]) profileStats[handle] = { approved: 0, rejected: 0 };

    const tokens = extractTokens(extractItemText(item));
    if (status === 'approved') {
      approvedCount++;
      profileStats[handle].approved++;
      for (const tok of tokens) {
        learnedPositiveTokens[tok] = (learnedPositiveTokens[tok] || 0) + 1;
      }
    } else {
      rejectedCount++;
      profileStats[handle].rejected++;
      for (const tok of tokens) {
        learnedNegativeTokens[tok] = (learnedNegativeTokens[tok] || 0) + 1;
      }
    }
  }

  const updatedModel = {
    ...prev,
    niche: key,
    learnedPositiveTokens,
    learnedNegativeTokens,
    approvedCount,
    rejectedCount,
    profileStats,
    updatedAt: new Date().toISOString(),
  };

  store.models[key] = updatedModel;
  await saveCurationStore(store);
  return updatedModel;
}

export async function updateNicheModelConfig(niche, configPayload) {
  const key = normalizeNicheKey(niche);
  const store = await getCurationStore();
  const prev = store.models[key] ? { ...createDefaultNicheModel(key), ...store.models[key] } : createDefaultNicheModel(key);

  const parseList = (val, fallback) => {
    if (val === undefined) return fallback;
    const arr = Array.isArray(val) ? val : String(val).split(/[,;\n]/);
    return Array.from(new Set(arr.map((s) => String(s).trim()).filter(Boolean)));
  };

  const updated = {
    ...prev,
    niche: key,
    autoFilterThreshold:
      configPayload.autoFilterThreshold !== undefined
        ? Math.max(0, Math.min(90, Number(configPayload.autoFilterThreshold) || 0))
        : prev.autoFilterThreshold,
    autoRejectEnabled:
      configPayload.autoRejectEnabled !== undefined ? Boolean(configPayload.autoRejectEnabled) : prev.autoRejectEnabled,
    manualPositiveKeywords: parseList(configPayload.manualPositiveKeywords, prev.manualPositiveKeywords),
    manualNegativeKeywords: parseList(configPayload.manualNegativeKeywords, prev.manualNegativeKeywords),
    updatedAt: new Date().toISOString(),
  };

  store.models[key] = updated;
  await saveCurationStore(store);
  return updated;
}

export function getTopLearnedTerms(model, limit = 12) {
  const posMap = model?.learnedPositiveTokens || {};
  const negMap = model?.learnedNegativeTokens || {};

  const positive = Object.entries(posMap)
    .map(([term, count]) => ({ term, score: count - (negMap[term] || 0), count }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.count - a.count)
    .slice(0, limit);

  const negative = Object.entries(negMap)
    .map(([term, count]) => ({ term, score: count - (posMap[term] || 0), count }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.count - a.count)
    .slice(0, limit);

  return { positive, negative };
}

export function shouldAutoFilter(model, score) {
  if (!model?.autoRejectEnabled) return false;
  const hasTraining =
    (model.approvedCount || 0) + (model.rejectedCount || 0) >= 2 ||
    (model.manualPositiveKeywords || []).length > 0 ||
    (model.manualNegativeKeywords || []).length > 0;
  if (!hasTraining) return false;
  return score < (model.autoFilterThreshold ?? 35);
}

export function renderCurationMarkdown(store) {
  const models = Object.values(store?.models || {});
  let md = `# Regras e Aprendizado do Algoritmo de Curadoria\n\n`;
  if (!models.length) {
    return `${md}_Nenhum treinamento registrado ainda. Aprove (👍) ou reprove (👎) itens no Swipe File para treinar o filtro por nicho._\n`;
  }

  for (const m of models) {
    const top = getTopLearnedTerms(m, 10);
    md += `## Nicho: ${m.niche}\n`;
    md += `- **Treinamento:** ${m.approvedCount || 0} aprovados · ${m.rejectedCount || 0} reprovados\n`;
    md += `- **Filtro automático:** ${m.autoRejectEnabled ? `Ativo (nota mínima ${m.autoFilterThreshold}%)` : 'Desativado'}\n`;
    md += `- **Palavras-chave positivas (manuais):** ${(m.manualPositiveKeywords || []).join(', ') || '*(nenhuma)*'}\n`;
    md += `- **Palavras-chave bloqueadas (manuais):** ${(m.manualNegativeKeywords || []).join(', ') || '*(nenhuma)*'}\n`;
    md += `- **Termos positivos aprendidos:** ${top.positive.map((t) => `${t.term} (${t.count})`).join(', ') || '*(aguardando aprovações)*'}\n`;
    md += `- **Termos negativos aprendidos:** ${top.negative.map((t) => `${t.term} (${t.count})`).join(', ') || '*(aguardando reprovações)*'}\n\n`;
  }
  return md;
}
