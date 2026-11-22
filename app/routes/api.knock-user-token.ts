import { data } from "react-router";
import type { Route } from "./+types/api.knock-user-token";
import { requireUserId } from "~/lib/access.server";
import { knockUserId, signKnockUserToken } from "~/lib/knock.server";

/**
 * Issues the pieces the client-side Notification Feed needs to connect to
 * Knock: the publishable API key, the in-app feed channel id, the current
 * user's canonical Knock id, and a signed user token (enhanced security
 * mode). When Knock is not configured — or the current user is not signed
 * in — the route fails and the bell renders nothing instead.
 */
export async function loader({ request }: Route.LoaderArgs) {
  const userId = await requireUserId(request);

  const publicApiKey = process.env.KNOCK_PUBLIC_API_KEY;
  const feedChannelId = process.env.KNOCK_FEED_CHANNEL_ID;
  if (!publicApiKey || !feedChannelId) {
    throw data("Knock is not configured", { status: 503 });
  }

  try {
    const token = signKnockUserToken(userId);
    return data({
      userId: knockUserId(userId),
      publicApiKey,
      feedChannelId,
      token,
    });
  } catch (error) {
    console.error("Failed to sign the Knock user token", error);
    throw data("Knock is not configured", { status: 503 });
  }
}
