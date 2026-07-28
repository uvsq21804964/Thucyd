/* eslint-disable jsx-a11y/label-has-associated-control */

'use client';

import axios from 'axios';
import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { Building2, Check, Loader2, Search, Users } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import API from '@/lib/api-client';
import { cn } from '@/lib/utils';
import QuestionnaireImport, { QuestionnaireSelection } from './QuestionnaireImport';

type UserOption = { id: string; email: string; name: string };
type AuditFields = { companyName: string; description: string; leader: string };

export default function RegisterForm() {
  const router = useRouter();
  const [users, setUsers] = useState<UserOption[]>([]);
  const [selectedAuditors, setSelectedAuditors] = useState<string[]>([]);
  const [search, setSearch] = useState('');
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [questionnaireSelection, setQuestionnaireSelection] = useState<QuestionnaireSelection>({});
  const [questionnaireError, setQuestionnaireError] = useState('');
  const { register, handleSubmit, watch, formState: { errors } } = useForm<AuditFields>({ defaultValues: { companyName: '', description: '', leader: '' } });
  const leader = watch('leader');

  useEffect(() => {
    API.get<{ users: UserOption[] }>('users/options')
      .then(({ data }) => setUsers(data.users))
      .catch(() => toast.error('Impossible de charger les utilisateurs.'))
      .finally(() => setLoadingUsers(false));
  }, []);

  useEffect(() => {
    if (leader && !selectedAuditors.includes(leader)) setSelectedAuditors((current) => [...current, leader]);
  }, [leader, selectedAuditors]);

  const filteredUsers = useMemo(() => users.filter((user) => `${user.name} ${user.email}`.toLocaleLowerCase().includes(search.toLocaleLowerCase())), [search, users]);
  const toggleAuditor = (name: string) => setSelectedAuditors((current) => current.includes(name) ? current.filter((item) => item !== name) : [...current, name]);

  const submit = async (fields: AuditFields) => {
    if (questionnaireError) { toast.error(questionnaireError); return; }
    setSubmitting(true);
    try {
      await API.post('createAudit', {
        company_name: fields.companyName.trim(),
        chef_auditeurs: fields.leader,
        list_auditeurs: Array.from(new Set([...selectedAuditors, fields.leader])),
        description: fields.description.trim(),
        ...questionnaireSelection,
      });
      toast.success('Audit créé avec succès.');
      router.push('/current-audits');
      router.refresh();
    } catch (requestError) {
      const detail = axios.isAxiosError(requestError) ? requestError.response?.data?.detail : undefined;
      let message = "La création de l'audit a échoué.";
      if (typeof detail === 'string') message = detail;
      if (Array.isArray(detail) && detail[0]?.msg) message = `Questionnaire invalide : ${detail[0].msg}`;
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit(submit)} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
      <section className="surface-card space-y-6 p-5 md:p-7">
        <div><h2 className="text-lg font-semibold text-slate-950">Informations générales</h2><p className="mt-1 text-sm text-slate-500">Ces informations apparaîtront dans le rapport final.</p></div>
        <div>
          <label htmlFor="companyName" className="text-sm font-medium text-slate-700">Entreprise auditée</label>
          <div className="relative mt-2"><Building2 className="absolute left-3 top-3 h-5 w-5 text-slate-400" /><input id="companyName" aria-invalid={Boolean(errors.companyName)} placeholder="Nom de l’entreprise" {...register('companyName', { required: "Saisissez le nom de l'entreprise.", minLength: { value: 2, message: 'Le nom est trop court.' } })} className="form-input h-11 w-full rounded-xl border-slate-300 pl-10 text-sm focus:border-violet-500 focus:ring-violet-500" /></div>
          {errors.companyName && <p className="mt-1.5 text-sm text-red-600">{errors.companyName.message}</p>}
        </div>
        <div>
          <label htmlFor="description" className="text-sm font-medium text-slate-700">Description de la mission</label>
          <textarea id="description" rows={5} placeholder="Contexte, périmètre et objectifs de l’audit…" {...register('description', { required: 'Décrivez brièvement la mission.', maxLength: { value: 1000, message: 'La description ne peut pas dépasser 1 000 caractères.' } })} className="form-textarea mt-2 w-full resize-y rounded-xl border-slate-300 text-sm focus:border-violet-500 focus:ring-violet-500" />
          {errors.description && <p className="mt-1.5 text-sm text-red-600">{errors.description.message}</p>}
        </div>
        <div>
          <label htmlFor="leader" className="text-sm font-medium text-slate-700">Responsable de l’audit</label>
          <select id="leader" disabled={loadingUsers} {...register('leader', { required: 'Sélectionnez un responsable.' })} className="form-select mt-2 h-11 w-full rounded-xl border-slate-300 text-sm focus:border-violet-500 focus:ring-violet-500">
            <option value="">Sélectionner un responsable</option>
            {users.map((user) => <option key={user.id} value={user.name}>{user.name} · {user.email}</option>)}
          </select>
          {errors.leader && <p className="mt-1.5 text-sm text-red-600">{errors.leader.message}</p>}
        </div>
        <QuestionnaireImport onChange={(value, error) => { setQuestionnaireSelection(value); setQuestionnaireError(error); }} />
      </section>

      <aside className="surface-card flex max-h-[620px] flex-col p-5 md:p-6">
        <div className="flex items-start justify-between gap-3"><div><h2 className="flex items-center gap-2 text-lg font-semibold"><Users className="h-5 w-5 text-violet-700" />Équipe d’audit</h2><p className="mt-1 text-sm text-slate-500">{selectedAuditors.length} membre(s) sélectionné(s)</p></div></div>
        <div className="relative mt-4"><Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" /><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher…" className="form-input h-9 w-full rounded-lg border-slate-300 pl-9 text-sm focus:border-violet-500 focus:ring-violet-500" /></div>
        <div className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
          {loadingUsers && <div className="py-8 text-center text-sm text-slate-500">Chargement des utilisateurs…</div>}
          {!loadingUsers && filteredUsers.map((user) => {
            const selected = selectedAuditors.includes(user.name);
            const isLeader = user.name === leader;
            return <button key={user.id} type="button" disabled={isLeader} onClick={() => toggleAuditor(user.name)} className={cn('flex w-full items-center gap-3 rounded-xl border p-3 text-left transition', selected ? 'border-violet-200 bg-violet-50' : 'border-slate-200 hover:bg-slate-50', isLeader && 'cursor-default')}><span className={cn('flex h-5 w-5 items-center justify-center rounded-md border', selected ? 'border-violet-600 bg-violet-600 text-white' : 'border-slate-300')}>{selected && <Check className="h-3.5 w-3.5" />}</span><span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium text-slate-800">{user.name}</span><span className="block truncate text-xs text-slate-500">{user.email}{isLeader ? ' · Responsable' : ''}</span></span></button>;
          })}
          {!loadingUsers && filteredUsers.length === 0 && <p className="py-8 text-center text-sm text-slate-500">Aucun utilisateur trouvé.</p>}
        </div>
        <Button type="submit" disabled={submitting || loadingUsers || Boolean(questionnaireError)} className="mt-5 h-11 w-full rounded-xl bg-violet-700 hover:bg-violet-800">{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{submitting ? 'Création…' : "Créer l'audit"}</Button>
      </aside>
    </form>
  );
}