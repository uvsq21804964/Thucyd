'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Activity, ArrowRight, CheckCircle2, ClipboardList, Plus } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import API from '@/lib/api-client';
import AuditChart from './_components/barChart';

type DashboardStats = { total: number; current: number; finished: number; year: number; monthly_finished: number[] };
const months = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sep', 'Oct', 'Nov', 'Déc'];
const emptyStats: DashboardStats = { total: 0, current: 0, finished: 0, year: new Date().getFullYear(), monthly_finished: Array(12).fill(0) };

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats>(emptyStats);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    API.get<DashboardStats>('dashboard/stats')
      .then(({ data }) => setStats(data))
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  const chartData = useMemo(() => months.map((month, index) => ({ month, count: stats.monthly_finished[index] ?? 0 })), [stats.monthly_finished]);
  const cards = [
    { label: 'Total des audits', value: stats.total, help: 'Tous les audits accessibles', icon: ClipboardList, color: 'bg-violet-50 text-violet-700' },
    { label: 'Audits en cours', value: stats.current, help: 'Missions à poursuivre', icon: Activity, color: 'bg-amber-50 text-amber-700' },
    { label: 'Audits terminés', value: stats.finished, help: 'Rapports disponibles', icon: CheckCircle2, color: 'bg-emerald-50 text-emerald-700' },
  ];

  return (
    <div className="page-shell">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div><p className="text-sm font-semibold text-violet-700">Vue d’ensemble</p><h1 className="page-heading mt-1">Tableau de bord</h1><p className="page-subtitle">Suivez l’activité et accédez rapidement à vos missions.</p></div>
        <Button asChild className="rounded-xl bg-violet-700 hover:bg-violet-800"><Link href="/create-audit"><Plus className="mr-2 h-4 w-4" />Créer un audit</Link></Button>
      </header>

      {error && <div role="alert" className="flex items-center justify-between rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800"><span>Les statistiques sont momentanément indisponibles.</span><button type="button" className="font-semibold underline" onClick={() => window.location.reload()}>Réessayer</button></div>}

      <section className="grid gap-4 md:grid-cols-3" aria-label="Indicateurs principaux">
        {cards.map(({ label, value, help, icon: Icon, color }) => (
          <Card key={label} className="rounded-2xl border-slate-200 shadow-sm transition-shadow hover:shadow-md">
            <CardContent className="flex items-start justify-between p-6">
              <div><p className="text-sm font-medium text-slate-500">{label}</p><p className="mt-3 text-4xl font-bold tracking-tight text-slate-950" aria-busy={loading}>{loading ? '—' : value}</p><p className="mt-2 text-xs text-slate-400">{help}</p></div>
              <span className={`rounded-xl p-3 ${color}`}><Icon className="h-5 w-5" /></span>
            </CardContent>
          </Card>
        ))}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_320px]">
        <Card className="rounded-2xl border-slate-200 shadow-sm">
          <CardHeader><CardTitle className="text-lg">Audits terminés en {stats.year}</CardTitle><p className="text-sm text-slate-500">Répartition mensuelle des missions clôturées</p></CardHeader>
          <CardContent><AuditChart data={chartData} /></CardContent>
        </Card>
        <Card className="rounded-2xl border-slate-200 bg-slate-950 text-white shadow-sm">
          <CardHeader><CardTitle className="text-lg">Actions rapides</CardTitle><p className="text-sm text-slate-400">Reprenez votre travail là où vous l’avez laissé.</p></CardHeader>
          <CardContent className="space-y-2">
            <Link href="/current-audits" className="flex items-center justify-between rounded-xl bg-white/10 p-3 text-sm font-medium transition hover:bg-white/15"><span>Audits en cours</span><ArrowRight className="h-4 w-4" /></Link>
            <Link href="/finished-audits" className="flex items-center justify-between rounded-xl bg-white/10 p-3 text-sm font-medium transition hover:bg-white/15"><span>Consulter les rapports</span><ArrowRight className="h-4 w-4" /></Link>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}