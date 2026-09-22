import { ShadowLibraryMirror } from '../src/types';

/**
 * Curated list of verified mirrors and shadow libraries specified by the user:
 * - Anna's Archive (annas-archive.gl, annas-archive.pk, annas-archive.gd, software.annas-archive.gl)
 * - Z-Library / 1lib (z-library.sk, 1lib.sk, z-lib.gl, z-lib.gd, go-to-library.sk, library-access.sk, welib.org, yqrii5.org, wbsg8v.xyz)
 * - LibGen (libgen.li, libgen.vg, libgen.bz, libgen.gl, libgen.la)
 * - Decentralized / IPFS / Memory of the World (libstc.nexus, liber3.eth.limo, library.memoryoftheworld.org)
 * - Sci-Hub & Academic (sci-hub.ru, sci-hub.su, sci-hub.st, sci-hub.red, sci-hub.box, sci-net.xyz)
 */
export const SHADOW_LIBRARY_MIRRORS: ShadowLibraryMirror[] = [
  // Anna's Archive mirrors
  {
    id: 'annas-gl',
    name: "Anna's Archive (Giga)",
    category: 'annas',
    domain: 'annas-archive.gl',
    searchUrlTemplate: 'https://annas-archive.gl/search?q={query}',
    description: 'Największa otwarta multi-wyszukiwarka książek, artykułów i komiksów.',
    isPrimary: true,
  },
  {
    id: 'annas-pk',
    name: "Anna's Archive (PK Mirror)",
    category: 'annas',
    domain: 'annas-archive.pk',
    searchUrlTemplate: 'https://annas-archive.pk/search?q={query}',
    description: 'Szybki alternatywny mirror Anna’s Archive.',
  },
  {
    id: 'annas-gd',
    name: "Anna's Archive (GD Mirror)",
    category: 'annas',
    domain: 'annas-archive.gd',
    searchUrlTemplate: 'https://annas-archive.gd/search?q={query}',
    description: 'Dodatkowy mirror domenowy Anna’s Archive.',
  },
  {
    id: 'annas-software',
    name: "Anna's Archive Software",
    category: 'annas',
    domain: 'software.annas-archive.gl',
    searchUrlTemplate: 'https://software.annas-archive.gl/search?q={query}',
    description: 'Baza oprogramowania, kodu i danych Anna’s Archive.',
  },

  // Z-Library mirrors
  {
    id: 'zlib-sk',
    name: 'Z-Library (SK)',
    category: 'zlib',
    domain: 'z-library.sk',
    searchUrlTemplate: 'https://z-library.sk/s/{query}',
    description: 'Główny oficjalny mirror Z-Library dla Europy.',
    isPrimary: true,
  },
  {
    id: '1lib-sk',
    name: '1lib (SK Mirror)',
    category: 'zlib',
    domain: '1lib.sk',
    searchUrlTemplate: 'https://1lib.sk/s/{query}',
    description: 'Lustro Z-Library w domenie 1lib.',
  },
  {
    id: 'zlib-gl',
    name: 'Z-Lib (GL)',
    category: 'zlib',
    domain: 'z-lib.gl',
    searchUrlTemplate: 'https://z-lib.gl/s/{query}',
    description: 'Globalny mirror dostępowy Z-Library.',
  },
  {
    id: 'zlib-gd',
    name: 'Z-Lib (GD)',
    category: 'zlib',
    domain: 'z-lib.gd',
    searchUrlTemplate: 'https://z-lib.gd/s/{query}',
    description: 'Alternatywna domena Z-Library.',
  },
  {
    id: 'zlib-goto',
    name: 'Go-To Library (SK)',
    category: 'zlib',
    domain: 'go-to-library.sk',
    searchUrlTemplate: 'https://go-to-library.sk/s/{query}',
    description: 'Bramka przekierowująca Z-Library.',
  },
  {
    id: 'zlib-access',
    name: 'Library Access (SK)',
    category: 'zlib',
    domain: 'library-access.sk',
    searchUrlTemplate: 'https://library-access.sk/s/{query}',
    description: 'Bezpośredni węzeł dostępowy Z-Library.',
  },
  {
    id: 'zlib-welib',
    name: 'WeLib',
    category: 'zlib',
    domain: 'welib.org',
    searchUrlTemplate: 'https://welib.org/s/{query}',
    description: 'Alternatywny interfejs biblioteczny WeLib.',
  },
  {
    id: 'zlib-yqrii5',
    name: 'Z-Lib Node (yqrii5)',
    category: 'zlib',
    domain: 'yqrii5.org',
    searchUrlTemplate: 'https://yqrii5.org/s/{query}',
    description: 'Zapasowy węzeł serwerowy Z-Library.',
  },
  {
    id: 'zlib-wbsg8v',
    name: 'Z-Lib Node (wbsg8v)',
    category: 'zlib',
    domain: 'wbsg8v.xyz',
    searchUrlTemplate: 'https://wbsg8v.xyz/s/{query}',
    description: 'Lekki węzeł lustrzany Z-Library.',
  },

  // LibGen (Library Genesis)
  {
    id: 'libgen-li',
    name: 'LibGen (.li)',
    category: 'libgen',
    domain: 'libgen.li',
    searchUrlTemplate: 'https://libgen.li/index.php?req={query}',
    description: 'Najpopularniejszy i stabilny mirror Library Genesis.',
    isPrimary: true,
  },
  {
    id: 'libgen-vg',
    name: 'LibGen (.vg)',
    category: 'libgen',
    domain: 'libgen.vg',
    searchUrlTemplate: 'https://libgen.vg/index.php?req={query}',
    description: 'Szybki mirror Library Genesis dla literatury i artykułów.',
  },
  {
    id: 'libgen-bz',
    name: 'LibGen (.bz)',
    category: 'libgen',
    domain: 'libgen.bz',
    searchUrlTemplate: 'https://libgen.bz/index.php?req={query}',
    description: 'Mirror Library Genesis w domenie .bz.',
  },
  {
    id: 'libgen-gl',
    name: 'LibGen (.gl)',
    category: 'libgen',
    domain: 'libgen.gl',
    searchUrlTemplate: 'https://libgen.gl/index.php?req={query}',
    description: 'Globalny mirror LibGen.',
  },
  {
    id: 'libgen-la',
    name: 'LibGen (.la)',
    category: 'libgen',
    domain: 'libgen.la',
    searchUrlTemplate: 'https://libgen.la/index.php?req={query}',
    description: 'Dedykowany mirror LibGen w Ameryce Łacińskiej.',
  },

  // Decentralized / IPFS / Memory of the World
  {
    id: 'libstc-nexus',
    name: 'Nexus / STC',
    category: 'decentralized',
    domain: 'libstc.nexus',
    searchUrlTemplate: 'https://libstc.nexus/#/search?q={query}',
    description: 'Zdecentralizowana sieć STC (Standard Template Construct / Nexus).',
  },
  {
    id: 'liber3',
    name: 'Liber3 (IPFS Web3)',
    category: 'decentralized',
    domain: 'liber3.eth.limo',
    searchUrlTemplate: 'https://liber3.eth.limo/#/search?q={query}',
    description: 'Zdecentralizowana biblioteka IPFS/ENS na blockchainie Ethereum.',
    isPrimary: true,
  },
  {
    id: 'memoryoftheworld',
    name: 'Memory of the World',
    category: 'decentralized',
    domain: 'library.memoryoftheworld.org',
    searchUrlTemplate: 'https://library.memoryoftheworld.org/#/search/{query}',
    description: 'Niezależna biblioteka publiczna (Memory of the World / Marcell).',
  },

  // Sci-Hub & Academic
  {
    id: 'scihub-st',
    name: 'Sci-Hub (.st)',
    category: 'scihub',
    domain: 'sci-hub.st',
    searchUrlTemplate: 'https://sci-hub.st/{query}',
    description: 'Baza milionów artykułów naukowych, monografii i publikacji.',
    isPrimary: true,
  },
  {
    id: 'scihub-ru',
    name: 'Sci-Hub (.ru)',
    category: 'scihub',
    domain: 'sci-hub.ru',
    searchUrlTemplate: 'https://sci-hub.ru/{query}',
    description: 'Pierwotny węzeł Sci-Hub.',
  },
  {
    id: 'scihub-su',
    name: 'Sci-Hub (.su)',
    category: 'scihub',
    domain: 'sci-hub.su',
    searchUrlTemplate: 'https://sci-hub.su/{query}',
    description: 'Alternatywny mirror Sci-Hub .su.',
  },
  {
    id: 'scihub-red',
    name: 'Sci-Hub (.red)',
    category: 'scihub',
    domain: 'sci-hub.red',
    searchUrlTemplate: 'https://sci-hub.red/{query}',
    description: 'Mirror dostępowy Sci-Hub Red.',
  },
  {
    id: 'scihub-box',
    name: 'Sci-Hub (.box)',
    category: 'scihub',
    domain: 'sci-hub.box',
    searchUrlTemplate: 'https://sci-hub.box/{query}',
    description: 'Mirror domenowy Sci-Hub Box.',
  },
  {
    id: 'scinet',
    name: 'Sci-Net (.xyz)',
    category: 'scihub',
    domain: 'sci-net.xyz',
    searchUrlTemplate: 'https://sci-net.xyz/{query}',
    description: 'Portal wymiany publikacji naukowych Sci-Net.',
  },
];

/**
 * Generate deep search links for a given book title or query across key repositories
 */
export function generateMirrorSearchLinks(query: string): { name: string; url: string; category: string }[] {
  const enc = encodeURIComponent(query.trim());
  return [
    {
      name: "Anna's Archive",
      url: `https://annas-archive.gl/search?q=${enc}`,
      category: 'annas',
    },
    {
      name: 'Z-Library',
      url: `https://z-library.sk/s/${enc}`,
      category: 'zlib',
    },
    {
      name: 'LibGen (.li)',
      url: `https://libgen.li/index.php?req=${enc}`,
      category: 'libgen',
    },
    {
      name: 'Liber3 (IPFS)',
      url: `https://liber3.eth.limo/#/search?q=${enc}`,
      category: 'decentralized',
    },
    {
      name: 'Sci-Hub',
      url: `https://sci-hub.st/${enc}`,
      category: 'scihub',
    },
    {
      name: 'Memory of the World',
      url: `https://library.memoryoftheworld.org/#/search/${enc}`,
      category: 'decentralized',
    },
  ];
}
