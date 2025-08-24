import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { WalletButton } from "./WalletButton";
import { useAccount } from "wagmi";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";


interface StartScreenProps {
  onStart: () => void;
  onShowLeaderboard: () => void;
}

const StartScreen = ({ onStart, onShowLeaderboard }: StartScreenProps) => {
  const { isConnected } = useAccount();
  const introAudioRef = useRef<HTMLAudioElement | null>(null);

  // This effect handles the intro audio playback.
  useEffect(() => {
    introAudioRef.current?.play().catch(error => {
      console.log("Audio autoplay was prevented by the browser:", error);
    });
    return () => {};
  }, []);

  // Rarity guide data
  const rarityGuide = [
    { name: "Bee", image: "/animals/bee.gif", points: 1, rarity: "common" },
    { name: "Butterfly", image: "/animals/butterfly.gif", points: 2, rarity: "uncommon" },
    { name: "Fly", image: "/animals/fly.gif", points: 5, rarity: "rare" },
    { name: "Ava", image: "/animals/ava.gif", points: 10, rarity: "legendary" },
  ] as const;

  return (
    <div
      className="min-h-screen w-full flex flex-col items-center justify-center bg-background text-foreground font-press-start overflow-hidden p-2 sm:p-4 relative"
      style={{
        backgroundImage: "url('/bg.jpg'), url('/background.jpg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      {/* Wallet connection pinned to top-right */}
      <div className="absolute top-4 right-4 z-20">
        <WalletButton />
      </div>
      <audio ref={introAudioRef} src="/audio/intro.mp3" preload="auto" />



      {/* The main title container */}
      <div className="relative mb-8 sm:mb-12 z-10">
        {/* Title */}
        <h1 
          className="text-center leading-tight whitespace-nowrap px-2 overflow-hidden"
          style={{ 
            fontSize: 'clamp(1.5rem, 6vw, 6rem)', // Much better scaling range for landscape
            lineHeight: '1.1', // Tighter line height for single line
            minHeight: '1.1em', // Ensure consistent height
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            maxWidth: '100vw',
            overflow: 'hidden',
            textOverflow: 'ellipsis'
          }}
        >
          smash2cash
        </h1>
      </div>

      <div className="flex flex-col gap-3 sm:gap-4 z-10 items-center w-full max-w-4xl">

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 w-full">
          <TooltipProvider>
            <Tooltip delayDuration={100}>
              <TooltipTrigger asChild>
                <span tabIndex={!isConnected ? 0 : -1}>
                  <Button
                    onClick={onStart}
                    disabled={!isConnected}
                    className="bg-red-600 text-white hover:bg-red-700 font-press-start text-base sm:text-lg px-6 sm:px-8 py-3 sm:py-4 disabled:opacity-50 disabled:cursor-not-allowed"
                    style={!isConnected ? { pointerEvents: "none" } : {}}
                  >
                    Play Game
                  </Button>
                </span>
              </TooltipTrigger>
              {!isConnected && (
                <TooltipContent className="bg-red-600 text-white border-red-700">
                  <p>Connect your wallet to play</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>

          <Button
            onClick={onShowLeaderboard}
            className="bg-red-500 text-white hover:bg-red-600 font-press-start text-base sm:text-lg px-6 sm:px-8 py-3 sm:py-4"
          >
            Leaderboard
          </Button>
        </div>
      </div>

      {/* Rarity Guide */}
      <div className="w-full max-w-5xl mt-32 sm:mt-36 md:mt-40 lg:mt-44 px-4 z-10">
        <h2 className="text-center text-lg sm:text-xl mb-4">Rarity Guide</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 md:gap-3 lg:gap-4">
          {rarityGuide.map((item) => (
            <div
              key={item.name}
              className="bg-transparent border-2 border-white/30 text-foreground font-press-start 
                         flex flex-col items-center justify-center gap-2 p-2 
                         min-h-[120px] sm:min-h-[140px] md:min-h-[160px] lg:min-h-[180px]
                         hover:border-white/50 hover:scale-105 transition-all duration-300
                         rounded-lg backdrop-blur-sm"
            >
              <p className="text-xs sm:text-sm md:text-base font-bold text-white text-center">
                {item.name}
              </p>
              <img
                src={item.image}
                alt={item.name}
                className="w-10 h-10 sm:w-14 sm:h-14 md:w-16 md:h-16 lg:w-20 lg:h-20 object-contain"
              />
              <p className="text-xs sm:text-sm font-bold text-white">+{item.points} pts</p>
              <p className="text-xs text-muted-foreground capitalize">{item.rarity}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default StartScreen;