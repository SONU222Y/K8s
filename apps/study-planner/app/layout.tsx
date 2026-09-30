import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "StudyPlan",
  description: "Paste your syllabus, set your exam date and get a day-by-day study plan.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f7fb" },
    { media: "(prefers-color-scheme: dark)", color: "#11131a" },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">
          Skip to content
        </a>
        <header className="site-header">
          <div className="container header-inner">
            <span className="logo" aria-hidden="true">
              SP
            </span>
            <div>
              <p className="brand">StudyPlan</p>
              <p className="tagline">From syllabus to a day-by-day plan</p>
            </div>
          </div>
        </header>
        {children}
        <footer className="site-footer">
          <div className="container">
            <p>Your plan and progress are saved in this browser only.</p>
          </div>
        </footer>
      </body>
    </html>
  );
}
