import React, { useState } from 'react';
import { BookOpen, Copy, Check, Wifi, Sparkles, Search, BookMarked, FileText, Plug } from 'lucide-react';

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
}) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(serverUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const navItems = [
    { id: 'search', label: 'Szukaj', fullLabel: 'Szukaj w sieci', icon: <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> },
    { id: 'library', label: 'Książki', fullLabel: 'Biblioteka (OPDS)', icon: <BookMarked className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> },
    { id: 'storybook', label: 'Kreator', fullLabel: 'Książka AI', icon: <Sparkles className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> },
    { id: 'convert', label: 'Konwertuj', fullLabel: 'Konwerter', icon: <FileText className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> },
    { id: 'reader', label: 'Czytnik', fullLabel: 'Czytnik Web', icon: <BookOpen className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> },
    { id: 'plugin', label: 'Kindle', fullLabel: 'Wtyczka Kindle', icon: <Plug className="w-3.5 h-3.5 sm:w-4 sm:h-4" /> },
  ];

  return (
    <header className="border-b border-stone-200/80 bg-white/95 backdrop-blur-md sticky top-0 z-40 shadow-xs">
      <div className="max-w-6xl mx-auto px-2.5 sm:px-6 py-1 sm:py-2">
        {/* Top compact bar */}
        <div className="flex items-center justify-between gap-2">
          {/* Logo & title */}
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-6 h-6 sm:w-7 sm:h-7 rounded-md bg-stone-900 text-stone-100 flex items-center justify-center shrink-0">
              <BookOpen className="w-3.5 h-3.5 text-amber-300" />
            </div>
            <div className="min-w-0 flex items-center gap-1.5">
              <span className="text-xs sm:text-sm font-bold text-stone-900 tracking-tight truncate">
                KOReader Cloud
              </span>
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" title="Serwer aktywny" />
            </div>
          </div>

          {/* Right actions: Server URL copy */}
          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1 px-1.5 py-0.5 sm:px-2 sm:py-1 text-[11px] bg-stone-100/90 hover:bg-stone-200 border border-stone-200 rounded-md text-stone-700 transition cursor-pointer"
              title="Kopiuj adres URL serwera"
            >
              <Wifi className="w-3 h-3 text-emerald-600 shrink-0" />
              <span className="font-mono text-[10px] hidden md:inline truncate max-w-[130px]">
                {serverUrl.replace(/^https?:\/\//, '')}
              </span>
              <span className="text-[10px] font-medium">
                {copied ? 'Skopiowano!' : 'URL'}
              </span>
              {copied ? (
                <Check className="w-2.5 h-2.5 text-emerald-600 shrink-0" />
              ) : (
                <Copy className="w-2.5 h-2.5 text-stone-400 shrink-0 hidden sm:inline" />
              )}
            </button>
          </div>
        </div>

        {/* Clean, compact mobile-friendly navigation tab bar */}
        <nav className="flex space-x-1 mt-1 pt-1 border-t border-stone-100 overflow-x-auto no-scrollbar scroll-smooth">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`px-2 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs font-medium rounded-lg whitespace-nowrap transition flex items-center gap-1 cursor-pointer shrink-0 ${
                  isActive
                    ? 'bg-stone-900 text-white shadow-xs'
                    : 'text-stone-600 hover:text-stone-900 hover:bg-stone-100'
                }`}
              >
                {item.icon}
                <span className="sm:hidden">{item.label}</span>
                <span className="hidden sm:inline">{item.fullLabel}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </header>
  );
};
