'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { DailyCall } from '@daily-co/daily-js';
import { Loader2, LogOut, Radio, VideoOff } from 'lucide-react';

import { Button } from '@/components/ui/button';

type TavusCallProps = {
  conversationUrl: string;
  meetingToken: string | null;
  onLeave: () => Promise<void>;
};

type CallStatus = 'connecting' | 'joined' | 'leaving' | 'error';

export default function TavusCall({
  conversationUrl,
  meetingToken,
  onLeave,
}: TavusCallProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const callRef = useRef<DailyCall | null>(null);
  const finishStartedRef = useRef(false);
  const [status, setStatus] = useState<CallStatus>('connecting');
  const [frameReady, setFrameReady] = useState(false);
  const [error, setError] = useState('');

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
    }
  }, [onLeave]);

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
      if (!disposed) setStatus('joined');
    };
    const left = () => {
      if (!disposed) finishInterview().catch(() => undefined);
    };
    const callError = () => {
      if (!disposed) {
        setError(
          "La connexion vidéo a échoué. Vérifiez les autorisations de la caméra et du microphone."
        );
        setStatus('error');
      }
    };

    const start = async () => {
      if (!containerRef.current) return;
      try {
        const Daily = (await import('@daily-co/daily-js')).default;
        if (disposed || !containerRef.current) return;
        call = Daily.createFrame(containerRef.current, {
          showLeaveButton: true,
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
        call.on('error', callError);
        await call.join({
          url: conversationUrl,
          token: meetingToken || undefined,
        });
      } catch {
        if (!disposed) {
          setError(
            "Impossible de rejoindre la salle vidéo. La conversation va être arrêtée."
          );
          setStatus('error');
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
        call.off('error', callError);
        call.destroy().catch(() => undefined);
      }
      callRef.current = null;
      if (wasJoined) finishInterview().catch(() => undefined);
    };
  }, [conversationUrl, finishInterview, meetingToken]);

  const leave = async () => {
    if (status === 'leaving') return;
    setStatus('leaving');
    try {
      await callRef.current?.leave();
    } finally {
      await finishInterview();
    }
  };

  return (
    <div className="relative h-full min-h-[420px] overflow-hidden rounded-2xl bg-slate-950 shadow-2xl shadow-slate-950/20">
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
            Autorisez la caméra et le microphone si votre navigateur le demande.
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

      <div className="pointer-events-none absolute left-4 top-4 z-20 flex items-center gap-2 rounded-full bg-slate-950/75 px-3 py-1.5 text-xs font-medium text-white backdrop-blur">
        <Radio className="h-3.5 w-3.5 animate-pulse text-emerald-400" />
        {status === 'joined' ? 'Entretien en cours' : 'Connexion sécurisée'}
      </div>

      {status === 'joined' && (
        <Button
          type="button"
          variant="destructive"
          onClick={leave}
          className="absolute bottom-4 right-4 z-20 rounded-xl shadow-lg"
        >
          <LogOut className="mr-2 h-4 w-4" />
          Terminer l’entretien
        </Button>
      )}
    </div>
  );
}
