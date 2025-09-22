import * as vscode from 'vscode';
import { convertToI18nKey, extractVariables } from './text-conversion';
import { translateTexts } from './translation';
import * as path from 'path';
import type { FileType, LocaleEntry } from '../types';
import { getFileType, removeQuotes } from '../utils';

class LocalesGenerationService {
  // 프로젝트 루트 경로를 가져오는 헬퍼 함수
  private getProjectRoot(): string {
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
  private resolvePath(path: string): string {
    if (path.startsWith('./') || path.startsWith('../')) {
      // 상대 경로인 경우 프로젝트 루트 기준으로 절대 경로로 변환
      const projectRoot = this.getProjectRoot();
      const pathModule = require('path');
      return pathModule.resolve(projectRoot, path);
    }
    return path; // 이미 절대 경로인 경우
  }

  // 중첩된 JSON 객체를 평면화하는 헬퍼 메서드
  private flattenJson(obj: any, prefix: string = ''): { [key: string]: any } {
    const flattened: { [key: string]: any } = {};

    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        const newKey = prefix ? `${prefix}.${key}` : key;

        if (typeof obj[key] === 'object' && obj[key] !== null && !Array.isArray(obj[key])) {
          // 중첩된 객체인 경우 재귀적으로 평면화
          Object.assign(flattened, this.flattenJson(obj[key], newKey));
        } else {
          // 원시 값이거나 배열인 경우 그대로 저장
          flattened[newKey] = obj[key];
        }
      }
    }

    return flattened;
  }

  // 평면화된 객체를 중첩된 구조로 변환하는 헬퍼 메서드
  private unflattenJson(flattened: { [key: string]: any }): any {
    const result: any = {};

    for (const key in flattened) {
      const keys = key.split('.');
      let current = result;

      for (let i = 0; i < keys.length - 1; i++) {
        const currentKey = keys[i];
        if (!(currentKey in current)) {
          current[currentKey] = {};
        }
        current = current[currentKey];
      }

      current[keys[keys.length - 1]] = flattened[key];
    }

    return result;
  }

  // 기존 JSON 파일을 읽어오는 함수 (중첩 구조 지원)
  private async readExistingLocales(filePath: string): Promise<{ [key: string]: string }> {
    try {
      const fileContent = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath));
      const jsonString = new TextDecoder().decode(fileContent);
      const jsonData = JSON.parse(jsonString);

      // 중첩된 구조를 평면화하여 반환
      return this.flattenJson(jsonData);
    } catch (error) {
      // 파일이 없거나 파싱 오류인 경우 빈 객체 반환
      return {};
    }
  }

  // 언어 코드를 언어명으로 변환하는 헬퍼 함수
  private getLanguageName(languageCode: string): string {
    const languageMap: { [key: string]: string } = {
      ko: '한국어',
      en: '영어',
      ja: '일본어',
      zh: '중국어',
    };

    return languageMap[languageCode] || languageCode.toUpperCase();
  }

  // 공통 로케일 생성 로직을 처리하는 헬퍼 메서드
  private async processLocaleGeneration(
    fileType: FileType,
    originalTexts: string[],
    translatedTexts: string[] | null,
    language: string,
    outputPath?: string,
    showNotifications: boolean = true,
    namespace?: string,
  ): Promise<void> {
    if (originalTexts.length === 0) {
      if (showNotifications) {
        vscode.window.showInformationMessage('생성할 한글 텍스트가 없습니다.');
      }
      return;
    }

    // 출력 경로 설정
    const targetPath = await this.resolveOutputPath(outputPath, language);

    // 기존 파일 읽기
    const existingLocales = await this.readExistingLocales(targetPath);
    const existingKeys = new Set(Object.keys(existingLocales));

    // 텍스트를 i18n 키와 값으로 변환
    const { localeEntries, newKeys, skippedKeys } = await this.processTextsToLocaleEntries(
      fileType,
      originalTexts,
      translatedTexts,
      existingKeys,
      namespace,
    );

    // JSON 파일 저장 및 결과 처리
    await this.saveAndNotifyResults(
      targetPath,
      existingLocales,
      localeEntries,
      language,
      namespace,
      newKeys,
      skippedKeys,
      showNotifications,
    );
  }

  // 출력 경로를 해결하는 헬퍼 함수
  private async resolveOutputPath(outputPath: string | undefined, language: string): Promise<string> {
    if (outputPath) {
      return outputPath;
    }

    const config = vscode.workspace.getConfiguration('I18nSmartManager.locales');
    const customPath = config.get<string>('outputPath', '');

    if (customPath) {
      // 사용자가 지정한 경로가 있으면 그곳에 저장
      const resolvedPath = this.resolvePath(customPath);
      const fileName = `locales.${language}.json`;
      return path.join(resolvedPath, fileName);
    } else {
      // 기본은 프로젝트 루트에 저장
      const projectRoot = this.getProjectRoot();
      const fileName = `locales.${language}.json`;
      return path.join(projectRoot, fileName);
    }
  }

  // 텍스트를 로케일 엔트리로 변환하는 헬퍼 메서드
  private async processTextsToLocaleEntries(
    fileType: FileType,
    originalTexts: string[],
    translatedTexts: string[] | null,
    existingKeys: Set<string>,
    namespace?: string,
  ): Promise<{
    localeEntries: LocaleEntry[];
    newKeys: string[];
    skippedKeys: string[];
  }> {
    const localeEntries: LocaleEntry[] = [];
    const usedKeys = new Set<string>(); // 중복 키 방지
    const skippedKeys: string[] = []; // 건너뛴 키들
    const newKeys: string[] = []; // 새로 추가된 키들

    for (let i = 0; i < originalTexts.length; i++) {
      const originalText = originalTexts[i];
      const textToUse = translatedTexts ? translatedTexts[i] : originalText;

      const variableInfo = extractVariables(fileType, originalText);
      let key: string;
      let value: string;

      if (variableInfo.variables.length === 0) {
        // 변수가 없는 경우
        key = convertToI18nKey(originalText);
        value = translatedTexts ? textToUse : removeQuotes(originalText);
      } else {
        // 변수가 있는 경우 - 키는 템플릿 기반, 값은 i18n 키 형식으로 변환
        key = convertToI18nKey(variableInfo.template);

        let i18nValue = textToUse;
        let index = 0;

        if (fileType === 'vue') {
          i18nValue = i18nValue.replace(/\{\{\s*([^}]+)\s*\}\}/g, () => `{${index++}}`);
        } else if (fileType === 'tsx') {
          i18nValue = i18nValue.replace(/(?<!\$)\{\s*([^}]+)\s*\}/g, () => `{${index++}}`);
        }
        // ${} 형태 변수를 {숫자} 형태로 변환
        i18nValue = i18nValue.replace(/\$\{\s*([^}]+)\s*\}/g, () => `{${index++}}`);

        value = i18nValue;
      }

      // 네임스페이스가 있으면 키에 추가
      const fullKey = namespace ? `${namespace}.${key}` : key;

      // 중복 키가 있는지 확인
      if (existingKeys.has(fullKey) || usedKeys.has(fullKey)) {
        skippedKeys.push(fullKey);
        continue; // 중복 키는 건너뛰기
      }

      usedKeys.add(fullKey);
      newKeys.push(fullKey);

      localeEntries.push({
        key: fullKey,
        value: value,
        variables: variableInfo.variables.length > 0 ? variableInfo.variables : undefined,
      });
    }

    return { localeEntries, newKeys, skippedKeys };
  }

  // JSON 파일 저장 및 알림 처리를 담당하는 헬퍼 메서드
  private async saveAndNotifyResults(
    targetPath: string,
    existingLocales: { [key: string]: string },
    localeEntries: LocaleEntry[],
    language: string,
    namespace: string | undefined,
    newKeys: string[],
    skippedKeys: string[],
    showNotifications: boolean,
  ): Promise<void> {
    // 기존 locales와 새로운 locales 병합 (평면화된 형태로)
    const mergedLocales = { ...existingLocales };
    localeEntries.forEach((entry) => {
      mergedLocales[entry.key] = entry.value;
    });

    // 평면화된 객체를 중첩된 구조로 변환
    const nestedLocales = this.unflattenJson(mergedLocales);

    // JSON 파일로 저장
    try {
      const jsonContent = JSON.stringify(nestedLocales, null, 2);
      // JSON에서 value 부분 중복 백슬래시 방지
      const fixedJsonContent = jsonContent.replace(/:\s*"([^"]*(?:\\.[^"]*)*)"/g, (match, value) => {
        const fixedValue = value.replace(/\\\\/g, '\\');
        return `: "${fixedValue}"`;
      });
      // key 부분에서 백슬래시 3개 이상을 2개로 줄이기
      const finalJsonContent = fixedJsonContent.replace(/"([^"]*(?:\\.[^"]*)*)":/g, (match, key) => {
        const fixedKey = key.replace(/\\{3,}/g, '\\\\');
        return `"${fixedKey}":`;
      });

      await vscode.workspace.fs.writeFile(vscode.Uri.file(targetPath), new TextEncoder().encode(finalJsonContent));

      if (showNotifications) {
        await this.showSuccessNotification(targetPath, language, namespace, newKeys, skippedKeys);
      }
    } catch (error: any) {
      vscode.window.showErrorMessage(`파일 생성 중 오류가 발생했습니다: ${error.message}`);
    }
  }

  // 성공 알림을 표시하는 헬퍼 메서드
  private async showSuccessNotification(
    targetPath: string,
    language: string,
    namespace: string | undefined,
    newKeys: string[],
    skippedKeys: string[],
  ): Promise<void> {
    const languageName = this.getLanguageName(language);
    const fileName = targetPath.split(/[\\/]/).pop(); // 파일명만 추출
    const namespaceText = namespace ? ` (${namespace} 네임스페이스)` : ' (루트 레벨)';

    // 결과 메시지 구성
    let message = `${languageName} locales 파일이 업데이트되었습니다: ${fileName}${namespaceText}\n`;
    message += `새로 추가된 항목: ${newKeys.length}개\n`;
    if (skippedKeys.length > 0) {
      message += `중복 키로 인해 건너뛴 항목: ${skippedKeys.length}개`;
    }

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

  // locales.ko.json 파일 생성 함수
  private async generateLocalesJson(
    fileType: FileType,
    texts: string[],
    language: string = 'ko',
    outputPath?: string,
    showNotifications: boolean = true,
    namespace?: string,
  ): Promise<void> {
    await this.processLocaleGeneration(
      fileType,
      texts,
      null, // 번역된 텍스트 없음
      language,
      outputPath,
      showNotifications,
      namespace,
    );
  }

  // 번역된 텍스트로 locales 파일 생성
  private async generateLocalesJsonWithTranslatedTexts(
    fileType: FileType,
    originalTexts: string[],
    translatedTexts: string[],
    language: string,
    outputPath?: string,
    showNotifications: boolean = true,
    namespace?: string,
  ): Promise<void> {
    await this.processLocaleGeneration(
      fileType,
      originalTexts,
      translatedTexts, // 번역된 텍스트 사용
      language,
      outputPath,
      showNotifications,
      namespace,
    );
  }

  // 언어 선택 다이얼로그 함수 (설정 기반 언어 지원)
  private async showLanguageSelectionDialog(texts: string[]): Promise<void> {
    if (texts.length === 0) {
      vscode.window.showInformationMessage('생성할 한글 텍스트가 없습니다.');
      return;
    }

    const fileName = vscode.window.activeTextEditor?.document.fileName ?? '';
    const fileType = getFileType(fileName);
    if (!fileType) {
      vscode.window.showWarningMessage('파일 타입을 확인할 수 없습니다.');
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
    const config = vscode.workspace.getConfiguration('I18nSmartManager.locales');
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
          await vscode.commands.executeCommand(
            'workbench.action.openSettings',
            'I18nSmartManager.locales.enabledLanguages',
          );
          return;
        }

        // 언어 선택 후 네임스페이스 입력받기
        const namespace = await vscode.window.showInputBox({
          prompt: `네임스페이스 입력 (선택사항)\n`,
          placeHolder: 'common → common.안녕하세요 (빈 값이면 루트 레벨)',
          value: '',
          ignoreFocusOut: true,
        });

        if (namespace === undefined) {
          return; // 사용자가 취소한 경우
        }

        if (selectedLanguage === 'all') {
          // 전체 언어 생성 (활성화된 언어들)
          const allLanguages = activeLanguages.map((lang) => lang.code);
          await this.generateAllLanguages(fileType, texts, allLanguages, namespace);
        } else if (selectedLanguage === 'ko') {
          // 한국어는 바로 생성
          await this.generateLocalesJson(fileType, texts, selectedLanguage, undefined, true, namespace);
        } else {
          // 다른 언어는 DeepL로 번역 후 생성
          await this.generateLocalesWithDeepL(fileType, texts, selectedLanguage, namespace);
        }
      }
    });

    quickPick.show();
  }

  // DeepL로 번역과 함께 locales 파일 생성
  private async generateLocalesWithDeepL(
    fileType: FileType,
    texts: string[],
    language: string,
    namespace?: string,
  ): Promise<void> {
    const config = vscode.workspace.getConfiguration('I18nSmartManager.translation');
    const apiKey = config.get<string>('deeplApiKey', '');

    if (!apiKey) {
      const result = await vscode.window.showWarningMessage(
        'DeepL API 키가 설정되지 않았습니다. 설정하시겠습니까?',
        '설정 열기',
        '취소',
      );

      if (result === '설정 열기') {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'I18nSmartManager.translation');
      }
      return;
    }

    try {
      // 진행 상황 표시
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: `${this.getLanguageName(language)} 번역 중...`,
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
          await this.generateLocalesJsonWithTranslatedTexts(
            fileType,
            texts,
            translatedTexts,
            language,
            undefined,
            true,
            namespace,
          );

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
  private async generateAllLanguages(
    fileType: FileType,
    texts: string[],
    languages?: string[],
    namespace?: string,
  ): Promise<void> {
    // 언어 목록이 제공되지 않으면 설정에서 활성화된 언어들 사용
    if (!languages) {
      const config = vscode.workspace.getConfiguration('I18nSmartManager.locales');
      languages = config.get<string[]>('enabledLanguages', ['ko', 'en', 'ja']);
    }

    const config = vscode.workspace.getConfiguration('I18nSmartManager.translation');
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
        await vscode.commands.executeCommand('workbench.action.openSettings', 'I18nSmartManager.translation');
        // 설정 후 다시 확인
        const newConfig = vscode.workspace.getConfiguration('I18nSmartManager.translation');
        const newApiKey = newConfig.get<string>('deeplApiKey', '');

        if (newApiKey) {
          // API 키가 설정되었으면 모든 언어로 생성
          await this.generateAllLanguagesWithDeepL(fileType, texts, languages, namespace);
        } else {
          // 여전히 API 키가 없으면 한국어만 생성
          await this.generateLocalesJson(fileType, texts, 'ko', undefined, true, namespace);
          vscode.window.showInformationMessage('한국어 파일만 생성되었습니다.');
        }
      } else if (result === '한국어만 생성') {
        await this.generateLocalesJson(fileType, texts, 'ko', undefined, true, namespace);
        vscode.window.showInformationMessage('한국어 파일이 생성되었습니다.');
      }
      return;
    }

    // DeepL로 모든 언어 생성
    await this.generateAllLanguagesWithDeepL(fileType, texts, languages, namespace);
  }

  // DeepL로 모든 언어 생성하는 별도 함수
  private async generateAllLanguagesWithDeepL(
    fileType: FileType,
    texts: string[],
    languages: string[],
    namespace?: string,
  ): Promise<void> {
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
            const languageName = this.getLanguageName(language);
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
                await this.generateLocalesJson(fileType, texts, language, undefined, false, namespace);
              } else {
                // 다른 언어는 DeepL로 번역
                progress.report({
                  message: `${languageName} 번역 중...`,
                  increment: 0,
                });

                const config = vscode.workspace.getConfiguration('I18nSmartManager.translation');
                const apiKey = config.get<string>('deeplApiKey', '');

                // 번역 진행 상황을 더 자세히 표시
                const translatedTexts = await this.translateTextsWithProgress(
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
                await this.generateLocalesJsonWithTranslatedTexts(
                  fileType,
                  texts,
                  translatedTexts,
                  language,
                  undefined,
                  false,
                  namespace,
                );
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
        const languageNames = languages.map((lang) => this.getLanguageName(lang)).join(', ');
        vscode.window.showInformationMessage(`모든 언어로 locales 파일이 성공적으로 생성되었습니다: ${languageNames}`);
      } else {
        vscode.window.showWarningMessage(`일부 언어 파일 생성에 실패했습니다. (${successCount}/${totalCount})`);
      }
    } catch (error: any) {
      vscode.window.showErrorMessage(`파일 생성 중 오류가 발생했습니다: ${error.message}`);
    }
  }

  // 진행 상황 콜백을 지원하는 번역 함수
  private async translateTextsWithProgress(
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
      const translatedText = await this.translateSingleText(texts[i], targetLanguage, service, apiKey);
      translatedTexts.push(translatedText);
    }

    return translatedTexts;
  }

  // 단일 텍스트 번역 함수 (translator.ts에서 가져와야 함)
  private async translateSingleText(
    text: string,
    targetLanguage: string,
    service: string,
    apiKey: string,
  ): Promise<string> {
    // translator.ts의 translateTexts 함수를 단일 텍스트용으로 래핑
    const result = await translateTexts([text], targetLanguage, service, apiKey);
    return result[0];
  }

  // locales.json 생성 명령어를 위한 헬퍼 함수 (기존 함수 수정)
  public async showLocalesGenerationDialog(texts: string[], language: string = 'ko'): Promise<void> {
    if (texts.length === 0) {
      vscode.window.showInformationMessage('생성할 한글 텍스트가 없습니다.');
      return;
    }

    // 언어 선택 다이얼로그 표시
    await this.showLanguageSelectionDialog(texts);
  }
}

const service = new LocalesGenerationService();

export async function showLocalesGenerationDialog(texts: string[], language: string = 'ko'): Promise<void> {
  return service.showLocalesGenerationDialog(texts, language);
}
