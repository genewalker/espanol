export const LIMITS = {
  importRows: 200,
  cellChars: 5_000,
  importBytes: 1_048_576,
  lists: 50,
  wordsPerList: 500,
  listBytes: 2_097_152,
  aliases: 10,
} as const;

export const cleanText = (value: string) => value.trim().normalize("NFC");
export const textBytes = (value: string) => new TextEncoder().encode(value).length;

// Duplicate detection only. This is not an answer-grading function.
export function duplicateKey(spanish: string, swedish: string) {
  const key = (value: string) => cleanText(value).replace(/\s+/gu, " ").toLowerCase();
  return JSON.stringify([key(spanish), key(swedish)]);
}

export function cellError(value: string) {
  if (!cleanText(value)) return "Båda språken måste fyllas i.";
  if (value.length > LIMITS.cellChars) return "Högst 5 000 tecken per textfält.";
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(value)) return "Texten innehåller ogiltiga kontrolltecken.";
  return null;
}

export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(value + "T12:00:00Z");
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export type ListDetails = { title: string; description?: string; testDate?: string };
export function detailsError(details: ListDetails) {
  if (!cleanText(details.title) || details.title.length > 120) return "Rubriken måste ha 1–120 tecken.";
  if ((details.description?.length ?? 0) > 1_000) return "Beskrivningen får ha högst 1 000 tecken.";
  if (details.testDate && !validDate(details.testDate)) return "Ange ett giltigt provdatum.";
  return null;
}

export type WordContent = { spanish: string; swedish: string; acceptedSpanish: string[]; acceptedSwedish: string[] };
export function wordBytes(word: WordContent) {
  return textBytes(JSON.stringify([word.spanish, word.swedish, word.acceptedSpanish, word.acceptedSwedish]));
}
