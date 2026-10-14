import type { Metadata } from "next";
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "@fontsource-variable/figtree/wght.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ChromeSwitch } from "@/components/chrome/ChromeSwitch";
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
      <body className="flex min-h-dvh flex-col">
          <Providers initialColorMode={initialColorMode}>
            <ChromeSwitch>{children}</ChromeSwitch>
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
      </body>
    </html>
  );
}
