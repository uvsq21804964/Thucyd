'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import API from '@/lib/api-client';
import { clientAuth } from '@/utils/authMiddleware';

type LoginFields = { email: string; password: string };

export function getLoginErrorMessage(requestError: unknown): string {
  if (!axios.isAxiosError(requestError)) {
    return 'Une erreur inattendue empêche la connexion. Veuillez réessayer.';
  }

  if (!requestError.response) {
    if (requestError.code === 'ECONNABORTED' || requestError.code === 'ETIMEDOUT') {
      return 'Le délai de connexion est dépassé. Vérifiez votre connexion internet puis réessayez.';
    }
    return 'Impossible de joindre le service de connexion. Vérifiez votre connexion internet puis réessayez.';
  }

  switch (requestError.response.status) {
    case 400:
    case 422:
      return 'Les informations saisies ne sont pas valides. Vérifiez votre adresse e-mail et votre mot de passe.';
    case 401:
      return 'E-mail ou mot de passe incorrect. Vérifiez vos identifiants puis réessayez.';
    case 403:
      return "Votre compte n'est pas autorisé à accéder à l'application. Contactez un administrateur.";
    case 408:
      return 'Le délai de connexion est dépassé. Veuillez réessayer.';
    case 429:
      return 'Trop de tentatives de connexion. Patientez quelques minutes avant de réessayer.';
    default:
      if (requestError.response.status >= 500) {
        return 'Le service de connexion rencontre un problème. Veuillez réessayer dans quelques instants.';
      }
      return `La connexion a échoué (erreur ${requestError.response.status}). Veuillez réessayer.`;
  }
}

export default function LoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string>();
  const { register, handleSubmit, formState: { errors } } = useForm<LoginFields>({ defaultValues: { email: '', password: '' } });

  useEffect(() => {
    clientAuth().then(() => router.replace('/home')).catch(() => undefined);
  }, [router]);

  const onSubmit = async (fields: LoginFields) => {
    setLoginError(undefined);
    setLoading(true);
    try {
      await API.post('login', fields);
      toast.success('Connexion réussie.');
      router.replace('/home');
      router.refresh();
    } catch (requestError) {
      const message = getLoginErrorMessage(requestError);
      setLoginError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <form className="mt-8 space-y-5" onSubmit={handleSubmit(onSubmit)} noValidate>
      <div>
        <p className="text-sm font-medium text-slate-700">Adresse e-mail</p>
        <div className="relative mt-2">
          <Mail className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" />
          <input id="email" aria-label="Adresse e-mail" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? 'email-error' : undefined} type="email" autoComplete="email" placeholder="admin@ornisec.com" disabled={loading} {...register('email', { required: 'Saisissez votre adresse e-mail.', pattern: { value: /^[^\s@]+@[^\s@]+\.[^\s@]+$/, message: 'Saisissez une adresse e-mail valide.' } })} className="form-input h-11 w-full rounded-xl border-slate-300 bg-white pl-10 text-sm shadow-sm focus:border-violet-500 focus:ring-violet-500" />
        </div>
        {errors.email && <p id="email-error" className="mt-1.5 text-sm text-red-600">{errors.email.message}</p>}
      </div>

      <div>
        <p className="text-sm font-medium text-slate-700">Mot de passe</p>
        <div className="relative mt-2">
          <Lock className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" />
          <input id="password" aria-label="Mot de passe" aria-invalid={Boolean(errors.password)} aria-describedby={errors.password ? 'password-error' : undefined} type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Votre mot de passe" disabled={loading} {...register('password', { required: 'Saisissez votre mot de passe.', minLength: { value: 8, message: 'Le mot de passe contient au moins 8 caractères.' } })} className="form-input h-11 w-full rounded-xl border-slate-300 bg-white pl-10 pr-11 text-sm shadow-sm focus:border-violet-500 focus:ring-violet-500" />
          <button type="button" aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} onClick={() => setShowPassword((visible) => !visible)} className="absolute right-3 top-3 text-slate-400 hover:text-slate-700">
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
        {errors.password && <p id="password-error" className="mt-1.5 text-sm text-red-600">{errors.password.message}</p>}
      </div>

      {loginError && (
        <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {loginError}
        </p>
      )}

      <Button type="submit" disabled={loading} className="h-11 w-full rounded-xl bg-violet-700 font-semibold hover:bg-violet-800">
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {loading ? 'Connexion…' : 'Se connecter'}
      </Button>
    </form>
  );
}
