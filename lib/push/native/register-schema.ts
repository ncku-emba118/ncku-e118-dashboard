/** POST /api/native-push-register 的請求驗證（純函式，可單測） */
import { z } from 'zod';
import type { NativeApp } from './types';

/** App 識別：用 bundle id / package name（前端取自 capacitor.config 的 appId），後端轉成內部 app 代碼 */
export const BUNDLE_TO_APP: Record<string, NativeApp> = {
  'com.aqualux.e118emba': 'e118emba',
  'com.aqualux.e118slc': 'e118slc',
};

const IOS_TOKEN_RE = /^[0-9a-fA-F]{32,200}$/;
const ANDROID_TOKEN_RE = /^[A-Za-z0-9_:.\-]{20,4096}$/;

export const nativeRegisterSchema = z
  .object({
    action: z.enum(['register', 'disable']).default('register'),
    app: z.enum(['com.aqualux.e118emba', 'com.aqualux.e118slc']),
    platform: z.enum(['ios', 'android']),
    token: z.string().min(20).max(4096),
    app_version: z
      .string()
      .max(32)
      .regex(/^[0-9A-Za-z._\-+]*$/)
      .optional(),
    management_token: z.string().min(32).max(128),
  })
  .superRefine((v, ctx) => {
    const re = v.platform === 'ios' ? IOS_TOKEN_RE : ANDROID_TOKEN_RE;
    if (!re.test(v.token)) {
      ctx.addIssue({ code: 'custom', path: ['token'], message: 'token 格式不符該平台' });
    }
  });

export type NativeRegisterInput = z.infer<typeof nativeRegisterSchema>;
