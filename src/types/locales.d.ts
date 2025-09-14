// Locales 관련 타입 정의

// JSON 파일 생성을 위한 인터페이스
export interface LocaleEntry {
  key: string;
  value: string;
  variables?: string[];
}

// Locales 생성 옵션
export interface LocalesGenerationOptions {
  language: string;
  outputPath?: string;
  showNotifications?: boolean;
}
