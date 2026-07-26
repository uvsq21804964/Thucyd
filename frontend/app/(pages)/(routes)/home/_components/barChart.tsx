'use client';

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

export type MonthlyAudit = {
  month: string;
  count: number;
};

function AuditChart({ data }: { data: MonthlyAudit[] }) {
  return (
    <div className="h-[300px] w-full" aria-label="Audits terminés par mois">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" />
          <XAxis dataKey="month" />
          <YAxis allowDecimals={false} />
          <Tooltip />
          <Bar dataKey="count" name="Audits terminés" fill="#9400D3" barSize={24} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export default AuditChart;
