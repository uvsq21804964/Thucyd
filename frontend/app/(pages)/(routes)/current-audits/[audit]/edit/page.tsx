/* eslint-disable no-nested-ternary */

'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { CheckCircle2, ChevronLeft, ChevronRight, History, ListFilter, Loader2, Video } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import API from '@/lib/api-client';
import { QuestionnaireReference } from '@/lib/questionnaires';
import { cn } from '@/lib/utils';
import Questionnaire from './_components/Questionnaire';

type AuditInfo = { companie: string; chef?: string; finished: boolean; questionnaire_reference?: QuestionnaireReference };
type CurrentUser = { name: string; role: number };
type Gauge = { incomplete: number; 'total question': number };
type QuestionData = { ref: string | number; catégorie: string; chantier: string; question: string; comment: string; 'note numérique': number | null; 'aide à la notation': string[]; display_if?: { question_ref: number; operator: string; value?: number | number[] } };
type ApiError = { response?: { data?: { detail?: string | { incomplete?: number } } } };

export default function Edit({ params, searchParams }: { params: { audit: string }; searchParams: { category?: string; question?: string } }) {
  const router = useRouter();
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [questions, setQuestions] = useState<QuestionData[]>([]);
  const [auditInfo, setAuditInfo] = useState<AuditInfo | null>(null);
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [gauge, setGauge] = useState<Gauge | null>(null);
  const [loadingQuestions, setLoadingQuestions] = useState(false);
  const [closing, setClosing] = useState(false);
  const [confirmClosing, setConfirmClosing] = useState(false);
  const [onlyIncomplete, setOnlyIncomplete] = useState(false);

  useEffect(() => {
    Promise.all([
      API.get<string[]>(`categories/${params.audit}`), API.get<AuditInfo>(`audit/${params.audit}`),
      API.get<{ authenticated: boolean; user: CurrentUser }>('auth/me'), API.get<Gauge>(`completionGauge/${params.audit}`),
    ]).then(([categoriesResponse, auditResponse, userResponse, gaugeResponse]) => {
      const requestedCategory = searchParams?.category; setCategories(categoriesResponse.data); setCategory(requestedCategory && categoriesResponse.data.includes(requestedCategory) ? requestedCategory : categoriesResponse.data[0] || ''); setAuditInfo(auditResponse.data); setUser(userResponse.data.user); setGauge(gaugeResponse.data);
    }).catch(() => toast.error("Impossible de charger l'audit."));
  }, [params.audit, searchParams?.category]);

  useEffect(() => {
    if (!category) return;
    setLoadingQuestions(true);
    API.get<QuestionData[]>(`questions/${encodeURIComponent(category)}/${params.audit}`)
      .then(({ data }) => setQuestions(data)).catch(() => toast.error('Impossible de charger cette catégorie.')).finally(() => setLoadingQuestions(false));
  }, [params.audit, category]);

  useEffect(() => {
    if (loadingQuestions || !searchParams?.question) return undefined;
    const timer = window.setTimeout(() => {
      document.getElementById(`question-${searchParams.question}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 100);
    return () => {
      window.clearTimeout(timer);
    };
  }, [category, loadingQuestions, searchParams?.question]);

  const canClose = Boolean(user && auditInfo && (user.role === 0 || user.role === 1 || user.name.toLocaleLowerCase() === auditInfo.chef?.toLocaleLowerCase()));
  const categoryIndex = Math.max(categories.indexOf(category), 0);
  const completion = gauge && gauge['total question'] ? Math.round(((gauge['total question'] - gauge.incomplete) / gauge['total question']) * 100) : 0;
  const filteredQuestions = onlyIncomplete ? questions.filter((question) => question['note numérique'] === null) : questions;
  const completeInCategory = questions.filter((question) => question['note numérique'] !== null).length;

  const refreshAuditState = useCallback(() => {
    Promise.all([
      API.get<Gauge>(`completionGauge/${params.audit}`),
      API.get<string[]>(`categories/${params.audit}`),
      category ? API.get<QuestionData[]>(`questions/${encodeURIComponent(category)}/${params.audit}`) : Promise.resolve({ data: [] as QuestionData[] }),
    ]).then(([gaugeResponse, categoriesResponse, questionsResponse]) => {
      setGauge(gaugeResponse.data);
      setCategories(categoriesResponse.data);
      if (category && categoriesResponse.data.includes(category)) setQuestions(questionsResponse.data);
      else setCategory(categoriesResponse.data[0] || '');
    }).catch(() => undefined);
  }, [category, params.audit]);

  const updateQuestion = useCallback((ref: string | number, mark: number | null, comment: string) => {
    setQuestions((current) => current.map((question) => question.ref === ref ? { ...question, 'note numérique': mark, comment } : question));
  }, []);

  const completeAudit = async () => {
    setClosing(true);
    try {
      await API.post(`audit/${params.audit}/complete`); toast.success('Audit clôturé avec succès.'); router.push(`/finished-audits/${params.audit}`); router.refresh();
    } catch (requestError) {
      const detail = (requestError as ApiError).response?.data?.detail;
      let message = "La clôture de l'audit a échoué.";
      if (typeof detail === 'object' && detail?.incomplete) message = `${detail.incomplete} question(s) restent à noter.`;
      else if (typeof detail === 'string') message = detail;
      toast.error(message);
      setConfirmClosing(false);
    } finally { setClosing(false); }
  };

  return (
    <div className="page-shell">
      <header className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-sm font-semibold text-violet-700">Questionnaire d’audit</p><h1 className="page-heading mt-1">{auditInfo?.companie || 'Chargement…'}</h1><p className="page-subtitle">{category || 'Préparation des catégories'}</p></div>
          <div className="flex items-center gap-3">
            {!auditInfo?.finished && <Button asChild type="button" variant="outline" className="rounded-xl bg-white"><Link href={`/current-audits/${params.audit}/interview`}><Video className="mr-2 h-4 w-4 text-violet-700" />Entretien IA</Link></Button>}
            <Button asChild type="button" variant="outline" className="rounded-xl bg-white"><Link href={`/current-audits/${params.audit}/interview/review`}><ListFilter className="mr-2 h-4 w-4 text-violet-700" />Revue IA</Link></Button>
            {canClose && !auditInfo?.finished && (confirmClosing ? <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 p-2"><span className="hidden text-xs text-amber-900 lg:inline">Clôturer définitivement ?</span><Button type="button" size="sm" variant="outline" disabled={closing} onClick={() => setConfirmClosing(false)}>Annuler</Button><Button type="button" size="sm" disabled={closing} onClick={completeAudit}>{closing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Confirmer</Button></div> : <Button type="button" onClick={() => { if (gauge?.incomplete) { setOnlyIncomplete(true); toast.error(`${gauge.incomplete} question(s) restent à noter avant la clôture.`); } else setConfirmClosing(true); }} className="rounded-xl bg-emerald-600 hover:bg-emerald-700"><CheckCircle2 className="mr-2 h-4 w-4" />Clôturer</Button>)}
          </div>
        </div>

        {auditInfo?.questionnaire_reference && (
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-xl border border-violet-100 bg-violet-50/70 px-4 py-2.5 text-sm text-violet-950">
            <History className="h-4 w-4 text-violet-700" />
            <span className="font-semibold">Référentiel utilisé :</span>
            <span>{auditInfo.questionnaire_reference.name}</span>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-semibold text-violet-700">
              version {auditInfo.questionnaire_reference.version}
            </span>
            <span className="text-xs text-violet-700/70">
              {auditInfo.questionnaire_reference.question_count} questions
            </span>
          </div>
        )}

        {gauge && <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm" aria-label="Progression de l'audit"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm font-semibold text-slate-900">{gauge['total question'] - gauge.incomplete} sur {gauge['total question']} questions complétées</p><p className="mt-1 text-xs text-slate-500">{gauge.incomplete ? `${gauge.incomplete} réponse(s) à compléter` : 'Toutes les questions sont complétées'}</p></div><span className="text-2xl font-bold text-violet-700">{completion}%</span></div><div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full rounded-full bg-violet-600 transition-all duration-500" style={{ width: `${completion}%` }} /></div></section>}

        <nav className="flex gap-2 overflow-x-auto pb-2" aria-label="Catégories de l'audit">
          {categories.map((item, index) => <button key={item} type="button" onClick={() => { setCategory(item); setOnlyIncomplete(false); }} className={cn('whitespace-nowrap rounded-full border px-4 py-2 text-sm font-medium transition', item === category ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300 hover:text-violet-700')}><span className="mr-1.5 text-xs opacity-70">{index + 1}</span>{item}</button>)}
        </nav>
      </header>

      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-600">{completeInCategory}/{questions.length} complétées dans cette catégorie</p><Button type="button" size="sm" variant={onlyIncomplete ? 'default' : 'outline'} onClick={() => setOnlyIncomplete((value) => !value)} className="rounded-xl"><ListFilter className="mr-2 h-4 w-4" />{onlyIncomplete ? 'Afficher toutes les questions' : 'Afficher uniquement les incomplètes'}</Button></div>

      {loadingQuestions ? <div className="surface-card flex items-center justify-center gap-2 p-12 text-sm text-slate-500"><Loader2 className="h-5 w-5 animate-spin" />Chargement des questions…</div> : onlyIncomplete && filteredQuestions.length === 0 ? <div className="surface-card p-10 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" /><p className="mt-3 font-semibold text-slate-900">Cette catégorie est complète</p><Button type="button" variant="link" onClick={() => setOnlyIncomplete(false)}>Afficher toutes les questions</Button></div> : <Questionnaire questions={filteredQuestions} para={params.audit} onChange={updateQuestion} onSaved={refreshAuditState} />}

      {categories.length > 1 && <footer className="flex items-center justify-between border-t border-slate-200 pt-5"><Button type="button" variant="outline" disabled={categoryIndex === 0} onClick={() => { setCategory(categories[categoryIndex - 1]); setOnlyIncomplete(false); }} className="rounded-xl"><ChevronLeft className="mr-2 h-4 w-4" />Précédente</Button><span className="text-xs text-slate-500">{categoryIndex + 1} / {categories.length}</span><Button type="button" variant="outline" disabled={categoryIndex === categories.length - 1} onClick={() => { setCategory(categories[categoryIndex + 1]); setOnlyIncomplete(false); }} className="rounded-xl">Suivante<ChevronRight className="ml-2 h-4 w-4" /></Button></footer>}
    </div>
  );
}