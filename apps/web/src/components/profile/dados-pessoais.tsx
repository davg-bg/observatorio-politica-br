import type { ParlamentarDetalhe } from '@/lib/queries/parlamentares';

interface Props {
  parlamentar: ParlamentarDetalhe;
}

/**
 * Lista `<dl>` com dados pessoais. Campos omitidos quando ausentes
 * para não poluir visualmente (ex: Senado não expõe CPF).
 */
export function DadosPessoais({ parlamentar: p }: Props) {
  const items: Array<{ label: string; value: React.ReactNode }> = [];

  if (p.nomeCivil && p.nomeCivil !== p.nome) {
    items.push({ label: 'Nome civil', value: p.nomeCivil });
  }
  if (p.cpf) {
    items.push({ label: 'CPF', value: formatCpf(p.cpf) });
  }
  if (p.dataNascimento) {
    items.push({ label: 'Nascimento', value: formatDate(p.dataNascimento) });
  }
  if (p.sexo) {
    items.push({ label: 'Sexo', value: p.sexo === 'M' ? 'Masculino' : 'Feminino' });
  }
  if (p.escolaridade) {
    items.push({ label: 'Escolaridade', value: p.escolaridade });
  }
  if (p.profissao) {
    items.push({ label: 'Profissão', value: p.profissao });
  }
  if (p.email) {
    items.push({
      label: 'Email',
      value: (
        <a className="hover:underline" href={`mailto:${p.email}`}>
          {p.email}
        </a>
      ),
    });
  }

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">Sem dados pessoais cadastrados.</p>;
  }

  return (
    <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
      {items.map(({ label, value }) => (
        <div key={label}>
          <dt className="text-xs uppercase tracking-wide text-muted-foreground">{label}</dt>
          <dd className="mt-0.5 text-sm">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function formatCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, '').padStart(11, '0');
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
}

function formatDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00Z');
  const now = new Date();
  const years = now.getUTCFullYear() - d.getUTCFullYear();
  const formatted = d.toLocaleDateString('pt-BR', { timeZone: 'UTC' });
  return `${formatted} (${years} anos)`;
}
