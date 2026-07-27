'use client';

import Question from '@/components/Question';

type QuestionData = {
  ref: string | number;
  catégorie: string;
  chantier: string;
  question: string;
  comment: string;
  'note numérique': number | null;
  'aide à la notation': string[]; display_if?: { question_ref: number; operator: string; value?: number | number[] };
};

export default function Questionnaire({ questions, para, onChange, onSaved }: { questions: QuestionData[]; para: string; onChange: (ref: string | number, mark: number | null, comment: string) => void; onSaved: () => void }) {
  if (questions.length === 0) return <div className="surface-card p-10 text-center text-sm text-slate-500">Aucune question dans cette catégorie.</div>;
  return <div className="grid items-start gap-5 xl:grid-cols-2">{questions.map((question, index) => <Question key={question.ref} question={question} nb={index} parametre={para} onChange={onChange} onSaved={onSaved} />)}</div>;
}