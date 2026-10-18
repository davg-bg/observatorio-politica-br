import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      // Fotos oficiais dos deputados (Câmara)
      { protocol: 'https', hostname: 'www.camara.leg.br' },
      { protocol: 'https', hostname: 'camara.leg.br' },
      // Fotos oficiais dos senadores (Senado)
      { protocol: 'https', hostname: 'www.senado.leg.br' },
      { protocol: 'http', hostname: 'www.senado.leg.br' },
      // Fotos dos ministros do STF
      { protocol: 'https', hostname: 'portal.stf.jus.br' },
    ],
  },
  experimental: {
    // Next 15 habilita React Compiler opcional; mantemos off por enquanto.
  },
};

export default nextConfig;
