/* eslint-disable jsx-a11y/label-has-associated-control, no-nested-ternary */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertCircle, ArrowLeft, Bot, Check, CheckCircle2, Cloud, Loader2, Plus, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import API from '@/lib/api-client';

type Priority = 'low' | 'medium' | 'high' | 'critical';
type ActionStatus = 'todo' | 'in_progress' | 'done';
type Level = 'low' | 'medium' | 'high';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type ActionItem = {
  id: string;
  title: string;
  description: string;
  question_ref: number | null;
  priority: Priority;
  impact: Level;
  effort: Level;
  owner: string;
  due_date: string | null;
  estimated_cost: number;
  human_days: number;
  resources: string;
  status: ActionStatus;
};
type AuditQuestion = { ref: number; question: string; comment?: string; 'note numérique': number | null };
type AuditResults = { audit: { companie: string }; questions: AuditQuestion[] };
type ActionPlanResponse = { items: ActionItem[] };

const emptyAction = (): ActionItem => ({
  id: crypto.randomUUID(),
  title: '',
  description: '',
  question_ref: null,
  priority: 'medium',
  impact: 'medium',
  effort: 'medium',
  owner: '',
  due_date: null,
  estimated_cost: 0,
  human_days: 0,
  resources: '',
  status: 'todo',
});

const priorityLabel: Record<Priority, string> = { low: 'Faible', medium: 'Moyenne', high: 'Haute', critical: 'Critique' };
const levelLabel: Record<Level, string> = { low: 'Faible', medium: 'Moyen', high: 'Fort' };
const statusLabel: Record<ActionStatus, string> = { todo: 'À faire', in_progress: 'En cours', done: 'Terminée' };

export default function ActionPlan({ params }: { params: { idAudit: string } }) {
  const [company, setCompany] = useState('');
  const [questions, setQuestions] = useState<AuditQuestion[]>([]);
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revision = useRef(0);
  const storageKey = `ornisec:action-plan:${params.idAudit}`;

  useEffect(() => {
    Promise.all([
      API.get<AuditResults>(`audit/${params.idAudit}/results`),
      API.get<ActionPlanResponse>(`audit/${params.idAudit}/action-plan`),
    ]).then(([results, plan]) => {
      setCompany(results.data.audit.companie);
      setQuestions(results.data.questions);
      const normalized = plan.data.items.map((item) => ({ ...item, impact: item.impact || 'medium', effort: item.effort || 'medium' }));
      const localDraft = window.localStorage.getItem(storageKey);
      setItems(localDraft ? JSON.parse(localDraft) as ActionItem[] : normalized);
    }).catch(() => toast.error("Impossible de charger le plan d'action.")).finally(() => { setLoading(false); setLoaded(true); });
  }, [params.idAudit, storageKey]);

  const totals = useMemo(() => ({
    cost: items.reduce((sum, item) => sum + Number(item.estimated_cost || 0), 0),
    days: items.reduce((sum, item) => sum + Number(item.human_days || 0), 0),
    done: items.filter((item) => item.status === 'done').length,
    priorities: {
      critical: items.filter((item) => item.priority === 'critical').length,
      high: items.filter((item) => item.priority === 'high').length,
      medium: items.filter((item) => item.priority === 'medium').length,
      low: items.filter((item) => item.priority === 'low').length,
    },
    quickWins: items.filter((item) => item.impact === 'high' && item.effort === 'low').length,
    longTerm: items.filter((item) => item.effort === 'high').length,
    strategic: items.filter((item) => item.impact === 'high' && item.effort !== 'low').length,
  }), [items]);

  const persist = useCallback(async (snapshot: ActionItem[], currentRevision: number) => {
    if (snapshot.some((item) => !item.title.trim())) { setSaveState('idle'); return; }
    setSaveState('saving');
    try {
      await API.put(`audit/${params.idAudit}/action-plan`, { items: snapshot });
      if (revision.current === currentRevision) {
        window.localStorage.removeItem(storageKey);
        setSaveState('saved');
      }
    } catch {
      if (revision.current === currentRevision) setSaveState('error');
    }
  }, [params.idAudit, storageKey]);

  useEffect(() => {
    if (!loaded) return undefined;
    window.localStorage.setItem(storageKey, JSON.stringify(items));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    const currentRevision = revision.current + 1;
    revision.current = currentRevision;
    setSaveState('saving');
    saveTimer.current = setTimeout(() => { persist(items, currentRevision).catch(() => undefined); }, 800);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [items, loaded, persist, storageKey]);

  useEffect(() => {
    const retry = () => {
      const currentRevision = revision.current + 1;
      revision.current = currentRevision;
      persist(items, currentRevision).catch(() => undefined);
    };
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [items, persist]);

  const update = <K extends keyof ActionItem>(id: string, key: K, value: ActionItem[K]) => {
    setItems((current) => current.map((item) => item.id === id ? { ...item, [key]: value } : item));
  };

  const addFromGaps = () => {
    const existingRefs = new Set(items.map((item) => item.question_ref));
    const gaps = questions.filter((question) => question['note numérique'] !== null && question['note numérique'] < 3 && !existingRefs.has(question.ref)).slice(0, 10);
    if (!gaps.length) { toast('Aucun nouvel écart prioritaire à ajouter.'); return; }
    setItems((current) => [...current, ...gaps.map((question) => ({
      ...emptyAction(),
      title: question.question,
      description: question.comment || '',
      question_ref: question.ref,
      priority: question['note numérique'] !== null && question['note numérique'] <= 1 ? 'critical' as const : 'high' as const,
    }))]);
    toast.success(`${gaps.length} action(s) créée(s) depuis les écarts.`);
  };

  if (loading) return <div className="page-shell flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-violet-700" /></div>;

  return (
    <main className="page-shell">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div><Button asChild variant="ghost" size="sm" className="-ml-3 mb-3"><Link href={`/finished-audits/${params.idAudit}`}><ArrowLeft className="mr-2 h-4 w-4" />Retour au rapport</Link></Button><p className="text-sm font-semibold text-violet-700">Mise en conformité</p><h1 className="page-heading mt-1">Plan d’action · {company}</h1><p className="page-subtitle">Priorisez les corrections et estimez les moyens nécessaires.</p></div>
        <div className="flex flex-col items-end gap-2"><Button type="button" variant="outline" disabled title="Disponible dans une prochaine version"><Bot className="mr-2 h-4 w-4" />Proposer avec l’IA</Button><span className={`flex items-center gap-1.5 text-xs font-medium ${saveState === 'error' ? 'text-red-600' : saveState === 'saved' ? 'text-emerald-600' : saveState === 'idle' ? 'text-slate-500' : 'text-amber-600'}`}>{saveState === 'error' ? <AlertCircle className="h-3.5 w-3.5" /> : saveState === 'saved' ? <Check className="h-3.5 w-3.5" /> : <Cloud className="h-3.5 w-3.5 animate-pulse" />}{saveState === 'error' ? 'Serveur indisponible · brouillon conservé' : saveState === 'saved' ? 'Enregistré automatiquement' : saveState === 'idle' ? 'Brouillon local · titre requis' : 'Synchronisation…'}</span></div>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="surface-card p-4"><p className="text-xs text-slate-500">Actions</p><p className="mt-1 text-2xl font-bold">{items.length}</p></div>
        <div className="surface-card p-4"><p className="text-xs text-slate-500">Terminées</p><p className="mt-1 text-2xl font-bold text-emerald-600">{totals.done}/{items.length}</p></div>
        <div className="surface-card p-4"><p className="text-xs text-slate-500">Budget estimé</p><p className="mt-1 text-2xl font-bold">{totals.cost.toLocaleString('fr-FR')} €</p></div>
        <div className="surface-card p-4"><p className="text-xs text-slate-500">Charge humaine</p><p className="mt-1 text-2xl font-bold">{totals.days.toLocaleString('fr-FR')} j.h</p></div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2"><div className="surface-card p-5"><h2 className="font-semibold text-slate-900">Répartition par priorité</h2><div className="mt-4 grid grid-cols-4 gap-2">{Object.entries(totals.priorities).map(([priority, count]) => <div key={priority} className="rounded-xl bg-slate-50 p-3 text-center"><p className="text-xl font-bold text-slate-900">{count}</p><p className="mt-1 text-xs text-slate-500">{priorityLabel[priority as Priority]}</p></div>)}</div></div><div className="surface-card p-5"><h2 className="font-semibold text-slate-900">Lecture stratégique</h2><div className="mt-4 grid grid-cols-3 gap-2"><div className="rounded-xl bg-emerald-50 p-3"><p className="text-xl font-bold text-emerald-700">{totals.quickWins}</p><p className="text-xs text-emerald-800">Quick wins</p></div><div className="rounded-xl bg-violet-50 p-3"><p className="text-xl font-bold text-violet-700">{totals.strategic}</p><p className="text-xs text-violet-800">Chantiers stratégiques</p></div><div className="rounded-xl bg-amber-50 p-3"><p className="text-xl font-bold text-amber-700">{totals.longTerm}</p><p className="text-xs text-amber-800">Long terme</p></div></div></div></section>

      <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-slate-500">Les écarts avec une note inférieure à 3 peuvent être convertis en actions.</p><div className="flex gap-2"><Button type="button" variant="outline" onClick={addFromGaps}>Créer depuis les écarts</Button><Button type="button" onClick={() => setItems((current) => [...current, emptyAction()])}><Plus className="mr-2 h-4 w-4" />Nouvelle action</Button></div></div>

      {items.length === 0 && <section className="surface-card p-10 text-center"><CheckCircle2 className="mx-auto h-9 w-9 text-slate-400" /><h2 className="mt-3 font-semibold">Aucune action pour le moment</h2><p className="mt-1 text-sm text-slate-500">Créez une action manuellement ou partez des écarts de l’audit.</p></section>}

      <section className="space-y-4">
        {items.map((item, index) => <article key={item.id} className="surface-card p-5"><div className="flex items-start gap-3"><span className="flex h-8 min-w-8 items-center justify-center rounded-lg bg-violet-100 text-sm font-bold text-violet-700">{index + 1}</span><div className="grid min-w-0 flex-1 gap-4 lg:grid-cols-4">
          <div className="lg:col-span-3"><label htmlFor={`title-${item.id}`} className="text-xs font-semibold text-slate-600">Action à réaliser</label><input id={`title-${item.id}`} value={item.title} onChange={(event) => update(item.id, 'title', event.target.value)} placeholder="Ex. Formaliser une procédure de gestion des incidents" className="form-input mt-1 h-10 w-full rounded-lg border-slate-300 text-sm" /></div>
          <div><label htmlFor={`priority-${item.id}`} className="text-xs font-semibold text-slate-600">Priorité</label><select id={`priority-${item.id}`} value={item.priority} onChange={(event) => update(item.id, 'priority', event.target.value as Priority)} className="form-select mt-1 h-10 w-full rounded-lg border-slate-300 text-sm">{Object.entries(priorityLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div><label htmlFor={`impact-${item.id}`} className="text-xs font-semibold text-slate-600">Impact conformité</label><select id={`impact-${item.id}`} value={item.impact} onChange={(event) => update(item.id, 'impact', event.target.value as Level)} className="form-select mt-1 h-10 w-full rounded-lg border-slate-300 text-sm">{Object.entries(levelLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div><label htmlFor={`effort-${item.id}`} className="text-xs font-semibold text-slate-600">Effort</label><select id={`effort-${item.id}`} value={item.effort} onChange={(event) => update(item.id, 'effort', event.target.value as Level)} className="form-select mt-1 h-10 w-full rounded-lg border-slate-300 text-sm">{Object.entries(levelLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
          <div className="lg:col-span-4"><label htmlFor={`description-${item.id}`} className="text-xs font-semibold text-slate-600">Résultat attendu / détails</label><textarea id={`description-${item.id}`} value={item.description} onChange={(event) => update(item.id, 'description', event.target.value)} rows={2} className="form-textarea mt-1 w-full rounded-lg border-slate-300 text-sm" /></div>
          <div><label htmlFor={`owner-${item.id}`} className="text-xs font-semibold text-slate-600">Pilote</label><input id={`owner-${item.id}`} value={item.owner} onChange={(event) => update(item.id, 'owner', event.target.value)} placeholder="Nom ou équipe" className="form-input mt-1 h-10 w-full rounded-lg border-slate-300 text-sm" /></div>
          <div><label htmlFor={`date-${item.id}`} className="text-xs font-semibold text-slate-600">Échéance</label><input id={`date-${item.id}`} type="date" value={item.due_date || ''} onChange={(event) => update(item.id, 'due_date', event.target.value || null)} className="form-input mt-1 h-10 w-full rounded-lg border-slate-300 text-sm" /></div>
          <div><label htmlFor={`cost-${item.id}`} className="text-xs font-semibold text-slate-600">Coût estimé (€)</label><input id={`cost-${item.id}`} type="number" min={0} value={item.estimated_cost} onChange={(event) => update(item.id, 'estimated_cost', Number(event.target.value))} className="form-input mt-1 h-10 w-full rounded-lg border-slate-300 text-sm" /></div>
          <div><label htmlFor={`days-${item.id}`} className="text-xs font-semibold text-slate-600">Charge (jours-homme)</label><input id={`days-${item.id}`} type="number" min={0} step={0.5} value={item.human_days} onChange={(event) => update(item.id, 'human_days', Number(event.target.value))} className="form-input mt-1 h-10 w-full rounded-lg border-slate-300 text-sm" /></div>
          <div className="lg:col-span-3"><label htmlFor={`resources-${item.id}`} className="text-xs font-semibold text-slate-600">Ressources nécessaires</label><input id={`resources-${item.id}`} value={item.resources} onChange={(event) => update(item.id, 'resources', event.target.value)} placeholder="Compétences, prestataire, logiciel, matériel…" className="form-input mt-1 h-10 w-full rounded-lg border-slate-300 text-sm" /></div>
          <div><label htmlFor={`status-${item.id}`} className="text-xs font-semibold text-slate-600">Statut</label><select id={`status-${item.id}`} value={item.status} onChange={(event) => update(item.id, 'status', event.target.value as ActionStatus)} className="form-select mt-1 h-10 w-full rounded-lg border-slate-300 text-sm">{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
        </div><Button type="button" variant="ghost" size="icon" aria-label="Supprimer cette action" onClick={() => setItems((current) => current.filter((candidate) => candidate.id !== item.id))} className="text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></Button></div></article>)}
      </section>
    </main>
  );
}
