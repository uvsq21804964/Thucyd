'use client';

import React, { useEffect, useState } from 'react';
import InstanceAPI from '@/lib/api-client';
import { DataTable } from './_components/data-table';
import { columns, UserRow } from './_components/columns';

const UsersPage = () => {
  const [users, setUsers] = useState<UserRow[]>([]);

  useEffect(() => {
    InstanceAPI.get<{ users: UserRow[] }>('admin/accounts')
      .then(({ data }) => setUsers(data.users))
      .catch(() => setUsers([]));
  }, []);

  return <div className="p-6"><DataTable columns={columns} data={users} /></div>;
};

export default UsersPage;