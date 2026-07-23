/** Captura frontal/trasera con intento de flash/torch (obligatorio al abrir la app). */

export type CamaraFacing = "user" | "environment";

export type CapturaFotoResultado = {
  blob: Blob;
  flashActivo: boolean;
  torchSoportado: boolean;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function setTorch(track: MediaStreamTrack, on: boolean): Promise<boolean> {
  const caps = track.getCapabilities?.() as
    | (MediaTrackCapabilities & { torch?: boolean })
    | undefined;
  if (!caps?.torch) return false;
  try {
    await track.applyConstraints({
      advanced: [{ torch: on }],
    } as unknown as MediaTrackConstraints);
    return on;
  } catch {
    try {
      await track.applyConstraints({
        torch: on,
      } as unknown as MediaTrackConstraints);
      return on;
    } catch {
      return false;
    }
  }
}

async function snapshotVideo(
  video: HTMLVideoElement,
  mirror: boolean,
): Promise<Blob> {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error("Cámara sin imagen");
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("No se pudo capturar");
  if (mirror) {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
  );
  if (!blob) throw new Error("No se pudo generar la foto");
  return blob;
}

async function takePhotoWithFlash(
  track: MediaStreamTrack,
  flashWanted: boolean,
): Promise<{ blob: Blob; flashActivo: boolean } | null> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const IC = (window as any).ImageCapture as
    | (new (t: MediaStreamTrack) => {
        takePhoto: (opts?: { fillLightMode?: string }) => Promise<Blob>;
        getPhotoCapabilities?: () => Promise<{ fillLightMode?: string[] }>;
      })
    | undefined;
  if (!IC) return null;
  try {
    const capture = new IC(track);
    if (flashWanted && capture.getPhotoCapabilities) {
      try {
        const caps = await capture.getPhotoCapabilities();
        if (caps.fillLightMode?.includes("flash")) {
          const blob = await capture.takePhoto({ fillLightMode: "flash" });
          return { blob, flashActivo: true };
        }
      } catch {
        /* fallback */
      }
    }
    const blob = await capture.takePhoto(
      flashWanted ? { fillLightMode: "flash" } : undefined,
    );
    return { blob, flashActivo: false };
  } catch {
    return null;
  }
}

async function capturarConStream(
  facing: CamaraFacing,
  exact: boolean,
  previewVideo?: HTMLVideoElement | null,
): Promise<CapturaFotoResultado> {
  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("Este dispositivo no permite usar la cámara");
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: {
      facingMode: exact ? { exact: facing } : facing,
      width: { ideal: 1920 },
      height: { ideal: 1080 },
    },
  });

  const track = stream.getVideoTracks()[0];
  if (!track) {
    stream.getTracks().forEach((t) => t.stop());
    throw new Error("No se encontró la cámara");
  }

  const video = previewVideo ?? document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.setAttribute("playsinline", "true");
  video.srcObject = stream;

  try {
    await video.play();
    await new Promise<void>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("Timeout cámara")), 12_000);
      const check = () => {
        if (video.videoWidth > 0) {
          clearTimeout(t);
          resolve();
        } else {
          requestAnimationFrame(check);
        }
      };
      check();
    });

    const caps = track.getCapabilities?.() as
      | (MediaTrackCapabilities & { torch?: boolean })
      | undefined;
    const torchSoportado = Boolean(caps?.torch);

    let flashActivo = false;
    if (torchSoportado) {
      flashActivo = await setTorch(track, true);
      if (!flashActivo) {
        throw new Error(
          facing === "environment"
            ? "No se pudo activar el flash de la cámara trasera. Reintenta."
            : "No se pudo activar el flash de la cámara frontal. Reintenta.",
        );
      }
      await sleep(350);
    }

    const withIc = await takePhotoWithFlash(track, true);
    const blob =
      withIc?.blob ?? (await snapshotVideo(video, facing === "user"));
    flashActivo = flashActivo || Boolean(withIc?.flashActivo);

    if (torchSoportado && !flashActivo) {
      throw new Error("El flash es obligatorio y no se activó.");
    }

    return { blob, flashActivo, torchSoportado };
  } finally {
    try {
      await setTorch(track, false);
    } catch {
      /* ignore */
    }
    stream.getTracks().forEach((t) => t.stop());
    video.srcObject = null;
  }
}

/** Intenta exact facing; si falla, reintenta sin exact (iOS). */
export async function capturarFotoCamaraRobusto(
  facing: CamaraFacing,
  opts?: { previewVideo?: HTMLVideoElement | null },
): Promise<CapturaFotoResultado> {
  try {
    return await capturarConStream(facing, true, opts?.previewVideo);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("flash")) throw e;
    return capturarConStream(facing, false, opts?.previewVideo);
  }
}
