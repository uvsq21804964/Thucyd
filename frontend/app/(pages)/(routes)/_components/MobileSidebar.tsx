import { Menu } from 'lucide-react';
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import Sidebar from '@/components/Sidebar';

type UserRole = 'ADMIN' | 'AUDITOR' | 'SUPERADMIN';

const MobileSidebar = ({ role, userName }: { role: UserRole; userName: string }) => (
  <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4 shadow-sm">
    <div>
      <p className="font-bold text-slate-950">PCE Audit</p>
      <p className="text-xs text-slate-500">Pilotage cybersécurité</p>
    </div>
    <Sheet>
      <SheetTrigger aria-label="Ouvrir la navigation" className="rounded-lg border border-slate-200 p-2 text-slate-700 transition hover:bg-slate-100">
        <Menu className="h-5 w-5" />
      </SheetTrigger>
      <SheetContent side="left" className="w-64 border-0 p-0">
        <Sidebar mobile role={role} userName={userName} />
      </SheetContent>
    </Sheet>
  </header>
);

export default MobileSidebar;