/* eslint-disable import/prefer-default-export */

'use client';

import { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import InstanceAPI from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type UserRow = {
  id: string;
  name: string;
  email: string;
  role: number;
};

const roleLabels: Record<number, string> = {
  0: 'Super Administrateur',
  1: 'Administrateur',
  2: 'Auditeur',
};

const deleteAccount = (username: string) => {
  InstanceAPI.delete(`admin/delete?username=${encodeURIComponent(username)}`)
    .then(() => toast.success('Le compte a été supprimé.'))
    .catch(() => toast.error('La suppression du compte a échoué.'));
};

export const columns: ColumnDef<UserRow>[] = [
  {
    accessorKey: 'email',
    header: ({ column }) => (
      <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        E-mail <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
  },
  { accessorKey: 'name', header: 'Nom' },
  {
    accessorKey: 'role',
    header: 'Rôle',
    cell: ({ row }) => (
      <Badge className={cn(
        'bg-button text-white py-1 px-5 text-xs font-bold uppercase',
        row.original.role !== 2 && 'bg-sidebar'
      )}>
        {roleLabels[row.original.role] || 'Rôle inconnu'}
      </Badge>
    ),
  },
  {
    id: 'actions',
    cell: ({ row }) => row.original.role === 0 ? null : (
      <button type="button" onClick={() => deleteAccount(row.original.name)} aria-label="Supprimer le compte">
        <Trash2 className="h-4 w-4 text-red-600" />
      </button>
    ),
  },
];