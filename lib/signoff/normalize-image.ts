/**
 * 上傳前把影像方向烙進像素（瀏覽器端）。
 *
 * 手機拍的 JPEG 多半把方向記在 EXIF orientation，像素本身是橫躺的。
 * 瀏覽器 <img> 會自動套用 EXIF 所以網頁上看起來正常，但 pdf-lib 的
 * embedJpg 不讀 EXIF —— 合成出來的最終簽核 PDF 會整張倒下來。
 *
 * 因此一律先用 canvas 以 imageOrientation:'from-image' 重繪（並套用使用者
 * 手動旋轉），輸出的檔案不再依賴 EXIF，網頁與 PDF 才會一致。
 *
 * 非影像（PDF）原樣回傳；瀏覽器不支援時退回原檔，不擋住上傳流程。
 */
export async function normalizeImageOrientation(file: File, rotateDeg = 0): Promise<File> {
  if (!file.type.startsWith('image/')) return file;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    const swap = rotateDeg % 180 !== 0;
    const canvas = document.createElement('canvas');
    canvas.width = swap ? bitmap.height : bitmap.width;
    canvas.height = swap ? bitmap.width : bitmap.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotateDeg * Math.PI) / 180);
    ctx.drawImage(bitmap, -bitmap.width / 2, -bitmap.height / 2);
    bitmap.close();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, file.type, 0.92));
    if (!blob) return file;
    return new File([blob], file.name, { type: file.type });
  } catch {
    return file;
  }
}
