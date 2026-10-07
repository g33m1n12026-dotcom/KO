import { GoogleGenAI } from '@google/genai';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const GEMINI_KEY = process.env.GEMINI_API_KEY || '';
const OPENAI_KEY = process.env.OPENAI_API_KEY || '';
const ELEVENLABS_KEY = process.env.ELEVENLABS_API_KEY || '';

// Disk cache for generated speech chunks to ensure instant re-play and save API quota
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
  provider?: 'gemini' | 'elevenlabs' | 'openai';
  elevenLabsApiKey?: string;
  elevenLabsVoiceId?: string;
  speed?: number;
}

export interface VoiceOption {
  id: string;
  name: string;
  gender: 'female' | 'male';
  provider: 'gemini' | 'elevenlabs' | 'openai';
  description: string;
  isDefault?: boolean;
}

export const AVAILABLE_VOICES: VoiceOption[] = [
  // Gemini Neural Audio voices
  {
    id: 'Kore',
    name: 'Kore (Ciepły kobiecy)',
    gender: 'female',
    provider: 'gemini',
    description: 'Naturalna, kojąca narratorka AI — idealna do powieści i opowiadań',
    isDefault: true,
  },
  {
    id: 'Fenrir',
    name: 'Fenrir (Głęboki męski)',
    gender: 'male',
    provider: 'gemini',
    description: 'Poważny, radiowy głos lektorski — idealny do literatury faktu i fantasy',
  },
  {
    id: 'Aoede',
    name: 'Aoede (Melodyjny)',
    gender: 'female',
    provider: 'gemini',
    description: 'Wyrazisty, ekspresyjny głos kobiecy z żywą intonacją',
  },
  {
    id: 'Puck',
    name: 'Puck (Młodzieńczy)',
    gender: 'male',
    provider: 'gemini',
    description: 'Energiczny, przyjazny głos lektora do lżejszej literatury i poradników',
  },
  {
    id: 'Charon',
    name: 'Charon (Dojrzały radiowy)',
    gender: 'male',
    provider: 'gemini',
    description: 'Spokojny, dostojny basowy tembr głosu',
  },
  // ElevenLabs preset voices (if ElevenLabs key is supplied)
  {
    id: '21m00Tcm4TlvDq8ikWAM',
    name: 'Rachel (ElevenLabs)',
    gender: 'female',
    provider: 'elevenlabs',
    description: 'Kultowy, ultra-realistyczny głos ElevenLabs Multilingual V2',
  },
  {
    id: 'ErXwobaYiN019PkySvjV',
    name: 'Antoni (ElevenLabs Polski)',
    gender: 'male',
    provider: 'elevenlabs',
    description: 'Płynny polski lektor męski ElevenLabs',
  },
  {
    id: 'EXAVITQu4vr4xnSDxMaL',
    name: 'Bella (ElevenLabs)',
    gender: 'female',
    provider: 'elevenlabs',
    description: 'Emocjonalny, narracyjny kobiecy głos ElevenLabs',
  },
];

export async function synthesizeSpeech(params: TtsRequest): Promise<{ buffer: Buffer; mimeType: string }> {
  const { text, voice = 'Kore', provider = 'gemini', elevenLabsApiKey, elevenLabsVoiceId } = params;

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

  // Cache key based on provider + voice + text hash
  const hashKey = crypto
    .createHash('sha256')
    .update(`${provider}_${voice}_${elevenLabsVoiceId || ''}_${cleanText}`)
    .digest('hex');

  const cacheWav = path.join(CACHE_DIR, `${hashKey}.wav`);
  const cacheMp3 = path.join(CACHE_DIR, `${hashKey}.mp3`);

  if (fs.existsSync(cacheWav)) {
    return { buffer: fs.readFileSync(cacheWav), mimeType: 'audio/wav' };
  }
  if (fs.existsSync(cacheMp3)) {
    return { buffer: fs.readFileSync(cacheMp3), mimeType: 'audio/mpeg' };
  }

  // 1. ElevenLabs Provider
  const effectiveElevenKey = elevenLabsApiKey || ELEVENLABS_KEY;
  if (provider === 'elevenlabs' && effectiveElevenKey) {
    const targetVoiceId = elevenLabsVoiceId || voice || '21m00Tcm4TlvDq8ikWAM';
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
    // Fallback to Gemini Neural TTS on failure
  }

  // 2. Gemini Neural Text-to-Speech (Default & Ultra-Realistic)
  if (GEMINI_KEY) {
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
      console.warn('Gemini TTS error:', err.message);
    }
  }

  throw new Error('Nie udało się wygenerować mowy naturalnym głosem. Sprawdź połączenie z internetem.');
}
