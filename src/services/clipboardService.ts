import { sha256 } from '../crypto/vaultCrypto';
import { invariant } from '../lib/errors';

class ClipboardService {
  private timer?: ReturnType<typeof setTimeout>;
  private fingerprint?: string;
  private version = 0;

  async copy(value: string, report: (message: string) => void): Promise<void> {
    invariant(navigator.clipboard && window.isSecureContext, 'CLIPBOARD_UNAVAILABLE', 'Clipboard access requires HTTPS and browser permission.');
    const version = ++this.version;
    if (this.timer) clearTimeout(this.timer);
    await navigator.clipboard.writeText(value);
    const fingerprint = await sha256(value);
    if (version !== this.version) return;
    this.fingerprint = fingerprint;
    report('Copied. Clipboard clearing will be attempted in 30 seconds.');
    this.timer = setTimeout(() => { void this.clear(report); }, 30_000);
  }

  async clear(report?: (message: string) => void): Promise<void> {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    const fingerprint = this.fingerprint;
    const version = this.version;
    if (!fingerprint) return;
    try {
      const current = await navigator.clipboard.readText();
      if (version !== this.version) return;
      if (await sha256(current) === fingerprint && version === this.version) {
        await navigator.clipboard.writeText('');
        report?.('Clipboard cleared.');
      }
    } catch { report?.('Browser permissions prevented clipboard clearing. Clear the clipboard manually.'); }
    finally { if (version === this.version) this.fingerprint = undefined; }
  }
}
export const secureClipboard = new ClipboardService();
