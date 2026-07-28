'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock3,
  Gauge,
  Loader2,
  RefreshCw,
  Sparkles,
  Target,
  TimerReset,
  UserCheck,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  getInterviewMonitoring,
  InterviewMonitoring,
  interviewErrorMessage,
} from '@/lib/interviews';
import { cn } from '@/lib/utils';

const statusLabel: Record<string, string> = {
  active: 'En cours',
  interrupting: 'Interruption…',
  interrupted: 'À reprendre',
  completed: 'Terminé',
  ending: 'Finalisation…',
};

function formatDuration(seconds: number | null) {
  if (seconds === null) return '—';
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  if (!minutes) return `${remaining} s`;
  return `${minutes} min ${remaining.toString().padStart(2, '0')} s`;
}

function formatLatency(milliseconds: number | null) {
  if (milliseconds === null) return '—';
  if (milliseconds >= 1000) {
    return `${(milliseconds / 1000).toLocaleString('fr-FR', { maximumFractionDigits: 1 })} s`;
  }
  return `${milliseconds.toLocaleString('fr-FR')} ms`;
}

function statusClass(status: string) {
  if (status === 'completed') return 'bg-emerald-50 text-emerald-700';
  if (status === 'interrupted') return 'bg-amber-50 text-amber-700';
  return 'bg-violet-50 text-violet-700';
}

export default function InterviewMonitoringPage() {
  const [data, setData] = useState<InterviewMonitoring | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    try {
      const result = await getInterviewMonitoring();
      setData(result);
      setError('');
    } catch (requestError) {
      setError(interviewErrorMessage(requestError));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(() => load(true), 30_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const maximumStageLatency = useMemo(
    () => Math.max(1, ...(data?.latency.stages.map((stage) => stage.average_ms || 0) ?? [])),
    [data?.latency.stages],
  );

  if (loading) {
    return (
      <div className="page-shell flex min-h-[560px] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-9 w-9 animate-spin text-violet-600" />
          <p className="mt-4 text-sm font-medium text-slate-600">Calcul des indicateurs d’entretien…</p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="page-shell">
        <section className="surface-card mx-auto max-w-xl p-10 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
          <h1 className="mt-4 text-xl font-bold text-slate-950">Suivi indisponible</h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">{error || 'Les indicateurs ne peuvent pas être chargés.'}</p>
          <Button type="button" className="mt-6 rounded-xl" onClick={() => load()}>
            Réessayer
          </Button>
        </section>
      </div>
    );
  }

  const { summary, latency } = data;
  const cards = [
    {
      label: 'Durée moyenne',
      value: formatDuration(summary.average_duration_seconds),
      help: `${summary.completed_session_count} entretien(s) terminé(s)`,
      icon: Clock3,
      color: 'bg-violet-50 text-violet-700',
    },
    {
      label: 'Latence backend',
      value: formatLatency(latency.average_total_ms),
      help: `${latency.sampled_turns} tour(s) mesuré(s)`,
      icon: Gauge,
      color: 'bg-sky-50 text-sky-700',
    },
    {
      label: 'Taux de couverture',
      value: `${summary.coverage_rate.toLocaleString('fr-FR')} %`,
      help: `${summary.covered_questions}/${summary.total_questions} questions`,
      icon: Target,
      color: 'bg-emerald-50 text-emerald-700',
    },
    {
      label: 'Intervention humaine',
      value: summary.human_intervention_count.toLocaleString('fr-FR'),
      help: `${summary.human_intervention_rate.toLocaleString('fr-FR')} % des réponses`,
      icon: UserCheck,
      color: 'bg-amber-50 text-amber-700',
    },
  ];

  return (
    <div className="page-shell mx-auto max-w-7xl space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-violet-700">Qualité des entretiens IA</p>
          <h1 className="page-heading mt-1">Tableau de suivi</h1>
          <p className="page-subtitle max-w-3xl">
            Suivez la performance du moteur et repérez immédiatement les réponses qui demandent une décision humaine.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <Button type="button" variant="outline" className="rounded-xl" onClick={() => load(true)} disabled={refreshing}>
            <RefreshCw className={cn('mr-2 h-4 w-4', refreshing && 'animate-spin')} />Actualiser
          </Button>
          <p className="text-xs text-slate-400">Actualisation automatique toutes les 30 s</p>
        </div>
      </header>

      {error && (
        <div role="alert" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          La dernière actualisation a échoué. Les valeurs précédentes restent affichées.
        </div>
      )}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicateurs de suivi">
        {cards.map(({ label, value, help, icon: Icon, color }) => (
          <article key={label} className="surface-card flex items-start justify-between gap-4 p-5">
            <div>
              <p className="text-xs font-medium text-slate-500">{label}</p>
              <p className="mt-2 text-3xl font-bold tracking-tight text-slate-950">{value}</p>
              <p className="mt-2 text-xs text-slate-400">{help}</p>
            </div>
            <span className={cn('rounded-xl p-3', color)}><Icon className="h-5 w-5" /></span>
          </article>
        ))}
      </section>
      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(320px,0.85fr)]">
        <article className="surface-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-950">Latence moyenne par étape</h2>
              <p className="mt-1 text-xs text-slate-500">Temps backend entre la réception du transcript et la réponse envoyée à Tavus.</p>
            </div>
            <TimerReset className="h-5 w-5 text-slate-400" />
          </div>
          {latency.sampled_turns === 0 ? (
            <div className="mt-6 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
              <Sparkles className="mx-auto h-7 w-7 text-violet-500" />
              <p className="mt-3 text-sm font-semibold text-slate-800">Collecte prête</p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Les mesures détaillées apparaîtront après les prochains tours de parole. Les anciens entretiens restent visibles pour la durée et la couverture.</p>
            </div>
          ) : (
            <div className="mt-6 space-y-4">
              {latency.stages.map((stage) => (
                <div key={stage.key}>
                  <div className="mb-1.5 flex items-center justify-between gap-3 text-xs">
                    <span className="font-medium text-slate-600">{stage.label}</span>
                    <span className="font-semibold text-slate-900">{formatLatency(stage.average_ms)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-violet-500 to-sky-500"
                      style={{ width: `${Math.max(3, ((stage.average_ms || 0) / maximumStageLatency) * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
              <p className="border-t border-slate-100 pt-3 text-[11px] leading-5 text-slate-400">
                Analyse IA : plan de dialogue et extraction des réponses sont exécutés en parallèle. La transmission réseau, la voix et l’animation Tavus ne sont pas incluses.
              </p>
            </div>
          )}
        </article>

        <article className="surface-card p-5">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-semibold text-slate-950">Couverture du questionnaire</h2>
              <p className="mt-1 text-xs text-slate-500">Questions actives parcourues dans les dernières sessions.</p>
            </div>
            <Target className="h-5 w-5 text-emerald-600" />
          </div>
          <div className="mt-7 flex items-end justify-between gap-4">
            <p className="text-5xl font-bold tracking-tight text-slate-950">{summary.coverage_rate.toLocaleString('fr-FR')}<span className="ml-1 text-xl text-slate-400">%</span></p>
            <p className="text-right text-xs leading-5 text-slate-500">{summary.covered_questions} couvertes<br />sur {summary.total_questions}</p>
          </div>
          <div className="mt-5 h-3 overflow-hidden rounded-full bg-slate-100" aria-label={`Couverture ${summary.coverage_rate} %`}>
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${Math.min(100, summary.coverage_rate)}%` }} />
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-slate-50 p-3"><p className="text-xl font-bold text-slate-900">{summary.session_count}</p><p className="text-xs text-slate-500">sessions suivies</p></div>
            <div className="rounded-xl bg-amber-50 p-3"><p className="text-xl font-bold text-amber-700">{summary.human_intervention_rate.toLocaleString('fr-FR')} %</p><p className="text-xs text-amber-700">à contrôler</p></div>
          </div>
        </article>
      </section>

      <section className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-950">Sessions récentes</h2>
            <p className="mt-1 text-xs text-slate-500">Dernière session de chaque audit accessible.</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-medium text-slate-600">{data.sessions.length} session(s)</span>
        </div>
        {data.sessions.length === 0 ? (
          <div className="p-10 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-slate-300" />
            <p className="mt-3 text-sm font-semibold text-slate-800">Aucun entretien à mesurer</p>
            <p className="mt-1 text-xs text-slate-500">Les premières métriques apparaîtront dès qu’un entretien IA sera démarré.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead className="bg-slate-50 text-xs text-slate-500">
                <tr>
                  <th className="px-5 py-3 font-medium">Audit</th>
                  <th className="px-4 py-3 font-medium">Statut</th>
                  <th className="px-4 py-3 font-medium">Durée</th>
                  <th className="px-4 py-3 font-medium">Latence</th>
                  <th className="px-4 py-3 font-medium">Couverture</th>
                  <th className="px-4 py-3 font-medium">À contrôler</th>
                  <th className="px-5 py-3"><span className="sr-only">Action</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.sessions.map((session) => (
                  <tr key={session.session_id} className="transition hover:bg-slate-50/70">
                    <td className="px-5 py-4"><p className="font-semibold text-slate-900">{session.company_name}</p><p className="mt-0.5 text-[11px] text-slate-400">{session.turn_count} tour(s)</p></td>
                    <td className="px-4 py-4"><span className={cn('rounded-full px-2.5 py-1 text-xs font-semibold', statusClass(session.status))}>{statusLabel[session.status] || session.status}</span></td>
                    <td className="px-4 py-4 font-medium text-slate-700">{formatDuration(session.duration_seconds)}</td>
                    <td className="px-4 py-4 font-medium text-slate-700">{formatLatency(session.average_latency_ms)}</td>
                    <td className="px-4 py-4"><div className="flex items-center gap-2"><div className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, session.coverage.rate)}%` }} /></div><span className="text-xs font-medium text-slate-600">{session.coverage.rate.toLocaleString('fr-FR')} %</span></div></td>
                    <td className="px-4 py-4"><span className={cn('font-semibold', session.human_intervention_count ? 'text-amber-700' : 'text-emerald-700')}>{session.human_intervention_count}</span></td>
                    <td className="px-5 py-4 text-right"><Button asChild variant="ghost" size="sm" className="rounded-lg"><Link href={`/current-audits/${session.audit_id}/interview/review?session=${session.session_id}`}>Revue<ArrowRight className="ml-1 h-3.5 w-3.5" /></Link></Button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
      <section className="surface-card overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <h2 className="font-semibold text-slate-950">Réponses nécessitant une intervention humaine</h2>
            <p className="mt-1 text-xs text-slate-500">Confiance faible, notation à confirmer ou preuve documentaire en attente.</p>
          </div>
          <span className={cn('rounded-full px-3 py-1 text-xs font-semibold', data.interventions.length ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800')}>
            {data.interventions.length} point(s) affiché(s)
          </span>
        </div>
        {data.interventions.length === 0 ? (
          <div className="p-10 text-center">
            <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-600" />
            <p className="mt-3 font-semibold text-slate-900">Aucune réponse sensible à contrôler</p>
            <p className="mt-1 text-xs text-slate-500">Les questions non couvertes restent visibles dans le taux de couverture.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {data.interventions.map((item) => (
              <article key={`${item.session_id}-${item.question_ref}`} className="p-5">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold text-amber-800">Intervention requise</span>
                      <span className="text-xs font-semibold text-violet-700">{item.company_name} · point {item.question_ref}</span>
                      {item.confidence !== null && <span className="text-xs text-slate-400">Confiance {Math.round(item.confidence * 100)} %</span>}
                    </div>
                    <p className="mt-2 text-xs font-medium text-slate-500">{item.category}</p>
                    <h3 className="mt-1 font-semibold leading-6 text-slate-950">{item.question}</h3>
                    <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-600">{item.summary}</p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {item.reasons.map((reason) => <span key={reason} className="rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-medium text-amber-800">{reason}</span>)}
                    </div>
                  </div>
                  <Button asChild variant="outline" size="sm" className="shrink-0 rounded-xl">
                    <Link href={`/current-audits/${item.audit_id}/interview/review?session=${item.session_id}`}>Contrôler la réponse<ArrowRight className="ml-2 h-3.5 w-3.5" /></Link>
                  </Button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2 px-1 text-[11px] text-slate-400">
        <span>Les agrégats utilisent la dernière session de chaque audit accessible.</span>
        <span>Calculé le {new Date(data.generated_at).toLocaleString('fr-FR')}</span>
      </footer>
    </div>
  );
}
