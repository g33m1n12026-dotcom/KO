import React, { useState } from 'react';
import { BookOpen, Cpu, Copy, Check, Wifi, ExternalLink } from 'lucide-react';

interface HeaderProps {
  activeTab: string;
  setActiveTab: (tab: string) => void;
  serverUrl: string;
  keysStatus: { openrouter: boolean; openai: boolean; claude: boolean; gemini?: boolean };
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  serverUrl,
  keysStatus,
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(serverUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const navItems = [
    { id: 'convert', label: 'Tłumacz i Konwertuj', icon: '📄' },
    { id: 'storybook', label: 'Książka na życzenie', icon: '✨' },
    { id: 'search', label: 'Szukaj w sieci', icon: '🔍' },
    { id: 'library', label: 'Kolejka i Biblioteka', icon: '📚' },
    { id: 'plugin', label: 'Wtyczka Kindle 10', icon: '📱' },
  ];

  return (
    <header className="border-b border-stone-200 bg-stone-50/80 backdrop-blur-md sticky top-0 z-40">
      <div className="max-w-6xl mx-auto px-4 py-3 sm:px-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          {/* Logo & Subtitle */}
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-stone-900 text-stone-100 flex items-center justify-center shadow-sm">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-stone-900 tracking-tight">
                  KOReader AI Cloud
                </h1>
                <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-stone-200 text-stone-700">
                  Kindle 10 Ready
                </span>
              </div>
              <p className="text-xs text-stone-500">
                Mostek chmurowy: konwersja PDF do EPUB, literackie tłumaczenie i wyszukiwarka
              </p>
            </div>
          </div>

          {/* Connection Pill & Keys */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Server URL for Kindle */}
            <div
              onClick={handleCopy}
              className="flex items-center gap-2 px-3 py-1.5 text-xs bg-white border border-stone-200 rounded-lg text-stone-700 hover:bg-stone-100 cursor-pointer transition shadow-2xs"
              title="Kliknij, aby skopiować adres serwera do wpisania w Kindle"
            >
              <Wifi className="w-3.5 h-3.5 text-emerald-600" />
              <span className="font-mono truncate max-w-[200px] sm:max-w-[260px]">
                {serverUrl || 'Ładowanie adresu...'}
              </span>
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5 text-stone-400" />
              )}
            </div>

            {/* AI Providers Badges */}
            <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-medium text-stone-600">
              <span
                className={`px-2 py-1 rounded-md border ${
                  keysStatus.gemini
                    ? 'bg-blue-50 text-blue-900 border-blue-200'
                    : 'bg-stone-100 text-stone-400 border-stone-200'
                }`}
                title="Google Gemini (Szybki doradca i tłumaczenie)"
              >
                Gemini {keysStatus.gemini ? '●' : '○'}
              </span>
              <span
                className={`px-2 py-1 rounded-md border ${
                  keysStatus.openrouter
                    ? 'bg-purple-50 text-purple-900 border-purple-200'
                    : 'bg-stone-100 text-stone-400 border-stone-200'
                }`}
                title="OpenRouter (DeepSeek / Llama)"
              >
                DeepSeek {keysStatus.openrouter ? '●' : '○'}
              </span>
              <span
                className={`px-2 py-1 rounded-md border ${
                  keysStatus.claude
                    ? 'bg-amber-50 text-amber-900 border-amber-200'
                    : 'bg-stone-100 text-stone-400 border-stone-200'
                }`}
                title="Anthropic Claude 3.5 Sonnet (Do przekładu literackiego)"
              >
                Claude {keysStatus.claude ? '●' : '○'}
              </span>
              <span
                className={`px-2 py-1 rounded-md border ${
                  keysStatus.openai
                    ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
                    : 'bg-stone-100 text-stone-400 border-stone-200'
                }`}
                title="OpenAI GPT-4o (Struktury i tłumaczenie)"
              >
                GPT-4o {keysStatus.openai ? '●' : '○'}
              </span>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <nav className="flex space-x-1 mt-3 border-t border-stone-200/60 pt-2 overflow-x-auto">
          {navItems.map(item => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`px-3 py-1.5 text-sm font-medium rounded-lg whitespace-nowrap transition flex items-center gap-1.5 ${
                  isActive
                    ? 'bg-stone-900 text-white shadow-xs'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                }`}
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
