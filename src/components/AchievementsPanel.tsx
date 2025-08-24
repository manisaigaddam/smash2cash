import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { claimViaRelayer, fetchClaimed, fetchLevels, LevelConfig, getExplorerTxUrl, fetchLevelImageFromMetadata } from '@/services/achievementsService';

type Props = {
  address?: string;
  totalScore?: string | number;
  hitCount?: number;
};

type Status = 'claimed' | 'eligible' | 'locked';

export default function AchievementsPanel({ address, totalScore, hitCount }: Props) {
  const { toast } = useToast();
  const [levels, setLevels] = useState<LevelConfig[]>([]);
  const [claimed, setClaimed] = useState<Record<number, boolean>>({});
  const [loading, setLoading] = useState(false);
  const [claiming, setClaiming] = useState<number | null>(null);

  const scoreBig = useMemo(() => {
    if (typeof totalScore === 'string') return BigInt(totalScore || '0');
    if (typeof totalScore === 'number') return BigInt(totalScore);
    return 0n;
  }, [totalScore]);

  const hitsBig = useMemo(() => BigInt(hitCount || 0), [hitCount]);

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const lvls = await fetchLevels([1, 2, 3, 4, 5]);
        const active = lvls.filter((l) => l.active);
        const withImgs = await Promise.all(
          active.map(async (l) => ({ ...l, imageUrl: await fetchLevelImageFromMetadata(l.uri) }))
        );
        setLevels(withImgs);
        if (address) {
          const c = await fetchClaimed(address, [1, 2, 3, 4, 5]);
          setClaimed(c);
        }
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [address]);

  const statusFor = (lvl: LevelConfig): Status => {
    if (claimed[lvl.id]) return 'claimed';
    if (scoreBig >= lvl.minScore && hitsBig >= lvl.minHits) return 'eligible';
    return 'locked';
  };

  const onClaim = async (levelId: number) => {
    if (!address) return;
    setClaiming(levelId);
    try {
      const res = await claimViaRelayer(address, levelId);
      if (!res.success) {
        toast({ title: 'Claim failed', description: res.error || 'Unable to claim', variant: 'destructive' });
        return;
      }
      const link = getExplorerTxUrl(res.hash || undefined);
      toast({
        title: 'Achievement claimed!',
        description: link ? (
          <a href={link} target="_blank" rel="noopener noreferrer" className="underline">View on Snowtrace</a>
        ) : 'Transaction confirmed',
      });
      const c = await fetchClaimed(address, [1, 2, 3, 4, 5]);
      setClaimed(c);
    } finally {
      setClaiming(null);
    }
  };

  if (!address) {
    return (
      <div className="rounded-lg p-4 bg-white/10 text-white border border-white/20">
        <h2 className="text-lg font-bold mb-2">Achievements</h2>
        <p className="text-sm text-white/80">Connect your wallet to view and claim achievements.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg p-4 bg-red-600 text-white border border-white/30">
      <h2 className="text-lg font-bold mb-3">Achievements</h2>
      {loading ? (
        <div className="text-sm">Loading achievements...</div>
      ) : (
        <div className="relative">
          {/* connecting line */}
          <div className="absolute left-0 right-0 top-8 h-1 bg-white/20" />

          {/* nodes */}
          <div className="relative flex items-start justify-between gap-2 overflow-x-auto pb-2">
            {levels.map((lvl) => {
              const s = statusFor(lvl);
              const disabled = s !== 'eligible' || claiming === lvl.id;
              const nodeStyle =
                s === 'claimed' ? 'bg-white text-red-600 border-white' : s === 'eligible' ? 'bg-yellow-300 text-red-700 border-yellow-200' : 'bg-white/20 text-white border-white/30';
              return (
                <div key={lvl.id} className="flex flex-col items-center min-w-[120px]">
                  <div className={`flex items-center justify-center h-16 w-16 rounded-full border ${nodeStyle} z-10`}>
                    {lvl.imageUrl ? (
                      <img src={lvl.imageUrl} alt={lvl.name} className="h-12 w-12 object-contain rounded-full" />
                    ) : (
                      <span className="text-sm font-bold">{lvl.name[0]}</span>
                    )}
                  </div>
                  <div className="mt-2 text-sm font-bold">{lvl.name}</div>
                  {s === 'claimed' && <div className="text-xs mt-1 bg-white text-red-600 px-2 py-0.5 rounded">Claimed</div>}
                  {s === 'locked' && <div className="text-xs mt-1 bg-black/30 px-2 py-0.5 rounded">Locked</div>}
                  {s === 'eligible' && (
                    <Button onClick={() => onClaim(lvl.id)} disabled={disabled} className="mt-2 bg-white text-red-600 hover:bg-red-50">
                      {claiming === lvl.id ? 'Claiming...' : 'Claim'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}


