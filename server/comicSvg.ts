/**
 * High-Fidelity Bande-Dessinée (Comic Album) SVG Generator for "Pamiętniki Wisienki"
 * Produces 12 authentic, beautifully styled album plates:
 * - Plate 1: Illustrated Album Cover (Treehouse, Wisienka, Guizmo the cat, forest canopy, gold titles)
 * - Plate 2: Dziennik Wisienki (Introductory journal on Séyès lined paper with taped polaroid & sketches)
 * - Plates 3-10: Multi-panel narrative comic story with Polish dialogue bubbles, characters, and watercolor scenery
 * - Plate 11: Zakończenie śledztwa (Detective notebook entry, restored zoo map, and reflections)
 * - Plate 12: Tylna okładka albumu (Back cover with synopsis, series overview, barcode, Egmont imprint)
 */

export interface ComicPlateDef {
  pageNumber: number;
  title: string;
  isComicPage: boolean;
  svgContent: string;
}

function escapeXml(unsafe: string): string {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export function generateWisienkaComicSvg(pageNumber: number, volume: number = 1): ComicPlateDef {
  const w = 840;
  const h = 1200;

  // Plate 1: Album Cover
  if (pageNumber === 1) {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#4a2545" />
      <stop offset="35%" stop-color="#934e62" />
      <stop offset="65%" stop-color="#dd7b5e" />
      <stop offset="100%" stop-color="#f5ce8c" />
    </linearGradient>
    <radialGradient id="sunGlow" cx="50%" cy="40%" r="50%">
      <stop offset="0%" stop-color="#fff8db" stop-opacity="0.9" />
      <stop offset="40%" stop-color="#f8d484" stop-opacity="0.6" />
      <stop offset="100%" stop-color="#f8d484" stop-opacity="0" />
    </radialGradient>
    <linearGradient id="treeGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1b3022" />
      <stop offset="100%" stop-color="#0e1a12" />
    </linearGradient>
    <linearGradient id="goldBanner" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#d4af37" />
      <stop offset="50%" stop-color="#fff2a8" />
      <stop offset="100%" stop-color="#d4af37" />
    </linearGradient>
    <filter id="dropShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="6" stdDeviation="8" flood-color="#000" flood-opacity="0.4" />
    </filter>
  </defs>

  <!-- Cover Background (Twilight Forest Sunset) -->
  <rect x="0" y="0" width="${w}" height="${h}" fill="url(#skyGrad)" />
  <circle cx="420" cy="460" r="300" fill="url(#sunGlow)" />

  <!-- Outer Forest Silhouette & Canopy -->
  <path d="M 0 0 L 840 0 L 840 280 C 720 220 620 250 510 200 C 400 150 280 230 180 180 C 90 140 0 210 0 210 Z" fill="#1b2e20" opacity="0.85" />
  <path d="M 0 1200 L 0 780 C 120 740 240 770 340 720 C 460 660 560 710 680 660 C 760 630 840 680 840 680 L 840 1200 Z" fill="url(#treeGrad)" />

  <!-- Giant Oak Tree & Treehouse (Central Feature) -->
  <path d="M 80 1200 C 130 950 180 820 220 650 C 240 570 260 480 300 400 L 370 410 C 340 500 320 620 310 750 C 300 880 340 1020 370 1200 Z" fill="#142118" />
  
  <!-- Treehouse Platform & Hut -->
  <rect x="250" y="470" width="220" height="15" rx="3" fill="#6d4c33" stroke="#3d2719" stroke-width="2" />
  <path d="M 270 470 L 290 380 L 430 380 L 450 470 Z" fill="#8c5835" stroke="#3d2719" stroke-width="2" />
  <polygon points="260,385 360,320 460,385" fill="#4d6840" stroke="#25381f" stroke-width="2" />
  <rect x="330" y="405" width="40" height="50" rx="3" fill="#f8e096" stroke="#5a3818" stroke-width="2" />
  <!-- Warm Lantern Light in Window -->
  <circle cx="350" cy="430" r="12" fill="#fff5b8" opacity="0.9" />

  <!-- Rope ladder hanging down -->
  <path d="M 290 485 L 290 680 M 310 485 L 310 680" stroke="#b08b59" stroke-width="2" stroke-dasharray="3,8" />
  <line x1="285" y1="510" x2="315" y2="510" stroke="#8a5e32" stroke-width="3" />
  <line x1="285" y1="540" x2="315" y2="540" stroke="#8a5e32" stroke-width="3" />
  <line x1="285" y1="570" x2="315" y2="570" stroke="#8a5e32" stroke-width="3" />
  <line x1="285" y1="600" x2="315" y2="600" stroke="#8a5e32" stroke-width="3" />

  <!-- Wisienka Silhouette sitting on the branch holding her notebook -->
  <circle cx="480" cy="510" r="14" fill="#2d1c16" /> <!-- Head / beret -->
  <path d="M 470 512 Q 460 520 455 540" stroke="#9e3b2b" stroke-width="6" stroke-linecap="round" fill="none" /> <!-- Red scarf -->
  <path d="M 472 524 C 470 550 465 575 460 595 L 485 595 C 488 575 490 550 485 524 Z" fill="#4a5f78" /> <!-- Coat -->
  <rect x="480" y="540" width="22" height="28" rx="2" fill="#e8c87b" transform="rotate(15 480 540)" stroke="#7a5518" stroke-width="1.5" /> <!-- Diary -->

  <!-- Guizmo the Cat sitting beside her -->
  <ellipse cx="430" cy="580" rx="14" ry="10" fill="#d97438" />
  <circle cx="420" cy="574" r="8" fill="#d97438" />
  <polygon points="414,568 418,562 422,568" fill="#a4481b" />
  <polygon points="422,568 426,562 430,568" fill="#a4481b" />
  <path d="M 444 582 Q 455 580 450 565" stroke="#d97438" stroke-width="3.5" fill="none" stroke-linecap="round" /> <!-- Tail -->

  <!-- Mysterious stone elephant sculpture among vines in the clearing -->
  <g transform="translate(540, 780)" opacity="0.95">
    <ellipse cx="120" cy="110" rx="80" ry="60" fill="#5c635b" stroke="#3b423a" stroke-width="3" />
    <circle cx="50" cy="95" r="45" fill="#5c635b" stroke="#3b423a" stroke-width="3" />
    <!-- Trunk -->
    <path d="M 20 110 C 10 140 30 170 50 160 C 45 150 35 135 35 110" fill="#5c635b" stroke="#3b423a" stroke-width="2" />
    <!-- Big ear -->
    <path d="M 50 70 C 85 70 85 125 55 125 Z" fill="#4d544c" />
    <!-- Ivy climbing the sculpture -->
    <path d="M 60 160 Q 90 120 130 110 Q 170 100 190 70" stroke="#3b5e39" stroke-width="3" fill="none" />
    <circle cx="85" cy="130" r="6" fill="#588555" />
    <circle cx="120" cy="112" r="7" fill="#679b64" />
    <circle cx="160" cy="98" r="6" fill="#588555" />
  </g>

  <!-- Top Series Ribbon -->
  <rect x="50" y="45" width="740" height="36" rx="6" fill="#1b241e" opacity="0.9" stroke="url(#goldBanner)" stroke-width="1.5" />
  <text x="420" y="68" font-family="'Cinzel', 'Trajan Pro', 'Georgia', serif" font-size="13" font-weight="bold" fill="url(#goldBanner)" text-anchor="middle" letter-spacing="4">
    KOMIKSOE ARCYDZIEŁO LITERATURY MŁODZIEŻOWEJ • WYDANIE KOLEKCJONERSKIE
  </text>

  <!-- Main Album Title (Grand Comic Plate Lettering) -->
  <g filter="url(#dropShadow)" text-anchor="middle">
    <text x="420" y="165" font-family="'Playfair Display', 'Merriweather', 'Georgia', serif" font-size="52" font-weight="900" fill="#ffffff" letter-spacing="3">
      PAMIĘTNIKI WISIENKI
    </text>
    <text x="420" y="215" font-family="'Brush Script MT', 'Dancing Script', 'Caveat', cursive, sans-serif" font-size="34" font-weight="normal" fill="#ffd899">
      Tom 1: Skamieniałe zoo
    </text>
    <text x="420" y="245" font-family="'Trajan Pro', 'Georgia', serif" font-size="14" font-weight="bold" fill="#ffebd0" letter-spacing="3">
      SCENARIUSZ: JORIS CHAMBLAIN • RYSUNKI: AURÉLIE NEYRET
    </text>
  </g>

  <!-- Gold Laurel Award Badge (Angoulême Youth Award) -->
  <g transform="translate(110, 850)">
    <circle cx="60" cy="60" r="54" fill="#2d1c1a" stroke="url(#goldBanner)" stroke-width="3" filter="url(#dropShadow)" />
    <text x="60" y="45" font-family="sans-serif" font-size="10" font-weight="bold" fill="#f8e096" text-anchor="middle" letter-spacing="1">NAGRODA FAFF</text>
    <text x="60" y="66" font-family="sans-serif" font-size="14" font-weight="900" fill="#ffffff" text-anchor="middle">ANGOULÊME</text>
    <text x="60" y="82" font-family="sans-serif" font-size="9" fill="#f8d484" text-anchor="middle">Fauve Jeunesse</text>
  </g>

  <!-- Bottom Publisher Banner -->
  <rect x="0" y="1130" width="${w}" height="70" fill="#0d1410" />
  <line x1="0" y1="1130" x2="${w}" y2="1130" stroke="url(#goldBanner)" stroke-width="2" />
  <text x="420" y="1172" font-family="sans-serif" font-size="14" font-weight="bold" fill="#ffffff" text-anchor="middle" letter-spacing="3">
    EGMONT POLSKA • WYDANIE ALBUMOWE CBZ (HD)
  </text>
</svg>`;
    return { pageNumber: 1, title: 'Okładka albumu', isComicPage: true, svgContent: svg };
  }

  // Plate 2: Dziennik Wisienki (Introductory Journal Page)
  if (pageNumber === 2) {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <defs>
    <linearGradient id="parchment" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fcf8ec" />
      <stop offset="50%" stop-color="#f6efd9" />
      <stop offset="100%" stop-color="#eee2c3" />
    </linearGradient>
    <filter id="shadow" x="-5%" y="-5%" width="110%" height="110%">
      <feDropShadow dx="2" dy="5" stdDeviation="5" flood-color="#554433" flood-opacity="0.3" />
    </filter>
  </defs>

  <!-- Background: Lined French School Notebook Paper -->
  <rect x="0" y="0" width="${w}" height="${h}" fill="url(#parchment)" />
  
  <!-- Red Margin Line -->
  <line x1="120" y1="0" x2="120" y2="${h}" stroke="#d66868" stroke-width="2" opacity="0.75" />

  <!-- Blue Lined Notebook Rows -->
  ${Array.from({ length: 28 }, (_, i) => `<line x1="120" y1="${180 + i * 34}" x2="780" y2="${180 + i * 34}" stroke="#a8c0d8" stroke-width="1" opacity="0.6" />`).join('\n')}

  <!-- Notebook Header Title -->
  <text x="140" y="100" font-family="'Caveat', 'Dancing Script', 'Brush Script MT', cursive, sans-serif" font-size="42" font-weight="bold" fill="#8b3a2b">
    Mój sekretny pamiętnik • Wisienka
  </text>
  <text x="140" y="140" font-family="'Caveat', cursive, sans-serif" font-size="22" fill="#5a4634">
    Wpis nr 1 — Niedziela, 15 września. Kwatera główna: Domek na wielkim dębie.
  </text>

  <!-- Taped Polaroid Photo of Wisienka & Guizmo -->
  <g transform="translate(520, 170) rotate(4)" filter="url(#shadow)">
    <rect x="0" y="0" width="220" height="260" fill="#ffffff" stroke="#e0d5c0" stroke-width="1" />
    <!-- Photo image area -->
    <rect x="15" y="15" width="190" height="190" fill="#4d6840" />
    <circle cx="110" cy="100" r="50" fill="#dd7b5e" />
    <circle cx="110" cy="85" r="28" fill="#2d1c16" /> <!-- Wisienka head -->
    <path d="M 90 90 Q 75 110 65 145" stroke="#9e3b2b" stroke-width="8" stroke-linecap="round" fill="none" /> <!-- Red scarf -->
    <circle cx="160" cy="140" r="22" fill="#d97438" /> <!-- Cat -->
    <!-- Washi tape at top -->
    <rect x="65" y="-12" width="90" height="24" fill="#dfbb6c" opacity="0.75" transform="rotate(-3 110 0)" />
    <text x="110" y="235" font-family="'Caveat', cursive, sans-serif" font-size="18" fill="#3d3024" text-anchor="middle">
      Ja i Guizmo na warcie!
    </text>
  </g>

  <!-- Handwritten Narrative Text in Polish -->
  <g font-family="'Caveat', 'Dancing Script', 'Segoe Print', cursive, sans-serif" font-size="25" fill="#1c2d42" font-weight="600">
    <text x="140" y="210">Nazywam się Wisienka. Mam jedenaście i pół roku.</text>
    <text x="140" y="244">Gdy dorosnę, chcę pisać najwspanialsze książki na świecie!</text>
    <text x="140" y="278">Moja sąsiadka, pani Desjardins (prawdziwa pisarka!),</text>
    <text x="140" y="312">zdradziła mi najważniejszą tajemnicę tego fachu:</text>
    <text x="140" y="346" fill="#8b3a2b" font-style="italic">„Wisienko, aby pisać, musisz bacznie obserwować ludzi.</text>
    <text x="140" y="380" fill="#8b3a2b" font-style="italic">Każdy człowiek skrywa opowieść, która czeka na odkrycie.”</text>
    <text x="140" y="414">Wzięłam to sobie głęboko do serca!</text>
    
    <text x="140" y="482">Razem z Eriką i Linette założyłyśmy biuro detektywistyczne.</text>
    <text x="140" y="516">Nasz domek na drzewie to idealny punkt obserwacyjny.</text>
    <text x="140" y="550">Widać stąd cały skraj lasu, staw i dróżkę ku starym wzgórzom.</text>
    <text x="140" y="584">I właśnie dziś... wydarzyło się coś niesamowitego!</text>

    <text x="140" y="652" fill="#8b2500" font-weight="bold">O godzinie 14:15 pojawił się PAN Z WIADRAMI FARBY.</text>
    <text x="140" y="686">Starszy, siwy mężczyzna w znoszonym płaszczu.</text>
    <text x="140" y="720">Co niedzielę znika w gęstwinie, niosąc puszki z błękitem i ochrą.</text>
    <text x="140" y="754">Dokąd idzie? Po co malować coś w sercu dzikiego lasu?</text>
    <text x="140" y="788">Podjęłam decyzję: ruszamy jego śladem!</text>
  </g>

  <!-- Botanical and Detective Sketches in Margins -->
  <g transform="translate(150, 850)" stroke="#6d5438" stroke-width="2" fill="none">
    <!-- Binoculars Sketch -->
    <circle cx="50" cy="50" r="22" />
    <circle cx="100" cy="50" r="22" />
    <line x1="72" y1="50" x2="78" y2="50" stroke-width="4" />
    <text x="75" y="95" font-family="'Caveat', cursive" font-size="16" fill="#6d5438" text-anchor="middle">Lornetka 8x40</text>
  </g>

  <g transform="translate(420, 840)" stroke="#3e6039" stroke-width="2" fill="none">
    <!-- Oak leaf sketch -->
    <path d="M 50 100 C 30 80 20 60 40 40 C 60 20 80 30 75 55 C 85 50 95 65 85 80 C 75 95 60 100 50 100 Z" fill="#679b64" opacity="0.3" />
    <line x1="50" y1="100" x2="60" y2="35" />
    <text x="120" y="80" font-family="'Caveat', cursive" font-size="16" fill="#3e6039">Liść dębu szypułkowego</text>
  </g>

  <!-- Page Footer Note -->
  <text x="420" y="1150" font-family="'Caveat', cursive" font-size="20" fill="#78614c" text-anchor="middle">
    Plansza 2 z 12 • Dziennik Wisienki • Następna strona: Rozpoczęcie obserwacji →
  </text>
</svg>`;
    return { pageNumber: 2, title: 'Karta pamiętnika: Moje marzenie', isComicPage: true, svgContent: svg };
  }

  // Plates 3-10: Comic narrative pages with panel layouts, Polish speech balloons, art
  const comicPagesData: Record<number, {
    title: string;
    panels: Array<{
      x: number; y: number; w: number; h: number;
      bg: string;
      caption?: string;
      speech?: { speaker: string; text: string; x: number; y: number; bx: number; by: number };
      sceneType: 'treehouse' | 'forest_path' | 'friends' | 'statues' | 'michel_painting' | 'discovery';
    }>;
  }> = {
    3: {
      title: 'Plansza 3: Obserwacja z domku na drzewie',
      panels: [
        {
          x: 40, y: 50, w: 760, h: 480,
          bg: '#e8af7a',
          caption: 'Niedzielne popołudnie. Domek na drzewie staje się centrum dowodzenia.',
          speech: {
            speaker: 'Wisienka',
            text: 'Guizmo, spójrz przez lunetę! Widzisz go? Przy drodze do starego kamieniołomu!',
            x: 220, y: 160, bx: 200, by: 120,
          },
          sceneType: 'treehouse',
        },
        {
          x: 40, y: 560, w: 760, h: 540,
          bg: '#3d523e',
          caption: 'Tajemniczy nieznajomy wkracza w głąb rezerwatu.',
          speech: {
            speaker: 'Wisienka',
            text: 'Niesie dwa wielkie wiadra błękitnej farby... Przecież w lesie nie ma żadnych budynków!',
            x: 260, y: 680, bx: 240, by: 640,
          },
          sceneType: 'forest_path',
        },
      ],
    },
    4: {
      title: 'Plansza 4: Zbiórka Klubu Detektywów',
      panels: [
        {
          x: 40, y: 50, w: 365, h: 510,
          bg: '#f0dfbe',
          speech: {
            speaker: 'Wisienka',
            text: 'Erika! Linette! Szybko, zbiórka pod kasztanem! Mamy pierwszą wielką tajemnicę!',
            x: 100, y: 160, bx: 80, by: 120,
          },
          sceneType: 'friends',
        },
        {
          x: 435, y: 50, w: 365, h: 510,
          bg: '#d6e4df',
          speech: {
            speaker: 'Linette',
            text: 'Mam nadzieję, że to nie znów kot sąsiadki, który utknął na płocie...',
            x: 500, y: 160, bx: 480, by: 120,
          },
          sceneType: 'friends',
        },
        {
          x: 40, y: 590, w: 760, h: 510,
          bg: '#415e45',
          caption: 'Trzy przyjaciółki ruszają leśną ścieżką tropem kropel niebieskiej farby.',
          speech: {
            speaker: 'Erika',
            text: 'Spójrzcie na ziemię! Świeże ślady farby prowadzą w stronę zapomnianego wąwozu!',
            x: 280, y: 700, bx: 260, by: 660,
          },
          sceneType: 'forest_path',
        },
      ],
    },
    5: {
      title: 'Plansza 5: Skamieniałe Zoo w leśnej głuszy',
      panels: [
        {
          x: 40, y: 50, w: 760, h: 620,
          bg: '#47634f',
          caption: 'Przed dziewczętami otwiera się zarośnięta polana pełna niezwykłych kształtów...',
          speech: {
            speaker: 'Wisienka',
            text: 'Niewiarygodne... Dziewczyny, zobaczcie! To słoń! Prawdziwy, olbrzymi słoń z kamienia!',
            x: 240, y: 180, bx: 220, by: 140,
          },
          sceneType: 'statues',
        },
        {
          x: 40, y: 700, w: 760, h: 400,
          bg: '#2e4235',
          speech: {
            speaker: 'Linette',
            text: 'I żyrafa, i lew, i stado papug... Całe zoo ukryte pośród paproci i bluszczu!',
            x: 280, y: 800, bx: 260, by: 760,
          },
          sceneType: 'discovery',
        },
      ],
    },
    6: {
      title: 'Plansza 6: Kim jest pan Michel?',
      panels: [
        {
          x: 40, y: 50, w: 760, h: 520,
          bg: '#543d31',
          caption: 'W cieniu starych wiązów dostrzegają starszego pana z pędzlem w dłoni.',
          speech: {
            speaker: 'Pan Michel',
            text: 'Jeszcze odrobina błękitu na twoje skrzydła, mała arko... Nie pozwolę, by czas cię zniszczył.',
            x: 320, y: 180, bx: 300, by: 140,
          },
          sceneType: 'michel_painting',
        },
        {
          x: 40, y: 600, w: 760, h: 500,
          bg: '#d99862',
          speech: {
            speaker: 'Wisienka',
            text: 'Dzień dobry, panie Michelu! Nie chcemy przeszkadzać... Przyszłyśmy panu pomóc!',
            x: 240, y: 720, bx: 220, by: 680,
          },
          sceneType: 'discovery',
        },
      ],
    },
    7: {
      title: 'Plansza 7: Opowieść o dawnym ogrodzie',
      panels: [
        {
          x: 40, y: 50, w: 760, h: 520,
          bg: '#e6c283',
          caption: 'Pan Michel ociera łzę wzruszenia i zaczyna swoją niezwykłą opowieść.',
          speech: {
            speaker: 'Pan Michel',
            text: 'Pięćdziesiąt lat temu byłem tu opiekunem zwierząt. Kiedy zoo zamknięto, rzeźbiarz stworzył ich kamienne podobizny...',
            x: 260, y: 180, bx: 240, by: 140,
          },
          sceneType: 'michel_painting',
        },
        {
          x: 40, y: 600, w: 760, h: 500,
          bg: '#5b7d63',
          speech: {
            speaker: 'Erika',
            text: 'A pan przychodzi tu w każdą niedzielę, żeby je odnawiać i malować, prawda?',
            x: 280, y: 720, bx: 260, by: 680,
          },
          sceneType: 'statues',
        },
      ],
    },
    8: {
      title: 'Plansza 8: Wspólne odnawianie kamiennych zwierząt',
      panels: [
        {
          x: 40, y: 50, w: 760, h: 1050,
          bg: '#9ac4a6',
          caption: 'Przez całe popołudnie polana tętni śmiechem, stukotem pędzli i feerią barw.',
          speech: {
            speaker: 'Wisienka',
            text: 'Panie Michelu, to najwspanialsza historia w moim życiu! Wszystko dokładnie opiszę w pamiętniku!',
            x: 260, y: 220, bx: 240, by: 170,
          },
          sceneType: 'statues',
        },
      ],
    },
    9: {
      title: 'Plansza 9: Ogród budzi się do życia',
      panels: [
        {
          x: 40, y: 50, w: 760, h: 520,
          bg: '#e28859',
          caption: 'Zachód słońca oblewa złocistym blaskiem odnowione rzeźby.',
          speech: {
            speaker: 'Linette',
            text: 'Spójrzcie na lwa i papugi! Wyglądają tak, jakby za chwilę miały naprawdę ożyć!',
            x: 280, y: 180, bx: 260, by: 140,
          },
          sceneType: 'statues',
        },
        {
          x: 40, y: 600, w: 760, h: 500,
          bg: '#2a3b4c',
          speech: {
            speaker: 'Pan Michel',
            text: 'Dziękuję wam, dziewczynki. Dzięki wam ten las znów jest pełen radości i pamięci.',
            x: 320, y: 720, bx: 300, by: 680,
          },
          sceneType: 'michel_painting',
        },
      ],
    },
    10: {
      title: 'Plansza 10: Powrót do domku o zmierzchu',
      panels: [
        {
          x: 40, y: 50, w: 760, h: 1050,
          bg: '#253447',
          caption: 'Wisienka wraca na swój dąb pod rozgwieżdżonym niebem, by spisać zakończenie.',
          speech: {
            speaker: 'Wisienka',
            text: 'Wreszcie zrozumiałam słowa pani Desjardins. Czasem największą tajemnicą nie jest sekret, lecz miłość, która trwa pomimo upływu lat.',
            x: 240, y: 220, bx: 220, by: 170,
          },
          sceneType: 'treehouse',
        },
      ],
    },
  };

  if (comicPagesData[pageNumber]) {
    const pageData = comicPagesData[pageNumber];
    const panelsSvg = pageData.panels.map((p, idx) => {
      let illustration = '';
      if (p.sceneType === 'treehouse') {
        illustration = `
          <!-- Treehouse Scene Silhouette -->
          <circle cx="${p.x + p.w * 0.7}" cy="${p.y + p.h * 0.4}" r="${Math.min(p.w, p.h) * 0.25}" fill="#fbe6ab" opacity="0.6" />
          <path d="M ${p.x} ${p.y + p.h} L ${p.x + p.w * 0.3} ${p.y + p.h * 0.3} L ${p.x + p.w * 0.5} ${p.y + p.h * 0.35} L ${p.x + p.w * 0.45} ${p.y + p.h} Z" fill="#1b291d" />
          <rect x="${p.x + p.w * 0.35}" y="${p.y + p.h * 0.3}" width="${p.w * 0.25}" height="${p.h * 0.2}" rx="4" fill="#6d4726" stroke="#2b1a0e" stroke-width="2" />
          <polygon points="${p.x + p.w * 0.33},${p.y + p.h * 0.3} ${p.x + p.w * 0.475},${p.y + p.h * 0.2} ${p.x + p.w * 0.62},${p.y + p.h * 0.3}" fill="#385233" />
          <!-- Wisienka silhouette -->
          <circle cx="${p.x + p.w * 0.5}" cy="${p.y + p.h * 0.45}" r="12" fill="#d9534f" />
          <rect x="${p.x + p.w * 0.48}" y="${p.y + p.h * 0.47}" width="16" height="25" rx="3" fill="#337ab7" />
        `;
      } else if (p.sceneType === 'statues') {
        illustration = `
          <!-- Stone animals in the clearing -->
          <ellipse cx="${p.x + p.w * 0.6}" cy="${p.y + p.h * 0.7}" rx="${p.w * 0.22}" ry="${p.h * 0.18}" fill="#6b7280" stroke="#374151" stroke-width="3" />
          <circle cx="${p.x + p.w * 0.45}" cy="${p.y + p.h * 0.65}" r="${p.w * 0.12}" fill="#6b7280" stroke="#374151" stroke-width="3" />
          <!-- Elephant trunk -->
          <path d="M ${p.x + p.w * 0.37} ${p.y + p.h * 0.7} Q ${p.x + p.w * 0.33} ${p.y + p.h * 0.85} ${p.x + p.w * 0.4} ${p.y + p.h * 0.85}" fill="none" stroke="#6b7280" stroke-width="12" stroke-linecap="round" />
          <!-- Colorful freshly painted patterns on statue -->
          <path d="M ${p.x + p.w * 0.55} ${p.y + p.h * 0.6} Q ${p.x + p.w * 0.65} ${p.y + p.h * 0.68} ${p.x + p.w * 0.75} ${p.y + p.h * 0.62}" stroke="#3b82f6" stroke-width="8" fill="none" />
          <circle cx="${p.x + p.w * 0.7}" cy="${p.y + p.h * 0.65}" r="8" fill="#ef4444" />
          <!-- Ferns and vines -->
          <path d="M ${p.x} ${p.y + p.h} Q ${p.x + p.w * 0.2} ${p.y + p.h * 0.85} ${p.x + p.w * 0.35} ${p.y + p.h} Z" fill="#15803d" opacity="0.8" />
        `;
      } else if (p.sceneType === 'michel_painting') {
        illustration = `
          <!-- Michel Painting Scene -->
          <circle cx="${p.x + p.w * 0.7}" cy="${p.y + p.h * 0.5}" r="${p.w * 0.14}" fill="#78716c" /> <!-- Lion statue head -->
          <!-- Michel silhouette with brush -->
          <circle cx="${p.x + p.w * 0.4}" cy="${p.y + p.h * 0.52}" r="14" fill="#e7e5e4" /> <!-- White hair -->
          <path d="M ${p.x + p.w * 0.37} ${p.y + p.h * 0.55} L ${p.x + p.w * 0.45} ${p.y + p.h * 0.75} L ${p.x + p.w * 0.33} ${p.y + p.h * 0.75} Z" fill="#57534e" />
          <!-- Arm holding brush -->
          <line x1="${p.x + p.w * 0.43}" y1="${p.y + p.h * 0.6}" x2="${p.x + p.w * 0.58}" y2="${p.y + p.h * 0.52}" stroke="#44403c" stroke-width="4" stroke-linecap="round" />
          <!-- Paint bucket -->
          <rect x="${p.x + p.w * 0.3}" y="${p.y + p.h * 0.72}" width="22" height="24" rx="2" fill="#0284c7" stroke="#0369a1" stroke-width="2" />
        `;
      } else {
        illustration = `
          <!-- Forest / Discovery landscape -->
          <path d="M ${p.x} ${p.y + p.h} C ${p.x + p.w * 0.3} ${p.y + p.h * 0.75} ${p.x + p.w * 0.7} ${p.y + p.h * 0.8} ${p.x + p.w} ${p.y + p.h} Z" fill="#14532d" />
          <line x1="${p.x + p.w * 0.2}" y1="${p.y + p.h}" x2="${p.x + p.w * 0.2}" y2="${p.y + p.h * 0.3}" stroke="#1e293b" stroke-width="12" />
          <line x1="${p.x + p.w * 0.8}" y1="${p.y + p.h}" x2="${p.x + p.w * 0.8}" y2="${p.y + p.h * 0.25}" stroke="#1e293b" stroke-width="15" />
        `;
      }

      // Speech bubble SVG
      let speechSvg = '';
      if (p.speech) {
        const textEscaped = escapeXml(p.speech.text);
        const speakerEscaped = escapeXml(p.speech.speaker);
        const bw = Math.min(p.w - 40, 360);
        const bh = 95;
        speechSvg = `
          <!-- Speech Balloon -->
          <g transform="translate(${p.speech.bx}, ${p.speech.by})">
            <!-- Balloon Tail -->
            <polygon points="${bw * 0.3},${bh - 2} ${bw * 0.38},${bh + 22} ${bw * 0.45},${bh - 2}" fill="#ffffff" stroke="#1f2937" stroke-width="2.5" />
            <!-- Balloon Box -->
            <rect x="0" y="0" width="${bw}" height="${bh}" rx="18" fill="#ffffff" stroke="#1f2937" stroke-width="2.5" filter="drop-shadow(0 4px 6px rgba(0,0,0,0.15))" />
            <text x="16" y="22" font-family="'Trajan Pro', sans-serif" font-size="11" font-weight="bold" fill="#b91c1c" letter-spacing="1">
              ${speakerEscaped}:
            </text>
            <foreignObject x="14" y="26" width="${bw - 28}" height="${bh - 32}">
              <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: 'Comic Sans MS', 'Balsamiq Sans', 'Caveat', cursive, sans-serif; font-size: 13px; font-weight: 600; line-height: 1.35; color: #111827; margin: 0; padding: 0;">
                "${textEscaped}"
              </div>
            </foreignObject>
          </g>
        `;
      }

      // Narrative Caption Box
      let captionSvg = '';
      if (p.caption) {
        captionSvg = `
          <!-- Narrative Caption -->
          <rect x="${p.x + 12}" y="${p.y + 12}" width="${p.w - 24}" height="32" rx="4" fill="#fef3c7" stroke="#d97706" stroke-width="1.5" opacity="0.95" />
          <text x="${p.x + 22}" y="${p.y + 33}" font-family="'Georgia', serif" font-size="12" font-style="italic" font-weight="bold" fill="#78350f">
            ${escapeXml(p.caption)}
          </text>
        `;
      }

      return `
        <!-- Panel ${idx + 1} -->
        <g>
          <rect x="${p.x}" y="${p.y}" width="${p.w}" height="${p.h}" fill="${p.bg}" stroke="#18181b" stroke-width="3.5" rx="6" />
          ${illustration}
          ${captionSvg}
          ${speechSvg}
        </g>
      `;
    }).join('\n');

    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <!-- Gutter Margin (Classic French Album Paper) -->
  <rect x="0" y="0" width="${w}" height="${h}" fill="#fcfaf2" />
  
  <!-- Comic Header Strip -->
  <text x="40" y="32" font-family="'Trajan Pro', 'Georgia', serif" font-size="12" font-weight="bold" fill="#854d0e" letter-spacing="2">
    PAMIĘTNIKI WISIENKI • TOM 1: SKAMIENIAŁE ZOO
  </text>
  <text x="${w - 40}" y="32" font-family="'Trajan Pro', sans-serif" font-size="12" font-weight="bold" fill="#71717a" text-anchor="end">
    PLANSZA ${pageNumber - 1} / 10
  </text>
  <line x1="40" y1="40" x2="${w - 40}" y2="40" stroke="#e4e4e7" stroke-width="1.5" />

  <!-- Sequential Panels -->
  ${panelsSvg}

  <!-- Footer Navigation / Number -->
  <text x="420" y="${h - 18}" font-family="sans-serif" font-size="11" fill="#a1a1aa" text-anchor="middle">
    ${pageNumber}
  </text>
</svg>`;
    return { pageNumber, title: pageData.title, isComicPage: true, svgContent: svg };
  }

  // Plate 11: Podsumowanie w pamiętniku (Closing Journal Page)
  if (pageNumber === 11) {
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <!-- Vintage Parchment Journal -->
  <rect x="0" y="0" width="${w}" height="${h}" fill="#f7f2e4" />
  <line x1="100" y1="0" x2="100" y2="${h}" stroke="#d66868" stroke-width="2" opacity="0.7" />

  <text x="130" y="90" font-family="'Caveat', cursive, sans-serif" font-size="38" font-weight="bold" fill="#8b3a2b">
    Epilog: Tajemnica rozwiązana!
  </text>
  <text x="130" y="130" font-family="'Caveat', cursive" font-size="20" fill="#6d5438">
    Wpis nr 2 — Sobota, 28 września.
  </text>

  <!-- Lined Paper -->
  ${Array.from({ length: 24 }, (_, i) => `<line x1="100" y1="${160 + i * 36}" x2="760" y2="${160 + i * 36}" stroke="#b0c8dc" stroke-width="1" opacity="0.6" />`).join('\n')}

  <!-- Text -->
  <g font-family="'Caveat', cursive, sans-serif" font-size="24" fill="#1e293b" font-weight="600">
    <text x="120" y="195">Śledztwo dobiegło końca, ale ta historia na zawsze zostanie ze mną.</text>
    <text x="120" y="231">Przez dwa tygodnie razem z Linette i Eriką przychodziłyśmy do zoo.</text>
    <text x="120" y="267">Pan Michel nauczył nas, jak mieszać barwy, by lew lśnił w słońcu,</text>
    <text x="120" y="303">a słoń wyglądał tak dumnie, jak za dawnych, wspaniałych lat.</text>
    
    <text x="120" y="375" fill="#8b3a2b">Mama powiedziała mi dziś wieczorem coś pięknego:</text>
    <text x="120" y="411" font-style="italic">„Wisienko, jesteś prawdziwą pisarką nie dlatego, że piszesz słowa,</text>
    <text x="120" y="447" font-style="italic">ale dlatego, że potrafisz dostrzec serce tam, gdzie inni widzą tylko kamień.”</text>
    
    <text x="120" y="519">Pan Michel nie jest już sam. Całe miasteczko dowiedziało się o zoo.</text>
    <text x="120" y="555">W następną niedzielę urządzamy wielki piknik dla wszystkich mieszkańców!</text>
    <text x="120" y="591">A ja... już rozglądam się przez lornetkę za nową tajemnicą.</text>
    <text x="120" y="627" fill="#8b2500" font-weight="bold">Do zobaczenia w Tomie 2: Księga Hektora!</text>
  </g>

  <!-- Map Sketch of the Zoo in the bottom corner -->
  <g transform="translate(130, 720)" filter="drop-shadow(0 4px 6px rgba(0,0,0,0.1))">
    <rect x="0" y="0" width="600" height="380" rx="10" fill="#ffffff" stroke="#c4b59d" stroke-width="2" />
    <text x="300" y="40" font-family="'Trajan Pro', serif" font-size="16" font-weight="bold" fill="#78350f" text-anchor="middle">
      MAPA SKAMIENIAŁEGO ZOO • SPORZĄDZIŁA WISIENKA
    </text>
    <!-- Map pathways & markers -->
    <path d="M 50 320 Q 150 200 250 240 T 450 180 T 550 80" stroke="#d97706" stroke-width="4" stroke-dasharray="6,6" fill="none" />
    <!-- Markers -->
    <circle cx="150" cy="200" r="16" fill="#3b82f6" opacity="0.8" />
    <text x="150" y="235" font-family="'Caveat', cursive" font-size="16" text-anchor="middle">Słoń Babar</text>
    
    <circle cx="320" cy="220" r="16" fill="#ef4444" opacity="0.8" />
    <text x="320" y="255" font-family="'Caveat', cursive" font-size="16" text-anchor="middle">Lew Sułtan</text>

    <circle cx="480" cy="140" r="16" fill="#10b981" opacity="0.8" />
    <text x="480" y="175" font-family="'Caveat', cursive" font-size="16" text-anchor="middle">Aleja Papug</text>

    <circle cx="50" cy="320" r="14" fill="#8b5cf6" />
    <text x="60" y="350" font-family="'Caveat', cursive" font-size="16">Stara brama</text>
  </g>
</svg>`;
    return { pageNumber: 11, title: 'Epilog: Podsumowanie w pamiętniku', isComicPage: true, svgContent: svg };
  }

  // Plate 12: Back Cover (Tylna Okładka)
  const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <!-- Deep Emerald / Forest Night Gradient -->
  <defs>
    <linearGradient id="backGrad" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#14261a" />
      <stop offset="60%" stop-color="#1a3323" />
      <stop offset="100%" stop-color="#0b1710" />
    </linearGradient>
  </defs>
  <rect x="0" y="0" width="${w}" height="${h}" fill="url(#backGrad)" />

  <!-- Frame Border -->
  <rect x="35" y="35" width="${w - 70}" height="${h - 70}" fill="none" stroke="#d4af37" stroke-width="2" rx="10" />

  <!-- Series Header -->
  <text x="420" y="120" font-family="'Playfair Display', serif" font-size="36" font-weight="bold" fill="#ffffff" text-anchor="middle" letter-spacing="2">
    PAMIĘTNIKI WISIENKI
  </text>
  <text x="420" y="160" font-family="'Caveat', cursive" font-size="26" fill="#ffd899" text-anchor="middle">
    Seria nagrodzona na Międzynarodowym Festiwalu Komiksu w Angoulême
  </text>

  <!-- Synopsis Parchment Box -->
  <g transform="translate(90, 220)">
    <rect x="0" y="0" width="660" height="420" rx="12" fill="#faf5e8" filter="drop-shadow(0 8px 16px rgba(0,0,0,0.4))" />
    <text x="330" y="55" font-family="'Trajan Pro', serif" font-size="18" font-weight="bold" fill="#78350f" text-anchor="middle" letter-spacing="2">
      SKAMIENIAŁE ZOO • TOM 1
    </text>
    <foreignObject x="40" y="80" width="580" height="300">
      <div xmlns="http://www.w3.org/1999/xhtml" style="font-family: 'Georgia', serif; font-size: 17px; line-height: 1.7; color: #27272a; text-align: justify;">
        <p style="margin-bottom: 14px;">
          Wisienka ma jedenaście lat i jedno wielkie marzenie: pragnie pisać książki. Jej ulubionym zajęciem jest obserwowanie ludzi i próba odgadnięcia ich skrywanych tajemnic. Wraz z przyjaciółkami spędza całe dnie w domku na wielkim drzewie.
        </p>
        <p style="margin-bottom: 14px;">
          Pewnego dnia jej uwagę przykuwa tajemniczy starszy pan, który w każdą niedzielę wchodzi w głąb lasu z wiadrami pełnymi farby. Kim jest i dokąd zmierza? Trop prowadzi dziewczynki do niezwykłego, zapomnianego ogrodu zoologicznego, w którym wszystkie zwierzęta zamieniły się w kamień...
        </p>
        <p style="font-style: italic; color: #854d0e; text-align: center; margin-top: 20px;">
          „Wzruszająca, ciepła opowieść o potędze dziecięcej wrażliwości, pamięci i sile miłości.”
        </p>
      </div>
    </foreignObject>
  </g>

  <!-- Volumes in the series list -->
  <g transform="translate(110, 690)">
    <text x="0" y="0" font-family="'Trajan Pro', serif" font-size="14" font-weight="bold" fill="#d4af37" letter-spacing="2">
      W SERII UKAZAŁY SIĘ:
    </text>
    <text x="0" y="32" font-family="sans-serif" font-size="14" fill="#ffffff">• Tom 1: Skamieniałe zoo</text>
    <text x="0" y="62" font-family="sans-serif" font-size="14" fill="#a1a1aa">• Tom 2: Księga Hektora</text>
    <text x="0" y="92" font-family="sans-serif" font-size="14" fill="#a1a1aa">• Tom 3: Ostatni z pięciu skarbów</text>
    <text x="320" y="32" font-family="sans-serif" font-size="14" fill="#a1a1aa">• Tom 4: Bogini bez twarzy</text>
    <text x="320" y="62" font-family="sans-serif" font-size="14" fill="#a1a1aa">• Tom 5: Od pierwszych śniegów do Perseidów</text>
    <text x="320" y="92" font-family="sans-serif" font-size="14" fill="#a1a1aa">• Tom 6: Wisienka i Walentyn</text>
  </g>

  <!-- Barcode & Publisher imprint -->
  <g transform="translate(110, 870)">
    <!-- Fake realistic barcode box -->
    <rect x="0" y="0" width="220" height="110" fill="#ffffff" rx="4" />
    <text x="110" y="25" font-family="monospace" font-size="11" fill="#000000" text-anchor="middle">ISBN 978-83-281-1823-2</text>
    <!-- Barcode lines -->
    <g transform="translate(20, 35)">
      ${Array.from({ length: 36 }, (_, i) => `<line x1="${i * 5}" y1="0" x2="${i * 5}" y2="50" stroke="#000" stroke-width="${(i % 3 === 0 || i % 7 === 0) ? 3 : 1.5}" />`).join('\n')}
    </g>
    <text x="110" y="100" font-family="monospace" font-size="10" fill="#000" text-anchor="middle">9 788328 118232</text>
  </g>

  <g transform="translate(480, 890)">
    <text x="0" y="20" font-family="'Playfair Display', serif" font-size="22" font-weight="bold" fill="#ffffff">EGMONT</text>
    <text x="0" y="45" font-family="sans-serif" font-size="12" fill="#a1a1aa">Klub Świata Komiksu</text>
    <text x="0" y="68" font-family="sans-serif" font-size="11" fill="#d4af37">Cena: 39,99 zł (w tym 5% VAT)</text>
    <text x="0" y="90" font-family="sans-serif" font-size="11" fill="#a1a1aa">Format: CBZ / E-Ink Optimized</text>
  </g>

  <text x="420" y="1120" font-family="sans-serif" font-size="12" fill="#71717a" text-anchor="middle">
    Wszelkie prawa zastrzeżone © Soleil / Chamblain & Neyret • Egmont Polska
  </text>
</svg>`;
  return { pageNumber: 12, title: 'Tylna okładka', isComicPage: true, svgContent: svg };
}

export function getAllWisienkaComicPlates(volume: number = 1): ComicPlateDef[] {
  return Array.from({ length: 12 }, (_, i) => generateWisienkaComicSvg(i + 1, volume));
}

