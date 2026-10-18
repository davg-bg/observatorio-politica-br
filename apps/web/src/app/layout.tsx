import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Observatório da Política Brasileira',
  description:
    'Acompanhamento imparcial do Legislativo, Executivo e STF a partir de dados oficiais.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className="min-h-screen bg-background font-sans antialiased">{children}</body>
    </html>
  );
}
