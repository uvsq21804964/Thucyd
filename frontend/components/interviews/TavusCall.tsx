'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DailyCall, DailyEventObjectAppMessage } from '@daily-co/daily-js';
import {
  HelpCircle,
  Loader2,
  LogOut,
  MessageCircle,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Undo2,
  VideoOff,
} from 'lucide-react';

import { Button } from '@/components/ui/button';

export type InterviewActivity =
  | 'connecting'
  | 'ready'
  | 'user-speaking'
  | 'processing'
  | 'assistant-speaking'
  | 'paused'
  | 'error';

export type InterviewUtterance = {
  role: 'user' | 'assistant';
  text: string;
};

type TavusCallProps = {
  conversationId: string;
  conversationUrl: string;
  meetingToken: string | null;
  stage: 'introduction' | 'interview' | 'closing' | 'completed';
  onActivityChange: (activity: InterviewActivity) => void;
  onTurnProcessed: () => void;
  onUtterance: (utterance: InterviewUtterance) => void;
  onLeave: () => Promise<void>;
};

type CallStatus = 'connecting' | 'joined' | 'leaving' | 'error';
type TavusInteraction = {
  event_type?: string;
  inference_id?: string;
  turn_idx?: number;
  properties?: {
    role?: 'user' | 'pal' | 'replica';
    speech?: string;
  };
};

const activityLabel: Record<InterviewActivity, string> = {
  connecting: 'Connexion sécurisée',
  ready: 'Je vous écoute',
  'user-speaking': 'Je vous écoute',
  processing: 'Analyse et sauvegarde…',
  'assistant-speaking': "L'auditeur vous répond",
  paused: 'Entretien en pause',
  error: 'Connexion interrompue',
};

export default function TavusCall({
  conversationId,
  conversationUrl,
  meetingToken,
  stage,
  onActivityChange,
  onTurnProcessed,
  onUtterance,
  onLeave,
}: TavusCallProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callRef = useRef<DailyCall | null>(null);
  const finishStartedRef = useRef(false);
  const lastProcessedTurnRef = useRef<string | null>(null);
  const lastUtteranceRef = useRef<string | null>(null);
  const [status, setStatus] = useState<CallStatus>('connecting');
  const [activity, setActivity] = useState<InterviewActivity>('connecting');
  const [frameReady, setFrameReady] = useState(false);
  const [paused, setPaused] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [error, setError] = useState('');

  const updateActivity = useCallback(
    (next: InterviewActivity) => {
      setActivity(next);
      onActivityChange(next);
    },
    [onActivityChange]
  );

  const finishInterview = useCallback(async () => {
    if (finishStartedRef.current) return;
    finishStartedRef.current = true;
    setStatus('leaving');
    try {
      await onLeave();
    } catch {
      setError(
        "La vidéo est fermée, mais la confirmation de fin n'a pas pu être envoyée."
      );
      setStatus('error');
      updateActivity('error');
    }
  }, [onLeave, updateActivity]);

  const setPause = useCallback(
    (nextPaused: boolean) => {
      const call = callRef.current;
      if (!call) return;
      if (nextPaused) {
        call.sendAppMessage(
          {
            message_type: 'conversation',
            event_type: 'conversation.interrupt',
            conversation_id: conversationId,
          },
          '*'
        );
        call.setLocalAudio(false);
        setPaused(true);
        updateActivity('paused');
      } else {
        call.setLocalAudio(true);
        setPaused(false);
        updateActivity('ready');
      }
    },
    [conversationId, updateActivity]
  );

  const sendResponse = useCallback(
    (text: string) => {
      const call = callRef.current;
      if (!call || status !== 'joined' || paused) return;
      call.sendAppMessage(
        {
          message_type: 'conversation',
          event_type: 'conversation.respond',
          conversation_id: conversationId,
          properties: { text },
        },
        '*'
      );
      updateActivity('processing');
    },
    [conversationId, paused, status, updateActivity]
  );

  useEffect(() => {
    let disposed = false;
    let call: DailyCall | null = null;
    const revealTimer = window.setTimeout(() => {
      if (!disposed) setFrameReady(true);
    }, 8000);

    const loaded = () => {
      if (!disposed) setFrameReady(true);
    };
    const joined = () => {
      if (!disposed) {
        setStatus('joined');
        updateActivity('ready');
      }
    };
    const left = () => {
      if (!disposed) finishInterview().catch(() => undefined);
    };
    const callError = () => {
      if (!disposed) {
        setError(
          'La connexion vidéo a échoué. Vérifiez les autorisations de la caméra et du microphone.'
        );
        setStatus('error');
        updateActivity('error');
      }
    };
    const appMessage = (
      event: DailyEventObjectAppMessage<TavusInteraction>
    ) => {
      if (disposed) return;
      const message = event.data;
      const role = message?.properties?.role;
      const eventType = message?.event_type;

      if (eventType === 'conversation.started_speaking') {
        if (role === 'user') updateActivity('user-speaking');
        if (role === 'pal' || role === 'replica') {
          updateActivity('assistant-speaking');
        }
      }
      if (eventType === 'conversation.stopped_speaking') {
        if (role === 'user') updateActivity('processing');
        if (role === 'pal' || role === 'replica') {
          updateActivity('ready');
          const turnKey =
            message.inference_id || String(message.turn_idx ?? '');
          if (!turnKey || lastProcessedTurnRef.current !== turnKey) {
            lastProcessedTurnRef.current = turnKey || null;
            onTurnProcessed();
          }
        }
      }
      if (eventType === 'conversation.utterance') {
        const speech = message.properties?.speech?.trim();
        if (!speech) return;
        const utteranceKey = `${
          message.inference_id || message.turn_idx || ''
        }:${speech}`;
        if (role === 'user' || lastUtteranceRef.current !== utteranceKey) {
          lastUtteranceRef.current = utteranceKey;
          onUtterance({
            role: role === 'user' ? 'user' : 'assistant',
            text: speech,
          });
        }
        if (
          role === 'user' &&
          /^(pause|mettez? en pause|fais une pause)[ .!]*$/i.test(speech)
        ) {
          setPause(true);
        }
      }
    };

    const start = async () => {
      if (!containerRef.current) return;
      try {
        const Daily = (await import('@daily-co/daily-js')).default;
        if (disposed || !containerRef.current) return;
        call = Daily.createFrame(containerRef.current, {
          showLeaveButton: false,
          showFullscreenButton: true,
          showParticipantsBar: false,
          lang: 'fr',
          iframeStyle: {
            width: '100%',
            height: '100%',
            border: '0',
            borderRadius: '16px',
          },
          theme: {
            colors: {
              accent: '#7c3aed',
              accentText: '#ffffff',
              background: '#0f172a',
              backgroundAccent: '#1e293b',
              baseText: '#f8fafc',
              border: '#334155',
              mainAreaBg: '#020617',
              mainAreaBgAccent: '#0f172a',
              mainAreaText: '#f8fafc',
              supportiveText: '#cbd5e1',
            },
          },
        });
        callRef.current = call;
        call.on('loaded', loaded);
        call.on('joined-meeting', joined);
        call.on('left-meeting', left);
        call.on('app-message', appMessage);
        call.on('error', callError);
        await call.join({
          url: conversationUrl,
          token: meetingToken || undefined,
        });
      } catch {
        if (!disposed) {
          setError(
            'Impossible de rejoindre la salle vidéo. La conversation va être arrêtée.'
          );
          setStatus('error');
          updateActivity('error');
          await finishInterview();
        }
      }
    };

    start().catch(() => undefined);
    return () => {
      disposed = true;
      window.clearTimeout(revealTimer);
      const wasJoined = call?.meetingState() === 'joined-meeting';
      if (call) {
        call.off('loaded', loaded);
        call.off('joined-meeting', joined);
        call.off('left-meeting', left);
        call.off('app-message', appMessage);
        call.off('error', callError);
        call.destroy().catch(() => undefined);
      }
      callRef.current = null;
      if (wasJoined) finishInterview().catch(() => undefined);
    };
  }, [
    conversationUrl,
    finishInterview,
    meetingToken,
    onTurnProcessed,
    onUtterance,
    setPause,
    updateActivity,
  ]);

  const leave = async () => {
    if (status === 'leaving') return;
    setStatus('leaving');
    try {
      await callRef.current?.leave();
    } finally {
      await finishInterview();
    }
  };

  const controlsDisabled = status !== 'joined' || paused;
  const answerControlsDisabled = controlsDisabled || stage !== 'interview';

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-950 shadow-2xl shadow-slate-950/20">
      <div className="relative min-h-[500px] bg-slate-950">
        <div ref={containerRef} className="absolute inset-0" />

        {status === 'connecting' && !frameReady && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950 text-white">
            <span className="relative flex h-20 w-20 items-center justify-center rounded-full bg-violet-500/15">
              <Loader2 className="h-9 w-9 animate-spin text-violet-300" />
              <span className="absolute inset-0 animate-ping rounded-full border border-violet-400/20" />
            </span>
            <p className="mt-5 text-base font-semibold">
              Connexion à votre auditeur IA
            </p>
            <p className="mt-1 text-sm text-slate-400">
              Autorisez la caméra et le microphone si votre navigateur le
              demande.
            </p>
          </div>
        )}

        {status === 'error' && (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-slate-950 px-8 text-center text-white">
            <VideoOff className="h-10 w-10 text-red-300" />
            <p className="mt-4 font-semibold">Connexion interrompue</p>
            <p className="mt-2 max-w-md text-sm text-slate-400">{error}</p>
          </div>
        )}

        <div className="pointer-events-none absolute left-4 top-4 z-20 flex items-center gap-2 rounded-full bg-slate-950/80 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
          {activity === 'processing' ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-violet-300" />
          ) : (
            <Radio
              className={`h-3.5 w-3.5 ${
                activity === 'paused'
                  ? 'text-amber-300'
                  : 'animate-pulse text-emerald-400'
              }`}
            />
          )}
          {activityLabel[activity]}
        </div>

        {confirmLeave && (
          <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/85 p-6 text-center text-white backdrop-blur-sm">
            <div className="max-w-sm rounded-2xl border border-white/10 bg-slate-900 p-6 shadow-2xl">
              <h3 className="text-lg font-bold">Terminer l’entretien ?</h3>
              <p className="mt-2 text-sm leading-6 text-slate-300">
                Les réponses déjà analysées resteront enregistrées et pourront
                être vérifiées dans le questionnaire.
              </p>
              <div className="mt-5 flex justify-center gap-3">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setConfirmLeave(false)}
                  className="border-slate-600 bg-transparent text-white hover:bg-slate-800"
                >
                  Continuer
                </Button>
                <Button type="button" variant="destructive" onClick={leave}>
                  Confirmer la fin
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-slate-800 bg-slate-900 px-3 py-3">
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={controlsDisabled}
          onClick={() => sendResponse('[THUCYD_COMMAND:repeat]')}
          className="rounded-lg"
        >
          <RotateCcw className="mr-1.5 h-4 w-4" /> Répéter
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={controlsDisabled}
          onClick={() => sendResponse('[THUCYD_COMMAND:rephrase]')}
          className="rounded-lg"
        >
          <MessageCircle className="mr-1.5 h-4 w-4" /> Reformuler
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={answerControlsDisabled}
          onClick={() =>
            sendResponse(
              'Je ne dispose pas de cette information pour le moment.'
            )
          }
          className="rounded-lg"
        >
          <HelpCircle className="mr-1.5 h-4 w-4" /> Je ne sais pas
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={controlsDisabled}
          onClick={() => sendResponse('[THUCYD_COMMAND:correct_previous]')}
          className="rounded-lg"
        >
          <Undo2 className="mr-1.5 h-4 w-4" /> Corriger
        </Button>
        <Button
          type="button"
          size="sm"
          variant={paused ? 'default' : 'secondary'}
          disabled={status !== 'joined'}
          onClick={() => setPause(!paused)}
          className="rounded-lg"
        >
          {paused ? (
            <Play className="mr-1.5 h-4 w-4" />
          ) : (
            <Pause className="mr-1.5 h-4 w-4" />
          )}
          {paused ? 'Reprendre' : 'Pause'}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="destructive"
          disabled={status !== 'joined'}
          onClick={() => setConfirmLeave(true)}
          className="ml-auto rounded-lg"
        >
          <LogOut className="mr-1.5 h-4 w-4" /> Terminer
        </Button>
      </div>
    </div>
  );
}
