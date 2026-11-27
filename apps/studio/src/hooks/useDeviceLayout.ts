import { useEffect, useMemo, useState } from "react";
import { UiLayoutMode, useStudioStore } from "../store/useStudioStore";

export type DeviceLayoutProfile =
  | "desktop"
  | "phone-portrait"
  | "phone-landscape"
  | "tablet-portrait"
  | "tablet-landscape";

export interface DeviceLayoutInfo {
  profile: DeviceLayoutProfile;
  isTouch: boolean;
  isRemoteHost: boolean;
  isPhone: boolean;
  isTablet: boolean;
  isMobileOrTablet: boolean;
  orientation: "portrait" | "landscape";
  width: number;
  height: number;
  uiLayoutMode: UiLayoutMode;
}

function detectTouchCapable(): boolean {
  if (typeof window === "undefined") return false;
  const coarse = window.matchMedia?.("(pointer: coarse)").matches ?? false;
  const noHover = window.matchMedia?.("(hover: none)").matches ?? false;
  const maxTouch = typeof navigator !== "undefined" ? navigator.maxTouchPoints ?? 0 : 0;
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  const mobileUa = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|Tablet/i.test(ua);
  // iPadOS 13+ reports Macintosh with touch points > 1
  const ipadOs = /Macintosh/i.test(ua) && maxTouch > 1;
  return coarse || (noHover && maxTouch > 0) || mobileUa || ipadOs;
}

function detectRemoteHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname.toLowerCase();
  return host !== "localhost" && host !== "127.0.0.1" && host !== "::1" && host !== "";
}

function resolveProfile(
  width: number,
  height: number,
  isTouch: boolean,
  mode: UiLayoutMode,
): DeviceLayoutProfile {
  const orientation: "portrait" | "landscape" = height >= width ? "portrait" : "landscape";
  const shortSide = Math.min(width, height);
  const longSide = Math.max(width, height);

  if (mode === "desktop") {
    return "desktop";
  }

  if (mode === "mobile") {
    // Forced mobile/tablet preview mode (adapts cleanly to portrait/landscape and screen size)
    if (shortSide < 600 || width < 768) {
      return orientation === "portrait" ? "phone-portrait" : "phone-landscape";
    }
    return orientation === "portrait" ? "tablet-portrait" : "tablet-landscape";
  }

  // Auto-detection: triggers on phones, tablets, remote mobile browsers, and compact windows
  const isPhoneAuto =
    (orientation === "portrait" && width < 768) ||
    (orientation === "landscape" && shortSide < 540 && longSide < 1024);

  if (isPhoneAuto) {
    return orientation === "portrait" ? "phone-portrait" : "phone-landscape";
  }

  const isTabletAuto =
    (isTouch && width <= 1366) ||
    width < 1060 ||
    (orientation === "portrait" && width < 1180);

  if (isTabletAuto) {
    return orientation === "portrait" ? "tablet-portrait" : "tablet-landscape";
  }

  return "desktop";
}

export function useDeviceLayout(): DeviceLayoutInfo {
  const uiLayoutMode = useStudioStore((s) => s.uiLayoutMode);
  const [metrics, setMetrics] = useState(() => ({
    width: typeof window !== "undefined" ? window.innerWidth : 1440,
    height: typeof window !== "undefined" ? window.innerHeight : 900,
    isTouch: detectTouchCapable(),
    isRemoteHost: detectRemoteHost(),
  }));

  useEffect(() => {
    const update = () => {
      setMetrics({
        width: window.innerWidth,
        height: window.innerHeight,
        isTouch: detectTouchCapable(),
        isRemoteHost: detectRemoteHost(),
      });
    };

    window.addEventListener("resize", update);
    window.addEventListener("orientationchange", update);
    const mq = window.matchMedia?.("(pointer: coarse)");
    mq?.addEventListener?.("change", update);

    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("orientationchange", update);
      mq?.removeEventListener?.("change", update);
    };
  }, []);

  return useMemo(() => {
    const profile = resolveProfile(metrics.width, metrics.height, metrics.isTouch, uiLayoutMode);
    const orientation: "portrait" | "landscape" =
      metrics.height >= metrics.width ? "portrait" : "landscape";
    const isPhone = profile === "phone-portrait" || profile === "phone-landscape";
    const isTablet = profile === "tablet-portrait" || profile === "tablet-landscape";

    return {
      profile,
      isTouch: metrics.isTouch,
      isRemoteHost: metrics.isRemoteHost,
      isPhone,
      isTablet,
      isMobileOrTablet: profile !== "desktop",
      orientation,
      width: metrics.width,
      height: metrics.height,
      uiLayoutMode,
    };
  }, [metrics, uiLayoutMode]);
}
