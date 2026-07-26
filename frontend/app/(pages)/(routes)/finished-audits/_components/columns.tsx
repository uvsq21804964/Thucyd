/* eslint-disable import/prefer-default-export */

'use client';

import { ColumnDef } from '@tanstack/react-table';
import { ArrowUpDown, Eye } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export type FinishedAuditRow = {
  id: string;
  companyName: string;
  responsable: string;
  date: string;
  datefin: string;
};

const formatDate = (value: string) => new Intl.DateTimeFormat('fr-FR').format(new Date(value));

export const columns: ColumnDef<FinishedAuditRow>[] = [
  {
    accessorKey: 'companyName',
    header: ({ column }) => (
      <Button variant="ghost" onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}>
        Entreprise <ArrowUpDown className="ml-2 h-4 w-4" />
      </Button>
    ),
  },
  { accessorKey: 'responsable', header: "Responsable de l'audit" },
  { accessorKey: 'date', header: 'Date de début', cell: ({ row }) => formatDate(row.original.date) },
  { accessorKey: 'datefin', header: 'Date de fin', cell: ({ row }) => formatDate(row.original.datefin) },
  {
    id: 'actions',
    cell: ({ row }) => (
      <Link href={`/finished-audits/${row.original.id}`} aria-label="Voir l'audit">
        <Eye className="h-4 w-4 text-blue-600" />
      </Link>
    ),
  },
];