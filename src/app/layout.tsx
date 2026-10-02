import type { Metadata } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrument = Instrument_Serif({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-instrument",
});

export const metadata: Metadata = {
  title: {
    default: "GSplat · Room reconstruction",
    template: "%s · GSplat",
  },
  description:
    "Upload a 360 or walkthrough of a room. Frames become a 3D environment you can look around in.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${instrument.variable} h-full antialiased`}
    >
      <body className="min-h-full bg-ink font-sans text-paper">{children}</body>
    </html>
  );
}
