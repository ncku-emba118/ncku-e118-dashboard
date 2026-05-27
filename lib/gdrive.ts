/**
 * Google Drive URL parsing + safe embed helpers.
 *
 * 對應 ARCHITECTURE.md v3 第 9 章「Google Drive 附件嵌入」+ Codex Sec F8：
 *   • URL 嚴格白名單 regex（host 必須 drive.google.com / docs.google.com）
 *   • file ID 限 [A-Za-z0-9_-]{20,60}
 *   • iframe sandbox + referrerpolicy="no-referrer"
 *   • 每篇公告附件上限 10 個（由 zod schema enforce）
 */

export type GdriveType =
  | 'file'
  | 'folder'
  | 'document'
  | 'spreadsheet'
  | 'presentation';

export type GdriveAttachment = {
  name: string;
  gdrive_id: string;
  type: GdriveType;
};

const PATTERNS: Array<{ re: RegExp; type: GdriveType }> = [
  // drive.google.com
  { re: /^https:\/\/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]{20,60})(?:\/|$|\?)/, type: 'file' },
  { re: /^https:\/\/drive\.google\.com\/open\?(?:.*&)?id=([A-Za-z0-9_-]{20,60})/, type: 'file' },
  { re: /^https:\/\/drive\.google\.com\/drive\/folders\/([A-Za-z0-9_-]{20,60})/, type: 'folder' },
  // docs.google.com
  { re: /^https:\/\/docs\.google\.com\/document\/d\/([A-Za-z0-9_-]{20,60})/, type: 'document' },
  { re: /^https:\/\/docs\.google\.com\/spreadsheets\/d\/([A-Za-z0-9_-]{20,60})/, type: 'spreadsheet' },
  { re: /^https:\/\/docs\.google\.com\/presentation\/d\/([A-Za-z0-9_-]{20,60})/, type: 'presentation' },
];

/** Parse Google Drive URL → attachment metadata or null（rejection 顯著比 silent error 安全） */
export function parseGdriveUrl(
  url: string,
): Omit<GdriveAttachment, 'name'> | null {
  const trimmed = url.trim();
  for (const { re, type } of PATTERNS) {
    const m = trimmed.match(re);
    if (m) return { gdrive_id: m[1], type };
  }
  return null;
}

export function embedUrl(att: Pick<GdriveAttachment, 'gdrive_id' | 'type'>): string {
  const { gdrive_id, type } = att;
  switch (type) {
    case 'document':
      return `https://docs.google.com/document/d/${gdrive_id}/preview`;
    case 'spreadsheet':
      return `https://docs.google.com/spreadsheets/d/${gdrive_id}/preview`;
    case 'presentation':
      return `https://docs.google.com/presentation/d/${gdrive_id}/preview`;
    case 'folder':
      return '';
    case 'file':
    default:
      return `https://drive.google.com/file/d/${gdrive_id}/preview`;
  }
}

export function viewUrl(att: Pick<GdriveAttachment, 'gdrive_id' | 'type'>): string {
  const { gdrive_id, type } = att;
  switch (type) {
    case 'document':
      return `https://docs.google.com/document/d/${gdrive_id}/view`;
    case 'spreadsheet':
      return `https://docs.google.com/spreadsheets/d/${gdrive_id}/view`;
    case 'presentation':
      return `https://docs.google.com/presentation/d/${gdrive_id}/view`;
    case 'folder':
      return `https://drive.google.com/drive/folders/${gdrive_id}`;
    case 'file':
    default:
      return `https://drive.google.com/file/d/${gdrive_id}/view`;
  }
}

export function isEmbeddable(type: GdriveType): boolean {
  return type !== 'folder';
}

const TYPE_LABELS: Record<GdriveType, string> = {
  file: 'Drive 檔案',
  folder: 'Drive 資料夾',
  document: 'Google 文件',
  spreadsheet: 'Google 試算表',
  presentation: 'Google 簡報',
};

export function typeLabel(type: GdriveType): string {
  return TYPE_LABELS[type] ?? type;
}

const TYPE_EMOJI: Record<GdriveType, string> = {
  file: '📎',
  folder: '📁',
  document: '📝',
  spreadsheet: '📊',
  presentation: '📑',
};

export function typeEmoji(type: GdriveType): string {
  return TYPE_EMOJI[type] ?? '📎';
}
