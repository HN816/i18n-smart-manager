import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import type { ServiceAccountCredentials } from 'google-spreadsheet';
import type { SpreadsheetConfig } from '../types';

class SpreadsheetService {
  private credentials: ServiceAccountCredentials;
  private config: SpreadsheetConfig;

  constructor(credentials: ServiceAccountCredentials, config: SpreadsheetConfig) {
    this.credentials = credentials;
    this.config = config;
  }

  // Google Spreadsheet 인스턴스 가져오기
  private async getGoogleSheet(): Promise<any> {
    const doc = new GoogleSpreadsheet(this.config.spreadsheetId);
    await doc.useServiceAccountAuth(this.credentials);
    await doc.loadInfo();
    return doc;
  }

  // 스프레드시트에서 데이터 읽기
  async readFromSpreadsheet(): Promise<any[][]> {
    try {
      const googleSheet = await this.getGoogleSheet();
      const sheet = googleSheet.sheetsByTitle[this.config.sheetName];

      if (!sheet) {
        throw new Error(`시트 '${this.config.sheetName}'을 찾을 수 없습니다.`);
      }

      const rows = await sheet.getRows({
        offset: 0,
        limit: sheet.rowCount,
      });

      // 헤더와 데이터를 2차원 배열로 변환
      const data: any[][] = [];

      // 헤더 추가
      if (sheet.headerValues.length > 0) {
        data.push(sheet.headerValues);
      }

      // 데이터 행 추가
      rows.forEach((row: any) => {
        const rowData: any[] = [];
        sheet.headerValues.forEach((header: any) => {
          rowData.push(row.get(header) || '');
        });
        data.push(rowData);
      });

      return data;
    } catch (error) {
      console.error('스프레드시트 읽기 오류:', error);
      throw error;
    }
  }

  // 스프레드시트에 데이터 쓰기
  private async writeToSpreadsheet(data: any[][]): Promise<void> {
    try {
      const googleSheet = await this.getGoogleSheet();
      let sheet = googleSheet.sheetsByTitle[this.config.sheetName];

      // 시트가 없으면 생성
      if (!sheet) {
        sheet = await googleSheet.addSheet({ title: this.config.sheetName });
      }

      // 기존 데이터 클리어
      await sheet.clear();

      // 헤더 설정
      if (data.length > 0) {
        await sheet.setHeaderRow(data[0]);

        // 데이터 행 추가
        if (data.length > 1) {
          const rows = data.slice(1);
          await sheet.addRows(rows);
        }
      }
    } catch (error) {
      console.error('스프레드시트 쓰기 오류:', error);
      throw error;
    }
  }

  // 스프레드시트 접근 가능 여부 확인
  async checkSpreadsheetAccess(): Promise<boolean> {
    try {
      await this.getGoogleSheet();
      return true;
    } catch (error) {
      console.error('스프레드시트 접근 확인 오류:', error);
      return false;
    }
  }

  // JSON 데이터를 스프레드시트 형식으로 변환
  private convertJsonToSheetData(jsonData: any, language: string): any[][] {
    const sheetData: any[][] = [];

    // 헤더 행 추가 (중국어 컬럼 추가)
    sheetData.push(['Key', 'Korean', 'English', 'Chinese', 'Japanese']);

    // 데이터 행 추가
    Object.entries(jsonData).forEach(([key, value]) => {
      const row = ['', '', '', '', '']; // 기본적으로 빈 값으로 초기화

      // 언어에 따라 해당 컬럼에 값 설정
      if (language === 'ko') {
        row[1] = value as string; // Korean 컬럼
      } else if (language === 'en') {
        row[2] = value as string; // English 컬럼
      } else if (language === 'zh') {
        row[3] = value as string; // Chinese 컬럼
      } else if (language === 'ja') {
        row[4] = value as string; // Japanese 컬럼
      }

      row[0] = key; // 키는 항상 첫 번째 컬럼
      sheetData.push(row);
    });

    return sheetData;
  }

  // 스프레드시트 업데이트 - 무조건 덮어쓰기
  private async updateSpreadsheet(data: any[][]): Promise<void> {
    try {
      // 기존 데이터 읽지 않고 바로 덮어쓰기
      await this.writeToSpreadsheet(data);
    } catch (error) {
      console.error('스프레드시트 업데이트 오류:', error);
      throw error;
    }
  }

  // 데이터 병합 함수
  private mergeData(existingData: any[][], newData: any[][], language: string): any[][] {
    const mergedData = [...existingData];
    const languageIndex = language === 'ko' ? 1 : language === 'en' ? 2 : language === 'zh' ? 3 : 4;

    // 새 데이터의 각 행을 기존 데이터와 병합
    newData.slice(1).forEach((newRow) => {
      // 헤더 제외
      const key = newRow[0];
      const value = newRow[languageIndex];

      // 기존 데이터에서 같은 키 찾기 (헤더 제외)
      const existingRowIndex = mergedData.findIndex((row, index) => index > 0 && row[0] === key);

      if (existingRowIndex > 0) {
        // 중복 키가 있으면 해당 언어 컬럼만 업데이트
        mergedData[existingRowIndex][languageIndex] = value;
      } else {
        // 새로운 키면 새 행 추가
        const newRowData = ['', '', '', '', '']; // 빈 값으로 초기화
        newRowData[0] = key; // 키 설정
        newRowData[languageIndex] = value; // 해당 언어 값 설정
        mergedData.push(newRowData);
      }
    });

    return mergedData;
  }

  // locales JSON 파일을 읽어서 스프레드시트에 업로드
  async uploadLocalesToSheet(localesFilePath: string, language: string): Promise<void> {
    try {
      // 스프레드시트 접근 가능 여부 확인
      const hasAccess = await this.checkSpreadsheetAccess();
      if (!hasAccess) {
        throw new Error(
          '스프레드시트에 접근할 수 없습니다. 스프레드시트 ID와 Service Account 인증 정보를 확인해주세요.',
        );
      }

      // JSON 파일 읽기
      const jsonData = JSON.parse(fs.readFileSync(localesFilePath, 'utf8'));

      // JSON 데이터를 스프레드시트 형식으로 변환
      const sheetData = this.convertJsonToSheetData(jsonData, language);

      // 스프레드시트에 데이터 업로드 (덮어쓰기)
      await this.updateSpreadsheet(sheetData);

      vscode.window.showInformationMessage(`✅ ${language} locales가 스프레드시트에 업로드되었습니다!`);
    } catch (error) {
      console.error('스프레드시트 업로드 오류:', error);
      vscode.window.showErrorMessage(
        `❌ 스프레드시트 업로드 실패: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // 여러 언어 파일을 합쳐서 스프레드시트에 업로드
  async uploadMultipleLocalesToSheet(localesFilePaths: string[]): Promise<void> {
    try {
      // 스프레드시트 접근 가능 여부 확인
      const hasAccess = await this.checkSpreadsheetAccess();
      if (!hasAccess) {
        throw new Error(
          '스프레드시트에 접근할 수 없습니다. 스프레드시트 ID와 Service Account 인증 정보를 확인해주세요.',
        );
      }

      // 모든 언어 데이터를 합치기
      const combinedData = this.combineMultipleLocales(localesFilePaths);

      // 스프레드시트에 데이터 업로드 (덮어쓰기)
      await this.updateSpreadsheet(combinedData);

      vscode.window.showInformationMessage(`✅ 모든 locales가 스프레드시트에 업로드되었습니다!`);
    } catch (error) {
      console.error('스프레드시트 업로드 오류:', error);
      vscode.window.showErrorMessage(
        `❌ 스프레드시트 업로드 실패: ${error instanceof Error ? error.message : 'Unknown error'}`,
      );
    }
  }

  // 여러 언어 파일의 데이터를 합치기
  private combineMultipleLocales(localesFilePaths: string[]): any[][] {
    const combinedData: any[][] = [];
    const allKeys = new Set<string>();
    const languageData: { [key: string]: { [language: string]: string } } = {};

    // 헤더 행 추가 (중국어 컬럼 추가)
    combinedData.push(['Key', 'Korean', 'English', 'Chinese', 'Japanese']);

    // 각 파일에서 데이터 읽기
    localesFilePaths.forEach((filePath) => {
      const fileName = path.basename(filePath);
      const language = fileName.match(/locales\.(\w+)\.json/)?.[1] || 'ko';

      try {
        const jsonData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        Object.entries(jsonData).forEach(([key, value]) => {
          allKeys.add(key);

          if (!languageData[key]) {
            languageData[key] = {};
          }
          languageData[key][language] = value as string;
        });
      } catch (error) {
        console.error(`파일 읽기 오류 (${filePath}):`, error);
      }
    });

    // 모든 키에 대해 행 생성
    allKeys.forEach((key) => {
      const row = ['', '', '', '', '']; // [Key, Korean, English, Chinese, Japanese]

      const data = languageData[key];
      if (data.ko) {
        row[1] = data.ko;
      }
      if (data.en) {
        row[2] = data.en;
      }
      if (data.zh) {
        row[3] = data.zh;
      }
      if (data.ja) {
        row[4] = data.ja;
      }

      row[0] = key; // 키는 항상 첫 번째 컬럼
      combinedData.push(row);
    });

    return combinedData;
  }
}

export async function uploadLocalesToSpreadsheet(): Promise<void> {
  try {
    // Service Account 인증 정보 확인
    const config = vscode.workspace.getConfiguration('i18nManager.spreadsheet');
    const credentials = config.get<ServiceAccountCredentials | null>('serviceAccountCredentials', null);
    const spreadsheetId = config.get<string>('spreadsheetId', '');

    if (!credentials) {
      const result = await vscode.window.showWarningMessage(
        'Service Account 인증 정보가 설정되지 않았습니다. 설정하시겠습니까?',
        '설정 열기',
        '취소',
      );

      if (result === '설정 열기') {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'i18nManager.spreadsheet');
      }
      return;
    }

    if (!spreadsheetId) {
      const result = await vscode.window.showWarningMessage(
        '스프레드시트 ID가 설정되지 않았습니다. 설정하시겠습니까?',
        '설정 열기',
        '취소',
      );

      if (result === '설정 열기') {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'i18nManager.spreadsheet');
      }
      return;
    }

    // 시트 이름만 입력받기
    const sheetName = await vscode.window.showInputBox({
      prompt: '시트 이름을 입력하세요',
      placeHolder: '예: Locales',
      value: 'Locales',
    });

    if (!sheetName) {
      return;
    }

    const spreadsheetConfig: SpreadsheetConfig = {
      spreadsheetId: spreadsheetId.trim(),
      sheetName: sheetName.trim(),
      keyColumn: 'A',
      valueColumn: 'B',
    };

    // 업로드할 locales 파일 선택
    const localesFiles = await vscode.window.showOpenDialog({
      canSelectFiles: true,
      canSelectMany: true,
      filters: {
        'JSON Files': ['json'],
      },
      title: '업로드할 locales 파일을 선택하세요 (여러 언어 파일 선택 가능)',
    });

    if (!localesFiles || localesFiles.length === 0) {
      return;
    }

    // 스프레드시트 서비스 생성
    const service = new SpreadsheetService(credentials, spreadsheetConfig);

    // 모든 파일을 한 번에 업로드
    await service.uploadMultipleLocalesToSheet(localesFiles.map((file) => file.fsPath));
  } catch (error) {
    console.error('스프레드시트 업로드 오류:', error);
    vscode.window.showErrorMessage(
      `❌ 스프레드시트 업로드 실패: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}
