/* eslint-disable jsx-a11y/label-has-associated-control */

'use client';

import axios from 'axios';
import { useCallback, useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { AlertCircle, BookOpen, Check, Cloud } from 'lucide-react';
import { useForm } from 'react-hook-form';
import * as z from 'zod';

import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import API from '@/lib/api-client';
import { readAuditDraft, removeAuditDraft, writeAuditDraft } from '@/lib/audit-drafts';
import { cn } from '@/lib/utils';

const schema = z.object({
  note: z.string().min(1, 'Sélectionnez une note.').refine((value) => Number(value) >= 0 && Number(value) <= 4, 'La note doit être comprise entre 0 et 4.'),
  commentaire: z.string().max(1000, 'Le commentaire ne peut pas dépasser 1 000 caractères.'),
});

type FormValues = z.infer<typeof schema>;
type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type QuestionData = { ref: string | number; catégorie: string; chantier: string; question: string; comment: string; 'note numérique': number | null; 'aide à la notation': string[] };
type QuestionProps = {
  question: QuestionData;
  nb: number;
  parametre: string;
  onChange: (ref: string | number, mark: number | null, comment: string) => void;
  onSaved: () => void;
};

const wait = (duration: number) => new Promise((resolve) => { window.setTimeout(resolve, duration); });

export default function Question({ question, nb, parametre, onChange, onSaved }: QuestionProps) {
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [saveMessage, setSaveMessage] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revision = useRef(0);
  const queuedDraft = readAuditDraft(parametre, question.ref);
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: { note: queuedDraft ? String(queuedDraft.mark) : question['note numérique']?.toString() ?? '', commentaire: queuedDraft?.comment ?? question.comment ?? '' } });
  const selectedNote = form.watch('note');
  const comment = form.watch('commentaire');

  const persist = useCallback(async (values: FormValues, currentRevision: number) => {
    if (values.note === '' || Number(values.note) < 0 || Number(values.note) > 4 || values.commentaire.length > 1000) {
      setSaveState('error');
      return;
    }
    const draft = { mark: Number(values.note), comment: values.commentaire.trim(), updatedAt: Date.now() };
    writeAuditDraft(parametre, question.ref, draft);
    setSaveState('saving');
    setSaveMessage(navigator.onLine ? 'Envoi en cours…' : 'Hors ligne · modification conservée');
    const attemptSave = async (delays: number[]): Promise<'saved' | 'terminal' | 'failed'> => {
      const [delay, ...remaining] = delays;
      if (delay === undefined || !navigator.onLine) return 'failed';
      if (delay) await wait(delay);
      try {
        await API.put(`audit/${parametre}/answers/${question.ref}`, { mark: draft.mark, comment: draft.comment });
        return 'saved';
      } catch (requestError) {
        const status = axios.isAxiosError(requestError) ? requestError.response?.status : undefined;
        if (status && status < 500 && status !== 408 && status !== 429) {
          if (revision.current === currentRevision) { setSaveState('error'); setSaveMessage(status === 401 ? 'Session expirée · reconnectez-vous' : `Sauvegarde refusée (${status})`); }
          return 'terminal';
        }
        return attemptSave(remaining);
      }
    };
    const result = await attemptSave([0, 1000, 3000]);
    if (result === 'saved') {
      removeAuditDraft(parametre, question.ref, draft.updatedAt);
      if (revision.current === currentRevision) { setSaveState('saved'); setSaveMessage('Enregistré automatiquement'); }
      onSaved();
      return;
    }
    if (result === 'failed' && revision.current === currentRevision) {
      setSaveState('error');
      setSaveMessage(navigator.onLine ? 'Serveur indisponible · nouvelle tentative automatique' : 'Hors ligne · modification conservée');
      if (navigator.onLine) retryTimer.current = setTimeout(() => window.dispatchEvent(new Event('online')), 15000);
    }
  }, [onSaved, parametre, question.ref]);

  useEffect(() => {
    const subscription = form.watch((values, { name }) => {
      if (!name) return;
      if (timer.current) clearTimeout(timer.current);
      const currentRevision = revision.current + 1;
      revision.current = currentRevision;
      setSaveState('saving');
      const nextMark = values.note === '' || values.note === undefined ? null : Number(values.note);
      onChange(question.ref, nextMark, values.commentaire ?? '');
      timer.current = setTimeout(() => {
        persist(values as FormValues, currentRevision).catch(() => undefined);
        timer.current = null;
      }, name === 'note' ? 150 : 700);
    });
    return () => {
      subscription.unsubscribe();
      if (retryTimer.current) clearTimeout(retryTimer.current);
      if (timer.current) {
        clearTimeout(timer.current);
        const currentRevision = revision.current + 1;
        revision.current = currentRevision;
        persist(form.getValues(), currentRevision).catch(() => undefined);
      }
    };
  }, [form, onChange, persist, question.ref]);

  useEffect(() => {
    const retry = () => {
      const values = form.getValues();
      if (values.note === '') return;
      const currentRevision = revision.current + 1;
      revision.current = currentRevision;
      persist(values, currentRevision).catch(() => undefined);
    };
    window.addEventListener('online', retry);
    if (queuedDraft) retry();
    return () => window.removeEventListener('online', retry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const status = {
    idle: { label: 'Non renseigné', icon: Cloud, className: 'text-slate-400' },
    saving: { label: saveMessage || 'Synchronisation…', icon: Cloud, className: 'text-amber-600' },
    saved: { label: saveMessage || 'Enregistré automatiquement', icon: Check, className: 'text-emerald-600' },
    error: { label: saveMessage || 'Échec de la sauvegarde', icon: AlertCircle, className: 'text-red-600' },
  }[saveState];
  const StatusIcon = status.icon;

  return (
    <Card id={`question-${question.ref}`} className="scroll-mt-24 overflow-hidden rounded-2xl border-slate-200 shadow-sm target:ring-2 target:ring-violet-400">
      <CardHeader className="border-b border-slate-100 bg-slate-50/70 p-5">
        <div className="flex items-start gap-3"><span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-violet-100 text-sm font-bold text-violet-700">{nb + 1}</span><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs font-semibold uppercase tracking-wide text-violet-700">{question.chantier}</p><span className={cn('flex items-center gap-1.5 text-xs font-medium', status.className)} aria-live="polite"><StatusIcon className={cn('h-3.5 w-3.5', saveState === 'saving' && 'animate-pulse')} />{status.label}</span></div><h2 className="mt-1 text-base font-semibold leading-6 text-slate-950">{question.question}</h2></div></div>
      </CardHeader>
      <CardContent className="space-y-5 p-5">
        <fieldset><legend className="text-sm font-semibold text-slate-800">Niveau de conformité</legend><p className="mt-1 text-xs text-slate-500">0 = non conforme · 4 = totalement maîtrisé</p><div className="mt-3 grid grid-cols-5 gap-2">{[0, 1, 2, 3, 4].map((score) => <button key={score} type="button" onClick={() => form.setValue('note', String(score), { shouldValidate: true, shouldDirty: true })} className={cn('h-11 rounded-xl border text-sm font-bold transition', selectedNote === String(score) ? 'border-violet-600 bg-violet-600 text-white shadow-sm' : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:bg-violet-50')} aria-pressed={selectedNote === String(score)}>{score}</button>)}</div>{form.formState.errors.note && <p className="mt-2 text-sm text-red-600">{form.formState.errors.note.message}</p>}</fieldset>

        <div><div className="flex items-center justify-between"><label htmlFor={`comment-${question.ref}`} className="text-sm font-semibold text-slate-800">Commentaire</label><span className="text-xs text-slate-400">{comment.length}/1000</span></div><Textarea id={`comment-${question.ref}`} rows={4} maxLength={1000} placeholder="Justifiez la note avec des faits, preuves ou observations…" {...form.register('commentaire')} className="mt-2 resize-y rounded-xl border-slate-300 text-sm focus-visible:ring-violet-500" />{form.formState.errors.commentaire && <p className="mt-2 text-sm text-red-600">{form.formState.errors.commentaire.message}</p>}</div>

        {question['aide à la notation']?.length > 0 && <details className="group rounded-xl border border-slate-200 bg-slate-50 p-4"><summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-slate-700"><BookOpen className="h-4 w-4 text-violet-600" />Afficher l’aide à la notation</summary><div className="mt-3 space-y-2 border-t border-slate-200 pt-3">{question['aide à la notation'].filter((item) => !item.startsWith('--')).map((item) => <p key={item} className="text-xs leading-5 text-slate-600">{item}</p>)}</div></details>}
      </CardContent>
    </Card>
  );
}