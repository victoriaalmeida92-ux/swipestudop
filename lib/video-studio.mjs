import fs from 'node:fs/promises';
import path from 'node:path';
import { loadSettings, ROOT_DIR } from './env.mjs';
import { getItems } from './store.mjs';
import { ensureCachedMedia } from './media.mjs';

export const STUDIO_DIR = path.join(ROOT_DIR, 'data', 'studio');
export const STUDIO_ASSETS_DIR = path.join(STUDIO_DIR, 'assets');
export const STUDIO_OUTPUTS_DIR = path.join(STUDIO_DIR, 'outputs');
export const STUDIO_RENDERS_DIR = path.join(STUDIO_DIR, 'renders');
const JOBS_FILE = path.join(ROOT_DIR, 'data', 'studio-jobs.json');

const FAL_QUEUE_BASE = 'https://queue.fal.run';
const FAL_UPLOAD_INITIATE = 'https://rest.alpha.fal.ai/storage/upload/initiate?storage_type=fal-cdn-v3';
const GEMINI_INTERACTIONS_URL = 'https://generativelanguage.googleapis.com/v1beta/interactions';
const GEMINI_FILES_UPLOAD_URL = 'https://generativelanguage.googleapis.com/upload/v1beta/files?uploadType=media';

export async function ensureStudioDirs() {
  await Promise.all([
    fs.mkdir(STUDIO_ASSETS_DIR, { recursive: true }),
    fs.mkdir(STUDIO_OUTPUTS_DIR, { recursive: true }),
    fs.mkdir(STUDIO_RENDERS_DIR, { recursive: true }),
  ]);
}

export async function getStudioModelCatalog() {
  const s = await loadSettings();
  return [
    {
      key: 'gemini-omni',
      name: 'Gemini Omni 1.2 Flash (Google Flow)',
      provider: 'Google Gemini API',
      providerKey: 'gemini',
      endpoint: s.GEMINI_OMNI_MODEL || 'gemini-omni-1.2-flash',
      badge: 'Omni do Google Flow',
      description:
        'O mesmo modelo Omni usado no Google Flow: gera e edita vídeos verticais 9:16 com áudio nativo a partir de prompt, foto e/ou vídeo de referência do Swipe File.',
      needsImage: false,
      needsAudio: false,
      supportsVideoRef: true,
      supportsPrompt: true,
    },
    {
      key: 'seedance-ref',
      name: 'Seedance 2.0 Omni (Reference-to-Video)',
      provider: 'fal.ai / ByteDance',
      providerKey: 'fal',
      endpoint: s.FAL_SEEDANCE_REF_MODEL || 'bytedance/seedance-2.0/reference-to-video',
      badge: 'Modelar Reels (ByteDance)',
      description:
        'Combina um Reel do Swipe File (@Video1) + foto do seu avatar/produto (@Image1) + áudio opcional (@Audio1) mantendo ritmo, câmera e estilo.',
      needsImage: false,
      needsAudio: false,
      supportsVideoRef: true,
      supportsPrompt: true,
    },
    {
      key: 'omnihuman',
      name: 'OmniHuman v2 (Avatar Falante)',
      provider: 'fal.ai / ByteDance',
      providerKey: 'fal',
      endpoint: s.FAL_OMNIHUMAN_MODEL || 'bytedance/omnihuman/v2',
      badge: 'UGC Falado (Lip-Sync)',
      description:
        'Transforma 1 foto de pessoa/avatar + 1 áudio (locução MP3/WAV) em um vídeo realista com expressão facial, lábios e gestos sincronizados.',
      needsImage: true,
      needsAudio: true,
      supportsVideoRef: false,
      supportsPrompt: false,
    },
    {
      key: 'seedance-i2v',
      name: 'Seedance 2.0 Fast (Image-to-Video)',
      provider: 'fal.ai / ByteDance',
      providerKey: 'fal',
      endpoint: s.FAL_SEEDANCE_I2V_MODEL || 'bytedance/seedance-2.0/fast/image-to-video',
      badge: 'Produto / Cena',
      description:
        'Anima uma foto do seu produto ou cena inicial com direção de câmera e áudio nativo opcional.',
      needsImage: true,
      needsAudio: false,
      supportsVideoRef: false,
      supportsPrompt: true,
    },
    {
      key: 'seedance-t2v',
      name: 'Seedance 2.0 Fast (Text-to-Video)',
      provider: 'fal.ai / ByteDance',
      providerKey: 'fal',
      endpoint: s.FAL_SEEDANCE_T2V_MODEL || 'bytedance/seedance-2.0/fast/text-to-video',
      badge: 'B-Roll / Zero',
      description:
        'Gera cenas verticais cinematográficas 9:16 do zero a partir do seu roteiro/prompt para usar como gancho ou B-roll.',
      needsImage: false,
      needsAudio: false,
      supportsVideoRef: false,
      supportsPrompt: true,
    },
  ];
}

export async function getStudioJobs() {
  await ensureStudioDirs();
  try {
    const raw = await fs.readFile(JOBS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.writeFile(JOBS_FILE, '[]', 'utf8');
      return [];
    }
    throw err;
  }
}

async function saveStudioJobs(jobs) {
  await ensureStudioDirs();
  await fs.writeFile(JOBS_FILE, JSON.stringify(jobs, null, 2), 'utf8');
  return jobs;
}

function sanitizeFileName(name, fallbackExt = '.bin') {
  const base = path.basename(String(name || 'arquivo')).replace(/[^a-zA-Z0-9._-]/g, '_');
  if (!base.includes('.')) return `${base}${fallbackExt}`;
  return base;
}

function extFromMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m.includes('png')) return '.png';
  if (m.includes('webp')) return '.webp';
  if (m.includes('jpeg') || m.includes('jpg')) return '.jpg';
  if (m.includes('mpeg') || m.includes('mp3')) return '.mp3';
  if (m.includes('wav')) return '.wav';
  if (m.includes('m4a') || m.includes('mp4a')) return '.m4a';
  if (m.includes('ogg')) return '.ogg';
  if (m.includes('mp4')) return '.mp4';
  if (m.includes('quicktime') || m.includes('mov')) return '.mov';
  return '.bin';
}

function mimeFromExt(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const map = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.webp': 'image/webp',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/mp4',
    '.ogg': 'audio/ogg',
    '.aac': 'audio/aac',
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
  };
  return map[ext] || 'application/octet-stream';
}

/**
 * Salva um asset enviado pelo navegador (base64 data URL ou base64 puro) em data/studio/assets/.
 */
export async function saveStudioAsset({ fileName, mimeType, base64Data }) {
  await ensureStudioDirs();
  if (!base64Data) throw new Error('Arquivo vazio.');

  let detectedMime = mimeType || 'application/octet-stream';
  let pureBase64 = String(base64Data);
  const dataUriMatch = pureBase64.match(/^data:([^;]+);base64,(.+)$/);
  if (dataUriMatch) {
    detectedMime = dataUriMatch[1];
    pureBase64 = dataUriMatch[2];
  }

  const buffer = Buffer.from(pureBase64, 'base64');
  if (!buffer.length) throw new Error('Conteúdo do arquivo inválido.');
  if (buffer.length > 35 * 1024 * 1024) {
    throw new Error('Arquivo excedeu o limite de 35 MB.');
  }

  const id = `ast_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
  const safeName = sanitizeFileName(fileName || `${id}${extFromMime(detectedMime)}`, extFromMime(detectedMime));
  const storedName = `${id}_${safeName}`;
  const fullPath = path.join(STUDIO_ASSETS_DIR, storedName);

  await fs.writeFile(fullPath, buffer);
  return {
    assetId: storedName,
    fileName: safeName,
    mimeType: detectedMime,
    size: buffer.length,
    url: `/api/studio/media/assets/${encodeURIComponent(storedName)}`,
  };
}

/**
 * Faz upload de um arquivo local para o CDN da fal.ai para obter uma URL pública aceita pelos modelos.
 */
async function uploadLocalFileToFal(filePath, falKey, explicitMime = null) {
  const buffer = await fs.readFile(filePath);
  const contentType = explicitMime || mimeFromExt(filePath);
  const fileName = path.basename(filePath);

  const initRes = await fetch(FAL_UPLOAD_INITIATE, {
    method: 'POST',
    headers: {
      Authorization: `Key ${falKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      file_name: fileName,
      content_type: contentType,
    }),
    signal: AbortSignal.timeout(30_000),
  });

  if (!initRes.ok) {
    // Fallback para data URI em arquivos pequenos (imagens/áudios <= 6MB)
    if (buffer.length <= 6 * 1024 * 1024 && !contentType.startsWith('video/')) {
      return `data:${contentType};base64,${buffer.toString('base64')}`;
    }
    const errText = await initRes.text();
    throw new Error(`Falha ao iniciar upload na fal.ai (HTTP ${initRes.status}): ${errText.slice(0, 200)}`);
  }

  const { upload_url: uploadUrl, file_url: fileUrl } = await initRes.json();
  if (!uploadUrl || !fileUrl) {
    throw new Error('Resposta inválida da API de storage da fal.ai.');
  }

  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: buffer,
    signal: AbortSignal.timeout(90_000),
  });

  if (!putRes.ok) {
    const errText = await putRes.text();
    throw new Error(`Falha ao enviar mídia para storage fal.ai (HTTP ${putRes.status}): ${errText.slice(0, 200)}`);
  }

  return fileUrl;
}

async function resolveAssetUrlForFal({ assetId, externalUrl }, falKey) {
  if (assetId) {
    const clean = path.basename(assetId);
    const fullPath = path.join(STUDIO_ASSETS_DIR, clean);
    return uploadLocalFileToFal(fullPath, falKey);
  }
  if (externalUrl && /^https?:\/\//i.test(externalUrl.trim())) {
    return externalUrl.trim();
  }
  return null;
}

/**
 * Faz upload de arquivo local (MP4/imagem/áudio) para a Gemini Files API e retorna o file.uri.
 */
async function uploadLocalFileToGeminiFiles(filePath, geminiKey, explicitMime = null) {
  const buffer = await fs.readFile(filePath);
  const contentType = explicitMime || mimeFromExt(filePath);
  const res = await fetch(GEMINI_FILES_UPLOAD_URL, {
    method: 'POST',
    headers: {
      'x-goog-api-key': geminiKey,
      'Content-Type': contentType,
      'X-Goog-Upload-Protocol': 'raw',
    },
    body: buffer,
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Falha ao subir mídia na Gemini Files API (HTTP ${res.status}): ${txt.slice(0, 220)}`);
  }
  const data = await res.json();
  const uri = data?.file?.uri || data?.uri;
  if (!uri) throw new Error('Gemini Files API não retornou URI do arquivo.');
  return { uri, mimeType: contentType };
}

function extractGeminiInteractionVideo(data) {
  // Percorre os possíveis formatos de retorno da Interactions API (steps[].content[], outputs[], output_video)
  const candidates = [];
  if (data?.output_video) candidates.push(data.output_video);
  if (Array.isArray(data?.outputs)) candidates.push(...data.outputs);
  if (Array.isArray(data?.steps)) {
    for (const step of data.steps) {
      if (Array.isArray(step?.content)) candidates.push(...step.content);
      if (Array.isArray(step?.outputs)) candidates.push(...step.outputs);
    }
  }
  for (const c of candidates) {
    if (!c || typeof c !== 'object') continue;
    const isVid =
      c.type === 'video' ||
      String(c.mime_type || c.mimeType || '').startsWith('video/') ||
      Boolean(c.video_url);
    if (isVid && (c.data || c.uri || c.url || c.video_url)) {
      return {
        data: c.data || null,
        uri: c.uri || c.url || c.video_url || null,
        mimeType: c.mime_type || c.mimeType || 'video/mp4',
      };
    }
  }
  return null;
}

async function saveGeminiVideoOutput(job, videoObj, geminiKey) {
  await ensureStudioDirs();
  const fileName = `${job.id}.mp4`;
  const dest = path.join(STUDIO_OUTPUTS_DIR, fileName);

  if (videoObj.data) {
    const pure = String(videoObj.data).replace(/^data:[^;]+;base64,/, '');
    await fs.writeFile(dest, Buffer.from(pure, 'base64'));
    job.localVideoFile = fileName;
    job.localVideoUrl = `/api/studio/media/outputs/${encodeURIComponent(fileName)}`;
    return true;
  }

  if (videoObj.uri) {
    job.remoteVideoUrl = videoObj.uri;
    const res = await fetch(videoObj.uri, {
      headers: { 'x-goog-api-key': geminiKey },
      signal: AbortSignal.timeout(120_000),
    });
    if (res.ok) {
      const buf = Buffer.from(await res.arrayBuffer());
      await fs.writeFile(dest, buf);
      job.localVideoFile = fileName;
      job.localVideoUrl = `/api/studio/media/outputs/${encodeURIComponent(fileName)}`;
      return true;
    }
  }
  return false;
}

async function createGeminiOmniJob(payload, model, settings) {
  if (!settings.GEMINI_API_KEY) {
    throw new Error(
      'GEMINI_API_KEY não configurada. Vá em "Config & Automação", cole sua chave do Google AI Studio (aistudio.google.com/apikey) e salve.'
    );
  }
  const prompt = String(payload.prompt || '').trim();
  if (!prompt) {
    throw new Error('Descreva o vídeo ou a modelagem que deseja gerar no campo de Prompt.');
  }

  const geminiKey = settings.GEMINI_API_KEY;
  const resolution = String(payload.resolution || '720p');
  const durationNum = Math.max(3, Math.min(15, Number(payload.duration) || 10));
  const aspectRatio = payload.aspectRatio === '16:9' ? '16:9' : '9:16';

  const inputBlocks = [];

  // Imagem de referência (local ou URL)
  if (payload.imageAssetId) {
    const clean = path.basename(payload.imageAssetId);
    const fullPath = path.join(STUDIO_ASSETS_DIR, clean);
    const buf = await fs.readFile(fullPath);
    inputBlocks.push({
      type: 'image',
      mime_type: mimeFromExt(fullPath),
      data: buf.toString('base64'),
    });
  } else if (payload.imageUrl && /^https?:\/\//i.test(payload.imageUrl.trim())) {
    inputBlocks.push({ type: 'image', uri: payload.imageUrl.trim() });
  }

  // Vídeo de referência (Reel do Swipe File ou upload local)
  let sourceSwipeItem = null;
  if (payload.videoAssetId) {
    const clean = path.basename(payload.videoAssetId);
    const fullPath = path.join(STUDIO_ASSETS_DIR, clean);
    const uploaded = await uploadLocalFileToGeminiFiles(fullPath, geminiKey, 'video/mp4');
    inputBlocks.push({ type: 'video', mime_type: uploaded.mimeType, uri: uploaded.uri });
  } else if (payload.swipeItemId) {
    const items = await getItems();
    sourceSwipeItem = items.find((i) => i.id === payload.swipeItemId) || null;
    if (sourceSwipeItem) {
      const cachedVideoPath = await ensureCachedMedia(sourceSwipeItem, 'video');
      if (cachedVideoPath) {
        const uploaded = await uploadLocalFileToGeminiFiles(cachedVideoPath, geminiKey, 'video/mp4');
        inputBlocks.push({ type: 'video', mime_type: uploaded.mimeType, uri: uploaded.uri });
      }
    }
  }

  inputBlocks.push({ type: 'text', text: prompt });

  const requestBody = {
    model: model.endpoint,
    background: true,
    input: inputBlocks.length === 1 ? prompt : inputBlocks,
    response_format: {
      type: 'video',
      aspect_ratio: aspectRatio,
      resolution,
      duration: `${durationNum}s`,
    },
  };

  const res = await fetch(GEMINI_INTERACTIONS_URL, {
    method: 'POST',
    headers: {
      'x-goog-api-key': geminiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
    signal: AbortSignal.timeout(60_000),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini Omni API (${model.endpoint}) retornou HTTP ${res.status}: ${errText.slice(0, 320)}`);
  }

  const data = await res.json();
  const jobId = `vid_${Date.now().toString(36)}`;
  const rawStatus = String(data.status || 'in_progress').toLowerCase();
  const normalizedStatus =
    rawStatus === 'completed' || rawStatus === 'done'
      ? 'COMPLETED'
      : rawStatus === 'failed' || rawStatus === 'cancelled'
        ? 'FAILED'
        : 'IN_PROGRESS';

  const job = {
    id: jobId,
    providerKey: 'gemini',
    title:
      String(payload.title || '').trim() ||
      (sourceSwipeItem ? `Modelagem ${sourceSwipeItem.id} (Gemini Omni)` : `Gemini Omni — ${new Date().toLocaleTimeString('pt-BR')}`),
    modelKey: model.key,
    modelName: model.name,
    endpoint: model.endpoint,
    swipeItemId: payload.swipeItemId || null,
    prompt,
    resolution,
    duration: String(durationNum),
    aspectRatio,
    status: normalizedStatus,
    requestId: data.id || data.name || jobId,
    statusUrl: data.id ? `${GEMINI_INTERACTIONS_URL}/${encodeURIComponent(data.id)}` : null,
    responseUrl: data.id ? `${GEMINI_INTERACTIONS_URL}/${encodeURIComponent(data.id)}` : null,
    remoteVideoUrl: null,
    localVideoFile: null,
    localVideoUrl: null,
    error: data.error?.message || null,
    createdAt: new Date().toISOString(),
    completedAt: normalizedStatus === 'COMPLETED' ? new Date().toISOString() : null,
  };

  if (normalizedStatus === 'COMPLETED') {
    const vid = extractGeminiInteractionVideo(data);
    if (vid) {
      await saveGeminiVideoOutput(job, vid, geminiKey);
    }
  }

  const jobs = await getStudioJobs();
  jobs.unshift(job);
  await saveStudioJobs(jobs);
  return job;
}

/**
 * Cria e submete um job de modelagem/geração de vídeo (Google Gemini Omni OU fal.ai Seedance/OmniHuman).
 */
export async function createVideoJob(payload) {
  const settings = await loadSettings();
  const catalog = await getStudioModelCatalog();
  const model = catalog.find((m) => m.key === payload.modelKey);
  if (!model) {
    throw new Error(`Modelo inválido: ${payload.modelKey}`);
  }

  if (model.providerKey === 'gemini') {
    return createGeminiOmniJob(payload, model, settings);
  }

  if (!settings.FAL_KEY) {
    throw new Error(
      'FAL_KEY não configurada. Vá em "Config & Automação", cole sua chave da fal.ai (fal.ai/dashboard/keys) e salve.'
    );
  }

  const falKey = settings.FAL_KEY;
  const prompt = String(payload.prompt || '').trim();
  const resolution = String(payload.resolution || '720p');
  const duration = String(payload.duration || '10');
  const aspectRatio = String(payload.aspectRatio || '9:16');
  const generateAudio = payload.generateAudio !== false;

  // Resolve imagem, áudio e vídeo de referência (seja asset local, URL externa ou Reel do Swipe File)
  const imageUrl = await resolveAssetUrlForFal(
    { assetId: payload.imageAssetId, externalUrl: payload.imageUrl },
    falKey
  );
  const audioUrl = await resolveAssetUrlForFal(
    { assetId: payload.audioAssetId, externalUrl: payload.audioUrl },
    falKey
  );

  let videoUrl = await resolveAssetUrlForFal(
    { assetId: payload.videoAssetId, externalUrl: payload.videoUrl },
    falKey
  );

  let sourceSwipeItem = null;
  if (!videoUrl && payload.swipeItemId) {
    const items = await getItems();
    sourceSwipeItem = items.find((i) => i.id === payload.swipeItemId) || null;
    if (sourceSwipeItem) {
      const cachedVideoPath = await ensureCachedMedia(sourceSwipeItem, 'video');
      if (cachedVideoPath) {
        videoUrl = await uploadLocalFileToFal(cachedVideoPath, falKey, 'video/mp4');
      } else if (sourceSwipeItem.videoUrl) {
        videoUrl = sourceSwipeItem.videoUrl;
      }
    }
  } else if (payload.swipeItemId) {
    const items = await getItems();
    sourceSwipeItem = items.find((i) => i.id === payload.swipeItemId) || null;
  }

  // Monta o input específico do modelo escolhido
  let modelInput = {};
  if (model.key === 'omnihuman') {
    if (!imageUrl) throw new Error('OmniHuman v2 precisa de uma Foto do Avatar/Pessoa.');
    if (!audioUrl) throw new Error('OmniHuman v2 precisa de um Áudio (MP3/WAV) da fala.');
    modelInput = {
      image_url: imageUrl,
      audio_url: audioUrl,
      resolution: resolution === '1080p' ? '1080p' : '720p',
    };
  } else if (model.key === 'seedance-ref') {
    if (!prompt) throw new Error('Escreva um prompt descrevendo como modelar o vídeo (você pode citar @Video1, @Image1, @Audio1).');
    modelInput = {
      prompt,
      resolution,
      duration,
      aspect_ratio: aspectRatio,
      generate_audio: generateAudio,
    };
    if (imageUrl) modelInput.image_urls = [imageUrl];
    if (videoUrl) modelInput.video_urls = [videoUrl];
    if (audioUrl) modelInput.audio_urls = [audioUrl];
  } else if (model.key === 'seedance-i2v') {
    if (!imageUrl) throw new Error('Seedance Image-to-Video precisa de uma imagem inicial.');
    modelInput = {
      prompt: prompt || 'Natural vertical smartphone video movement, realistic lighting, subtle camera push-in',
      image_url: imageUrl,
      resolution,
      duration,
      aspect_ratio: aspectRatio,
      generate_audio: generateAudio,
    };
  } else {
    // seedance-t2v
    if (!prompt) throw new Error('Descreva a cena que deseja gerar no campo de Prompt.');
    modelInput = {
      prompt,
      resolution,
      duration,
      aspect_ratio: aspectRatio,
      generate_audio: generateAudio,
    };
  }

  const endpoint = model.endpoint.replace(/^\/+/, '');
  const submitUrl = `${FAL_QUEUE_BASE}/${endpoint}`;

  const res = await fetch(submitUrl, {
    method: 'POST',
    headers: {
      Authorization: `Key ${falKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(modelInput),
    signal: AbortSignal.timeout(45_000),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`fal.ai (${endpoint}) rejeitou a requisição (HTTP ${res.status}): ${errBody.slice(0, 320)}`);
  }

  const queueData = await res.json();
  const jobId = `vid_${Date.now().toString(36)}`;
  const job = {
    id: jobId,
    title:
      String(payload.title || '').trim() ||
      (sourceSwipeItem ? `Modelagem ${sourceSwipeItem.id} (${model.name.split(' ')[0]})` : `${model.name} — ${new Date().toLocaleTimeString('pt-BR')}`),
    modelKey: model.key,
    modelName: model.name,
    endpoint,
    swipeItemId: payload.swipeItemId || null,
    prompt,
    resolution,
    duration,
    aspectRatio,
    status: queueData.status || 'IN_QUEUE',
    requestId: queueData.request_id,
    statusUrl: queueData.status_url || `${FAL_QUEUE_BASE}/${endpoint}/requests/${queueData.request_id}/status`,
    responseUrl: queueData.response_url || `${FAL_QUEUE_BASE}/${endpoint}/requests/${queueData.request_id}`,
    remoteVideoUrl: null,
    localVideoFile: null,
    localVideoUrl: null,
    error: null,
    createdAt: new Date().toISOString(),
    completedAt: null,
  };

  const jobs = await getStudioJobs();
  jobs.unshift(job);
  await saveStudioJobs(jobs);
  return job;
}

/**
 * Consulta o status do job (Google Gemini Omni ou fal.ai) e baixa o MP4 localmente assim que ficar pronto.
 */
export async function refreshVideoJob(jobId) {
  const settings = await loadSettings();
  const jobs = await getStudioJobs();
  const idx = jobs.findIndex((j) => j.id === jobId);
  if (idx === -1) return null;
  const job = jobs[idx];

  if (job.status === 'COMPLETED' && job.localVideoFile) {
    return job;
  }

  // Polling para Google Gemini Omni (Interactions API)
  if (job.providerKey === 'gemini' || job.modelKey === 'gemini-omni') {
    if (!settings.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY não configurada.');
    if (!job.statusUrl) return job;

    const res = await fetch(job.statusUrl, {
      headers: { 'x-goog-api-key': settings.GEMINI_API_KEY },
      signal: AbortSignal.timeout(45_000),
    });
    if (!res.ok) {
      const txt = await res.text();
      job.error = `Erro ao consultar Gemini Omni (HTTP ${res.status}): ${txt.slice(0, 200)}`;
      await saveStudioJobs(jobs);
      return job;
    }
    const data = await res.json();
    const rawStatus = String(data.status || '').toLowerCase();
    if (rawStatus === 'completed' || rawStatus === 'done') {
      job.status = 'COMPLETED';
      job.completedAt = new Date().toISOString();
      const vid = extractGeminiInteractionVideo(data);
      if (vid) {
        await saveGeminiVideoOutput(job, vid, settings.GEMINI_API_KEY);
      } else {
        job.status = 'FAILED';
        job.error = 'Gemini Omni concluiu mas não retornou dados de vídeo na resposta.';
      }
    } else if (rawStatus === 'failed' || rawStatus === 'cancelled') {
      job.status = 'FAILED';
      job.error = data.error?.message || 'Geração falhou no Gemini Omni.';
    } else {
      job.status = 'IN_PROGRESS';
    }
    jobs[idx] = job;
    await saveStudioJobs(jobs);
    return job;
  }

  // Polling para fal.ai (Seedance / OmniHuman)
  if (!settings.FAL_KEY) {
    throw new Error('FAL_KEY não configurada.');
  }

  const statusRes = await fetch(job.statusUrl, {
    headers: { Authorization: `Key ${settings.FAL_KEY}` },
    signal: AbortSignal.timeout(30_000),
  });

  if (!statusRes.ok) {
    const txt = await statusRes.text();
    job.error = `Erro ao consultar status (HTTP ${statusRes.status}): ${txt.slice(0, 180)}`;
    await saveStudioJobs(jobs);
    return job;
  }

  const statusData = await statusRes.json();
  job.status = statusData.status || job.status;
  if (statusData.queue_position !== undefined) {
    job.queuePosition = statusData.queue_position;
  }

  if (job.status === 'COMPLETED') {
    const resultRes = await fetch(job.responseUrl, {
      headers: { Authorization: `Key ${settings.FAL_KEY}` },
      signal: AbortSignal.timeout(45_000),
    });

    if (!resultRes.ok) {
      const txt = await resultRes.text();
      job.status = 'FAILED';
      job.error = `Erro ao buscar resultado (HTTP ${resultRes.status}): ${txt.slice(0, 200)}`;
      await saveStudioJobs(jobs);
      return job;
    }

    const resultData = await resultRes.json();
    const remoteUrl =
      resultData?.video?.url ||
      resultData?.data?.video?.url ||
      resultData?.output?.video?.url ||
      (typeof resultData?.video === 'string' ? resultData.video : null);

    if (!remoteUrl) {
      job.status = 'FAILED';
      job.error = 'A API concluiu mas não retornou uma URL de vídeo.';
      await saveStudioJobs(jobs);
      return job;
    }

    job.remoteVideoUrl = remoteUrl;
    job.completedAt = new Date().toISOString();

    // Baixa o MP4 gerado para cache local permanente em data/studio/outputs/
    try {
      await ensureStudioDirs();
      const videoRes = await fetch(remoteUrl, { signal: AbortSignal.timeout(120_000) });
      if (videoRes.ok) {
        const buf = Buffer.from(await videoRes.arrayBuffer());
        const fileName = `${job.id}.mp4`;
        await fs.writeFile(path.join(STUDIO_OUTPUTS_DIR, fileName), buf);
        job.localVideoFile = fileName;
        job.localVideoUrl = `/api/studio/media/outputs/${encodeURIComponent(fileName)}`;
      }
    } catch (dlErr) {
      console.warn(`[video-studio] Falha ao baixar MP4 local de ${job.id}: ${dlErr.message}`);
    }
  } else if (job.status === 'FAILED' || job.status === 'CANCELLED') {
    job.error = statusData.error || 'A geração falhou na fila da fal.ai.';
  }

  jobs[idx] = job;
  await saveStudioJobs(jobs);
  return job;
}

export async function deleteVideoJob(jobId) {
  const jobs = await getStudioJobs();
  const target = jobs.find((j) => j.id === jobId);
  if (!target) return false;
  const next = jobs.filter((j) => j.id !== jobId);
  await saveStudioJobs(next);
  if (target.localVideoFile) {
    await fs.unlink(path.join(STUDIO_OUTPUTS_DIR, path.basename(target.localVideoFile))).catch(() => {});
  }
  return true;
}
