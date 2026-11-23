import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { ROOT_DIR } from './env.mjs';
import { getItems } from './store.mjs';
import { ensureCachedMedia } from './media.mjs';
import {
  ensureStudioDirs,
  getStudioJobs,
  STUDIO_ASSETS_DIR,
  STUDIO_OUTPUTS_DIR,
  STUDIO_RENDERS_DIR,
} from './video-studio.mjs';

const execFileAsync = promisify(execFile);
const RENDERS_FILE = path.join(ROOT_DIR, 'data', 'studio-renders.json');

export const CAPTION_PRESETS = {
  'viral-yellow': {
    label: 'Amarelo Viral (Reels/TikTok)',
    fontName: 'Arial',
    primaryColour: '&H0000E5FF', // BGR para amarelo vibrante
    outlineColour: '&H00000000',
    backColour: '&H64000000',
    bold: 1,
    borderStyle: 1,
    outline: 5,
    shadow: 2,
  },
  'clean-white': {
    label: 'Branco Clean c/ Contorno',
    fontName: 'Arial',
    primaryColour: '&H00FFFFFF',
    outlineColour: '&H00000000',
    backColour: '&H64000000',
    bold: 1,
    borderStyle: 1,
    outline: 4,
    shadow: 1,
  },
  'dark-box': {
    label: 'Caixa Escura Moderna',
    fontName: 'Arial',
    primaryColour: '&H00FFFFFF',
    outlineColour: '&HAA000000',
    backColour: '&HAA000000',
    bold: 1,
    borderStyle: 3,
    outline: 10,
    shadow: 0,
  },
};

export async function checkFfmpegAvailable() {
  try {
    await execFileAsync('ffmpeg', ['-version'], { timeout: 5000 });
    return true;
  } catch {
    return false;
  }
}

export async function getStudioRenders() {
  await ensureStudioDirs();
  try {
    const raw = await fs.readFile(RENDERS_FILE, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    if (err.code === 'ENOENT') {
      await fs.writeFile(RENDERS_FILE, '[]', 'utf8');
      return [];
    }
    throw err;
  }
}

async function saveStudioRenders(renders) {
  await ensureStudioDirs();
  await fs.writeFile(RENDERS_FILE, JSON.stringify(renders, null, 2), 'utf8');
  return renders;
}

export async function resolveVideoSourceFile(sourceType, sourceId) {
  if (sourceType === 'studio-job') {
    const jobs = await getStudioJobs();
    const job = jobs.find((j) => j.id === sourceId);
    if (!job || !job.localVideoFile) {
      throw new Error('Vídeo do Studio ainda não está concluído ou baixado localmente.');
    }
    return {
      filePath: path.join(STUDIO_OUTPUTS_DIR, path.basename(job.localVideoFile)),
      label: job.title,
    };
  }

  if (sourceType === 'swipe-item') {
    const items = await getItems();
    const item = items.find((i) => i.id === sourceId);
    if (!item) throw new Error('Item do Swipe File não encontrado.');
    const cached = await ensureCachedMedia(item, 'video');
    if (!cached) throw new Error('Vídeo desse Reel não está disponível para edição.');
    return {
      filePath: cached,
      label: `${item.id} — ${item.title}`,
    };
  }

  if (sourceType === 'asset') {
    const clean = path.basename(String(sourceId || ''));
    const full = path.join(STUDIO_ASSETS_DIR, clean);
    await fs.access(full);
    return { filePath: full, label: clean };
  }

  throw new Error('Selecione um vídeo de origem válido.');
}

export async function probeVideoDuration(filePath) {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'default=noprint_wrappers=1:nokey=1', filePath],
      { timeout: 15_000 }
    );
    const dur = parseFloat(stdout.trim());
    return Number.isFinite(dur) && dur > 0 ? dur : 15;
  } catch {
    return 15;
  }
}

function formatSrtTime(sec) {
  const s = Math.max(0, sec);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  return `${String(hrs).padStart(2, '0')}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(
    Math.min(999, ms)
  ).padStart(3, '0')}`;
}

function formatAssTime(sec) {
  const s = Math.max(0, sec);
  const hrs = Math.floor(s / 3600);
  const mins = Math.floor((s % 3600) / 60);
  const secs = Math.floor(s % 60);
  const cs = Math.min(99, Math.round((s - Math.floor(s)) * 100));
  return `${hrs}:${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}

function parseTimecodeToSec(tc) {
  const m = String(tc || '').trim().match(/^(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})$/);
  if (!m) return 0;
  const h = Number(m[1]);
  const min = Number(m[2]);
  const s = Number(m[3]);
  const ms = Number(m[4].padEnd(3, '0'));
  return h * 3600 + min * 60 + s + ms / 1000;
}

/**
 * Quebra um roteiro/texto falado em blocos curtos estilo Reels (3-4 palavras) com timestamps proporcionais.
 */
export function autoSplitScriptToSrt(scriptText, durationSec = 15, wordsPerCue = 4) {
  const clean = String(scriptText || '')
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';

  const words = clean.split(' ');
  const chunkSize = Math.max(2, Math.min(8, Number(wordsPerCue) || 4));
  const chunks = [];
  for (let i = 0; i < words.length; i += chunkSize) {
    chunks.push(words.slice(i, i + chunkSize).join(' '));
  }

  const totalDur = Math.max(2, Number(durationSec) || 15);
  const startOffset = 0.25;
  const usable = Math.max(1.5, totalDur - 0.5);
  const totalChars = chunks.reduce((sum, c) => sum + c.length, 0) || 1;

  let cursor = startOffset;
  const blocks = chunks.map((text, idx) => {
    const share = (text.length / totalChars) * usable;
    const start = cursor;
    const end = idx === chunks.length - 1 ? Math.min(totalDur - 0.1, start + share) : start + share - 0.04;
    cursor = start + share;
    return `${idx + 1}\n${formatSrtTime(start)} --> ${formatSrtTime(Math.max(start + 0.3, end))}\n${text}`;
  });

  return blocks.join('\n\n') + '\n';
}

export function parseSrt(srtText) {
  const normalized = String(srtText || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const blocks = normalized.split(/\n{2,}/);
  const cues = [];
  for (const block of blocks) {
    const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) continue;
    const timeLineIdx = lines.findIndex((l) => l.includes('-->'));
    if (timeLineIdx === -1) continue;
    const [startRaw, endRaw] = lines[timeLineIdx].split('-->');
    const text = lines.slice(timeLineIdx + 1).join('\\N');
    if (!text) continue;
    cues.push({
      start: parseTimecodeToSec(startRaw),
      end: parseTimecodeToSec(endRaw),
      text,
    });
  }
  return cues;
}

function buildAssContent(cues, { stylePreset = 'viral-yellow', fontSize = 68, position = 'bottom' } = {}) {
  const p = CAPTION_PRESETS[stylePreset] || CAPTION_PRESETS['viral-yellow'];
  const size = Math.max(32, Math.min(110, Number(fontSize) || 68));
  const alignment = position === 'top' ? 8 : position === 'center' ? 5 : 2;
  const marginV = position === 'bottom' ? 240 : position === 'top' ? 180 : 60;

  const header = `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
WrapStyle: 0

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: Default,${p.fontName},${size},${p.primaryColour},&H000000FF,${p.outlineColour},${p.backColour},${p.bold},0,0,0,100,100,0,0,${p.borderStyle},${p.outline},${p.shadow},${alignment},70,70,${marginV},1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
`;

  const events = cues
    .map((c) => {
      const safeText = c.text.replace(/[{}]/g, '');
      return `Dialogue: 0,${formatAssTime(c.start)},${formatAssTime(c.end)},Default,,0,0,0,,${safeText}`;
    })
    .join('\n');

  return header + events + '\n';
}

/**
 * Queima legendas estilizadas no MP4 usando FFmpeg local e salva em data/studio/renders/.
 */
export async function renderSubtitledVideo({
  sourceType,
  sourceId,
  srtText,
  stylePreset = 'viral-yellow',
  fontSize = 68,
  position = 'bottom',
  title = '',
}) {
  await ensureStudioDirs();
  const hasFfmpeg = await checkFfmpegAvailable();
  if (!hasFfmpeg) {
    throw new Error('FFmpeg não encontrado no sistema.');
  }

  const cues = parseSrt(srtText);
  if (!cues.length) {
    throw new Error('As legendas em formato SRT estão vazias ou sem timestamps válidos (ex: 00:00:00,500 --> 00:00:02,500).');
  }

  const { filePath: inputPath, label } = await resolveVideoSourceFile(sourceType, sourceId);
  const renderId = `rnd_${Date.now().toString(36)}`;
  const assFileName = `${renderId}.ass`;
  const srtFileName = `${renderId}.srt`;
  const mp4FileName = `${renderId}.mp4`;

  const assFullPath = path.join(STUDIO_RENDERS_DIR, assFileName);
  const srtFullPath = path.join(STUDIO_RENDERS_DIR, srtFileName);
  const mp4FullPath = path.join(STUDIO_RENDERS_DIR, mp4FileName);

  const assContent = buildAssContent(cues, { stylePreset, fontSize, position });
  await Promise.all([
    fs.writeFile(assFullPath, assContent, 'utf8'),
    fs.writeFile(srtFullPath, String(srtText).trim() + '\n', 'utf8'),
  ]);

  try {
    // Executa FFmpeg com cwd=STUDIO_RENDERS_DIR para usar caminho relativo no filtro ass= (evita problemas de C:\ no Windows!)
    await execFileAsync(
      'ffmpeg',
      [
        '-y',
        '-i',
        inputPath,
        '-vf',
        `ass=${assFileName}`,
        '-c:v',
        'libx264',
        '-preset',
        'fast',
        '-crf',
        '20',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'copy',
        '-movflags',
        '+faststart',
        mp4FullPath,
      ],
      { cwd: STUDIO_RENDERS_DIR, timeout: 180_000 }
    );
  } catch (err) {
    await fs.unlink(mp4FullPath).catch(() => {});
    throw new Error(`Erro ao renderizar legendas com FFmpeg: ${err.stderr?.slice(-280) || err.message}`);
  } finally {
    await fs.unlink(assFullPath).catch(() => {});
  }

  const renderEntry = {
    id: renderId,
    title: String(title || '').trim() || `Legendado — ${label}`,
    sourceType,
    sourceId,
    stylePreset,
    cuesCount: cues.length,
    mp4FileName,
    srtFileName,
    videoUrl: `/api/studio/media/renders/${encodeURIComponent(mp4FileName)}`,
    srtUrl: `/api/studio/media/renders/${encodeURIComponent(srtFileName)}`,
    createdAt: new Date().toISOString(),
  };

  const renders = await getStudioRenders();
  renders.unshift(renderEntry);
  await saveStudioRenders(renders.slice(0, 40));
  return renderEntry;
}

export async function deleteStudioRender(renderId) {
  const renders = await getStudioRenders();
  const target = renders.find((r) => r.id === renderId);
  if (!target) return false;
  const next = renders.filter((r) => r.id !== renderId);
  await saveStudioRenders(next);
  if (target.mp4FileName) {
    await fs.unlink(path.join(STUDIO_RENDERS_DIR, path.basename(target.mp4FileName))).catch(() => {});
  }
  if (target.srtFileName) {
    await fs.unlink(path.join(STUDIO_RENDERS_DIR, path.basename(target.srtFileName))).catch(() => {});
  }
  return true;
}
