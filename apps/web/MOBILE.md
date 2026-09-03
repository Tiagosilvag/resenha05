# App mobile (Capacitor) — Fase 12

O app de loja é o mesmo `apps/web` empacotado numa casca nativa. Não há código
de tela duplicado. O que muda é: a casca (Capacitor), alguns plugins nativos e o
processo de assinatura/publicação.

## Como funciona

- `capacitor.config.ts` aponta `server.url` para `https://resenha05.coffetech.com.br`.
  O app carrega o front de lá — uma correção de UI chega sem passar pela loja.
- `src/lib/plataforma.ts` roda ajustes nativos (status bar, botão voltar do
  Android) só quando `Capacitor.isNativePlatform()`.
- Upload de foto usa `<input type="file" capture>`, que funciona no WKWebView
  (iOS 14+) e no Android WebView. Para uma câmera nativa mais integrada, trocar
  depois por `@capacitor/camera` (`Camera.getPhoto`).
- Tokens ficam em `localStorage` (persiste no WebView). Endurecer depois com
  `@capacitor/preferences` / Keychain.

## Gerar os projetos nativos (uma vez)

Fora do Coolify, numa máquina de dev:

```bash
cd apps/web
npm run build
npx cap add android          # cria apps/web/android/
npx cap add ios              # cria apps/web/ios/ — precisa de Mac + CocoaPods
npx cap sync
```

Commitar as pastas `android/` e `ios/` (convenção do Capacitor). Depois de
qualquer mudança no front: `npm run cap:sync`.

## Android (Google Play — US$ 25, taxa única)

1. `npx cap open android` → Android Studio.
2. Gerar uma keystore de upload e guardar como secret no GitHub
   (`ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
   `ANDROID_KEY_PASSWORD`).
3. Build → **Generate Signed Bundle (.aab)** ou usar o workflow
   `.github/workflows/android.yml`.
4. Play Console → criar o app → subir o `.aab` no canal de teste interno →
   depois produção.
5. `applicationId`: `br.com.coffetech.resenha05`.

## iOS (App Store — Apple Developer US$ 99/ano)

Precisa de Mac (ou serviço de build tipo Codemagic).

1. `npx cap open ios` → Xcode.
2. Signing & Capabilities → time da conta Apple Developer.
3. Bundle ID: `br.com.coffetech.resenha05`.
4. Archive → distribuir para App Store Connect → TestFlight → produção.

### Regra de IAP da Apple

Pagamento de jogador para a pelada é serviço do mundo real → Mercado Pago é
permitido (Fase 6). A **assinatura do organizador** (Fase 11) a Apple pode
classificar como assinatura digital e exigir IAP (~30%). Solução: **não mostrar
tela de compra de assinatura no app iOS** — o organizador assina pelo site.

### Guideline 4.2 ("minimum functionality")

App que é só um site embrulhado costuma ser recusado. O que ajuda a passar:
câmera nativa, botão voltar do Android, navegação com cara de app, funcionar
offline no básico. Tratar como requisito antes de submeter.

## Checklist antes de empacotar

- [ ] Todas as telas respeitam safe-area (classes `safe-top` / `safe-bottom`).
- [ ] Nenhuma ação acessível só por `:hover`.
- [ ] Ícone e splash screen (`@capacitor/assets` gera a partir de um PNG 1024²).
- [ ] Deep link de retorno do Mercado Pago (quando a Fase 6 entrar).
- [ ] Push nativo (FCM/APNs) — só se/quando sair do "só WhatsApp".
