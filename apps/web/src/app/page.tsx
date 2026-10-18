import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatusWidget } from '@/components/status-widget';
import { Archive, ArrowRight, BarChart3, FileText, Scale, Users, Vote } from 'lucide-react';

export default function HomePage() {
  return (
    <main className="container mx-auto max-w-6xl space-y-16 px-4 py-10">
      {/* Header / Hero */}
      <section className="space-y-6 text-center sm:text-left">
        <Badge variant="outline" className="mx-auto sm:mx-0">
          Em construção — Fase 0: Fundação
        </Badge>
        <h1 className="text-balance text-4xl font-bold tracking-tight sm:text-5xl">
          Observatório da Política Brasileira
        </h1>
        <p className="max-w-2xl text-balance text-lg text-muted-foreground">
          Acompanhamento imparcial do Legislativo, Executivo e STF a partir de dados oficiais.
          Perfis, agenda, votações, emendas e análise de alinhamento partidário — sem viés
          editorial, apenas o dado bruto organizado.
        </p>
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
          <Button asChild size="lg">
            <Link href="/parlamentares">
              Explorar parlamentares <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
          <Button asChild variant="outline" size="lg">
            <Link href="/sobre">Metodologia e fontes</Link>
          </Button>
        </div>
      </section>

      {/* Status do sistema */}
      <section>
        <StatusWidget />
      </section>

      {/* Features (placeholders até cada fase ser entregue) */}
      <section className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">O que o Observatório faz</h2>
          <p className="text-muted-foreground">
            Features entregues incrementalmente, por fase. Veja o plano em{' '}
            <Link href="/sobre#roadmap" className="underline">
              /sobre
            </Link>
            .
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <FeatureCard
            icon={<Users className="h-5 w-5" />}
            title="Perfis"
            description="Todos os 513 deputados, 81 senadores, ministros do STF e membros do Executivo com biografia, mandatos e redes."
            phase="Fase 1"
            available={true}
            href="/parlamentares"
          />
          <FeatureCard
            icon={<FileText className="h-5 w-5" />}
            title="Agenda do dia"
            description="Pautas em discussão hoje no plenário e nas comissões, atualizadas diariamente."
            phase="Fase 2"
            available={true}
            href="/agenda"
          />
          <FeatureCard
            icon={<Vote className="h-5 w-5" />}
            title="Votações nominais"
            description="Como cada parlamentar votou nas últimas sessões, com breakdown por partido."
            phase="Fase 2"
            available={true}
            href="/votacoes"
          />
          <FeatureCard
            icon={<BarChart3 className="h-5 w-5" />}
            title="Alinhamento partidário"
            description="Matriz de similaridade entre partidos (cosseno) e coesão interna (Índice de Rice)."
            phase="Fase 3"
            available={true}
            href="/alinhamento"
          />
          <FeatureCard
            icon={<FileText className="h-5 w-5" />}
            title="Emendas parlamentares"
            description="Quem destinou quanto, para onde foi o dinheiro, com valores executados pela União."
            phase="Fase 4"
            available={true}
            href="/emendas"
          />
          <FeatureCard
            icon={<Archive className="h-5 w-5" />}
            title="Projetos engavetados"
            description="PLs parados há mais de 180 dias sem tramitação, filtráveis por tema e autor."
            phase="Fase 4"
            available={true}
            href="/engavetados"
          />
          <FeatureCard
            icon={<Scale className="h-5 w-5" />}
            title="STF"
            description="Composição atual do Supremo com origem política das indicações. Agenda e votos virão em iterações seguintes."
            phase="Fase 6"
            available={true}
            href="/stf"
          />
        </div>
      </section>

      {/* Rodapé */}
      <footer className="border-t pt-6 text-sm text-muted-foreground">
        <p>
          Dados oficiais da Câmara dos Deputados, Senado Federal, Portal da Transparência, STF e
          Imprensa Nacional. Projeto open-source sem vínculo editorial.
        </p>
      </footer>
    </main>
  );
}

interface FeatureCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  phase: string;
  available: boolean;
  href?: string;
}

function FeatureCard({ icon, title, description, phase, available, href }: FeatureCardProps) {
  const body = (
    <Card className={available ? 'transition-colors hover:bg-accent/50' : 'opacity-60'}>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {icon}
            <CardTitle className="text-lg">{title}</CardTitle>
          </div>
          <Badge variant={available ? 'success' : 'outline'}>{available ? 'Disponível' : phase}</Badge>
        </div>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent />
    </Card>
  );
  if (available && href) {
    return (
      <Link href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-xl">
        {body}
      </Link>
    );
  }
  return body;
}
