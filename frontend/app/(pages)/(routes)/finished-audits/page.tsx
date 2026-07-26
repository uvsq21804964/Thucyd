'use client';

import React, { useEffect, useState } from 'react';
import InstanceAPI from '@/lib/api-client';
import { DataTable } from './_components/data-table';
import { columns, FinishedAuditRow } from './_components/columns';

type ApiAudit = { _id: string; companie: string; chef?: string; date: string; datefin?: string };

const FinishedAudits = () => {
  const [audits, setAudits] = useState<FinishedAuditRow[]>([]);

  useEffect(() => {
    InstanceAPI.get<ApiAudit[]>('finishedAudits')
      .then(({ data }) => setAudits(data.map(({ _id: id, ...audit }) => ({
        id,
        companyName: audit.companie,
        responsable: audit.chef || 'Non attribué',
        date: audit.date,
        datefin: audit.datefin || audit.date,
      }))))
      .catch(() => setAudits([]));
  }, []);

  return <div className="p-6"><DataTable columns={columns} data={audits} /></div>;
};

export default FinishedAudits;