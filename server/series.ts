export interface BookSeriesInfo {
  name: string;
  tome: number;
  total?: number;
}

export interface KnownSeriesDef {
  name: string;
  total: number;
  tomes: { number: number; title: string }[];
}

export const KNOWN_SERIES: KnownSeriesDef[] = [
  {
    name: 'Saga o Wiedźminie',
    total: 8,
    tomes: [
      { number: 1, title: 'Ostatnie życzenie' },
      { number: 2, title: 'Miecz przeznaczenia' },
      { number: 3, title: 'Krew elfów' },
      { number: 4, title: 'Czas pogardy' },
      { number: 5, title: 'Chrzest ognia' },
      { number: 6, title: 'Wieża Jaskółki' },
      { number: 7, title: 'Pani Jeziora' },
      { number: 8, title: 'Sezon burz' },
    ],
  },
  {
    name: 'Kroniki Diuny',
    total: 6,
    tomes: [
      { number: 1, title: 'Diuna' },
      { number: 2, title: 'Mesjasz Diuny' },
      { number: 3, title: 'Dzieci Diuny' },
      { number: 4, title: 'Bóg Imperator Diuny' },
      { number: 5, title: 'Heretycy Diuny' },
      { number: 6, title: 'Kapituła Diuną' },
    ],
  },
  {
    name: 'Władca Pierścieni',
    total: 3,
    tomes: [
      { number: 1, title: 'Drużyna Pierścienia' },
      { number: 2, title: 'Dwie wieże' },
      { number: 3, title: 'Powrót króla' },
    ],
  },
  {
    name: 'Pieśń Lodu i Ognia',
    total: 5,
    tomes: [
      { number: 1, title: 'Gra o tron' },
      { number: 2, title: 'Starcie królów' },
      { number: 3, title: 'Nawałnica mieczy' },
      { number: 4, title: 'Uczta dla wron' },
      { number: 5, title: 'Taniec ze smokami' },
    ],
  },
  {
    name: 'Harry Potter',
    total: 7,
    tomes: [
      { number: 1, title: 'Kamień Filozoficzny' },
      { number: 2, title: 'Komnata Tajemnic' },
      { number: 3, title: 'Więzień Azkabanu' },
      { number: 4, title: 'Czara Ognia' },
      { number: 5, title: 'Zakon Feniksa' },
      { number: 6, title: 'Książę Półkrwi' },
      { number: 7, title: 'Insygnia Śmierci' },
    ],
  },
  {
    name: 'Metro',
    total: 3,
    tomes: [
      { number: 1, title: 'Metro 2033' },
      { number: 2, title: 'Metro 2034' },
      { number: 3, title: 'Metro 2035' },
    ],
  },
];

export function detectBookSeries(title: string, description?: string): BookSeriesInfo | null {
  if (!title) return null;
  const cleanTitle = title.trim();

  // 1. Check known sagas by tome title or name
  for (const s of KNOWN_SERIES) {
    // Check if title mentions series name
    const sRegex = new RegExp(s.name.replace(/\s+/g, '\\s*'), 'i');
    if (sRegex.test(cleanTitle)) {
      // Look for number
      const numMatch = cleanTitle.match(/(?:tom|część|księga|#|t\.)\s*(\d+)/i);
      if (numMatch) {
        return {
          name: s.name,
          tome: parseInt(numMatch[1], 10),
          total: s.total,
        };
      }
    }

    // Check specific tome titles
    for (const t of s.tomes) {
      const tRegex = new RegExp(`\\b${t.title.replace(/\s+/g, '\\s*')}\\b`, 'i');
      if (tRegex.test(cleanTitle)) {
        return {
          name: s.name,
          tome: t.number,
          total: s.total,
        };
      }
    }
  }

  // 2. Generic regexes
  // Example: "Cykl Inkwizytorski - Tom 2" or "Koło Czasu, Tom 4 z 14"
  const m1 = cleanTitle.match(/^(.+?)\s*[,–-]\s*(?:tom|część|księga|vol\.?|volume|bk\.?)\s*(\d+)(?:\s*(?:z|\/)\s*(\d+))?/i);
  if (m1) {
    return {
      name: m1[1].trim(),
      tome: parseInt(m1[2], 10),
      total: m1[3] ? parseInt(m1[3], 10) : undefined,
    };
  }

  // Example: "Fundacja #3"
  const m2 = cleanTitle.match(/^([A-Za-z0-9ĄĆĘŁŃÓŚŹŻąćęłńóśźż\s]+?)\s*#(\d+)/i);
  if (m2 && m2[1].trim().length > 2) {
    return {
      name: m2[1].trim(),
      tome: parseInt(m2[2], 10),
    };
  }

  // Example: "Opowieści z Narni tom 1"
  const m3 = cleanTitle.match(/^([A-Za-z0-9ĄĆĘŁŃÓŚŹŻąćęłńóśźż\s]+?)\s+(?:tom|część|księga)\s+(\d+)/i);
  if (m3 && m3[1].trim().length > 2) {
    return {
      name: m3[1].trim(),
      tome: parseInt(m3[2], 10),
    };
  }

  return null;
}
