// On-device face tracking for the camera link (web only), via MediaPipe's Face Landmarker.
// Every frame is processed in the browser; nothing here sends video anywhere. Only the model
// and its runtime are downloaded, once, from public CDNs.

const VERSION = '1.0.1';
const BUNDLE = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/vision_bundle.mjs`;
const WASM = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${VERSION}/wasm`;
const MODEL = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task';

export type Pt = { x: number; y: number; z: number };
export type Edge = { start: number; end: number };

export type FaceReading = {
  landmarks: Pt[]; // normalized 0..1 in video space
  box: { x: number; y: number; w: number; h: number };
  yaw: number; // degrees, + = turned to their left (our right in the mirrored view)
  pitch: number; // degrees, + = looking up
  roll: number;
  smile: number;
  jawOpen: number;
  blink: number;
  browUp: number;
  browDown: number;
};

export type Tracker = {
  detect(video: HTMLVideoElement, t: number): FaceReading[];
  edges: { oval: Edge[]; leftEye: Edge[]; rightEye: Edge[]; lips: Edge[]; leftBrow: Edge[]; rightBrow: Edge[] };
  close(): void;
};

// Bypass the bundler: this is a runtime ESM import from the CDN.
const importUrl = new Function('u', 'return import(u)') as (u: string) => Promise<any>;

let loading: Promise<Tracker> | null = null;

export function loadTracker(): Promise<Tracker> {
  if (!loading) {
    loading = (async () => {
      const vision = await importUrl(BUNDLE);
      const files = await vision.FilesetResolver.forVisionTasks(WASM);
      const make = (delegate: 'GPU' | 'CPU') =>
        vision.FaceLandmarker.createFromOptions(files, {
          baseOptions: { modelAssetPath: MODEL, delegate },
          runningMode: 'VIDEO',
          numFaces: 3,
          outputFaceBlendshapes: true,
          outputFacialTransformationMatrixes: true,
        });
      const landmarker = await make('GPU').catch(() => make('CPU'));
      const FL = vision.FaceLandmarker;
      return {
        edges: {
          oval: FL.FACE_LANDMARKS_FACE_OVAL,
          leftEye: FL.FACE_LANDMARKS_LEFT_EYE,
          rightEye: FL.FACE_LANDMARKS_RIGHT_EYE,
          lips: FL.FACE_LANDMARKS_LIPS,
          leftBrow: FL.FACE_LANDMARKS_LEFT_EYEBROW,
          rightBrow: FL.FACE_LANDMARKS_RIGHT_EYEBROW,
        },
        detect(video, t) {
          const r = landmarker.detectForVideo(video, t);
          return (r.faceLandmarks as Pt[][]).map((lm, i) => toReading(lm, r.faceBlendshapes?.[i], r.facialTransformationMatrixes?.[i]));
        },
        close: () => landmarker.close(),
      };
    })();
    loading.catch(() => { loading = null; }); // allow a retry after a network failure
  }
  return loading;
}

const DEG = 180 / Math.PI;

function toReading(lm: Pt[], shapes: any, matrix: any): FaceReading {
  let minX = 1, minY = 1, maxX = 0, maxY = 0;
  for (const p of lm) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  const s: Record<string, number> = {};
  for (const c of shapes?.categories ?? []) s[c.categoryName] = c.score;

  // column-major 4x4 rotation
  const m: number[] | undefined = matrix?.data;
  const yaw = m ? Math.atan2(m[8], m[10]) * DEG : 0;
  const pitch = m ? Math.asin(Math.max(-1, Math.min(1, -m[9]))) * DEG : 0;
  const roll = m ? Math.atan2(m[1], m[5]) * DEG : 0;

  return {
    landmarks: lm,
    box: { x: minX, y: minY, w: maxX - minX, h: maxY - minY },
    yaw,
    pitch,
    roll,
    smile: ((s.mouthSmileLeft ?? 0) + (s.mouthSmileRight ?? 0)) / 2,
    jawOpen: s.jawOpen ?? 0,
    blink: ((s.eyeBlinkLeft ?? 0) + (s.eyeBlinkRight ?? 0)) / 2,
    browUp: s.browInnerUp ?? 0,
    browDown: ((s.browDownLeft ?? 0) + (s.browDownRight ?? 0)) / 2,
  };
}

export function expressionOf(f: FaceReading): string {
  if (f.jawOpen > 0.45 && f.browUp > 0.35) return 'SURPRISED';
  if (f.smile > 0.55) return 'SMILING';
  if (f.jawOpen > 0.4) return 'TALKING';
  if (f.browDown > 0.45) return 'FOCUSED';
  if (f.blink > 0.6) return 'EYES CLOSED';
  return 'NEUTRAL';
}

export function distanceOf(f: FaceReading): string {
  if (f.box.w > 0.45) return 'CLOSE';
  if (f.box.w > 0.22) return 'NEAR';
  return 'FAR';
}

export function gazeOf(f: FaceReading): string {
  const h = f.yaw > 18 ? 'LEFT' : f.yaw < -18 ? 'RIGHT' : '';
  const v = f.pitch > 15 ? 'UP' : f.pitch < -15 ? 'DOWN' : '';
  return [v, h].filter(Boolean).join('-') || 'AT CAMERA';
}

/** Plain-language summary sent along with a look, as context for WYRD's vision model. */
export function describeForWyrd(faces: FaceReading[], trackedSec: number, blinks: number): string {
  if (faces.length === 0) return 'no face detected in frame';
  const f = faces[0];
  return [
    `${faces.length} face${faces.length > 1 ? 's' : ''} in frame`,
    `main face ${distanceOf(f).toLowerCase()} to the camera`,
    `looking ${gazeOf(f).toLowerCase()}`,
    `expression reads as ${expressionOf(f).toLowerCase()}`,
    `tracked for ${Math.round(trackedSec)}s with ${blinks} blinks`,
  ].join(', ');
}
