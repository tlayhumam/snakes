"use client";

import { useEffect, useState } from "react";
import { Download, Share2, X } from "lucide-react";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "snakes-pwa-install-dismissed";
const DISMISS_FOR_MS = 7 * 24 * 60 * 60 * 1000;

function isInstalled() {
  const iosNavigator = navigator as Navigator & { standalone?: boolean };
  return iosNavigator.standalone === true
    || window.matchMedia("(display-mode: standalone)").matches
    || window.matchMedia("(display-mode: fullscreen)").matches;
}

export function PwaInstallPrompt() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [ios, setIos] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === "production" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" });
    }

    if (isInstalled()) return;

    const dismissedAt = Number(window.localStorage.getItem(DISMISS_KEY) || 0);
    if (Date.now() - dismissedAt < DISMISS_FOR_MS) return;

    const isiOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const revealTimer = window.setTimeout(() => {
      setIos(isiOS);
      setVisible(isiOS);
    }, 0);

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
      setVisible(true);
    };
    const handleInstalled = () => setVisible(false);
    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    return () => {
      window.clearTimeout(revealTimer);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  const dismiss = () => {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setVisible(false);
  };

  const install = async () => {
    if (!installPrompt) return;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setVisible(false);
    setInstallPrompt(null);
  };

  if (!visible) return null;

  return <aside className="pwa-install" aria-label="تثبيت لعبة سنيكس">
    <span className="pwa-install-icon">S</span>
    <div className="pwa-install-copy">
      <strong>العب بملء الشاشة</strong>
      <span>{ios ? <>اضغط <Share2 aria-hidden="true" /> مشاركة، ثم «إضافة إلى الشاشة الرئيسية»</> : "ثبّت سنيكس لإخفاء شريط المتصفح واللعب كتطبيق."}</span>
    </div>
    {!ios && installPrompt && <button className="pwa-install-action" onClick={() => void install()}><Download /> تثبيت</button>}
    <button className="pwa-install-close" onClick={dismiss} aria-label="إغلاق رسالة التثبيت"><X /></button>
  </aside>;
}
