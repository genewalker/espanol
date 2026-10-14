import { describe, expect, it } from "vitest";
import { defaultOptions, parseVocabulary, prepareRows, reviewRows } from "../src/lib/vocabulary/parser";
import { cellError, duplicateKey, LIMITS, validDate } from "../src/lib/vocabulary/validation";

describe("vocabulary parsing", () => {
  it("maps 20 mixed text records without losing accents or blank-line numbering", () => {
    const source = Array.from({ length: 20 }, (_, i) => `  niño ${i}${[" - ", ";", "\t"][i % 3]} barn ${i}  `).join("\n\n");
    const preview = parseVocabulary(source);
    expect(preview.errors).toEqual([]);
    expect(preview.rows).toHaveLength(20);
    expect(preview.rows[19]).toMatchObject({ spanish: "niño 19", swedish: "barn 19", rowNumber: 39 });
    expect(reviewRows(prepareRows(preview), preview.rows).some((row) => row.blocked)).toBe(false);
  });
  it.each([",", ";", "\t"] as const)("detects %s CSV, reverse headers, BOM, quoting and multiline fields", (delimiter) => {
    const preview = parseVocabulary(`\uFEFFsvenska${delimiter}spanska\r\n"hej, \"\"du\"\"\nigen"${delimiter}"hola"`, { ...defaultOptions, format: "csv" });
    expect(preview.headerDetected).toBe(true);
    expect(preview.rows).toEqual([{ rowNumber: 2, spanish: "hola", swedish: 'hej, "du"\nigen', parseError: undefined }]);
  });
  it("allows explicit separator and language order without a header", () => {
    expect(parseVocabulary("katten;el gato", { format: "csv", delimiter: ";", order: "sv-es" }).rows[0]).toMatchObject({ spanish: "el gato", swedish: "katten" });
  });
  it("normalizes NFC while preserving accents, punctuation and script text", () => {
    const preview = parseVocabulary(" nin\u0303o; <script>alert('x')</script> ");
    expect(preview.rows[0]).toMatchObject({ spanish: "niño", swedish: "<script>alert('x')</script>" });
    expect(duplicateKey(" EL  NIÑO ", " barnet ")).toBe(duplicateKey("el niño", "barnet"));
    expect(duplicateKey("si", "ja")).not.toBe(duplicateKey("sí", "ja"));
  });
  it.each(["el gato", "el gato;katten;extra", "el gato - katten;extra"])("requires explicit review of ambiguous record %s", (source) => {
    const preview = parseVocabulary(source);
    const rows = prepareRows(preview);
    expect(reviewRows(rows, preview.rows)[0].blocked).toBe(true);
    rows[0].spanish = "el gato"; rows[0].swedish = "katten";
    expect(reviewRows(rows, preview.rows)[0].blocked).toBe(true);
    rows[0].reviewed = true;
    expect(reviewRows(rows, preview.rows)[0].blocked).toBe(false);
  });
  it("flags broken CSV quotes and missing values instead of discarding records", () => {
    const preview = parseVocabulary('spanish,swedish\n"el gato,katten', { ...defaultOptions, format: "csv" });
    expect(preview.rows).toHaveLength(1);
    expect(preview.rows[0].parseError).toBeTruthy();
    const missing = parseVocabulary(";katten\nel perro;");
    expect(missing.rows).toHaveLength(2);
    expect(reviewRows(prepareRows(missing), missing.rows).every((row) => row.blocked)).toBe(true);
  });
  it("does not silently discard CSV records with two empty fields", () => {
    const preview = parseVocabulary("spanish,swedish\n\n,\n   \nel gato,katten", { ...defaultOptions, format: "csv", delimiter: "," });
    expect(preview.rows).toHaveLength(2);
    expect(preview.rows[0].rowNumber).toBe(3);
    expect(reviewRows(prepareRows(preview), preview.rows).map((row) => row.blocked)).toEqual([true, false]);
  });
  it("requires keep or exclusion for duplicates within source and existing inactive words", () => {
    const preview = parseVocabulary("el gato;katten\nEL GATO;katten\nsi;ja\nsí;ja");
    const rows = prepareRows(preview);
    expect(reviewRows(rows, preview.rows).map((row) => row.blocked)).toEqual([false, true, false, false]);
    rows[1].keepDuplicate = true;
    expect(reviewRows(rows, preview.rows).some((row) => row.blocked)).toBe(false);
    rows[0].included = false;
    expect(reviewRows(rows, preview.rows)[1].duplicate).toBe(false);
    expect(reviewRows(rows, preview.rows, [{ spanish: "si", swedish: "ja" }])[2].blocked).toBe(true);
  });
  it("enforces row, cell and UTF-8 byte limits at their boundaries", () => {
    const rows = Array.from({ length: 200 }, (_, i) => `es${i};sv${i}`);
    expect(parseVocabulary(rows.join("\n")).errors).toEqual([]);
    expect(parseVocabulary([...rows, "extra;extra"].join("\n")).errors[0]).toContain("200");
    expect(cellError("a".repeat(5000))).toBeNull();
    expect(cellError("a".repeat(5001))).toContain("5 000");
    expect(parseVocabulary("ñ".repeat(LIMITS.importBytes / 2 + 1)).errors[0]).toContain("1 MB");
    expect(parseVocabulary("\n \n").errors).toEqual(["Inga glosor hittades."]);
  });
  it("validates real calendar dates", () => {
    expect(validDate("2028-02-29")).toBe(true);
    for (const date of ["2026-02-29", "2026-13-01", "2026-2-01", "oops"]) expect(validDate(date)).toBe(false);
  });
});
