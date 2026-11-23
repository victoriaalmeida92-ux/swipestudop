import http from 'node:http';
import fsSync from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { getPublicSettings, loadSettings, saveSettings } from './lib/env.mjs';
import { detectImageContentType, ensureCachedMedia, MEDIA_DIR } from './lib/media.mjs';
import {
  addProfile,
  createItem,
  deleteItem,
  deleteProfile,
  getBrandDna,
  getItems,
  getProfiles,
  getSyncLogs,
  getUniqueNiches,
  rescoreNicheItems,
  reviewItem,
  saveBrandDna,
  syncMarkdownLibrary,
  updateItem,
  updateProfile,
} from './lib/store.mjs';
import { syncWithApify } from './lib/apify.mjs';
import { analyzeSwipeItem, FUNNEL_STAGES, HOOK_TYPES } from './lib/ai-analyzer.mjs';
import {
  createDefaultNicheModel,
  getCurationStore,
  getTopLearnedTerms,
  updateNicheModelConfig,
} from './lib/curation.mjs';
import {
  approveCandidate,
  discoverProfilesForNiche,
  dismissCandidate,
  getDiscoveryState,
} from './lib/discovery.mjs';
import {
  createVideoJob,
  deleteVideoJob,
  getStudioJobs,
  getStudioModelCatalog,
  refreshVideoJob,
  saveStudioAsset,
  STUDIO_ASSETS_DIR,
  STUDIO_OUTPUTS_DIR,
  STUDIO_RENDERS_DIR,
} from './lib/video-studio.mjs';
import {
  autoSplitScriptToSrt,
  CAPTION_PRESETS,
  checkFfmpegAvailable,
  deleteStudioRender,
  getStudioRenders,
  probeVideoDuration,
  renderSubtitledVideo,
  resolveVideoSourceFile,
} from './lib/subtitles.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
};

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

async function readJsonBody(req, maxBytes = 2_000_000) {
  const chunks = [];
  let total = 0;
  for await (const chunk of req) {
    total += chunk.length;
    if (total > maxBytes) {
      throw new Error(`Payload excedeu o limite de ${Math.round(maxBytes / 1_000_000)}MB.`);
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim();
  if (!raw) return {};
  return JSON.parse(raw);
}

async function streamFileWithRange(req, res, filePath, contentType) {
  const stat = await fs.stat(filePath);
  const total = stat.size;
  const method = req.method || 'GET';
  const range = req.headers.range;

  if (range && contentType.startsWith('video/')) {
    const match = /^bytes=(\d*)-(\d*)$/.exec(range);
    if (!match) {
      res.writeHead(416, { 'Content-Range': `bytes */${total}` });
      res.end();
      return;
    }
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
    if (start >= total || start > end) {
      res.writeHead(416, { 'Content-Range': `bytes */${total}` });
      res.end();
      return;
    }
    const chunkSize = end - start + 1;
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${total}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=86400',
    });
    if (method === 'HEAD') {
      res.end();
      return;
    }
    fsSync.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, {
    'Accept-Ranges': 'bytes',
    'Content-Length': total,
    'Content-Type': contentType,
    'Cache-Control': 'public, max-age=86400',
  });
  if (method === 'HEAD') {
    res.end();
    return;
  }
  fsSync.createReadStream(filePath).pipe(res);
}

let isSyncRunning = false;

async function handleApi(req, res, urlObj) {
  const method = req.method || 'GET';
  const pathname = urlObj.pathname;

  try {
    // Bootstrap completo para carregar o Dashboard em 1 chamada
    if (method === 'GET' && pathname === '/api/bootstrap') {
      const [
        brandDna,
        profiles,
        items,
        syncLogs,
        settings,
        curationStore,
        discoveryState,
        studioJobs,
        studioRenders,
        studioModels,
        hasFfmpeg,
      ] = await Promise.all([
        getBrandDna(),
        getProfiles(),
        getItems(),
        getSyncLogs(),
        getPublicSettings(),
        getCurationStore(),
        getDiscoveryState(),
        getStudioJobs(),
        getStudioRenders(),
        getStudioModelCatalog(),
        checkFfmpegAvailable(),
      ]);
      const niches = getUniqueNiches(profiles, items);
      const curationModels = {};
      for (const n of niches) {
        const base = curationStore.models?.[n]
          ? { ...createDefaultNicheModel(n), ...curationStore.models[n] }
          : createDefaultNicheModel(n);
        curationModels[n] = {
          ...base,
          topLearned: getTopLearnedTerms(base, 14),
        };
      }
      return sendJson(res, 200, {
        brandDna,
        profiles,
        items,
        syncLogs,
        settings,
        curation: { models: curationModels },
        discovery: {
          candidates: discoveryState.candidates || [],
          dismissedCount: (discoveryState.dismissedHandles || []).length,
          lastDiscoveryAt: discoveryState.lastDiscoveryAt || null,
        },
        studio: {
          jobs: studioJobs,
          renders: studioRenders,
          models: studioModels,
          captionPresets: CAPTION_PRESETS,
          hasFfmpeg,
        },
        meta: {
          hookTypes: HOOK_TYPES,
          funnelStages: FUNNEL_STAGES,
          niches,
          isSyncRunning,
        },
      });
    }

    // Brand DNA
    if (method === 'GET' && pathname === '/api/brand-dna') {
      return sendJson(res, 200, await getBrandDna());
    }
    if (method === 'PUT' && pathname === '/api/brand-dna') {
      const body = await readJsonBody(req);
      return sendJson(res, 200, await saveBrandDna(body));
    }

    // Profiles
    if (method === 'GET' && pathname === '/api/profiles') {
      return sendJson(res, 200, await getProfiles());
    }
    if (method === 'POST' && pathname === '/api/profiles') {
      const body = await readJsonBody(req);
      const created = await addProfile(body);
      return sendJson(res, 201, created);
    }
    const profileMatch = pathname.match(/^\/api\/profiles\/([^/]+)$/);
    if (profileMatch) {
      const id = decodeURIComponent(profileMatch[1]);
      if (method === 'PATCH' || method === 'PUT') {
        const body = await readJsonBody(req);
        const updated = await updateProfile(id, body);
        if (!updated) return sendJson(res, 404, { error: 'Perfil não encontrado.' });
        return sendJson(res, 200, updated);
      }
      if (method === 'DELETE') {
        const removed = await deleteProfile(id);
        if (!removed) return sendJson(res, 404, { error: 'Perfil não encontrado.' });
        return sendJson(res, 200, { ok: true });
      }
    }

    // Swipe Items
    if (method === 'GET' && pathname === '/api/items') {
      return sendJson(res, 200, await getItems());
    }
    if (method === 'POST' && pathname === '/api/items') {
      const body = await readJsonBody(req);
      const created = await createItem(body);
      return sendJson(res, 201, created);
    }

    const analyzeMatch = pathname.match(/^\/api\/items\/([^/]+)\/analyze$/);
    if (analyzeMatch && method === 'POST') {
      const id = decodeURIComponent(analyzeMatch[1]);
      const items = await getItems();
      const target = items.find((i) => i.id === id);
      if (!target) return sendJson(res, 404, { error: 'Item não encontrado.' });
      const brandDna = await getBrandDna();
      const analysis = await analyzeSwipeItem(target, brandDna);
      const updated = await updateItem(id, analysis);
      return sendJson(res, 200, updated);
    }

    const reviewMatch = pathname.match(/^\/api\/items\/([^/]+)\/review$/);
    if (reviewMatch && method === 'POST') {
      const id = decodeURIComponent(reviewMatch[1]);
      const body = await readJsonBody(req);
      const result = await reviewItem(id, {
        reviewStatus: body.reviewStatus,
        reviewReason: body.reviewReason || '',
      });
      if (!result) return sendJson(res, 404, { error: 'Item não encontrado.' });
      return sendJson(res, 200, result);
    }

    // Curation / Treinamento do Algoritmo por Nicho
    const curationRescoreMatch = pathname.match(/^\/api\/curation\/([^/]+)\/rescore$/);
    if (curationRescoreMatch && method === 'POST') {
      const niche = decodeURIComponent(curationRescoreMatch[1]);
      const body = await readJsonBody(req);
      const result = await rescoreNicheItems(niche, { applyAutoFilter: Boolean(body.applyAutoFilter) });
      return sendJson(res, 200, result);
    }

    const curationMatch = pathname.match(/^\/api\/curation\/([^/]+)$/);
    if (curationMatch && (method === 'PUT' || method === 'PATCH')) {
      const niche = decodeURIComponent(curationMatch[1]);
      const body = await readJsonBody(req);
      await updateNicheModelConfig(niche, body);
      const result = await rescoreNicheItems(niche, { applyAutoFilter: Boolean(body.applyAutoFilter) });
      return sendJson(res, 200, result);
    }

    // Radar de Perfis (Descoberta Automática)
    if (method === 'POST' && pathname === '/api/discovery/search') {
      const body = await readJsonBody(req);
      const result = await discoverProfilesForNiche({
        niche: body.niche,
        limit: body.limit || 5,
        customQuery: body.customQuery || '',
      });
      return sendJson(res, 200, result);
    }

    const candApproveMatch = pathname.match(/^\/api\/discovery\/candidates\/([^/]+)\/approve$/);
    if (candApproveMatch && method === 'POST') {
      const id = decodeURIComponent(candApproveMatch[1]);
      const body = await readJsonBody(req);
      const result = await approveCandidate(id, body);
      return sendJson(res, 200, result);
    }

    const candDismissMatch = pathname.match(/^\/api\/discovery\/candidates\/([^/]+)\/dismiss$/);
    if (candDismissMatch && method === 'POST') {
      const id = decodeURIComponent(candDismissMatch[1]);
      const result = await dismissCandidate(id);
      return sendJson(res, 200, result);
    }

    // Studio de Vídeo (OmniHuman + Seedance via fal.ai) & Editor de Legendas (FFmpeg + Google Vids)
    if (method === 'POST' && pathname === '/api/studio/upload') {
      const body = await readJsonBody(req, 52_000_000);
      const saved = await saveStudioAsset(body);
      return sendJson(res, 201, saved);
    }

    if (method === 'POST' && pathname === '/api/studio/jobs') {
      const body = await readJsonBody(req);
      const job = await createVideoJob(body);
      return sendJson(res, 201, job);
    }

    const jobRefreshMatch = pathname.match(/^\/api\/studio\/jobs\/([^/]+)\/refresh$/);
    if (jobRefreshMatch && method === 'POST') {
      const id = decodeURIComponent(jobRefreshMatch[1]);
      const job = await refreshVideoJob(id);
      if (!job) return sendJson(res, 404, { error: 'Job não encontrado.' });
      return sendJson(res, 200, job);
    }

    const jobDeleteMatch = pathname.match(/^\/api\/studio\/jobs\/([^/]+)$/);
    if (jobDeleteMatch && method === 'DELETE') {
      const id = decodeURIComponent(jobDeleteMatch[1]);
      const removed = await deleteVideoJob(id);
      if (!removed) return sendJson(res, 404, { error: 'Job não encontrado.' });
      return sendJson(res, 200, { ok: true });
    }

    if (method === 'POST' && pathname === '/api/studio/subtitles/auto-split') {
      const body = await readJsonBody(req);
      let durationSec = Number(body.durationSec) || 15;
      if (body.sourceType && body.sourceId) {
        try {
          const { filePath } = await resolveVideoSourceFile(body.sourceType, body.sourceId);
          durationSec = await probeVideoDuration(filePath);
        } catch {
          // fallback para duração padrão
        }
      }
      const srt = autoSplitScriptToSrt(body.scriptText || '', durationSec, body.wordsPerCue || 4);
      return sendJson(res, 200, { srt, durationSec: Math.round(durationSec * 10) / 10 });
    }

    if (method === 'POST' && pathname === '/api/studio/subtitles/render') {
      const body = await readJsonBody(req);
      const render = await renderSubtitledVideo(body);
      return sendJson(res, 201, render);
    }

    const renderDeleteMatch = pathname.match(/^\/api\/studio\/renders\/([^/]+)$/);
    if (renderDeleteMatch && method === 'DELETE') {
      const id = decodeURIComponent(renderDeleteMatch[1]);
      const removed = await deleteStudioRender(id);
      if (!removed) return sendJson(res, 404, { error: 'Render não encontrado.' });
      return sendJson(res, 200, { ok: true });
    }

    if (method === 'POST' && pathname === '/api/studio/open-folder') {
      const body = await readJsonBody(req);
      const targetMap = {
        outputs: STUDIO_OUTPUTS_DIR,
        renders: STUDIO_RENDERS_DIR,
        media: MEDIA_DIR,
      };
      const dir = targetMap[body.folder] || STUDIO_OUTPUTS_DIR;
      await fs.mkdir(dir, { recursive: true });
      if (process.platform === 'win32') {
        execFile('explorer.exe', [dir], () => {});
      }
      return sendJson(res, 200, { ok: true, path: dir });
    }

    const studioMediaMatch = pathname.match(/^\/api\/studio\/media\/(assets|outputs|renders)\/([^/]+)$/);
    if (studioMediaMatch && (method === 'GET' || method === 'HEAD')) {
      const kind = studioMediaMatch[1];
      const fileName = path.basename(decodeURIComponent(studioMediaMatch[2]));
      const baseDir =
        kind === 'outputs' ? STUDIO_OUTPUTS_DIR : kind === 'renders' ? STUDIO_RENDERS_DIR : STUDIO_ASSETS_DIR;
      const fullPath = path.join(baseDir, fileName);
      if (!fullPath.startsWith(baseDir)) {
        res.writeHead(403);
        res.end('Forbidden');
        return;
      }
      try {
        await fs.access(fullPath);
      } catch {
        res.writeHead(404);
        res.end('Arquivo não encontrado');
        return;
      }
      const ext = path.extname(fileName).toLowerCase();
      const ctMap = {
        '.mp4': 'video/mp4',
        '.mov': 'video/quicktime',
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.m4a': 'audio/mp4',
        '.png': 'image/png',
        '.jpg': 'image/jpeg',
        '.jpeg': 'image/jpeg',
        '.webp': 'image/webp',
        '.srt': 'text/plain; charset=utf-8',
      };
      await streamFileWithRange(req, res, fullPath, ctMap[ext] || 'application/octet-stream');
      return;
    }

    const itemMatch = pathname.match(/^\/api\/items\/([^/]+)$/);
    if (itemMatch) {
      const id = decodeURIComponent(itemMatch[1]);
      if (method === 'PATCH' || method === 'PUT') {
        const body = await readJsonBody(req);
        const updated = await updateItem(id, body);
        if (!updated) return sendJson(res, 404, { error: 'Item não encontrado.' });
        return sendJson(res, 200, updated);
      }
      if (method === 'DELETE') {
        const removed = await deleteItem(id);
        if (!removed) return sendJson(res, 404, { error: 'Item não encontrado.' });
        return sendJson(res, 200, { ok: true });
      }
    }

    // Sync Apify
    if (method === 'POST' && pathname === '/api/sync') {
      if (isSyncRunning) {
        return sendJson(res, 409, { error: 'Já existe uma sincronização em andamento. Aguarde concluir.' });
      }
      const body = await readJsonBody(req);
      isSyncRunning = true;
      try {
        const result = await syncWithApify({
          profileId: body.profileId || null,
          niche: body.niche || null,
        });
        return sendJson(res, 200, result);
      } finally {
        isSyncRunning = false;
      }
    }

    if (method === 'GET' && pathname === '/api/sync-logs') {
      return sendJson(res, 200, await getSyncLogs());
    }

    // Media Proxy & Cache Local (Thumb + Vídeo MP4 com Range Requests)
    const mediaMatch = pathname.match(/^\/api\/media\/([^/]+)\/(thumb|video)$/);
    if (mediaMatch && (method === 'GET' || method === 'HEAD')) {
      const id = decodeURIComponent(mediaMatch[1]);
      const kind = mediaMatch[2];
      const items = await getItems();
      const target = items.find((i) => i.id === id);
      if (!target) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Item não encontrado');
        return;
      }

      const filePath = await ensureCachedMedia(target, kind);
      if (!filePath) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Mídia indisponível ou expirada');
        return;
      }

      const stat = await fs.stat(filePath);
      if (kind === 'thumb') {
        const contentType = detectImageContentType(filePath);
        res.writeHead(200, {
          'Content-Type': contentType,
          'Content-Length': stat.size,
          'Cache-Control': 'public, max-age=86400',
        });
        if (method === 'HEAD') {
          res.end();
          return;
        }
        fsSync.createReadStream(filePath).pipe(res);
        return;
      }

      // Video streaming com suporte a HTTP Range (seek/scrub)
      const total = stat.size;
      const range = req.headers.range;
      if (range) {
        const match = /^bytes=(\d*)-(\d*)$/.exec(range);
        if (!match) {
          res.writeHead(416, { 'Content-Range': `bytes */${total}` });
          res.end();
          return;
        }
        const start = match[1] ? Number(match[1]) : 0;
        const end = match[2] ? Math.min(Number(match[2]), total - 1) : total - 1;
        if (start >= total || start > end) {
          res.writeHead(416, { 'Content-Range': `bytes */${total}` });
          res.end();
          return;
        }
        const chunkSize = end - start + 1;
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${total}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': 'video/mp4',
          'Cache-Control': 'public, max-age=86400',
        });
        if (method === 'HEAD') {
          res.end();
          return;
        }
        fsSync.createReadStream(filePath, { start, end }).pipe(res);
        return;
      }

      res.writeHead(200, {
        'Accept-Ranges': 'bytes',
        'Content-Length': total,
        'Content-Type': 'video/mp4',
        'Cache-Control': 'public, max-age=86400',
      });
      if (method === 'HEAD') {
        res.end();
        return;
      }
      fsSync.createReadStream(filePath).pipe(res);
      return;
    }

    // Settings (.env)
    if (method === 'GET' && pathname === '/api/settings') {
      return sendJson(res, 200, await getPublicSettings());
    }
    if (method === 'PUT' && pathname === '/api/settings') {
      const body = await readJsonBody(req);
      return sendJson(res, 200, await saveSettings(body));
    }

    return sendJson(res, 404, { error: 'Rota de API não encontrada.' });
  } catch (err) {
    console.error(`[API Error] ${method} ${pathname}:`, err);
    return sendJson(res, 400, { error: err.message || 'Erro interno ao processar requisição.' });
  }
}

async function handleStatic(req, res, urlObj) {
  let reqPath = urlObj.pathname === '/' ? '/index.html' : urlObj.pathname;
  reqPath = path.normalize(reqPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = path.join(PUBLIC_DIR, reqPath);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(data);
  } catch (err) {
    if (err.code === 'ENOENT') {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Arquivo não encontrado');
      return;
    }
    res.writeHead(500);
    res.end('Erro interno');
  }
}

async function start() {
  await syncMarkdownLibrary();
  const settings = await loadSettings();
  const port = Number(settings.PORT) || 3456;

  const server = http.createServer(async (req, res) => {
    const urlObj = new URL(req.url || '/', `http://127.0.0.1:${port}`);
    if (urlObj.pathname.startsWith('/api/')) {
      return handleApi(req, res, urlObj);
    }
    return handleStatic(req, res, urlObj);
  });

  server.listen(port, '127.0.0.1', () => {
    console.log('');
    console.log('==============================================================');
    console.log('  SWIPE STUDIO — Auxiliar de Produção de Conteúdo & Swipe File');
    console.log(`  Dashboard local: http://127.0.0.1:${port}`);
    console.log('  Biblioteca IA (Markdown): ./library/');
    console.log('==============================================================');
    console.log('');
  });
}

start().catch((err) => {
  console.error('Falha ao iniciar servidor:', err);
  process.exit(1);
});
