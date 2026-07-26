'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2, Lock, Mail } from 'lucide-react';
import toast from 'react-hot-toast';

import { Button } from '@/components/ui/button';
import API from '@/lib/api-client';
import { clientAuth } from '@/utils/authMiddleware';

type LoginFields = { email: string; password: string };
type ApiError = { response?: { status?: number } };

export default function LoginForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<LoginFields>({ defaultValues: { email: '', password: '' } });

  useEffect(() => {
    clientAuth().then(() => router.replace('/home')).catch(() => undefined);
  }, [router]);

  const onSubmit = async (fields: LoginFields) => {
    setLoading(true);
    try {
      await API.post('login', fields);
      toast.success('Connexion réussie.');
      router.replace('/home');
      router.refresh();
    } catch (requestError) {
      const status = (requestError as ApiError).response?.status;
      toast.error(status === 401 ? 'E-mail ou mot de passe incorrect.' : 'Le service est momentanément indisponible.');
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
          <input id="email" aria-label="Adresse e-mail" type="email" autoComplete="email" placeholder="admin@ornisec.com" disabled={loading} {...register('email', { required: 'Saisissez votre adresse e-mail.' })} className="form-input h-11 w-full rounded-xl border-slate-300 bg-white pl-10 text-sm shadow-sm focus:border-violet-500 focus:ring-violet-500" />
        </div>
        {errors.email && <p className="mt-1.5 text-sm text-red-600">{errors.email.message}</p>}
      </div>

      <div>
        <p className="text-sm font-medium text-slate-700">Mot de passe</p>
        <div className="relative mt-2">
          <Lock className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-slate-400" />
          <input id="password" aria-label="Mot de passe" type={showPassword ? 'text' : 'password'} autoComplete="current-password" placeholder="Votre mot de passe" disabled={loading} {...register('password', { required: 'Saisissez votre mot de passe.', minLength: { value: 8, message: 'Le mot de passe contient au moins 8 caractères.' } })} className="form-input h-11 w-full rounded-xl border-slate-300 bg-white pl-10 pr-11 text-sm shadow-sm focus:border-violet-500 focus:ring-violet-500" />
          <button type="button" aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'} onClick={() => setShowPassword((visible) => !visible)} className="absolute right-3 top-3 text-slate-400 hover:text-slate-700">
            {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
          </button>
        </div>
        {errors.password && <p className="mt-1.5 text-sm text-red-600">{errors.password.message}</p>}
      </div>

      <Button type="submit" disabled={loading} className="h-11 w-full rounded-xl bg-violet-700 font-semibold hover:bg-violet-800">
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {loading ? 'Connexion…' : 'Se connecter'}
      </Button>
    </form>
  );
}