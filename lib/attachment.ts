/**
 * 公告附件雙源 schema：GDrive URL paste vs Supabase Storage upload
 *
 * - source = 'gdrive':   舊資料 / user 手動貼 GDrive URL → iframe preview
 * - source = 'supabase': 新流程 / 從電腦選檔直傳到 Supabase Storage → 公開 URL
 *
 * DB JSONB 同欄位 `posts.attachments` 內可混存兩種類型；
 * 舊資料無 source 欄位的視為 'gdrive'（zod transform 加 default）。
 */
import { z } from 'zod';
import type { GdriveType } from './gdrive';

/** 共用：附件顯示名稱（不影響 storage 實際檔名） */
const NAME_FIELD = z.string().min(1).max(120);

/** GDrive 附件（既有設計） */
export const gdriveAttachmentSchema = z.object({
  source: z.literal('gdrive').default('gdrive'),
  name: NAME_FIELD,
  gdrive_id: z.string().regex(/^[A-Za-z0-9_-]{20,60}$/),
  type: z.enum(['file', 'folder', 'document', 'spreadsheet', 'presentation']),
});

/** Supabase Storage 上傳的附件 */
export const supabaseAttachmentSchema = z.object({
  source: z.literal('supabase'),
  name: NAME_FIELD,
  /** Storage 內部 path，e.g. "secretary/202605/abcdef.pdf" */
  storage_path: z.string().min(3).max(300).regex(/^[A-Za-z0-9._/-]+$/),
  /** 公開 URL — server 端 trust Supabase 回傳；client 不該自己組 */
  public_url: z.string().url().max(1000),
  /** MIME — 用於 client render 決定 inline image / iframe PDF / 下載連結 */
  mime: z.string().min(3).max(120),
  /** Bytes，未來統計用 */
  size: z.number().int().nonnegative(),
});

/**
 * Discriminated union — zod 看 source 欄位分流。
 *
 * 舊資料沒 source 欄位 → preprocess 補成 'gdrive'。
 * 這樣 DB 內既有 GDrive-only attachments 不需要 migration 也能通過驗證。
 */
export const attachmentSchema = z.preprocess(
  (val) => {
    if (
      val &&
      typeof val === 'object' &&
      !('source' in val) &&
      'gdrive_id' in val
    ) {
      return { ...val, source: 'gdrive' };
    }
    return val;
  },
  z.discriminatedUnion('source', [
    gdriveAttachmentSchema,
    supabaseAttachmentSchema,
  ]),
);

export type Attachment = z.infer<typeof attachmentSchema>;
export type GdriveAttachmentNew = z.infer<typeof gdriveAttachmentSchema>;
export type SupabaseAttachment = z.infer<typeof supabaseAttachmentSchema>;

/** 用於 zod array — `.attachments` 整欄 */
export const attachmentsArraySchema = z.array(attachmentSchema).max(10);

/**
 * 讀取端 helper — 把 DB JSONB 內 raw attachment array normalize 成 Attachment[]。
 *
 * - 舊資料：`{name, gdrive_id, type}` 無 source 欄位 → 補 source='gdrive'
 * - 新資料：`{source: 'supabase', ...}` 直接 pass through
 * - 不認得的形狀（防 DB 髒資料）→ 跳過
 *
 * 不跑 zod 全驗（讀取 hot path、為效能考量），只做最小型別 cast。
 * Server-side write path 已經有 zod 驗，DB 內資料可信任。
 */
export function normalizeAttachments(raw: unknown): Attachment[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item): Attachment[] => {
    if (!item || typeof item !== 'object') return [];
    const r = item as Record<string, unknown>;
    if (r.source === 'supabase') {
      if (
        typeof r.name === 'string' &&
        typeof r.storage_path === 'string' &&
        typeof r.public_url === 'string' &&
        typeof r.mime === 'string' &&
        typeof r.size === 'number'
      ) {
        return [
          {
            source: 'supabase',
            name: r.name,
            storage_path: r.storage_path,
            public_url: r.public_url,
            mime: r.mime,
            size: r.size,
          },
        ];
      }
      return [];
    }
    // legacy or explicit gdrive
    if (typeof r.gdrive_id === 'string' && typeof r.type === 'string') {
      return [
        {
          source: 'gdrive',
          name: typeof r.name === 'string' ? r.name : 'attachment',
          gdrive_id: r.gdrive_id,
          type: r.type as GdriveType,
        },
      ];
    }
    return [];
  });
}

/** Helper: 給 render 端 — 判斷類別 */
export function isImage(att: Attachment): boolean {
  return att.source === 'supabase' && att.mime.startsWith('image/');
}
export function isPdf(att: Attachment): boolean {
  return att.source === 'supabase' && att.mime === 'application/pdf';
}
export function isOfficeDoc(att: Attachment): boolean {
  return (
    att.source === 'supabase' &&
    (att.mime.includes('officedocument') ||
      att.mime.startsWith('application/msword') ||
      att.mime.startsWith('application/vnd.ms-'))
  );
}

/** 給 UI: 一句話的 friendly type label */
export function attachmentTypeLabel(att: Attachment): string {
  if (att.source === 'gdrive') {
    const labels: Record<GdriveType, string> = {
      file: 'Drive 檔案',
      folder: 'Drive 資料夾',
      document: 'Google 文件',
      spreadsheet: 'Google 試算表',
      presentation: 'Google 簡報',
    };
    return labels[att.type] ?? 'Drive 檔案';
  }
  // supabase
  if (isImage(att)) return '圖片';
  if (isPdf(att)) return 'PDF';
  if (att.mime.includes('wordprocessing') || att.mime === 'application/msword')
    return 'Word';
  if (att.mime.includes('spreadsheet') || att.mime === 'application/vnd.ms-excel')
    return 'Excel';
  if (att.mime.includes('presentation') || att.mime === 'application/vnd.ms-powerpoint')
    return 'PowerPoint';
  if (att.mime === 'text/plain') return '純文字';
  if (att.mime === 'text/csv') return 'CSV';
  return '檔案';
}

export function attachmentEmoji(att: Attachment): string {
  if (att.source === 'gdrive') {
    const emojis: Record<GdriveType, string> = {
      file: '📎',
      folder: '📁',
      document: '📝',
      spreadsheet: '📊',
      presentation: '📑',
    };
    return emojis[att.type] ?? '📎';
  }
  if (isImage(att)) return '🖼️';
  if (isPdf(att)) return '📄';
  if (att.mime.includes('wordprocessing') || att.mime === 'application/msword') return '📝';
  if (att.mime.includes('spreadsheet') || att.mime === 'application/vnd.ms-excel') return '📊';
  if (att.mime.includes('presentation') || att.mime === 'application/vnd.ms-powerpoint') return '📑';
  return '📎';
}

/** Bytes → human readable */
export function formatSize(bytes: number | undefined): string {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
