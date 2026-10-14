import Papa from "papaparse";
import { cellError, cleanText, duplicateKey, LIMITS, textBytes } from "./validation";

export type ParseOptions = {
  format: "text" | "csv";
  delimiter: "auto" | "," | ";" | "\t";
  order: "auto" | "es-sv" | "sv-es";
};
export const defaultOptions: ParseOptions = { format: "text", delimiter: "auto", order: "auto" };
export type PreviewRow = {
  rowNumber: number;
  spanish: string;
  swedish: string;
  parseError?: string;
};
export type ImportRow = {
  rowNumber: number;
  spanish: string;
  swedish: string;
  included: boolean;
  reviewed: boolean;
  keepDuplicate: boolean;
};
export type Preview = { rows: PreviewRow[]; errors: string[]; headerDetected: boolean };

function headerOrder(cells: string[]) {
  if (cells.length !== 2) return null;
  const key = cells.map((cell) => cleanText(cell).toLowerCase()).join("|");
  if (["spanish|swedish", "spanska|svenska"].includes(key)) return "es-sv";
  if (["swedish|spanish", "svenska|spanska"].includes(key)) return "sv-es";
  return null;
}

export function parseVocabulary(source: string, options: ParseOptions = defaultOptions): Preview {
  if (textBytes(source) > LIMITS.importBytes) return { rows: [], errors: ["Texten eller filen får vara högst 1 MB (1 048 576 byte)."], headerDetected: false };
  const input = source.replace(/^\uFEFF/u, "");
  let records: { cells: string[]; rowNumber: number; error?: string }[];
  if (options.format === "csv") {
    records = [];
    let rowNumber = 0;
    Papa.parse<string[]>(input, {
      delimiter: options.delimiter === "auto" ? "" : options.delimiter,
      delimitersToGuess: [",", ";", "\t"],
      // Keep empty *fields* (e.g. ",") as errors. Skip only empty records.
      skipEmptyLines: false,
      step: (result, parser) => {
        rowNumber++;
        if (result.data.length === 1 && !result.data[0].trim() && result.errors.length === 0) return;
        records.push({ cells: result.data, rowNumber,
          error: result.errors.some((error) => error.type === "Quotes")
            ? "Felaktigt citerat CSV-fält. Korrigera posten eller välj bort den." : undefined,
        });
        if (records.length > LIMITS.importRows + 1) parser.abort();
      },
    });
  } else {
    records = [];
    for (const [index, line] of input.split(/\r\n|\n|\r/u).entries()) {
      if (!line.trim()) continue;
      const delimiters = ["\t", ";", " - "].filter((delimiter) => line.includes(delimiter));
      const cells = delimiters.length === 1 ? line.split(delimiters[0]) : [line];
      records.push({ cells, rowNumber: index + 1 });
      if (records.length > LIMITS.importRows + 1) break;
    }
  }
  const detectedOrder = records[0] ? headerOrder(records[0].cells) : null;
  if (detectedOrder) records = records.slice(1);
  const order = options.order === "auto" ? detectedOrder ?? "es-sv" : options.order;
  const rows = records.map(({ cells, rowNumber, error }): PreviewRow => {
    const values = order === "sv-es" ? [cells[1] ?? "", cells[0] ?? ""] : [cells[0] ?? "", cells[1] ?? ""];
    return {
      rowNumber, spanish: cleanText(values[0]), swedish: cleanText(values[1]),
      parseError: error ?? (cells.length !== 2 ? "Raden måste ha exakt två fält med en entydig avgränsare. Korrigera eller välj bort raden." : undefined),
    };
  });
  const errors = rows.length > LIMITS.importRows ? ["Högst 200 glosor per import. Dela upp innehållet och försök igen."] : [];
  if (rows.length === 0) errors.push("Inga glosor hittades.");
  return { rows, errors, headerDetected: detectedOrder !== null };
}

export function prepareRows(preview: Preview): ImportRow[] {
  return preview.rows.map((row) => ({ rowNumber: row.rowNumber, spanish: row.spanish, swedish: row.swedish, included: true, reviewed: false, keepDuplicate: false }));
}

export function reviewRows(rows: ImportRow[], original: PreviewRow[], existing: { spanish: string; swedish: string }[] = []) {
  const seen = new Set(existing.map((row) => duplicateKey(row.spanish, row.swedish)));
  return rows.map((row, index) => {
    const error = cellError(row.spanish) ?? cellError(row.swedish) ?? (!row.reviewed ? original[index]?.parseError : null);
    const key = duplicateKey(row.spanish, row.swedish);
    const duplicate = seen.has(key);
    if (row.included && !error) seen.add(key);
    return { error, duplicate, blocked: row.included && (!!error || (duplicate && !row.keepDuplicate)) };
  });
}
