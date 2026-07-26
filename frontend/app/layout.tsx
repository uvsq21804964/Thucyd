import './globals.css';
import type { Metadata } from 'next';
import ToasterContext from '@/components/ToasterContext';

export const metadata: Metadata = {
  title: 'IMT Audit',
  description: "Une application correspondant aux besoins des prestataires de l'ANSSI",
  icons: { icon: '/images/LogoBlancEcole.png' },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className="font-sans">
        <ToasterContext />
        {children}
      </body>
    </html>
  );
}