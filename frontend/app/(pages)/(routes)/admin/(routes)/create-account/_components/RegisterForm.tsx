/* eslint-disable jsx-a11y/label-has-associated-control */

'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, Shield, User } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import API from '@/lib/api-client';

type AccountFields = { name: string; email: string; role: 'AUDITOR' | 'ADMIN'; password: string; verifyPassword: string };
type ApiError = { response?: { data?: { detail?: string } } };

export default function RegisterForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { register, handleSubmit, watch, formState: { errors } } = useForm<AccountFields>({ defaultValues: { name: '', email: '', role: 'AUDITOR', password: '', verifyPassword: '' } });
  const password = watch('password');

  const submit = async (fields: AccountFields) => {
    setSubmitting(true);
    try {
      await API.post('admin/create-account', {
        name: fields.name.trim(), email: fields.email.trim(), role: fields.role === 'ADMIN' ? 1 : 2,
        password: fields.password, passwordConfirm: fields.verifyPassword,
      });
      toast.success('Compte créé avec succès.');
      router.push('/admin/accounts');
      router.refresh();
    } catch (requestError) {
      toast.error((requestError as ApiError).response?.data?.detail || 'La création du compte a échoué.');
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass = 'form-input mt-2 h-11 w-full rounded-xl border-slate-300 text-sm focus:border-violet-500 focus:ring-violet-500';

  return (
    <form onSubmit={handleSubmit(submit)} className="surface-card max-w-3xl p-5 md:p-7">
      <div className="grid gap-6 md:grid-cols-2">
        <div><label htmlFor="name" className="text-sm font-medium text-slate-700">Nom d’utilisateur</label><input id="name" placeholder="Prénom et nom" {...register('name', { required: 'Saisissez un nom.', minLength: { value: 2, message: 'Le nom est trop court.' } })} className={fieldClass} />{errors.name && <p className="mt-1.5 text-sm text-red-600">{errors.name.message}</p>}</div>
        <div><label htmlFor="email" className="text-sm font-medium text-slate-700">Adresse e-mail</label><input id="email" type="email" placeholder="utilisateur@entreprise.fr" {...register('email', { required: 'Saisissez une adresse e-mail.' })} className={fieldClass} />{errors.email && <p className="mt-1.5 text-sm text-red-600">{errors.email.message}</p>}</div>
      </div>

      <fieldset className="mt-7"><legend className="text-sm font-medium text-slate-700">Niveau d’accès</legend><div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-4 has-[:checked]:border-violet-400 has-[:checked]:bg-violet-50"><input type="radio" value="AUDITOR" {...register('role')} className="mt-1 text-violet-600 focus:ring-violet-500" /><User className="h-5 w-5 text-slate-500" /><span><span className="block text-sm font-semibold">Auditeur</span><span className="mt-1 block text-xs leading-5 text-slate-500">Accède aux audits qui lui sont affectés.</span></span></label>
        <label className="flex cursor-pointer gap-3 rounded-xl border border-slate-200 p-4 has-[:checked]:border-violet-400 has-[:checked]:bg-violet-50"><input type="radio" value="ADMIN" {...register('role')} className="mt-1 text-violet-600 focus:ring-violet-500" /><Shield className="h-5 w-5 text-slate-500" /><span><span className="block text-sm font-semibold">Administrateur</span><span className="mt-1 block text-xs leading-5 text-slate-500">Gère les audits et les comptes utilisateurs.</span></span></label>
      </div></fieldset>

      <div className="mt-7 grid gap-6 md:grid-cols-2">
        <div><label htmlFor="password" className="text-sm font-medium text-slate-700">Mot de passe temporaire</label><div className="relative"><input id="password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" {...register('password', { required: 'Saisissez un mot de passe.', minLength: { value: 8, message: 'Utilisez au moins 8 caractères.' } })} className={`${fieldClass} pr-11`} /><button type="button" aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} onClick={() => setShowPassword((visible) => !visible)} className="absolute right-3 top-5 text-slate-400 hover:text-slate-700">{showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}</button></div>{errors.password && <p className="mt-1.5 text-sm text-red-600">{errors.password.message}</p>}</div>
        <div><label htmlFor="verifyPassword" className="text-sm font-medium text-slate-700">Confirmer le mot de passe</label><input id="verifyPassword" type={showPassword ? 'text' : 'password'} autoComplete="new-password" {...register('verifyPassword', { required: 'Confirmez le mot de passe.', validate: (value) => value === password || 'Les mots de passe ne correspondent pas.' })} className={fieldClass} />{errors.verifyPassword && <p className="mt-1.5 text-sm text-red-600">{errors.verifyPassword.message}</p>}</div>
      </div>

      <div className="mt-8 flex flex-wrap justify-end gap-3"><Button type="button" variant="outline" onClick={() => router.back()} className="rounded-xl">Annuler</Button><Button type="submit" disabled={submitting} className="rounded-xl bg-violet-700 hover:bg-violet-800">{submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{submitting ? 'Création…' : 'Créer le compte'}</Button></div>
    </form>
  );
}