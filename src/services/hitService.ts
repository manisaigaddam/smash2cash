import { useAccount } from "wagmi";

const RELAYER_URL = import.meta.env.VITE_RELAYER_URL || "https://catchthemouchbackend.onrender.com";

export interface HitData {
  player: string;
  points: number;
}

export class HitService {
  private static instance: HitService;
  private queue: HitData[] = [];
  private isProcessing = false;

  private constructor() {}

  static getInstance(): HitService {
    if (!HitService.instance) {
      HitService.instance = new HitService();
    }
    return HitService.instance;
  }

  /**
   * Record a hit through the relayer
   */
  async recordHit(hitData: HitData): Promise<{ success: boolean; hash?: string; error?: string }> {
    try {
      console.log("🎯 Recording hit:", hitData);

      const response = await fetch(`${RELAYER_URL}/recordHit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(hitData),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to record hit");
      }

      const result = await response.json();
      console.log("✅ Hit recorded successfully:", result);
      
      return { success: true, hash: result.hash };
    } catch (error) {
      console.error("❌ Failed to record hit:", error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      };
    }
  }

  /**
   * Record a hit with retry logic
   */
  async recordHitWithRetry(hitData: HitData, maxRetries = 3): Promise<{ success: boolean; hash?: string; error?: string }> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      const result = await this.recordHit(hitData);
      
      if (result.success) {
        return result;
      }
      
      if (attempt < maxRetries) {
        console.log(`🔄 Retry attempt ${attempt}/${maxRetries}...`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt)); // Exponential backoff
      }
    }
    
    return { success: false, error: "Max retries exceeded" };
  }

  /**
   * Queue a hit for processing (for high-frequency hits)
   */
  async queueHit(hitData: HitData): Promise<void> {
    this.queue.push(hitData);
    
    if (!this.isProcessing) {
      this.processQueue();
    }
  }

  /**
   * Record hit immediately (for single hits)
   */
  async recordHitImmediate(hitData: HitData): Promise<{ success: boolean; hash?: string; error?: string }> {
    return this.recordHit(hitData);
  }

  /**
   * Process the hit queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.length === 0) return;

    this.isProcessing = true;
    console.log(`🔄 Processing ${this.queue.length} hits...`);

    while (this.queue.length > 0) {
      const hitData = this.queue.shift()!;
      
      try {
        await this.recordHit(hitData);
        // Longer delay between hits to avoid overwhelming the relayer
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (error) {
        console.error("❌ Failed to process hit from queue:", error);
        // Re-queue failed hits
        this.queue.unshift(hitData);
        break;
      }
    }

    this.isProcessing = false;
  }

  /**
   * Get relayer status
   */
  async getStatus(): Promise<{ status: string; queueLength: number; totalHits: string } | null> {
    try {
      const response = await fetch(`${RELAYER_URL}/status`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error("❌ Failed to get relayer status:", error);
    }
    return null;
  }

  /**
   * Get global top scores
   */
  async getTopScores(): Promise<any[]> {
    try {
      const response = await fetch(`${RELAYER_URL}/topScores`);
      if (response.ok) {
        const data = await response.json();
        return data.topScores || [];
      }
    } catch (error) {
      console.error("❌ Failed to get top scores:", error);
    }
    return [];
  }

  /**
   * Update leaderboard manually
   */
  async updateLeaderboard(): Promise<{ success: boolean; hash?: string; error?: string }> {
    try {
      console.log("🔄 Updating leaderboard...");
      
      // This would need to be called directly on the contract by the owner
      // For now, we'll return a placeholder
      return { 
        success: false, 
        error: "Leaderboard updates must be called directly on contract by owner" 
      };
    } catch (error) {
      console.error("❌ Failed to update leaderboard:", error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      };
    }
  }

  /**
   * Get player score
   */
  async getPlayerScore(playerAddress: string): Promise<{ player: string; totalScore: string; hitCount: number } | null> {
    try {
      const response = await fetch(`${RELAYER_URL}/playerScore/${playerAddress}`);
      if (response.ok) {
        return await response.json();
      }
    } catch (error) {
      console.error("❌ Failed to get player score:", error);
    }
    return null;
  }
}

// Export singleton instance
export const hitService = HitService.getInstance(); 