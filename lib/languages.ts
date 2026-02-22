// Supported languages — intersection of Whisper (Lemonfox), DeepL, and ElevenLabs.
// Codes are DeepL target-language codes (canonical format used across the app).
// Pipeline mapping to Whisper / ElevenLabs codes is handled in Milestone 3.

export interface Language {
  code: string
  label: string
}

export const LANGUAGES: Language[] = [
  { code: 'AR', label: 'Arabic' },
  { code: 'BG', label: 'Bulgarian' },
  { code: 'ZH', label: 'Chinese' },
  { code: 'CS', label: 'Czech' },
  { code: 'DA', label: 'Danish' },
  { code: 'NL', label: 'Dutch' },
  { code: 'EN', label: 'English' },
  { code: 'ET', label: 'Estonian' },
  { code: 'FI', label: 'Finnish' },
  { code: 'FR', label: 'French' },
  { code: 'DE', label: 'German' },
  { code: 'EL', label: 'Greek' },
  { code: 'HE', label: 'Hebrew' },
  { code: 'HU', label: 'Hungarian' },
  { code: 'ID', label: 'Indonesian' },
  { code: 'IT', label: 'Italian' },
  { code: 'JA', label: 'Japanese' },
  { code: 'KO', label: 'Korean' },
  { code: 'LV', label: 'Latvian' },
  { code: 'LT', label: 'Lithuanian' },
  { code: 'NB', label: 'Norwegian' },
  { code: 'PL', label: 'Polish' },
  { code: 'PT', label: 'Portuguese' },
  { code: 'RO', label: 'Romanian' },
  { code: 'RU', label: 'Russian' },
  { code: 'SK', label: 'Slovak' },
  { code: 'SL', label: 'Slovenian' },
  { code: 'ES', label: 'Spanish' },
  { code: 'SV', label: 'Swedish' },
  { code: 'TR', label: 'Turkish' },
  { code: 'UK', label: 'Ukrainian' },
  { code: 'VI', label: 'Vietnamese' },
]
