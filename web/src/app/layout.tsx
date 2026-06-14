import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atlas",
  description: "גילוי והשוואת יעדי טיול — מפה אינטראקטיבית",
};

// NOTE: Babel (not SWC) is configured via .babelrc, so `next/font` is unavailable
// (it throws ERR_INVALID_ARG_TYPE). Fonts are loaded with a plain <link> instead.
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="he" dir="rtl">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Heebo:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="font-sans">{children}</body>
    </html>
  );
}
