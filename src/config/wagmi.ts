import { getDefaultConfig } from '@rainbow-me/rainbowkit';
import { defineChain } from 'viem';

// Define Avalanche Fuji Testnet chain
const avalancheFuji = defineChain({
    id: 43113,
    name: 'Avalanche Fuji',
    nativeCurrency: {
        decimals: 18,
        name: 'AVAX',
        symbol: 'AVAX',
    },
    rpcUrls: {
        default: {
            http: [import.meta.env.VITE_AVAX_FUJI_RPC_URL || 'https://api.avax-test.network/ext/bc/C/rpc'],
        },
    },
    blockExplorers: {
        default: {
            name: 'Snowtrace',
            url: 'https://testnet.snowtrace.io',
        },
    },
    testnet: true,
});

// Configure chains
export const config = getDefaultConfig({
    appName: 'Ava Game',
    projectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || 'your-project-id',
    chains: [avalancheFuji],
    ssr: false, // Set to false for Vite
});
