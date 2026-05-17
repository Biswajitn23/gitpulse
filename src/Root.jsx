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

export default function Root() {
  useEffect(() => {
    if (!globalThis[BANNER_FLAG]) {
      globalThis[BANNER_FLAG] = true;
      console.log('%c%s', ASCII_BANNER_STYLE, ASCII_BANNER.trim());
    }

    if (window.matchMedia('(hover: none), (pointer: coarse)').matches) {
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
    <>
      <App />
    </>
  );
}