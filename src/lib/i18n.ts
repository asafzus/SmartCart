import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from '../locales/en.json'
import he from '../locales/he.json'

const savedLang = localStorage.getItem('smartcart_lang') || 'he'

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    he: { translation: he },
  },
  lng: savedLang,
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false, // React already escapes
  },
})

// Sync <html dir> and <html lang> with i18n language
i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng
  document.documentElement.dir = lng === 'he' ? 'rtl' : 'ltr'
  localStorage.setItem('smartcart_lang', lng)
})

// Set initial dir/lang
document.documentElement.lang = savedLang
document.documentElement.dir = savedLang === 'he' ? 'rtl' : 'ltr'

export default i18n
