import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { ConvexClientProvider } from "./ConvexClientProvider";
import appCss from "./globals.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Li Xi Station | Prize Draw Campaign Studio" },
      {
        name: "description",
        content:
          "SaaS prize-draw platform for branded lucky campaigns, public claim links, campaign assets, and premium guest experiences.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "preconnect",
        href: "https://fonts.gstatic.com",
        crossOrigin: "anonymous",
      },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Cinzel+Decorative:wght@700;900&family=Playfair+Display:ital,wght@0,400;0,700;1,400&family=Noto+Serif:wght@400;600;700&display=swap",
      },
    ],
  }),
  component: RootDocument,
});

function RootDocument() {
  return (
    <html lang="vi">
      <head>
        <HeadContent />
      </head>
      <body>
        <ConvexClientProvider>
          <Outlet />
        </ConvexClientProvider>
        <Scripts />
      </body>
    </html>
  );
}
