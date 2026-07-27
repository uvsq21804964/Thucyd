'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Search,
  ShieldCheck,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  getInterviewSession,
  getLatestInterviewSession,
  InterviewReviewItem,
  InterviewSessionDetails,
  interviewErrorMessage,
} from '@/lib/interviews';
import { cn } from '@/lib/utils';

type ReviewFilter =
  | 'all'
  | 'attention'
  | 'unanswered'
  | 'without_evidence'
  | 'ready';

const filters: { value: ReviewFilter; label: string }[] = [
  { value: 'all', label: 'Tous' },
  { value: 'attention', label: 'À contrôler' },
  { value: 'unanswered', label: 'Non couverts' },
  { value: 'without_evidence', label: 'Sans preuve' },
  { value: 'ready', label: 'Prêts' },
];

const statusStyle = {
  ready: {
    label: 'Prêt à valider',
    className: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    icon: CheckCircle2,
  },
  attention: {
    label: 'À contrôler',
    className: 'border-amber-200 bg-amber-50 text-amber-800',
    icon: AlertTriangle,
  },
  unanswered: {
    label: 'Non couvert',
    className: 'border-red-200 bg-red-50 text-red-800',
    icon: FileText,
  },
};

function matchesFilter(item: InterviewReviewItem, filter: ReviewFilter) {
  if (filter === 'all') return true;
  if (filter === 'without_evidence') return item.without_evidence;
  return item.status === filter;
}

export default function InterviewReviewPage({
  params,
  searchParams,
}: {
  params: { audit: string };
  searchParams: { session?: string };
}) {
  const [details, setDetails] = useState<InterviewSessionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<ReviewFilter>('attention');
  const [query, setQuery] = useState('');

  useEffect(() => {
    setLoading(true);
    setError('');
    const request = searchParams?.session
      ? getInterviewSession(searchParams.session)
      : getLatestInterviewSession(params.audit);
    request
      .then(setDetails)
      .catch((requestError) => setError(interviewErrorMessage(requestError)))
      .finally(() => setLoading(false));
  }, [params.audit, searchParams?.session]);

  const visibleItems = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('fr-FR');
    return (details?.review.items ?? []).filter((item) => {
      if (!matchesFilter(item, filter)) return false;
      if (!normalizedQuery) return true;
      return [
        item.question,
        item.summary,
        item.category,
        item.workstream,
        String(item.question_ref),
      ].some((value) =>
        value.toLocaleLowerCase('fr-FR').includes(normalizedQuery)
      );
    });
  }, [details?.review.items, filter, query]);

  const editUrl = `/current-audits/${params.audit}/edit`;

  if (loading) {
    return (
      <div className="page-shell flex min-h-[520px] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto h-9 w-9 animate-spin text-violet-600" />
          <p className="mt-4 text-sm font-medium text-slate-600">
            Préparation de la revue…
          </p>
        </div>
      </div>
    );
  }

  if (error || !details) {
    return (
      <div className="page-shell">
        <section className="surface-card mx-auto max-w-xl p-10 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-500" />
          <h1 className="mt-4 text-xl font-bold text-slate-950">
            Revue indisponible
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-500">
            {error || "Aucun entretien n'est encore disponible pour cet audit."}
          </p>
          <Button asChild className="mt-6 rounded-xl">
            <Link href={`/current-audits/${params.audit}/interview`}>
              Démarrer un entretien
            </Link>
          </Button>
        </section>
      </div>
    );
  }

  const { counts } = details.review;
  const summaryCards = [
    {
      label: 'Prêts à valider',
      value: counts.ready,
      icon: CheckCircle2,
      className: 'bg-emerald-50 text-emerald-700',
    },
    {
      label: 'À contrôler',
      value: counts.attention,
      icon: AlertTriangle,
      className: 'bg-amber-50 text-amber-700',
    },
    {
      label: 'Non couverts',
      value: counts.unanswered,
      icon: FileText,
      className: 'bg-red-50 text-red-700',
    },
    {
      label: 'Sans preuve',
      value: counts.without_evidence,
      icon: ShieldCheck,
      className: 'bg-violet-50 text-violet-700',
    },
  ];

  return (
    <div className="page-shell mx-auto max-w-7xl">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Button asChild variant="ghost" size="sm" className="-ml-3">
            <Link href={editUrl}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Retour au questionnaire
            </Link>
          </Button>
          <p className="mt-4 text-sm font-semibold text-violet-700">
            Contrôle post-entretien
          </p>
          <h1 className="page-heading mt-1">Revue · {details.company_name}</h1>
          <p className="page-subtitle max-w-3xl">
            Vérifiez les éléments sensibles avant de clôturer l’audit. Les
            corrections restent enregistrées automatiquement dans le
            questionnaire.
          </p>
        </div>
        <Button asChild className="rounded-xl">
          <Link href={editUrl}>Ouvrir le questionnaire</Link>
        </Button>
      </header>

      <section
        className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
        aria-label="Résumé de la revue"
      >
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="surface-card flex items-center gap-4 p-4"
            >
              <span
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-xl',
                  card.className
                )}
              >
                <Icon className="h-5 w-5" />
              </span>
              <div>
                <p className="text-2xl font-bold text-slate-950">
                  {card.value}
                </p>
                <p className="text-xs font-medium text-slate-500">
                  {card.label}
                </p>
              </div>
            </div>
          );
        })}
      </section>

      <section className="surface-card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="relative max-w-md flex-1">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Rechercher un point, un thème…"
              className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
          </div>
          <div
            className="flex gap-2 overflow-x-auto"
            aria-label="Filtres de revue"
          >
            {filters.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => setFilter(item.value)}
                className={cn(
                  'whitespace-nowrap rounded-full border px-3 py-1.5 text-xs font-semibold transition',
                  filter === item.value
                    ? 'border-violet-600 bg-violet-600 text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-violet-300'
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {visibleItems.length} point{visibleItems.length > 1 ? 's' : ''}{' '}
          affiché
          {visibleItems.length > 1 ? 's' : ''} sur {counts.total}
        </p>
      </section>

      <section className="space-y-4">
        {visibleItems.length === 0 && (
          <div className="surface-card p-10 text-center">
            <CheckCircle2 className="mx-auto h-9 w-9 text-emerald-600" />
            <p className="mt-3 font-semibold text-slate-900">
              Aucun point ne correspond à ce filtre
            </p>
            <button
              type="button"
              onClick={() => {
                setFilter('all');
                setQuery('');
              }}
              className="mt-2 text-sm font-medium text-violet-700 hover:underline"
            >
              Afficher toute la revue
            </button>
          </div>
        )}

        {visibleItems.map((item) => {
          const status = statusStyle[item.status];
          const StatusIcon = status.icon;
          const correctionUrl = `${editUrl}?category=${encodeURIComponent(
            item.category
          )}&question=${item.question_ref}#question-${item.question_ref}`;
          return (
            <article
              key={item.question_ref}
              className="surface-card overflow-hidden"
            >
              <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold uppercase tracking-wide text-violet-700">
                      Point {item.question_ref}
                    </span>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                        status.className
                      )}
                    >
                      <StatusIcon className="h-3 w-3" />
                      {status.label}
                    </span>
                    {item.without_evidence && item.status !== 'unanswered' && (
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-500">
                        Preuve à compléter
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs font-medium text-slate-500">
                    {item.category} · {item.workstream}
                  </p>
                  <h2 className="mt-1 text-base font-semibold leading-6 text-slate-950">
                    {item.question}
                  </h2>
                  {item.summary ? (
                    <p className="mt-3 max-w-4xl text-sm leading-6 text-slate-700">
                      {item.summary}
                    </p>
                  ) : (
                    <p className="mt-3 text-sm italic text-slate-400">
                      Aucun élément n’a été enregistré pour cette question.
                    </p>
                  )}

                  <div className="mt-4 flex flex-wrap gap-2 text-xs">
                    {item.mark !== null && (
                      <span className="rounded-lg bg-violet-50 px-2.5 py-1.5 font-semibold text-violet-800">
                        Note {item.mark}/4
                      </span>
                    )}
                    {item.confidence !== null && (
                      <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 font-medium text-slate-600">
                        Confiance {Math.round(item.confidence * 100)} %
                      </span>
                    )}
                    {item.evidence.map((evidence) => (
                      <span
                        key={evidence}
                        className="rounded-lg bg-emerald-50 px-2.5 py-1.5 font-medium text-emerald-800"
                      >
                        Preuve · {evidence}
                      </span>
                    ))}
                  </div>

                  {item.mark_rationale && (
                    <p className="mt-3 text-xs leading-5 text-violet-700">
                      Critère de notation : {item.mark_rationale}
                    </p>
                  )}
                  {item.reasons.length > 0 && (
                    <ul className="mt-3 space-y-1 text-xs text-amber-700">
                      {item.reasons.map((reason) => (
                        <li key={reason}>• {reason}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <Button
                  asChild
                  variant="outline"
                  size="sm"
                  className="shrink-0 rounded-xl"
                >
                  <Link href={correctionUrl}>Vérifier ce point</Link>
                </Button>
              </div>
            </article>
          );
        })}
      </section>
    </div>
  );
}
