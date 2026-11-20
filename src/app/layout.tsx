import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ClerkProvider, Show, SignInButton, UserButton } from "@clerk/nextjs";
import { MarkIcon } from "@/components/Icons";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "Daily AI",
    template: "%s · Daily AI",
  },
  description: "오늘의 집중 타이머, 캘린더, AI 취업 로드맵, 학습 코치, AirPods 학습 감지를 한 곳에서",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body>
        <ClerkProvider>
          <header className="app-header">
            <div className="app-header-inner">
              <Link href="/" className="app-header-brand">
                <span className="app-mark"><MarkIcon /></span>
                <h1>Daily AI</h1>
              </Link>
              <div className="app-header-right">
                <nav className="app-nav">
                  <Link href="/">오늘</Link>
                  <Link href="/schedule">일정</Link>
                  <Link href="/roadmap">로드맵</Link>
                  <Link href="/study">학습 코치</Link>
                  <Link href="/posture">학습 감지</Link>
                </nav>
                <Show when="signed-out">
                  <SignInButton mode="modal">
                    <button type="button" className="chip">로그인</button>
                  </SignInButton>
                </Show>
                <Show when="signed-in">
                  <UserButton />
                </Show>
              </div>
            </div>
          </header>
          <main>{children}</main>
        </ClerkProvider>
      </body>
    </html>
  );
}
