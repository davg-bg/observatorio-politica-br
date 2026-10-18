import type { Redes } from '@/lib/queries/parlamentares';
import { Facebook, Globe, Instagram, Linkedin, Twitter, Youtube } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  redes: Redes;
  website: string | null;
  className?: string;
}

const PLATAFORMAS: Array<{
  key: keyof Redes;
  label: string;
  Icon: typeof Twitter;
}> = [
  { key: 'twitter', label: 'Twitter / X', Icon: Twitter },
  { key: 'instagram', label: 'Instagram', Icon: Instagram },
  { key: 'facebook', label: 'Facebook', Icon: Facebook },
  { key: 'youtube', label: 'YouTube', Icon: Youtube },
  { key: 'tiktok', label: 'TikTok', Icon: Globe },
  { key: 'linkedin', label: 'LinkedIn', Icon: Linkedin },
];

export function RedesSociaisList({ redes, website, className }: Props) {
  const entries = PLATAFORMAS.map((p) => ({ ...p, data: redes[p.key] })).filter(
    (p): p is typeof p & { data: NonNullable<typeof p.data> } => Boolean(p.data?.url),
  );

  if (entries.length === 0 && !website) {
    return <p className="text-sm text-muted-foreground">Não há redes sociais cadastradas.</p>;
  }

  return (
    <ul className={cn('flex flex-wrap gap-2', className)}>
      {website && (
        <li>
          <a
            href={website}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors hover:bg-accent"
          >
            <Globe className="h-3.5 w-3.5" />
            Site oficial
          </a>
        </li>
      )}
      {entries.map(({ key, label, Icon, data }) => (
        <li key={key}>
          <a
            href={data.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs transition-colors hover:bg-accent"
            aria-label={`${label}: ${data.handle}`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{label}</span>
            <span className="font-mono text-muted-foreground">@{data.handle}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
