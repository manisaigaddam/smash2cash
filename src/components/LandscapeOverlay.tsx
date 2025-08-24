import { useEffect, useState } from "react";

interface LandscapeOverlayProps {
  children: React.ReactNode;
}

const LandscapeOverlay = ({ children }: LandscapeOverlayProps) => {
  const [isLandscape, setIsLandscape] = useState(true);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkOrientation = () => {
      const isMobileDevice = window.innerWidth <= 768;
      const isLandscapeMode = window.innerWidth > window.innerHeight;
      setIsMobile(isMobileDevice);
      setIsLandscape(isLandscapeMode);
    };

    checkOrientation();
    window.addEventListener('resize', checkOrientation);
    window.addEventListener('orientationchange', checkOrientation);

    return () => {
      window.removeEventListener('resize', checkOrientation);
      window.removeEventListener('orientationchange', checkOrientation);
    };
  }, []);

  return (
    <>
      {/* Always render children to preserve state */}
      {children}
      
      {/* Show landscape overlay only for mobile devices in portrait mode */}
      {isMobile && !isLandscape && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center p-4">
          <div className="text-center max-w-md mx-auto">
            <div className="text-6xl mb-6 animate-spin">🔄</div>
            <h1 className="text-2xl md:text-3xl mb-4 font-bold font-press-start">
              Rotate Your Device
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-6 font-press-start">
              For the best gaming experience, please rotate your device to landscape mode.
            </p>
            <div className="text-4xl animate-bounce">📱➡️🖥️</div>
            <div className="mt-6 text-sm text-muted-foreground">
              This game is optimized for landscape mode
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default LandscapeOverlay; 