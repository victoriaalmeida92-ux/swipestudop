import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { ROOT_DIR } from './env.mjs';

export const MEDIA_DIR = path.join(ROOT_DIR, 'data', 'media');

const inFlightDownloads = new Map();

function safeId(itemId) {
  return String(itemId || '').replace(/[^a-zA-Z0-9_-]/g, '');
}

export function getMediaPaths(itemId) {
  const id = safeId(itemId);
  return {
    thumbPath: path.join(MEDIA_DIR, `${id}.thumb`),
    videoPath: path.join(MEDIA_DIR, `${id}.mp4`),
  };
}

async function fileExistsNonEmpty(filePath) {
  try {
    const st = await fsp.stat(filePath);
    return st.size > 0;
  } catch {
    return false;
  }
}

async function downloadToFile(url, destPath) {
  await fsp.mkdir(MEDIA_DIR, { recursive: true });
  const tempPath = `${destPath}.tmp_${Date.now()}`;

  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        Accept: '*/*',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(45_000),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }

    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) {
      throw new Error('Arquivo vazio');
    }

    await fsp.writeFile(tempPath, buf);
    await fsp.rename(tempPath, destPath);
    return destPath;
  } catch (err) {
    await fsp.unlink(tempPath).catch(() => {});
    throw err;
  }
}

/**
 * Garante que a mídia (thumb ou video) esteja salva em cache local em data/media/
 * para evitar bloqueio de CORS do Instagram CDN e expiração de URLs assinadas.
 */
export async function ensureCachedMedia(item, kind) {
  if (!item?.id) return null;
  const { thumbPath, videoPath } = getMediaPaths(item.id);
  const destPath = kind === 'video' ? videoPath : thumbPath;
  const sourceUrl = kind === 'video' ? item.videoUrl : item.thumbnailUrl;

  if (await fileExistsNonEmpty(destPath)) {
    return destPath;
  }
  if (!sourceUrl) {
    return null;
  }

  const lockKey = `${item.id}:${kind}`;
  if (inFlightDownloads.has(lockKey)) {
    return inFlightDownloads.get(lockKey);
  }

  const promise = downloadToFile(sourceUrl, destPath)
    .catch((err) => {
      console.warn(`[media] Falha ao baixar ${kind} de ${item.id}: ${err.message}`);
      return null;
    })
    .finally(() => {
      inFlightDownloads.delete(lockKey);
    });

  inFlightDownloads.set(lockKey, promise);
  return promise;
}

/**
 * Baixa capa e vídeo em background logo após coleta da Apify (enquanto os links ainda estão frescos).
 */
export async function prefetchMediaForItem(item) {
  if (!item?.id) return;
  await Promise.allSettled([
    item.thumbnailUrl ? ensureCachedMedia(item, 'thumb') : Promise.resolve(),
    item.videoUrl ? ensureCachedMedia(item, 'video') : Promise.resolve(),
  ]);
}

export async function deleteMediaForItem(itemId) {
  const { thumbPath, videoPath } = getMediaPaths(itemId);
  await Promise.allSettled([
    fsp.unlink(thumbPath).catch(() => {}),
    fsp.unlink(videoPath).catch(() => {}),
  ]);
}

export function detectImageContentType(filePath) {
  try {
    const fd = fs.openSync(filePath, 'r');
    const header = Buffer.alloc(16);
    fs.readSync(fd, header, 0, 16, 0);
    fs.closeSync(fd);

    if (header[0] === 0xff && header[1] === 0xd8) return 'image/jpeg';
    if (header[0] === 0x89 && header[1] === 0x50) return 'image/png';
    if (header.subarray(0, 4).toString('ascii') === 'RIFF' && header.subarray(8, 12).toString('ascii') === 'WEBP') {
      return 'image/webp';
    }
    if (header.subarray(4, 8).toString('ascii') === 'ftyp') {
      const brand = header.subarray(8, 12).toString('ascii');
      if (brand.includes('avif')) return 'image/avif';
    }
  } catch {
    // fallback
  }
  return 'image/jpeg';
}
