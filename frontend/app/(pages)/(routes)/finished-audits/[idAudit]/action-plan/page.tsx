/* eslint-disable jsx-a11y/label-has-associated-control, no-nested-ternary */

'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  AlertCircle,
  ArrowLeft,
  Bot,
  Check,
  CheckCircle2,
  Cloud,
  Loader2,
  Plus,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import API from '@/lib/api-client';

type Priority = 'low' | 'medium' | 'high' | 'critical';
type ActionStatus = 'todo' | 'in_progress' | 'done';
type Level = 'low' | 'medium' | 'high';
type SaveState = 'idle' | 'saving' | 'saved' | 'error';
type ValidationStatus = 'pending' | 'validated' | 'rejected';
type ActionSource = 'human' | 'rules';
type ReviewFilter = 'all' | ValidationStatus;

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
  source: ActionSource;
  validation_status: ValidationStatus;
  validation_comment: string;
  validated_by: string | null;
  validated_at: string | null;
};

type AuditResults = { audit: { companie: string } };
type ActionPlanResponse = { items: ActionItem[] };
type GenerationResponse = ActionPlanResponse & { generated_count: number; gap_count: number; message: string };
type ValidationResponse = { item: ActionItem; message: string };

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
  source: 'human',
  validation_status: 'pending',
  validation_comment: '',
  validated_by: null,
  validated_at: null,
});

const normalizeItem = (item: Partial<ActionItem>): ActionItem => ({
  ...emptyAction(),
  ...item,
  id: item.id || crypto.randomUUID(),
  source: item.source || 'human',
  validation_status: item.validation_status || 'pending',
  validation_comment: item.validation_comment || '',
  validated_by: item.validated_by || null,
  validated_at: item.validated_at || null,
});

const priorityLabel: Record<Priority, string> = {
  low: 'Faible', medium: 'Moyenne', high: 'Haute', critical: 'Critique',
};
const levelLabel: Record<Level, string> = { low: 'Faible', medium: 'Moyen', high: 'Fort' };
const statusLabel: Record<ActionStatus, string> = { todo: 'À faire', in_progress: 'En cours', done: 'Terminée' };
const validationLabel: Record<ValidationStatus, string> = {
  pending: 'À valider', validated: 'Validée', rejected: 'À corriger',
};
const materialFields = new Set<keyof ActionItem>([
  'title', 'description', 'question_ref', 'priority', 'impact', 'effort', 'owner',
  'due_date', 'estimated_cost', 'human_days', 'resources',
]);

const errorMessage = (error: unknown, fallback: string) => {
  const candidate = error as { response?: { data?: { detail?: string } } };
  return candidate.response?.data?.detail || fallback;
};

export default function ActionPlan({ params }: { params: { idAudit: string } }) {
  const [company, setCompany] = useState('');
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loaded, setLoaded] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [generating, setGenerating] = useState(false);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewComments, setReviewComments] = useState<Record<string, string>>({});
  const [reviewFilter, setReviewFilter] = useState<ReviewFilter>('all');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const revision = useRef(0);
  const storageKey = `ornisec:action-plan:${params.idAudit}`;

  useEffect(() => {
    Promise.all([
      API.get<AuditResults>(`audit/${params.idAudit}/results`),
      API.get<ActionPlanResponse>(`audit/${params.idAudit}/action-plan`),
    ])
      .then(([results, plan]) => {
        setCompany(results.data.audit.companie);
        const serverItems = plan.data.items.map(normalizeItem);
        const localDraft = window.localStorage.getItem(storageKey);
        if (localDraft) {
          try {
            setItems((JSON.parse(localDraft) as Partial<ActionItem>[]).map(normalizeItem));
          } catch {
            setItems(serverItems);
          }
        } else {
          setItems(serverItems);
        }
      })
      .catch(() => toast.error("Impossible de charger le plan d'action."))
      .finally(() => {
        setLoading(false);
        setLoaded(true);
      });
  }, [params.idAudit, storageKey]);

  const clearSaveTimer = useCallback(() => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = null;
  }, []);

  const saveSnapshot = useCallback(async (snapshot: ActionItem[]) => {
    const savable = snapshot.filter((item) => item.title.trim().length >= 2);
    const response = await API.put<ActionPlanResponse>(`audit/${params.idAudit}/action-plan`, { items: savable });
    return response.data.items.map(normalizeItem);
  }, [params.idAudit]);
  useEffect(() => {
    if (!loaded) return undefined;
    revision.current += 1;
    const currentRevision = revision.current;
    clearSaveTimer();
    window.localStorage.setItem(storageKey, JSON.stringify(items));
    if (items.length > 0 && !items.some((item) => item.title.trim().length >= 2)) {
      setSaveState('idle');
      return undefined;
    }
    setSaveState('saving');
    saveTimer.current = setTimeout(async () => {
      try {
        await saveSnapshot(items);
        if (items.every((item) => item.title.trim().length >= 2)) window.localStorage.removeItem(storageKey);
        if (revision.current === currentRevision) setSaveState('saved');
      } catch {
        if (revision.current === currentRevision) setSaveState('error');
      }
    }, 750);
    return clearSaveTimer;
  }, [clearSaveTimer, items, loaded, saveSnapshot, storageKey]);

  useEffect(() => {
    const retry = async () => {
      if (items.length > 0 && !items.some((item) => item.title.trim().length >= 2)) return;
      revision.current += 1;
      const currentRevision = revision.current;
      setSaveState('saving');
      try {
        await saveSnapshot(items);
        if (items.every((item) => item.title.trim().length >= 2)) window.localStorage.removeItem(storageKey);
        if (revision.current === currentRevision) setSaveState('saved');
      } catch {
        if (revision.current === currentRevision) setSaveState('error');
      }
    };
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [items, saveSnapshot, storageKey]);
  const totals = useMemo(() => ({
    cost: items.reduce((sum, item) => sum + Number(item.estimated_cost || 0), 0),
    days: items.reduce((sum, item) => sum + Number(item.human_days || 0), 0),
    validatedCost: items
      .filter((item) => item.validation_status === 'validated')
      .reduce((sum, item) => sum + Number(item.estimated_cost || 0), 0),
    validated: items.filter((item) => item.validation_status === 'validated').length,
    pending: items.filter((item) => item.validation_status === 'pending').length,
    rejected: items.filter((item) => item.validation_status === 'rejected').length,
    done: items.filter((item) => item.status === 'done').length,
    quickWins: items.filter((item) => item.impact === 'high' && item.effort === 'low').length,
    priorities: {
      critical: items.filter((item) => item.priority === 'critical').length,
      high: items.filter((item) => item.priority === 'high').length,
      medium: items.filter((item) => item.priority === 'medium').length,
      low: items.filter((item) => item.priority === 'low').length,
    },
  }), [items]);

  const visibleItems = useMemo(
    () => items.filter((item) => reviewFilter === 'all' || item.validation_status === reviewFilter),
    [items, reviewFilter],
  );

  const update = <K extends keyof ActionItem>(id: string, key: K, value: ActionItem[K]) => {
    setItems((current) => current.map((item) => {
      if (item.id !== id) return item;
      const updated = { ...item, [key]: value } as ActionItem;
      if (materialFields.has(key) && item[key] !== value) {
        updated.validation_status = 'pending';
        updated.validation_comment = '';
        updated.validated_by = null;
        updated.validated_at = null;
      }
      return updated;
    }));
  };

  const generateFromGaps = async () => {
    if (items.some((item) => item.title.trim().length < 2)) {
      toast.error('Complétez ou supprimez les actions sans titre avant la génération.');
      return;
    }
    setGenerating(true);
    clearSaveTimer();
    try {
      await saveSnapshot(items);
      const response = await API.post<GenerationResponse>(`audit/${params.idAudit}/action-plan/generate`);
      setItems(response.data.items.map(normalizeItem));
      setSaveState('saved');
      if (response.data.generated_count) {
        toast.success(`${response.data.generated_count} proposition(s) créée(s) et à valider.`);
      } else if (response.data.gap_count) {
        toast('Tous les écarts ont déjà une action associée.');
      } else {
        toast('Aucun écart noté sous 3 à traiter.');
      }
    } catch (error) {
      toast.error(errorMessage(error, 'La génération du plan a échoué.'));
    } finally {
      setGenerating(false);
    }
  };

  const review = async (item: ActionItem, decision: 'validated' | 'rejected') => {
    const comment = (reviewComments[item.id] || '').trim();
    if (decision === 'rejected' && !comment) {
      toast.error('Indiquez la correction attendue avant de refuser.');
      return;
    }
    if (decision === 'validated' && (!item.owner.trim() || !item.due_date)) {
      toast.error("Renseignez le responsable et l'échéance avant validation.");
      return;
    }
    setReviewingId(item.id);
    clearSaveTimer();
    try {
      await saveSnapshot(items);
      const response = await API.patch<ValidationResponse>(
        `audit/${params.idAudit}/action-plan/items/${item.id}/validation`,
        { decision, comment },
      );
      const reviewed = normalizeItem(response.data.item);
      setItems((current) => current.map((candidate) => candidate.id === item.id ? reviewed : candidate));
      setReviewComments((current) => ({ ...current, [item.id]: '' }));
      setSaveState('saved');
      toast.success(decision === 'validated' ? 'Action validée.' : 'Action renvoyée pour correction.');
    } catch (error) {
      toast.error(errorMessage(error, "La validation n'a pas pu être enregistrée."));
    } finally {
      setReviewingId(null);
    }
  };

  if (loading) {
    return <div className="page-shell flex items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-violet-700" /></div>;
  }

  const saveLabel = saveState === 'error'
    ? 'Serveur indisponible · brouillon conservé'
    : saveState === 'saved'
      ? 'Enregistré automatiquement'
      : saveState === 'saving'
        ? 'Synchronisation…'
        : 'Brouillon local · titre requis';

  return (
    <main className="page-shell space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3 mb-3">
            <Link href={`/finished-audits/${params.idAudit}`}><ArrowLeft className="mr-2 h-4 w-4" />Retour au rapport</Link>
          </Button>
          <p className="text-sm font-semibold text-violet-700">Mise en conformité</p>
          <h1 className="page-heading mt-1">Plan d’action · {company}</h1>
          <p className="page-subtitle">Transformez les écarts en actions chiffrées, puis faites-les valider.</p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button type="button" onClick={generateFromGaps} disabled={generating}>
            {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bot className="mr-2 h-4 w-4" />}
            Générer depuis les écarts
          </Button>
          <span className={`flex items-center gap-1.5 text-xs font-medium ${saveState === 'error' ? 'text-red-600' : saveState === 'saved' ? 'text-emerald-600' : 'text-slate-500'}`}>
            {saveState === 'error' ? <AlertCircle className="h-3.5 w-3.5" /> : saveState === 'saved' ? <Check className="h-3.5 w-3.5" /> : <Cloud className="h-3.5 w-3.5" />}
            {saveLabel}
          </span>
        </div>
      </header>
      <section className="rounded-2xl border border-violet-200 bg-violet-50/70 p-4">
        <div className="flex gap-3">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-violet-700" />
          <div>
            <h2 className="text-sm font-semibold text-violet-950">Des propositions, pas des décisions automatiques</h2>
            <p className="mt-1 text-sm text-violet-800">
              Les coûts, charges, responsables et échéances sont des estimations initiales. Un humain doit les contrôler avant qu’ils soient comptabilisés comme validés.
            </p>
          </div>
        </div>
      </section>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="surface-card p-4"><p className="text-xs text-slate-500">Actions</p><p className="mt-1 text-2xl font-bold">{items.length}</p></div>
        <div className="surface-card p-4"><p className="text-xs text-slate-500">À valider</p><p className="mt-1 text-2xl font-bold text-amber-600">{totals.pending}</p></div>
        <div className="surface-card p-4"><p className="text-xs text-slate-500">Validées</p><p className="mt-1 text-2xl font-bold text-emerald-600">{totals.validated}</p></div>
        <div className="surface-card p-4"><p className="text-xs text-slate-500">Budget estimé</p><p className="mt-1 text-2xl font-bold">{totals.cost.toLocaleString('fr-FR')} €</p></div>
        <div className="surface-card p-4"><p className="text-xs text-slate-500">Charge humaine</p><p className="mt-1 text-2xl font-bold">{totals.days.toLocaleString('fr-FR')} j.h</p></div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="surface-card p-5">
          <h2 className="font-semibold text-slate-900">Répartition par priorité</h2>
          <div className="mt-4 grid grid-cols-4 gap-2">
            {Object.entries(totals.priorities).map(([priority, count]) => (
              <div key={priority} className="rounded-xl bg-slate-50 p-3 text-center">
                <p className="text-xl font-bold text-slate-900">{count}</p>
                <p className="mt-1 text-xs text-slate-500">{priorityLabel[priority as Priority]}</p>
              </div>
            ))}
          </div>
        </div>
        <div className="surface-card p-5">
          <h2 className="font-semibold text-slate-900">Décisions et exécution</h2>
          <div className="mt-4 grid grid-cols-3 gap-2">
            <div className="rounded-xl bg-emerald-50 p-3"><p className="text-xl font-bold text-emerald-700">{totals.validated}</p><p className="text-xs text-emerald-800">Validées</p></div>
            <div className="rounded-xl bg-red-50 p-3"><p className="text-xl font-bold text-red-700">{totals.rejected}</p><p className="text-xs text-red-800">À corriger</p></div>
            <div className="rounded-xl bg-sky-50 p-3"><p className="text-xl font-bold text-sky-700">{totals.done}/{items.length}</p><p className="text-xs text-sky-800">Terminées</p></div>
          </div>
          <p className="mt-3 text-xs text-slate-500">{totals.quickWins} quick win(s) identifié(s) · {totals.validatedCost.toLocaleString('fr-FR')} € de budget validé</p>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2" aria-label="Filtrer les actions">
          {([
            ['all', `Toutes (${items.length})`],
            ['pending', `À valider (${totals.pending})`],
            ['validated', `Validées (${totals.validated})`],
            ['rejected', `À corriger (${totals.rejected})`],
          ] as [ReviewFilter, string][]).map(([value, label]) => (
            <Button key={value} type="button" size="sm" variant={reviewFilter === value ? 'default' : 'outline'} onClick={() => setReviewFilter(value)}>{label}</Button>
          ))}
        </div>
        <Button type="button" variant="outline" onClick={() => setItems((current) => [...current, emptyAction()])}>
          <Plus className="mr-2 h-4 w-4" />Nouvelle action
        </Button>
      </div>

      {items.length === 0 && (
        <section className="surface-card p-10 text-center">
          <CheckCircle2 className="mx-auto h-9 w-9 text-slate-400" />
          <h2 className="mt-3 font-semibold">Aucune action pour le moment</h2>
          <p className="mt-1 text-sm text-slate-500">Générez des propositions depuis les écarts ou créez une action manuellement.</p>
        </section>
      )}

      {items.length > 0 && visibleItems.length === 0 && (
        <section className="surface-card p-8 text-center text-sm text-slate-500">Aucune action ne correspond à ce filtre.</section>
      )}

      <section className="space-y-4">
        {visibleItems.map((item) => {
          const index = items.findIndex((candidate) => candidate.id === item.id);
          const isReviewing = reviewingId === item.id;
          const badgeClass = item.validation_status === 'validated'
            ? 'bg-emerald-100 text-emerald-700'
            : item.validation_status === 'rejected'
              ? 'bg-red-100 text-red-700'
              : 'bg-amber-100 text-amber-700';
          return (
            <article key={item.id} className={`surface-card overflow-hidden border-l-4 ${item.validation_status === 'validated' ? 'border-l-emerald-500' : item.validation_status === 'rejected' ? 'border-l-red-500' : 'border-l-amber-400'}`}>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 min-w-7 items-center justify-center rounded-lg bg-violet-100 text-xs font-bold text-violet-700">{index + 1}</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${badgeClass}`}>{validationLabel[item.validation_status]}</span>
                  <span className="text-xs text-slate-500">{item.source === 'rules' ? 'Proposition générée' : 'Action manuelle'}{item.question_ref ? ` · écart #${item.question_ref}` : ''}</span>
                </div>
                <Button type="button" variant="ghost" size="icon" aria-label="Supprimer cette action" onClick={() => setItems((current) => current.filter((candidate) => candidate.id !== item.id))} className="text-slate-400 hover:text-red-600"><Trash2 className="h-4 w-4" /></Button>
              </div>

              <div className="grid gap-4 p-5 lg:grid-cols-4">
                <div className="lg:col-span-3"><label htmlFor={`title-${item.id}`} className="text-xs font-semibold text-slate-600">Action à réaliser</label><input id={`title-${item.id}`} value={item.title} onChange={(event) => update(item.id, 'title', event.target.value)} placeholder="Ex. Formaliser une procédure" className="form-input mt-1 h-10 w-full rounded-lg border-slate-300 text-sm" /></div>
                <div><label htmlFor={`priority-${item.id}`} className="text-xs font-semibold text-slate-600">Priorité</label><select id={`priority-${item.id}`} value={item.priority} onChange={(event) => update(item.id, 'priority', event.target.value as Priority)} className="form-select mt-1 h-10 w-full rounded-lg border-slate-300 text-sm">{Object.entries(priorityLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                <div><label htmlFor={`impact-${item.id}`} className="text-xs font-semibold text-slate-600">Impact conformité</label><select id={`impact-${item.id}`} value={item.impact} onChange={(event) => update(item.id, 'impact', event.target.value as Level)} className="form-select mt-1 h-10 w-full rounded-lg border-slate-300 text-sm">{Object.entries(levelLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                <div><label htmlFor={`effort-${item.id}`} className="text-xs font-semibold text-slate-600">Effort</label><select id={`effort-${item.id}`} value={item.effort} onChange={(event) => update(item.id, 'effort', event.target.value as Level)} className="form-select mt-1 h-10 w-full rounded-lg border-slate-300 text-sm">{Object.entries(levelLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
                <div><label htmlFor={`owner-${item.id}`} className="text-xs font-semibold text-slate-600">Responsable</label><input id={`owner-${item.id}`} value={item.owner} onChange={(event) => update(item.id, 'owner', event.target.value)} placeholder="Nom ou équipe" className="form-input mt-1 h-10 w-full rounded-lg border-slate-300 text-sm" /></div>
                <div><label htmlFor={`date-${item.id}`} className="text-xs font-semibold text-slate-600">Échéance</label><input id={`date-${item.id}`} type="date" value={item.due_date || ''} onChange={(event) => update(item.id, 'due_date', event.target.value || null)} className="form-input mt-1 h-10 w-full rounded-lg border-slate-300 text-sm" /></div>
                <div className="lg:col-span-4"><label htmlFor={`description-${item.id}`} className="text-xs font-semibold text-slate-600">Résultat attendu / détails</label><textarea id={`description-${item.id}`} value={item.description} onChange={(event) => update(item.id, 'description', event.target.value)} rows={2} className="form-textarea mt-1 w-full rounded-lg border-slate-300 text-sm" /></div>
                <div><label htmlFor={`cost-${item.id}`} className="text-xs font-semibold text-slate-600">Coût estimé (€)</label><input id={`cost-${item.id}`} type="number" min={0} value={item.estimated_cost} onChange={(event) => update(item.id, 'estimated_cost', Number(event.target.value))} className="form-input mt-1 h-10 w-full rounded-lg border-slate-300 text-sm" /></div>
                <div><label htmlFor={`days-${item.id}`} className="text-xs font-semibold text-slate-600">Charge (jours-homme)</label><input id={`days-${item.id}`} type="number" min={0} step={0.5} value={item.human_days} onChange={(event) => update(item.id, 'human_days', Number(event.target.value))} className="form-input mt-1 h-10 w-full rounded-lg border-slate-300 text-sm" /></div>
                <div className="lg:col-span-2"><label htmlFor={`resources-${item.id}`} className="text-xs font-semibold text-slate-600">Ressources nécessaires</label><input id={`resources-${item.id}`} value={item.resources} onChange={(event) => update(item.id, 'resources', event.target.value)} placeholder="Compétences, prestataire, logiciel…" className="form-input mt-1 h-10 w-full rounded-lg border-slate-300 text-sm" /></div>
                <div><label htmlFor={`status-${item.id}`} className="text-xs font-semibold text-slate-600">Avancement</label><select id={`status-${item.id}`} value={item.status} onChange={(event) => update(item.id, 'status', event.target.value as ActionStatus)} className="form-select mt-1 h-10 w-full rounded-lg border-slate-300 text-sm">{Object.entries(statusLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></div>
              </div>

              <div className="border-t border-slate-100 bg-slate-50/70 px-5 py-4">
                {item.validated_by && item.validated_at && (
                  <p className="mb-3 text-xs text-slate-500">
                    Décision par {item.validated_by} · {new Date(item.validated_at).toLocaleString('fr-FR')}
                    {item.validation_comment ? ` · ${item.validation_comment}` : ''}
                  </p>
                )}
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
                  <div className="flex-1">
                    <label htmlFor={`review-${item.id}`} className="text-xs font-semibold text-slate-600">Observation de revue</label>
                    <input id={`review-${item.id}`} value={reviewComments[item.id] || ''} onChange={(event) => setReviewComments((current) => ({ ...current, [item.id]: event.target.value }))} placeholder="Facultative pour valider, obligatoire pour demander une correction" className="form-input mt-1 h-10 w-full rounded-lg border-slate-300 text-sm" />
                  </div>
                  <div className="flex gap-2">
                    <Button type="button" variant="outline" disabled={isReviewing} onClick={() => review(item, 'rejected')} className="text-red-700 hover:text-red-800">
                      {isReviewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}À corriger
                    </Button>
                    <Button type="button" disabled={isReviewing} onClick={() => review(item, 'validated')} className="bg-emerald-600 hover:bg-emerald-700">
                      {isReviewing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}Valider l’action
                    </Button>
                  </div>
                </div>
              </div>
            </article>
          );
        })}
      </section>

      {items.length > 0 && (
        <footer className="rounded-2xl bg-slate-900 px-5 py-4 text-sm text-slate-100">
          <span className="font-semibold">Périmètre humainement validé :</span>{' '}
          {totals.validated} action(s), {totals.validatedCost.toLocaleString('fr-FR')} € de budget · {totals.done} action(s) terminée(s).
        </footer>
      )}
    </main>
  );
}
