import type { FunctionReturnType } from "convex/server";
import { api } from "../../../convex/_generated/api";

type Feedback = FunctionReturnType<typeof api.practice.submitAnswer>;
export function AnswerFeedback({ feedback, answerLanguage }: { feedback: Feedback; answerLanguage: "sv" | "es" }) {
  const label = feedback.kind === "self_assessed"
    ? feedback.selfRating === "known" ? "Självskattning: Kunde" : "Självskattning: Behöver öva"
    : feedback.isCorrect ? "Rätt svar!" : "Inte riktigt ännu. Här kan du lära dig svaret.";
  return <div className="space-y-2 break-words" role="status">
    <p className="text-xl font-bold"><span aria-hidden="true">{feedback.isCorrect || feedback.selfRating === "known" ? "✓ " : "↻ "}</span>{label}</p>
    {feedback.kind === "objective" && <p>Ditt svar: <span lang={answerLanguage}>{feedback.submittedText}</span></p>}
    <p>Facit: <strong lang={answerLanguage}>{feedback.correctAnswer}</strong></p>
    {feedback.hint && <p>{feedback.hint}</p>}
  </div>;
}
