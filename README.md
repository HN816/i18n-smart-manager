# I18n Smart Manager

한글 텍스트를 자동으로 추출하고 i18n 키로 변환하여 다국어 지원을 쉽게 만들어주는 VSCode 확장프로그램입니다.

## ✨ 주요 기능

### 한글 텍스트 자동 감지

- **TypeScript, JavaScript, TSX, JSX, Vue** 파일에서 한글 텍스트를 자동으로 감지
- 이미 i18n이 적용된 텍스트는 제외하여 중복 변환 방지
- 주석 내 한글 텍스트는 자동으로 제외

### 스마트 변환

- 한글 텍스트를 i18n 키로 자동 변환
- 변수가 포함된 텍스트도 자동으로 처리 (`${변수}`, `{{변수}}`, `{변수}`)
- 파일 타입에 맞는 올바른 문법으로 변환

### Locales 파일 자동 생성

- 추출된 텍스트로 locales 파일 자동 생성
- **커스터마이징 가능한 파일명 패턴**: `{language}`, `{namespace}` 변수 사용
- 기존 파일과 병합하여 중복 키 방지
- **DeepL API**를 통한 자동 번역 지원 (영어, 중국어, 일본어)
- 중첩 구조 지원: 네임스페이스별로 그룹화된 파일 구조

### Google Sheets 연동

- 생성된 locales 파일을 Google Sheets에 업로드
- 번역팀과의 협업을 위한 스프레드시트 관리
- 여러 언어 파일을 하나의 시트로 통합
- 자동 평면화: 중첩 구조를 `namespace.key` 형태로 변환하여 업로드

### 실시간 미리보기

- 변환 결과를 실시간으로 미리보기
- 변환 전/후 비교 가능
- 하이라이트를 통한 시각적 피드백

## 빠른 시작

### 1. 확장 설치

VSCode 익스텐션에서 "I18n Smart Manager"를 검색하여 설치하세요.

### 2. 모니터링 시작

1. VSCode 사이드바에서 🌐아이콘 클릭
2. **모니터링 시작** 버튼을 클릭하여 한글 텍스트 모니터링 시작

### 3. Locales 파일 생성

1. **locales 파일 생성** 버튼 클릭
2. 번역이 필요한 언어 선택
3. **네임스페이스 입력** (선택사항): 키를 그룹화할 네임스페이스 입력
4. 설정된 파일명 패턴에 따라 자동으로 파일 생성

### 4. 텍스트 변환

1. 감지된 한글 텍스트를 확인
2. **전체 변환** 버튼으로 일괄 변환
3. 또는 개별 텍스트를 선택하여 변환
4. **네임스페이스 입력**: 변환 시 네임스페이스를 입력하여 키를 그룹화 (예: `common`, `auth`)

## ⚙️ 설정

### 기본 설정

```json
{
  "I18nSmartManager.locales.outputPath": "", // locales 파일 저장 경로
  "I18nSmartManager.locales.enabledLanguages": ["ko", "en", "zh", "ja"], // 활성화할 언어
  "I18nSmartManager.locales.filenamePattern": "locales.{language}.json" // 파일명 패턴
}
```

### 키 생성 커스터마이징

```json
{
  "I18nSmartManager.keyGeneration.customFunction": "text => text.replace(/\\s+/g, '_').replace(/\\./g, '#dot#').replace(/\\\\(.)/g, '\\\\\\\\$1').replace(/\\[/g, '#lb#').replace(/\\]/g, '#rb#')"
}
```

### DeepL 번역 설정

```json
{
  "I18nSmartManager.translation.deeplApiKey": "your-deepl-api-key"
}
```

### Google Sheets 연동 설정

#### - 구글 API 키

```json
{
  "I18nSmartManager.spreadsheet.googleApiKey": "your-google-api-key"
}
```

# Google API Key 설정

<img width="1132" height="624" alt="Image" src="https://raw.githubusercontent.com/HN816/i18n-smart-manager/main/images/google-api-key.png" />

#### - Google Service Account 인증 정보

```json
{
  "I18nSmartManager.spreadsheet.serviceAccountCredentials": { your json }
}
```

# Service Account 인증 정보

<img height="330" alt="Image" src="https://raw.githubusercontent.com/HN816/i18n-smart-manager/main/images/service-account-credentials-1.png" /> 
<img width="600" alt="Image" src="https://raw.githubusercontent.com/HN816/i18n-smart-manager/main/images/service-account-credentials-2.png" />

#### - 구글 스프레드시트 ID

```json
{
  "I18nSmartManager.spreadsheet.spreadsheetId": "your-spreadsheet-id"
}
```

# Spreadsheet ID

<img width="859" height="168" alt="Image" src="https://raw.githubusercontent.com/HN816/i18n-smart-manager/main/images/spreadsheet-id.png" />

## 사용법

### 명령어 팔레트

- `Ctrl+Shift+P` → "I18n Smart Manager" 검색하여 사용 가능한 명령어 확인

### 사이드바 사용

1. **I18n Smart Manager** 패널에서 모든 기능 접근
2. 감지된 텍스트 목록 확인
3. 개별 텍스트 제외/포함 설정
4. i18n 변환 실행

### 키보드 단축키

- `Ctrl+Shift+A`: 선택한 텍스트를 i18n 목록에 추가

## 다국어 지원

### 자동 번역

- **DeepL API**를 통한 고품질 번역
- 지원 언어: 영어, 중국어, 일본어
- API 키 설정 후 자동으로 번역 파일 생성

### Google Sheets 연동

- 번역팀과의 협업을 위한 스프레드시트 업로드
- 여러 언어를 하나의 시트로 통합 관리
- 실시간 협업 및 번역 상태 추적

## 커스터마이징

### 키 생성 규칙 설정

프로젝트에 맞는 i18n 키 생성 규칙을 직접 정의할 수 있습니다:

```javascript
// 기본 변환 규칙:
// - 공백 → 언더스코어: 명시적 띄어쓰기 표현
// - 점(.) → #dot#: 네임스페이스 구분자(.)와 충돌 방지
// - 백슬래시 이스케이프 시퀀스(\n, \t, \r 등) → \\n, \\t, \\r: 이스케이프 문자 처리
// - 괄호([]) → #lb#, #rb#: 배열 인덱스 접근과의 충돌 방지
// - 작은따옴표(') → #sq#: 문자열 구분자와의 충돌 방지
// - 큰따옴표(") → #dq#: 문자열 구분자와의 충돌 방지
text
  .replace(/\s+/g, '_')
  .replace(/\./g, '#dot#')
  .replace(/\\(.)/g, '\\\\$1')
  .replace(/\[/g, '#lb#')
  .replace(/\]/g, '#rb#')
  .replace(/'/g, '#sq#')
  .replace(/"/g, '#dq#');
```

### 파일명 패턴 커스터마이징

프로젝트 구조에 맞는 locales 파일명을 자유롭게 설정할 수 있습니다:

```json
{
  "I18nSmartManager.locales.filenamePattern": "locales.{language}.json" // 기본값
}
```

#### 사용 가능한 변수

- `{language}`: 언어 코드 (ko, en, zh, ja)
- `{namespace}`: 네임스페이스 (입력한 경우에만)

#### 패턴 예시

- `locales.{language}.json` → `locales.ko.json`
- `locales.{namespace}.{language}.json` → `locales.common.ko.json`
- `{language}/locales.json` → `ko/locales.json`
- `{language}/locales.{namespace}.json` → `ko/locales.common.json`
- `locales-{namespace}.{language}.json` → `locales-common.ko.json`
- `{language}/{namespace}.json` → `ko/common.json`

### 네임스페이스 활용

대규모 프로젝트에서 i18n 키를 체계적으로 관리할 수 있습니다:

- 기능별, 페이지별로 키를 그룹화
- `namespace.key` 형태로 자동 생성
- 중복 키 충돌 방지

### 선택적 변환 관리

변환할 텍스트를 세밀하게 제어할 수 있습니다:

- 개별 텍스트 제외/포함 설정
- 컨텍스트 메뉴로 간편한 관리
- 제외된 텍스트를 다시 선택하여 포함시키기 가능

### 하이라이트 커스터마이징

```json
{
  "I18nSmartManager.highlighting.koreanTextColor": "#ffe44c", // 한글 텍스트 색상
  "I18nSmartManager.highlighting.i18nTextColor": "#90EE90", // i18n 텍스트 색상
  "I18nSmartManager.highlighting.koreanTextDecoration": "underline wavy", // 한글 텍스트 스타일
  "I18nSmartManager.highlighting.i18nTextDecoration": "underline" // i18n 텍스트 스타일
}
```

#### 지원하는 스타일

- `underline` - 기본 밑줄
- `underline wavy` - 물결 밑줄
- `underline dotted` - 점선 밑줄
- `underline dashed` - 대시 밑줄
- `none` - 밑줄 없음

#### 색상 형식

- Hex 형식: `#ffe44c`, `#90EE90`
- RGB 형식: `rgb(255, 228, 76)`
- 색상 이름: `yellow`, `lightgreen`
