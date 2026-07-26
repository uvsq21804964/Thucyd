'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

import Sidebar from '@/components/Sidebar';
import { AuthenticatedUser, clientAuth } from '@/utils/authMiddleware';
import MobileSidebar from './_components/MobileSidebar';

export default function ClientLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<AuthenticatedUser | null>(null);

  useEffect(() => {
    clientAuth()
      .then(({ user: authenticatedUser }) => setUser(authenticatedUser))
      .catch(() => router.replace('/login'));
  }, [router]);

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100">
        <div className="flex flex-col items-center gap-4 text-slate-600">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-slate-200 border-t-violet-600" />
          <p className="text-sm font-medium">Préparation de votre espace…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-100 text-slate-950">
      <div className="fixed inset-y-0 left-0 z-40 hidden w-64 md:block">
        <Sidebar mobile={false} role={user.role} userName={user.name} />
      </div>
      <div className="sticky top-0 z-40 md:hidden">
        <MobileSidebar role={user.role} userName={user.name} />
      </div>
      <main className="min-h-screen md:pl-64">
        <div className="mx-auto min-h-screen max-w-[1600px]">{children}</div>
      </main>
    </div>
  );
}