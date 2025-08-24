import { createPublicClient, http, Address } from 'viem';
import { defineChain } from 'viem';

const RELAYER_URL = import.meta.env.VITE_RELAYER_URL || 'https://catchthemouchbackend.onrender.com';
const AVASBT_ADDRESS = (import.meta.env.VITE_AVASBT_ADDRESS || '').trim();
const FUJI_RPC = import.meta.env.VITE_AVAX_FUJI_RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc';

const avalancheFuji = defineChain({
  id: 43113,
  name: 'Avalanche Fuji',
  nativeCurrency: { name: 'AVAX', symbol: 'AVAX', decimals: 18 },
  rpcUrls: { default: { http: [FUJI_RPC] } },
  blockExplorers: { default: { name: 'Snowtrace', url: 'https://testnet.snowtrace.io' } },
  testnet: true,
});

const publicClient = createPublicClient({ chain: avalancheFuji, transport: http() });

// Minimal ABI for reads
const AVASBT_ABI = [
  {
    type: 'function',
    name: 'levels',
    stateMutability: 'view',
    inputs: [{ name: 'levelId', type: 'uint256' }],
    outputs: [
      { name: 'name', type: 'string' },
      { name: 'minScore', type: 'uint256' },
      { name: 'minHits', type: 'uint256' },
      { name: 'uri', type: 'string' },
      { name: 'active', type: 'bool' },
    ],
  },
  {
    type: 'function',
    name: 'hasClaimed',
    stateMutability: 'view',
    inputs: [
      { name: 'player', type: 'address' },
      { name: 'levelId', type: 'uint256' },
    ],
    outputs: [{ name: '', type: 'bool' }],
  },
];

export type LevelConfig = {
  id: number;
  name: string;
  minScore: bigint;
  minHits: bigint;
  uri: string;
  active: boolean;
  imageUrl?: string;
};

function ipfsToHttp(uri: string): string {
  if (!uri) return uri;
  if (uri.startsWith('ipfs://')) {
    const cid = uri.replace('ipfs://', '');
    return `https://gateway.pinata.cloud/ipfs/${cid}`;
  }
  return uri;
}

export async function fetchLevels(ids: number[] = [1, 2, 3, 4, 5]): Promise<LevelConfig[]> {
  if (!AVASBT_ADDRESS) return [];
  const levels: LevelConfig[] = [];
  for (const id of ids) {
    try {
      const [name, minScore, minHits, uri, active] = await publicClient.readContract({
        address: AVASBT_ADDRESS as Address,
        abi: AVASBT_ABI as any,
        functionName: 'levels',
        args: [BigInt(id)],
      }) as unknown as [string, bigint, bigint, string, boolean];
      levels.push({ id, name, minScore, minHits, uri, active });
    } catch {
      // ignore missing levels
    }
  }
  return levels;
}

export async function fetchClaimed(address: string, ids: number[] = [1, 2, 3, 4, 5]): Promise<Record<number, boolean>> {
  const result: Record<number, boolean> = {};
  if (!AVASBT_ADDRESS || !address) return result;
  for (const id of ids) {
    try {
      const claimed = await publicClient.readContract({
        address: AVASBT_ADDRESS as Address,
        abi: AVASBT_ABI as any,
        functionName: 'hasClaimed',
        args: [address as Address, BigInt(id)],
      }) as boolean;
      result[id] = claimed;
    } catch {
      result[id] = false;
    }
  }
  return result;
}

export async function claimViaRelayer(player: string, levelId: number): Promise<{ success: boolean; hash?: string; error?: string }> {
  try {
    const res = await fetch(`${RELAYER_URL}/claimSbt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ player, levelId }),
    });
    const data = await res.json();
    if (!res.ok || !data?.success) {
      return { success: false, error: data?.error || 'Claim failed' };
    }
    return { success: true, hash: data.hash };
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
  }
}

export function getExplorerTxUrl(hash?: string): string | null {
  if (!hash) return null;
  const base = import.meta.env.VITE_AVAX_FUJI_EXPLORER || 'https://testnet.snowtrace.io';
  return `${base}/tx/${hash}`;
}

export function resolveImageFromMetadataUri(uri: string): string {
  return ipfsToHttp(uri);
}

export async function fetchLevelImageFromMetadata(metadataUri: string): Promise<string | undefined> {
  try {
    const httpUri = ipfsToHttp(metadataUri);
    const res = await fetch(httpUri);
    const json = await res.json().catch(() => null);
    const image = json?.image as string | undefined;
    if (!image) return undefined;
    return ipfsToHttp(image);
  } catch {
    return undefined;
  }
}


