import type { LangCode } from './i18n';

// Ücretsiz, anahtarsız servisler. Google resmî olmayan bir uç noktadır, bu yüzden
// MyMemory'ye yedek var: biri çalışmazsa diğeri denenir, o da olmazsa çağıran hata görür.
// ponytail: sunucu/anahtar yok, ücretsiz; limit aşılırsa kullanıcıya yansır (hata durumu).
const GOOGLE = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=';
const MYMEMORY = 'https://api.mymemory.translated.net/get?q=';

const cache = new Map<string, string>();
const MAX_CACHE = 300;

async function viaGoogle(text: string, from: LangCode, to: LangCode) {
  const r = await fetch(`${GOOGLE}${from}&tl=${to}&dt=t&q=${encodeURIComponent(text)}`);
  if (!r.ok) throw new Error('google ' + r.status);
  const d = await r.json();
  const out = (d[0] || []).map((s: unknown[]) => s[0]).join('');
  if (!out) throw new Error('google empty');
  return String(out);
}

async function viaMyMemory(text: string, from: LangCode, to: LangCode) {
  const r = await fetch(`${MYMEMORY}${encodeURIComponent(text)}&langpair=${from}|${to}`);
  if (!r.ok) throw new Error('mymemory ' + r.status);
  const d = await r.json();
  if (d.responseStatus !== 200 || !d.responseData?.translatedText) throw new Error('mymemory ' + d.responseStatus);
  // MyMemory bazı karakterleri HTML entity olarak döndürüyor.
  return String(d.responseData.translatedText)
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&');
}

export async function translateText(text: string, from: LangCode, to: LangCode): Promise<string> {
  const clean = text.trim();
  if (!clean || from === to) return clean;

  const key = `${from}>${to}>${clean}`;
  const hit = cache.get(key);
  if (hit) return hit;

  let out: string;
  try {
    out = await viaGoogle(clean, from, to);
  } catch {
    out = await viaMyMemory(clean, from, to);
  }

  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
  cache.set(key, out);
  return out;
}
