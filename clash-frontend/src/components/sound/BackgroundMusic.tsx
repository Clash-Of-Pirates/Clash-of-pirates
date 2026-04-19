import { useCallback, useEffect, useRef, useState } from 'react';
import bgSrc from './gameaudio.mp3?url';
import './BackgroundMusic.css';

const STORAGE_KEY = 'clash-bg-music-muted';

/**
 * Looping ambient track. Mute preference is persisted.
 * Browsers block audible autoplay until a user gesture; we retry on the first tap/click
 * outside the music control, and the music button starts playback without flipping mute.
 */
export function BackgroundMusic() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const musicButtonRef = useRef<HTMLButtonElement | null>(null);
  const mutedRef = useRef(false);

  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  mutedRef.current = muted;

  const applyMutedToElement = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    el.muted = mutedRef.current;
  }, []);

  const tryStartPlayback = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    applyMutedToElement();
    void el.play().catch(() => {
      /* still gated until gesture in strict browsers */
    });
  }, [applyMutedToElement]);

  // Configure element once
  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = 0.28;
    el.loop = true;
    applyMutedToElement();

    const onReady = () => tryStartPlayback();
    el.addEventListener('canplay', onReady);
    el.addEventListener('canplaythrough', onReady);
    tryStartPlayback();

    return () => {
      el.removeEventListener('canplay', onReady);
      el.removeEventListener('canplaythrough', onReady);
    };
  }, [applyMutedToElement, tryStartPlayback]);

  // Keep mute flag in sync if user toggles elsewhere (future-proof)
  useEffect(() => {
    applyMutedToElement();
  }, [muted, applyMutedToElement]);

  // First user gesture anywhere except the music button starts audio (browser autoplay policy).
  useEffect(() => {
    const onFirstGesture = (e: PointerEvent) => {
      const el = audioRef.current;
      if (!el || !el.paused) return;
      const t = e.target;
      if (t instanceof Node && musicButtonRef.current?.contains(t)) {
        return;
      }
      el.muted = mutedRef.current;
      void el.play().catch(() => {});
    };

    window.addEventListener('pointerdown', onFirstGesture, { capture: true, once: true });
    return () => window.removeEventListener('pointerdown', onFirstGesture, { capture: true });
  }, []);

  // Retry when returning to the tab (sometimes unlocks after a gesture elsewhere).
  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === 'visible') tryStartPlayback();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [tryStartPlayback]);

  const persistMuted = (next: boolean) => {
    try {
      localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
    } catch {
      /* ignore */
    }
  };

  /**
   * If playback never started (autoplay blocked), first activation only starts audio — do not toggle mute.
   * Otherwise toggle mute so one control does both start and mute/unmute.
   */
  const onMusicButtonClick = () => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) {
      applyMutedToElement();
      void el.play().catch(() => {});
      return;
    }
    setMuted((m) => {
      const next = !m;
      persistMuted(next);
      return next;
    });
  };

  return (
    <>
      <audio
        ref={audioRef}
        className="layout-bg-audio"
        src={bgSrc}
        preload="auto"
        playsInline
        loop
      />
      <button
        ref={musicButtonRef}
        type="button"
        className="layout-music-btn"
        onClick={onMusicButtonClick}
        aria-pressed={!muted}
        aria-label={muted ? 'Unmute background music' : 'Mute background music'}
        title={muted ? 'Unmute music' : 'Mute music'}
      >
        <span className="layout-music-btn__icon" aria-hidden>
          {muted ? '🔇' : '🔊'}
        </span>
        <span className="layout-music-btn__text">{muted ? 'MUSIC OFF' : 'MUSIC ON'}</span>
      </button>
    </>
  );
}
