export type UserRole = 'ADMIN' | 'AUDITOR' | 'SUPERADMIN';

export type AuthenticatedUser = {
  id: string;
  email: string;
  name: string;
  role: UserRole;
};

export type ClientAuthResult = {
  authenticated: true;
  user: AuthenticatedUser;
};

type ApiAuthResult = Omit<ClientAuthResult, 'user'> & {
  user: Omit<AuthenticatedUser, 'role'> & { role: number | string };
};

const roleNames: Record<string, UserRole> = {
  '0': 'SUPERADMIN',
  '1': 'ADMIN',
  '2': 'AUDITOR',
};

export async function clientAuth(): Promise<ClientAuthResult> {
  const baseUrl = '/backend/';
  const response = await fetch(`${baseUrl}auth/me`, {
    method: 'GET',
    credentials: 'include',
  });
  if (!response.ok) throw new Error("Échec de l'authentification");
  const data = (await response.json()) as ApiAuthResult;
  const role = roleNames[String(data.user.role)];
  if (!role) throw new Error('Rôle utilisateur invalide');
  return { ...data, user: { ...data.user, role } };
}