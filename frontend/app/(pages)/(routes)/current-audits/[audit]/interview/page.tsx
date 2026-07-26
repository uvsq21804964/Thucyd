'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronRight,
  Database,
  Loader2,
  Lock,
  Mic,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Video,
} from 'lucide-react';

import TavusCall from '@/components/interviews/TavusCall';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import API from '@/lib/api-client';
import {
  createInterviewSession,
  endInterviewSession,
  getInterviewSession,
  InterviewSession,
  InterviewSessionDetails,
  interviewErrorMessage,
} from '@/lib/interviews';

type AuditInfo = {
  companie: string;
  chef?: string;
  finished: boolean;
};

type Phase = 'intro' | 'creating' | 'active' | 'ended' | 'error';

export default function AIInterviewPage({
  params,
}: {
  params: { audit: string };
}) {
  const [audit, setAudit] = useState<AuditInfo | null>(null);
  const [phase, setPhase] = useState<Phase>('intro');
  const [session, setSession] = useState<InterviewSession | null>(null);
  const [details, setDetails] = useState<InterviewSessionDetails | null>(null);
  const [error, setError] = useState('');
  const startInProgressRef = useRef(false);

  useEffect(() => {
    API.get<AuditInfo>(`audit/${params.audit}`)
      .then(({ data }) => setAudit(data))
      .catch(() => setError("Les informations de l'audit sont indisponibles."));
  }, [params.audit]);

  const checkMediaAccess = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "Ce navigateur ne permet pas l'accès à la caméra et au microphone."
      );
    }
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true,
    });
    stream.getTracks().forEach((track) => track.stop());
  };

  const startInterview = async () => {
    if (startInProgressRef.current) return;
    startInProgressRef.current = true;
    setError('');
    setPhase('creating');
    try {
      await checkMediaAccess();
      const createdSession = await createInterviewSession(params.audit);
      if (!createdSession.tavus?.conversation_url) {
        throw new Error("Tavus n'a pas renvoyé d'URL de conversation.");
      }
      setSession(createdSession);
      setPhase('active');
    } catch (requestError) {
      setError(interviewErrorMessage(requestError));
      setPhase('error');
    } finally {
      startInProgressRef.current = false;
    }
  };

  const finishInterview = useCallback(async () => {
    if (!session) return;
    await endInterviewSession(session.session_id);
    try {
      const refreshed = await getInterviewSession(session.session_id);
      setDetails(refreshed);
    } catch {
      setDetails(null);
    }
    setPhase('ended');
  }, [session]);

  const editUrl = `/current-audits/${params.audit}/edit`;

  return (
    <div className="page-shell mx-auto max-w-[1500px]">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href={editUrl}
            className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-violet-700"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour au questionnaire
          </Link>
          <div className="mt-4 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-violet-100 text-violet-700">
              <Bot className="h-6 w-6" />
            </span>
            <div>
              <p className="text-sm font-semibold text-violet-700">
                Entretien assisté par IA
              </p>
              <h1 className="page-heading">
                {audit?.companie || 'Audit en cours'}
              </h1>
            </div>
          </div>
        </div>
        <Badge
          variant="outline"
          className="gap-2 border-emerald-200 bg-emerald-50 px-3 py-1.5 text-emerald-800"
        >
          <Database className="h-3.5 w-3.5" />
          Sauvegarde en direct
        </Badge>
      </header>

      {(phase === 'intro' || phase === 'error') && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(320px,0.55fr)]">
          <section className="relative min-h-[500px] overflow-hidden rounded-3xl bg-slate-950 p-6 text-white shadow-xl">
            <div className="absolute -right-24 -top-24 h-80 w-80 rounded-full bg-violet-600/25 blur-3xl" />
            <div className="absolute -bottom-32 left-1/4 h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl" />
            <div className="relative flex h-full flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
                  <Sparkles className="h-3.5 w-3.5 text-violet-300" />
                  Avatar auditeur ORNISEC
                </span>
                <span className="inline-flex items-center gap-2 text-xs text-slate-400">
                  <Lock className="h-3.5 w-3.5" />
                  Salle privée
                </span>
              </div>

              <div className="mx-auto max-w-xl py-12 text-center">
                <span className="mx-auto flex h-24 w-24 items-center justify-center rounded-full border border-violet-300/20 bg-violet-500/10 shadow-2xl shadow-violet-500/20">
                  <Video className="h-11 w-11 text-violet-300" />
                </span>
                <h2 className="mt-7 text-3xl font-bold tracking-tight">
                  Prêt à commencer l’entretien ?
                </h2>
                <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-slate-300">
                  L’avatar suit le questionnaire de cet audit, pose les relances
                  utiles et complète les questions concernées après chaque prise
                  de parole.
                </p>
                <Button
                  type="button"
                  size="lg"
                  onClick={startInterview}
                  className="mt-8 rounded-xl bg-violet-600 px-7 shadow-lg shadow-violet-950/40 hover:bg-violet-500"
                >
                  <Mic className="mr-2 h-5 w-5" />
                  Autoriser et démarrer
                  <ChevronRight className="ml-2 h-5 w-5" />
                </Button>
                <p className="mt-4 text-xs text-slate-500">
                  La salle Tavus est créée uniquement après votre autorisation.
                </p>
              </div>
            </div>
          </section>

          <aside className="surface-card p-6">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-700">
              Avant de commencer
            </p>
            <h2 className="mt-2 text-xl font-bold text-slate-950">
              Quelques conseils
            </h2>
            <div className="mt-6 space-y-5">
              {[
                {
                  icon: Mic,
                  title: 'Parlez naturellement',
                  text: 'Terminez votre réponse avant de laisser l’avatar reprendre la parole.',
                },
                {
                  icon: Database,
                  title: 'Réponses enregistrées',
                  text: 'Chaque tour met à jour les questions pertinentes dans Neon DB.',
                },
                {
                  icon: ShieldCheck,
                  title: 'Vous gardez le contrôle',
                  text: 'Les notes peu fiables ne sont pas appliquées automatiquement.',
                },
              ].map(({ icon: Icon, title, text }) => (
                <div key={title} className="flex gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-900">
                      {title}
                    </p>
                    <p className="mt-1 text-xs leading-5 text-slate-500">
                      {text}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {phase === 'error' && (
              <div
                role="alert"
                className="mt-6 rounded-xl border border-red-200 bg-red-50 p-4"
              >
                <p className="text-sm font-semibold text-red-900">
                  Démarrage impossible
                </p>
                <p className="mt-1 text-xs leading-5 text-red-700">{error}</p>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={startInterview}
                  className="mt-3 rounded-lg bg-white"
                >
                  <RefreshCw className="mr-2 h-3.5 w-3.5" />
                  Réessayer
                </Button>
              </div>
            )}
          </aside>
        </div>
      )}

      {phase === 'creating' && (
        <section className="surface-card flex min-h-[500px] flex-col items-center justify-center p-10 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-full bg-violet-100 text-violet-700">
            <Loader2 className="h-9 w-9 animate-spin" />
          </span>
          <h2 className="mt-6 text-xl font-bold text-slate-950">
            Préparation de la salle privée
          </h2>
          <p className="mt-2 max-w-md text-sm text-slate-500">
            Nous configurons l’avatar avec le questionnaire et sécurisons la
            connexion vidéo.
          </p>
        </section>
      )}

      {phase === 'active' && session && (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
          <section className="min-h-[620px]">
            <TavusCall
              conversationUrl={session.tavus.conversation_url}
              meetingToken={session.tavus.meeting_token}
              onLeave={finishInterview}
            />
          </section>
          <aside className="space-y-4">
            <div className="surface-card p-5">
              <div className="flex items-center gap-2 text-sm font-semibold text-emerald-700">
                <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-emerald-500" />
                Entretien actif
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                Répondez avec des exemples concrets et mentionnez les documents
                ou preuves disponibles.
              </p>
            </div>
            <div className="surface-card p-5">
              <p className="text-sm font-semibold text-slate-900">
                Enregistrement automatique
              </p>
              <div className="mt-4 space-y-3 text-xs text-slate-500">
                <p className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                  Transcription analysée à chaque tour de parole
                </p>
                <p className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                  Plusieurs questions peuvent être complétées ensemble
                </p>
                <p className="flex gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-violet-600" />
                  Aucun bouton Enregistrer nécessaire
                </p>
              </div>
            </div>
          </aside>
        </div>
      )}

      {phase === 'ended' && (
        <section className="surface-card mx-auto max-w-3xl overflow-hidden">
          <div className="border-b border-emerald-100 bg-emerald-50 px-8 py-10 text-center">
            <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <CheckCircle2 className="h-8 w-8" />
            </span>
            <h2 className="mt-5 text-2xl font-bold text-slate-950">
              Entretien terminé
            </h2>
            <p className="mt-2 text-sm text-slate-600">
              Les réponses recueillies sont disponibles dans le questionnaire.
            </p>
          </div>
          <div className="p-8">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">
                  Tours enregistrés
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-950">
                  {details?.turns.length ?? '—'}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="text-xs font-medium text-slate-500">
                  Questions du questionnaire
                </p>
                <p className="mt-1 text-2xl font-bold text-slate-950">
                  {details?.total_questions ?? '—'}
                </p>
              </div>
            </div>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Button asChild className="rounded-xl">
                <Link href={editUrl}>Vérifier les réponses</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-xl">
                <Link href="/current-audits">Retour aux audits</Link>
              </Button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
