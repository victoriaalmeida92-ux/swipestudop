import { loadSettings } from './env.mjs';

export const HOOK_TYPES = [
  'Curiosidade',
  'Dor / Erro Comum',
  'Contraintuitivo',
  'Prova Social',
  'Tutorial / Lista',
  'História / Bastidores',
  'Oferta / Direto',
];

export const FUNNEL_STAGES = ['Topo', 'Meio', 'Fundo'];

/**
 * Heurística rápida local caso GEMINI_API_KEY não esteja configurada.
 */
export function heuristicAnalyze(item) {
  const caption = (item.caption || '').trim();
  const transcript = (item.scriptOrTranscript || '').trim();
  const framesText = Array.isArray(item.storyFrames)
    ? item.storyFrames.map((f) => f.content).filter(Boolean).join('\n')
    : '';
  const sourceText = transcript || framesText || caption;
  const lines = sourceText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const firstLine = item.hook || lines[0] || item.title || 'Gancho não identificado';
  const hook = firstLine.length > 180 ? `${firstLine.slice(0, 177)}...` : firstLine;
  const lower = sourceText.toLowerCase();

  let hookType = item.hookType || 'Curiosidade';
  if (/(\d+\s*(erros|dicas|passos|formas|motivos|segredos|coisas)|passo a passo|como\s+)/i.test(lower)) {
    hookType = 'Tutorial / Lista';
  } else if (/(pare de|nunca faça|erro|errando|ninguém te conta|o motivo pelo qual você não)/i.test(lower)) {
    hookType = 'Dor / Erro Comum';
  } else if (/(mentira|opinião impopular|você não precisa|esqueça|ao contrário)/i.test(lower)) {
    hookType = 'Contraintuitivo';
  } else if (/(cliente|resultado|faturei|vendi|depoimento|antes e depois|prova)/i.test(lower)) {
    hookType = 'Prova Social';
  } else if (/(hoje aconteceu|bastidores|minha história|quando eu comecei|dia a dia)/i.test(lower)) {
    hookType = 'História / Bastidores';
  } else if (/(promoção|desconto|link na bio|compre|oferta|vagas abertas|últimas unidades)/i.test(lower)) {
    hookType = 'Oferta / Direto';
  }

  let funnelStage = item.funnelStage || 'Topo';
  if (/(comente|manda no direct|link na bio|clica no link|garanta|compre|cupom|desconto|whatsapp|vagas)/i.test(lower)) {
    funnelStage = 'Fundo';
  } else if (/(como funciona|comparativo|diferença|bastidores|por dentro|tutorial|explico)/i.test(lower)) {
    funnelStage = 'Meio';
  }

  // Extrai possível CTA das últimas 3 linhas
  const tail = lines.slice(-3).join(' ');
  let cta = item.cta || '';
  if (!cta) {
    const ctaMatch = tail.match(
      /([^.!?\n]*(?:comente|salve|envie|compartilhe|link na bio|direct|clique|responda|chama no|saiba mais|garanta)[^.!?\n]*[.!?]?)/i
    );
    cta = ctaMatch ? ctaMatch[1].trim() : '';
  }

  const hashtags = (caption.match(/#[\p{L}\p{N}_]+/gu) || [])
    .slice(0, 5)
    .map((h) => h.slice(1).toLowerCase());

  const tags = Array.from(new Set([...(item.tags || []), ...hashtags])).slice(0, 8);

  const structure =
    item.structure ||
    (item.format === 'Story'
      ? '1. Gancho/Contexto -> 2. Desenvolvimento / Prova -> 3. Interação ou CTA'
      : '1. Gancho (0-3s) -> 2. Desenvolvimento / Valor -> 3. Virada / Prova -> 4. CTA');

  const whyItWorked =
    item.whyItWorked ||
    `Análise inicial automática: gancho classificado como "${hookType}" com foco em ${funnelStage} de funil. Revise o vídeo/sequência original para enriquecer a transcrição e os detalhes visuais.`;

  return {
    hook,
    hookType,
    funnelStage,
    structure,
    cta,
    whyItWorked,
    tags,
    analyzedWith: 'heuristic',
  };
}

/**
 * Desconstrução aprofundada via Gemini API (quando GEMINI_API_KEY estiver configurada).
 */
export async function analyzeSwipeItem(item, brandDna = null) {
  const settings = await loadSettings();
  if (!settings.GEMINI_API_KEY) {
    return heuristicAnalyze(item);
  }

  const model = settings.GEMINI_MODEL || 'gemini-2.5-flash';
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(settings.GEMINI_API_KEY)}`;

  const storyText = Array.isArray(item.storyFrames) && item.storyFrames.length
    ? item.storyFrames
        .map((f, idx) => `Story ${idx + 1} [${f.type || 'Tela'}]: ${f.content || ''}`)
        .join('\n')
    : '';

  const prompt = `Você é um estrategista sênior de conteúdo para Instagram especializado em desconstruir Reels e sequências de Stories para Swipe Files de alta conversão.

Analise o conteúdo abaixo e retorne APENAS um JSON válido (sem markdown, sem crases) com exatamente estas chaves:
{
  "title": "título curto e descritivo (máx 70 caracteres)",
  "hook": "o gancho principal dos primeiros 3 segundos ou 1º story",
  "hookType": "um de: Curiosidade | Dor / Erro Comum | Contraintuitivo | Prova Social | Tutorial / Lista | História / Bastidores | Oferta / Direto",
  "funnelStage": "um de: Topo | Meio | Fundo",
  "structure": "esqueleto passo a passo da estrutura narrativa (ex: 1. Gancho -> 2. Agitação -> 3. Solução -> 4. CTA)",
  "cta": "qual chamada para ação foi usada (ou 'Sem CTA explícito')",
  "whyItWorked": "explicação objetiva em 2-3 frases de por que esse conteúdo retém atenção e gera ação, e qual elemento principal vale modelar",
  "tags": ["até 5 tags curtas em português sem #"]
}

DADOS DO ITEM:
- Formato: ${item.format}
- Perfil: @${item.profileHandle}
- Métricas: ${item.metrics?.views || 0} views, ${item.metrics?.likes || 0} likes, ${item.metrics?.comments || 0} comentários
- Legenda: ${item.caption || '(vazia)'}
- Roteiro/Transcrição existente: ${item.scriptOrTranscript || '(vazio)'}
- Sequência de Stories: ${storyText || '(não aplicável)'}
${brandDna?.productName ? `- Contexto do produto do usuário (para orientar a análise): ${brandDna.productName}` : ''}`;

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn(`[ai-analyzer] Gemini retornou ${res.status}: ${errText.slice(0, 200)}`);
      return heuristicAnalyze(item);
    }

    const data = await res.json();
    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const cleaned = rawText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
    const parsed = JSON.parse(cleaned);

    return {
      title: parsed.title || item.title,
      hook: parsed.hook || item.hook,
      hookType: HOOK_TYPES.includes(parsed.hookType) ? parsed.hookType : 'Curiosidade',
      funnelStage: FUNNEL_STAGES.includes(parsed.funnelStage) ? parsed.funnelStage : 'Topo',
      structure: parsed.structure || item.structure,
      cta: parsed.cta || item.cta,
      whyItWorked: parsed.whyItWorked || item.whyItWorked,
      tags: Array.isArray(parsed.tags)
        ? parsed.tags.map((t) => String(t).replace(/^#/, '').trim()).filter(Boolean).slice(0, 8)
        : item.tags || [],
      analyzedWith: `gemini:${model}`,
    };
  } catch (err) {
    console.warn(`[ai-analyzer] Falha ao usar Gemini (${err.message}), aplicando heurística local.`);
    return heuristicAnalyze(item);
  }
}
