import React from 'react';
import { useEffect } from 'react';
import Lenis from 'lenis';
import App from './App';

const ASCII_BANNER = [
  ' ██████╗ ██╗████████╗██████╗ ██╗   ██╗██╗     ███████╗███████╗',
  '██╔════╝ ██║╚══██╔══╝██╔══██╗██║   ██║██║     ██╔════╝██╔════╝',
  '██║  ███╗██║   ██║   ██████╔╝██║   ██║██║     ███████╗█████╗  ',
  '██║   ██║██║   ██║   ██╔═══╝ ██║   ██║██║     ╚════██║██╔══╝  ',
  '╚██████╔╝██║   ██║   ██║     ╚██████╔╝███████╗███████║███████╗',
  ' ╚═════╝ ╚═╝   ╚═╝   ╚═╝      ╚═════╝ ╚══════╝╚══════╝╚══════╝',
].join('\n');

const ASCII_BANNER_STYLE = [
  'font-family: Menlo, Consolas, Monaco, "Courier New", monospace',
  'font-size: 12px',
  'font-weight: 700',
  'line-height: 1.05',
  'white-space: pre',
  'color: #10b981',
  'text-shadow: 0 0 8px rgba(16, 185, 129, 0.25)',
].join('; ');

const BANNER_FLAG = '__gitpulseBannerLogged__';

const RECOVERY_STORAGE_KEYS = [
  'gitpulse-github-token',
  'gitpulse-account-username',
  'gitpulse-account-avatar',
  'gitpulse-last-signed-out-account',
  'gitpulse-alerts-enabled',
  'gitpulse-explicit-logout',
  'gitpulse-notification-cache',
  'gitpulse-last-active-at',
];

function clearGitPulseStorage() {
  if (typeof window === 'undefined') return;

  const storageAreas = [window.localStorage, window.sessionStorage];

  for (const storage of storageAreas) {
    try {
      RECOVERY_STORAGE_KEYS.forEach((key) => storage.removeItem(key));
    } catch {
      // Ignore browsers that block storage access.
    }
  }
}

class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error) {
    console.error('GitPulse crashed on the client:', error);
  }

  handleRecovery = () => {
    clearGitPulseStorage();
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <main className="flex min-h-screen items-center justify-center bg-[#020617] px-4 py-8 text-slate-100">
          <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.03] p-6 text-center shadow-2xl">
            <h1 className="text-2xl font-black text-white">GitPulse</h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-300">
              GitPulse ran into a mobile browser problem.
              Tap reset to clear the app state and reopen.
            </p>
            <button
              type="button"
              onClick={this.handleRecovery}
              className="mt-5 inline-flex items-center justify-center rounded-2xl bg-emerald-400 px-4 py-3 text-sm font-bold text-slate-950 transition-colors hover:bg-emerald-300"
            >
              Reset GitPulse
            </button>
          </section>
        </main>
      );
    }

    return this.props.children;
  }
}

export default function Root() {
  useEffect(() => {
    if (!globalThis[BANNER_FLAG]) {
      globalThis[BANNER_FLAG] = true;
      console.log('%c%s', ASCII_BANNER_STYLE, ASCII_BANNER.trim());
    }

    const canUseMatchMedia = typeof window.matchMedia === 'function';
    const isCoarsePointer = canUseMatchMedia
      ? window.matchMedia('(hover: none), (pointer: coarse)').matches
      : true;

    if (isCoarsePointer) {
      return undefined;
    }

    const lenis = new Lenis({
      duration: 1.1,
      smoothWheel: true,
      wheelMultiplier: 0.9,
      touchMultiplier: 1.2,
    });

    let animationFrameId;

    const raf = (time) => {
      lenis.raf(time);
      animationFrameId = window.requestAnimationFrame(raf);
    };

    animationFrameId = window.requestAnimationFrame(raf);

    return () => {
      window.cancelAnimationFrame(animationFrameId);
      lenis.destroy();
    };
  }, []);

  return (
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  );
}