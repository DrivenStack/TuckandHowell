import type { Metadata, Viewport } from "next";
import { Hanken_Grotesk } from "next/font/google";
import { AppProviders } from "@/components/app/providers";
import { AppShell } from "@/components/layout/app-shell";
import "./globals.css";

const hanken = Hanken_Grotesk({
  variable: "--font-hanken",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Tuck & Howell Call Center", template: "%s | Tuck & Howell Call Center" },
  description: "Call center visibility for Tuck & Howell Plumbing, Heating & Air.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f3f5f4" },
    { media: "(prefers-color-scheme: dark)", color: "#0d171e" },
  ],
};

/** Applies the saved theme before first paint, so there is no flash. */
const themeScript = `(function(){try{var t=localStorage.getItem("th-theme")||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.classList.toggle("dark",d)}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${hanken.variable} h-full`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      {/* Browser extensions (password managers, translators) add attributes to <body> before React loads. */}
      <body className="min-h-full" suppressHydrationWarning>
        <AppProviders>
          <AppShell>{children}</AppShell>
        </AppProviders>
      </body>
    </html>
  );
}
