// Used by the server for grading. Never ship expected answers in a question view.
export function normalizeAnswer(value: string) {
  return value.normalize("NFC").trim().toLowerCase().replace(/\s+/gu, " ").replace(/[.!?…]+$/u, "").trim();
}

export function gradeWritten(submitted: string, expected: string, aliases: string[]) {
  const answer = normalizeAnswer(submitted);
  const accepted = [expected, ...aliases].map(normalizeAnswer);
  if (accepted.includes(answer)) return { isCorrect: true };
  const withoutMarks = (value: string) => value.normalize("NFD").replace(/\p{M}/gu, "");
  if (accepted.some((value) => withoutMarks(value) === withoutMarks(answer))) {
    return { isCorrect: false, hint: "Kontrollera accenten eller tecknet över bokstaven. Till exempel är n och ñ olika bokstäver." };
  }
  if (accepted.some((value) => /^(el|la|los|las|un|una|unos|unas) /u.test(value) && value.replace(/^(el|la|los|las|un|una|unos|unas) /u, "") === answer)) {
    return { isCorrect: false, hint: "Kom ihåg artikeln, till exempel el eller la, när den ingår i glosan." };
  }
  return { isCorrect: false };
}
