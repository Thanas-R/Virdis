/* eslint-disable react-refresh/only-export-components */
import type React from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

export type AppLanguageCode = "en" | "hi" | "bn" | "mr" | "gu" | "pa" | "kn" | "te" | "ta" | "ml" | "or" | "as" | "ur";

export const APP_LANGUAGES: Array<{ code: AppLanguageCode; label: string; nativeLabel: string; aiName: string }> = [
  { code: "en", label: "English", nativeLabel: "English", aiName: "English" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी", aiName: "Hindi (हिन्दी)" },
  { code: "bn", label: "Bengali", nativeLabel: "বাংলা", aiName: "Bengali (বাংলা)" },
  { code: "mr", label: "Marathi", nativeLabel: "मराठी", aiName: "Marathi (मराठी)" },
  { code: "gu", label: "Gujarati", nativeLabel: "ગુજરાતી", aiName: "Gujarati (ગુજરાતી)" },
  { code: "pa", label: "Punjabi", nativeLabel: "ਪੰਜਾਬੀ", aiName: "Punjabi (ਪੰਜਾਬੀ)" },
  { code: "kn", label: "Kannada", nativeLabel: "ಕನ್ನಡ", aiName: "Kannada (ಕನ್ನಡ)" },
  { code: "te", label: "Telugu", nativeLabel: "తెలుగు", aiName: "Telugu (తెలుగు)" },
  { code: "ta", label: "Tamil", nativeLabel: "தமிழ்", aiName: "Tamil (தமிழ்)" },
  { code: "ml", label: "Malayalam", nativeLabel: "മലയാളം", aiName: "Malayalam (മലയാളം)" },
  { code: "or", label: "Odia", nativeLabel: "ଓଡ଼ିଆ", aiName: "Odia (ଓଡ଼ିଆ)" },
  { code: "as", label: "Assamese", nativeLabel: "অসমীয়া", aiName: "Assamese (অসমীয়া)" },
  { code: "ur", label: "Urdu", nativeLabel: "اردو", aiName: "Urdu (اردو)" },
];

const LANGUAGE_STORAGE_KEY = "virdis-language";

const TRANSLATIONS = {
  en: { language: "Language", map: "Map", fields: "Fields", analytics: "Analytics", notFound: "Oops! Page not found", returnHome: "Return to Home", loadingAnalytics: "Loading analytics...", noData: "No data", noSatelliteData: "No satellite data", loading: "Loading...", healthy: "Healthy", moderate: "Moderate", stressed: "Stressed", critical: "Critical", good: "Good", fair: "Fair", poor: "Poor", highStress: "High Stress", overIrrigated: "Over-irrigated", adequate: "Adequate", checking: "Checking…", growthStage: "Growth Stage", detectingGrowthStage: "Detecting growth stage…", noSatelliteRegion: "No satellite data available for this region.", aiUnavailable: "Analysis unavailable", cropPlannerUnavailable: "Live planner is unavailable right now, so this view is using the regional agronomy model with NDVI, soil, rainfall, and water signals.", cropPlannerRunning: "Regional crop layout generated from NDVI, soil, rainfall, and water signals while live AI refinement runs in the background.", cropPlannerDone: "Live AI analysis completed and updated this crop plan." },
  hi: { language: "भाषा", map: "मानचित्र", fields: "क्षेत्र", analytics: "विश्लेषण", notFound: "पेज नहीं मिला", returnHome: "होम पर लौटें", loadingAnalytics: "विश्लेषण लोड हो रहा है...", noData: "डेटा नहीं", noSatelliteData: "उपग्रह डेटा नहीं", loading: "लोड हो रहा है...", healthy: "स्वस्थ", moderate: "मध्यम", stressed: "तनावग्रस्त", critical: "गंभीर", good: "अच्छा", fair: "ठीक", poor: "खराब", highStress: "अधिक तनाव", overIrrigated: "अधिक सिंचाई", adequate: "पर्याप्त", checking: "जांच जारी…", growthStage: "विकास चरण", detectingGrowthStage: "विकास चरण पहचाना जा रहा है…", noSatelliteRegion: "इस क्षेत्र के लिए उपग्रह डेटा उपलब्ध नहीं है।", aiUnavailable: "विश्लेषण उपलब्ध नहीं", cropPlannerUnavailable: "लाइव प्लानर अभी उपलब्ध नहीं है, इसलिए यह दृश्य NDVI, मिट्टी, वर्षा और जल संकेतों वाले क्षेत्रीय मॉडल का उपयोग कर रहा है।", cropPlannerRunning: "लाइव AI सुधार पृष्ठभूमि में चलते समय NDVI, मिट्टी, वर्षा और जल संकेतों से क्षेत्रीय फसल लेआउट बनाया गया।", cropPlannerDone: "लाइव AI विश्लेषण पूरा हुआ और फसल योजना अपडेट हुई।" },
  bn: { language: "ভাষা", map: "মানচিত্র", fields: "ক্ষেত্র", analytics: "বিশ্লেষণ" },
  mr: { language: "भाषा", map: "नकाशा", fields: "शेते", analytics: "विश्लेषण" },
  gu: { language: "ભાષા", map: "નકશો", fields: "ખેતરો", analytics: "વિશ્લેષણ" },
  pa: { language: "ਭਾਸ਼ਾ", map: "ਨਕਸ਼ਾ", fields: "ਖੇਤ", analytics: "ਵਿਸ਼ਲੇਸ਼ਣ" },
  kn: { language: "ಭಾಷೆ", map: "ನಕ್ಷೆ", fields: "ಕ್ಷೇತ್ರಗಳು", analytics: "ವಿಶ್ಲೇಷಣೆ" },
  te: { language: "భాష", map: "పటం", fields: "క్షేత్రాలు", analytics: "విశ్లేషణ" },
  ta: { language: "மொழி", map: "வரைபடம்", fields: "புலங்கள்", analytics: "பகுப்பாய்வு" },
  ml: { language: "ഭാഷ", map: "മാപ്പ്", fields: "ഫീൽഡുകൾ", analytics: "വിശകലനം" },
  or: { language: "ଭାଷା", map: "ମାନଚିତ୍ର", fields: "କ୍ଷେତ୍ର", analytics: "ବିଶ୍ଳେଷଣ" },
  as: { language: "ভাষা", map: "মানচিত্ৰ", fields: "ক্ষেত্ৰ", analytics: "বিশ্লেষণ" },
  ur: { language: "زبان", map: "نقشہ", fields: "کھیت", analytics: "تجزیات" },
} satisfies Record<AppLanguageCode, Partial<Record<string, string>>>;

export type TranslationKey = keyof typeof TRANSLATIONS.en;

interface LanguageContextValue {
  language: AppLanguageCode;
  languageName: string;
  t: (key: TranslationKey) => string;
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
    t: (key) => TRANSLATIONS[language][key] ?? TRANSLATIONS.en[key] ?? key,
    setLanguage,
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) throw new Error("useLanguage must be used within LanguageProvider");
  return context;
}
