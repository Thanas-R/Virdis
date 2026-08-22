/* eslint-disable react-refresh/only-export-components */
import type React from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type AppLanguageCode = "en" | "hi" | "kn" | "te" | "ta";

export const APP_LANGUAGES: Array<{ code: AppLanguageCode; label: string; nativeLabel: string; aiName: string }> = [
  { code: "en", label: "English", nativeLabel: "English", aiName: "English" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी", aiName: "Hindi (हिन्दी)" },
  { code: "kn", label: "Kannada", nativeLabel: "ಕನ್ನಡ", aiName: "Kannada (ಕನ್ನಡ)" },
  { code: "te", label: "Telugu", nativeLabel: "తెలుగు", aiName: "Telugu (తెలుగు)" },
  { code: "ta", label: "Tamil", nativeLabel: "தமிழ்", aiName: "Tamil (தமிழ்)" },
];

const LANGUAGE_STORAGE_KEY = "virdis-language";

interface LanguageContextValue {
  language: AppLanguageCode;
  languageName: string;
  setLanguage: (language: AppLanguageCode) => void;
}

const LanguageContext = createContext<LanguageContextValue | undefined>(undefined);

function readStoredLanguage(): AppLanguageCode {
  if (typeof window === "undefined") return "en";
  const saved = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
  return APP_LANGUAGES.some((language) => language.code === saved) ? (saved as AppLanguageCode) : "en";
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<AppLanguageCode>(readStoredLanguage);

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language;
  }, [language]);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    languageName: APP_LANGUAGES.find((option) => option.code === language)?.aiName ?? "English",
    setLanguage,
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}
