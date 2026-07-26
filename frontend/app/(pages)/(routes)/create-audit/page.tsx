import { ClipboardCheck } from 'lucide-react';
import RegisterForm from './_components/RegisterForm';

export default function NewAudit() {
  return (
    <div className="page-shell">
      <header>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 text-violet-700"><ClipboardCheck className="h-5 w-5" /></div>
        <h1 className="page-heading mt-4">Créer un nouvel audit</h1>
        <p className="page-subtitle">Renseignez le contexte de la mission et constituez l’équipe d’audit.</p>
      </header>
      <RegisterForm />
    </div>
  );
}