# Web push with Knock for Cadence

Resolves crywolf/cohort-005-project-fork#6. Researched 2026-11-14 against primary sources (Knock's official docs and tutorials, WebKit blog, Apple developer docs, Knock's pricing page).

## Question

Does Knock support web push for a browser app, and how mature is it (service-worker requirements, permission prompts, browser support)? Findings feed the spec's recommendation on whether web push is v1 or a later slice. Cadence has no mobile app; browser push is the only push surface.

## TL;DR

Yes, Knock can deliver web push — but not natively. Knock has **no first-party web push channel**; the supported path is routing through a **Firebase Cloud Messaging (FCM) channel**, with the Firebase SDK, a service worker, and the permission flow all living in Cadence's own frontend. It is a documented, officially-tutorialised, workable path — but every hard part of web push (service worker, permission UX, token lifecycle, foreground/background display) lands on Cadence, and Knock only contributes the "send payload to FCM for these stored tokens" leg. **Recommendation: keep web push out of v1** (consistent with the catalogue decision) and treat it as a later slice if the demand shows up. It is not a reason to switch services: MagicBell's native VAPID push was the counter-argument, and paying for MagicBell to avoid one service-worker file and one Firebase project is a trade Cadence does not need to make now.

## Does Knock support web push?

- Knock's own tutorial states it plainly: *"Knock does not have a first-party web push channel. Instead, you'll use FCM to send messages to a user's browser"* ([Sending web push notifications with Firebase Cloud Messaging (FCM)](https://docs.knock.app/tutorials/sending-web-push-notifications-with-fcm)).
- Knock's push channel types are APNs, FCM, Expo, and Amazon SNS ([Push overview](https://docs.knock.app/integrations/push/overview)). FCM delivers to web as well as Android and iOS, which is how web push happens: *"Can Knock send web push notifications? Yes. FCM delivers to Android, iOS, and web"* ([knock.app/channels/push](https://knock.app/channels/push)).
- This updates the earlier service comparison (`docs/research/2026-11-hosted-notification-services.md`), which recorded Knock's web push as "Not offered (mobile push only)". More precisely: **offered, but via FCM as an intermediary — not a native VAPID web-push channel**. MagicBell remains the only compared service with first-party VAPID web push.

## What the integration requires (the full checklist)

From Knock's official web-push tutorial and FCM integration page:

1. **A Firebase project** with Cloud Messaging enabled, plus its **Project ID and Service Account JSON** entered into an FCM channel in Knock's dashboard ([FCM integration](https://docs.knock.app/integrations/push/firebase)).
2. **The Firebase SDK in the client** (`firebase` npm package, `app` + `messaging` modules) and a **VAPID key** from the Firebase dashboard for `getToken`.
3. **A service worker file** (`firebase-messaging-sw.js` in `public/`) that initialises Firebase and handles background message display. FCM requires it; it runs in its own thread and must be registered from app code. This is new infrastructure Cadence does not currently have (no service worker today).
4. **A permission flow you design.** *"Browser push notifications require user consent for registration, so you'll typically want to create UI in your app to trigger the browser's default notification permission UI based on user input"* — i.e. a subscribe button calling `Notification.requestPermission()`, not an on-load prompt. Unsubscribing from browser permission is browser-UI-only by design; in-app you can only clear the stored token.
5. **Token registration as Knock channel data**: the FCM browser token is stored on the recipient via `knock.user.setChannelData({ channelId, channelData: { tokens: [token] } })`. Knock supports multiple tokens per user (one message per token) and a `devices` array with metadata; an opt-in **token deregistration** feature auto-removes bounced tokens ([FCM integration: managing tokens](https://docs.knock.app/integrations/push/firebase)).
6. **Foreground/background handling**: Knock sends FCM `notification`-type messages by default, which the browser displays automatically while the app is backgrounded. Foreground display requires an `onMessage` handler calling `registration.showNotification(...)`; `data`-type (silent) messages require `onBackgroundMessage` in the service worker. Knock's payload overrides (merge or `__strategy__: "replace"`, with Liquid) customise icons, badges, and click URLs via the `webpush` key.

Rough client-side surface for Cadence: one Firebase provider component, one service worker file, subscribe/unsubscribe UI wired to the notification-preferences model, and the foreground `onMessage` handler. Knock-side surface: one FCM channel + an FCM step in the relevant workflows.

## Maturity

- **Documentation**: a full official tutorial (React/Next.js, integrates with `KnockProvider` and `@knocklabs/react`) plus a complete FCM integration reference. Not experimental or community-maintained.
- **Operational maturity**: Knock handles the provider connection, delivery logs (`UNREGISTERED`, `INVALID_ARGUMENT` errors surfaced), and optional automatic token deregistration on bounce. Token lifecycle is the classic web-push pain point and Knock covers the server side of it.
- **What is *not* mature**: the web path is thinner than mobile. There is no dedicated web-push quickstart outside the single tutorial; no first-party handling of notification click-through routing (deep-linking is documented for the Swift/Kotlin SDKs only); and Knock's FAQ on browser support is a single sentence.

## Browser support

- FCM web push works in all major modern browsers (Chrome, Edge, Firefox, Safari) — Knock's FAQ and Firebase's own docs agree.
- **iOS/iPadOS: the real caveat.** Web push on iOS requires iOS/iPadOS 16.4+ **and the site installed to the Home Screen** (Add to Home Screen) ([WebKit: Web Push for Web Apps on iOS and iPadOS](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/); [Apple: Sending web push notifications in web apps and browsers](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers)). Knock's own tutorial code encodes this: it throws *"In iPhone you must install the app first"* unless the page is a PWA. A browser-tab user on an iPhone cannot be pushed to. For a desktop-first course app this is tolerable, but it means iOS web push arrives with an "install Cadence to your Home Screen" ask.
- Requires HTTPS (standard for the Push API) and a browser with Push API + service worker support — all current evergreen browsers.

## Cost

- **Knock free plan covers push**: "Unlimited delivery channels" on Free, and FCM messages count against the shared 10,000 messages/month counter like any channel ([knock.app/pricing](https://knock.app/pricing)). No push-specific paywall.
- **FCM is free** — Google charges nothing for Cloud Messaging delivery.
- The only hidden cost is engineering: the Firebase project, service worker, and permission UX are Cadence's to build and maintain.

## Recommendation for the spec

Keep web push as a **later slice, not v1**:

- The catalogue already decided email covers the far-from-screen moments and in-app covers the rest; web push duplicates in-app's "at the screen" case for users who closed the tab.
- The Knock path is real but leans on Cadence to own a service worker, a Firebase project, and permission UX — meaningful frontend surface for a channel that mostly mirrors the in-app feed.
- Nothing in the decision blocks later adoption: the FCM channel slots into Knock workflows as just another channel step, works within the free tier, and respects Knock's existing preference model. The spec can name it as the planned mechanism ("web push, later: Knock FCM channel") without committing v1 work.
- Do **not** switch to MagicBell for this. The earlier comparison already priced that option: a 1,000-deliveries/month free tier, too small for a real app, to gain native VAPID push Cadence is not shipping in v1.
