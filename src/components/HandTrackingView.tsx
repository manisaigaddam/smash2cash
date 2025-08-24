import { useEffect, useRef, useState } from "react";

// Define the global variables that will be available from the script tags
declare const Camera: any;
declare const Hands: any;
declare const HAND_CONNECTIONS: any;
declare const drawConnectors: any;
declare const drawLandmarks: any;


export interface HandTrackingViewProps {
  enabled: boolean;
  onEnter?: () => void;
  onExit?: () => void;
  onFingerMove?: (normX: number, normY: number) => void;
  onPinch?: () => void;
  onHandData?: (data: {
    indexTip: { x: number; y: number } | null;
    indexMCP: { x: number; y: number } | null;
    wrist: { x: number; y: number } | null;
    palmCenter: { x: number; y: number } | null;
    isPinch: boolean;
  }) => void;
}

const HandTrackingView = ({ enabled, onEnter, onExit, onFingerMove, onPinch, onHandData }: HandTrackingViewProps) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const cameraControllerRef = useRef<any>(null);
  const handsRef = useRef<any>(null);
  const onEnterRef = useRef<typeof onEnter | undefined>(onEnter);
  const onExitRef = useRef<typeof onExit | undefined>(onExit);
  const onFingerMoveRef = useRef<typeof onFingerMove | undefined>(onFingerMove);
  const onPinchRef = useRef<typeof onPinch | undefined>(onPinch);
  const onHandDataRef = useRef<typeof onHandData | undefined>(onHandData);
  const lastPinchAtRef = useRef<number>(0);
  const pinchActiveRef = useRef<boolean>(false);

  useEffect(() => {
    onEnterRef.current = onEnter;
    onExitRef.current = onExit;
    onFingerMoveRef.current = onFingerMove;
    onPinchRef.current = onPinch;
    onHandDataRef.current = onHandData;
  }, [onEnter, onExit, onFingerMove, onPinch, onHandData]);

  useEffect(() => {
    let isCancelled = false;

    const start = () => {
      if (!enabled || !videoRef.current) return;
      setError(null);
      setLoading(true);

      try {
        // Check if the scripts have loaded and attached themselves to the window
        if (typeof Hands === 'undefined' || typeof Camera === 'undefined' || typeof drawConnectors === 'undefined') {
          throw new Error("MediaPipe scripts not loaded from CDN. Check the script tags in index.html and your network connection.");
        }

        const video = videoRef.current;
        const canvas = canvasRef.current!;
        const ctx = canvas.getContext("2d")!;

        const hands = new Hands({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`,
        });
        
        hands.setOptions({
          maxNumHands: 1,
          modelComplexity: 0, // Reduced from 1 for better performance
          minDetectionConfidence: 0.6, // Slightly reduced for faster detection
          minTrackingConfidence: 0.4, // Reduced for smoother tracking
        });
        handsRef.current = hands;

        const isPinching = (landmarks: any[]) => {
          const thumbTip = landmarks[4];
          const indexTip = landmarks[8];
          const indexMCP = landmarks[5];
          const pinkyMCP = landmarks[17];
          const palmWidth = Math.hypot(indexMCP.x - pinkyMCP.x, indexMCP.y - pinkyMCP.y);
          const tipDist = Math.hypot(thumbTip.x - indexTip.x, thumbTip.y - indexTip.y);
          if (palmWidth === 0) return false;
          return tipDist < palmWidth * 0.45;
        };

        hands.onResults((results: any) => {
          const w = video.videoWidth || 640;
          const h = video.videoHeight || 480;
          if (canvas.width !== w) canvas.width = w;
          if (canvas.height !== h) canvas.height = h;

          ctx.save();
          ctx.clearRect(0, 0, w, h);
          ctx.scale(-1, 1);
          ctx.drawImage(results.image, -w, 0, w, h);
          ctx.restore();

          if (results.multiHandLandmarks) {
            for (const landmarks of results.multiHandLandmarks) {
              const mirrored = landmarks.map((p: any) => ({ ...p, x: 1 - p.x }));
              const pinched = isPinching(landmarks);
              drawConnectors(ctx, mirrored, HAND_CONNECTIONS, {
                color: pinched ? "#f59e0b" : "#22c55e",
                lineWidth: 3,
              });
              drawLandmarks(ctx, mirrored, {
                color: "#60a5fa",
                lineWidth: 1,
                radius: 3,
              });
            }

            const primary = results.multiHandLandmarks[0];
            if (primary) {
              if (onFingerMoveRef.current) {
                const indexTip = primary[8];
                onFingerMoveRef.current(1 - indexTip.x, indexTip.y);
              }
              const pinched = isPinching(primary);
              if (pinched !== pinchActiveRef.current) {
                pinchActiveRef.current = pinched;
                if (pinched) {
                  const now = performance.now();
                  if (now - lastPinchAtRef.current > 120) { // Reduced from 300ms for better responsiveness
                    lastPinchAtRef.current = now;
                    onPinchRef.current?.();
                  }
                }
              }

              if (onHandDataRef.current) {
                const getPoint = (i: number) => ({ x: 1 - primary[i].x, y: primary[i].y });
                const wrist = getPoint(0);
                const m5 = getPoint(5);
                const m9 = getPoint(9);
                const m13 = getPoint(13);
                const m17 = getPoint(17);
                const palmCenter = {
                  x: (wrist.x + m5.x + m9.x + m13.x + m17.x) / 5,
                  y: (wrist.y + m5.y + m9.y + m13.y + m17.y) / 5,
                };
                onHandDataRef.current({
                  indexTip: getPoint(8),
                  indexMCP: m5,
                  wrist,
                  palmCenter,
                  isPinch: pinched,
                });
              }
            }
          }
        });

        const camera = new Camera(video, {
          onFrame: async () => {
            if (!isCancelled) {
              await hands.send({ image: video });
            }
          },
          width: 320, // Reduced from 480 for better performance
          height: 240, // Reduced from 360 for better performance
        });
        cameraControllerRef.current = camera;
        camera.start();

        if (!isCancelled) {
          setLoading(false);
          onEnterRef.current?.();
        }
      } catch (err: any) {
        console.error("HandTrackingView error:", err);
        if (!isCancelled) {
          setLoading(false);
          setError(err?.message || "Failed to start camera or MediaPipe Hands");
        }
      }
    };

    const stop = () => {
      isCancelled = true;
      cameraControllerRef.current?.stop?.();
      cameraControllerRef.current = null;
      handsRef.current?.close?.();
      handsRef.current = null;
      onExitRef.current?.();
    };

    // Delay start to give scripts time to load from CDN
    const timeoutId = setTimeout(() => {
        start();
    }, 500);


    return () => {
      clearTimeout(timeoutId);
      stop();
    };
  }, [enabled]);

  if (!enabled) return null;

  return (
    <div className="fixed bottom-4 right-4 z-30 w-72 rounded-lg overflow-hidden shadow-lg border border-white/20 bg-black/50 backdrop-blur-sm">
      <div className="relative w-full" style={{ aspectRatio: "4 / 3" }}>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
        <video
          ref={videoRef}
          className="absolute inset-0 w-full h-full opacity-0"
          autoPlay
          playsInline
          muted
        />
        {loading && (
          <div className="absolute inset-0 grid place-items-center text-white text-xs bg-black/40">
            Initializing hand tracking…
          </div>
        )}
        {error && (
          <div className="absolute inset-0 grid place-items-center text-red-300 text-xs bg-black/60 p-2 text-center">
            {error}
          </div>
        )}
      </div>
      <div className="px-2 py-1 text-[10px] text-white/80 bg-black/40">Hand Mode</div>
    </div>
  );
};

export default HandTrackingView;



