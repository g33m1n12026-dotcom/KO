import { GoogleGenAI } from '@google/genai';
import { EdgeTTS } from 'node-edge-tts';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { loadSettings, saveSettings } from './settings';

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';

// Disk cache for generated speech chunks to ensure instant re-play, save API quota and allow offline listening
const CACHE_DIR = path.join(process.cwd(), 'data', 'tts_cache');
if (!fs.existsSync(CACHE_DIR)) {
  fs.mkdirSync(CACHE_DIR, { recursive: true });
}

let geminiClient: GoogleGenAI | null = null;
function getGemini(): GoogleGenAI {
  if (!geminiClient) {
    geminiClient = new GoogleGenAI({ apiKey: GEMINI_KEY });
  }
  return geminiClient;
}

export interface TtsRequest {
  text: string;
  voice?: string;
  provider?: 'neural' | 'elevenlabs' | 'gemini' | 'system';
  elevenLabsApiKey?: string;
  elevenLabsVoiceId?: string;
  speed?: number;
}

export interface VoiceOption {
  id: string;
  name: string;
  gender: 'female' | 'male';
  provider: 'neural' | 'elevenlabs' | 'gemini' | 'system';
  description: string;
  isDefault?: boolean;
  category?: string;
}

export const AVAILABLE_VOICES: VoiceOption[] = [
  // 1. Unlimited Neural AI voices (Polish & English) - 100% Free, NO rate limits, crystal clear quality
  {
    id: 'pl-PL-MarekNeural',
    name: 'Marek (Radiowy męski bas)',
    gender: 'male',
    provider: 'neural',
    description: 'Niezrównany polski lektor książkowy, głęboki i wyrazisty głos — bez limitów',
    isDefault: true,
  },
  {
    id: 'pl-PL-ZofiaNeural',
    name: 'Zofia (Ciepła narratorka)',
    gender: 'female',
    provider: 'neural',
    description: 'Kojąca polska narratorka do powieści i opowiadań — bez limitów',
  },
  // 2. ElevenLabs Multilingual V2 Voices (Pełna paleta profesjonalnych głosów lektorskich)
  {
    id: 'ErXwobaYiN019PkySvjV',
    name: 'Antoni (Polski Lektor)',
    gender: 'male',
    provider: 'elevenlabs',
    description: 'Płynny, ciepły polski głos męski ElevenLabs Multilingual V2 — idealny do powieści',
  },
  {
    id: '21m00Tcm4TlvDq8ikWAM',
    name: 'Rachel (Audiobook)',
    gender: 'female',
    provider: 'elevenlabs',
    description: 'Kultowy, ultra-realistyczny kobiecy głos narracyjny ElevenLabs — łagodny i ciepły',
  },
  {
    id: 'EXAVITQu4vr4xnSDxMaL',
    name: 'Bella (Ekspresyjna)',
    gender: 'female',
    provider: 'elevenlabs',
    description: 'Ekspresyjny, emocjonalny głos lektorski — wciągające dialogi i proza',
  },
  {
    id: 'pNInz6obpgDQGcFmaJgB',
    name: 'Adam (Narrator)',
    gender: 'male',
    provider: 'elevenlabs',
    description: 'Dojrzały, głęboki głos narracyjny — fantasy, thrillery i kryminały',
  },
  {
    id: 'JBFqnCBsd6RMkjVDRZzb',
    name: 'George (Klasyczny)',
    gender: 'male',
    provider: 'elevenlabs',
    description: 'Ciepły, dostojny głos lektorski do literatury pięknej i klasyki',
  },
  {
    id: 'IKne3meq5aSn9XLyUdCD',
    name: 'Charlie (Swobodny)',
    gender: 'male',
    provider: 'elevenlabs',
    description: 'Naturalny, swobodny głos męski — świetny w dynamicznych dialogach',
  },
  {
    id: 'N2lVS1w4EtoT3pu4Rqva',
    name: 'Callum (Intensywny)',
    gender: 'male',
    provider: 'elevenlabs',
    description: 'Intensywny, filmowy głos męski — fantastyka, sci-fi i akcja',
  },
  {
    id: 'XB0fDUnXU5ikipDDTrS1',
    name: 'Charlotte (Aksamitna)',
    gender: 'female',
    provider: 'elevenlabs',
    description: 'Elegancka, aksamitna narratorka literatury pięknej i poezji',
  },
  {
    id: 'Xb7hH8MSUJpSbSDYk0k2',
    name: 'Alice (Krystaliczna)',
    gender: 'female',
    provider: 'elevenlabs',
    description: 'Krystaliczna, pewna siebie narratorka — literatura faktu i powieści',
  },
  {
    id: 'XrExE9yKIg1WjnnlVkGX',
    name: 'Matilda (Audiobook Pro)',
    gender: 'female',
    provider: 'elevenlabs',
    description: 'Ciepła lektorka audiobookowa z doskonałą modulacją i dykcją',
  },
  {
    id: 'bIHbv24MWmeRgasZH58o',
    name: 'Will (Optymistyczny)',
    gender: 'male',
    provider: 'elevenlabs',
    description: 'Zrelaksowany, optymistyczny i przyjazny lektor do literatury obyczajowej',
  },
  {
    id: 'cgSgspJ2msm6clMCkdW9',
    name: 'Jessica (Młodzieńcza)',
    gender: 'female',
    provider: 'elevenlabs',
    description: 'Młodzieńczy, energiczny głos kobiecy do powieści młodzieżowych i YA',
  },
  {
    id: 'cjVigY5qzO86Huf0OWal',
    name: 'Eric (Reportażowy)',
    gender: 'male',
    provider: 'elevenlabs',
    description: 'Spokojny, czytelny i wiarygodny lektor reportaży oraz biografii',
  },
  {
    id: 'iP95p4xoKVk53GoZ742B',
    name: 'Chris (Radiowy)',
    gender: 'male',
    provider: 'elevenlabs',
    description: 'Czysty, radiowy głos lektorski o zrównoważonym tempie',
  },
  {
    id: 'nPczCjzI2devNBz1zQrb',
    name: 'Brian (Głęboki Bas)',
    gender: 'male',
    provider: 'elevenlabs',
    description: 'Głęboki, autorytatywny bas narracyjny do epickich sag i historii',
  },
  {
    id: 'onwK4e9ZLuTAKqWW03F9',
    name: 'Daniel (Dostojny)',
    gender: 'male',
    provider: 'elevenlabs',
    description: 'Dostojny, brytyjsko-europejski tembr do klasyki literatury',
  },
  {
    id: 'pFZP5JQG7iQjIQuC4Bku',
    name: 'Lily (Łagodna)',
    gender: 'female',
    provider: 'elevenlabs',
    description: 'Aksamitna, łagodna i kojąca narratorka na wieczorne czytanie',
  },
  {
    id: 'TX3LPaxmHKxFdv7VOQHJ',
    name: 'Liam (Wyrazisty)',
    gender: 'male',
    provider: 'elevenlabs',
    description: 'Młody, wyrazisty głos lektorski — przygodowe i sensacyjne ebooki',
  },
  {
    id: 'pqHfZKP75CvOlQylNhV4',
    name: 'Bill (Narrator)',
    gender: 'male',
    provider: 'elevenlabs',
    description: 'Godny zaufania, ciepły narrator literatury popularnonaukowej',
  },
  {
    id: 't0jbNkn9CVvt53TfGNOx',
    name: 'Sarah (Melodyjna)',
    gender: 'female',
    provider: 'elevenlabs',
    description: 'Delikatna, melodyjna narratorka poezji, esejów i opowiadań',
  },
  // 3. Gemini Neural Audio
  {
    id: 'Kore',
    name: 'Kore (Gemini AI)',
    gender: 'female',
    provider: 'gemini',
    description: 'Ciepła narratorka AI Studio z naturalną intonacją książkową',
  },
  {
    id: 'Fenrir',
    name: 'Fenrir (Gemini AI)',
    gender: 'male',
    provider: 'gemini',
    description: 'Poważny radiowy bas męski — literatura faktu i fantasy',
  },
  {
    id: 'Aoede',
    name: 'Aoede (Gemini AI)',
    gender: 'female',
    provider: 'gemini',
    description: 'Melodyjny, ekspresyjny głos kobiecy z żywymi dialogami',
  },
  {
    id: 'Puck',
    name: 'Puck (Gemini AI)',
    gender: 'male',
    provider: 'gemini',
    description: 'Młodzieńczy, energiczny lektor do lżejszej literatury',
  },
  {
    id: 'Charon',
    name: 'Charon (Gemini AI)',
    gender: 'male',
    provider: 'gemini',
    description: 'Spokojny, dostojny basowy tembr głosu',
  },
];

export async function synthesizeSpeech(params: TtsRequest): Promise<{ buffer: Buffer; mimeType: string }> {
  const { text, voice = 'pl-PL-MarekNeural', provider = 'neural', elevenLabsApiKey, elevenLabsVoiceId, speed = 1.0 } = params;

  if (!text || !text.trim()) {
    throw new Error('Tekst do syntezy jest pusty.');
  }

  // Clean raw HTML or markup so lektor reads pristine prose
  const cleanText = text
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-zA-Z0-9#]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleanText.length === 0) {
    throw new Error('Brak czytelnego tekstu po usunięciu tagów.');
  }

  // Cache key based on provider + voice + speed + text hash
  const hashKey = crypto
    .createHash('sha256')
    .update(`${provider}_${voice}_${elevenLabsVoiceId || ''}_${speed}_${cleanText}`)
    .digest('hex');

  const cacheWav = path.join(CACHE_DIR, `${hashKey}.wav`);
  const cacheMp3 = path.join(CACHE_DIR, `${hashKey}.mp3`);

  if (fs.existsSync(cacheMp3)) {
    return { buffer: fs.readFileSync(cacheMp3), mimeType: 'audio/mpeg' };
  }
  if (fs.existsSync(cacheWav)) {
    return { buffer: fs.readFileSync(cacheWav), mimeType: 'audio/wav' };
  }

  // 1. ElevenLabs Provider
  const settings = loadSettings();
  const effectiveElevenKey = (
    elevenLabsApiKey ||
    process.env.ELEVENLABS_API_KEY ||
    process.env.ELEVEN_LABS_API_KEY ||
    settings.elevenlabs?.apiKey ||
    ''
  ).trim();

  if (provider === 'elevenlabs') {
    if (!effectiveElevenKey) {
      throw new Error(
        'ElevenLabs wymaga klucza API. Wpisz swój bezpłatny klucz API w ustawieniach głosu lub wybierz głos Marek / Zofia (Neural AI), który działa natychmiast bez klucza!'
      );
    }

    const targetVoiceId = elevenLabsVoiceId || (voice && voice.length > 15 ? voice : 'ErXwobaYiN019PkySvjV');
    const resp = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${targetVoiceId}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': effectiveElevenKey,
      },
      body: JSON.stringify({
        text: cleanText,
        model_id: 'eleven_multilingual_v2',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
      signal: AbortSignal.timeout(30000),
    });

    if (resp.ok) {
      const arrayBuf = await resp.arrayBuffer();
      const buffer = Buffer.from(arrayBuf);
      fs.writeFileSync(cacheMp3, buffer);
      return { buffer, mimeType: 'audio/mpeg' };
    }

    const errText = await resp.text();
    console.warn('ElevenLabs TTS error:', resp.status, errText);
    let userMsg = `Błąd ElevenLabs (${resp.status})`;
    try {
      const errJson = JSON.parse(errText);
      if (errJson?.detail?.message) userMsg = errJson.detail.message;
    } catch {}
    throw new Error(userMsg);
  }

  // 2. Gemini Neural Text-to-Speech (Flash Lite TTS)
  if (provider === 'gemini' && GEMINI_KEY) {
    try {
      const ai = getGemini();
      const voiceName = ['Kore', 'Fenrir', 'Puck', 'Aoede', 'Charon'].includes(voice) ? voice : 'Kore';

      const res = await ai.models.generateContent({
        model: 'gemini-3.8-flash-lite-tts',
        contents: [
          {
            role: 'user',
            parts: [{ text: cleanText }],
          },
        ],
        config: {
          responseModalities: ['AUDIO'],
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: {
                voiceName,
              },
            },
          },
        },
      });

      const part = res.candidates?.[0]?.content?.parts?.[0];
      if (part?.inlineData && part.inlineData.data) {
        const audioBuffer = Buffer.from(part.inlineData.data, 'base64');
        const mimeType = part.inlineData.mimeType || 'audio/wav';
        const targetCachePath = mimeType.includes('mpeg') || mimeType.includes('mp3') ? cacheMp3 : cacheWav;
        fs.writeFileSync(targetCachePath, audioBuffer);
        return { buffer: audioBuffer, mimeType };
      }
    } catch (err: any) {
      console.warn('Gemini TTS limit or error, falling back seamlessly to Edge Neural:', err.message);
      // Fall through to Neural Edge TTS so reading NEVER breaks!
    }
  }

  // 3. Unlimited Neural Edge TTS (Default: Marek / Zofia)
  try {
    const isFemale = voice === 'pl-PL-ZofiaNeural' || voice === 'Kore' || voice === 'Aoede' || voice === 'Rachel';
    const targetVoice = voice.includes('Neural')
      ? voice
      : isFemale
      ? 'pl-PL-ZofiaNeural'
      : 'pl-PL-MarekNeural';

    const tempFile = path.join(CACHE_DIR, `temp_${Date.now()}_${Math.random().toString(36).substring(2)}.mp3`);
    const edge = new EdgeTTS({
      voice: targetVoice,
      lang: targetVoice.startsWith('pl-PL') ? 'pl-PL' : 'en-US',
      outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
    });

    await edge.ttsPromise(cleanText, tempFile);
    if (fs.existsSync(tempFile)) {
      const buffer = fs.readFileSync(tempFile);
      try {
        fs.unlinkSync(tempFile);
      } catch {}
      fs.writeFileSync(cacheMp3, buffer);
      return { buffer, mimeType: 'audio/mpeg' };
    }
  } catch (edgeErr: any) {
    console.error('Błąd Edge TTS:', edgeErr.message);
  }

  throw new Error('Nie udało się wygenerować mowy naturalnym głosem. Sprawdź połączenie.');
}

export async function verifyElevenLabsKey(apiKey: string): Promise<{ valid: boolean; characterCount?: number; characterLimit?: number; tier?: string; error?: string }> {
  try {
    const cleanKey = apiKey.trim();
    if (!cleanKey) {
      return { valid: false, error: 'Klucz API nie może być pusty.' };
    }
    const res = await fetch('https://api.elevenlabs.io/v1/user/subscription', {
      headers: { 'xi-api-key': cleanKey },
      signal: AbortSignal.timeout(10000),
    });
    if (res.ok) {
      const data = await res.json();
      try {
        saveSettings({ elevenlabs: { apiKey: cleanKey } });
      } catch {}
      return {
        valid: true,
        characterCount: data.character_count,
        characterLimit: data.character_limit,
        tier: data.tier,
      };
    }
    const errText = await res.text();
    let msg = `Nieprawidłowy klucz (${res.status})`;
    try {
      const parsed = JSON.parse(errText);
      if (parsed?.detail?.message) msg = parsed.detail.message;
    } catch {}
    return { valid: false, error: msg };
  } catch (err: any) {
    return { valid: false, error: err.message || 'Błąd połączenia z ElevenLabs' };
  }
}

export async function fetchElevenLabsVoices(apiKey?: string): Promise<VoiceOption[]> {
  const settings = loadSettings();
  const cleanKey = (
    apiKey ||
    process.env.ELEVENLABS_API_KEY ||
    process.env.ELEVEN_LABS_API_KEY ||
    settings.elevenlabs?.apiKey ||
    ''
  ).trim();

  if (!cleanKey) {
    return AVAILABLE_VOICES.filter((v) => v.provider === 'elevenlabs');
  }

  try {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
      headers: { 'xi-api-key': cleanKey },
      signal: AbortSignal.timeout(9000),
    });
    if (res.ok) {
      const data: any = await res.json();
      if (Array.isArray(data.voices) && data.voices.length > 0) {
        return data.voices.map((v: any) => ({
          id: v.voice_id,
          name: `${v.name} (${v.category === 'cloned' ? 'Sklonowany' : v.category === 'premade' ? 'ElevenLabs' : 'Biblioteka'})`,
          gender: v.labels?.gender === 'female' ? 'female' : 'male',
          provider: 'elevenlabs',
          description: [v.labels?.accent, v.labels?.description, v.labels?.['use case']].filter(Boolean).join(' • ') || 'Głos z Twojego konta ElevenLabs',
          category: v.category,
        }));
      }
    }
  } catch (err: any) {
    console.warn('Nie udało się pobrać głosów z konta ElevenLabs:', err.message);
  }

  return AVAILABLE_VOICES.filter((v) => v.provider === 'elevenlabs');
}

