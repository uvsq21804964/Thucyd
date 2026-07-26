import { UserPlus } from 'lucide-react';
import RegisterForm from './_components/RegisterForm';

export default function SignUp() {
  return (
    <div className="page-shell">
      <header>
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-100 text-violet-700"><UserPlus className="h-5 w-5" /></div>
        <h1 className="page-heading mt-4">Créer un utilisateur</h1>
        <p className="page-subtitle">Ajoutez un membre et définissez précisément son niveau d’accès.</p>
      </header>
      <RegisterForm />
    </div>
  );
}