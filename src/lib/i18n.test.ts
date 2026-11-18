import { describe, expect, it } from 'vitest';
import { D, LANGS, translate } from './i18n';

describe('i18n', () => {
  it('LANGS 9 dil içerir ve kodlar benzersizdir', () => {
    expect(LANGS).toHaveLength(9);
    const codes = LANGS.map((l) => l.code);
    expect(new Set(codes).size).toBe(9);
    expect(codes).toContain('tr');
  });

  it('her anahtarın boş olmayan bir tr karşılığı vardır', () => {
    const missing = Object.keys(D).filter((k) => !D[k].tr || !D[k].tr!.trim());
    expect(missing).toEqual([]);
  });

  it('bilinmeyen anahtar kendisini döndürür', () => {
    expect(translate('no.such.key')).toBe('no.such.key');
  });

  it('vars yer tutucularını değiştirir', () => {
    const out = translate('adm.fromUser', { name: 'Ali' });
    expect(out).toContain('Ali');
    expect(out).not.toContain('{name}');
  });

  it('boş değerli çeviri anahtarı yoktur', () => {
    const empties: string[] = [];
    for (const [key, entry] of Object.entries(D)) {
      for (const [lang, val] of Object.entries(entry)) {
        if (val !== undefined && !val.trim()) empties.push(`${key}.${lang}`);
      }
    }
    expect(empties).toEqual([]);
  });
});
