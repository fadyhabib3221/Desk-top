"use client";

import { useEffect } from "react";
import toast from "react-hot-toast";
import { version as appVersion } from "@/package.json";

// كل قد إيه نعيد التشييك على تحديث والتطبيق شغال (بالمللي ثانية)
const CHECK_INTERVAL_MS = 5 * 60 * 1000; // كل 5 دقايق

/**
 * بيتشيك على تحديثات جديدة للتطبيق عند فتحه، وبعدين بيكرر التشييك
 * كل فترة (CHECK_INTERVAL_MS) والتطبيق شغال، وكمان لما نافذة التطبيق
 * ترجع تاخد فوكس (يعني المستخدم رجع يستخدمها بعد ما كانت في الخلفية) —
 * كل ده بس لما يكون شغال جوه Tauri كتطبيق ديسك توب — مش هيعمل حاجة لو
 * التطبيق شغال في متصفح عادي.
 * لو لقى نسخة أحدث على GitHub Releases، بيحمّلها ويثبتها ويعيد فتح
 * التطبيق تلقائيًا. كمان بيحطّ رقم الإصدار في عنوان النافذة.
 */
export default function UpdateChecker() {
  useEffect(() => {
    if (typeof window === "undefined" || !window.__TAURI_INTERNALS__) return;

    let cancelled = false;
    let checking = false;

    (async () => {
      try {
        const { getCurrentWindow } = await import("@tauri-apps/api/window");
        await getCurrentWindow().setTitle(`Travel Agency Management v${appVersion}`);
      } catch (err) {
        console.error("Failed to set window title:", err);
      }
    })();

    const runCheck = async () => {
      if (cancelled || checking) return;
      checking = true;
      try {
        const { check } = await import("@tauri-apps/plugin-updater");
        const { relaunch } = await import("@tauri-apps/plugin-process");

        const update = await check();
        if (cancelled || !update) return;

        toast.loading(`جاري تحميل التحديث ${update.version}...`, {
          id: "app-update",
        });

        await update.downloadAndInstall();

        toast.success("تم تحميل التحديث، سيُعاد تشغيل التطبيق الآن", {
          id: "app-update",
        });

        setTimeout(() => {
          if (!cancelled) relaunch();
        }, 1500);
      } catch (err) {
        // فشل التحقق من التحديث (مثلاً مفيش نت) مش لازم يوقف التطبيق أو يزعج اليوزر
        console.error("Update check failed:", err);
      } finally {
        checking = false;
      }
    };

    // تشييك أول ما التطبيق يفتح
    runCheck();

    // تشييك دوري كل فترة والتطبيق شغال
    const intervalId = setInterval(runCheck, CHECK_INTERVAL_MS);

    // تشييك برضه لما نافذة التطبيق ترجع تاخد فوكس (المستخدم رجع يستخدمها)
    const handleFocus = () => runCheck();
    window.addEventListener("focus", handleFocus);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      window.removeEventListener("focus", handleFocus);
    };
  }, []);

  return null;
}

