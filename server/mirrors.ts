import { ShadowLibraryMirror } from '../src/types';

/**
 * Curated list of verified mirrors, open repositories, and Polish ebook sources:
 * - Docer & Doci (docer.pl, doci.pl, docer.tips)
 * - Chomikuj (chomikuj.pl)
 * - Polskie bazy darmowe (Polona.pl, WolneLektury.pl, Robert J. Szmidt bazaebokow.robertjszmidt.pl, Ebooks43.pl, Złote Myśli)
 * - Polskie księgarnie z darmowymi e-bookami (Woblink.com, Helion.pl, Publio.pl)
 * - Shadow Libraries (Anna's Archive, Z-Library / pl.1lib.sk, LibGen, Sci-Hub, Memory of the World, Liber3)
 * - Wyszukiwarki plików i książek (4shared.com, PDF Drive, Ebook Hunter, Open Library, Project Gutenberg, Baen Free Library, PDFBooksWorld, ReadAnyBook, ESSPC)
 */
export const SHADOW_LIBRARY_MIRRORS: ShadowLibraryMirror[] = [
  // 1. Polskie bazy dokumentów i e-booków
  {
    id: 'docer-pl',
    name: 'Docer.pl',
    category: 'polish_docs',
    domain: 'docer.pl',
    searchUrlTemplate: 'https://docer.pl/show/?q={query}',
    description: 'Największa polska baza dokumentów, podręczników i e-booków (PDF, EPUB, MOBI, DOC).',
    isPrimary: true,
  },
  {
    id: 'doci-pl',
    name: 'Doci.pl',
    category: 'polish_docs',
    domain: 'doci.pl',
    searchUrlTemplate: 'https://doci.pl/show/?q={query}',
    description: 'Bliźniacza polska platforma wymiany e-booków i publikacji z bezpośrednimi linkami.',
    isPrimary: true,
  },
  {
    id: 'docer-tips',
    name: 'Docer.tips',
    category: 'polish_docs',
    domain: 'docer.tips',
    searchUrlTemplate: 'https://docer.tips/show/?q={query}',
    description: 'Międzynarodowy i alternatywny mirror bazy Docer.',
  },
  {
    id: 'chomikuj',
    name: 'Chomikuj.pl',
    category: 'polish_docs',
    domain: 'chomikuj.pl',
    searchUrlTemplate: 'https://chomikuj.pl/action/SearchFiles?FileName={query}',
    description: 'Kultowy polski dysk internetowy z setkami tysięcy książek (EPUB, MOBI, PDF).',
    isPrimary: true,
  },

  // 2. Polskie legalne bazy darmowych e-booków
  {
    id: 'polona-pl',
    name: 'Polona (Biblioteka Narodowa)',
    category: 'polish_free',
    domain: 'polona.pl',
    searchUrlTemplate: 'https://polona.pl/search/?query={query}',
    description: 'Cyfrowe zbiory Biblioteki Narodowej: miliony książek, czasopism, starodruków i rękopisów.',
    isPrimary: true,
  },
  {
    id: 'wolnelektury',
    name: 'Wolne Lektury',
    category: 'polish_free',
    domain: 'wolnelektury.pl',
    searchUrlTemplate: 'https://wolnelektury.pl/katalog/szukaj/?q={query}',
    description: 'Darmowa polska biblioteka szkolna i klasyka literatury w formatach EPUB, MOBI, PDF i audiobook.',
    isPrimary: true,
  },
  {
    id: 'szmidt-baza',
    name: 'Baza Ebooków (R.J. Szmidt)',
    category: 'polish_free',
    domain: 'bazaebokow.robertjszmidt.pl',
    searchUrlTemplate: 'http://www.bazaebokow.robertjszmidt.pl/ebooki_r',
    description: 'Katalog e-booków i fantastyki prowadzony przez pisarza Roberta J. Szmidta.',
  },
  {
    id: 'ebooks43-pl',
    name: 'Ebooks43.pl',
    category: 'polish_free',
    domain: 'ebooks43.pl',
    searchUrlTemplate: 'https://www.ebooks43.pl/',
    description: 'Polska platforma i katalog darmowych e-booków do czytania online i pobrania.',
  },
  {
    id: 'zlotemysli-pl',
    name: 'Złote Myśli (Darmowe)',
    category: 'polish_free',
    domain: 'zlotemysli.pl',
    searchUrlTemplate: 'https://www.zlotemysli.pl/kategorie/20/darmowe-ebooki.html',
    description: 'Kolekcja bezpłatnych e-booków o rozwoju osobistym, motywacji, psychologii i biznesie.',
  },

  // 3. Polskie księgarnie z legalnymi darmowymi e-bookami
  {
    id: 'woblink-darmowe',
    name: 'Woblink (Darmowe E-booki)',
    category: 'polish_stores',
    domain: 'woblink.com',
    searchUrlTemplate: 'https://woblink.com/katalog/ebooki/darmowe?q={query}',
    description: 'Tysiące bezpłatnych e-booków promocyjnych, klasyki i fragmentów od polskich wydawców.',
    isPrimary: true,
  },
  {
    id: 'helion-darmowe',
    name: 'Helion (Darmowe Publikacje)',
    category: 'polish_stores',
    domain: 'helion.pl',
    searchUrlTemplate: 'https://helion.pl/kategorie/darmowe',
    description: 'Bezpłatne e-booki informatyczne, podręczniki, poradniki i fragmenty wydawnictwa Helion.',
  },
  {
    id: 'publio-darmowe',
    name: 'Publio (Darmowe)',
    category: 'polish_stores',
    domain: 'publio.pl',
    searchUrlTemplate: 'https://publio.pl/audiobooki,e-booki,darmowe.html',
    description: 'Darmowe e-booki i audiobooki w księgarni Publio (Agory).',
  },

  // 4. Z-Library & 1lib (w tym polski mirror)
  {
    id: 'pl-1lib-sk',
    name: 'Z-Library Polska (pl.1lib.sk)',
    category: 'zlib',
    domain: 'pl.1lib.sk',
    searchUrlTemplate: 'https://pl.1lib.sk/s/{query}',
    description: 'Dedykowany polskojęzyczny węzeł dostępowy Z-Library.',
    isPrimary: true,
  },
  {
    id: 'zlib-sk',
    name: 'Z-Library (SK)',
    category: 'zlib',
    domain: 'z-library.sk',
    searchUrlTemplate: 'https://z-library.sk/s/{query}',
    description: 'Główny europejski mirror Z-Library.',
  },
  {
    id: '1lib-sk',
    name: '1lib (SK Mirror)',
    category: 'zlib',
    domain: '1lib.sk',
    searchUrlTemplate: 'https://1lib.sk/s/{query}',
    description: 'Lustro Z-Library w domenie 1lib.',
  },

  // 5. Anna's Archive
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
    name: "Anna's Archive (PK)",
    category: 'annas',
    domain: 'annas-archive.pk',
    searchUrlTemplate: 'https://annas-archive.pk/search?q={query}',
    description: 'Szybki alternatywny mirror Anna’s Archive.',
  },

  // 6. Library Genesis (LibGen)
  {
    id: 'libgen-li',
    name: 'LibGen (.li)',
    category: 'libgen',
    domain: 'libgen.li',
    searchUrlTemplate: 'https://libgen.li/index.php?req={query}',
    description: 'Stabilny mirror Library Genesis dla książek naukowych i beletrystyki.',
    isPrimary: true,
  },
  {
    id: 'libgen-vg',
    name: 'LibGen (.vg)',
    category: 'libgen',
    domain: 'libgen.vg',
    searchUrlTemplate: 'https://libgen.vg/index.php?req={query}',
    description: 'Alternatywny mirror LibGen.',
  },

  // 7. Globalne otwarte bazy literatury i domena publiczna
  {
    id: 'openlibrary',
    name: 'Open Library (Internet Archive)',
    category: 'global_free',
    domain: 'openlibrary.org',
    searchUrlTemplate: 'https://openlibrary.org/search?q={query}',
    description: 'Otwarty katalog milionów książek z pożyczaniem i darmowymi wersjami EPUB/PDF.',
    isPrimary: true,
  },
  {
    id: 'gutenberg',
    name: 'Project Gutenberg',
    category: 'global_free',
    domain: 'gutenberg.org',
    searchUrlTemplate: 'https://www.gutenberg.org/ebooks/search/?query={query}',
    description: 'Ponad 70 000 darmowych e-booków w domenie publicznej bez zabezpieczeń DRM.',
    isPrimary: true,
  },
  {
    id: 'baen-free',
    name: 'Baen Free Library',
    category: 'global_free',
    domain: 'baen.com',
    searchUrlTemplate: 'https://www.baen.com/allbooks/category/index/id/2012',
    description: 'Oficjalna darmowa biblioteka fantastyki i science-fiction od wydawnictwa Baen Books.',
  },
  {
    id: 'pdfbooksworld',
    name: 'PDF Books World',
    category: 'global_free',
    domain: 'pdfbooksworld.com',
    searchUrlTemplate: 'https://www.pdfbooksworld.com/?s={query}',
    description: 'Wysokiej jakości sformatowane książki PDF z profesjonalną typografią i ilustracjami.',
  },
  {
    id: 'readanybook',
    name: 'ReadAnyBook',
    category: 'global_free',
    domain: 'readanybook.com',
    searchUrlTemplate: 'https://www.readanybook.com/search?q={query}',
    description: 'Baza książek online z możliwością czytania w przeglądarce i pobierania.',
  },
  {
    id: 'esspc-ebooks',
    name: 'ESSPC Ebooks',
    category: 'global_free',
    domain: 'esspc-ebooks.com',
    searchUrlTemplate: 'https://esspc-ebooks.com/',
    description: 'Kolekcja publikacji, podręczników i monografii naukowych.',
  },

  // 8. Wyszukiwarki plików i zdecentralizowane biblioteki
  {
    id: '4shared',
    name: '4shared Files',
    category: 'file_search',
    domain: '4shared.com',
    searchUrlTemplate: 'https://www.4shared.com/web/q#query={query}',
    description: 'Globalny dysk sieciowy z wielką liczbą udostępnionych plików EPUB, MOBI i PDF.',
    isPrimary: true,
  },
  {
    id: 'pdfdrive',
    name: 'PDF Drive',
    category: 'file_search',
    domain: 'pdfdrive.com',
    searchUrlTemplate: 'https://www.pdfdrive.com/search?q={query}',
    description: 'Wyszukiwarka ponad 75 milionów plików i podręczników PDF.',
    isPrimary: true,
  },
  {
    id: 'ebook-hunter',
    name: 'Ebook Hunter',
    category: 'file_search',
    domain: 'ebook-hunter.org',
    searchUrlTemplate: 'https://ebook-hunter.org/?s={query}',
    description: 'Wyszukiwarka nowości książkowych i bestsellerów w formatach cyfrowych.',
  },
  {
    id: 'memoryoftheworld',
    name: 'Memory of the World',
    category: 'file_search',
    domain: 'library.memoryoftheworld.org',
    searchUrlTemplate: 'https://library.memoryoftheworld.org/#/search/{query}',
    description: 'Niezależna biblioteka publiczna (Memory of the World / Marcell).',
  },
  {
    id: 'liber3',
    name: 'Liber3 (IPFS Web3)',
    category: 'file_search',
    domain: 'liber3.eth.limo',
    searchUrlTemplate: 'https://liber3.eth.limo/#/search?q={query}',
    description: 'Zdecentralizowana biblioteka IPFS/ENS na blockchainie Ethereum.',
  },
  {
    id: 'scihub-st',
    name: 'Sci-Hub (.st)',
    category: 'file_search',
    domain: 'sci-hub.st',
    searchUrlTemplate: 'https://sci-hub.st/{query}',
    description: 'Baza milionów artykułów naukowych, monografii i publikacji akademickich.',
  },
];

/**
 * Generate deep search links for a given book title or query across key repositories
 */
export function generateMirrorSearchLinks(query: string): { name: string; url: string; category: string; badge?: string }[] {
  const enc = encodeURIComponent(query.trim());
  return [
    // Polskie bazy dokumentów
    {
      name: 'Docer.pl',
      url: `https://docer.pl/show/?q=${enc}`,
      category: 'polish_docs',
      badge: 'PL',
    },
    {
      name: 'Doci.pl',
      url: `https://doci.pl/show/?q=${enc}`,
      category: 'polish_docs',
      badge: 'PL',
    },
    {
      name: 'Chomikuj.pl',
      url: `https://chomikuj.pl/action/SearchFiles?FileName=${enc}`,
      category: 'polish_docs',
      badge: 'PL',
    },
    {
      name: '4shared',
      url: `https://www.4shared.com/web/q#query=${enc}`,
      category: 'file_search',
      badge: 'PL/EN',
    },

    // Polskie oficjalne bazy
    {
      name: 'Polona (BN)',
      url: `https://polona.pl/search/?query=${enc}`,
      category: 'polish_free',
      badge: 'PL Wolne',
    },
    {
      name: 'Wolne Lektury',
      url: `https://wolnelektury.pl/katalog/szukaj/?q=${enc}`,
      category: 'polish_free',
      badge: 'PL Wolne',
    },
    {
      name: 'Woblink (Darmowe)',
      url: `https://woblink.com/katalog/ebooki/darmowe?q=${enc}`,
      category: 'polish_stores',
      badge: 'Sklep',
    },
    {
      name: 'Publio (Darmowe)',
      url: `https://publio.pl/szukaj,q.html?q=${enc}`,
      category: 'polish_stores',
      badge: 'Sklep',
    },
    {
      name: 'Helion (Darmowe)',
      url: `https://helion.pl/kategorie/darmowe`,
      category: 'polish_stores',
      badge: 'Sklep',
    },
    {
      name: 'Złote Myśli',
      url: `https://www.zlotemysli.pl/kategorie/20/darmowe-ebooki.html`,
      category: 'polish_free',
      badge: 'Darmowe',
    },
    {
      name: 'Baza R.J. Szmidt',
      url: `http://www.bazaebokow.robertjszmidt.pl/ebooki_r`,
      category: 'polish_free',
      badge: 'Sci-Fi',
    },

    // Shadow Libraries & Globalne
    {
      name: 'Z-Library (pl.1lib.sk)',
      url: `https://pl.1lib.sk/s/${enc}`,
      category: 'zlib',
      badge: 'Shadow',
    },
    {
      name: "Anna's Archive",
      url: `https://annas-archive.gl/search?q=${enc}`,
      category: 'annas',
      badge: 'Giga',
    },
    {
      name: 'LibGen (.li)',
      url: `https://libgen.li/index.php?req=${enc}`,
      category: 'libgen',
      badge: 'Shadow',
    },
    {
      name: 'Open Library',
      url: `https://openlibrary.org/search?q=${enc}`,
      category: 'global_free',
      badge: 'Archive',
    },
    {
      name: 'Project Gutenberg',
      url: `https://www.gutenberg.org/ebooks/search/?query=${enc}`,
      category: 'global_free',
      badge: 'Public Domain',
    },
    {
      name: 'PDF Drive',
      url: `https://www.pdfdrive.com/search?q=${enc}`,
      category: 'file_search',
      badge: 'PDF',
    },
    {
      name: 'Ebook Hunter',
      url: `https://ebook-hunter.org/?s=${enc}`,
      category: 'file_search',
      badge: 'EPUB',
    },
    {
      name: 'PDF Books World',
      url: `https://www.pdfbooksworld.com/?s=${enc}`,
      category: 'global_free',
      badge: 'PDF',
    },
    {
      name: 'ReadAnyBook',
      url: `https://www.readanybook.com/search?q=${enc}`,
      category: 'global_free',
      badge: 'Online',
    },
    {
      name: 'Baen Free Library',
      url: `https://www.baen.com/allbooks/category/index/id/2012`,
      category: 'global_free',
      badge: 'Sci-Fi',
    },
    {
      name: 'Memory of the World',
      url: `https://library.memoryoftheworld.org/#/search/${enc}`,
      category: 'file_search',
      badge: 'Web3',
    },
  ];
}
