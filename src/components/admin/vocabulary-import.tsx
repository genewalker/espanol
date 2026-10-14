"use client";

import { useId, useRef, useState } from "react";
import { useMutation } from "convex/react";
import { useRouter } from "next/navigation";
import type { FunctionArgs } from "convex/server";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { defaultOptions, parseVocabulary, prepareRows, reviewRows, type ImportRow, type ParseOptions, type Preview } from "@/lib/vocabulary/parser";
import { detailsError, LIMITS } from "@/lib/vocabulary/validation";
import { errorMessage, Notice } from "./shared";

type Props = { listId?: Id<"vocabularyLists">; existing?: { spanish: string; swedish: string }[] };

export function VocabularyImport({ listId, existing = [] }: Props) {
  const fieldId = useId();
  const commit = useMutation(api.imports.commitPreviewImport);
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [testDate, setTestDate] = useState("");
  const [source, setSource] = useState("");
  const [options, setOptions] = useState<ParseOptions>(defaultOptions);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [pending, setPending] = useState(false);
  const [locked, setLocked] = useState(false);
  const busy = useRef(false);
  const attempt = useRef<FunctionArgs<typeof api.imports.commitPreviewImport> | null>(null);
  const issues = preview ? reviewRows(rows, preview.rows, existing) : [];
  const selected = rows.filter((row) => row.included).length;
  const blocked = issues.some((issue) => issue.blocked);

  function invalidate() { setPreview(null); setRows([]); setError(""); setSuccess(""); }
  function updateRow(index: number, patch: Partial<ImportRow>) {
    setRows((current) => current.map((row, i) => i === index ? { ...row, ...patch } : row));
  }
  function review() {
    const result = parseVocabulary(source, options);
    setPreview(result); setRows(prepareRows(result)); setError(""); setSuccess("");
    attempt.current = null;
  }
  async function readFile(file?: File) {
    if (!file) return;
    invalidate();
    if (file.size > LIMITS.importBytes) { setError("Filen får vara högst 1 MB."); return; }
    try {
      const text = new TextDecoder("utf-8", { fatal: true }).decode(await file.arrayBuffer());
      setSource(text);
      setOptions({ ...defaultOptions, format: "csv", delimiter: file.name.toLowerCase().endsWith(".tsv") ? "\t" : "auto" });
    } catch { setError("Filen kunde inte läsas. Spara den som UTF-8 och försök igen."); }
  }
  async function confirm() {
    if (busy.current || !preview) return;
    if (!attempt.current) {
      const invalid = !listId && detailsError({ title, description, testDate });
      if (invalid) { setError(invalid); return; }
      attempt.current = {
        requestId: crypto.randomUUID(),
        target: listId ? { kind: "existing", listId } : { kind: "new", title, description, testDate },
        source, options, rows,
      };
    }
    busy.current = true; setPending(true); setLocked(true); setError("");
    try {
      const result = await commit(attempt.current);
      if (!listId) router.push(`/admin/lists/${result.listId}`);
      else {
        setSuccess(`${result.importedCount} glosor importerades.`);
        setSource(""); setRows([]); setPreview(null); setLocked(false); attempt.current = null;
      }
    } catch (err) { setError(errorMessage(err)); }
    finally { busy.current = false; setPending(false); }
  }

  return <section className="space-y-5" aria-label={listId ? "Importera fler glosor" : "Ny gloslista"}>
    <fieldset disabled={locked} className="min-w-0 space-y-5">
      {!listId && <div className="admin-panel">
        <label className="field-label">Listans rubrik<input className="field" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></label>
        <label className="field-label">Beskrivning (valfri)<textarea className="field" value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} /></label>
        <label className="field-label">Provdatum (valfritt)<input className="field" type="date" value={testDate} onChange={(e) => setTestDate(e.target.value)} /></label>
      </div>}
      <div className="admin-panel">
        <h2 className="text-xl font-bold">1. Lägg in glosor</h2>
        <p>Klistra in en glosa per rad, till exempel <code>el gato - katten</code>. Semikolon och tab fungerar också. Högst 200 glosor, 5 000 tecken per fält och 1 MB per import.</p>
        <label className="field-label">Läs in CSV eller TSV<input className="field text-sm" type="file" accept=".csv,.tsv,.txt,text/csv,text/tab-separated-values,text/plain" onChange={(e) => { void readFile(e.target.files?.[0]); e.target.value = ""; }} /></label>
        <label className="field-label">Glosor<textarea className="field min-h-40 font-mono" value={source} onChange={(e) => { setSource(e.target.value); invalidate(); }} placeholder={"el gato - katten\nel perro;hunden\nla casa\thuset"} /></label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="field-label">Format<select className="field" value={options.format} onChange={(e) => { setOptions({ ...options, format: e.target.value as ParseOptions["format"] }); invalidate(); }}>
            <option value="text">Inklistrad text (blandade avgränsare)</option><option value="csv">CSV / TSV (citerade fält)</option>
          </select></label>
          {options.format === "csv" && <label className="field-label">Avgränsare<select className="field" value={options.delimiter} onChange={(e) => { setOptions({ ...options, delimiter: e.target.value as ParseOptions["delimiter"] }); invalidate(); }}>
            <option value="auto">Detektera automatiskt</option><option value=",">Komma</option><option value=";">Semikolon</option><option value={"\t"}>Tab</option>
          </select></label>}
          <label className="field-label">Kolumnordning<select className="field" value={options.order} onChange={(e) => { setOptions({ ...options, order: e.target.value as ParseOptions["order"] }); invalidate(); }}>
            <option value="auto">Från rubriker, annars spanska först</option><option value="es-sv">Spanska → svenska</option><option value="sv-es">Svenska → spanska</option>
          </select></label>
        </div>
        <Button onClick={review} disabled={!source.trim()}>Förhandsgranska</Button>
        <p className="text-sm">Inget sparas innan du bekräftar importen. En ny lista sparas som utkast.</p>
      </div>
      {preview && <div className="space-y-3">
        <h2 className="text-xl font-bold">2. Granska glosorna</h2>
        <p>{selected} valda · {rows.length - selected} bortvalda{preview.headerDetected ? " · Kolumnrubriker hittades" : ""}. Radnummer avser poster i CSV och rader i inklistrad text.</p>
        {preview.errors.map((message) => <p role="alert" key={message} className="text-destructive">{message}</p>)}
        {rows.map((row, index) => <div key={row.rowNumber} className="admin-panel" data-testid={`preview-row-${row.rowNumber}`}>
          <label className="check-label font-bold"><input type="checkbox" checked={row.included} onChange={(e) => updateRow(index, { included: e.target.checked })} />Ta med rad {row.rowNumber}</label>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1"><label className="font-medium" htmlFor={`${fieldId}-es-${row.rowNumber}`}>Spanska, rad {row.rowNumber}</label><textarea id={`${fieldId}-es-${row.rowNumber}`} className="field" value={row.spanish} aria-invalid={!!issues[index].error} aria-describedby={issues[index].error ? `${fieldId}-error-${row.rowNumber}` : undefined} onChange={(e) => updateRow(index, { spanish: e.target.value, reviewed: false, keepDuplicate: false })} /></div>
            <div className="space-y-1"><label className="font-medium" htmlFor={`${fieldId}-sv-${row.rowNumber}`}>Svenska, rad {row.rowNumber}</label><textarea id={`${fieldId}-sv-${row.rowNumber}`} className="field" value={row.swedish} aria-invalid={!!issues[index].error} aria-describedby={issues[index].error ? `${fieldId}-error-${row.rowNumber}` : undefined} onChange={(e) => updateRow(index, { swedish: e.target.value, reviewed: false, keepDuplicate: false })} /></div>
          </div>
          {issues[index].error && <p id={`${fieldId}-error-${row.rowNumber}`} className="text-destructive">{issues[index].error}</p>}
          {preview.rows[index].parseError && !row.reviewed && <Button variant="outline" onClick={() => updateRow(index, { reviewed: true })}>Bekräfta korrigerad rad {row.rowNumber}</Button>}
          {issues[index].duplicate && <div><p className="font-medium">Möjlig dubblett: samma ordpar finns redan i listan eller granskningen.</p>
            <label className="check-label"><input type="checkbox" checked={row.keepDuplicate} onChange={(e) => updateRow(index, { keepDuplicate: e.target.checked })} />Behåll dubbletten på rad {row.rowNumber}</label></div>}
          {!row.included && <p>Raden importeras inte.</p>}
        </div>)}
      </div>}
    </fieldset>
    <Notice error={error} success={success} />
    {preview && <div className="space-y-3">
      {!locked && blocked && <p role="status">Korrigera fel och bekräfta dubbletter, eller välj bort raderna.</p>}
      {locked && error && <p>Försök igen skickar samma granskning, så att ett upprepat försök inte skapar fler glosor. För en ändrad import: kontrollera listorna och öppna en ny granskning.</p>}
      <Button onClick={() => void confirm()} disabled={pending || (!locked && (blocked || !!preview.errors.length || selected === 0))}>
        {pending ? "Sparar…" : locked && error ? "Försök importera igen" : `Importera ${selected} glosor`}
      </Button>
    </div>}
  </section>;
}
