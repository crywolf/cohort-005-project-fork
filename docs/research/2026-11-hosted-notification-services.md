# Hosted notification services for Cadence

Resolves crywolf/cohort-005-project-fork#2. Researched 2026-11-14 against primary sources (pricing pages, official docs, OpenAPI specs). Prices and plan limits were read from the vendors' own pages on that date; vendors change these often, so re-check before committing money.

## Question

Which hosted notification service should Cadence use for in-app + email notifications, with web push at least supported? Compared: Knock, Novu, MagicBell, Courier, plus SuprSend as an extra find. Criteria from ticket #2: free tier depth, in-app feed over a plain API, React / React Router fit, email delivery path (lightweight), web push support, and where the first real bill lands.

## TL;DR

Novu first, Knock second. Novu has the cheapest step past the free tier ($30/mo vs $250/mo for everyone else), its free 10,000 monthly runs stretch further than the others' counters, and the `@novu/react` headless hooks cover exactly the build-our-own-inbox case. Knock's feed API is the best of the four and its free tier is fine, but the first paid bill is $250. The one thing neither does natively is web push; MagicBell is the only service of the four that takes VAPID web push seriously. If web push turns out to be a hard requirement, MagicBell becomes the strongest alternative, at the cost of a free tier (1,000 deliveries/mo) too small for a real app.

## Comparison at a glance

| | Knock | Novu | MagicBell | Courier |
| --- | --- | --- | --- | --- |
| Free tier | $0, 10,000 messages/mo, no hard cap | $0, 10,000 workflow runs/mo, hard-stops at the cap | $0, 1,000 deliveries/mo | $0, 10,000 sends/mo |
| What the counter counts | One message per channel per user | One run per subscriber per trigger, all channels included | One delivery per channel per user | One send per recipient, all channels included |
| First paid step | $250/mo (50k messages, then $0.005 each) | $30/mo (30k runs, then $1.20 per 1k) | $249/mo (50k deliveries, then $0.0025 each) | Pay-as-you-go $0.005/send, no monthly base |
| In-app feed over plain API | Yes, dedicated Feed API + headless hooks | Yes, Inbox REST API + headless hooks | Yes, user REST API + React SDK | Client SDK data/actions only; no documented REST feed API |
| React fit | `@knocklabs/react`, prebuilt + headless | `@novu/react`, React 18+ and 19, React Router quickstart | `@magicbell/react`, prebuilt + theming | `@trycourier/courier-react`, React 18+ (separate 17 package) |
| Email path | Your provider (SES, Postmark, Resend, SendGrid, Mailgun, SMTP, and more) | Your provider (SES, Resend, SendGrid, Postmark, Mailgun, SMTP, and more) | Your provider (SendGrid, SES, Mailgun, SMTP) | Your provider (SendGrid, SES, Postmark, Mailgun, Resend, SMTP, Gmail) |
| Web push | Not offered (mobile push only) | Only via intermediaries (Pushpad, Pusher Beams, OneSignal) | Native VAPID web push, first-class | Not offered (mobile push only) |
| Branding removed on free tier | No | No (Pro and up) | Unclear; Startup removes nothing mentioned | No mention |

## Knock

Pricing ([knock.app/pricing](https://knock.app/pricing)):

- Free plan: up to 10,000 messages/month. A message is "a single message delivered to a single user on a single channel", so a workflow that lands in-app and email for one user burns 2 messages. Bounces and failures are not counted. Unlimited profiles, workflows, team members, and feed retention.
- No hard cap on the free plan: if you go over without a card on file they contact you rather than stop delivery. Good for a small app that occasionally spikes.
- Starter is $250/month with 50,000 messages, then $0.005 each. That is the first real bill, and it is a big jump from $0. Knock's own blog describes exactly this gap, which they close with usage-based upgrade nudges ([knock.app blog](https://knock.app/blog/usage-based-upgrade-nudge-workflow)).
- A separate "guide recipients" counter (500/mo on Free) applies to their in-product announcement product, not to notification feeds.

In-app feed ([docs: in-app feeds](https://docs.knock.app/integrations/in-app/feeds.md)):

- A dedicated Feed API (REST) backs the feed: list items, filter by status, `archived: only`, and custom feed filtering on workflow metadata. Every feed notification carries `unseen`, `seen`, and `read` engagement statuses, plus archive. This is the plain-API path ticket #2 asks about, and it is the most complete of the four.
- Prebuilt React components exist but "bring your own components" is an equal citizen; the docs describe building custom UI headlessly on the same hooks ([docs: React in-app UI](https://docs.knock.app/in-app-ui/react/overview.md)). `@knocklabs/react` ships `NotificationFeedPopover`, `NotificationFeed`, `NotificationIconButton`, and a full hook set for a DIY inbox.

React / React Router fit: `@knocklabs/react` is a standard React library (hooks + context), no framework coupling; fine inside React Router. The open-source monorepo is on GitHub ([github.com/knocklabs/javascript](https://github.com/knocklabs/javascript/tree/main/packages/react)).

Email: Knock never sends email itself. You connect a provider and verify the domain at that provider: Amazon SES, Cloudflare Email, MailerSend, Mailgun, Mailjet, Mailtrap, Mandrill, Postmark, Resend, SendGrid, SMTP, SparkPost ([docs index, email section](https://docs.knock.app/llms.txt)). Email client previews are Starter-only. Cadence still pays the email provider separately (Knock's FAQ says so directly).

Web push: Knock's push channel is mobile push only. The supported provider list is Amazon SNS, APNs, Expo, FCM, and OneSignal ([docs: push](https://docs.knock.app/integrations/push/overview.md)). There is no web-push (VAPID) channel anywhere in their docs. If Cadence wants browser push later, it would run through OneSignal or a similar intermediary, or stay outside Knock.

## Novu

Pricing ([novu.co/pricing](https://www.novu.co/pricing), [docs: billing](https://docs.novu.co/platform/account/billing.md)):

- Free plan: $0, 10,000 workflow runs/month, 5 workflows, 2 environments, unlimited subscribers, 3 team members, no credit card.
- Billing is per **workflow run**, not per message or channel: "triggering a workflow to a single subscriber counts as 1 run" regardless of how many channels or steps fire. For a small app this stretches much further than per-channel counters: an in-app + email notification is 1 run, not 2.
- The free plan hard-stops at 10,000 runs (new triggers get HTTP 402) rather than overflowing, so budget surprises are bounded.
- First paid step is Pro at $30/month with 30,000 runs, then $1.20 per 1,000 ([changelog](https://www.novu.co/changelog/new-tier-novu-pro/)). Team starts at $250/month with 250,000 runs. $30 is by far the gentlest first bill in this comparison.

In-app feed ([docs: Inbox](https://docs.novu.co/inbox/overview), [docs: headless mode](https://docs.novu.co/platform/inbox/headless-mode.md)):

- Two paths, equally documented: the prebuilt `<Inbox />` component, or headless hooks. The headless path is exactly "Cadence builds its own inbox against a plain API": `useNotifications` (list, pagination, real-time updates), `useCounts` (unread/unseen counts), and a client with `novu.notifications.read(...)`, `archive(...)` etc. There is also a plain REST Inbox API for framework-agnostic use.
- Production hardening is documented: HMAC-signed subscriber sessions, per-tenant contexts for multi-tenant feeds, tabs and filters.

React / React Router fit: `@novu/react` requires React 18.0+, supports React 19 ([docs: Inbox overview](https://docs.novu.co/inbox/overview)). Novu publishes quickstarts for React, Next.js, and Remix, and the React quickstart explicitly covers adding routing with React Router ([docs index](https://docs.novu.co/_llms/notify.txt)).

Email: provider list is the widest of the four: SendGrid, Amazon SES, Resend, Postmark, Brevo, Mailgun, Mailjet, SparkPost, Mandrill, MailerSend, Mailtrap, custom SMTP, a generic webhook, and more ([docs: email integrations](https://docs.novu.co/_llms/notify.txt)). Each provider doc repeats the same setup shape: store the provider's API key and a domain that is already verified at that provider (for example the Resend page says "store your Resend API key and verified sending domain"). Verification work happens at the email provider, not in Novu.

Web push: Novu's push channel covers FCM, APNs, Expo, OneSignal, Pusher Beams, a generic push webhook, and Pushpad ([docs: push integrations](https://docs.novu.co/_llms/notify.txt)). There is no native VAPID web-push channel; browser push goes through an intermediary (Pushpad and Pusher Beams both explicitly handle web devices). Supported, but one hop removed.

One extra consideration: Novu is open source (MIT) and self-hostable, so the cloud plan is not a permanent ceiling. The docs are explicit that self-hosting is free and Novu Cloud is the managed layer ([docs: self-hosted and cloud](https://docs.novu.co/community/self-hosted-and-novu-cloud.md)).

## MagicBell

Pricing ([magicbell.com/pricing](https://www.magicbell.com/pricing)):

- Builder (free): 1,000 deliveries/month, 1 project, all integrations, unlimited users and team members. No credit card.
- A delivery is per channel per user: 100 users notified in-app plus 50 by email counts as 150 deliveries. At that rate, 1,000 deliveries is roughly 500-1,000 notifications a month. A real small app with an active inbox clears that fast; this free tier is a demo, not a home.
- Startup is $249/month with 50,000 deliveries, then $0.0025 each, 5 projects. Same $250-shaped jump as Knock.

In-app feed:

- A real user-facing REST API (v1) with published OpenAPI specs ([openapi.user.json](https://www.magicbell.com/docs/api/openapi.user.json), [API reference](https://www.magicbell.com/docs/api/reference)). Endpoints include list notifications, unread count, mark read/unread/seen, archive/unarchive, both per-notification and bulk. A DIY inbox against this API is fully feasible.
- The React SDK (`@magicbell/react`) ships `FloatingInbox`, `Inbox`, `InlineNotification`, and `UserPreferences`, with theming through CSS variables; component props (`onNotificationClick`, custom item renderers) support partial or full custom UI ([docs: magicbell-react](https://www.magicbell.com/docs/libraries/magicbell-react)). Auth is a user JWT minted server-side.

React / React Router fit: plain React package, no framework coupling; works fine with React Router. SDK coverage also includes Svelte, Preact, and web components.

Email: providers are SendGrid, Amazon SES, Mailgun, and raw SMTP ([docs: email channel](https://www.magicbell.com/docs/channels/email)). Domain verification happens at the chosen provider, as with the others. Adequate but the narrowest list here.

Web push: this is MagicBell's differentiator. Web push is a first-class channel: you paste your VAPID public/private keys into the dashboard or save them via API, register push subscriptions (`PushSubscription.endpoint` plus p256dh/auth keys) as channel tokens, and MagicBell encrypts and delivers directly to the browser push service. The React SDK includes a `WebPushButton` and a hosted service-worker script ([docs: web push](https://www.magicbell.com/docs/channels/web_push), [docs: magicbell-react](https://www.magicbell.com/docs/libraries/magicbell-react)). No intermediary provider needed.

## Courier

Pricing ([courier.com/pricing](https://www.courier.com/pricing/)):

- Developer (free): 10,000 sends/month, journeys and broadcasts included. A "send" is one template to one recipient no matter how many channels it lands on, so the counter is generous.
- Business is pay-as-you-go at $0.005 per send (including the first 10,000): 50,000 sends/month costs $250, and the very first month over 10,000 might cost $5. There is no monthly platform fee, so the "first real bill" is the smallest and most gradual of the four. The free plan does hard-stop at 10,000 until a card is added.

In-app feed ([docs: in-app](https://www.courier.com/docs/platform/inbox), [docs: build a custom inbox](https://www.courier.com/docs/in-app/build-a-custom-inbox.md)):

- The inbox is component-first: `@trycourier/courier-react` (React 18+, with a separate React 17 package) renders `CourierInbox`, authenticated with a server-minted JWT via `signIn({ userId, jwt })`.
- A custom inbox is possible, but it is built on the **client SDK's** data and actions (`inbox.feeds`, `totalUnreadCount`, `readMessage`, `archiveMessage`, pagination), not on a documented REST feed API. Server-side or framework-agnostic DIY feed code has no first-class path here, which makes Courier the weakest fit for the "plain API" criterion. Real-time sync and multi-device state are genuinely good, so if Cadence were happy using their component, Courier would be fine.

React / React Router fit: solid React 18+ SDK; a v8 migration guide exists because the older `@trycourier/react-inbox` packages are deprecated, which is worth knowing before copying old tutorials ([docs: platform inbox](https://www.courier.com/docs/platform/inbox)).

Email: not an email provider; delegates to SendGrid, Amazon SES, Mailgun, Postmark, Resend, generic SMTP, and Gmail (OAuth, aimed at testing) ([docs: integrations](https://www.courier.com/docs/integrations/overview.md)). Credentials are configured per environment.

Web push: Courier's push channel is mobile push (APNs, FCM, Expo) plus intermediaries (OneSignal, Airship, SNS, Pusher Beams, Pusher, Pushbullet, and, amusingly, MagicBell) ([docs: push providers](https://www.courier.com/docs/integrations/push/overview.md)). No native web-push channel.

## Also looked at

- SuprSend: free plan is 10,000 notifications/month with an in-app feed that carries SuprSend branding, and the first paid step is $100/month (billed annually at $1,200), 50,000 notifications ([suprsend.com/pricing](https://www.suprsend.com/pricing)). The branding on the free feed and the annual-only billing make it a worse fit than Novu or Knock, so it did not get a full pass.
- Courier maintains migration guides from Knock, Novu, SuprSend, OneSignal, and Braze ([courier.com/llms.txt](https://www.courier.com/llms.txt)), which is a decent signal of who the credible players are; no other service changed the ranking.

## Recommendation

**1. Novu.** On the ticket's own weighting it wins most rows. Its free tier genuinely covers a small app, and workflow-run billing means an in-app + email notification costs one unit instead of two or three, so 10,000 runs go further than Knock's or MagicBell's counters. The headless `@novu/react` hooks (`useNotifications`, `useCounts`, `novu.notifications.read/archive`) are exactly the plain-API inbox path Cadence wants, with a REST API underneath for anything the hooks do not cover. Email delegates to whatever provider Cadence picks (Resend or Postmark both supported), with domain verification done at the provider as usual. The $30 Pro plan means the first real bill is coffee money, not $250. Two caveats to carry into ticket #3: the free plan hard-stops (HTTP 402) at 10,000 runs, and web push is only available through an intermediary like Pushpad or Pusher Beams rather than natively.

**2. Knock.** The best in-app feed API of the four: a documented REST Feed API with seen/read/archive states, filtering, and archiving, plus a React SDK that supports headless use as a first-class option. The free tier (10,000 messages, no hard cap) is workable, and bounces are not billed. What keeps it second is money and web push: the first paid plan is $250/month, the steepest jump in this comparison, and there is no web-push path at all. Choose Knock over Novu only if the feed API's shape matters more than a 8x cheaper first paid step.

The web-push question deserves its own ticket (already exists as #6). Summarized: MagicBell is the only one of the four with native VAPID web push; Novu and Courier cover it through intermediaries (Pushpad, Pusher Beams, OneSignal); Knock does not cover it. If browser push becomes a hard requirement, MagicBell is the strongest alternative to Novu despite the 1,000-delivery free tier, or Novu can pair with Pushpad for roughly the same outcome.

## All sources

- Knock: [pricing](https://knock.app/pricing), [in-app feeds](https://docs.knock.app/integrations/in-app/feeds.md), [React in-app UI](https://docs.knock.app/in-app-ui/react/overview.md), [push overview](https://docs.knock.app/integrations/push/overview.md), [docs index with email provider list](https://docs.knock.app/llms.txt), [usage-based upgrade nudge blog post](https://knock.app/blog/usage-based-upgrade-nudge-workflow)
- Novu: [pricing](https://www.novu.co/pricing), [billing](https://docs.novu.co/platform/account/billing.md), [Inbox overview](https://docs.novu.co/inbox/overview), [headless mode](https://docs.novu.co/platform/inbox/headless-mode.md), [Pro tier changelog](https://www.novu.co/changelog/new-tier-novu-pro/), [docs index (channels and quickstarts)](https://docs.novu.co/_llms/notify.txt), [self-hosted and cloud](https://docs.novu.co/community/self-hosted-and-novu-cloud.md)
- MagicBell: [pricing](https://www.magicbell.com/pricing), [REST API reference](https://www.magicbell.com/docs/api/reference), [user API OpenAPI spec](https://www.magicbell.com/docs/api/openapi.user.json), [React SDK](https://www.magicbell.com/docs/libraries/magicbell-react), [web push channel](https://www.magicbell.com/docs/channels/web_push), [email channel](https://www.magicbell.com/docs/channels/email)
- Courier: [pricing](https://www.courier.com/pricing/), [in-app overview](https://www.courier.com/docs/platform/inbox), [build a custom inbox](https://www.courier.com/docs/in-app/build-a-custom-inbox.md), [push providers](https://www.courier.com/docs/integrations/push/overview.md), [integrations overview](https://www.courier.com/docs/integrations/overview.md), [agent docs index](https://www.courier.com/llms.txt)
- SuprSend: [pricing](https://www.suprsend.com/pricing)
