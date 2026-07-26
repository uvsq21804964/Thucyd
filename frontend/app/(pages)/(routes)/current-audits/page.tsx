'use client';

import React, { useEffect, useState } from 'react';
import InstanceAPI from '@/lib/api-client';
import { DataTable } from './_components/data-table';
import { AuditRow, columns } from './_components/columns';

type ApiAudit = {
  _id: string;
  companie: string;
  chef?: string;
  date: string;
};

const OngoingAudits = () => {
  const [audits, setAudits] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const response = await InstanceAPI.get<ApiAudit[]>('currentAudits');
        const rows = await Promise.all(
          response.data.map(async ({ _id: id, ...audit }) => {
            const gauge = await InstanceAPI.get<AuditRow['Progression']>(
              `completionGauge/${id}`
            );
            return {
              Suppression: id,
              Organisme: audit.companie,
              Responsable: audit.chef || 'Non attribué',
              date: audit.date,
              Progression: gauge.data,
            };
          })
        );
        setAudits(rows);
      } catch {
        setAudits([]);
        setError(true);
      } finally {
        setLoading(false);
      }
    };
    fetchData();
  }, []);

  return (
    <div className="page-shell">
      {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">Impossible de charger les audits en cours.</div>}
      {loading ? <div className="surface-card p-10 text-center text-sm text-slate-500">Chargement des audits…</div> : <DataTable columns={columns} data={audits} />}
    </div>
  );
};

export default OngoingAudits;