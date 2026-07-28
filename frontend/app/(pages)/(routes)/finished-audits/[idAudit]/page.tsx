'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CalendarDays, ClipboardList, Download, History, Paperclip, User } from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import API from '@/lib/api-client';
import { QuestionnaireReference } from '@/lib/questionnaires';

type AuditInfo = {
  _id: string;
  companie: string;
  description?: string;
  chef?: string;
  date: string;
  datefin?: string;
  finished: boolean;
  auditers: string[];
};

type AuditQuestion = {
  ref: number;
  catégorie: string;
  chantier: string;
  question: string;
  comment?: string;
  'note numérique': number | null;
};

type EvidenceMetadata = {
  id: string;
  question_ref: number;
  filename: string;
  status: 'pending' | 'validated' | 'rejected';
};
const evidenceStatus = {
  pending: { label: 'À valider', className: 'border-amber-200 bg-amber-50 text-amber-700' },
  validated: { label: 'Validée', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  rejected: { label: 'Refusée', className: 'border-red-200 bg-red-50 text-red-700' },
};

type CategoryResult = {
  name: string;
  score: number | null;
  answered: number;
  total: number;
};

type AuditResults = {
  audit: AuditInfo;
  score: number | null;
  answered: number;
  total_questions: number;
  categories: CategoryResult[];
  questions: AuditQuestion[];
  evidence?: EvidenceMetadata[];
  questionnaire_reference?: QuestionnaireReference;
};

const formatScore = (score: number | null) => (score === null ? '—' : `${score.toFixed(2)} / 4`);

export default function Results({ params }: { params: { idAudit: string } }) {
  const [results, setResults] = useState<AuditResults | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    API.get<AuditResults>(`audit/${params.idAudit}/results`)
      .then(({ data }) => setResults(data))
      .catch(() => setError(true));
  }, [params.idAudit]);

  if (error) {
    return (
      <div className="p-8">
        <Card className="mx-auto max-w-xl">
          <CardContent className="space-y-4 p-6 text-center">
            <p>Impossible de charger les résultats de cet audit.</p>
            <Button asChild><Link href="/finished-audits">Retour aux audits terminés</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!results) {
    return <div className="p-8 text-center text-white">Chargement des résultats…</div>;
  }

  const completion = results.total_questions
    ? Math.round((results.answered / results.total_questions) * 100)
    : 0;

  return (
    <main className="space-y-6 p-4 md:p-8 print:bg-white print:p-0">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button asChild variant="outline">
          <Link href="/finished-audits"><ArrowLeft className="mr-2 h-4 w-4" />Retour</Link>
        </Button>
        <Button asChild variant="outline"><Link href={`/finished-audits/${params.idAudit}/action-plan`}><ClipboardList className="mr-2 h-4 w-4" />Plan d’action</Link></Button>
        <Button type="button" onClick={() => window.print()}>
          <Download className="mr-2 h-4 w-4" />Imprimer ou enregistrer en PDF
        </Button>
      </div>

      <section className="rounded-lg bg-white p-5 shadow md:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b pb-6">
          <div>
            <p className="text-sm font-medium uppercase tracking-wide text-violet-700">Rapport d’audit</p>
            <h1 className="mt-1 text-3xl font-bold text-slate-900">{results.audit.companie}</h1>
            {results.audit.description && <p className="mt-2 text-slate-600">{results.audit.description}</p>}
          </div>
          <Badge variant={results.audit.finished ? 'default' : 'secondary'}>
            {results.audit.finished ? 'Terminé' : 'Incomplet'}
          </Badge>
        </div>

        {results.questionnaire_reference && (
          <div className="mt-5 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg border border-violet-100 bg-violet-50 px-4 py-3 text-sm text-violet-950">
            <History className="h-4 w-4 text-violet-700" />
            <span className="font-semibold">Référentiel utilisé :</span>
            <span>{results.questionnaire_reference.name}</span>
            <span>· version {results.questionnaire_reference.version}</span>
            <span>· {results.questionnaire_reference.question_count} questions</span>
            <span className="ml-auto font-mono text-[11px] text-violet-700/70" title={results.questionnaire_reference.checksum}>
              SHA-256 {results.questionnaire_reference.checksum.slice(0, 12)}…
            </span>
          </div>
        )}

        <div className="grid gap-4 py-6 md:grid-cols-3">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Score global</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-bold text-violet-700">{formatScore(results.score)}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Progression</CardTitle></CardHeader>
            <CardContent><p className="text-3xl font-bold">{completion} %</p><p className="text-sm text-slate-500">{results.answered} / {results.total_questions} réponses</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Responsable</CardTitle></CardHeader>
            <CardContent className="space-y-2 text-sm"><p className="flex items-center"><User className="mr-2 h-4 w-4" />{results.audit.chef || 'Non attribué'}</p><p className="flex items-center"><CalendarDays className="mr-2 h-4 w-4" />{results.audit.datefin || results.audit.date}</p></CardContent>
          </Card>
        </div>

        <section className="space-y-3 border-t py-6">
          <h2 className="text-xl font-semibold">Résultats par catégorie</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {results.categories.map((category) => (
              <div key={category.name} className="rounded-md border p-4">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-medium">{category.name}</h3>
                  <span className="font-bold text-violet-700">{formatScore(category.score)}</span>
                </div>
                <p className="mt-2 text-xs text-slate-500">{category.answered} / {category.total} questions évaluées</p>
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-3 border-t pt-6">
          <h2 className="text-xl font-semibold">Détail des réponses</h2>
          {results.questions.map((question) => (
            <article key={question.ref} className="break-inside-avoid rounded-md border p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-xs font-medium uppercase text-violet-700">{question.catégorie} · {question.chantier}</p>
                  <h3 className="mt-1 font-medium">{question.ref}. {question.question}</h3>
                </div>
                <Badge variant="outline">{formatScore(question['note numérique'])}</Badge>
              </div>
              <p className="mt-3 text-sm text-slate-600"><span className="font-medium">Commentaire :</span> {question.comment || 'Aucun commentaire'}</p>
              {(results.evidence ?? []).some((item) => item.question_ref === question.ref) && <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 print:hidden"><span className="flex items-center gap-1 text-xs font-semibold text-slate-600"><Paperclip className="h-3.5 w-3.5 text-violet-600" />Preuves</span>{(results.evidence ?? []).filter((item) => item.question_ref === question.ref).map((item) => <a key={item.id} href={`/backend/evidence/${item.id}/download`} className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-xs font-medium ${evidenceStatus[item.status].className}`}><Download className="h-3 w-3" />{item.filename} · {evidenceStatus[item.status].label}</a>)}</div>}
            </article>
          ))}
        </section>
      </section>
    </main>
  );
}
