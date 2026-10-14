"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import type { FunctionArgs, FunctionReturnType } from "convex/server";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { errorMessage, Notice } from "@/components/admin/shared";
import { AnswerFeedback } from "./feedback";
import { modeLabels } from "./shared";

type QuestionView = Extract<FunctionReturnType<typeof api.practice.getCurrentQuestion>, { state: "question" }>;

function Question({ view }: { view: QuestionView }) {
  const { question, session, feedback, direction } = view;
  const submit = useMutation(api.practice.submitAnswer);
  const reveal = useMutation(api.practice.revealFlashcard);
  const advance = useMutation(api.practice.advanceQuestion);
  const router = useRouter();
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const feedbackRegion = useRef<HTMLDivElement>(null);
  const hasFeedback = feedback !== null;
  useEffect(() => {
    if (hasFeedback) feedbackRegion.current?.focus();
    else if (question.mode === "written") input.current?.focus();
    else heading.current?.focus();
  }, [hasFeedback, question.mode]);
  const answerLanguage = direction === "sv_to_es" ? "es" : "sv";

  async function run(action: () => Promise<unknown>) {
    if (busy.current) return;
    busy.current = true; setPending(true); setError("");
    try { await action(); }
    catch (err) { setError(errorMessage(err)); }
    finally { busy.current = false; setPending(false); }
  }
  function send(submission: FunctionArgs<typeof api.practice.submitAnswer>["submission"]) {
    return run(() => submit({ sessionId: session.sessionId, questionIndex: question.index, submission }));
  }
  function written(event: FormEvent<HTMLFormElement>) { event.preventDefault(); void send({ kind: "written", text }); }
  function next() {
    return run(async () => {
      await advance({ sessionId: session.sessionId, questionIndex: question.index });
      if (question.index + 1 === session.questionCount) router.push(`/app/results/${session.sessionId}`);
    });
  }
  return <Card>
    <CardHeader className="space-y-3">
      <p className="font-semibold">Fråga {question.index + 1} av {session.questionCount} · {modeLabels[question.mode]}</p>
      <progress aria-label="Besvarade frågor" className="h-3 w-full accent-primary" value={session.answeredCount} max={session.questionCount} />
      <p>{direction === "sv_to_es" ? "Vad heter det på spanska?" : "Vad betyder det på svenska?"}</p>
      <h2 ref={heading} tabIndex={-1} className="text-3xl font-bold break-words" lang={direction === "sv_to_es" ? "sv" : "es"}>{question.prompt}</h2>
    </CardHeader>
    <CardContent className="space-y-4">
      {view.requestedMode === "multiple_choice" && question.mode === "written" && <p>Här finns färre än tre olika alternativ. Skriv svaret i stället.</p>}
      {feedback ? <div ref={feedbackRegion} tabIndex={-1} className="space-y-4">
        <AnswerFeedback feedback={feedback} answerLanguage={answerLanguage} />
        <Button onClick={() => void next()} disabled={pending}>{pending ? "Sparar…" : question.index + 1 === session.questionCount ? "Visa resultat" : "Nästa fråga"}</Button>
      </div> : question.mode === "written" ? <form onSubmit={written} className="space-y-3">
        <label className="field-label">Ditt svar<input ref={input} className="field" lang={answerLanguage} value={text} onChange={(e) => setText(e.target.value)} maxLength={5000} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} disabled={pending} /></label>
        <Button type="submit" disabled={pending || !text.trim()}>{pending ? "Rättar…" : "Rätta"}</Button>
      </form> : question.mode === "multiple_choice" ? <fieldset disabled={pending} className="space-y-3">
        <legend className="mb-3 font-semibold">Välj ett svar</legend>
        {question.options?.map((option) => <Button key={option.id} variant="outline" className="h-auto min-h-11 w-full justify-start whitespace-normal py-3 text-left text-lg break-words" lang={answerLanguage} onClick={() => void send({ kind: "multiple_choice", optionId: option.id })}>{option.text}</Button>)}
        {pending && <p role="status">Sparar svaret…</p>}
      </fieldset> : <div className="space-y-3">
        <p>Tänk ut svaret innan du vänder kortet. Här bedömer du själv vad du kunde.</p>
        {question.revealedAnswer === undefined ? <Button disabled={pending} onClick={() => void run(() => reveal({ sessionId: session.sessionId, questionIndex: question.index }))}>{pending ? "Vänder…" : "Vänd kortet"}</Button> : <>
          <p role="status" className="rounded-lg bg-secondary p-4 text-2xl font-bold break-words" lang={answerLanguage}>{question.revealedAnswer}</p>
          <div className="flex flex-wrap gap-3"><Button disabled={pending} onClick={() => void send({ kind: "flashcard", rating: "known" })}>Kunde</Button><Button variant="outline" disabled={pending} onClick={() => void send({ kind: "flashcard", rating: "again" })}>Behöver öva</Button></div>
        </>}
      </div>}
      <Notice error={error} />
    </CardContent>
  </Card>;
}

function Abandon({ sessionId }: { sessionId: Id<"practiceSessions"> }) {
  const abandon = useMutation(api.practice.abandonSession);
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  async function stop() {
    setPending(true); setError("");
    try { await abandon({ sessionId }); router.push(`/app/results/${sessionId}`); }
    catch (err) { setError(errorMessage(err)); }
    finally { setPending(false); }
  }
  return <div className="space-y-3">{confirming ? <>
    <p>Avsluta passet nu? Dina sparade svar finns kvar. Du kan starta ett nytt pass senare.</p>
    <div className="flex flex-wrap gap-3"><Button variant="outline" disabled={pending} onClick={() => void stop()}>Ja, avsluta passet</Button><Button variant="outline" disabled={pending} onClick={() => setConfirming(false)}>Fortsätt passet</Button></div>
  </> : <Button variant="outline" onClick={() => setConfirming(true)}>Avsluta i förtid</Button>}
    <Notice error={error} />
  </div>;
}

export function PracticeRunner({ sessionId }: { sessionId: Id<"practiceSessions"> }) {
  const view = useQuery(api.practice.getCurrentQuestion, { sessionId });
  if (!view) return <p role="status">Hämtar frågan…</p>;
  if (view.state === "finished") return <div className="space-y-4"><h1 className="text-3xl font-bold">Passet är avslutat</h1><Link className="primary-link" href={`/app/results/${sessionId}`}>Visa resultat</Link></div>;
  return <div className="space-y-5">
    <h1 className="text-2xl font-bold break-words">{view.session.listTitle}</h1>
    {view.state === "unavailable" ? <p role="alert">Listan är inte längre publicerad. Avsluta passet för att se dina sparade svar, eller be föräldern publicera listan igen.</p> : <Question key={view.question.index} view={view} />}
    <p className="text-sm">Varje besvarad fråga sparas. Du kan lämna sidan och fortsätta från övningsstarten.</p>
    <Abandon sessionId={sessionId} />
  </div>;
}
