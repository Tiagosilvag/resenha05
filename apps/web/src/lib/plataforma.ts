import { Capacitor } from '@capacitor/core';

export const ehNativo = (): boolean => Capacitor.isNativePlatform();

/** Ajustes que só fazem sentido no app empacotado (Capacitor). Silencioso na web. */
export async function inicializarNativo(): Promise<void> {
  if (!ehNativo()) return;
  try {
    const { StatusBar, Style } = await import('@capacitor/status-bar');
    await StatusBar.setStyle({ style: Style.Light });

    const { App } = await import('@capacitor/app');
    App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else App.exitApp();
    });
  } catch {
    /* plugins ausentes em dev — ignora */
  }
}
