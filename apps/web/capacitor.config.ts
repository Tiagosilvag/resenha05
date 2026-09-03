import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'br.com.coffetech.resenha05',
  appName: 'Resenha05',
  webDir: 'dist',
  // O app empacotado carrega o front deste servidor (mesmo do site).
  // Assim uma correção de UI chega sem passar pela loja; mudanças de plugin
  // nativo continuam exigindo novo build.
  server: {
    url: 'https://resenha05.coffetech.com.br',
    cleartext: false,
  },
  plugins: {
    Keyboard: { resize: 'native' },
  },
};

export default config;
