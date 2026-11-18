import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { BannerPageType, PublicBannerDeliveryItem } from '../types';
import { fetchPublicBannersClient, validateClientInternalCtaRoute } from '../utils/bannerManagementApi';
import { ChevronLeft, ChevronRight, Play, Pause } from 'lucide-react';

interface ResponsiveBannerRendererProps {
  pageType: BannerPageType;
  pageId?: string | null;
  placement?: string;
  onNavigateRoute?: (internalRoute: string) => void;
  fallback?: React.ReactNode;
  className?: string;
}

interface FlattenedRenderSlide {
  key: string;
  bannerId: string;
  title: string;
  subtitle: string;
  mediaType: 'video' | 'image';
  slideDurationSec: number;
  autoplay: boolean;
  loop: boolean;
  mobile: { url: string; mimeType: string } | null;
  desktop: { url: string; mimeType: string } | null;
  mobilePoster: { url: string; mimeType?: string } | null;
  desktopPoster: { url: string; mimeType?: string } | null;
  cta: { label: string; route: string } | null;
}

export default function ResponsiveBannerRenderer({
  pageType,
  pageId = null,
  placement = 'hero',
  onNavigateRoute,
  fallback = null,
  className = '',
}: ResponsiveBannerRendererProps) {
  const [banners, setBanners] = useState<PublicBannerDeliveryItem[]>([]);
  const [carouselEnabled, setCarouselEnabled] = useState<boolean>(false);
  const [loaded, setLoaded] = useState<boolean>(false);
  const [activeIndex, setActiveIndex] = useState<number>(0);
  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() =>
    typeof window !== 'undefined' ? window.innerWidth < 768 : false
  );
  const [reducedMotion, setReducedMotion] = useState<boolean>(() =>
    typeof window !== 'undefined' && typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false
  );
  const [manualPaused, setManualPaused] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const isInViewportRef = useRef<boolean>(true);

  // Track viewport width for responsive mobile (4:5) vs desktop (8:3) asset selection
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => setIsMobileViewport(window.innerWidth < 768);
    window.addEventListener('resize', handleResize, { passive: true });
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Track prefers-reduced-motion media query
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener?.('change', handler);
    return () => mq.removeEventListener?.('change', handler);
  }, []);

  // Fetch public active & scheduled banners with exact pageId -> generic fallback precedence
  useEffect(() => {
    let cancelled = false;
    setLoaded(false);
    fetchPublicBannersClient({ pageType, pageId, placement })
      .then((res) => {
        if (cancelled) return;
        setBanners(res.effectiveBanners || []);
        setCarouselEnabled(Boolean(res.carouselEnabled));
        setActiveIndex(0);
        setLoaded(true);
      })
      .catch(() => {
        if (!cancelled) {
          setBanners([]);
          setLoaded(true);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [pageType, pageId, placement]);

  // Flatten banners + multi-media slides[] into ordered renderable slider items
  const slides = useMemo<FlattenedRenderSlide[]>(() => {
    const out: FlattenedRenderSlide[] = [];
    for (const b of banners) {
      const duration =
        Number.isFinite(Number(b.slideDurationSec)) && Number(b.slideDurationSec) >= 2
          ? Number(b.slideDurationSec)
          : 6;

      if (Array.isArray(b.slides) && b.slides.length > 0) {
        // Include primary asset first if it differs from slides[0]
        const primaryUrl = b.desktop?.url || b.mobile?.url;
        const firstSlideUrl = b.slides[0]?.desktop?.url || b.slides[0]?.mobile?.url;
        if (primaryUrl && primaryUrl !== firstSlideUrl) {
          out.push({
            key: `${b.id}_primary`,
            bannerId: b.id,
            title: b.title,
            subtitle: b.subtitle,
            mediaType: b.mediaType,
            slideDurationSec: duration,
            autoplay: b.playback.autoplay,
            loop: b.playback.loop,
            mobile: b.mobile,
            desktop: b.desktop,
            mobilePoster: b.mobilePoster,
            desktopPoster: b.desktopPoster,
            cta: b.cta,
          });
        }
        const sortedSlides = [...b.slides].sort((x, y) => (x.sortOrder ?? 1) - (y.sortOrder ?? 1));
        for (const s of sortedSlides) {
          if (!s.desktop?.url && !s.mobile?.url) continue;
          out.push({
            key: `${b.id}_${s.id}`,
            bannerId: b.id,
            title: s.title || b.title,
            subtitle: s.subtitle !== undefined ? s.subtitle : b.subtitle,
            mediaType: s.mediaType,
            slideDurationSec:
              Number.isFinite(Number(s.slideDurationSec)) && Number(s.slideDurationSec) >= 2
                ? Number(s.slideDurationSec)
                : duration,
            autoplay: b.playback.autoplay,
            loop: b.playback.loop,
            mobile: s.mobile || s.desktop,
            desktop: s.desktop || s.mobile,
            mobilePoster: s.mobilePoster || b.mobilePoster,
            desktopPoster: s.desktopPoster || b.desktopPoster,
            cta: s.cta || b.cta,
          });
        }
      } else {
        out.push({
          key: b.id,
          bannerId: b.id,
          title: b.title,
          subtitle: b.subtitle,
          mediaType: b.mediaType,
          slideDurationSec: duration,
          autoplay: b.playback.autoplay,
          loop: b.playback.loop,
          mobile: b.mobile,
          desktop: b.desktop,
          mobilePoster: b.mobilePoster,
          desktopPoster: b.desktopPoster,
          cta: b.cta,
        });
      }
    }
    return carouselEnabled || out.length > 1 ? out : out.slice(0, 1);
  }, [banners, carouselEnabled]);

  // Auto-advance slider timer based on configured slideDurationSec
  useEffect(() => {
    if (slides.length <= 1 || reducedMotion || manualPaused) return;
    const currentSlide = slides[activeIndex] || slides[0];
    const intervalMs = Math.max(2000, (currentSlide?.slideDurationSec || 6) * 1000);

    const timer = setTimeout(() => {
      if (!isInViewportRef.current || (typeof document !== 'undefined' && document.hidden)) {
        return;
      }
      setActiveIndex((prev) => (prev + 1) % slides.length);
    }, intervalMs);

    return () => clearTimeout(timer);
  }, [slides, activeIndex, reducedMotion, manualPaused]);

  // Pause video when scrolled off-screen or when browser tab is backgrounded
  useEffect(() => {
    const containerEl = containerRef.current;
    if (!containerEl) return;

    const syncPlaybackState = () => {
      const v = videoRef.current;
      if (!v) return;
      const shouldPause =
        reducedMotion ||
        manualPaused ||
        !isInViewportRef.current ||
        (typeof document !== 'undefined' && document.hidden);
      if (shouldPause) {
        v.pause();
      } else {
        v.play().catch(() => {});
      }
    };

    const observer =
      typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver(
            (entries) => {
              const entry = entries[0];
              isInViewportRef.current = Boolean(entry?.isIntersecting);
              syncPlaybackState();
            },
            { threshold: 0.25 }
          )
        : null;

    observer?.observe(containerEl);
    document.addEventListener('visibilitychange', syncPlaybackState);

    return () => {
      observer?.disconnect();
      document.removeEventListener('visibilitychange', syncPlaybackState);
    };
  }, [slides, activeIndex, isMobileViewport, reducedMotion, manualPaused]);

  if (!loaded || slides.length === 0) {
    return <>{fallback}</>;
  }

  const current = slides[activeIndex] || slides[0];
  const activeAsset = isMobileViewport
    ? current.mobile || current.desktop
    : current.desktop || current.mobile;
  const activePoster = isMobileViewport
    ? current.mobilePoster || current.desktopPoster
    : current.desktopPoster || current.mobilePoster;

  const handleCtaClick = (route: string) => {
    const check = validateClientInternalCtaRoute(route, false);
    if (!check.valid) return;
    if (onNavigateRoute) {
      onNavigateRoute(check.normalized);
    } else if (typeof window !== 'undefined') {
      window.history.pushState({}, '', check.normalized);
    }
  };

  return (
    <section
      ref={containerRef}
      aria-label={current.title || 'Promotional Banner'}
      className={`relative overflow-hidden rounded-3xl bg-slate-900 text-white shadow-md ${
        isMobileViewport ? 'aspect-[4/5] max-h-[420px] w-full' : 'aspect-[8/3] max-h-[360px] w-full'
      } ${className}`}
    >
      {/* Poster-only experience for reduced-motion users, or muted looped video */}
      {current.mediaType === 'video' && activeAsset?.url && !reducedMotion ? (
        <video
          ref={videoRef}
          key={`${current.key}-${isMobileViewport ? 'm' : 'd'}-${activeAsset.url}`}
          src={activeAsset.url}
          poster={activePoster?.url}
          muted
          loop={current.loop}
          autoPlay={current.autoplay && !manualPaused}
          playsInline
          className="w-full h-full object-cover"
        />
      ) : activePoster?.url || activeAsset?.url ? (
        <img
          key={`${current.key}-${isMobileViewport ? 'm' : 'd'}-img`}
          src={activePoster?.url || activeAsset?.url}
          alt={current.title}
          className="w-full h-full object-cover"
          referrerPolicy="no-referrer"
        />
      ) : null}

      {/* Text & Safe Internal CTA Overlay */}
      <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/35 to-transparent flex flex-col justify-end md:justify-center p-6 md:p-10">
        <div className="max-w-lg space-y-2">
          <h3 className="text-xl md:text-2xl font-extrabold tracking-tight drop-shadow-xs">
            {current.title}
          </h3>
          {current.subtitle && (
            <p className="text-xs md:text-sm text-emerald-100 drop-shadow-2xs">
              {current.subtitle}
            </p>
          )}
          {current.cta?.route && (
            <div className="pt-2">
              <button
                type="button"
                onClick={() => handleCtaClick(current.cta!.route)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-[#22C55E] hover:bg-emerald-600 text-white text-xs font-extrabold shadow-md transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-white"
              >
                <span>{current.cta.label || 'Shop Now'}</span>
                <span>&rarr;</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Accessible Play/Pause Control for Video or Multi-Slide Slider */}
      {((current.mediaType === 'video' && activeAsset?.url) || slides.length > 1) && !reducedMotion && (
        <button
          type="button"
          onClick={() => {
            const next = !manualPaused;
            setManualPaused(next);
            if (videoRef.current) {
              if (next) videoRef.current.pause();
              else videoRef.current.play().catch(() => {});
            }
          }}
          aria-label={manualPaused ? 'Play banner slider' : 'Pause banner slider'}
          className="absolute top-3 right-3 px-2.5 py-1.5 rounded-full bg-black/55 hover:bg-black/80 text-white text-[10px] font-mono flex items-center gap-1.5 transition cursor-pointer focus:outline-none focus:ring-2 focus:ring-white"
        >
          {manualPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
          {slides.length > 1 && (
            <span>
              {activeIndex + 1}/{slides.length} • {current.slideDurationSec}s
            </span>
          )}
        </button>
      )}

      {/* Multi-Slide Slider Controls */}
      {slides.length > 1 && (
        <>
          <button
            type="button"
            aria-label="Previous slide"
            onClick={() => setActiveIndex((prev) => (prev - 1 + slides.length) % slides.length)}
            className="absolute left-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/45 hover:bg-black/70 text-white cursor-pointer"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <button
            type="button"
            aria-label="Next slide"
            onClick={() => setActiveIndex((prev) => (prev + 1) % slides.length)}
            className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/45 hover:bg-black/70 text-white cursor-pointer"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 flex items-center gap-1.5">
            {slides.map((s, idx) => (
              <button
                key={s.key}
                type="button"
                aria-label={`Show slide ${idx + 1}: ${s.title}`}
                onClick={() => setActiveIndex(idx)}
                className={`h-2 rounded-full transition-all cursor-pointer ${
                  idx === activeIndex ? 'w-5 bg-white' : 'w-2 bg-white/45'
                }`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
