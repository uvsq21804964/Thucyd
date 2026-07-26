import Image from 'next/image';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import LoginForm from './_components/LoginForm';

const benefits = [
  'Pilotez vos audits depuis un espace unique',
  'Suivez la progression de chaque mission',
  'Centralisez scores, constats et rapports',
];

export default function SignIn() {
  return (
    <main className="grid min-h-screen bg-white lg:grid-cols-2">
      <section className="relative hidden overflow-hidden bg-slate-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(124,58,237,0.45),_transparent_42%)]" />
        <div className="relative flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-white">
            <Image src="/images/LogoVioletEcole.png" width={38} height={38} alt="ORNISEC" className="object-contain" />
          </span>
          <div><p className="text-xl font-bold">PCE Audit</p><p className="text-sm text-slate-400">Plateforme de conformité</p></div>
        </div>
        <div className="relative max-w-xl">
          <span className="mb-6 inline-flex items-center gap-2 rounded-full border border-violet-400/30 bg-violet-400/10 px-3 py-1 text-sm text-violet-200"><ShieldCheck className="h-4 w-4" />Audit cybersécurité</span>
          <h1 className="text-4xl font-bold leading-tight tracking-tight xl:text-5xl">Transformez vos constats en décisions concrètes.</h1>
          <p className="mt-5 text-lg leading-8 text-slate-300">Un espace clair pour réaliser, clôturer et valoriser vos audits organisationnels.</p>
          <ul className="mt-8 space-y-4">
            {benefits.map((benefit) => <li key={benefit} className="flex items-center gap-3 text-slate-200"><CheckCircle2 className="h-5 w-5 text-violet-400" />{benefit}</li>)}
          </ul>
        </div>
        <p className="relative text-xs text-slate-500">ORNISEC · Environnement sécurisé</p>
      </section>

      <section className="flex min-h-screen items-center justify-center bg-slate-50 px-5 py-10 sm:px-10">
        <div className="w-full max-w-md">
          <div className="mb-8 lg:hidden">
            <Image src="/images/LogoVioletEcole.png" width={48} height={48} alt="ORNISEC" />
          </div>
          <p className="text-sm font-semibold text-violet-700">Bienvenue</p>
          <h2 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Connectez-vous à votre espace</h2>
          <p className="mt-3 text-sm leading-6 text-slate-500">Utilisez les identifiants fournis par votre administrateur.</p>
          <LoginForm />
        </div>
      </section>
    </main>
  );
}