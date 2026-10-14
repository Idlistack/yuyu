import type { Metadata } from "next";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "@fontsource-variable/figtree/wght.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./globals.css";
import "./styles/legacy.css";
import { Providers } from "@/components/providers";
import { AppBarNav } from "@/components/nav/AppBarNav";
import { AppFooter } from "@/components/nav/AppFooter";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import Script from "next/script";
import { connection } from "next/server";
import { cookies, headers } from "next/headers";
import { COLOR_MODE_COOKIE, isColorMode } from "@/lib/colorMode";

export const metadata: Metadata = {
  title: {
    default: "Yuyu — Events",
    template: "%s · Yuyu",
  },
  description: "Create organisations, publish events, and collect RSVPs.",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // A per-request CSP nonce is injected by proxy.ts. Waiting for the incoming
  // request lets Next.js attach that nonce to every framework script.
  await connection();
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  const savedColorMode = (await cookies()).get(COLOR_MODE_COOKIE)?.value;
  // No saved choice: omit the attribute so the tokens follow the operating system.
  const initialColorMode = isColorMode(savedColorMode) ? savedColorMode : null;

  return (
    <html lang="en" data-color-mode={initialColorMode ?? undefined} suppressHydrationWarning>
      <body style={{ display: "flex", flexDirection: "column", minHeight: "100dvh" }}>
        <AppRouterCacheProvider options={{ key: "mui" }}>
          <Providers initialColorMode={initialColorMode}>
            <a className="skip-link" href="#main-content">Skip to main content</a>
            <AppBarNav />
            <Box component="main" id="main-content" tabIndex={-1} sx={{ flex: 1, py: 3 }}>
              <Container
                maxWidth={false}
                sx={{ width: "100%", maxWidth: 1440, mx: "auto", px: { xs: 2, sm: 3, lg: 4 } }}
              >
                {children}
              </Container>
            </Box>
            <AppFooter />
            <Script id="plausible-init" nonce={nonce} strategy="afterInteractive">
              {`window.plausible=window.plausible||function(){(plausible.q=plausible.q||[]).push(arguments)},plausible.init=plausible.init||function(i){plausible.o=i||{}};
plausible.init({transformRequest:function(event){try{var url=new URL(event.u);if(/^\\/ticket\\/[^/]+$/.test(url.pathname)||/^\\/join\\/(?:org|event-collaborator)\\/[^/]+$/.test(url.pathname)||url.pathname==="/reset-password"||url.pathname==="/verify-email")return null;event.u=url.origin+url.pathname;return event}catch{return null}}});`}
            </Script>
            <Script
              id="plausible-analytics"
              src="https://analytics.idliapps.com/js/pa-CBO8W5MlbliaOYtCPN9he.js"
              nonce={nonce}
              strategy="afterInteractive"
            />
          </Providers>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
