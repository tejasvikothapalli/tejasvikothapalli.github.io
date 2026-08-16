(() => {
  "use strict";

  const grid = document.querySelector("#scene-grid");
  const sceneCount = document.querySelector("#scene-count");
  const viewer = document.querySelector("#viewer");
  const viewerTitle = document.querySelector("#viewer-title");
  const loadStatus = document.querySelector("#load-status");
  const dateLabel = document.querySelector("#date-label");
  const trialLabel = document.querySelector("#trial-label");
  const sessionCells = document.querySelector("#session-cells");
  const sceneData = document.querySelector("#scene-data");
  const panelGrid = document.querySelector(".panel-grid");
  const densityPanel = document.querySelector("#density-panel");
  const densityToggle = document.querySelector("#density-toggle");
  const timeline = document.querySelector("#timeline");
  const progressFixation = document.querySelector("#progress-fixation");
  const progressTime = document.querySelector("#progress-time");
  const play = document.querySelector("#play");
  const speed = document.querySelector("#speed");
  const patchToggle = document.querySelector("#patch-toggle");
  const patchDrawer = document.querySelector("#patch-drawer");
  const patchFixation = document.querySelector("#patch-fixation");
  const rasterCells = document.querySelector("#raster-cells");
  const rasterDuration = document.querySelector("#raster-duration");
  const replayVideo = document.querySelector("#replay-video");
  const sceneMagnifier = document.querySelector("#scene-magnifier");
  const sceneMagnifierCanvas = document.querySelector("#scene-magnifier-canvas");

  const canvases = {
    truth: document.querySelector("#truth-canvas"),
    density: document.querySelector("#density-canvas"),
    evidence: document.querySelector("#evidence-canvas"),
    posterior: document.querySelector("#posterior-canvas"),
    raster: document.querySelector("#raster-canvas"),
    groundTruthPatch: document.querySelector("#ground-truth-patch-canvas"),
    patch: document.querySelector("#patch-canvas"),
  };

  const state = {
    manifest: null,
    scene: null,
    images: null,
    assetPaths: null,
    patchPromise: null,
    replayAbort: null,
    replayObjectUrl: null,
    videoReady: false,
    videoSeeking: false,
    videoFrameHandle: 0,
    playTimer: 0,
    playGeneration: 0,
    pendingSeekCount: null,
    count: 0,
    speed: 1,
    playing: false,
    frameHandle: 0,
    lastTime: 0,
    fractionalCount: 0,
    loadToken: 0,
    arrowTimer: 0,
    arrowDirection: 0,
    arrowStartedAt: 0,
  };

  speed.value = String(state.speed);

  const colors = {
    outside: "#090e16",
    hull: "#f08a24",
    gaze: "#22d3ee",
    trail: "rgba(59, 130, 246, 0.72)",
    patch: "#facc15",
  };

  const preferredSceneOrder = [
    "cornellornithography",
    "hawaii-trees",
    "mochacat0",
    "ucsd-mcgill",
    "waterfall",
    "beachwave",
    "mossriver",
    "hawaii-mountain",
    "creek-bridge",
    "summer-backyard",
    "hawaii-beach",
    "sd-orangatang",
    "hawaii-ocean",
    "mochacat1",
    "brighttrees",
    "fall-backyard",
    "fall-bright-backyard",
    "forrestriver",
    "lakeontario-rocks1",
    "late-fall-backyard",
    "rochester-meliora1",
    "rochester-meliora2",
    "colony-pj",
    "colony-poppy",
    "colony-rose",
    "colony-amy",
    "colony-bonnie",
  ];

  function pathDirectory(path) {
    return path.slice(0, path.lastIndexOf("/") + 1);
  }

  function loadImage(path) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Could not load ${path}`));
      image.src = path;
    });
  }

  function imagePaths(scene, dataPath) {
    const base = pathDirectory(dataPath);
    return Object.fromEntries(
      Object.entries(scene.assets).map(([name, path]) => [name, `${base}${path}`]),
    );
  }

  function setBusy(isBusy, message = "Loading scene data…") {
    viewer.setAttribute("aria-busy", String(isBusy));
    loadStatus.textContent = message;
  }

  function setPlaying(value) {
    state.playing = value;
    play.setAttribute("aria-pressed", String(value));
    play.textContent = value ? "Pause" : "Play";
    if (!value) replayVideo.pause();
    if (!value) state.playGeneration += 1;
    if (!value && state.playTimer) {
      window.clearTimeout(state.playTimer);
      state.playTimer = 0;
    }
    if (!value && state.frameHandle) {
      cancelAnimationFrame(state.frameHandle);
      state.frameHandle = 0;
    }
    if (!value && state.videoFrameHandle && replayVideo.cancelVideoFrameCallback) {
      replayVideo.cancelVideoFrameCallback(state.videoFrameHandle);
      state.videoFrameHandle = 0;
    }
  }

  function roundedPoint(values, index) {
    return [values[index * 2] / 10, values[index * 2 + 1] / 10];
  }

  function patchBox(values, index) {
    const start = index * 4;
    return [
      values[start] / 10,
      values[start + 1] / 10,
      values[start + 2] / 10,
      values[start + 3] / 10,
    ];
  }

  function bestPatchAtPoint(x, y) {
    const scene = state.scene;
    if (!scene) return -1;
    const errors = scene.patchSelection?.error;
    const maximumSide =
      scene.patchSelection?.maximumSelectableSidePixels ?? Number.POSITIVE_INFINITY;
    let bestCovering = -1;
    let bestCoveringError = Number.POSITIVE_INFINITY;
    let bestCoveringDistance = Number.POSITIVE_INFINITY;
    let nearest = -1;
    let nearestDistance = Number.POSITIVE_INFINITY;
    let nearestError = Number.POSITIVE_INFINITY;

    for (let index = 0; index < scene.total; index += 1) {
      if (scene.retained && !scene.retained[index]) continue;
      const start = index * 4;
      const x0 = scene.patchBox[start] / 10;
      const y0 = scene.patchBox[start + 1] / 10;
      const x1 = scene.patchBox[start + 2] / 10;
      const y1 = scene.patchBox[start + 3] / 10;
      if (Math.max(x1 - x0, y1 - y0) > maximumSide + 0.05) continue;
      const dx = (x0 + x1) / 2 - x;
      const dy = (y0 + y1) / 2 - y;
      const distance = dx * dx + dy * dy;
      const error = errors?.[index] ?? Number.POSITIVE_INFINITY;

      if (
        nearest < 0 ||
        distance < nearestDistance ||
        (distance === nearestDistance && error < nearestError)
      ) {
        nearest = index;
        nearestDistance = distance;
        nearestError = error;
      }

      const coversPoint = x >= x0 && x <= x1 && y >= y0 && y <= y1;
      if (
        coversPoint &&
        (bestCovering < 0 ||
          error < bestCoveringError ||
          (error === bestCoveringError && distance < bestCoveringDistance))
      ) {
        bestCovering = index;
        bestCoveringError = error;
        bestCoveringDistance = distance;
      }
    }

    return bestCovering >= 0 ? bestCovering : nearest;
  }

  function hideSceneMagnifier() {
    sceneMagnifier.hidden = true;
  }

  function updateSceneMagnifier(event) {
    if (
      event.pointerType === "touch" ||
      !state.scene ||
      !state.images?.original ||
      viewer.getAttribute("aria-busy") === "true"
    ) {
      hideSceneMagnifier();
      return;
    }

    const canvas = canvases.truth;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    const canvasX = ((event.clientX - bounds.left) / bounds.width) * canvas.width;
    const canvasY = ((event.clientY - bounds.top) / bounds.height) * canvas.height;
    const image = state.images.original;
    const sourceScaleX = image.naturalWidth / canvas.width;
    const sourceScaleY = image.naturalHeight / canvas.height;
    const patchSide = state.scene.patchSelection?.typicalSidePixels ?? 21;
    const sourceWidth = patchSide * sourceScaleX;
    const sourceHeight = patchSide * sourceScaleY;
    const sourceLeft = canvasX * sourceScaleX - sourceWidth / 2;
    const sourceTop = canvasY * sourceScaleY - sourceHeight / 2;
    const clippedLeft = Math.max(0, sourceLeft);
    const clippedTop = Math.max(0, sourceTop);
    const clippedRight = Math.min(image.naturalWidth, sourceLeft + sourceWidth);
    const clippedBottom = Math.min(image.naturalHeight, sourceTop + sourceHeight);
    const context = clearCanvas(sceneMagnifierCanvas);
    context.imageSmoothingEnabled = false;
    if (clippedRight > clippedLeft && clippedBottom > clippedTop) {
      const destinationX =
        ((clippedLeft - sourceLeft) / sourceWidth) * sceneMagnifierCanvas.width;
      const destinationY =
        ((clippedTop - sourceTop) / sourceHeight) * sceneMagnifierCanvas.height;
      const destinationWidth =
        ((clippedRight - clippedLeft) / sourceWidth) * sceneMagnifierCanvas.width;
      const destinationHeight =
        ((clippedBottom - clippedTop) / sourceHeight) * sceneMagnifierCanvas.height;
      context.drawImage(
        image,
        clippedLeft,
        clippedTop,
        clippedRight - clippedLeft,
        clippedBottom - clippedTop,
        destinationX,
        destinationY,
        destinationWidth,
        destinationHeight,
      );
    }

    sceneMagnifier.hidden = false;
    const stage = canvas.parentElement;
    const stageBounds = stage.getBoundingClientRect();
    const cursorX = event.clientX - stageBounds.left;
    const cursorY = event.clientY - stageBounds.top;
    const gap = 16;
    const lensWidth = sceneMagnifier.offsetWidth;
    const lensHeight = sceneMagnifier.offsetHeight;
    let left = cursorX + gap;
    let top = cursorY + gap;
    if (left + lensWidth > stageBounds.width - 4) left = cursorX - gap - lensWidth;
    if (top + lensHeight > stageBounds.height - 4) top = cursorY - gap - lensHeight;
    sceneMagnifier.style.left = `${Math.max(4, Math.min(left, stageBounds.width - lensWidth - 4))}px`;
    sceneMagnifier.style.top = `${Math.max(4, Math.min(top, stageBounds.height - lensHeight - 4))}px`;
  }

  function clearCanvas(canvas, fill = colors.outside) {
    const context = canvas.getContext("2d");
    context.save();
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = fill;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.restore();
    return context;
  }

  function drawHull(context, hull) {
    if (!hull || hull.length < 4) return;
    context.save();
    context.beginPath();
    context.moveTo(hull[0] / 10, hull[1] / 10);
    for (let index = 2; index < hull.length; index += 2) {
      context.lineTo(hull[index] / 10, hull[index + 1] / 10);
    }
    context.closePath();
    context.strokeStyle = colors.hull;
    context.lineWidth = 4;
    context.lineJoin = "round";
    context.stroke();
    context.restore();
  }

  function drawGaze(context, x, y, radius = 9) {
    context.save();
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fillStyle = colors.gaze;
    context.fill();
    context.strokeStyle = "rgba(9, 14, 22, 0.85)";
    context.lineWidth = 3;
    context.stroke();
    context.restore();
  }

  function drawPatchWindow(context, current) {
    const [x0, y0, x1, y1] = patchBox(state.scene.patchBox, current);
    context.save();
    context.strokeStyle = colors.patch;
    context.lineWidth = 4;
    context.strokeRect(x0, y0, x1 - x0, y1 - y0);
    context.restore();
  }

  function drawTruth(current) {
    const scene = state.scene;
    const context = clearCanvas(canvases.truth);
    context.drawImage(state.images.original, 0, 0, canvases.truth.width, canvases.truth.height);
    drawHull(context, scene.hull);
    if (current < 0) return;

    const start = scene.trailStart[current];
    if (current > start) {
      context.save();
      context.beginPath();
      const first = roundedPoint(scene.gaze, start);
      context.moveTo(first[0], first[1]);
      for (let index = start + 1; index <= current; index += 1) {
        const point = roundedPoint(scene.gaze, index);
        context.lineTo(point[0], point[1]);
      }
      context.strokeStyle = colors.trail;
      context.lineWidth = 4;
      context.lineCap = "round";
      context.lineJoin = "round";
      context.stroke();
      context.restore();
    }

    const [x, y] = roundedPoint(scene.gaze, current);
    drawPatchWindow(context, current);
    drawGaze(context, x, y);
  }

  function frameIndexForCount(count) {
    const counts = state.scene.frameCounts;
    let low = 0;
    let high = counts.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (counts[middle] <= count) low = middle;
      else high = middle - 1;
    }
    return low;
  }

  function drawSprite(canvas, image, frameIndex) {
    const scene = state.scene;
    const sourceX = (frameIndex % scene.spriteColumns) * scene.frameWidth;
    const sourceY = Math.floor(frameIndex / scene.spriteColumns) * scene.frameHeight;
    const context = clearCanvas(canvas);
    context.drawImage(
      image,
      sourceX,
      sourceY,
      scene.frameWidth,
      scene.frameHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    return context;
  }

  function drawReplaySlice(canvas, column) {
    const context = clearCanvas(canvas);
    context.drawImage(
      replayVideo,
      column * state.scene.frameWidth,
      0,
      state.scene.frameWidth,
      state.scene.frameHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );
    return context;
  }

  function drawRaster(current) {
    const canvas = canvases.raster;
    const context = clearCanvas(canvas, "#f8fafc");
    if (current < 0) {
      rasterCells.textContent = "— cells";
      rasterDuration.textContent = "—";
      return;
    }
    if (!state.images?.trialRasters || !state.scene.rasterTrials) {
      rasterCells.textContent = "— cells";
      rasterDuration.textContent = "—";
      return;
    }

    const trialIndex = state.scene.rasterTrial[current];
    const trial = state.scene.rasterTrials[trialIndex];
    const sourceX =
      (trialIndex % state.scene.trialRasterColumns) * state.scene.trialRasterWidth;
    const sourceY =
      Math.floor(trialIndex / state.scene.trialRasterColumns) * state.scene.trialRasterHeight;
    context.imageSmoothingEnabled = false;
    context.drawImage(
      state.images.trialRasters,
      sourceX,
      sourceY,
      state.scene.trialRasterWidth,
      state.scene.trialRasterHeight,
      0,
      0,
      canvas.width,
      canvas.height,
    );

    const windowStart = state.scene.rasterWindow[current * 2];
    const windowStop = state.scene.rasterWindow[current * 2 + 1];
    const x0 = (windowStart / trial.bins) * canvas.width;
    const x1 = (windowStop / trial.bins) * canvas.width;
    context.fillStyle = "rgba(37, 99, 235, 0.14)";
    context.fillRect(x0, 0, Math.max(2, x1 - x0), canvas.height);
    context.strokeStyle = "#2563eb";
    context.lineWidth = 3;
    context.strokeRect(x0, 1.5, Math.max(2, x1 - x0), canvas.height - 3);

    const seconds = trial.bins / 120;
    rasterCells.textContent = `${trial.cells.toLocaleString()} cells`;
    rasterDuration.textContent = `${seconds.toFixed(1)} s`;
  }

  function formatViewingTime(seconds) {
    const wholeSeconds = Math.max(0, Math.floor(seconds));
    const minutes = Math.floor(wholeSeconds / 60);
    const remainder = String(wholeSeconds % 60).padStart(2, "0");
    return `${minutes}:${remainder}`;
  }

  function prepareViewingTimeline(scene) {
    const totalBins = scene.rasterTrials.reduce((sum, trial) => sum + trial.bins, 0);
    const secondsPerBin = scene.recordingSeconds / totalBins;
    let elapsedBins = 0;
    scene.viewingTrialStarts = scene.rasterTrials.map((trial) => {
      const start = elapsedBins * secondsPerBin;
      elapsedBins += trial.bins;
      return start;
    });
    scene.viewingSecondsPerBin = secondsPerBin;
  }

  function viewingSecondsAtCount(count) {
    if (count <= 0) return 0;
    if (count >= state.scene.total) return state.scene.recordingSeconds;
    const fixationIndex = count - 1;
    const trialIndex = state.scene.rasterTrial[fixationIndex];
    const withinTrialBins = state.scene.rasterWindow[fixationIndex * 2 + 1];
    return (
      state.scene.viewingTrialStarts[trialIndex] +
      withinTrialBins * state.scene.viewingSecondsPerBin
    );
  }

  function drawPatch(current) {
    drawRaster(current);
    const truthCanvas = canvases.groundTruthPatch;
    const truthContext = clearCanvas(truthCanvas, "#808080");
    const decodedCanvas = canvases.patch;
    const decodedContext = clearCanvas(decodedCanvas, "#808080");
    truthContext.imageSmoothingEnabled = false;
    decodedContext.imageSmoothingEnabled = false;
    if (current < 0) {
      patchFixation.textContent = "Choose a fixation";
      return;
    }

    const size = state.scene.patchSize;
    const columns = state.scene.patchSpriteColumns;
    const sourceX = (current % columns) * size;
    const sourceY = Math.floor(current / columns) * size;
    if (state.images.truthPatches) {
      truthContext.drawImage(
        state.images.truthPatches,
        sourceX,
        sourceY,
        size,
        size,
        0,
        0,
        truthCanvas.width,
        truthCanvas.height,
      );
    } else {
      const [x0, y0, x1, y1] = patchBox(state.scene.patchBox, current);
      const scaleX = state.images.original.naturalWidth / canvases.truth.width;
      const scaleY = state.images.original.naturalHeight / canvases.truth.height;
      truthContext.drawImage(
        state.images.original,
        x0 * scaleX,
        y0 * scaleY,
        (x1 - x0) * scaleX,
        (y1 - y0) * scaleY,
        0,
        0,
        truthCanvas.width,
        truthCanvas.height,
      );
    }

    if (!state.images?.patches) {
      patchFixation.textContent = "Loading patches…";
      return;
    }
    decodedContext.drawImage(
      state.images.patches,
      sourceX,
      sourceY,
      size,
      size,
      0,
      0,
      decodedCanvas.width,
      decodedCanvas.height,
    );
    patchFixation.textContent = `Fixation ID ${state.scene.fixation[current].toLocaleString()}`;
  }

  function ensurePatchImage() {
    if (!state.images || !state.assetPaths) return Promise.resolve();
    const names = ["patches"];
    if (state.assetPaths.truthPatches) names.push("truthPatches");
    if (state.assetPaths.trialRasters) names.push("trialRasters");
    if (names.every((name) => state.images[name])) {
      drawPatch(state.count - 1);
      return Promise.resolve();
    }
    if (state.patchPromise) return state.patchPromise;
    const token = state.loadToken;
    patchFixation.textContent = "Loading patch…";
    state.patchPromise = Promise.all(names.map((name) => loadImage(state.assetPaths[name])))
      .then((images) => {
        if (token !== state.loadToken || !state.images) return;
        names.forEach((name, index) => {
          state.images[name] = images[index];
        });
        drawPatch(state.count - 1);
      })
      .catch((error) => {
        console.error(error);
        if (token === state.loadToken) patchFixation.textContent = "Patch unavailable";
      })
      .finally(() => {
        if (token === state.loadToken) state.patchPromise = null;
      });
    return state.patchPromise;
  }

  function setPatchDrawerVisible(show, { scroll = false } = {}) {
    patchDrawer.hidden = !show;
    patchToggle.setAttribute("aria-pressed", String(show));
    patchToggle.textContent = show ? "Hide patch decoder" : "Show patch decoder";
    if (!show) return;
    drawPatch(state.count - 1);
    ensurePatchImage();
    if (scroll) {
      requestAnimationFrame(() => {
        patchDrawer.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  }

  function paint() {
    if (!state.scene || !state.images) return;
    const current = state.count - 1;
    drawTruth(current);
    let densityContext;
    let evidenceContext;
    if (state.videoReady && !state.videoSeeking && replayVideo.readyState >= 2) {
      if (!densityPanel.hidden) densityContext = drawReplaySlice(canvases.density, 0);
      evidenceContext = drawReplaySlice(canvases.evidence, 1);
      drawReplaySlice(canvases.posterior, 2);
    } else {
      const frameIndex = frameIndexForCount(state.count);
      if (!densityPanel.hidden) {
        densityContext = drawSprite(canvases.density, state.images.density, frameIndex);
      }
      evidenceContext = drawSprite(canvases.evidence, state.images.evidence, frameIndex);
      drawSprite(canvases.posterior, state.images.posterior, frameIndex);
    }

    if (current >= 0) {
      const [x, y] = roundedPoint(state.scene.gaze, current);
      if (densityContext) {
        drawHull(densityContext, state.scene.hull);
        drawGaze(densityContext, x, y);
      }
      drawPatchWindow(evidenceContext, current);
      const sessionIndex = state.scene.session[current];
      dateLabel.textContent = state.scene.dates[sessionIndex];
      const presentation = state.scene.rasterTrial[current] + 1;
      trialLabel.textContent = `Presentation ${presentation.toLocaleString()}`;
      sessionCells.textContent = `${state.scene.sessionCells[sessionIndex].toLocaleString()} cells`;
    } else {
      dateLabel.textContent = "—";
      trialLabel.textContent = "Presentation —";
      sessionCells.textContent = "— cells";
    }

    if (!patchDrawer.hidden) drawPatch(current);
    timeline.value = String(state.count);
    progressFixation.textContent = `${state.count.toLocaleString()} / ${state.scene.total.toLocaleString()}`;
    progressTime.textContent = `${formatViewingTime(viewingSecondsAtCount(state.count))} / ${formatViewingTime(state.scene.recordingSeconds)}`;
  }

  function setCount(value) {
    if (!state.scene) return;
    const next = Math.max(0, Math.min(state.scene.total, Math.round(Number(value))));
    state.count = next;
    state.fractionalCount = next;
    let seeked = Promise.resolve();
    if (state.videoReady) {
      state.pendingSeekCount = next;
      const target = next / state.scene.replayFps + 0.0001;
      if (Math.abs(replayVideo.currentTime - target) < 0.0005) {
        state.videoSeeking = false;
        state.pendingSeekCount = null;
      } else {
        state.videoSeeking = true;
        seeked = waitForVideo("seeked").catch(() => undefined);
        replayVideo.currentTime = target;
      }
    }
    // Keep the last complete fixation visible while the video seeks. Painting
    // here would briefly replace the exact replay frame with the coarse
    // seek-preview sprite, which looks like a flash when stepping with arrows
    // (and can also flash during playback). The global `seeked` handler paints
    // the requested fixation atomically once every replay-backed panel is ready.
    if (!state.videoReady || !state.videoSeeking) paint();
    return seeked;
  }

  function scheduleVideoFrame() {
    if (!state.playing || !state.videoReady || !replayVideo.requestVideoFrameCallback) return;
    state.videoFrameHandle = replayVideo.requestVideoFrameCallback((_now, metadata) => {
      state.videoFrameHandle = 0;
      if (!state.playing || !state.scene) return;
      const next = Math.max(
        0,
        Math.min(state.scene.total, Math.round(metadata.mediaTime * state.scene.replayFps)),
      );
      state.count = next;
      state.fractionalCount = next;
      state.videoSeeking = false;
      paint();
      if (next >= state.scene.total) setPlaying(false);
      else scheduleVideoFrame();
    });
  }

  function tick(time) {
    if (!state.playing || !state.scene) return;
    if (!state.lastTime) state.lastTime = time;
    const elapsed = Math.min(100, time - state.lastTime);
    state.lastTime = time;
    state.fractionalCount += (elapsed / 1000) * 32 * state.speed;
    state.count = Math.min(state.scene.total, Math.floor(state.fractionalCount));
    paint();
    if (state.count >= state.scene.total) {
      setPlaying(false);
      return;
    }
    state.frameHandle = requestAnimationFrame(tick);
  }

  async function startPlayback() {
    if (!state.scene) return;
    if (state.videoReady) {
      if (state.count >= state.scene.total) await setCount(0);
      const generation = ++state.playGeneration;
      setPlaying(true);

      const advance = async () => {
        if (!state.playing || generation !== state.playGeneration || !state.scene) return;
        if (state.count >= state.scene.total) {
          setPlaying(false);
          return;
        }
        const started = performance.now();
        await setCount(state.count + 1);
        if (!state.playing || generation !== state.playGeneration || !state.scene) return;
        const interval = 1000 / (state.scene.replayFps * state.speed);
        const minimumDisplay = state.speed <= 1 ? 18 : 4;
        const delay = Math.max(minimumDisplay, interval - (performance.now() - started));
        state.playTimer = window.setTimeout(advance, delay);
      };

      state.playTimer = window.setTimeout(advance, 0);
      return;
    }
    if (state.count >= state.scene.total) setCount(0);
    state.lastTime = 0;
    state.fractionalCount = state.count;
    setPlaying(true);
    state.frameHandle = requestAnimationFrame(tick);
  }

  function waitForVideo(eventName) {
    return new Promise((resolve, reject) => {
      const finished = () => {
        cleanup();
        resolve();
      };
      const failed = () => {
        cleanup();
        reject(new Error("Could not load the fixation replay"));
      };
      const cleanup = () => {
        replayVideo.removeEventListener(eventName, finished);
        replayVideo.removeEventListener("error", failed);
      };
      replayVideo.addEventListener(eventName, finished, { once: true });
      replayVideo.addEventListener("error", failed, { once: true });
    });
  }

  async function loadReplay(path, count, token) {
    state.videoReady = false;
    state.videoSeeking = true;
    const abort = new AbortController();
    state.replayAbort = abort;
    const response = await fetch(path, { signal: abort.signal });
    if (!response.ok) throw new Error(`Fixation replay returned ${response.status}`);
    const blob = await response.blob();
    if (token !== state.loadToken) return;
    state.replayAbort = null;
    state.replayObjectUrl = URL.createObjectURL(blob);
    replayVideo.src = state.replayObjectUrl;
    replayVideo.load();
    await waitForVideo("loadeddata");
    if (token !== state.loadToken) return;
    state.videoReady = true;
    replayVideo.playbackRate = state.speed;
    state.pendingSeekCount = count;
    const seeked = waitForVideo("seeked");
    replayVideo.currentTime = count / state.scene.replayFps + 0.0001;
    await seeked;
    if (token !== state.loadToken) return;
    state.videoSeeking = false;
  }

  function releaseReplay() {
    if (state.replayAbort) state.replayAbort.abort();
    state.replayAbort = null;
    state.videoReady = false;
    state.videoSeeking = false;
    replayVideo.pause();
    replayVideo.removeAttribute("src");
    replayVideo.load();
    if (state.replayObjectUrl) URL.revokeObjectURL(state.replayObjectUrl);
    state.replayObjectUrl = null;
  }

  function selectCard(slug) {
    grid.querySelectorAll(".scene-card").forEach((card) => {
      const selected = card.dataset.slug === slug;
      card.classList.toggle("is-selected", selected);
      card.setAttribute("aria-selected", String(selected));
    });
  }

  async function selectScene(record, { focusViewer = false } = {}) {
    const token = ++state.loadToken;
    setPlaying(false);
    hideSceneMagnifier();
    releaseReplay();
    setBusy(true);
    selectCard(record.slug);
    viewerTitle.textContent = record.title;
    try {
      const response = await fetch(`./data/${record.data}`);
      if (!response.ok) throw new Error(`Scene metadata returned ${response.status}`);
      const scene = await response.json();
      const paths = imagePaths(scene, `./data/${record.data}`);
      const names = ["original", "density", "evidence", "posterior"];
      const loaded = await Promise.all(names.map((name) => loadImage(paths[name])));
      if (token !== state.loadToken) return;
      state.scene = scene;
      prepareViewingTimeline(scene);
      state.images = Object.fromEntries(names.map((name, index) => [name, loaded[index]]));
      state.assetPaths = paths;
      state.patchPromise = null;
      const minutes = scene.recordingSeconds / 60;
      sceneData.textContent = `${scene.dates.length.toLocaleString()} sessions · ${minutes.toFixed(1)} min free viewing · ${scene.totalCells.toLocaleString()} cells · ${scene.total.toLocaleString()} fixations`;
      timeline.max = String(scene.total);
      state.count = scene.total;
      state.fractionalCount = scene.total;
      viewerTitle.textContent = record.title;
      paint();
      if (paths.replay) await loadReplay(paths.replay, scene.total, token);
      if (token !== state.loadToken) return;
      setBusy(false);
      paint();
      if (!patchDrawer.hidden) ensurePatchImage();
      if (focusViewer) viewer.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
      console.error(error);
      if (token !== state.loadToken) return;
      setBusy(true, "This scene could not be loaded.");
    }
  }

  function buildSceneGrid(manifest) {
    const fragment = document.createDocumentFragment();
    const rank = new Map(preferredSceneOrder.map((slug, index) => [slug, index]));
    const records = manifest.scenes
      .filter((record) => !record.slug.startsWith("colony-"))
      .sort((a, b) => (rank.get(a.slug) ?? 999) - (rank.get(b.slug) ?? 999));
    records.forEach((record) => {
      const button = document.createElement("button");
      button.className = "scene-card";
      button.type = "button";
      button.role = "option";
      button.dataset.slug = record.slug;
      button.setAttribute("aria-selected", "false");
      button.setAttribute("aria-label", `${record.title}: original and decoded`);

      const image = document.createElement("img");
      image.src = `./data/${record.thumb}`;
      image.alt = "";
      image.width = 322;
      image.height = 90;
      image.loading = "lazy";
      image.decoding = "async";

      const label = document.createElement("span");
      label.textContent = record.title;
      button.append(image, label);
      button.addEventListener("click", () => selectScene(record, { focusViewer: true }));
      fragment.append(button);
    });
    grid.replaceChildren(fragment);
    sceneCount.textContent = `${records.length} scenes · original | decoded`;
  }

  function stopArrowHold() {
    if (state.arrowTimer) window.clearTimeout(state.arrowTimer);
    state.arrowTimer = 0;
    state.arrowDirection = 0;
  }

  function stepFixation(direction, amount = 1) {
    if (!state.scene || viewer.getAttribute("aria-busy") === "true") return;
    setPlaying(false);
    setCount(state.count + direction * amount);
  }

  function startArrowHold(direction) {
    if (state.arrowDirection === direction) return;
    stopArrowHold();
    state.arrowDirection = direction;
    state.arrowStartedAt = performance.now();
    stepFixation(direction);

    const repeat = () => {
      if (state.arrowDirection !== direction) return;
      const elapsed = performance.now() - state.arrowStartedAt;
      const amount = elapsed > 2800 ? 16 : elapsed > 1800 ? 8 : elapsed > 1050 ? 4 : elapsed > 600 ? 2 : 1;
      stepFixation(direction, amount);
      state.arrowTimer = window.setTimeout(repeat, elapsed > 1800 ? 45 : 70);
    };
    state.arrowTimer = window.setTimeout(repeat, 300);
  }

  play.addEventListener("click", () => {
    if (state.playing) setPlaying(false);
    else startPlayback();
  });

  timeline.addEventListener("input", () => {
    setPlaying(false);
    setCount(timeline.value);
  });

  speed.addEventListener("change", () => {
    state.speed = Number(speed.value);
    replayVideo.playbackRate = state.speed;
  });

  canvases.truth.addEventListener("pointermove", updateSceneMagnifier);
  canvases.truth.addEventListener("pointerleave", hideSceneMagnifier);

  canvases.truth.addEventListener("click", async (event) => {
    if (!state.scene || viewer.getAttribute("aria-busy") === "true") return;
    const selectedScene = state.scene;
    const bounds = canvases.truth.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * canvases.truth.width;
    const y = ((event.clientY - bounds.top) / bounds.height) * canvases.truth.height;
    const fixation = bestPatchAtPoint(x, y);
    if (fixation < 0) return;

    setPlaying(false);
    const seeked = setCount(fixation + 1);
    setPatchDrawerVisible(true, { scroll: true });
    await Promise.all([seeked, ensurePatchImage()]);
    if (state.scene === selectedScene && state.count === fixation + 1) drawPatch(fixation);
  });

  replayVideo.addEventListener("seeked", () => {
    if (!state.videoReady || !state.scene) return;
    const next = state.pendingSeekCount ?? Math.round(replayVideo.currentTime * state.scene.replayFps);
    state.pendingSeekCount = null;
    state.count = Math.max(0, Math.min(state.scene.total, next));
    state.fractionalCount = state.count;
    state.videoSeeking = false;
    paint();
  });

  replayVideo.addEventListener("timeupdate", () => {
    if (!state.playing || !state.videoReady || replayVideo.requestVideoFrameCallback) return;
    state.count = Math.max(
      0,
      Math.min(state.scene.total, Math.round(replayVideo.currentTime * state.scene.replayFps)),
    );
    state.fractionalCount = state.count;
    paint();
  });

  replayVideo.addEventListener("ended", () => {
    if (!state.scene) return;
    state.count = state.scene.total;
    state.fractionalCount = state.count;
    paint();
    setPlaying(false);
  });

  patchToggle.addEventListener("click", () => {
    setPatchDrawerVisible(patchDrawer.hidden, { scroll: true });
  });

  densityToggle.addEventListener("click", () => {
    const show = densityPanel.hidden;
    densityPanel.hidden = !show;
    panelGrid.classList.toggle("density-visible", show);
    densityToggle.setAttribute("aria-pressed", String(show));
    densityToggle.textContent = show ? "Hide fixation density" : "Show fixation density";
    if (show) paint();
  });

  document.addEventListener("keydown", (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.target instanceof Element && event.target.closest("select, option")) return;
    event.preventDefault();
    if (!event.repeat) startArrowHold(event.key === "ArrowRight" ? 1 : -1);
  });

  document.addEventListener("keyup", (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    stopArrowHold();
  });

  window.addEventListener("blur", stopArrowHold);
  window.addEventListener("pagehide", () => {
    stopArrowHold();
    releaseReplay();
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) setPlaying(false);
  });

  fetch("./data/manifest.json")
    .then((response) => {
      if (!response.ok) throw new Error(`Manifest returned ${response.status}`);
      return response.json();
    })
    .then((manifest) => {
      state.manifest = manifest;
      buildSceneGrid(manifest);
      const initial =
        manifest.scenes.find((scene) => scene.slug === "cornellornithography") ||
        manifest.scenes[0];
      return selectScene(initial);
    })
    .catch((error) => {
      console.error(error);
      sceneCount.textContent = "Scenes unavailable";
      setBusy(true, "Interactive data is not available yet.");
    });
})();
