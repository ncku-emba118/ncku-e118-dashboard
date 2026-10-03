// Remote pages may have the Capacitor bridge, or only the shell's custom UA.
export function isNativeApp(): boolean {
  if (typeof window === 'undefined') return false;
  const capacitor = (window as Window & { Capacitor?: { isNativePlatform?: () => boolean; getPlatform?: () => string } }).Capacitor;
  try {
    if (capacitor?.isNativePlatform?.()) return true;
    const platform = capacitor?.getPlatform?.();
    if (platform === 'ios' || platform === 'android') return true;
  } catch { /* use the existing shell UA fallback */ }
  return /NCKU-E118-App/.test(navigator.userAgent);
}
