import 'server-only';
import QRCode from 'qrcode';

/** PNG data URL, large enough to print on a visiting card or standee. */
export function qrDataUrl(url: string): Promise<string> {
  return QRCode.toDataURL(url, { width: 800, margin: 2, errorCorrectionLevel: 'M', color: { dark: '#231F20', light: '#FFFFFF' } });
}
