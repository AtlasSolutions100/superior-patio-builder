import * as React from "react";
import { useEffect, useRef, useState } from "react";
import { ClerkProvider, SignIn, SignUp, Show, useClerk, useAuth, useSignIn } from '@clerk/react';
import { setAuthTokenGetter, setUnauthorizedRetryHandler } from "@workspace/api-client-react";
import { publishableKeyFromHost } from '@clerk/react/internal';
import { shadcn } from '@clerk/themes';
import { Switch, Route, useLocation, Router as WouterRouter, Redirect } from 'wouter';
import { QueryClientProvider, useQueryClient } from "@tanstack/react-query";
import { queryClient } from "./lib/query-client";
import { Toaster } from "sonner";
import { AppShell } from "./components/layout/app-shell";

import LandingPage from "./pages/landing";
import BoardPage from "./pages/board";
import SalesPage from "./pages/sales";
import ListPage from "./pages/list";
import TeamPage from "./pages/team";
import FeedbackPage from "./pages/feedback";
import SettingsPage from "./pages/settings";

const clerkPubKey = publishableKeyFromHost(
  window.location.hostname,
  import.meta.env.VITE_CLERK_PUBLISHABLE_KEY,
);

const clerkProxyUrl = import.meta.env.VITE_CLERK_PROXY_URL;

const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

function stripBase(path: string): string {
  return basePath && path.startsWith(basePath)
    ? path.slice(basePath.length) || "/"
    : path;
}

if (!clerkPubKey) {
  throw new Error('Missing VITE_CLERK_PUBLISHABLE_KEY in .env file');
}

const clerkAppearance = {
  theme: shadcn,
  cssLayerName: "clerk",
  options: {
    logoPlacement: "inside" as const,
    logoLinkUrl: basePath || "/",
    logoImageUrl: `${window.location.origin}${basePath}/logo.svg`,
  },
  variables: {
    colorPrimary: "hsl(24, 85%, 55%)",
    colorForeground: "hsl(20, 15%, 15%)",
    colorMutedForeground: "hsl(20, 5%, 45%)",
    colorDanger: "hsl(0, 84%, 60%)",
    colorBackground: "hsl(0, 0%, 100%)",
    colorInput: "hsl(40, 10%, 90%)",
    colorInputForeground: "hsl(20, 15%, 15%)",
    colorNeutral: "hsl(40, 10%, 90%)",
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    borderRadius: "6px",
  },
  elements: {
    rootBox: "w-full flex justify-center",
    cardBox: "bg-white rounded-2xl w-[440px] max-w-full overflow-hidden border shadow-sm",
    card: "!shadow-none !border-0 !bg-transparent !rounded-none",
    footer: "!shadow-none !border-0 !bg-transparent !rounded-none",
    headerTitle: "text-2xl font-bold text-foreground",
    headerSubtitle: "text-muted-foreground",
    socialButtonsBlockButtonText: "text-foreground font-medium",
    formFieldLabel: "text-foreground font-medium",
    footerActionLink: "text-primary hover:text-primary/90 font-medium",
    footerActionText: "text-muted-foreground",
    dividerText: "text-muted-foreground",
    identityPreviewEditButton: "text-primary hover:text-primary/90",
    formFieldSuccessText: "text-primary",
    alertText: "text-foreground",
    logoBox: "h-12 flex items-center justify-center mb-4",
    logoImage: "h-full w-auto object-contain",
    socialButtonsBlockButton: "border border-input bg-background hover:bg-accent hover:text-accent-foreground",
    formButtonPrimary: "bg-primary text-primary-foreground hover:bg-primary/90 shadow",
    formFieldInput: "flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",
    footerAction: "mt-4",
    dividerLine: "bg-input",
    alert: "bg-destructive/10 text-destructive border-destructive/20",
    otpCodeFieldInput: "border-input border rounded-md",
    formFieldRow: "mb-4",
    main: "w-full",
  },
};

// Demo login is development-only: dev and prod Clerk user stores are
// separate, and these buttons only render with development (pk_test) keys.
const isDevClerkInstance = clerkPubKey.startsWith("pk_test_");

const DEMO_ACCOUNTS = [
  { label: "Demo Login as Admin", email: "admin@demo.com" },
  { label: "Demo Login as Tech", email: "tech@demo.com" },
  { label: "Demo Login as Viewer", email: "viewer@demo.com" },
] as const;

function DemoLoginButtons() {
  const { signIn } = useSignIn();
  const [, setLocation] = useLocation();
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!isDevClerkInstance) return null;

  // One full sign-in attempt. Sign-in tokens are single-use, so each attempt
  // mints a fresh token before the ticket exchange.
  // Returns "done" on success, "needs-steps" if Clerk wants extra verification
  // (not retryable), or throws on transient failures (retryable).
  const attemptLogin = async (email: string): Promise<"done" | "needs-steps"> => {
    // Ask the API for a short-lived sign-in token (ticket). Ticket sign-ins
    // bypass Clerk's Client Trust device check, keeping this one-click.
    const resp = await fetch(`${import.meta.env.BASE_URL}api/demo-login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
    if (!resp.ok) {
      throw new Error(`demo-login responded ${resp.status}`);
    }
    const { token } = (await resp.json()) as { token: string };
    const { error: signInError } = await signIn.ticket({ ticket: token });
    if (signInError) {
      throw new Error("ticket exchange failed");
    }
    if (signIn.status !== "complete") {
      return "needs-steps";
    }
    await signIn.finalize({
      navigate: () => setLocation("/board"),
    });
    return "done";
  };

  const loginAs = async (email: string) => {
    if (busyEmail) return;
    setBusyEmail(email);
    setError(null);
    // Clerk's dev instance occasionally rate-limits or hiccups on the ticket
    // exchange; retry a couple of times with a small backoff before giving up.
    const MAX_ATTEMPTS = 3;
    const BACKOFF_MS = [500, 1000];
    try {
      for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
        try {
          const result = await attemptLogin(email);
          if (result === "needs-steps") {
            setError("Demo sign-in needs extra steps — try the form above.");
          }
          return;
        } catch {
          if (attempt < MAX_ATTEMPTS - 1) {
            await new Promise((r) => setTimeout(r, BACKOFF_MS[attempt]));
          }
        }
      }
      setError("Demo sign-in hit a temporary glitch — click the button again.");
    } finally {
      setBusyEmail(null);
    }
  };

  return (
    <div className="mt-4 w-[440px] max-w-full rounded-2xl border bg-white p-4 shadow-sm">
      <p className="mb-3 text-center text-sm font-medium text-muted-foreground">
        Testing? Skip the form:
      </p>
      <div className="flex flex-col gap-2">
        {DEMO_ACCOUNTS.map(({ label, email }) => (
          <button
            key={email}
            type="button"
            disabled={busyEmail !== null}
            onClick={() => loginAs(email)}
            className="inline-flex h-9 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50"
          >
            {busyEmail === email ? "Signing in…" : label}
          </button>
        ))}
      </div>
      {error && (
        <p className="mt-2 text-center text-sm text-destructive">{error}</p>
      )}
    </div>
  );
}

function SignInPage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-background px-4 py-8">
      <SignIn routing="path" path={`${basePath}/sign-in`} signUpUrl={`${basePath}/sign-up`} />
      <DemoLoginButtons />
    </div>
  );
}

function SignUpPage() {
  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-background px-4">
      <SignUp routing="path" path={`${basePath}/sign-up`} signInUrl={`${basePath}/sign-in`} />
    </div>
  );
}

/**
 * App pages require a session: signed-out visitors go to sign-in instead of
 * an app shell full of 401 error states. Clerk's <Show> renders nothing
 * while auth state loads, so there is no flicker.
 */
function Protected({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Show when="signed-in">
        <AppShell>{children}</AppShell>
      </Show>
      <Show when="signed-out">
        <Redirect to="/sign-in" />
      </Show>
    </>
  );
}

function HomeRedirect() {
  return (
    <>
      <Show when="signed-in">
        <Redirect to="/board" />
      </Show>
      <Show when="signed-out">
        <LandingPage />
      </Show>
    </>
  );
}

/**
 * Keeps API requests authorized: attaches a fresh Clerk session token to
 * every API call (tokens are short-lived and the session cookie can go
 * stale, e.g. across API-server restarts or idle tabs), and on a 401 forces
 * a token refresh so the request is retried once with fresh credentials.
 */
function ApiAuthBridge() {
  const { getToken } = useAuth();

  useEffect(() => {
    setAuthTokenGetter(async () => {
      try {
        return await getToken();
      } catch {
        return null;
      }
    });
    setUnauthorizedRetryHandler(async () => {
      const token = await getToken({ skipCache: true });
      return !!token;
    });
    return () => {
      setAuthTokenGetter(null);
      setUnauthorizedRetryHandler(null);
    };
  }, [getToken]);

  return null;
}

function ClerkQueryClientCacheInvalidator() {
  const { addListener } = useClerk();
  const queryClient = useQueryClient();
  const prevUserIdRef = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    const unsubscribe = addListener(({ user }) => {
      const userId = user?.id ?? null;
      if (
        prevUserIdRef.current !== undefined &&
        prevUserIdRef.current !== userId
      ) {
        queryClient.clear();
      }
      prevUserIdRef.current = userId;
    });
    return unsubscribe;
  }, [addListener, queryClient]);

  return null;
}

function ClerkProviderWithRoutes() {
  const [, setLocation] = useLocation();

  return (
    <ClerkProvider
      publishableKey={clerkPubKey}
      proxyUrl={clerkProxyUrl}
      appearance={clerkAppearance}
      signInUrl={`${basePath}/sign-in`}
      signUpUrl={`${basePath}/sign-up`}
      localization={{
        signIn: {
          start: {
            title: "Welcome back",
            subtitle: "Sign in to Superior Patio Covers",
          },
        },
        signUp: {
          start: {
            title: "Create account",
            subtitle: "Join Superior Patio Covers",
          },
        },
      }}
      routerPush={(to) => setLocation(stripBase(to))}
      routerReplace={(to) => setLocation(stripBase(to), { replace: true })}
    >
      <QueryClientProvider client={queryClient}>
        <ApiAuthBridge />
        <ClerkQueryClientCacheInvalidator />
        <Toaster />
        <Switch>
          <Route path="/" component={HomeRedirect} />
          <Route path="/sign-in/*?" component={SignInPage} />
          <Route path="/sign-up/*?" component={SignUpPage} />
          
          <Route path="/sales">
            <Protected>
              <SalesPage />
            </Protected>
          </Route>
          <Route path="/board">
            <Protected>
              <BoardPage />
            </Protected>
          </Route>
          <Route path="/list">
            <Protected>
              <ListPage />
            </Protected>
          </Route>
          <Route path="/team">
            <Protected>
              <TeamPage />
            </Protected>
          </Route>
          <Route path="/feedback">
            <Protected>
              <FeedbackPage />
            </Protected>
          </Route>
          <Route path="/settings">
            <Protected>
              <SettingsPage />
            </Protected>
          </Route>
          <Route>
            <HomeRedirect />
          </Route>
        </Switch>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

function App() {
  return (
    <WouterRouter base={basePath}>
      <ClerkProviderWithRoutes />
    </WouterRouter>
  );
}

export default App;
