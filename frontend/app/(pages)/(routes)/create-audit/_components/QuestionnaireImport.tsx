'use client';

import { useState } from 'react';
import { FileJson, Upload } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type QuestionnaireQuestion = {
  ref: number;
  catégorie: string;
  chantier: string;
  question: string;
  comment: null;
  'note numérique': null;
  'aide à la notation': string[];
};

const example: QuestionnaireQuestion[] = [{
  ref: 1,
  catégorie: 'Gouvernance',
  chantier: 'Organisation de la sécurité',
  question: 'Un responsable de la sécurité est-il désigné ?',
  comment: null,
  'note numérique': null,
  'aide à la notation': [
    '0 : Aucun responsable',
    '4 : Responsable désigné et missions formalisées',
  ],
}];

const expectedKeys = ['aide à la notation', 'catégorie', 'chantier', 'comment', 'note numérique', 'question', 'ref'].sort();

export function parseQuestionnaire(value: string): QuestionnaireQuestion[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Le contenu ne respecte pas la syntaxe JSON.');
  }
  if (!Array.isArray(parsed) || parsed.length === 0) throw new Error('Le questionnaire doit être un tableau contenant au moins une question.');
  if (parsed.length > 1000) throw new Error('Le questionnaire est limité à 1 000 questions.');

  const refs = new Set<number>();
  parsed.forEach((item, index) => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) throw new Error(`Question ${index + 1} : un objet JSON est attendu.`);
    const question = item as Record<string, unknown>;
    if (JSON.stringify(Object.keys(question).sort()) !== JSON.stringify(expectedKeys)) throw new Error(`Question ${index + 1} : les sept clés attendues doivent être présentes, sans clé supplémentaire.`);
    if (!Number.isInteger(question.ref) || Number(question.ref) < 1) throw new Error(`Question ${index + 1} : "ref" doit être un entier positif.`);
    if (refs.has(Number(question.ref))) throw new Error(`La référence ${question.ref} est utilisée plusieurs fois.`);
    refs.add(Number(question.ref));
    ['catégorie', 'chantier', 'question'].forEach((key) => {
      if (typeof question[key] !== 'string' || !String(question[key]).trim()) throw new Error(`Question ${index + 1} : "${key}" doit être un texte non vide.`);
    });
    if (question.comment !== null || question['note numérique'] !== null) throw new Error(`Question ${index + 1} : "comment" et "note numérique" doivent valoir null.`);
    const help = question['aide à la notation'];
    if (!Array.isArray(help) || !help.every((line) => typeof line === 'string' && line.trim())) throw new Error(`Question ${index + 1} : "aide à la notation" doit être un tableau de textes.`);
  });
  return parsed as QuestionnaireQuestion[];
}

export default function QuestionnaireImport({ onChange }: { onChange: (questionnaire: QuestionnaireQuestion[] | undefined, error: string) => void }) {
  const [mode, setMode] = useState<'default' | 'custom'>('default');
  const [content, setContent] = useState(JSON.stringify(example, null, 2));
  const [error, setError] = useState('');

  const update = (value: string) => {
    setContent(value);
    try {
      const parsed = parseQuestionnaire(value);
      setError('');
      onChange(parsed, '');
    } catch (parseError) {
      const message = parseError instanceof Error ? parseError.message : 'Questionnaire invalide.';
      setError(message);
      onChange(undefined, message);
    }
  };

  return (
    <div className="border-t border-slate-200 pt-6">
      <div className="flex items-start gap-3"><FileJson className="mt-0.5 h-5 w-5 text-violet-700" /><div><h2 className="font-semibold text-slate-950">Questionnaire d’audit</h2><p className="mt-1 text-sm text-slate-500">Utilisez le référentiel fourni ou importez votre propre tableau JSON.</p></div></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2">
        <button type="button" onClick={() => { setMode('default'); setError(''); onChange(undefined, ''); }} className={cn('rounded-xl border p-3 text-left text-sm transition', mode === 'default' ? 'border-violet-600 bg-violet-50 text-violet-900' : 'border-slate-200 hover:bg-slate-50')}><span className="block font-semibold">Questionnaire fourni</span><span className="mt-1 block text-xs opacity-70">Référentiel complet du site</span></button>
        <button type="button" onClick={() => { setMode('custom'); update(content); }} className={cn('rounded-xl border p-3 text-left text-sm transition', mode === 'custom' ? 'border-violet-600 bg-violet-50 text-violet-900' : 'border-slate-200 hover:bg-slate-50')}><span className="block font-semibold">Questionnaire personnalisé</span><span className="mt-1 block text-xs opacity-70">Coller ou importer un fichier JSON</span></button>
      </div>
      {mode === 'custom' && <div className="mt-4 space-y-3">
        <label htmlFor="questionnaire-file" className="flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-violet-300 bg-violet-50/60 px-4 py-3 text-sm font-medium text-violet-800 hover:bg-violet-50"><Upload className="h-4 w-4" />Importer un fichier .json<input id="questionnaire-file" type="file" accept=".json,application/json" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) file.text().then(update).catch(() => { setError('Impossible de lire ce fichier.'); onChange(undefined, 'Impossible de lire ce fichier.'); }); }} /></label>
        <textarea aria-label="Questionnaire JSON" value={content} onChange={(event) => update(event.target.value)} rows={14} spellCheck={false} className="form-textarea w-full resize-y rounded-xl border-slate-300 font-mono text-xs leading-5 focus:border-violet-500 focus:ring-violet-500" />
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-slate-500">Les noms des clés, accents et valeurs <code>null</code> doivent être conservés exactement.</p><Button type="button" size="sm" variant="outline" onClick={() => update(JSON.stringify(example, null, 2))}>Réinitialiser l’exemple</Button></div>
        {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </div>}
    </div>
  );
}
