import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const ROOT_DIR = path.resolve(__dirname, '..');
export const ENV_PATH = path.join(ROOT_DIR, '.env');

const DEFAULT_SETTINGS = {
  APIFY_TOKEN: '',
  APIFY_REELS_ACTOR: 'apify~instagram-reel-scraper',
  APIFY_STORIES_ACTOR: '',
  GEMINI_API_KEY: '',
  GEMINI_MODEL: 'gemini-2.5-flash',
  GEMINI_OMNI_MODEL: 'gemini-omni-1.2-flash',
  FAL_KEY: '',
  FAL_OMNIHUMAN_MODEL: 'bytedance/omnihuman/v2',
  FAL_SEEDANCE_REF_MODEL: 'bytedance/seedance-2.0/reference-to-video',
  FAL_SEEDANCE_I2V_MODEL: 'bytedance/seedance-2.0/fast/image-to-video',
  FAL_SEEDANCE_T2V_MODEL: 'bytedance/seedance-2.0/fast/text-to-video',
  PORT: '3456',
  DEFAULT_MAX_ITEMS_PER_PROFILE: '10',
};

export function parseEnvContent(content) {
  const result = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eqIdx = line.indexOf('=');
    if (eqIdx === -1) continue;
    const key = line.slice(0, eqIdx).trim();
    let value = line.slice(eqIdx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    result[key] = value;
  }
  return result;
}

export async function loadSettings() {
  let fileVars = {};
  try {
    const raw = await fs.readFile(ENV_PATH, 'utf8');
    fileVars = parseEnvContent(raw);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }

  const merged = { ...DEFAULT_SETTINGS };
  for (const key of Object.keys(DEFAULT_SETTINGS)) {
    if (fileVars[key] !== undefined && fileVars[key] !== '') {
      merged[key] = fileVars[key];
    } else if (process.env[key] !== undefined && process.env[key] !== '') {
      merged[key] = process.env[key];
    }
  }
  return merged;
}

export function maskSecret(secret) {
  if (!secret || secret.length < 8) return secret ? '••••••••' : '';
  return `${secret.slice(0, 6)}••••${secret.slice(-4)}`;
}

export async function getPublicSettings() {
  const s = await loadSettings();
  return {
    hasApifyToken: Boolean(s.APIFY_TOKEN),
    apifyTokenMasked: maskSecret(s.APIFY_TOKEN),
    apifyReelsActor: s.APIFY_REELS_ACTOR,
    apifyStoriesActor: s.APIFY_STORIES_ACTOR,
    hasGeminiApiKey: Boolean(s.GEMINI_API_KEY),
    geminiApiKeyMasked: maskSecret(s.GEMINI_API_KEY),
    geminiModel: s.GEMINI_MODEL,
    geminiOmniModel: s.GEMINI_OMNI_MODEL,
    hasFalKey: Boolean(s.FAL_KEY),
    falKeyMasked: maskSecret(s.FAL_KEY),
    falOmnihumanModel: s.FAL_OMNIHUMAN_MODEL,
    falSeedanceRefModel: s.FAL_SEEDANCE_REF_MODEL,
    falSeedanceI2vModel: s.FAL_SEEDANCE_I2V_MODEL,
    falSeedanceT2vModel: s.FAL_SEEDANCE_T2V_MODEL,
    port: Number(s.PORT) || 3456,
    defaultMaxItemsPerProfile: Number(s.DEFAULT_MAX_ITEMS_PER_PROFILE) || 10,
  };
}

export async function saveSettings(updates) {
  const current = await loadSettings();
  const next = { ...current };

  if (typeof updates.apifyToken === 'string' && updates.apifyToken.trim() !== '') {
    next.APIFY_TOKEN = updates.apifyToken.trim();
  }
  if (updates.clearApifyToken === true) {
    next.APIFY_TOKEN = '';
  }
  if (typeof updates.apifyReelsActor === 'string') {
    next.APIFY_REELS_ACTOR = updates.apifyReelsActor.trim() || DEFAULT_SETTINGS.APIFY_REELS_ACTOR;
  }
  if (typeof updates.apifyStoriesActor === 'string') {
    next.APIFY_STORIES_ACTOR = updates.apifyStoriesActor.trim();
  }
  if (typeof updates.geminiApiKey === 'string' && updates.geminiApiKey.trim() !== '') {
    next.GEMINI_API_KEY = updates.geminiApiKey.trim();
  }
  if (updates.clearGeminiApiKey === true) {
    next.GEMINI_API_KEY = '';
  }
  if (typeof updates.geminiModel === 'string' && updates.geminiModel.trim() !== '') {
    next.GEMINI_MODEL = updates.geminiModel.trim();
  }
  if (typeof updates.geminiOmniModel === 'string' && updates.geminiOmniModel.trim() !== '') {
    next.GEMINI_OMNI_MODEL = updates.geminiOmniModel.trim();
  }
  if (typeof updates.falKey === 'string' && updates.falKey.trim() !== '') {
    next.FAL_KEY = updates.falKey.trim();
  }
  if (updates.clearFalKey === true) {
    next.FAL_KEY = '';
  }
  if (typeof updates.falOmnihumanModel === 'string' && updates.falOmnihumanModel.trim() !== '') {
    next.FAL_OMNIHUMAN_MODEL = updates.falOmnihumanModel.trim();
  }
  if (typeof updates.falSeedanceRefModel === 'string' && updates.falSeedanceRefModel.trim() !== '') {
    next.FAL_SEEDANCE_REF_MODEL = updates.falSeedanceRefModel.trim();
  }
  if (typeof updates.falSeedanceI2vModel === 'string' && updates.falSeedanceI2vModel.trim() !== '') {
    next.FAL_SEEDANCE_I2V_MODEL = updates.falSeedanceI2vModel.trim();
  }
  if (typeof updates.falSeedanceT2vModel === 'string' && updates.falSeedanceT2vModel.trim() !== '') {
    next.FAL_SEEDANCE_T2V_MODEL = updates.falSeedanceT2vModel.trim();
  }
  if (updates.defaultMaxItemsPerProfile !== undefined) {
    const n = Math.max(1, Math.min(50, Number(updates.defaultMaxItemsPerProfile) || 10));
    next.DEFAULT_MAX_ITEMS_PER_PROFILE = String(n);
  }

  const lines = [
    '# Gerado pelo Auxiliar de Conteúdo / Swipe File',
    `APIFY_TOKEN=${next.APIFY_TOKEN}`,
    `APIFY_REELS_ACTOR=${next.APIFY_REELS_ACTOR}`,
    `APIFY_STORIES_ACTOR=${next.APIFY_STORIES_ACTOR}`,
    `GEMINI_API_KEY=${next.GEMINI_API_KEY}`,
    `GEMINI_MODEL=${next.GEMINI_MODEL}`,
    `GEMINI_OMNI_MODEL=${next.GEMINI_OMNI_MODEL}`,
    `FAL_KEY=${next.FAL_KEY}`,
    `FAL_OMNIHUMAN_MODEL=${next.FAL_OMNIHUMAN_MODEL}`,
    `FAL_SEEDANCE_REF_MODEL=${next.FAL_SEEDANCE_REF_MODEL}`,
    `FAL_SEEDANCE_I2V_MODEL=${next.FAL_SEEDANCE_I2V_MODEL}`,
    `FAL_SEEDANCE_T2V_MODEL=${next.FAL_SEEDANCE_T2V_MODEL}`,
    `PORT=${next.PORT}`,
    `DEFAULT_MAX_ITEMS_PER_PROFILE=${next.DEFAULT_MAX_ITEMS_PER_PROFILE}`,
    '',
  ];
  await fs.writeFile(ENV_PATH, lines.join('\n'), 'utf8');
  return getPublicSettings();
}
