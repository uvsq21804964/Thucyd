'use client';

import { ChangeEvent, useCallback, useRef, useState } from 'react';
import {
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Paperclip,
  ShieldCheck,
  Trash2,
  Upload,
  XCircle,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import {
  deleteEvidence,
  EvidenceItem,
  evidenceErrorMessage,
  getEvidence,
  reviewEvidence,
  uploadEvidence,
} from '@/lib/evidence';
import { cn } from '@/lib/utils';

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPTED_FILES =
  '.pdf,.png,.jpg,.jpeg,.webp,.txt,.csv,.doc,.docx,.xls,.xlsx';

const statusConfig = {
  pending: {
    label: 'À valider',
    icon: ShieldCheck,
    className: 'border-amber-200 bg-amber-50 text-amber-700',
  },
  validated: {
    label: 'Validée',
    icon: CheckCircle2,
    className: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  },
  rejected: {
    label: 'Refusée',
    icon: XCircle,
    className: 'border-red-200 bg-red-50 text-red-700',
  },
};

function formatSize(size: number) {
  if (size < 1024 * 1024) return `${Math.max(1, Math.round(size / 1024))} Ko`;
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('fr-FR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(value));
}

export default function EvidencePanel({
  auditId,
  questionRef,
}: {
  auditId: string;
  questionRef: string | number;
}) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [reviewing, setReviewing] = useState('');
  const [confirmDelete, setConfirmDelete] = useState('');
  const [comments, setComments] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (loading) return;
    setLoading(true);
    try {
      setItems(await getEvidence(auditId, questionRef));
      setLoaded(true);
    } catch (error) {
      toast.error(evidenceErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [auditId, loading, questionRef]);

  const handleUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (inputRef.current) inputRef.current.value = '';
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast.error('Le document dépasse la limite de 10 Mo.');
      return;
    }
    setUploading(true);
    try {
      const created = await uploadEvidence(auditId, questionRef, file);
      setItems((current) => [created, ...current]);
      setLoaded(true);
      toast.success('Preuve déposée et en attente de validation.');
    } catch (error) {
      toast.error(evidenceErrorMessage(error));
    } finally {
      setUploading(false);
    }
  };

  const handleReview = async (
    item: EvidenceItem,
    status: 'validated' | 'rejected'
  ) => {
    setReviewing(item.id);
    try {
      const updated = await reviewEvidence(
        item.id,
        status,
        comments[item.id] ?? ''
      );
      setItems((current) =>
        current.map((candidate) =>
          candidate.id === updated.id ? updated : candidate
        )
      );
      toast.success(
        status === 'validated' ? 'Preuve validée.' : 'Preuve refusée.'
      );
    } catch (error) {
      toast.error(evidenceErrorMessage(error));
    } finally {
      setReviewing('');
    }
  };

  const handleDelete = async (item: EvidenceItem) => {
    if (confirmDelete !== item.id) {
      setConfirmDelete(item.id);
      return;
    }
    try {
      await deleteEvidence(item.id);
      setItems((current) =>
        current.filter((candidate) => candidate.id !== item.id)
      );
      toast.success('Preuve supprimée.');
    } catch (error) {
      toast.error(evidenceErrorMessage(error));
    } finally {
      setConfirmDelete('');
    }
  };
  let summaryLabel = 'Ajouter ou consulter';
  if (loading) summaryLabel = 'Chargement…';
  else if (loaded) summaryLabel = `${items.length} document(s)`;

  return (
    <details
      className="group rounded-xl border border-slate-200 bg-white"
      onToggle={(event) => {
        if (event.currentTarget.open && !loaded) load().catch(() => undefined);
      }}
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
        <span className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Paperclip className="h-4 w-4 text-violet-600" />
          Preuves documentaires
        </span>
        <span className="text-xs font-medium text-slate-500">
          {summaryLabel}
        </span>
      </summary>

      <div className="space-y-3 border-t border-slate-200 p-4">
        <div className="flex flex-col gap-3 rounded-xl border border-dashed border-violet-200 bg-violet-50/50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              Ajouter une preuve à cette question
            </p>
            <p className="mt-1 text-xs leading-5 text-slate-500">
              PDF, image, texte, Word ou Excel · 10 Mo maximum
            </p>
          </div>
          <input
            ref={inputRef}
            type="file"
            accept={ACCEPTED_FILES}
            className="hidden"
            onChange={handleUpload}
          />
          <Button
            type="button"
            size="sm"
            disabled={uploading}
            onClick={() => inputRef.current?.click()}
            className="shrink-0 rounded-xl"
          >
            {uploading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Upload className="mr-2 h-4 w-4" />
            )}
            Déposer
          </Button>
        </div>

        {loaded && items.length === 0 && (
          <div className="py-4 text-center">
            <FileText className="mx-auto h-7 w-7 text-slate-300" />
            <p className="mt-2 text-xs text-slate-500">
              Aucune preuve déposée pour ce point.
            </p>
          </div>
        )}

        {items.map((item) => {
          const status = statusConfig[item.status];
          const StatusIcon = status.icon;

          return (
            <article
              key={item.id}
              className="rounded-xl border border-slate-200 p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-slate-800">
                      {item.filename}
                    </p>
                    <span
                      className={cn(
                        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold',
                        status.className
                      )}
                    >
                      <StatusIcon className="h-3 w-3" />
                      {status.label}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    {formatSize(item.size)} · déposé par {item.uploaded_by} ·{' '}
                    {formatDate(item.uploaded_at)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    asChild
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                  >
                    <a
                      href={`/backend/evidence/${item.id}/download`}
                      title={`Télécharger ${item.filename}`}
                    >
                      <Download className="h-4 w-4" />
                    </a>
                  </Button>
                  {item.can_delete && (
                    <Button
                      type="button"
                      variant={
                        confirmDelete === item.id ? 'destructive' : 'ghost'
                      }
                      size="icon"
                      className="h-8 w-8"
                      title={
                        confirmDelete === item.id
                          ? 'Confirmer la suppression'
                          : 'Supprimer'
                      }
                      onClick={() => handleDelete(item)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
              {item.status === 'pending' && item.can_validate && (
                <div className="mt-3 rounded-lg bg-slate-50 p-3">
                  <label
                    htmlFor={`evidence-comment-${item.id}`}
                    className="text-xs font-semibold text-slate-700"
                  >
                    Observation de validation{' '}
                    <span className="font-normal text-slate-400">
                      (facultatif)
                    </span>
                  </label>
                  <input
                    id={`evidence-comment-${item.id}`}
                    value={comments[item.id] ?? ''}
                    maxLength={500}
                    onChange={(event) =>
                      setComments((current) => ({
                        ...current,
                        [item.id]: event.target.value,
                      }))
                    }
                    placeholder="Précisez ce qui a été vérifié…"
                    className="mt-2 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  />
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      size="sm"
                      disabled={reviewing === item.id}
                      onClick={() => handleReview(item, 'validated')}
                      className="h-8 rounded-lg bg-emerald-600 px-3 text-xs hover:bg-emerald-700"
                    >
                      {reviewing === item.id ? (
                        <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
                      )}
                      Valider
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      disabled={reviewing === item.id}
                      onClick={() => handleReview(item, 'rejected')}
                      className="h-8 rounded-lg border-red-200 px-3 text-xs text-red-700 hover:bg-red-50"
                    >
                      <XCircle className="mr-1.5 h-3.5 w-3.5" />
                      Refuser
                    </Button>
                  </div>
                </div>
              )}

              {item.reviewed_by && (
                <p className="mt-3 text-xs leading-5 text-slate-500">
                  Décision par {item.reviewed_by}
                  {item.reviewed_at ? ` · ${formatDate(item.reviewed_at)}` : ''}
                  {item.review_comment ? ` · ${item.review_comment}` : ''}
                </p>
              )}
            </article>
          );
        })}
      </div>
    </details>
  );
}
