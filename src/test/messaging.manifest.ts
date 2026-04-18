/**
 * Messaging quality gate — manifest.
 *
 * Detta är källan till sanning för vilka testfiler som tillsammans utgör
 * den officiella messaging-kvalitetsspärren.
 *
 * STANDARDKOMMANDO (officiell väg att köra hela paketet):
 *
 *     npm run test:messaging
 *
 * vilket i sin tur kör:
 *
 *     bash scripts/test-messaging.sh
 *
 * Om npm-scriptet inte finns i package.json (t.ex. i miljöer där
 * package.json är read-only), kör shell-scriptet direkt. Båda vägarna
 * är likvärdiga och måste hållas synkade med detta manifest.
 *
 * Lägg till nya messaging-tester här OCH i scripts/test-messaging.sh.
 */
export const MESSAGING_QUALITY_GATE = {
  /**
   * Frontend-tester (vitest, jsdom). Täcker SDK-kontrakt, legacy-wrappers
   * och produktnivå-flöden mot mobile-app-api via mockad fetch.
   */
  frontend: [
    // Samlad produktnivå-svit (DM, job chat, broadcasts, inbox-totaler,
    // attachments, contacts/identities). Primär kontraktssvit.
    'src/test/messagingProduct.contract.test.ts',

    // Pure UI-helper (avatar initials). Övriga helpers (preview/canSend/
    // totalUnread) testas i produkt-sviten ovan.
    'src/test/chatFlow.test.ts',

    // mobileApi (SDK) — wire-format mot mobile-app-api per action.
    'src/services/__tests__/mobileApiService.chat.test.ts',

    // Legacy-wrapper directMessageService → mobileApi.
    'src/services/__tests__/directMessageService.test.ts',

    // Legacy-wrapper jobChatService → mobileApi.
    'src/services/__tests__/jobChatService.test.ts',
  ],

  /**
   * Backend-tester (deno test mot mobile-app-api edge function).
   * Verifierar auth-, access- och payload-guards på serversidan.
   */
  backend: [
    'supabase/functions/mobile-app-api/messaging.test.ts',
  ],
} as const;

export type MessagingQualityGate = typeof MESSAGING_QUALITY_GATE;
