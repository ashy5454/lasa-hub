import AsyncStorage from "@react-native-async-storage/async-storage";
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import translations, { type Language, type TranslationKey } from "@/constants/translations";

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => Promise<void>;
  t: (key: TranslationKey) => string;
  languageReady: boolean;
}

const LanguageContext = createContext<LanguageContextType | null>(null);

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLang] = useState<Language>("te");
  const [languageReady, setLanguageReady] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem("lasa_language");
        if (stored === "te" || stored === "hi" || stored === "en") {
          setLang(stored);
        }
      } catch {}
      setLanguageReady(true);
    })();
  }, []);

  const setLanguage = useCallback(async (lang: Language) => {
    setLang(lang);
    await AsyncStorage.setItem("lasa_language", lang);
  }, []);

  const t = useCallback((key: TranslationKey): string => {
    const dict = translations[language] as Record<string, string>;
    return dict[key] ?? (translations.en as Record<string, string>)[key] ?? key;
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, languageReady }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const ctx = useContext(LanguageContext);
  if (!ctx) throw new Error("useLanguage must be inside LanguageProvider");
  return ctx;
}
