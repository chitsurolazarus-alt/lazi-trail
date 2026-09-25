/**
 * Progressive-web-app glue: registers the service worker (production only) and tracks whether the
 * browser will let us offer an "Install Lazi Trail" button. Chrome/Edge/Android fire
 * `beforeinstallprompt`; iOS Safari has no prompt, so it gets a how-to instead.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

type Listener = () => void;

class Pwa {
  private deferred: BeforeInstallPromptEvent | null = null;
  private installed = false;
  private readonly listeners = new Set<Listener>();

  /** True when running as an installed app (no browser chrome). */
  get standalone(): boolean {
    return (
      window.matchMedia?.('(display-mode: standalone)').matches === true ||
      (navigator as unknown as { standalone?: boolean }).standalone === true
    );
  }

  private get ios(): boolean {
    const ua = navigator.userAgent;
    return /iphone|ipad|ipod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  }

  /** Show the install button? (a real prompt is available, or iOS where we can explain how) */
  get canOfferInstall(): boolean {
    return !this.installed && !this.standalone && (this.deferred !== null || this.ios);
  }

  /** Ask the browser to install, or explain how on iOS. Returns a message to show when there is no prompt. */
  async install(): Promise<{ outcome: 'accepted' | 'dismissed' | 'manual'; message?: string }> {
    if (this.deferred) {
      const event = this.deferred;
      this.deferred = null;
      await event.prompt();
      const choice = await event.userChoice;
      this.emit();
      return { outcome: choice.outcome };
    }
    return {
      outcome: 'manual',
      message: 'Tap the Share button, then "Add to Home Screen".',
    };
  }

  onChange(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }

  init(): void {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault(); // keep it for our own button
      this.deferred = e as BeforeInstallPromptEvent;
      this.emit();
    });
    window.addEventListener('appinstalled', () => {
      this.installed = true;
      this.deferred = null;
      this.emit();
    });

    if (
      import.meta.env.PROD &&
      location.protocol.startsWith('http') && // not inside the desktop app
      'serviceWorker' in navigator
    ) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => undefined); // offline support is a bonus; never break the game over it
      });
    }
    this.emit();
  }
}

export const pwa = new Pwa();
