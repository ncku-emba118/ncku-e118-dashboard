'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import Breadcrumb from '@/components/Breadcrumb';

/**
 * 班費區的雙外殼。
 *
 * 「預算說明書」是定稿文件（有版次、有 9 幹部簽核、不隨執行變動）；
 * 「執行與結算」是持續變動的帳（每場結算就更新）。兩者性質不同，
 * 共用一個掛版次的頁尾會讓讀者誤以為結算數字也停在該版日期。
 * 因此路由維持 /budget/* 不動（既有連結不壞），但依頁面性質切換
 * 標題、導覽與頁尾。
 */

/** 執行與結算區的路徑前綴；其餘 /budget/* 皆屬文件區 */
const EXEC_PREFIXES = ['/budget/tracking', '/budget/settlement', '/budget/north'];

const DOC_NAV = [
  { href: '/budget', label: '總覽' },
  { href: '/budget/activities', label: '活動明細' },
  { href: '/budget/reserves', label: '預備金' },
  { href: '/budget/rules', label: '申請規則' },
  { href: '/budget/changelog', label: '版本歷史' },
];

const EXEC_NAV = [
  { href: '/budget/tracking', label: '執行追蹤' },
  { href: '/budget/settlement', label: '結算機制' },
  { href: '/budget/north', label: '北班分攤' },
];

export default function BudgetShell({
  children,
  version,
  updatedAt,
  lastSettledAt,
}: {
  children: React.ReactNode;
  version: string;
  updatedAt: string;
  lastSettledAt: string | null;
}) {
  const pathname = usePathname() ?? '';
  const isExec = EXEC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  return (
    <div className="bdg-shell">
      <Breadcrumb
        items={[
          { label: '班級面板', href: '/' },
          { label: '班級經費中心', href: '/finance' },
          { label: isExec ? '執行與結算' : '預算說明書' },
        ]}
      />

      <header className="bdg-header">
        <div className="bdg-header-inner">
          <Link href={isExec ? '/budget/tracking' : '/budget'} className="bdg-brand">
            <span className="bdg-brand-name">NCKU EMBA · E118 South</span>
            <span className="bdg-brand-sub">{isExec ? '班費執行與結算' : `班費預算說明書 ${version}`}</span>
          </Link>

          <nav className="bdg-nav" aria-label={isExec ? '執行與結算導覽' : '預算說明書導覽'}>
            {(isExec ? EXEC_NAV : DOC_NAV).map((n) => (
              <Link key={n.href} href={n.href}>
                {n.label}
              </Link>
            ))}
            <span className="bdg-nav-sep" aria-hidden="true" />
            {isExec ? (
              <Link href="/budget">← 預算說明書</Link>
            ) : (
              <>
                <Link href="/budget/tracking">執行與結算 →</Link>
                <Link href="/budget/signoff" style={{ color: '#E0C896', fontWeight: 600 }}>
                  ✍️ 預算書簽核
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main className="bdg-main">{children}</main>

      <footer className="bdg-footer">
        {isExec ? (
          <>
            <div style={{ marginBottom: 6 }}>
              E118 南班秘書處 · 本區為實際執行與結算數字，每完成一場結算即更新
            </div>
            <div style={{ fontSize: 11.5 }}>
              {lastSettledAt ? (
                <>
                  最後結算 <strong style={{ color: '#6B1622' }}>{lastSettledAt}</strong> ·{' '}
                </>
              ) : (
                <>尚無已結算項目 · </>
              )}
              不隨預算書版次改版 ·{' '}
              <Link href="/budget" style={{ color: '#8B1F2F', textDecoration: 'underline' }}>
                查看預算說明書 {version}
              </Link>
            </div>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 6 }}>
              E118 南班秘書處 · 預算為估算值、實際以結算為準、結餘統一歸入班費總額
            </div>
            <div style={{ fontSize: 11.5 }}>
              當前版本 <strong style={{ color: '#6B1622' }}>{version}</strong> · 最後更新 {updatedAt} ·{' '}
              <Link href="/budget/changelog" style={{ color: '#8B1F2F', textDecoration: 'underline' }}>
                查看版本歷史
              </Link>
            </div>
          </>
        )}
      </footer>
    </div>
  );
}
