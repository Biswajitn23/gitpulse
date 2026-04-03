import { useEffect, useState } from 'react';
import Lenis from 'lenis';
import App from './App';

export default function Root() {
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [showInstallPrompt, setShowInstallPrompt] = useState(false);

  useEffect(() => {
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

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredInstallPrompt(event);
      setShowInstallPrompt(true);

      window.setTimeout(() => {
        setShowInstallPrompt(false);
      }, 4500);
    };

    const handleAppInstalled = () => {
      setDeferredInstallPrompt(null);
      setShowInstallPrompt(false);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredInstallPrompt) {
      setShowInstallPrompt(false);
      return;
    }

    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice.catch(() => null);
    setDeferredInstallPrompt(null);
    setShowInstallPrompt(false);
  };

  return (
    <>
      <App />
      {showInstallPrompt && deferredInstallPrompt && (
        <div className="fixed bottom-4 left-1/2 z-[80] w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 sm:bottom-6 sm:w-full">
          <div className="rounded-2xl border border-white/10 bg-[#0b1220]/95 px-4 py-3 shadow-2xl shadow-black/30 backdrop-blur-xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-300">
                <span className="text-lg font-black">+</span>
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-white">Install GitPulse</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-400">Add this app to your device for faster access and a standalone experience.</p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={handleInstallClick}
                    className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-bold text-slate-950 transition-colors hover:bg-emerald-400"
                  >
                    Install
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowInstallPrompt(false)}
                    className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-slate-300 transition-colors hover:bg-white/10"
                  >
                    Not now
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}