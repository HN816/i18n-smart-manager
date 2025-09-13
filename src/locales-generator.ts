import * as vscode from 'vscode';
import { convertToI18nKey, extractVariables } from './convert';
import { translateTexts } from './translator';
import * as path from 'path';

// JSON 파일 생성을 위한 인터페이스
export interface LocaleEntry {
  key: string;
  value: string;
  variables?: string[];
}

// 프로젝트 루트 경로를 가져오는 헬퍼 함수
function getProjectRoot(): string {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders && workspaceFolders.length > 0) {
    return workspaceFolders[0].uri.fsPath;
  }

  // 워크스페이스가 없으면 현재 활성 편집기의 디렉토리 사용
  const editor = vscode.window.activeTextEditor;
  if (editor) {
    const filePath = editor.document.uri.fsPath;
    return filePath.substring(0, filePath.lastIndexOf('\\') || filePath.lastIndexOf('/'));
  }

  // 그 외의 경우 현재 디렉토리 사용
  return process.cwd();
}

// 경로를 절대 경로로 변환하는 함수
function resolvePath(path: string): string {
  if (path.startsWith('./') || path.startsWith('../')) {
    // 상대 경로인 경우 프로젝트 루트 기준으로 절대 경로로 변환
    const projectRoot = getProjectRoot();
    const pathModule = require('path');
    return pathModule.resolve(projectRoot, path);
  }
  return path; // 이미 절대 경로인 경우
}

// 기존 JSON 파일을 읽어오는 함수
async function readExistingLocales(filePath: string): Promise<{ [key: string]: string }> {
  try {
    const fileContent = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
    const jsonString = new TextDecoder().decode(fileContent);
    return JSON.parse(jsonString);
  } catch (error) {
    // 파일이 없거나 파싱 오류인 경우 빈 객체 반환
    return {};
  }
}

// locales.ko.json 파일 생성 함수
export async function generateLocalesJson(
  texts: string[],
  language: string = 'ko',
  outputPath?: string,
  showNotifications: boolean = true, // 알림 표시 여부 제어
): Promise<void> {
  if (texts.length === 0) {
    if (showNotifications) {
      vscode.window.showInformationMessage('생성할 한글 텍스트가 없습니다.');
    }
    return;
  }

  // 출력 경로가 지정되지 않은 경우 기본 경로 사용
  let targetPath = outputPath;
  if (!targetPath) {
    const config = vscode.workspace.getConfiguration('i18nManager.locales');
    const customPath = config.get<string>('outputPath', '');

    if (customPath) {
      // 사용자가 지정한 경로가 있으면 그곳에 저장
      const resolvedPath = resolvePath(customPath);
      const fileName = `locales.${language}.json`;
      targetPath = path.join(resolvedPath, fileName);
    } else {
      // 기본은 프로젝트 루트에 저장
      const projectRoot = getProjectRoot();
      const fileName = `locales.${language}.json`;
      targetPath = path.join(projectRoot, fileName);
    }
  }

  // 기존 파일 읽기
  const existingLocales = await readExistingLocales(targetPath);
  const existingKeys = new Set(Object.keys(existingLocales));

  // 텍스트를 i18n 키와 값으로 변환
  const localeEntries: LocaleEntry[] = [];
  const usedKeys = new Set<string>(); // 중복 키 방지
  const skippedKeys: string[] = []; // 건너뛴 키들
  const newKeys: string[] = []; // 새로 추가된 키들

  for (const text of texts) {
    const variableInfo = extractVariables(text);
    let key: string;
    let value: string;

    if (variableInfo.variables.length === 0) {
      // 변수가 없는 경우
      key = convertToI18nKey(text);
      value = text;
    } else {
      // 변수가 있는 경우 - 키는 템플릿 기반, 값은 i18n 키 형식으로 변환
      key = convertToI18nKey(variableInfo.template);
      // 변수를 i18n 키 형식으로 변환 ({{ }} 형태를 {숫자} 형태로)
      let i18nValue = text;
      let index = 0;

      // ${} 형태 변수를 {숫자} 형태로 변환
      i18nValue = i18nValue.replace(/\$\{\s*([^}]+)\s*\}/g, () => `{${index++}}`);

      // {{}} 형태 변수를 {숫자} 형태로 변환
      i18nValue = i18nValue.replace(/\{\{\s*([^}]+)\s*\}\}/g, () => `{${index++}}`);

      value = i18nValue;
    }

    // 중복 키가 있는지 확인
    if (existingKeys.has(key)) {
      skippedKeys.push(key);
      continue; // 중복 키는 건너뛰기
    }

    // 중복 키 처리 - 같은 텍스트는 같은 키 사용
    if (usedKeys.has(key)) {
      skippedKeys.push(key);
      continue; // 이미 처리된 키는 건너뛰기
    }
    usedKeys.add(key);
    newKeys.push(key);

    localeEntries.push({
      key: key,
      value: value,
      variables: variableInfo.variables.length > 0 ? variableInfo.variables : undefined,
    });
  }

  // 기존 locales와 새로운 locales 병합
  const mergedLocales = { ...existingLocales };
  localeEntries.forEach((entry) => {
    mergedLocales[entry.key] = entry.value;
  });

  // JSON 파일로 저장
  try {
    const jsonContent = JSON.stringify(mergedLocales, null, 2);
    await vscode.workspace.fs.writeFile(vscode.Uri.file(targetPath), new TextEncoder().encode(jsonContent));

    const languageName = getLanguageName(language);
    const fileName = targetPath.split(/[\\/]/).pop(); // 파일명만 추출

    // 결과 메시지 구성
    let message = `${languageName} locales 파일이 업데이트되었습니다: ${fileName}\n`;
    message += `새로 추가된 항목: ${newKeys.length}개\n`;
    if (skippedKeys.length > 0) {
      message += `중복 키로 인해 건너뛴 항목: ${skippedKeys.length}개`;
    }

    if (showNotifications) {
      vscode.window.showInformationMessage(message);

      // 건너뛴 키가 있으면 상세 정보 표시
      if (skippedKeys.length > 0) {
        const showDetails = await vscode.window.showInformationMessage(
          `${skippedKeys.length}개의 중복 키가 건너뛰어졌습니다. 상세 정보를 보시겠습니까?`,
          '상세 보기',
          '닫기',
        );

        if (showDetails === '상세 보기') {
          const skippedKeysText = skippedKeys.join('\n');
          const doc = await vscode.workspace.openTextDocument({
            content: `건너뛴 키 목록:\n\n${skippedKeysText}`,
            language: 'plaintext',
          });
          await vscode.window.showTextDocument(doc);
        }
      }

      // 생성된 파일을 에디터에서 열기
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(targetPath));
      await vscode.window.showTextDocument(document);
    }
  } catch (error: any) {
    vscode.window.showErrorMessage(`파일 생성 중 오류가 발생했습니다: ${error.message}`);
  }
}

// 언어 코드를 언어명으로 변환하는 헬퍼 함수
function getLanguageName(languageCode: string): string {
  const languageMap: { [key: string]: string } = {
    ko: '한국어',
    en: '영어',
    ja: '일본어',
    zh: '중국어',
    es: '스페인어',
    fr: '프랑스어',
    de: '독일어',
    ru: '러시아어',
  };

  return languageMap[languageCode] || languageCode.toUpperCase();
}

// locales.json 생성 명령어를 위한 헬퍼 함수 (기존 함수 수정)
export async function showLocalesGenerationDialog(texts: string[], language: string = 'ko'): Promise<void> {
  if (texts.length === 0) {
    vscode.window.showInformationMessage('생성할 한글 텍스트가 없습니다.');
    return;
  }

  // 언어 선택 다이얼로그 표시
  await showLanguageSelectionDialog(texts);
}

// 번역 서비스 선택 다이얼로그 (DeepL만 지원)
export async function showTranslationServiceDialog(texts: string[], language: string): Promise<void> {
  const config = vscode.workspace.getConfiguration('i18nManager.translation');
  const deeplKey = config.get<string>('deeplApiKey', '');

  if (!deeplKey) {
    // API 키가 없는 경우 설정 안내
    const result = await vscode.window.showWarningMessage(
      'DeepL API 키가 설정되지 않았습니다. 설정하시겠습니까?',
      '설정 열기',
      '취소',
    );

    if (result === '설정 열기') {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'i18nManager.translation');
    }
    return;
  }

  // DeepL로 번역 실행
  await generateLocalesWithDeepL(texts, language);
}

// 번역된 텍스트로 locales 파일 생성
async function generateLocalesJsonWithTranslatedTexts(
  originalTexts: string[],
  translatedTexts: string[],
  language: string,
  outputPath?: string,
  showNotifications: boolean = true, // 알림 표시 여부 제어
): Promise<void> {
  if (originalTexts.length === 0) {
    if (showNotifications) {
      vscode.window.showInformationMessage('생성할 한글 텍스트가 없습니다.');
    }
    return;
  }

  // 출력 경로가 지정되지 않은 경우 기본 경로 사용
  let targetPath = outputPath;
  if (!targetPath) {
    const config = vscode.workspace.getConfiguration('i18nManager.locales');
    const customPath = config.get<string>('outputPath', '');

    if (customPath) {
      // 사용자가 지정한 경로가 있으면 그곳에 저장
      const projectRoot = getProjectRoot();
      const resolvedPath = path.resolve(projectRoot, customPath);
      const fileName = `locales.${language}.json`;
      targetPath = path.join(resolvedPath, fileName);
    } else {
      // 기본은 프로젝트 루트에 저장
      const projectRoot = getProjectRoot();
      const fileName = `locales.${language}.json`;
      targetPath = path.join(projectRoot, fileName);
    }
  }

  // 기존 파일 읽기
  const existingLocales = await readExistingLocales(targetPath);
  const existingKeys = new Set(Object.keys(existingLocales));

  // 텍스트를 i18n 키와 값으로 변환
  const localeEntries: LocaleEntry[] = [];
  const usedKeys = new Set<string>(); // 중복 키 방지
  const skippedKeys: string[] = []; // 건너뛴 키들
  const newKeys: string[] = []; // 새로 추가된 키들

  for (let i = 0; i < originalTexts.length; i++) {
    const originalText = originalTexts[i];
    const translatedText = translatedTexts[i];

    const variableInfo = extractVariables(originalText);
    let key: string;
    let value: string;

    if (variableInfo.variables.length === 0) {
      // 변수가 없는 경우
      key = convertToI18nKey(originalText);
      value = translatedText;
    } else {
      // 변수가 있는 경우 - 키는 템플릿 기반, 값은 i18n 키 형식으로 변환
      key = convertToI18nKey(variableInfo.template);
      // 변수를 i18n 키 형식으로 변환 ({{ }} 형태를 {숫자} 형태로)
      let i18nValue = translatedText;
      let index = 0;

      // ${} 형태 변수를 {숫자} 형태로 변환
      i18nValue = i18nValue.replace(/\$\{\s*([^}]+)\s*\}/g, () => `{${index++}}`);

      // {{}} 형태 변수를 {숫자} 형태로 변환
      i18nValue = i18nValue.replace(/\{\{\s*([^}]+)\s*\}\}/g, () => `{${index++}}`);

      value = i18nValue;
    }

    // 중복 키가 있는지 확인
    if (existingKeys.has(key)) {
      skippedKeys.push(key);
      continue; // 중복 키는 건너뛰기
    }

    // 중복 키 처리 - 같은 텍스트는 같은 키 사용
    if (usedKeys.has(key)) {
      skippedKeys.push(key);
      continue; // 이미 처리된 키는 건너뛰기
    }
    usedKeys.add(key);
    newKeys.push(key);

    localeEntries.push({
      key: key,
      value: value,
      variables: variableInfo.variables.length > 0 ? variableInfo.variables : undefined,
    });
  }

  // 기존 locales와 새로운 locales 병합
  const mergedLocales = { ...existingLocales };
  localeEntries.forEach((entry) => {
    mergedLocales[entry.key] = entry.value;
  });

  // JSON 파일로 저장
  try {
    const jsonContent = JSON.stringify(mergedLocales, null, 2);
    await vscode.workspace.fs.writeFile(vscode.Uri.file(targetPath), new TextEncoder().encode(jsonContent));

    const languageName = getLanguageName(language);
    const fileName = targetPath.split(/[\\/]/).pop(); // 파일명만 추출

    // 결과 메시지 구성
    let message = `${languageName} locales 파일이 업데이트되었습니다: ${fileName}\n`;
    message += `새로 추가된 항목: ${newKeys.length}개\n`;
    if (skippedKeys.length > 0) {
      message += `중복 키로 인해 건너뛴 항목: ${skippedKeys.length}개`;
    }

    if (showNotifications) {
      vscode.window.showInformationMessage(message);

      // 건너뛴 키가 있으면 상세 정보 표시
      if (skippedKeys.length > 0) {
        const showDetails = await vscode.window.showInformationMessage(
          `${skippedKeys.length}개의 중복 키가 건너뛰어졌습니다. 상세 정보를 보시겠습니까?`,
          '상세 보기',
          '닫기',
        );

        if (showDetails === '상세 보기') {
          const skippedKeysText = skippedKeys.join('\n');
          const doc = await vscode.workspace.openTextDocument({
            content: `건너뛴 키 목록:\n\n${skippedKeysText}`,
            language: 'plaintext',
          });
          await vscode.window.showTextDocument(doc);
        }
      }

      // 생성된 파일을 에디터에서 열기
      const document = await vscode.workspace.openTextDocument(vscode.Uri.file(targetPath));
      await vscode.window.showTextDocument(document);
    }
  } catch (error: any) {
    vscode.window.showErrorMessage(`파일 생성 중 오류가 발생했습니다: ${error.message}`);
  }
}

// 언어 선택 다이얼로그 함수 (설정 기반 언어 지원)
export async function showLanguageSelectionDialog(texts: string[]): Promise<void> {
  if (texts.length === 0) {
    vscode.window.showInformationMessage('생성할 한글 텍스트가 없습니다.');
    return;
  }

  // 지원하는 언어 목록
  const supportedLanguages = [
    {
      code: 'ko',
      name: '한국어',
      flag: '🇰🇷',
      description: '원본 한국어 텍스트',
    },
    { code: 'en', name: '영어', flag: '🇺🇸', description: 'DeepL로 번역' },
    { code: 'zh', name: '중국어', flag: '🇨🇳', description: 'DeepL로 번역' },
    { code: 'ja', name: '일본어', flag: '🇯🇵', description: 'DeepL로 번역' },
  ];

  // 설정에서 활성화된 언어들 가져오기
  const config = vscode.workspace.getConfiguration('i18nManager.locales');
  const enabledLanguages = config.get<string[]>('enabledLanguages', ['ko', 'en', 'ja']);

  // 활성화된 언어들만 필터링
  const activeLanguages = supportedLanguages.filter((lang) => enabledLanguages.includes(lang.code));

  // 사용자에게 언어 선택하게 함
  const quickPick = vscode.window.createQuickPick();
  quickPick.items = [
    // 활성화된 언어들
    ...activeLanguages.map(
      (lang) =>
        ({
          label: `${lang.flag} ${lang.name} (${lang.code})`,
          description: `${lang.description}으로 locales.${lang.code}.json 생성`,
          detail: lang.code === 'ko' ? '한국어 텍스트를 그대로 사용' : 'DeepL API를 사용하여 번역',
          language: lang.code,
        } as any),
    ),

    // 전체 언어 옵션 (활성화된 언어가 2개 이상일 때만 표시)
    ...(activeLanguages.length > 1
      ? [
          {
            label: '🌍 전체 언어',
            description: `모든 활성화된 언어로 locales 파일들을 한번에 생성`,
            detail: `${activeLanguages.map((l) => l.name).join(', ')} 파일을 모두 생성합니다`,
            language: 'all',
          } as any,
        ]
      : []),

    // 설정 옵션
    {
      label: '⚙️ 언어 설정',
      description: '활성화할 언어들을 선택하세요',
      detail: '한국어, 영어, 중국어, 일본어 중에서 원하는 언어들을 선택할 수 있습니다',
      language: 'settings',
    } as any,
  ];

  quickPick.title = '언어 선택';
  quickPick.placeholder = '생성할 locales 파일의 언어를 선택하세요';

  quickPick.onDidChangeSelection(async (selection) => {
    quickPick.hide();

    if (selection.length > 0) {
      const selectedLanguage = (selection[0] as any).language;

      if (selectedLanguage === 'settings') {
        // 설정 페이지 열기
        await vscode.commands.executeCommand('workbench.action.openSettings', 'i18nManager.locales.enabledLanguages');
        return;
      }

      if (selectedLanguage === 'all') {
        // 전체 언어 생성 (활성화된 언어들)
        const allLanguages = activeLanguages.map((lang) => lang.code);
        await generateAllLanguages(texts, allLanguages);
      } else if (selectedLanguage === 'ko') {
        // 한국어는 바로 생성
        await generateLocalesJson(texts, selectedLanguage);
      } else {
        // 다른 언어는 DeepL로 번역 후 생성
        await generateLocalesWithDeepL(texts, selectedLanguage);
      }
    }
  });

  quickPick.show();
}

// DeepL로 번역과 함께 locales 파일 생성
async function generateLocalesWithDeepL(texts: string[], language: string): Promise<void> {
  const config = vscode.workspace.getConfiguration('i18nManager.translation');
  const apiKey = config.get<string>('deeplApiKey', '');

  if (!apiKey) {
    const result = await vscode.window.showWarningMessage(
      'DeepL API 키가 설정되지 않았습니다. 설정하시겠습니까?',
      '설정 열기',
      '취소',
    );

    if (result === '설정 열기') {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'i18nManager.translation');
    }
    return;
  }

  try {
    // 진행 상황 표시
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `${getLanguageName(language)} 번역 중...`,
        cancellable: false,
      },
      async (progress) => {
        // 1단계: 번역 준비
        progress.report({
          message: '번역 준비 중...',
          increment: 10,
        });

        // 2단계: DeepL API 호출
        progress.report({
          message: `DeepL API로 ${texts.length}개 텍스트 번역 중...`,
          increment: 20,
        });

        const translatedTexts = await translateTexts(texts, language, 'deepl', apiKey);

        // 3단계: 번역 완료
        progress.report({
          message: '번역 완료! locales 파일 생성 중...',
          increment: 30,
        });

        // 번역된 텍스트로 locales 파일 생성
        await generateLocalesJsonWithTranslatedTexts(texts, translatedTexts, language);

        // 4단계: 완료
        progress.report({
          message: '완료!',
          increment: 40,
        });
      },
    );
  } catch (error: any) {
    vscode.window.showErrorMessage(`번역 중 오류가 발생했습니다: ${error.message}`);
  }
}

// 모든 언어로 locales 파일 생성하는 함수
async function generateAllLanguages(texts: string[], languages?: string[]): Promise<void> {
  // 언어 목록이 제공되지 않으면 설정에서 활성화된 언어들 사용
  if (!languages) {
    const config = vscode.workspace.getConfiguration('i18nManager.locales');
    languages = config.get<string[]>('enabledLanguages', ['ko', 'en', 'ja']);
  }

  const config = vscode.workspace.getConfiguration('i18nManager.translation');
  const deeplKey = config.get<string>('deeplApiKey', '');

  // 번역이 필요한 언어가 있는지 확인
  const needsTranslation = languages.some((lang) => lang !== 'ko');

  if (needsTranslation && !deeplKey) {
    const result = await vscode.window.showWarningMessage(
      '번역이 필요한 언어가 포함되어 있습니다. DeepL API 키가 필요합니다. 설정하시겠습니까?',
      '설정 열기',
      '한국어만 생성',
      '취소',
    );

    if (result === '설정 열기') {
      await vscode.commands.executeCommand('workbench.action.openSettings', 'i18nManager.translation');
      // 설정 후 다시 확인
      const newConfig = vscode.workspace.getConfiguration('i18nManager.translation');
      const newApiKey = newConfig.get<string>('deeplApiKey', '');

      if (newApiKey) {
        // API 키가 설정되었으면 모든 언어로 생성
        await generateAllLanguagesWithDeepL(texts, languages);
      } else {
        // 여전히 API 키가 없으면 한국어만 생성
        await generateLocalesJson(texts, 'ko');
        vscode.window.showInformationMessage('한국어 파일만 생성되었습니다.');
      }
    } else if (result === '한국어만 생성') {
      await generateLocalesJson(texts, 'ko');
      vscode.window.showInformationMessage('한국어 파일이 생성되었습니다.');
    }
    return;
  }

  // DeepL로 모든 언어 생성
  await generateAllLanguagesWithDeepL(texts, languages);
}

// DeepL로 모든 언어 생성하는 별도 함수
async function generateAllLanguagesWithDeepL(texts: string[], languages: string[]): Promise<void> {
  let successCount = 0;
  let totalCount = languages.length;

  try {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `${languages.length}개 언어로 locales 파일 생성 중...`,
        cancellable: false,
      },
      async (progress) => {
        for (let i = 0; i < languages.length; i++) {
          const language = languages[i];
          const languageName = getLanguageName(language);
          const currentProgress = (i / languages.length) * 100;

          progress.report({
            message: `${languageName} 처리 중... (${i + 1}/${languages.length})`,
            increment: 100 / languages.length,
          });

          try {
            if (language === 'ko') {
              // 한국어는 원본 텍스트 그대로 (알림 비활성화)
              progress.report({
                message: `${languageName} 파일 생성 중...`,
                increment: 0,
              });
              await generateLocalesJson(texts, language, undefined, false);
            } else {
              // 다른 언어는 DeepL로 번역
              progress.report({
                message: `${languageName} 번역 중...`,
                increment: 0,
              });

              const config = vscode.workspace.getConfiguration('i18nManager.translation');
              const apiKey = config.get<string>('deeplApiKey', '');

              // 번역 진행 상황을 더 자세히 표시
              const translatedTexts = await translateTextsWithProgress(
                texts,
                language,
                'deepl',
                apiKey,
                (translationProgress) => {
                  progress.report({
                    message: `${languageName} 번역 중... (${translationProgress.current}/${translationProgress.total})`,
                    increment: 0,
                  });
                },
              );

              progress.report({
                message: `${languageName} 파일 생성 중...`,
                increment: 0,
              });

              // 알림 비활성화
              await generateLocalesJsonWithTranslatedTexts(texts, translatedTexts, language, undefined, false);
            }
            successCount++;
          } catch (error: any) {
            console.error(`${language} 파일 생성 실패:`, error);
            progress.report({
              message: `${languageName} 처리 실패`,
              increment: 0,
            });
          }
        }
      },
    );

    if (successCount === totalCount) {
      const languageNames = languages.map((lang) => getLanguageName(lang)).join(', ');
      vscode.window.showInformationMessage(`모든 언어로 locales 파일이 성공적으로 생성되었습니다: ${languageNames}`);
    } else {
      vscode.window.showWarningMessage(`일부 언어 파일 생성에 실패했습니다. (${successCount}/${totalCount})`);
    }
  } catch (error: any) {
    vscode.window.showErrorMessage(`파일 생성 중 오류가 발생했습니다: ${error.message}`);
  }
}

// 진행 상황 콜백을 지원하는 번역 함수
async function translateTextsWithProgress(
  texts: string[],
  targetLanguage: string,
  service: string,
  apiKey: string,
  progressCallback?: (progress: { current: number; total: number }) => void,
): Promise<string[]> {
  // translator.ts의 translateTexts 함수를 호출하되, 진행 상황을 추적
  const translatedTexts: string[] = [];

  for (let i = 0; i < texts.length; i++) {
    if (progressCallback) {
      progressCallback({ current: i + 1, total: texts.length });
    }

    // 개별 텍스트 번역 (translator.ts의 함수 사용)
    const translatedText = await translateSingleText(texts[i], targetLanguage, service, apiKey);
    translatedTexts.push(translatedText);
  }

  return translatedTexts;
}

// 단일 텍스트 번역 함수 (translator.ts에서 가져와야 함)
async function translateSingleText(
  text: string,
  targetLanguage: string,
  service: string,
  apiKey: string,
): Promise<string> {
  // translator.ts의 translateTexts 함수를 단일 텍스트용으로 래핑
  const result = await translateTexts([text], targetLanguage, service, apiKey);
  return result[0];
}
