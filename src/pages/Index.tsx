import { useState, useContext } from "react";
import StartScreen from "@/components/StartScreen";
import GameScreen from "@/components/GameScreen";
import LeaderboardScreen from "@/components/LeaderboardScreen";
import { SessionParamsContext } from "../App";

const Index = () => {
  const [currentScreen, setCurrentScreen] = useState<'start' | 'game' | 'leaderboard'>('start');
  const { setSessionName, setSessionPassword } = useContext(SessionParamsContext);

  const handleStart = () => {
    setSessionName(null);
    setSessionPassword(null);
    setCurrentScreen('game');
  };

  const handleBackToMenu = () => {
    setCurrentScreen('start');
    setSessionName(null);
    setSessionPassword(null);
  };

  const handleShowLeaderboard = () => {
    setCurrentScreen('leaderboard');
  };

  const handleBackFromLeaderboard = () => {
    setCurrentScreen('start');
  };

  return (
    <div className="min-h-screen overflow-hidden">
      {currentScreen === 'start' && <StartScreen onStart={handleStart} onShowLeaderboard={handleShowLeaderboard} />}
      {currentScreen === 'game' && <GameScreen onBackToMenu={handleBackToMenu} />}
      {currentScreen === 'leaderboard' && <LeaderboardScreen onBack={handleBackFromLeaderboard} />}
    </div>
  );
};

export default Index;
