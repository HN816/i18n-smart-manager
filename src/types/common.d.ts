// 공통 타입 정의

export type FileType = 'vue' | 'ts' | 'tsx';

// 텍스트 범위 정보
export interface TextRange {
  start: number;
  end: number;
  text: string;
}

// 변수 정보를 담는 인터페이스
export interface VariableInfo {
  originalText: string;
  variables: string[];
  template: string;
}

// 수정사항 정보를 담는 인터페이스
export interface Modification {
  start: number;
  end: number;
  replacement: string;
}

// 추출된 텍스트들
export interface ExtractedTexts {
  koreanRanges: TextRange[];
  i18nRanges: TextRange[];
}
