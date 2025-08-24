import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useAccount } from "wagmi";
import { hitService } from "@/services/hitService";
import { Trophy, Medal, User, Target, ArrowLeft } from "lucide-react";
import AchievementsPanel from "./AchievementsPanel";
import { useToast } from "@/hooks/use-toast";

interface LeaderboardScreenProps {
  onBack: () => void;
}

interface TopScore {
  player: string;
  score: string;
  timestamp: string;
}

interface PlayerStats {
  player: string;
  totalScore: string;
  hitCount: number;
}

const LeaderboardScreen = ({ onBack }: LeaderboardScreenProps) => {
  const { address } = useAccount();
  const { toast } = useToast();
  const [topScores, setTopScores] = useState<TopScore[]>([]);
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchData = async () => {
    try {
      setLoading(true);
      
      // Fetch top scores
      const scores = await hitService.getTopScores();
      setTopScores(scores);

      // Fetch player stats if wallet is connected
      if (address) {
        const stats = await hitService.getPlayerScore(address);
        setPlayerStats(stats);
      }
    } catch (error) {
      console.error("Failed to fetch leaderboard data:", error);
      toast({
        title: "Error",
        description: "Failed to load leaderboard data",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchData();
    setRefreshing(false);
    toast({
      title: "Refreshed",
      description: "Leaderboard data updated",
    });
  };

  useEffect(() => {
    fetchData();
  }, [address]);

  const formatAddress = (address: string) => {
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  const getMedalIcon = (index: number) => {
    switch (index) {
      case 0:
        return <Trophy className="w-4 h-4 text-yellow-500" />;
      case 1:
        return <Medal className="w-4 h-4 text-gray-400" />;
      case 2:
        return <Medal className="w-4 h-4 text-amber-600" />;
      default:
        return <span className="w-4 h-4 text-muted-foreground font-bold text-xs">{index + 1}</span>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen w-full flex flex-col items-center justify-center text-foreground font-press-start p-4" style={{ backgroundColor: '#E84142' }}>
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-lg">Loading leaderboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center text-foreground font-press-start p-4" style={{ backgroundColor: '#E84142' }}>
      {/* Header */}
      <div className="w-full max-w-5xl mb-4">
        <div className="flex items-center justify-between mb-4">
          <Button
            onClick={onBack}
            className="bg-white text-red-600 hover:bg-red-50 border border-red-600 font-press-start flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </Button>
          <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-center flex-1 text-white">
            Leaderboard
          </h1>
          <Button
            onClick={handleRefresh}
            disabled={refreshing}
            className="bg-white text-red-600 hover:bg-red-50 border border-red-600 font-press-start flex items-center gap-2 disabled:opacity-70"
          >
            {refreshing ? (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-red-600"></div>
            ) : (
              "Refresh"
            )}
          </Button>
        </div>
      </div>

      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Player Stats Section - Sidebar on large screens */}
        {playerStats && (
          <div className="lg:col-span-1">
            <div className="rounded-lg p-4 sticky top-4 bg-red-600 text-white border border-white/30">
              <h2 className="text-lg font-bold mb-3 flex items-center gap-2">
                {/* <User className="w-4 h-4" /> */}&nbsp;&nbsp;
                Your Stats
              </h2>
              <div className="space-y-3">
                <div className="text-center">
                  <p className="text-sm text-white/80">Total Score</p>
                  <p className="text-xl font-bold text-white">{playerStats.totalScore}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-white/80">Total Hits</p>
                  <p className="text-xl font-bold text-white">{playerStats.hitCount}</p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-white/80">Address</p>
                  <p className="text-xs font-mono text-white">{formatAddress(playerStats.player)}</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Top 10 Leaderboard - Main content */}
        <div className={`rounded-lg p-4 ${playerStats ? 'lg:col-span-2' : 'lg:col-span-3'} bg-red-600 text-white border border-white/30`}>
          <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
            <Trophy className="w-4 h-4 text-white" />
            Top 10 Players
          </h2>
          
          {topScores.length === 0 ? (
            <div className="text-center py-8">
              <Target className="w-12 h-12 text-white mx-auto mb-4" />
              <p className="text-white">No scores recorded yet</p>
              <p className="text-sm text-white/80">Start playing to see your score here!</p>
            </div>
          ) : (
            <div className="space-y-1 max-h-[70vh] overflow-y-auto">
              {topScores.map((score, index) => (
                <div
                  key={score.player}
                  className={`flex items-center justify-between p-2 rounded-lg border ${
                    address === score.player ? 'bg-white/10 border-white' : 'bg-red-600 border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className="flex items-center justify-center w-5 h-5">
                      {getMedalIcon(index)}
                    </div>
                    <div>
                      <p className="font-bold text-sm">
                        {formatAddress(score.player)}
                        {address === score.player && (
                          <span className="ml-2 text-xs bg-white text-red-600 px-1 py-0.5 rounded">
                            YOU
                          </span>
                        )}
                      </p>
                      {/* <p className="text-xs text-muted-foreground">
                        {new Date(parseInt(score.timestamp) * 1000).toLocaleDateString()}
                      </p> */}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-white">{score.score}</p>
                    <p className="text-xs text-white/80">points</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {/* Achievements panel spans full width below */}
        {playerStats && (
          <div className="lg:col-span-3">
            <AchievementsPanel address={playerStats.player} totalScore={playerStats.totalScore} hitCount={playerStats.hitCount} />
          </div>
        )}
      </div>
    </div>
  );
};

export default LeaderboardScreen; 
