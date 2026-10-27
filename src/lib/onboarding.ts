import { command, isNative } from './bridge';

export const ONBOARDING_VERSION = 3;
export interface PermissionStatus {
  platform: 'macos' | 'windows' | 'other';
  microphone: 'notDetermined' | 'authorized' | 'denied' | 'restricted' | 'unknown';
  accessibility: 'authorized' | 'denied' | 'notRequired' | 'unknown';
}
export const previewPermissions: PermissionStatus = { platform: 'other', microphone: 'unknown', accessibility: 'unknown' };
export async function getPermissions(): Promise<PermissionStatus> {
  return isNative ? command('get_permission_status') : previewPermissions;
}
export async function requestPermission(permission: 'microphone' | 'accessibility'): Promise<PermissionStatus> {
  return command(permission === 'microphone' ? 'request_microphone_permission' : 'request_accessibility_permission');
}
export async function openPermissionSettings(permission: 'microphone' | 'accessibility' | 'keyboard'): Promise<void> {
  return command('open_privacy_settings', { permission });
}
