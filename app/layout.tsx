import type { Metadata } from "next";
import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import "./globals.css";
import { Providers } from "@/components/providers";
import { AppBarNav } from "@/components/nav/AppBarNav";
import { AppFooter } from "@/components/nav/AppFooter";
import Container from "@mui/material/Container";
import Box from "@mui/material/Box";
import { connection } from "next/server";
import { cookies } from "next/headers";
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
  const savedColorMode = (await cookies()).get(COLOR_MODE_COOKIE)?.value;
  const initialColorMode = isColorMode(savedColorMode) ? savedColorMode : "light";

  return (
    <html lang="en" data-color-mode={initialColorMode}>
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
          </Providers>
        </AppRouterCacheProvider>
      </body>
    </html>
  );
}
