export const defaultLanguageId = 'en'

export const languageOptions = [
  { id: 'en', label: 'English' },
  { id: 'ru', label: 'Russian' },
  { id: 'ka', label: 'Georgian' },
  { id: 'es', label: 'Spanish' },
  { id: 'de', label: 'German' },
  { id: 'tr', label: 'Turkish' },
  { id: 'fr', label: 'French' },
  { id: 'it', label: 'Italian' },
  { id: 'id', label: 'Indonesian' },
  { id: 'lv', label: 'Latvian' },
  { id: 'pt', label: 'Portuguese' },
  { id: 'hu', label: 'Hungarian' },
  { id: 'pl', label: 'Polish' },
  { id: 'ro', label: 'Romanian' },
  { id: 'hy', label: 'Armenian' },
  { id: 'zh', label: 'Chinese' },
  { id: 'ko', label: 'Korean' },
]

export function getLanguageOption(value) {
  return languageOptions.find((option) => option.id === value) || languageOptions[0]
}

