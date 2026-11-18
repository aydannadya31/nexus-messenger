import type { LangCode } from './i18n';

// Anahtarsız, ücretsiz çeviri. Daha önce MyMemory yedeği vardı, kaldırıldı: anonim
// kullanımda kalite düşük TM eşleşmeleri döndürüyordu ("s1_intro") ve kullanıcı
// fark etmeden bozuk metni gönderebiliyordu. Bozuk çeviri, "çevrilemedi" hatasından
// kötüdür — tek servis kalıyor, hata durumu dürüst kalıyor.
// ponytail: sunucu/anahtar yok, ücretsiz; limit aşılırsa hata mesajı gösterilir.
const GOOGLE = 'https://translate.googleapis.com/translate_a/single?client=gtx&sl=';

const cache = new Map<string, string>();
const MAX_CACHE = 300;

export async function translateText(text: string, from: LangCode, to: LangCode): Promise<string> {
  const clean = text.trim();
  if (!clean || from === to) return clean;

  const key = `${from}>${to}>${clean}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const r = await fetch(`${GOOGLE}${from}&tl=${to}&dt=t&q=${encodeURIComponent(clean)}`);
  if (!r.ok) throw new Error('translate ' + r.status);
  const d = await r.json();
  const out = (d[0] || []).map((s: unknown[]) => s[0]).join('');
  if (!out) throw new Error('translate empty');

  if (cache.size >= MAX_CACHE) cache.delete(cache.keys().next().value as string);
  cache.set(key, out);
  return out;
}
