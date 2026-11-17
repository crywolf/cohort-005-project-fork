/**
 * PROTOTYPE (throwaway) — three variants of the notification preferences
 * section on /settings, switchable via ?variant=. Answers wayfinder ticket
 * #13 ("Prototype the notification preferences UI").
 *
 * Driven by the decided preferences model (ticket #8): three coarse
 * categories with per-category channel toggles; purchase/refund emails and
 * Platform Admin pings always-on; categories filtered by the user's role.
 *
 * State is in-memory only — nothing is saved. Two of the variants here will
 * be thrown away; the user picks one (or mixes).
 */
import { useState } from "react";
import { useSearchParams } from "react-router";
import { Bell, Lock, MessageSquare, ShoppingCart, UserPlus, ShieldAlert } from "lucide-react";
import { Card, CardContent, CardHeader } from "~/components/ui/card";
import { PrototypeSwitcher } from "~/components/prototype-switcher";

// ─── Mock model (mirrors the decided preferences model) ─────────────────────

type Role = "student" | "instructor" | "admin";

interface Channels {
  inApp: boolean;
  email: boolean;
}

// email is present on every category for type uniformity; the UI only shows
// an email toggle where the category actually has one.
type Preferences = Record<"discussion" | "purchases" | "newStudents", Channels>;

const DEFAULTS: Preferences = {
  discussion: { inApp: true, email: true },
  purchases: { inApp: true, email: true },
  newStudents: { inApp: true, email: true },
};

function relevantCategories(role: Role) {
  const categories: {
    key: keyof Preferences;
    title: string;
    description: string;
    email: boolean; // whether this category has a configurable email toggle
    icon: typeof Bell;
  }[] = [];

  // Discussion activity is relevant to both Students and Instructors.
  if (role === "student" || role === "instructor") {
    categories.push({
      key: "discussion",
      title: "Discussion activity",
      description:
        role === "instructor"
          ? "New discussion questions on your courses, and replies to questions you follow."
          : "Replies to discussion questions you asked.",
      email: true,
      icon: MessageSquare,
    });
  }

  // Purchases & refunds is a Student-side category.
  if (role === "student") {
    categories.push({
      key: "purchases",
      title: "Purchases & refunds",
      description:
        "Purchase receipts, refund decisions, and seat claims on your courses.",
      // Email here is always-on (receipts + decisions); no toggle.
      email: false,
      icon: ShoppingCart,
    });
  }

  // New students is Instructor-only.
  if (role === "instructor") {
    categories.push({
      key: "newStudents",
      title: "New students",
      description: "A new student enrolls in one of your courses.",
      email: false,
      icon: UserPlus,
    });
  }

  return categories;
}

// ─── Tiny local switch (no shadcn switch in this project yet) ───────────────

function Switch({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={onChange}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-primary" : "bg-muted"
      } ${disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}
    >
      <span
        className={`pointer-events-none block size-4 rounded-full bg-background shadow transition-transform ${
          checked ? "translate-x-[18px]" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function LockHint({ children }: { children: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
      <Lock className="size-3" />
      {children}
    </span>
  );
}

// ─── Variant A: channel grid (table) ────────────────────────────────────────

function VariantA({ role }: { role: Role }) {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS);
  const categories = relevantCategories(role);
  const anyEmail = categories.some((c) => c.email);

  return (
    <Card>
      <CardHeader>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Bell className="size-5" /> Notifications
        </h2>
        <p className="text-sm text-muted-foreground">
          Choose what you're notified about. Changes aren't saved in this
          prototype.
        </p>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              <th className="pb-2 font-medium">Category</th>
              <th className="pb-2 font-medium">In app</th>
              {anyEmail && <th className="pb-2 font-medium">Email</th>}
            </tr>
          </thead>
          <tbody>
            {categories.map((category) => {
              const pref = prefs[category.key];
              return (
                <tr key={category.key} className="border-b last:border-0">
                  <td className="py-3 pr-4">
                    <span className="flex items-center gap-2 font-medium">
                      <category.icon className="size-4 text-muted-foreground" />
                      {category.title}
                    </span>
                    <p className="mt-0.5 pl-6 text-xs text-muted-foreground">
                      {category.description}
                    </p>
                    {category.key === "purchases" && (
                      <p className="mt-1 pl-6">
                        <LockHint>
                          Receipt and refund-decision emails are always sent.
                        </LockHint>
                      </p>
                    )}
                  </td>
                  <td className="py-3 pr-4 align-top">
                    <Switch
                      checked={pref.inApp}
                      label={`${category.title} in-app`}
                      onChange={() =>
                        setPrefs({
                          ...prefs,
                          [category.key]: { ...pref, inApp: !pref.inApp },
                        })
                      }
                    />
                  </td>
                  {anyEmail && (
                    <td className="py-3 align-top">
                      {category.email ? (
                        <Switch
                          checked={pref.email}
                          label={`${category.title} email`}
                          onChange={() =>
                            setPrefs({
                              ...prefs,
                              [category.key]: { ...pref, email: !pref.email },
                            })
                          }
                        />
                      ) : (
                        <LockHint>
                          {category.key === "purchases"
                            ? "Always on"
                            : "Not available"}
                        </LockHint>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        {role === "admin" && (
          <div className="mt-4 rounded-md border bg-muted/40 p-3 text-sm">
            <span className="flex items-center gap-2 font-medium">
              <ShieldAlert className="size-4 text-muted-foreground" />
              Platform admin alerts
            </span>
            <p className="mt-1 text-xs text-muted-foreground">
              Open refund requests and other staff alerts are always delivered.
              They aren't a preference.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Variant B: channel-first sections ──────────────────────────────────────

function VariantB({ role }: { role: Role }) {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS);
  const categories = relevantCategories(role);
  const emailCategories = categories.filter((c) => c.email);

  function toggle(key: keyof Preferences, channel: "inApp" | "email") {
    setPrefs({ ...prefs, [key]: { ...prefs[key], [channel]: !prefs[key][channel] } });
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Bell className="size-5" /> Notifications
        </h2>
        <p className="text-sm text-muted-foreground">
          Pick which channels each kind of news reaches. Changes aren't saved
          in this prototype.
        </p>
      </CardHeader>
      <CardContent className="space-y-6">
        <section>
          <h3 className="mb-2 text-sm font-semibold">In app</h3>
          <ul className="divide-y rounded-md border">
            {categories.map((category) => (
              <li key={category.key} className="flex items-center gap-3 p-3">
                <category.icon className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{category.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {category.description}
                  </p>
                </div>
                <Switch
                  checked={prefs[category.key].inApp}
                  label={`${category.title} in app`}
                  onChange={() => toggle(category.key, "inApp")}
                />
              </li>
            ))}
            {role === "admin" && (
              <li className="flex items-center gap-3 p-3">
                <ShieldAlert className="size-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">Platform admin alerts</p>
                  <p className="text-xs text-muted-foreground">
                    Open refund requests and other staff alerts.
                  </p>
                </div>
                <LockHint>Always on</LockHint>
              </li>
            )}
          </ul>
        </section>

        {emailCategories.length > 0 && (
          <section>
            <h3 className="mb-2 text-sm font-semibold">Email</h3>
            <ul className="divide-y rounded-md border">
              {emailCategories.map((category) => (
                <li key={category.key} className="flex items-center gap-3 p-3">
                  <category.icon className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{category.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {category.description}
                    </p>
                  </div>
                  <Switch
                    checked={prefs[category.key].email}
                    label={`${category.title} email`}
                    onChange={() => toggle(category.key, "email")}
                  />
                </li>
              ))}
              {role === "student" && (
                <li className="flex items-center gap-3 p-3">
                  <ShoppingCart className="size-4 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">
                      Purchase &amp; refund emails
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Receipts and refund decisions about your money.
                    </p>
                  </div>
                  <LockHint>Always on</LockHint>
                </li>
              )}
            </ul>
          </section>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Variant C: descriptive list with channel chips ─────────────────────────

function VariantC({ role }: { role: Role }) {
  const [prefs, setPrefs] = useState<Preferences>(DEFAULTS);
  const categories = relevantCategories(role);

  function toggle(key: keyof Preferences, channel: "inApp" | "email") {
    setPrefs({ ...prefs, [key]: { ...prefs[key], [channel]: !prefs[key][channel] } });
  }

  return (
    <Card>
      <CardHeader>
        <h2 className="flex items-center gap-2 text-lg font-semibold">
          <Bell className="size-5" /> Notifications
        </h2>
        <p className="text-sm text-muted-foreground">
          Tap a channel to turn it on or off. Changes aren't saved in this
          prototype.
        </p>
      </CardHeader>
      <CardContent className="space-y-2">
        {categories.map((category) => {
          const pref = prefs[category.key];
          return (
            <div
              key={category.key}
              className="rounded-lg border p-4 transition-colors hover:bg-muted/40"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="flex items-center gap-2 font-medium">
                    <category.icon className="size-4 text-muted-foreground" />
                    {category.title}
                  </span>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {category.description}
                  </p>
                </div>
                <div className="flex shrink-0 gap-1.5">
                  <button
                    type="button"
                    onClick={() => toggle(category.key, "inApp")}
                    className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      pref.inApp
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground hover:bg-accent"
                    }`}
                  >
                    In app
                  </button>
                  {category.email ? (
                    <button
                      type="button"
                      onClick={() => toggle(category.key, "email")}
                      className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                        pref.email
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted text-muted-foreground hover:bg-accent"
                      }`}
                    >
                      Email
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}

        <div className="pt-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Always on
          </p>
          <div className="space-y-2">
            {role === "student" && (
              <div className="rounded-lg border border-dashed p-4 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <ShoppingCart className="size-4 text-muted-foreground" />
                  Purchase &amp; refund emails
                </span>
                <p className="mt-1 text-xs text-muted-foreground">
                  Receipts and refund decisions about your money are always
                  emailed — these can't be turned off.
                </p>
              </div>
            )}
            {role === "admin" && (
              <div className="rounded-lg border border-dashed p-4 text-sm">
                <span className="flex items-center gap-2 font-medium">
                  <ShieldAlert className="size-4 text-muted-foreground" />
                  Platform admin alerts
                </span>
                <p className="mt-1 text-xs text-muted-foreground">
                  Open refund requests and other staff alerts are always
                  delivered — these can't be turned off.
                </p>
              </div>
            )}
            {role === "instructor" && (
              <p className="text-xs text-muted-foreground">
                Nothing on your account is locked on.
              </p>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Host: renders the right variant on /settings ───────────────────────────

const VARIANTS = [
  { key: "A", name: "Channel grid" },
  { key: "B", name: "Channel sections" },
  { key: "C", name: "Descriptive chips" },
];

export function NotificationPreferencesPrototype({ role }: { role: Role }) {
  const [searchParams] = useSearchParams();
  const variant = searchParams.get("variant") ?? "A";

  return (
    <div className="mt-8 max-w-md">
      {variant === "A" && <VariantA role={role} />}
      {variant === "B" && <VariantB role={role} />}
      {variant === "C" && <VariantC role={role} />}
      <PrototypeSwitcher variants={VARIANTS} current={variant} />
    </div>
  );
}
