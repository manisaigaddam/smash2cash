import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
interface BirdType {
  name: string;
  image: string;
  points: number;
  rarity: 'common' | 'uncommon' | 'rare' | 'legendary';
  spawnRate: number;
}
import { useAccount } from "wagmi";
import { hitService, HitData } from "@/services/hitService";
import { saveGameData } from "@/services/gameDataService";
import { useToast } from "@/hooks/use-toast";
import { ExternalLink } from "lucide-react";
import { Toaster } from "@/components/ui/toaster";
import HandTrackingView from "./HandTrackingView";

interface GameScreenProps {
  onBackToMenu: () => void;
}

interface BirdPosition {
  id: string;
  bird: BirdType;
  x: number;
  y: number;
  velocityX: number;
  velocityY: number;
  direction: 'left' | 'right';
  initialY: number;
  status: 'flying' | 'hit'; // New property to track the bird's state
  animation: BirdAnimation;
  // Internal fields for performance systems (pooling + spatial hash)
  active?: boolean;
  cellKey?: string;
}

interface CursorState {
  x: number;
  y: number;
  isHitting: boolean;
  hitFrame: number;
  hitTimer: number;
}

interface SpriteData {
  image: HTMLImageElement;
  frameWidth: number;
  frameHeight: number;
  totalFrames: number;
  rows: number;
  columns: number;
  duration: number;
  loaded: boolean;
}

interface BirdAnimation {
  currentFrame: number;
  lastFrameTime: number;
}

const GameScreen = ({ onBackToMenu }: GameScreenProps) => {
  const { address } = useAccount();
  const { toast } = useToast();
  const [seconds, setSeconds] = useState(60);
  // Birds are managed via refs in the unified animation manager (no React state)
  const [gameOver, setGameOver] = useState(false);
  const [gameStarted, setGameStarted] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [cursor, setCursor] = useState<CursorState>({ x: 0, y: 0, isHitting: false, hitFrame: 0, hitTimer: 0 });
  const batRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const ctxRef = useRef<CanvasRenderingContext2D | null>(null);
  const backgroundImageRef = useRef<HTMLImageElement | null>(null);
  const spriteSheetsRef = useRef<{[key: string]: SpriteData}>({});
  const cursorPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const birdsRef = useRef<BirdPosition[]>([]);
  // Object pool for birds (inactive instances ready to be reused)
  const birdPoolRef = useRef<BirdPosition[]>([]);
  // Spatial hash grid mapping cell keys to sets of birds occupying that cell
  const spatialHashRef = useRef<Map<string, Set<BirdPosition>>>(new Map());
  const floatingPointsRef = useRef<Array<{ id: string; points: number; x: number; y: number; opacity: number }>>([]);
  const cursorAnimRef = useRef<{ isHitting: boolean; hitFrame: number; hitTimer: number }>({ isHitting: false, hitFrame: 0, hitTimer: 0 });
  const gameLoopRef = useRef<number | null>(null);
  const lastFrameTimeRef = useRef<number>(0);
  const [hitHistory, setHitHistory] = useState<Array<{
    birdType: string;
    points: number;
    timestamp: number;
  }>>([]);

  // Floating points are animated via RAF using refs only (no React state)

  // Hand mode toggle
  const [handModeEnabled, setHandModeEnabled] = useState(false);
  // Direct hand coords (no smoothing for better responsiveness)
  const currentHandPosRef = useRef<{ x: number; y: number } | null>(null);

  // Calculate totals from hitHistory
  const score = hitHistory.reduce((sum, hit) => sum + hit.points, 0);
  const hits = hitHistory.length;

  const gameContainerRef = useRef<HTMLDivElement>(null);
  const intervalRef = useRef<NodeJS.Timeout>();
  // Removed secondary RAF; single unified gameLoop will handle update + render
  const spawnTimeoutRef = useRef<NodeJS.Timeout>();
  const dieAudioRef = useRef<HTMLAudioElement | null>(null);
  const gunAudioRef = useRef<HTMLAudioElement | null>(null);
  const gameoverAudioRef = useRef<HTMLAudioElement | null>(null);
  const bgMusicRef = useRef<HTMLAudioElement | null>(null);
  const countdownAudioRef = useRef<HTMLAudioElement | null>(null);

  // Responsive scaling based on game container size
  const getScaledSize = useCallback((baseSize: number) => {
    if (!gameContainerRef.current) return baseSize;
    const container = gameContainerRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    // Use the smaller dimension to maintain proportions
    const scaleFactor = Math.min(containerWidth / 896, containerHeight / 504); // 896x504 is max-w-4xl aspect-[16/9]
    return Math.max(baseSize * scaleFactor, baseSize * 0.5); // Minimum 50% of original size
  }, []);

  // Initialize sprite sheets
  const initializeSpriteSheets = useCallback(() => {
    const spriteSheets = {
      bee: {
        frameWidth: 360,
        frameHeight: 360,
        totalFrames: 45,
        rows: 9,
        columns: 5,
        duration: 0.8,
        loaded: false
      },
      butterfly: {
        frameWidth: 144,
        frameHeight: 144,
        totalFrames: 35,
        rows: 7,
        columns: 5,
        duration: 0.65,
        loaded: false
      },
      fly: {
        frameWidth: 640,
        frameHeight: 360,
        totalFrames: 150,
        rows: 30,
        columns: 5,
        duration: 5.04,
        loaded: false
      },
      ava: {
        frameWidth: 256,
        frameHeight: 144,
        totalFrames: 150,
        rows: 30,
        columns: 5,
        duration: 5.04,
        loaded: false
      },
      player: {
        
        frameWidth: 48,
        frameHeight: 180,
        totalFrames: 2,
        rows: 1,
        columns: 2,
        duration: 0.2,
        loaded: false
      }
    };

    // Load all sprite images
    Object.keys(spriteSheets).forEach(key => {
      const sprite = spriteSheets[key as keyof typeof spriteSheets];
      const img = new Image();
      img.onload = () => {
        // For the bat (player), compute frame size from actual image so we crop exactly one frame
        if (key === 'player') {
          const derivedFrameWidth = Math.floor(img.width / sprite.columns);
          const derivedFrameHeight = Math.floor(img.height / sprite.rows);
          spriteSheetsRef.current[key] = {
            ...sprite,
            frameWidth: derivedFrameWidth || sprite.frameWidth,
            frameHeight: derivedFrameHeight || sprite.frameHeight,
            image: img as HTMLImageElement,
            loaded: true
          } as SpriteData;
        } else {
          sprite.loaded = true;
          spriteSheetsRef.current[key] = { ...sprite, image: img };
        }
      };
      img.src = key === 'player' ? '/player.png' : `/spritesheet/${key}.png`;
    });

    // Load background image
    const bgImg = new Image();
    bgImg.onload = () => {
      backgroundImageRef.current = bgImg;
    };
    bgImg.src = '/background.png';
  }, []);

  // Canvas drawing functions
  const drawBackground = useCallback((ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    // Draw solid gradient background to match original
    const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
    gradient.addColorStop(0, '#e0f2fe'); // sky-200
    gradient.addColorStop(0.5, '#bfdbfe'); // blue-200  
    gradient.addColorStop(1, '#93c5fd'); // blue-300
    
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw background image if loaded
    if (backgroundImageRef.current) {
      ctx.drawImage(backgroundImageRef.current, 0, 0, canvas.width, canvas.height);
      
      // Apply overlay to match original DOM implementation
      const overlayGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
      overlayGradient.addColorStop(0, 'rgba(186, 230, 253, 0.7)'); // sky-200/70
      overlayGradient.addColorStop(0.5, 'rgba(147, 197, 253, 0.6)'); // blue-200/60
      overlayGradient.addColorStop(1, 'rgba(147, 197, 253, 0.7)'); // blue-300/70
      
      ctx.fillStyle = overlayGradient;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  }, []);

  const drawBird = useCallback((ctx: CanvasRenderingContext2D, bird: BirdPosition) => {
    const sprite = spriteSheetsRef.current[bird.bird.name.toLowerCase().replace(' ', '')];
    if (!sprite || !sprite.loaded) return;

    const currentTime = Date.now();
    const frameInterval = (sprite.duration * 1000) / sprite.totalFrames; // Time per frame in ms
    
    if (currentTime - bird.animation.lastFrameTime >= frameInterval) {
      bird.animation.currentFrame = (bird.animation.currentFrame + 1) % sprite.totalFrames;
      bird.animation.lastFrameTime = currentTime;
    }

    const frameCol = bird.animation.currentFrame % sprite.columns;
    const frameRow = Math.floor(bird.animation.currentFrame / sprite.columns);
    
    const sourceX = frameCol * sprite.frameWidth;
    const sourceY = frameRow * sprite.frameHeight;
    
    let renderSize = getScaledSize(80); // Base size
    if (bird.bird.name === 'Bee') {
      // Bee frames have large transparent padding; visually scale up to compensate
      renderSize = Math.round(renderSize * 0.8);
    }
    if (bird.bird.name === 'Fly') {
      // Bee frames have large transparent padding; visually scale up to compensate
      renderSize = Math.round(renderSize * 1.6);
    }
    if (bird.bird.name === 'Ava') {
      // Bee frames have large transparent padding; visually scale up to compensate
      renderSize = Math.round(renderSize * 1.3);
    }
    
    ctx.save();
    
    // Enable high quality scaling for this bird
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    
    ctx.translate(bird.x, bird.y);
    
    // Handle direction and hit state (per-sprite facing)
    const spriteName = bird.bird.name;
    const shouldFlipX =
      spriteName === 'Butterfly' || spriteName === 'Ava'
        ? (bird.direction === 'left')
        : (bird.direction === 'right');
    if (shouldFlipX) {
      ctx.scale(-1, 1);
    }
    if (bird.status === 'hit') {
      ctx.scale(1, -1);
      ctx.rotate(0.26); // 15 degrees
    }
    
    ctx.drawImage(
      sprite.image,
      sourceX, sourceY, sprite.frameWidth, sprite.frameHeight,
      -renderSize / 2, -renderSize / 2, renderSize, renderSize
    );
    
    ctx.restore();
  }, [getScaledSize]);

  // --- Spatial hashing helpers ---
  const getCellKeyFromXY = useCallback((x: number, y: number, cellSize: number) => {
    const ix = Math.floor(x / cellSize);
    const iy = Math.floor(y / cellSize);
    return `${ix},${iy}`;
  }, []);

  const spatialInsert = useCallback((bird: BirdPosition, cellSize: number) => {
    const key = getCellKeyFromXY(bird.x, bird.y, cellSize);
    bird.cellKey = key;
    let bucket = spatialHashRef.current.get(key);
    if (!bucket) {
      bucket = new Set<BirdPosition>();
      spatialHashRef.current.set(key, bucket);
    }
    bucket.add(bird);
  }, [getCellKeyFromXY]);

  const spatialUpdateIfMoved = useCallback((bird: BirdPosition, cellSize: number) => {
    const nextKey = getCellKeyFromXY(bird.x, bird.y, cellSize);
    if (bird.cellKey === nextKey) return; // still in same cell
    if (bird.cellKey) {
      const prevBucket = spatialHashRef.current.get(bird.cellKey);
      prevBucket?.delete(bird);
      if (prevBucket && prevBucket.size === 0) spatialHashRef.current.delete(bird.cellKey);
    }
    bird.cellKey = nextKey;
    let nextBucket = spatialHashRef.current.get(nextKey);
    if (!nextBucket) {
      nextBucket = new Set<BirdPosition>();
      spatialHashRef.current.set(nextKey, nextBucket);
    }
    nextBucket.add(bird);
  }, [getCellKeyFromXY]);

  const spatialRemove = useCallback((bird: BirdPosition) => {
    if (!bird.cellKey) return;
    const bucket = spatialHashRef.current.get(bird.cellKey);
    bucket?.delete(bird);
    if (bucket && bucket.size === 0) spatialHashRef.current.delete(bird.cellKey);
    bird.cellKey = undefined;
  }, []);

  const queryNearbyBirds = useCallback((x: number, y: number, radius: number) => {
    const result: BirdPosition[] = [];
    const cellSize = Math.max(1, radius * 2);
    const ix = Math.floor(x / cellSize);
    const iy = Math.floor(y / cellSize);
    // Scan current cell and neighbors (3x3) to fully cover the circle
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const key = `${ix + dx},${iy + dy}`;
        const bucket = spatialHashRef.current.get(key);
        if (!bucket) continue;
        bucket.forEach((b) => {
          if (b.status === 'flying') result.push(b);
        });
      }
    }
    return result;
  }, []);

  const drawBatCursor = useCallback((ctx: CanvasRenderingContext2D, cursor: CursorState) => {
    const sprite = spriteSheetsRef.current.player;
    if (!sprite || !sprite.loaded) return;

    ctx.save();
    
    // Bat is pixel-art; disable smoothing for crisp edges
    ctx.imageSmoothingEnabled = false;

    // Use computed frame width from the loaded image to avoid sampling two frames
    const frameX = cursorAnimRef.current.isHitting ? cursorAnimRef.current.hitFrame * sprite.frameWidth : 0;
    const renderWidth = getScaledSize(48);
    const renderHeight = getScaledSize(180);
    
    // Use ref-based high-frequency cursor position
    const pos = cursorPosRef.current;
    const drawX = Math.round(pos.x - renderWidth / 2);
    const drawY = Math.round(pos.y - renderHeight / 2);
    
    ctx.drawImage(
      sprite.image,
      frameX, 0, sprite.frameWidth, sprite.frameHeight,
      drawX, drawY, renderWidth, renderHeight
    );
    
    ctx.restore();
  }, [getScaledSize]);

  const drawFloatingPoint = useCallback((ctx: CanvasRenderingContext2D, point: {
    id: string;
    points: number;
    x: number;
    y: number;
    opacity: number;
  }) => {
    ctx.save();
    ctx.globalAlpha = point.opacity;
    ctx.fillStyle = '#facc15'; // yellow-400
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 2;
    ctx.font = '18px "Press Start 2P", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    
    const text = `+${point.points}`;
    ctx.strokeText(text, point.x, point.y);
    ctx.fillText(text, point.x, point.y);
    ctx.restore();
  }, []);

  // Main game loop
  const gameLoop = useCallback(() => {
    if (!canvasRef.current || !ctxRef.current) return;
    const now = performance.now();
    const dt = lastFrameTimeRef.current ? (now - lastFrameTimeRef.current) / 1000 : 0;
    lastFrameTimeRef.current = now;
    
    const canvas = canvasRef.current;
    const ctx = ctxRef.current;
    
    // Clear canvas
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    // Always draw background
    drawBackground(ctx, canvas);
    
    // Update sim and draw only when running
    if (gameStarted && !gameOver) {
      // Advance hit animation at ~10 FPS using timer in ref
      if (cursorAnimRef.current.isHitting) {
        cursorAnimRef.current.hitTimer += dt;
        const newFrame = Math.floor(cursorAnimRef.current.hitTimer * 10);
        if (newFrame >= 2) {
          cursorAnimRef.current.isHitting = false;
          cursorAnimRef.current.hitFrame = 0;
          cursorAnimRef.current.hitTimer = 0;
        } else if (newFrame !== cursorAnimRef.current.hitFrame) {
          cursorAnimRef.current.hitFrame = newFrame;
        }
      }

      // --- Simulation step (merged moveBirds) ---
      if (gameContainerRef.current) {
        const { clientWidth: width, clientHeight: height } = gameContainerRef.current;
        const hitRadius = getScaledSize(32);
        const cellSize = Math.max(1, hitRadius * 2);

        for (let i = 0; i < birdsRef.current.length; ) {
          const bird = birdsRef.current[i];

          if (bird.status === 'hit') {
            const gravity = 0.1;
            bird.velocityY = bird.velocityY + gravity;
            bird.y = bird.y + bird.velocityY;
            spatialUpdateIfMoved(bird, cellSize);
            if (bird.y <= height + 100) {
              i++;
            } else {
              spatialRemove(bird);
              bird.active = false;
              birdPoolRef.current.push(bird);
              const last = birdsRef.current.pop()!;
              if (i < birdsRef.current.length) {
                birdsRef.current[i] = last;
              }
            }
          } else {
            let newX = bird.x + bird.velocityX;
            let newY = bird.y + bird.velocityY;
            if (bird.bird.name === 'Butterfly') {
              const waveFrequency = 0.03;
              const waveAmplitude = 1.2;
              newY = bird.initialY + bird.velocityY * (bird.x / bird.velocityX) + Math.sin(bird.x * waveFrequency) * waveAmplitude * 20;
            } else if (bird.bird.name === 'Bee') {
              newX += (Math.random() - 0.5) * 3;
            }

            if (newX >= -150 && newX <= width + 150 && newY >= -150 && newY <= height + 150) {
              bird.x = newX;
              bird.y = newY;
              spatialUpdateIfMoved(bird, cellSize);
              i++;
            } else {
              spatialRemove(bird);
              bird.active = false;
              birdPoolRef.current.push(bird);
              const last = birdsRef.current.pop()!;
              if (i < birdsRef.current.length) {
                birdsRef.current[i] = last;
              }
            }
          }
        }
      }

      // Draw all birds after update
      birdsRef.current.forEach(bird => drawBird(ctx, bird));

      // Floating points: fast rise and short lifetime so they don't stretch too far
      if (floatingPointsRef.current.length > 0) {
        for (let i = 0; i < floatingPointsRef.current.length; i++) {
          const p = floatingPointsRef.current[i];
          p.y -= 350 * dt; // fast rise (~350px/sec)
          p.opacity -= 1.6 * dt; // quick fade (~0.6s)
        }
        floatingPointsRef.current = floatingPointsRef.current.filter(p => p.opacity > 0);
        for (let i = 0; i < floatingPointsRef.current.length; i++) {
          drawFloatingPoint(ctx, floatingPointsRef.current[i]);
        }
      }
    }
    
    // Always draw bat cursor from ref-driven anim
    drawBatCursor(ctx, cursor);
    
    gameLoopRef.current = requestAnimationFrame(gameLoop);
  }, [gameStarted, gameOver, drawBackground, drawBird, drawFloatingPoint, drawBatCursor, getScaledSize, spatialRemove, spatialUpdateIfMoved]);

  const birdTypes: BirdType[] = [
    { name: "Bee", image: "/animals/bee.gif", points: 1, rarity: 'common', spawnRate: 15 },
    { name: "Butterfly", image: "/animals/butterfly.gif", points: 2, rarity: 'uncommon', spawnRate: 10 },
    { name: "Fly", image: "/animals/fly.gif", points: 5, rarity: 'rare', spawnRate: 5 },
    { name: "Ava", image: "/animals/ava.gif", points: 10, rarity: 'legendary', spawnRate: 2 },
  ];

  const formatTime = (totalSeconds: number) => {
    const minutes = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getRandomBird = (): BirdType => {
    const random = Math.random();
    if (random < 0.6) return birdTypes[0];
    else if (random < 0.85) return birdTypes[1];
    else if (random < 0.95) return birdTypes[2];
    else return birdTypes[3];
  };

  const createBird = useCallback((flockOptions?: { side: number; y: number }) => {
    if (gameOver || !gameStarted || !gameContainerRef.current) return;

    const container = gameContainerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;
    
    // Responsive spawn distance based on container size, but capped to prevent going outside
    const spawnDistance = Math.min(getScaledSize(100), Math.min(width, height) * 0.2);
    
    let x = 0, y = 0, targetX = 0, targetY = 0;
    const side = flockOptions?.side ?? Math.floor(Math.random() * 4); 

    switch (side) {
      case 0: // Left
        x = -spawnDistance; 
        y = Math.max(spawnDistance, Math.min(height - spawnDistance, flockOptions?.y ?? Math.random() * height));
        targetX = width + spawnDistance; 
        targetY = Math.max(spawnDistance, Math.min(height - spawnDistance, Math.random() * height));
        break;
      case 1: // Right
        x = width + spawnDistance; 
        y = Math.max(spawnDistance, Math.min(height - spawnDistance, flockOptions?.y ?? Math.random() * height));
        targetX = -spawnDistance; 
        targetY = Math.max(spawnDistance, Math.min(height - spawnDistance, Math.random() * height));
        break;
      case 2: // Top
        x = Math.max(spawnDistance, Math.min(width - spawnDistance, Math.random() * width)); 
        y = -spawnDistance;
        targetX = Math.max(spawnDistance, Math.min(width - spawnDistance, Math.random() * width)); 
        targetY = height + spawnDistance;
        break;
      case 3: // Bottom
        x = Math.max(spawnDistance, Math.min(width - spawnDistance, Math.random() * width)); 
        y = height + spawnDistance;
        targetX = Math.max(spawnDistance, Math.min(width - spawnDistance, Math.random() * width)); 
        targetY = -spawnDistance;
        break;
    }

    const birdType = getRandomBird();
    const dx = targetX - x;
    const dy = targetY - y;
    const distance = Math.sqrt(dx * dx + dy * dy);

    const timeProgress = 1 - (seconds / 60);
    const baseSpeed = 1.5 + (timeProgress * 1.5);
    const speed = baseSpeed + Math.random() * 1.0;

    const velocityX = (dx / distance) * speed;
    const velocityY = (dy / distance) * speed;

    // Reuse from pool if available, else create new instance
    const pooled = birdPoolRef.current.pop();
    const instance: BirdPosition = pooled ?? {
      id: '',
      bird: birdType,
      x: 0,
      y: 0,
      velocityX: 0,
      velocityY: 0,
      direction: 'left',
      initialY: 0,
      status: 'flying',
      animation: { currentFrame: 0, lastFrameTime: Date.now() },
      active: false,
      cellKey: undefined,
    };

    // Reset fields (no gameplay change)
    instance.id = Math.random().toString(36).substring(7);
    instance.bird = birdType;
    instance.x = x;
    instance.y = y;
    instance.velocityX = velocityX;
    instance.velocityY = velocityY;
    instance.direction = velocityX > 0 ? 'right' : 'left';
    instance.initialY = y;
    instance.status = 'flying';
    instance.animation.currentFrame = 0;
    instance.animation.lastFrameTime = Date.now();
    instance.active = true;
    instance.cellKey = undefined;

    birdsRef.current.push(instance);

    // Insert into spatial grid using current hit cell size (updated radius)
    const hitRadius = getScaledSize(32);
    spatialInsert(instance, Math.max(1, hitRadius * 2));
  }, [gameOver, gameStarted, seconds, getScaledSize, spatialInsert]);


  const createFlock = useCallback(() => {
    if (gameOver || !gameStarted || !gameContainerRef.current) return;
    const container = gameContainerRef.current;
    const height = container.clientHeight;

    const flockSize = 3 + Math.floor(Math.random() * 3);
    const flockStartY = Math.random() * (height - 150) + 75;
    const side = Math.floor(Math.random() * 2);

    for (let i = 0; i < flockSize; i++) {
      const yOffset = flockStartY + (Math.random() - 0.5) * 150;
      setTimeout(() => createBird({ side, y: yOffset }), i * (100 + Math.random() * 50));
    }
  }, [createBird, gameOver, gameStarted]);

  const catchBird = useCallback(async (birdId: string) => {
    const bird = birdsRef.current.find(b => b.id === birdId);
    if (bird && bird.status === 'flying') {
      // Only track individual hit, totals calculated automatically
      setHitHistory(prev => [
        ...prev,
        {
          birdType: bird.bird.name,
          points: bird.bird.points,
          timestamp: Date.now()
        }
      ]);
      
      // Add floating points animation
      const newFloatingPoint = {
        id: Math.random().toString(36).substring(7),
        points: bird.bird.points,
        x: bird.x,
        y: bird.y,
        opacity: 1
      };
      floatingPointsRef.current = [...floatingPointsRef.current, newFloatingPoint];
      
      if (dieAudioRef.current) {
        dieAudioRef.current.currentTime = 0;
        dieAudioRef.current.play();
      }
      if (gunAudioRef.current) {
        gunAudioRef.current.currentTime = 0;
        gunAudioRef.current.play();
      }
      
      // Mutate in place to avoid array churn
      bird.status = 'hit';
      bird.velocityX = 0;
      bird.velocityY = 2;

      // Record hit on blockchain if wallet is connected
      if (address) {
        try {
          const hitData: HitData = {
            player: address,
            points: bird.bird.points
          };
          // Record hit immediately for better reliability
          const result = await hitService.recordHitImmediate(hitData);
          if (result.success) {
            console.log("✅ Hit recorded on blockchain:", result.hash);
            toast({
              title: "🎯 Hit Recorded!",
              description: (
                <div className="flex flex-col gap-2">
                  {/* <span>Hit recorded on blockchain</span> */}
                  {result.hash && (
                    <a 
                      href={`${import.meta.env.VITE_AVAX_FUJI_EXPLORER || 'https://testnet.snowtrace.io'}/tx/${result.hash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 text-blue-500 hover:text-blue-600 text-xs"
                    >
                      View Transaction <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              ),
              variant: "success",
              duration: 3000, // 3 seconds
            });
          } else {
            console.error("❌ Failed to record hit:", result.error);
            toast({
              title: "❌ Hit Failed",
              description: `Failed to record hit on blockchain: ${result.error}`,
              variant: "destructive",
              duration: 3000,
            });
          }
        } catch (error) {
          console.error("Failed to record hit:", error);
          toast({
            title: "❌ Hit Failed",
            description: `Failed to record hit on blockchain: ${error}`,
            variant: "destructive",
            duration: 3000,
          });
        }
      }
    }
  }, [address, toast]);

  // Removed separate moveBirds RAF; movement is handled inside the unified gameLoop

  

  const resetGame = () => {
    setSeconds(60);
    // No birds state to reset; refs are reset in playAgain
    setGameOver(false);
    setGameStarted(false);
    setCountdown(3);
    setHitHistory([]); // Reset hit history
  };

  const playAgain = () => {
    // Fully reset refs that drive the RAF rendering pipeline
    birdsRef.current = [];
    birdPoolRef.current = [];
    spatialHashRef.current.clear();
    floatingPointsRef.current = [];
    cursorAnimRef.current = { isHitting: false, hitFrame: 0, hitTimer: 0 };
    cursorPosRef.current = { x: 0, y: 0 };
    resetGame();
  };

  // Handle mouse movement for cursor (only when not in hand mode)
  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (handModeEnabled) return; // mouse disabled when hand mode controls the bat
    if (!gameContainerRef.current) return;
    const rect = gameContainerRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    // Single source of truth for both render and collisions in mouse mode too
    cursorPosRef.current = { x, y };
  }, [handModeEnabled]);

  // Direct hand position update (no RAF loop, no smoothing)
  const updateHandPosition = useCallback((palmPos: { x: number; y: number }) => {
    if (!handModeEnabled || !gameContainerRef.current) return;
    
    const rect = gameContainerRef.current.getBoundingClientRect();
    const targetX = palmPos.x * rect.width;
    const targetY = palmPos.y * rect.height;
    
    // Single source of truth for both render and collisions
    cursorPosRef.current = { x: targetX, y: targetY };
    currentHandPosRef.current = { x: targetX, y: targetY };
  }, [handModeEnabled]);

  // Cursor hit animation is now simulated inside the unified RAF using cursorAnimRef

  // Floating points are animated in the unified RAF; no React interval/state needed

  // Handle mouse click for bat hitting animation
  const handleGameAreaClick = useCallback((e: React.MouseEvent) => {
    if (gunAudioRef.current) {
      gunAudioRef.current.currentTime = 0;
      gunAudioRef.current.play();
    }
    
    // Start hit animation
    cursorAnimRef.current.isHitting = true;
    cursorAnimRef.current.hitFrame = 0;
    cursorAnimRef.current.hitTimer = 0;

    // Check for collision with birds at click position using responsive hit radius
    if (gameContainerRef.current) {
      const rect = gameContainerRef.current.getBoundingClientRect();
      const clickX = e.clientX - rect.left;
      const clickY = e.clientY - rect.top;
      
      // Use responsive hit radius based on container size (increased)
      const hitRadius = getScaledSize(32);
      const r2 = hitRadius * hitRadius;

      // Query only nearby birds via spatial hash
      const candidates = queryNearbyBirds(clickX, clickY, hitRadius);
      for (let i = 0; i < candidates.length; i++) {
        const bird = candidates[i];
        const dx = clickX - bird.x;
        const dy = clickY - bird.y;
        if (dx * dx + dy * dy < r2) {
          catchBird(bird.id);
        }
      }
    }
  }, [catchBird, getScaledSize, queryNearbyBirds]);

  useEffect(() => {
    // Play countdown audio immediately when countdown starts
    if (countdown === 3 && countdownAudioRef.current) {
      countdownAudioRef.current.currentTime = 0;
      countdownAudioRef.current.play();
    }

    const countdownTimer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          setGameStarted(true);
          return 0;
        }
        if (countdownAudioRef.current) {
          countdownAudioRef.current.currentTime = 0;
          countdownAudioRef.current.play();
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(countdownTimer);
  }, [countdown]);

  useEffect(() => {
    if (!gameStarted || gameOver) return;
    intervalRef.current = setInterval(() => {
      setSeconds(prev => {
        if (prev <= 1) {
          setGameOver(true);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [gameStarted, gameOver]);

  useEffect(() => {
    if (!gameStarted || gameOver) return;
    const spawnLoop = () => {
      const spawnDelay = 250 + (seconds / 60) * 600;
      if (Math.random() < 0.15) createFlock();
      else createBird();
      spawnTimeoutRef.current = setTimeout(spawnLoop, spawnDelay);
    };
    spawnLoop();
    return () => {
      if (spawnTimeoutRef.current) clearTimeout(spawnTimeoutRef.current);
    };
  }, [gameStarted, gameOver, seconds, createBird, createFlock]);

  useEffect(() => {
    if (gameStarted && !gameOver) {
      if (bgMusicRef.current) {
        bgMusicRef.current.currentTime = 0;
        bgMusicRef.current.play();
      }
    } else {
      if (bgMusicRef.current) {
        bgMusicRef.current.pause();
        bgMusicRef.current.currentTime = 0;
      }
    }
  }, [gameStarted, gameOver]);

  useEffect(() => {
    if (gameOver) {
      if (gameoverAudioRef.current) {
        gameoverAudioRef.current.currentTime = 0;
        gameoverAudioRef.current.play();
      }
    }
  }, [gameOver]);

  useEffect(() => {
    if (gameOver && hitHistory.length > 0 && address) {
      saveGameData({
        sessionType: 'single',
        hostAddress: address,
        score,
        hits,
        hitHistory,
        durationSec: 60 - seconds,
      }).then(() => {
        console.log("✅ Single player game data saved to Supabase!");
      }).catch((err) => {
        console.error("❌ Failed to save single player game data:", err);
      });
    }
  }, [gameOver, hitHistory, address, score, hits, seconds]);

  // Initialize canvas and sprites (re-run after gameOver toggles so canvas re-mounts)
  useEffect(() => {
    if (!canvasRef.current) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctxRef.current = ctx;
    
    // Set canvas size to match container
    const resizeCanvas = () => {
      if (!gameContainerRef.current) return;
      const rect = gameContainerRef.current.getBoundingClientRect();
      const dpr = Math.max(1, window.devicePixelRatio || 1);
      // Set the internal buffer size in device pixels for crisp rendering
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      // Keep CSS size in CSS pixels
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      // Scale drawing operations so existing game coordinates continue in CSS pixels
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      
      // Prefer high quality for non-pixel-art birds; bat will override per-draw
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    // Initialize sprites
    initializeSpriteSheets();
    
    return () => {
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [initializeSpriteSheets, gameOver]);

  // Start game loop - always running for consistent background
  useEffect(() => {
    if (!gameLoopRef.current) {
      gameLoopRef.current = requestAnimationFrame(gameLoop);
    }
    
    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
        gameLoopRef.current = null;
      }
    };
  }, [gameLoop]);

  if (gameOver) {
    return (
      // --- MODIFICATION: Added 'select-none' to prevent highlighting ---
      <div
        className="min-h-screen w-full text-foreground font-press-start flex flex-col items-center justify-center select-none"
        style={{
          backgroundColor: '#E84142' // Avalanche red
        }}
      >
        {/* Keep hidden canvas/audio mounted to preserve context and avoid blank screen on next play */}
        <canvas ref={canvasRef} className="hidden" />
        <audio ref={gameoverAudioRef} src="/audio/gameover.mp3" preload="auto" />
        <h1 className="text-4xl mb-8">Game Over!</h1>
        <div className="text-2xl mb-8">Final Score: {score}</div>
        <div className="text-2xl mb-8">Total Hits: {hits}</div>
        <div className="flex gap-4">
          <Button onClick={playAgain} className="bg-red-600 text-white hover:bg-red-700 font-press-start text-lg px-8 py-4">
            Play Again
          </Button>
          <Button onClick={onBackToMenu} className="bg-white text-red-600 border border-red-600 hover:bg-red-50 font-press-start text-lg px-8 py-4">
            Main Menu
          </Button>
        </div>
      </div>
    );
  }

  return (
    // --- MODIFICATION: Added 'select-none' to prevent highlighting ---
    <div
      className="min-h-screen w-full bg-background text-foreground font-press-start flex flex-col items-center justify-start p-8 relative select-none"
      style={{
        backgroundImage: "url('/bg.jpg'), url('/background.jpg')",
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat'
      }}
    >
      <div className="absolute left-0 top-0 w-full flex justify-between px-8 pt-6 z-20">
        <div className="flex flex-col items-start">
          <div className="text-lg pointer-events-none">Time: {formatTime(seconds)}</div>
          <div className="text-lg pointer-events-none">Score: {score} | Hits: {hits}</div>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={() => setHandModeEnabled((prev) => !prev)}
            className={`${handModeEnabled ? "bg-green-600 hover:bg-green-700" : "bg-blue-600 hover:bg-blue-700"} text-white px-4 py-2 rounded`}
            title={handModeEnabled ? "Disable Hand Mode" : "Enable Hand Mode"}
          >
            {handModeEnabled ? "Hand Mode: ON" : "Hand Mode: OFF"}
          </Button>
          <Button onClick={onBackToMenu} className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600">
            Leave Game
          </Button>
        </div>
      </div>
      <audio ref={dieAudioRef} src="/audio/die.mp3" preload="auto" />
      <audio ref={gunAudioRef} src="/audio/gun.mp3" preload="auto" />
      <audio ref={bgMusicRef} src="/audio/gamemusic.mp3" preload="auto" loop />
      <audio ref={countdownAudioRef} src="/audio/Countdown.mp3" preload="auto" />
      <div className="w-full max-w-4xl flex justify-center items-start mt-24 z-10">
        <div 
          ref={gameContainerRef}
          className="w-full max-w-4xl aspect-[16/9] relative overflow-hidden rounded-lg border-4 border-gray-300 shadow-lg"
          style={{ 
            cursor: 'none',
            position: 'relative'
          }}
          onMouseMove={handleMouseMove}
          onClick={handleGameAreaClick}
        >
          {/* Canvas for game rendering */}
          <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
            style={{ imageRendering: 'auto' }}
          />

          {!gameStarted && (
            <div className="absolute inset-0 flex items-center justify-center z-50 bg-black/20">
              <div className="text-6xl text-white font-bold">{countdown}</div>
            </div>
          )}
        </div>
      </div>
      {gameStarted && !gameOver && <Toaster />}
      {/* Hand tracking preview lives outside the game container in bottom-right */}
      <HandTrackingView
        enabled={handModeEnabled}
        onEnter={() => console.log("Hand mode entered")}
        onExit={() => console.log("Hand mode exited")}
        onFingerMove={undefined}
        onPinch={() => {
          // Only process hits during active game
          if (!gameStarted || gameOver) return;
          
          // Trigger hit animation
          cursorAnimRef.current.isHitting = true;
          cursorAnimRef.current.hitFrame = 0;
          cursorAnimRef.current.hitTimer = 0;
          if (gunAudioRef.current) {
            gunAudioRef.current.currentTime = 0;
            gunAudioRef.current.play();
          }
          
          // Use current real-time hand position for hit detection (same as mouse)
          if (cursorPosRef.current) {
            const hitRadius = getScaledSize(32);
            const cx = cursorPosRef.current.x;
            const cy = cursorPosRef.current.y;
            const r2 = hitRadius * hitRadius;

            const candidates = queryNearbyBirds(cx, cy, hitRadius);
            for (let i = 0; i < candidates.length; i++) {
              const bird = candidates[i];
              const dx = cx - bird.x;
              const dy = cy - bird.y;
              if (dx * dx + dy * dy < r2) {
                catchBird(bird.id);
              }
            }
          }
        }}
        onHandData={(data) => {
          if (!handModeEnabled) return;
          const source = data.palmCenter;
          if (!source) return;

          // Direct position update - no smoothing for maximum responsiveness
          const nx = Math.max(0, Math.min(1, source.x));
          const ny = Math.max(0, Math.min(1, source.y));
          
          // Update position immediately
          updateHandPosition({ x: nx, y: ny });
        }}
      />

      {/* No calibration UI: simple palm control + pinch to hit */}
    </div>
  );
};

export default GameScreen;