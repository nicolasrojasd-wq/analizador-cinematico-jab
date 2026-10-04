import {
  FilesetResolver,
  PoseLandmarker
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/+esm";

/**
 * JAB Motion Analyzer
 * ----------------------------------------------------
 * Flujo:
 * 1) cargar video;
 * 2) MediaPipe detecta landmarks cuadro a cuadro;
 * 3) se extraen hombro, codo y muñeca;
 * 4) se calcula el ángulo del codo;
 * 5) se detecta una fase aproximada de extensión;
 * 6) se calculan métricas y se crea el gráfico.
 */

// ----------------------------------------------------
// Referencias de la interfaz
// ----------------------------------------------------
const videoFile = document.getElementById("videoFile");
const videoElement = document.getElementById("videoElement");
const videoSurface = document.getElementById("videoSurface");
const overlayCanvas = document.getElementById("overlayCanvas");
const ctx = overlayCanvas.getContext("2d");

const analyzeButton = document.getElementById("analyzeButton");
const resetButton = document.getElementById("resetButton");
const cameraButton = document.getElementById("cameraButton");

const armSelect = document.getElementById("armSelect");
const visibilityThreshold = document.getElementById("visibilityThreshold");

const fileInfo = document.getElementById("fileInfo");
const videoPlaceholder = document.getElementById("videoPlaceholder");
const systemStatus = document.getElementById("systemStatus");

const progressWrap = document.getElementById("progressWrap");
const progressText = document.getElementById("progressText");
const progressBar = document.getElementById("progressBar");

const liveTime = document.getElementById("liveTime");
const liveAngle = document.getElementById("liveAngle");
const liveDetectionStatus = document.getElementById("liveDetectionStatus");

const overlayHud = document.getElementById("overlayHud");
const overlayPhase = document.getElementById("overlayPhase");
const overlayAngle = document.getElementById("overlayAngle");
const overlayTime = document.getElementById("overlayTime");
const visualizationNote = document.getElementById("visualizationNote");


const metricInitialAngle = document.getElementById("metricInitialAngle");
const metricMaxAngle = document.getElementById("metricMaxAngle");
const metricRange = document.getElementById("metricRange");
const metricDuration = document.getElementById("metricDuration");
const metricMaxAngularVelocity = document.getElementById("metricMaxAngularVelocity");
const metricMeanJabVelocity = document.getElementById("metricMeanJabVelocity");
const metricReturnTime = document.getElementById("metricReturnTime");
const metricValidFrames = document.getElementById("metricValidFrames");
const interpretationText = document.getElementById("interpretationText");

const angleChartCanvas = document.getElementById("angleChart");

// ----------------------------------------------------
// Variables globales
// ----------------------------------------------------
let poseLandmarker = null;
let currentVideoUrl = null;
let angleChart = null;
let analysisData = [];
let isAnalyzing = false;
let cameraStream = null;
let playbackAnimationId = null;
let detectedMovement = null;
let lastRenderedPlaybackTime = -1;


const MEDIAPIPE_WASM_ROOT =
  "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";

// Modelo oficial alojado por Google.
// Más adelante podemos descargarlo y guardarlo en /models.
const POSE_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/latest/pose_landmarker_full.task";

// Índices oficiales de MediaPipe Pose:
// 11 hombro izquierdo, 12 hombro derecho
// 13 codo izquierdo,   14 codo derecho
// 15 muñeca izquierda, 16 muñeca derecha
const LANDMARKS = {
  left: {
    shoulder: 11,
    elbow: 13,
    wrist: 15
  },
  right: {
    shoulder: 12,
    elbow: 14,
    wrist: 16
  }
};

// ----------------------------------------------------
// Inicialización de MediaPipe
// ----------------------------------------------------
async function initializeMediaPipe() {
  try {
    updateSystemStatus("Inicializando MediaPipe...", "loading");

    const vision = await FilesetResolver.forVisionTasks(MEDIAPIPE_WASM_ROOT);

    poseLandmarker = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: POSE_MODEL_URL,
        delegate: "GPU"
      },
      runningMode: "VIDEO",
      numPoses: 1,
      minPoseDetectionConfidence: 0.5,
      minPosePresenceConfidence: 0.5,
      minTrackingConfidence: 0.5,
      outputSegmentationMasks: false
    });

    updateSystemStatus("MediaPipe listo", "ready");
    updateAnalyzeButtonState();
  } catch (error) {
    console.error("Error al inicializar MediaPipe:", error);
    updateSystemStatus("Error al cargar MediaPipe", "error");
    alert(
      "No se pudo inicializar MediaPipe. Revisa tu conexión a internet y abre la página mediante HTTPS o localhost."
    );
  }
}

function updateSystemStatus(text, state) {
  systemStatus.querySelector("span:last-child").textContent = text;
  systemStatus.classList.remove("ready", "error");

  if (state === "ready") {
    systemStatus.classList.add("ready");
  } else if (state === "error") {
    systemStatus.classList.add("error");
  }
}

// ----------------------------------------------------
// Carga de video
// ----------------------------------------------------
videoFile.addEventListener("change", handleVideoUpload);

function handleVideoUpload(event) {
  const file = event.target.files?.[0];

  if (!file) return;

  stopCamera();

  if (currentVideoUrl) {
    URL.revokeObjectURL(currentVideoUrl);
  }

  currentVideoUrl = URL.createObjectURL(file);
  videoElement.src = currentVideoUrl;
  videoElement.load();

  fileInfo.innerHTML = `<span class="file-info__dot"></span><span>${file.name} · ${formatBytes(file.size)}</span>`;
  videoPlaceholder.hidden = true;
  videoPlaceholder.style.display = "none";

  clearResults();
  updateAnalyzeButtonState();
}

videoElement.addEventListener("loadedmetadata", () => {
  videoPlaceholder.hidden = true;
  videoPlaceholder.style.display = "none";
  requestAnimationFrame(() => {
    resizeOverlayCanvas();
    syncOverlayToPlayback();
  });
  updateAnalyzeButtonState();

  const duration = Number.isFinite(videoElement.duration)
    ? `${videoElement.duration.toFixed(2)} s`
    : "duración no disponible";

  const fileText = fileInfo.querySelector("span:last-child");
  if (fileText) {
    fileText.textContent += ` · ${duration}`;
  }
});

window.addEventListener("resize", () => {
  resizeOverlayCanvas();
  syncOverlayToPlayback();
});

function resizeOverlayCanvas() {
  const rect = videoElement.getBoundingClientRect();

  if (!rect.width || !rect.height) return;

  /*
   * El canvas usa exactamente el mismo tamaño CSS que el video visible.
   * Usamos devicePixelRatio para mantener el dibujo nítido sin alterar
   * el sistema de coordenadas.
   */
  const dpr = window.devicePixelRatio || 1;

  overlayCanvas.style.width = `${rect.width}px`;
  overlayCanvas.style.height = `${rect.height}px`;

  overlayCanvas.width = Math.round(rect.width * dpr);
  overlayCanvas.height = Math.round(rect.height * dpr);

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function updateAnalyzeButtonState() {
  const hasVideo = Boolean(videoElement.src);
  analyzeButton.disabled = !hasVideo || !poseLandmarker || isAnalyzing;
}


// Mantiene el canvas bloqueado al tamaño real del video incluso si cambia
// el tamaño de la ventana, orientación del teléfono o layout responsive.
const videoResizeObserver = new ResizeObserver(() => {
  resizeOverlayCanvas();
  syncOverlayToPlayback();
});
videoResizeObserver.observe(videoElement);

// ----------------------------------------------------
// Cámara
// ----------------------------------------------------
cameraButton.addEventListener("click", toggleCamera);

async function toggleCamera() {
  if (cameraStream) {
    stopCamera();
    cameraButton.innerHTML = "<span>📷</span> Usar cámara";
    return;
  }

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 1280 },
        height: { ideal: 720 }
      },
      audio: false
    });

    cameraStream = stream;

    if (currentVideoUrl) {
      URL.revokeObjectURL(currentVideoUrl);
      currentVideoUrl = null;
    }

    videoElement.removeAttribute("src");
    videoElement.srcObject = stream;
    videoElement.controls = false;
    videoElement.autoplay = true;
    videoElement.muted = true;
    await videoElement.play();

    videoPlaceholder.hidden = true;
    videoPlaceholder.style.display = "none";
    fileInfo.innerHTML =
      `<span class="file-info__dot"></span><span>Cámara activa. La visualización en vivo está disponible; el análisis cuantitativo se recomienda con video cargado.</span>`;
    cameraButton.innerHTML = "<span>⏹️</span> Detener cámara";

    clearResults();
    resizeOverlayCanvas();
    startLiveCameraOverlay();
  } catch (error) {
    console.error("Error al activar cámara:", error);
    alert(
      "No se pudo acceder a la cámara. Debes abrir la página mediante HTTPS o localhost y autorizar el permiso de cámara."
    );
  }
}

function stopCamera() {
  if (!cameraStream) return;

  cameraStream.getTracks().forEach((track) => track.stop());
  cameraStream = null;
  videoElement.srcObject = null;
  videoElement.controls = true;
  clearCanvas();
}

let lastMediaPipeTimestamp = 0;

function getMonotonicTimestamp() {
  const now = performance.now();
  lastMediaPipeTimestamp = Math.max(now, lastMediaPipeTimestamp + 1);
  return lastMediaPipeTimestamp;
}

let lastCameraVideoTime = -1;

function startLiveCameraOverlay() {
  const renderCamera = () => {
    if (!cameraStream || !poseLandmarker) return;

    if (
      videoElement.readyState >= 2 &&
      videoElement.currentTime !== lastCameraVideoTime
    ) {
      const timestampMs = getMonotonicTimestamp();

      try {
        const result = poseLandmarker.detectForVideo(
          videoElement,
          timestampMs
        );

        drawLiveResult(result);

        lastCameraVideoTime = videoElement.currentTime;
      } catch (error) {
        console.warn("No fue posible procesar este cuadro de cámara:", error);
      }
    }

    requestAnimationFrame(renderCamera);
  };

  requestAnimationFrame(renderCamera);
}

// ----------------------------------------------------
// Análisis principal
// ----------------------------------------------------
analyzeButton.addEventListener("click", analyzeVideo);

async function analyzeVideo() {
  if (!poseLandmarker) {
    alert("MediaPipe aún no está listo.");
    return;
  }

  if (!videoElement.src || videoElement.srcObject) {
    alert(
      "Para obtener las métricas de esta versión, carga un video grabado desde el dispositivo."
    );
    return;
  }

  if (!Number.isFinite(videoElement.duration) || videoElement.duration <= 0) {
    alert("No se pudo determinar la duración del video.");
    return;
  }

  isAnalyzing = true;
  updateAnalyzeButtonState();
  clearResults();

  progressWrap.hidden = false;
  setProgress(0);

  // Pausamos para evitar que el video avance por sí solo.
  videoElement.pause();

  const selectedArm = armSelect.value;
  const minVisibility = Number(visibilityThreshold.value);

  // 30 muestras por segundo como máximo.
  // Esto mantiene buena resolución temporal sin volver excesivamente lento
  // el procesamiento en navegadores y teléfonos.
  const targetSampleRate = 30;
  const frameStep = 1 / targetSampleRate;

  analysisData = [];

  try {
    const duration = videoElement.duration;
    const totalSteps = Math.max(1, Math.ceil(duration / frameStep));

    for (let step = 0; step <= totalSteps; step++) {
      const targetTime = Math.min(step * frameStep, duration);

      await seekVideo(targetTime);

      const timestampMs = getMonotonicTimestamp();

      const result = poseLandmarker.detectForVideo(
        videoElement,
        timestampMs
      );

      const processedFrame = processPoseResult(
        result,
        selectedArm,
        targetTime,
        minVisibility
      );

      if (processedFrame) {
        analysisData.push(processedFrame);
        drawFrame(processedFrame);
      } else {
        clearCanvas();
      }

      const percent = Math.round((step / totalSteps) * 100);
      setProgress(percent);

      // Permite que la interfaz se actualice entre inferencias.
      await nextAnimationFrame();
    }

    const cleanedData = removeLargeAngleOutliers(analysisData);

    if (cleanedData.length < 5) {
      throw new Error(
        "Se detectaron muy pocos cuadros válidos. Prueba con un video más claro, donde hombro, codo y muñeca sean visibles."
      );
    }

    analysisData = cleanedData;

    const movement = detectExtensionPhase(analysisData);
    detectedMovement = movement;

    if (!movement) {
      throw new Error(
        "No se pudo identificar una fase clara de extensión. Prueba con un video que contenga un solo JAB y mantenga visible el brazo."
      );
    }

    const metrics = calculateMetrics(movement);

    renderMetrics(metrics);
    renderChart(analysisData, movement);
    renderInterpretation(metrics);

    // Dejamos el video listo para reproducirse desde el comienzo.
    await seekVideo(0);
    videoElement.controls = true;
    videoPlaceholder.hidden = true;
    videoPlaceholder.style.display = "none";
    overlayHud.hidden = false;
    visualizationNote.textContent =
      "Análisis listo. Reproduce el video o mueve la barra de tiempo para revisar el ángulo, la trayectoria de la muñeca y la fase del movimiento.";

    syncOverlayToPlayback();
    liveDetectionStatus.textContent = "Análisis completado";

    setProgress(100);
  } catch (error) {
    console.error("Error durante el análisis:", error);
    alert(error.message || "Ocurrió un error durante el análisis.");
    liveDetectionStatus.textContent = "Error de análisis";
  } finally {
    isAnalyzing = false;
    updateAnalyzeButtonState();

    window.setTimeout(() => {
      progressWrap.hidden = true;
    }, 600);
  }
}

// ----------------------------------------------------
// Procesamiento de landmarks
// ----------------------------------------------------
function processPoseResult(result, arm, time, minVisibility) {
  if (!result?.landmarks?.length) return null;

  const pose = result.landmarks[0];
  const indices = LANDMARKS[arm];

  const shoulder = pose[indices.shoulder];
  const elbow = pose[indices.elbow];
  const wrist = pose[indices.wrist];

  if (!shoulder || !elbow || !wrist) return null;

  const visibilityValues = [
    shoulder.visibility ?? 0,
    elbow.visibility ?? 0,
    wrist.visibility ?? 0
  ];

  const allVisible = visibilityValues.every(
    (value) => value >= minVisibility
  );

  if (!allVisible) return null;

  const angle = calculateJointAngle(shoulder, elbow, wrist);

  if (!Number.isFinite(angle)) return null;

  return {
    time,
    angle,
    shoulder: { ...shoulder },
    elbow: { ...elbow },
    wrist: { ...wrist },
    visibility: Math.min(...visibilityValues)
  };
}

/**
 * Calcula el ángulo hombro-codo-muñeca.
 *
 * v1 = hombro - codo
 * v2 = muñeca - codo
 *
 * cos(theta) = (v1 · v2) / (|v1| |v2|)
 */
function calculateJointAngle(shoulder, elbow, wrist) {
  const v1 = {
    x: shoulder.x - elbow.x,
    y: shoulder.y - elbow.y
  };

  const v2 = {
    x: wrist.x - elbow.x,
    y: wrist.y - elbow.y
  };

  const dotProduct = v1.x * v2.x + v1.y * v2.y;

  const magnitudeV1 = Math.sqrt(v1.x ** 2 + v1.y ** 2);
  const magnitudeV2 = Math.sqrt(v2.x ** 2 + v2.y ** 2);

  if (magnitudeV1 === 0 || magnitudeV2 === 0) {
    return NaN;
  }

  let cosine = dotProduct / (magnitudeV1 * magnitudeV2);

  // Evita errores numéricos de arccos si el valor queda
  // levemente fuera del intervalo [-1, 1].
  cosine = Math.max(-1, Math.min(1, cosine));

  const radians = Math.acos(cosine);
  const degrees = radians * (180 / Math.PI);

  return degrees;
}

/**
 * Eliminación muy simple de saltos extremos.
 * Si un valor cambia más de 35° respecto al anterior en una sola muestra,
 * se considera sospechoso y no se utiliza.
 */
function removeLargeAngleOutliers(data) {
  if (data.length < 2) return data;

  const filtered = [data[0]];

  for (let i = 1; i < data.length; i++) {
    const previous = filtered[filtered.length - 1];
    const current = data[i];

    if (Math.abs(current.angle - previous.angle) <= 35) {
      filtered.push(current);
    }
  }

  return filtered;
}

// ----------------------------------------------------
// Detección aproximada de la fase de extensión
// ----------------------------------------------------
function detectExtensionPhase(data) {
  if (data.length < 5) return null;

  // Suavizado por media móvil para reducir pequeñas oscilaciones.
  const smoothed = movingAverage(data, 3);

  // Máximo global del ángulo = máxima extensión observada.
  let maxIndex = 0;

  for (let i = 1; i < smoothed.length; i++) {
    if (smoothed[i].angle > smoothed[maxIndex].angle) {
      maxIndex = i;
    }
  }

  if (maxIndex < 2) return null;

  // Ángulo basal aproximado de la guardia usando las primeras muestras.
  const baselineCount = Math.min(
    8,
    Math.max(3, Math.floor(smoothed.length * 0.15))
  );

  const baselineAngle =
    smoothed
      .slice(0, baselineCount)
      .reduce((sum, item) => sum + item.angle, 0) / baselineCount;

  // Inicio de extensión: aproximadamente 10° sobre la guardia.
  const startThreshold = baselineAngle + 10;

  let startIndex = 0;

  for (let i = 1; i < maxIndex; i++) {
    const current = smoothed[i];
    const next = smoothed[Math.min(i + 1, maxIndex)];
    const increasing = next.angle >= current.angle - 1;

    if (current.angle >= startThreshold && increasing) {
      startIndex = Math.max(0, i - 1);
      break;
    }
  }

  const extensionData = smoothed.slice(startIndex, maxIndex + 1);

  if (extensionData.length < 3) return null;

  /*
   * Retorno a guardia:
   * después de la máxima extensión buscamos el primer instante en el que
   * el ángulo vuelve a estar cerca del ángulo basal (±10°) y viene
   * disminuyendo respecto de la muestra anterior.
   */
  const returnTolerance = 10;
  let returnIndex = null;

  for (let i = maxIndex + 2; i < smoothed.length; i++) {
    const previous = smoothed[i - 1];
    const current = smoothed[i];

    const closeToGuard =
      Math.abs(current.angle - baselineAngle) <= returnTolerance;

    const decreasing = current.angle <= previous.angle + 1;

    if (closeToGuard && decreasing) {
      returnIndex = i;
      break;
    }
  }

  return {
    data: extensionData,
    allSmoothedData: smoothed,
    start: extensionData[0],
    end: extensionData[extensionData.length - 1],
    startIndex,
    endIndex: maxIndex,
    baselineAngle,
    returnIndex,
    returnPoint: returnIndex !== null ? smoothed[returnIndex] : null
  };
}

function movingAverage(data, windowSize) {
  return data.map((item, index) => {
    const from = Math.max(0, index - Math.floor(windowSize / 2));
    const to = Math.min(data.length - 1, index + Math.floor(windowSize / 2));

    const slice = data.slice(from, to + 1);
    const mean =
      slice.reduce((sum, point) => sum + point.angle, 0) / slice.length;

    return {
      ...item,
      angle: mean
    };
  });
}

// ----------------------------------------------------
// Métricas
// ----------------------------------------------------
function calculateMetrics(movement) {
  const extensionData = movement.data;

  const initial = extensionData[0];
  const maximum = extensionData.reduce((best, current) =>
    current.angle > best.angle ? current : best
  );

  const duration = maximum.time - initial.time;
  const range = maximum.angle - initial.angle;

  /*
   * "Velocidad del JAB" expresada de forma biomecánicamente defendible:
   * velocidad angular media de extensión del codo.
   *
   * ω media = Δθ / Δt
   */
  const meanJabAngularVelocity =
    duration > 0 ? range / duration : 0;

  let maxAngularVelocity = 0;

  for (let i = 1; i < extensionData.length; i++) {
    const previous = extensionData[i - 1];
    const current = extensionData[i];

    const deltaTime = current.time - previous.time;

    if (deltaTime <= 0) continue;

    const angularVelocity =
      (current.angle - previous.angle) / deltaTime;

    if (angularVelocity > maxAngularVelocity) {
      maxAngularVelocity = angularVelocity;
    }
  }

  const returnDuration = movement.returnPoint
    ? movement.returnPoint.time - maximum.time
    : null;

  return {
    initialAngle: initial.angle,
    maxAngle: maximum.angle,
    range,
    duration,
    meanJabAngularVelocity,
    maxAngularVelocity,
    returnDuration,
    validFrames: analysisData.length,
    timeOfMax: maximum.time
  };
}

function renderMetrics(metrics) {
  metricInitialAngle.textContent = `${metrics.initialAngle.toFixed(1)}°`;
  metricMaxAngle.textContent = `${metrics.maxAngle.toFixed(1)}°`;
  metricRange.textContent = `${metrics.range.toFixed(1)}°`;
  metricDuration.textContent = `${metrics.duration.toFixed(3)} s`;
  metricMaxAngularVelocity.textContent =
    `${metrics.maxAngularVelocity.toFixed(1)} °/s`;
  metricMeanJabVelocity.textContent =
    `${metrics.meanJabAngularVelocity.toFixed(1)} °/s`;
  metricReturnTime.textContent =
    metrics.returnDuration !== null
      ? `${metrics.returnDuration.toFixed(3)} s`
      : "No detectado";
  metricValidFrames.textContent = `${metrics.validFrames}`;
}

function renderInterpretation(metrics) {
  interpretationText.textContent =
    `Durante el registro analizado, el ángulo del codo aumentó desde ` +
    `${metrics.initialAngle.toFixed(1)}° hasta ${metrics.maxAngle.toFixed(1)}°. ` +
    `La máxima extensión detectada ocurrió ${metrics.duration.toFixed(3)} s después del inicio estimado de la extensión. ` +
    `El rango angular observado fue de ${metrics.range.toFixed(1)}° y la velocidad angular media de extensión fue de ` +
    `${metrics.meanJabAngularVelocity.toFixed(1)} °/s. ` +
    (metrics.returnDuration !== null
      ? `El retorno aproximado a guardia se detectó ${metrics.returnDuration.toFixed(3)} s después de la máxima extensión. `
      : `No se detectó de forma confiable un retorno completo a la guardia dentro del registro. `) +
    `Estos valores describen únicamente este registro y deben interpretarse considerando las limitaciones de un análisis 2D.`;
}

// ----------------------------------------------------
// Gráfico
// ----------------------------------------------------
function renderChart(data, movement) {
  if (angleChart) {
    angleChart.destroy();
  }

  const movementStart = movement.start.time;
  const movementEnd = movement.end.time;

  angleChart = new Chart(angleChartCanvas, {
    type: "line",
    data: {
      labels: data.map((item) => item.time.toFixed(2)),
      datasets: [
        {
          label: "Ángulo del codo",
          data: data.map((item) => item.angle.toFixed(2)),
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.18
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false
      },
      plugins: {
        legend: {
          labels: {
            color: "#f4f7fb"
          }
        },
        tooltip: {
          callbacks: {
            afterLabel(context) {
              const time = Number(context.label);

              if (time >= movementStart && time <= movementEnd) {
                return "Fase estimada de extensión";
              }

              return "";
            }
          }
        }
      },
      scales: {
        x: {
          title: {
            display: true,
            text: "Tiempo (s)",
            color: "#9eb0c3"
          },
          ticks: {
            color: "#9eb0c3",
            maxTicksLimit: 10
          },
          grid: {
            color: "rgba(255,255,255,0.06)"
          }
        },
        y: {
          title: {
            display: true,
            text: "Ángulo del codo (°)",
            color: "#9eb0c3"
          },
          suggestedMin: 40,
          suggestedMax: 180,
          ticks: {
            color: "#9eb0c3"
          },
          grid: {
            color: "rgba(255,255,255,0.06)"
          }
        }
      }
    }
  });
}

// ----------------------------------------------------
// Dibujo sobre video
// ----------------------------------------------------
function drawLiveResult(result) {
  clearCanvas();

  if (!result?.landmarks?.length) {
    liveDetectionStatus.textContent = "Pose no detectada";
    liveAngle.textContent = "--°";
    return;
  }

  const arm = armSelect.value;
  const indices = LANDMARKS[arm];
  const pose = result.landmarks[0];

  const shoulder = pose[indices.shoulder];
  const elbow = pose[indices.elbow];
  const wrist = pose[indices.wrist];

  if (!shoulder || !elbow || !wrist) return;

  const angle = calculateJointAngle(shoulder, elbow, wrist);

  drawArm(shoulder, elbow, wrist);
  drawElbowAngleArc(shoulder, elbow, wrist, angle);

  overlayHud.hidden = false;
  overlayPhase.textContent = "Cámara en vivo";
  overlayAngle.textContent = Number.isFinite(angle) ? `${angle.toFixed(1)}°` : "--°";
  overlayTime.textContent = `${videoElement.currentTime.toFixed(2)} s`;

  liveTime.textContent = `${videoElement.currentTime.toFixed(2)} s`;
  liveAngle.textContent =
    Number.isFinite(angle) ? `${angle.toFixed(1)}°` : "--°";
  liveDetectionStatus.textContent = "Pose detectada";
}

function drawFrame(frame, options = {}) {
  clearCanvas();

  const {
    phase = "Sin clasificar",
    trajectory = []
  } = options;

  drawTrajectory(trajectory);
  drawArm(frame.shoulder, frame.elbow, frame.wrist);
  drawElbowAngleArc(frame.shoulder, frame.elbow, frame.wrist, frame.angle);

  liveTime.textContent = `${frame.time.toFixed(2)} s`;
  liveAngle.textContent = `${frame.angle.toFixed(1)}°`;
  liveDetectionStatus.textContent = phase;

  overlayHud.hidden = false;
  overlayPhase.textContent = phase;
  overlayAngle.textContent = `${frame.angle.toFixed(1)}°`;
  overlayTime.textContent = `${frame.time.toFixed(2)} s`;
}


/**
 * Convierte las coordenadas normalizadas de MediaPipe al mismo rectángulo
 * visible del video. Como video y canvas ahora comparten exactamente
 * las mismas dimensiones, no se requieren offsets ni compensaciones.
 */
function normalizedLandmarkToCanvas(landmark) {
  const rect = videoElement.getBoundingClientRect();

  return {
    x: landmark.x * rect.width,
    y: landmark.y * rect.height
  };
}

function drawArm(shoulder, elbow, wrist) {
  resizeOverlayCanvas();

  const width = videoElement.getBoundingClientRect().width;

  const points = {
    shoulder: normalizedLandmarkToCanvas(shoulder),
    elbow: normalizedLandmarkToCanvas(elbow),
    wrist: normalizedLandmarkToCanvas(wrist)
  };

  ctx.save();

  // Segmentos del miembro superior.
  ctx.lineWidth = Math.max(5, width * 0.006);
  ctx.lineCap = "round";
  ctx.strokeStyle = "#55d6be";
  ctx.beginPath();
  ctx.moveTo(points.shoulder.x, points.shoulder.y);
  ctx.lineTo(points.elbow.x, points.elbow.y);
  ctx.lineTo(points.wrist.x, points.wrist.y);
  ctx.stroke();

  // Puntos anatómicos.
  const radius = Math.max(7, width * 0.008);

  [
    ["H", points.shoulder],
    ["C", points.elbow],
    ["M", points.wrist]
  ].forEach(([label, point]) => {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#07111f";
    ctx.font = `bold ${Math.max(11, width * 0.012)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(label, point.x, point.y);
  });

  ctx.restore();
}

function drawTrajectory(trajectory) {
  if (!trajectory || trajectory.length < 2) return;

  const width = videoElement.getBoundingClientRect().width;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, width * 0.0035);
  ctx.strokeStyle = "rgba(255, 210, 92, 0.88)";

  ctx.beginPath();

  trajectory.forEach((frame, index) => {
    const point = normalizedLandmarkToCanvas(frame.wrist);
    const x = point.x;
    const y = point.y;

    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });

  ctx.stroke();

  // Marca el inicio de la trayectoria.
  const first = normalizedLandmarkToCanvas(trajectory[0].wrist);
  ctx.fillStyle = "rgba(255, 210, 92, 0.95)";
  ctx.beginPath();
  ctx.arc(
    first.x,
    first.y,
    Math.max(4, width * 0.005),
    0,
    Math.PI * 2
  );
  ctx.fill();

  ctx.restore();
}

function drawElbowAngleArc(shoulder, elbow, wrist, angle) {
  const width = videoElement.getBoundingClientRect().width;

  const e = normalizedLandmarkToCanvas(elbow);
  const s = normalizedLandmarkToCanvas(shoulder);
  const w = normalizedLandmarkToCanvas(wrist);

  const startAngle = Math.atan2(s.y - e.y, s.x - e.x);
  let endAngle = Math.atan2(w.y - e.y, w.x - e.x);

  // Elegimos el arco menor entre ambos segmentos.
  let delta = endAngle - startAngle;
  while (delta > Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;

  const radius = Math.max(34, width * 0.055);

  ctx.save();
  ctx.lineWidth = Math.max(3, width * 0.003);
  ctx.strokeStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.arc(
    e.x,
    e.y,
    radius,
    startAngle,
    startAngle + delta,
    delta < 0
  );
  ctx.stroke();

  const midAngle = startAngle + delta / 2;
  const labelRadius = radius + Math.max(20, width * 0.025);
  const labelX = e.x + Math.cos(midAngle) * labelRadius;
  const labelY = e.y + Math.sin(midAngle) * labelRadius;

  const text = `${angle.toFixed(1)}°`;
  const fontSize = Math.max(18, width * 0.020);

  ctx.font = `800 ${fontSize}px sans-serif`;
  const metrics = ctx.measureText(text);
  const padX = 9;
  const padY = 6;

  ctx.fillStyle = "rgba(4,10,17,0.80)";
  ctx.fillRect(
    labelX - metrics.width / 2 - padX,
    labelY - fontSize / 2 - padY,
    metrics.width + padX * 2,
    fontSize + padY * 2
  );

  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, labelX, labelY);

  ctx.restore();
}

function clearCanvas() {
  const dpr = window.devicePixelRatio || 1;

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, overlayCanvas.width, overlayCanvas.height);
  ctx.restore();

  // Volvemos al sistema de coordenadas CSS.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

// ----------------------------------------------------
// Reproducción sincronizada con los resultados guardados
// ----------------------------------------------------
videoElement.addEventListener("play", startPlaybackOverlayLoop);
videoElement.addEventListener("pause", () => {
  stopPlaybackOverlayLoop();
  syncOverlayToPlayback();
});
videoElement.addEventListener("seeked", syncOverlayToPlayback);
videoElement.addEventListener("timeupdate", () => {
  if (videoElement.paused) {
    syncOverlayToPlayback();
  }
});

function startPlaybackOverlayLoop() {
  stopPlaybackOverlayLoop();

  const render = () => {
    syncOverlayToPlayback();

    if (!videoElement.paused && !videoElement.ended) {
      playbackAnimationId = requestAnimationFrame(render);
    }
  };

  playbackAnimationId = requestAnimationFrame(render);
}

function stopPlaybackOverlayLoop() {
  if (playbackAnimationId !== null) {
    cancelAnimationFrame(playbackAnimationId);
    playbackAnimationId = null;
  }
}

function syncOverlayToPlayback() {
  if (!analysisData.length || videoElement.srcObject) {
    return;
  }

  const currentTime = videoElement.currentTime || 0;

  // Evita trabajo duplicado si el tiempo prácticamente no cambió.
  if (
    !videoElement.paused &&
    Math.abs(currentTime - lastRenderedPlaybackTime) < 0.008
  ) {
    return;
  }

  lastRenderedPlaybackTime = currentTime;

  const frameIndex = findClosestFrameIndex(currentTime);
  if (frameIndex < 0) return;

  const frame = analysisData[frameIndex];
  const phase = classifyMovementPhase(frame.time);

  // Trayectoria acumulada hasta el instante actual.
  const trajectory = analysisData.slice(0, frameIndex + 1);

  drawFrame(frame, {
    phase,
    trajectory
  });
}

function findClosestFrameIndex(time) {
  if (!analysisData.length) return -1;

  let low = 0;
  let high = analysisData.length - 1;

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const midTime = analysisData[mid].time;

    if (midTime < time) {
      low = mid + 1;
    } else if (midTime > time) {
      high = mid - 1;
    } else {
      return mid;
    }
  }

  if (low >= analysisData.length) {
    return analysisData.length - 1;
  }

  if (high < 0) {
    return 0;
  }

  return Math.abs(analysisData[low].time - time) <
    Math.abs(analysisData[high].time - time)
    ? low
    : high;
}

function classifyMovementPhase(time) {
  if (!detectedMovement) {
    return "Sin clasificar";
  }

  const startTime = detectedMovement.start.time;
  const maxTime = detectedMovement.end.time;
  const returnTime = detectedMovement.returnPoint?.time ?? null;

  // Pequeña tolerancia alrededor de la máxima extensión.
  const maxTolerance = 0.05;

  if (time < startTime) {
    return "Guardia / preparación";
  }

  if (Math.abs(time - maxTime) <= maxTolerance) {
    return "Máxima extensión";
  }

  if (time >= startTime && time < maxTime - maxTolerance) {
    return "Extensión";
  }

  if (
    returnTime !== null &&
    time > maxTime + maxTolerance &&
    time < returnTime
  ) {
    return "Retorno a guardia";
  }

  if (returnTime !== null && time >= returnTime) {
    return "Guardia recuperada";
  }

  if (time > maxTime + maxTolerance) {
    return "Retorno / fase posterior";
  }

  return "Extensión";
}

// ----------------------------------------------------
// Reinicio
// ----------------------------------------------------
resetButton.addEventListener("click", resetApplication);

function resetApplication() {
  stopCamera();

  videoElement.pause();
  videoElement.removeAttribute("src");
  videoElement.load();
  videoElement.controls = true;

  if (currentVideoUrl) {
    URL.revokeObjectURL(currentVideoUrl);
    currentVideoUrl = null;
  }

  videoFile.value = "";
  fileInfo.innerHTML = `<span class="file-info__dot"></span><span>No hay video cargado.</span>`;
  videoPlaceholder.hidden = false;
  videoPlaceholder.style.display = "grid";

  clearCanvas();
  clearResults();
  analysisData = [];
  detectedMovement = null;
  lastRenderedPlaybackTime = -1;
  stopPlaybackOverlayLoop();
  overlayHud.hidden = true;

  updateAnalyzeButtonState();
}

function clearResults() {
  metricInitialAngle.textContent = "--°";
  metricMaxAngle.textContent = "--°";
  metricRange.textContent = "--°";
  metricDuration.textContent = "-- s";
  metricMaxAngularVelocity.textContent = "-- °/s";
  metricMeanJabVelocity.textContent = "-- °/s";
  metricReturnTime.textContent = "-- s";
  metricValidFrames.textContent = "--";

  interpretationText.textContent =
    "Realiza un análisis para obtener una descripción del movimiento.";

  liveTime.textContent = "0.00 s";
  liveAngle.textContent = "--°";
  liveDetectionStatus.textContent = "Sin datos";
  overlayHud.hidden = true;
  overlayPhase.textContent = "Sin datos";
  overlayAngle.textContent = "--°";
  overlayTime.textContent = "0.00 s";

  if (angleChart) {
    angleChart.destroy();
    angleChart = null;
  }

  setProgress(0);
}

// ----------------------------------------------------
// Utilidades
// ----------------------------------------------------
function seekVideo(time) {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error("No se pudo avanzar al cuadro solicitado."));
    };

    const cleanup = () => {
      videoElement.removeEventListener("seeked", onSeeked);
      videoElement.removeEventListener("error", onError);
    };

    videoElement.addEventListener("seeked", onSeeked, { once: true });
    videoElement.addEventListener("error", onError, { once: true });

    // Evitamos asignar exactamente el mismo tiempo cuando el navegador
    // ya se encuentra en ese punto.
    if (Math.abs(videoElement.currentTime - time) < 0.0001) {
      cleanup();
      resolve();
      return;
    }

    videoElement.currentTime = time;
  });
}

function nextAnimationFrame() {
  return new Promise((resolve) => requestAnimationFrame(resolve));
}

function setProgress(percent) {
  progressText.textContent = `${percent}%`;
  progressBar.style.width = `${percent}%`;
}

function formatBytes(bytes) {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const index = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / 1024 ** index;

  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

// Inicialización
initializeMediaPipe();
