import { sha256 } from "@noble/hashes/sha2.js";
import { bytesToHex } from "@noble/hashes/utils.js";
import { ConvexError, v } from "convex/values";
import { guardianMutation, ownedList } from "./lib/authorization";
import { detailsValidator, insertList, validatedWord } from "./lib/vocabulary";
import { parseVocabulary, reviewRows } from "../src/lib/vocabulary/parser";
import { LIMITS, textBytes, wordBytes } from "../src/lib/vocabulary/validation";

export const commitPreviewImport = guardianMutation({
  args: {
    requestId: v.string(),
    target: v.union(v.object({ kind: v.literal("new"), ...detailsValidator }), v.object({ kind: v.literal("existing"), listId: v.id("vocabularyLists") })),
    source: v.string(),
    options: v.object({ format: v.union(v.literal("text"), v.literal("csv")), delimiter: v.union(v.literal("auto"), v.literal(","), v.literal(";"), v.literal("\t")), order: v.union(v.literal("auto"), v.literal("es-sv"), v.literal("sv-es")) }),
    rows: v.array(v.object({ rowNumber: v.number(), spanish: v.string(), swedish: v.string(), included: v.boolean(), reviewed: v.boolean(), keepDuplicate: v.boolean() })),
  },
  returns: v.object({ listId: v.id("vocabularyLists"), importedCount: v.number() }),
  handler: async (ctx, args) => {
    if (!/^[0-9a-f-]{36}$/i.test(args.requestId)) throw new ConvexError("Ogiltigt import-ID.");
    if (args.rows.length > LIMITS.importRows || textBytes(args.source) > LIMITS.importBytes || textBytes(JSON.stringify(args.rows)) > LIMITS.importBytes) throw new ConvexError("Importen är för stor. Högst 200 rader och 1 MB innehåll.");
    // A key is bound to its exact request, so retries after edits cannot silently succeed.
    const fingerprint = bytesToHex(sha256(new TextEncoder().encode(JSON.stringify([args.target, args.source, args.options, args.rows]))));
    const previous = await ctx.db.query("importBatches").withIndex("by_guardian_request", (q) => q.eq("guardianId", ctx.user._id).eq("requestId", args.requestId)).unique();
    if (previous) {
      if (previous.fingerprint !== fingerprint) throw new ConvexError("Import-ID används redan för annat innehåll. Öppna en ny import.");
      await ownedList(ctx, previous.listId, ctx.user._id);
      return { listId: previous.listId, importedCount: previous.importedCount };
    }
    const preview = parseVocabulary(args.source, args.options);
    if (preview.errors.length) throw new ConvexError(preview.errors[0]);
    if (args.rows.length !== preview.rows.length || args.rows.some((row, index) => row.rowNumber !== preview.rows[index].rowNumber)) throw new ConvexError("Alla källrader måste granskas eller väljas bort uttryckligen.");
    const list = args.target.kind === "existing" ? await ownedList(ctx, args.target.listId, ctx.user._id) : null;
    if (list?.status === "archived") throw new ConvexError("Återställ listan till utkast innan du importerar.");
    const existing = list ? await ctx.db.query("words").withIndex("by_list_order", (q) => q.eq("listId", list._id)).take(LIMITS.wordsPerList) : [];
    const issues = reviewRows(args.rows, preview.rows, existing);
    if (issues.some((issue) => issue.blocked)) throw new ConvexError("Korrigera felrader och bekräfta dubbletter, eller välj bort dem. Listan kan ha ändrats i en annan vy.");
    const words = args.rows.filter((row) => row.included).map((row) => validatedWord({ ...row, acceptedSpanish: [], acceptedSwedish: [] }));
    if (words.length === 0) throw new ConvexError("Välj minst en glosa att importera.");
    const importedBytes = words.reduce((sum, word) => sum + wordBytes(word), 0);
    if ((list?.wordCount ?? 0) + words.length > LIMITS.wordsPerList) throw new ConvexError("Högst 500 glosor per lista, inklusive inaktiva.");
    if ((list?.contentBytes ?? 0) + importedBytes > LIMITS.listBytes) throw new ConvexError("Listans text får vara högst 2 MB.");
    const listId = args.target.kind === "new" ? await insertList(ctx, ctx.user._id, args.target) : args.target.listId;
    const now = Date.now();
    for (const [index, word] of words.entries()) {
      await ctx.db.insert("words", { ...word, listId, guardianId: ctx.user._id, contentVersion: 1, sortOrder: (list?.wordCount ?? 0) + index, isActive: true, createdAt: now, updatedAt: now });
    }
    await ctx.db.patch(listId, { wordCount: (list?.wordCount ?? 0) + words.length, activeWordCount: (list?.activeWordCount ?? 0) + words.length, contentBytes: (list?.contentBytes ?? 0) + importedBytes, updatedAt: now });
    await ctx.db.insert("importBatches", { guardianId: ctx.user._id, listId, requestId: args.requestId, fingerprint, importedCount: words.length, createdAt: now });
    return { listId, importedCount: words.length };
  },
});
