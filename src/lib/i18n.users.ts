import type { LangCode } from './i18n';

type Dict = Record<string, Partial<Record<LangCode, string>>>;

export const upDict: Dict = {};
