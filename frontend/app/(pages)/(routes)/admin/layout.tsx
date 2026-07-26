'use client';

import { useEffect, useState } from 'react';
import { clientAuth } from '@/utils/authMiddleware';
import AccessDenied from './_components/AccesDenied';

const AdminLayout = ({ children }: { children: React.ReactNode }) => {
  const [authorized, setAuthorized] = useState<boolean>();

  useEffect(() => {
    clientAuth()
      .then(({ user }) => setAuthorized(user.role === 'ADMIN' || user.role === 'SUPERADMIN'))
      .catch(() => setAuthorized(false));
  }, []);

  if (authorized === undefined) return null;
  if (!authorized) return <AccessDenied />;
  return children;
};

export default AdminLayout;