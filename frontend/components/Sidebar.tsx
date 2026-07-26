'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Archive,
  ClipboardList,
  FilePlus2,
  LayoutDashboard,
  LogOut,
  ShieldCheck,
  Users,
} from 'lucide-react';
import toast from 'react-hot-toast';

import API from '@/lib/api-client';
import { cn } from '@/lib/utils';

type UserRole = 'ADMIN' | 'AUDITOR' | 'SUPERADMIN';

type SidebarProps = {
  mobile: boolean;
  role: UserRole;
  userName: string;
};

const mainNavigation = [
  { name: 'Tableau de bord', href: '/home', icon: LayoutDashboard },
  { name: 'Nouvel audit', href: '/create-audit', icon: FilePlus2 },
  { name: 'Audits en cours', href: '/current-audits', icon: ClipboardList },
  { name: 'Audits terminés', href: '/finished-audits', icon: Archive },
];

const roleLabels: Record<UserRole, string> = {
  SUPERADMIN: 'Super administrateur',
  ADMIN: 'Administrateur',
  AUDITOR: 'Auditeur',
};

export default function Sidebar({ mobile, role, userName }: SidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const navigation = role === 'AUDITOR'
    ? mainNavigation
    : [...mainNavigation, { name: 'Gestion des comptes', href: '/admin/accounts', icon: Users }];

  const logout = async () => {
    try {
      await API.post('disconnect');
      toast.success('Vous êtes déconnecté.');
    } catch {
      toast.error('La déconnexion a échoué.');
    } finally {
      router.replace('/login');
      router.refresh();
    }
  };

  return (
    <aside className={cn('flex h-full w-64 flex-col border-r border-white/10 bg-slate-950 px-3 py-4 text-slate-100', mobile && 'w-full')}>
      <Link href="/home" className="flex items-center gap-3 rounded-xl px-3 py-2">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white shadow-sm">
          <Image src="/images/LogoVioletEcole.png" width={36} height={36} alt="ORNISEC" className="h-8 w-8 object-contain" />
        </span>
        <span>
          <span className="block text-lg font-bold tracking-tight">PCE Audit</span>
          <span className="block text-xs text-slate-400">Pilotage cybersécurité</span>
        </span>
      </Link>

      <nav className="mt-8 flex-1 space-y-1" aria-label="Navigation principale">
        <p className="mb-3 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Espace de travail</p>
        {navigation.map(({ name, href, icon: Icon }) => {
          const active = pathname === href || pathname?.startsWith(`${href}/`);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors',
                active ? 'bg-violet-600 text-white shadow-lg shadow-violet-950/30' : 'text-slate-300 hover:bg-white/10 hover:text-white'
              )}
            >
              <Icon className="h-5 w-5 shrink-0" />
              <span>{name}</span>
            </Link>
          );
        })}
      </nav>

      <div className="space-y-3 border-t border-white/10 pt-4">
        <div className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-violet-500/20 text-violet-300"><ShieldCheck className="h-5 w-5" /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{userName}</p>
            <p className="truncate text-xs text-slate-400">{roleLabels[role]}</p>
          </div>
        </div>
        <button type="button" onClick={logout} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-red-500/10 hover:text-red-300">
          <LogOut className="h-5 w-5" />Déconnexion
        </button>
      </div>
    </aside>
  );
}