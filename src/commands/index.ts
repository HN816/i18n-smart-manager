import * as vscode from 'vscode';
import { registerMonitoringCommands } from './monitoring';
import { registerTextManagementCommands } from './text-management';
import { registerConversionCommands } from './conversion';
import { registerLocalesCommands } from './locales';

export function registerAllCommands(context: vscode.ExtensionContext): void {
  // 모니터링 관련 커맨드 등록
  registerMonitoringCommands(context);

  // 텍스트 관리 커맨드 등록
  registerTextManagementCommands(context);

  // 변환 관련 커맨드 등록
  registerConversionCommands(context);

  // 로케일 관련 커맨드 등록
  registerLocalesCommands(context);
}
