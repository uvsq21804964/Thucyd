/* eslint-disable import/prefer-default-export */

'use client';

import * as React from 'react';

import {
  ColumnDef,
  ColumnFiltersState,
  SortingState,
  VisibilityState,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';

import Link from 'next/link';
import { PlusCircle } from 'lucide-react';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Button as UIButton } from '@/components/ui/button';
import Button from '@/components/Button';
import { Input } from '@/components/ui/input';

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface DataTableProps<TData, TValue> {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
}

export function DataTable<TData, TValue>({
  columns,
  data,
}: DataTableProps<TData, TValue>) {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [rowSelection, setRowSelection] = React.useState({});
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    onSortingChange: setSorting,
    getSortedRowModel: getSortedRowModel(),
    onColumnFiltersChange: setColumnFilters,
    getFilteredRowModel: getFilteredRowModel(),
    onRowSelectionChange: setRowSelection,
    onColumnVisibilityChange: setColumnVisibility,
    state: {
      sorting,
      columnFilters,
      columnVisibility,
      rowSelection,
    },
  });

  return (
    <div>
      <div className="flex items-center py-4 justify-between">
        <h2
          className="
            hidden 
            md:flex
            text-4xl
            font-bold
            tracking-tight
            text-white
            text-shadow
          "
        >
          Gestion des comptes
        </h2>
        <Input
          placeholder="Rechercher un nom..."
          value={(table.getColumn('name')?.getFilterValue() as string) ?? ''}
          onChange={(event) =>
            table.getColumn('name')?.setFilterValue(event.target.value)
          }
          className="max-w-sm bg-text1 text-text2 shadow-md shadow-slate-900 border-text1"
        />
        <div>
          <Link href="/admin/create-account">
            <Button shadow border violetFonce>
              <PlusCircle className="w-5 h-5 mr-2" />
              Ajouter un auditeur
            </Button>
          </Link>
        </div>
      </div>
      <div className="rounded-md border border-text1 shadow-md shadow-slate-900 bg-text1 text-text2">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => {
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  );
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && 'selected'}
                  className={
                    row.getIsSelected() ? 'bg-buttonSidebar text-black' : ''
                  }
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                      )}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="h-24 text-center"
                >
                  Aucun résultat.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex items-center justify-end  py-4 space-x-2">
        {/* <div className="flex-1 text-sm text-buttonSidebar">
          {table.getFilteredSelectedRowModel().rows.length} /{' '}
          {table.getFilteredRowModel().rows.length}
          {table.getFilteredSelectedRowModel().rows.length > 1
            ? ' lignes sélectionnées.'
            : ' ligne sélectionnée.'}
        </div> */}
        <div className="flex-1 text-sm text-buttonSidebar">
          {table.getFilteredRowModel().rows.length} /{' '}
          {table.getCoreRowModel().rows.length}
          {table.getFilteredRowModel().rows.length > 1
            ? ' lignes correspondent à la recherche.'
            : ' ligne correspond à la recherche.'}
        </div>
        <div className="flex-1">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <UIButton
                className="shadow shadow-slate-900 bg-text1 text-text2 ml-auto border-text1"
                variant="outline"
                size="sm"
              >
                Colonnes visibles
              </UIButton>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="bg-red-100">
              {table
                .getAllColumns()
                .filter((column) => column.getCanHide())
                .map((column) => {
                  return (
                    <DropdownMenuCheckboxItem
                      key={column.id}
                      className="capitalize hover:font-bold"
                      checked={column.getIsVisible()}
                      onCheckedChange={(value) =>
                        column.toggleVisibility(!!value)
                      }
                    >
                      {column.id !== 'name' ? column.id : 'Nom'}
                    </DropdownMenuCheckboxItem>
                  );
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <div className="space-x-2">
          <UIButton
            className="shadow shadow-slate-900 bg-text1 text-text2 border-text1"
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Précédent
          </UIButton>
          <UIButton
            className="shadow shadow-slate-900 bg-text1 text-text2 border-text1"
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Suivant
          </UIButton>
        </div>
      </div>
    </div>
  );
}
