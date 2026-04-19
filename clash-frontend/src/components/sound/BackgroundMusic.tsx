import { useCallback, useEffect, useRef, useState } from 'react';
import bgSrc from './gameaudio.mp3?url';
import './BackgroundMusic.css';

const STORAGE_KEY = 'clash-bg-music-muted';

/**
 * Looping ambient track for the whole app. Persists mute in localStorage.
 * Browsers may block autoplay until the first user gesture; we retry on pointerdown once.
 */
export function BackgroundMusic() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [muted, setMuted] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const syncAudio = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    el.muted = muted;
    void el.play().catch(() => {
      /* blocked until user gesture — unlock listener handles retry */
    });
  }, [muted]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;
    el.volume = 0.28;
    el.loop = true;
    el.muted = muted;
    syncAudio();
  }, [muted, syncAudio]);

  useEffect(() => {
    const unlock = () => syncAudio();
    document.addEventListener('pointerdown', unlock, { once: true });
    return () => document.removeEventListener('pointerdown', unlock);
  }, [syncAudio]);

  const toggle = () => {
    setMuted((m) => {
      const next = !m;
      try {
        localStorage.setItem(STORAGE_KEY, next ? '1' : '0');
      } catch {
        /* ignore */
      }
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
        type="button"
        className="layout-music-btn"
        onClick={toggle}
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
