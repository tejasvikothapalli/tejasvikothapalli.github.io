(() => {
  "use strict";

  const grid = document.querySelector("#scene-grid");
  const animalGrid = document.querySelector("#animal-grid");
  const sceneCount = document.querySelector("#scene-count");
  const sceneToggle = document.querySelector("#scene-toggle");
  const viewer = document.querySelector("#viewer");
  const viewerTitle = document.querySelector("#viewer-title");
  const loadStatus = document.querySelector("#load-status");
  const loadProgress = document.querySelector("#load-progress");
  const loadProgressBar = document.querySelector("#load-progress-bar");
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
  const evidencePanel = document.querySelector("#evidence-panel");
  const posteriorPanel = document.querySelector("#posterior-panel");
  const clickHint = document.querySelector("#click-hint");
  const stepNoun = document.querySelector("#step-noun");
  const progressNoun = document.querySelector("#progress-noun");
  const patchLegend = document.querySelector("#patch-legend");
  const fidelityLegendPosterior = document.querySelector("#fidelity-legend-posterior");
  const restorationLegend = document.querySelector("#restoration-note").parentElement;
  const restorationTitle = restorationLegend.title;
  const play = document.querySelector("#play");
  const speed = document.querySelector("#speed");
  const patchToggle = document.querySelector("#patch-toggle");
  const patchDrawer = document.querySelector("#patch-drawer");
  const patchFixation = document.querySelector("#patch-fixation");
  const decoderOutput = document.querySelector("#decoder-output");
  const decoderBox = document.querySelector(".network-box");
  const rasterAxisStart = document.querySelector("#raster-axis-start");
  const rasterAxisLabel = document.querySelector("#raster-axis-label");
  const rasterCells = document.querySelector("#raster-cells");
  const rasterDuration = document.querySelector("#raster-duration");
  const replayVideo = document.querySelector("#replay-video");
  const sceneMagnifier = document.querySelector("#scene-magnifier");
  const sceneMagnifierCanvas = document.querySelector("#scene-magnifier-canvas");
  const fidelityToggle = document.querySelector("#fidelity-toggle");
  const fidelityPanel = document.querySelector("#fidelity-panel");
  const fidelityMetric = document.querySelector("#fidelity-metric");
  const fidelityPending = document.querySelector("#fidelity-pending");
  const patchPending = document.querySelector("#patch-pending");
  const replayPending = document.querySelector("#replay-pending");
  const langevinToggle = document.querySelector("#langevin-toggle");
  const langevinPanel = document.querySelector("#langevin-panel");
  const langevinReadout = document.querySelector("#langevin-readout");
  const langevinRun = document.querySelector("#langevin-run");
  const langevinReset = document.querySelector("#langevin-reset");
  const langevinEta = document.querySelector("#langevin-eta");
  const langevinEtaValue = document.querySelector("#langevin-eta-value");
  const langevinTemperature = document.querySelector("#langevin-temperature");
  const langevinTemperatureValue = document.querySelector("#langevin-temperature-value");
  const langevinSnr = document.querySelector("#langevin-snr");
  const langevinSnrValue = document.querySelector("#langevin-snr-value");
  const langevinIterations = document.querySelector("#langevin-iterations");
  const langevinDeviation = document.querySelector("#langevin-deviation");
  const canvases = {
    truth: document.querySelector("#truth-canvas"),
    density: document.querySelector("#density-canvas"),
    evidence: document.querySelector("#evidence-canvas"),
    posterior: document.querySelector("#posterior-canvas"),
    transformer: document.querySelector("#transformer-canvas"),
    diffusion: document.querySelector("#diffusion-canvas"),
    raster: document.querySelector("#raster-canvas"),
    groundTruthPatch: document.querySelector("#ground-truth-patch-canvas"),
    patch: document.querySelector("#patch-canvas"),
    fidelity: document.querySelector("#fidelity-canvas"),
    langevin: document.querySelector("#langevin-canvas"),
  };

  // One animal per data root: data/<animal>/manifest.json + scenes.
  // The paper's initials (arXiv:2611.31989): marmosets A and L were recorded in
  // V1, macaques O and C in the LGN.
  const ANIMALS = [
    { id: "monkey-a", label: "Monkey A", kind: "Marmoset V1" },
    { id: "monkey-l", label: "Monkey L", kind: "Marmoset V1" },
    { id: "monkey-o", label: "Monkey O", kind: "Macaque LGN" },
    { id: "monkey-c", label: "Monkey C", kind: "Macaque LGN" },
    { id: "livingstone", label: "Livingstone data", kind: "Macaques V1 to IT" },
  ];
  const DATA_VERSION = "20261126-5";

  const state = {
    animal: ANIMALS[0].id,
    animalManifests: new Map(),
    manifest: null,
    scene: null,
    images: null,
    assetPaths: null,
    patchPromise: null,
    rfMeta: null,
    rfCounts: null,
    rfDecoder: null,
    rfChoice: null,
    rfHover: -1,
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
    fidelityMetric: "psnr",
    langevin: {
      worker: null,
      token: -1,
      mask: null,
      running: false,
      failed: false,
      lastSync: 0,
      canvas: null,
      source: null,
    },
  };

  speed.value = String(state.speed);
  fidelityMetric.value = state.fidelityMetric;
  langevinEtaValue.textContent = Number(langevinEta.value).toFixed(3);
  langevinTemperatureValue.textContent = Number(langevinTemperature.value).toFixed(2);
  langevinSnrValue.textContent = Number(langevinSnr.value).toFixed(1);
  updatePanelColumns();

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

  // Patch size and screen extent differ per animal and per decoder arm, so the
  // degree labels come from the scene metadata rather than the markup.
  // Every spatial panel draws in the 1280 x 720 display coordinates of the
  // scene, through the scene's view crop: the largest 4:3 rectangle inside the
  // display hull (scene.viewCrop), so the panels show large images rather than
  // hull shapes on a dark plate.
  const FULL_W = 1280;
  const FULL_H = 720;

  function viewCanvases() {
    return [
      canvases.truth,
      canvases.evidence,
      canvases.posterior,
      canvases.transformer,
      canvases.diffusion,
      canvases.density,
      canvases.langevin,
    ];
  }

  function applyView(scene) {
    const crop =
      Array.isArray(scene.viewCrop) && scene.viewCrop.length === 4
        ? scene.viewCrop.map(Number)
        : [0, 0, FULL_W, FULL_H];
    const [x0, y0, x1, y1] = crop;
    state.view = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    viewer.style.setProperty("--view-aspect", `${state.view.w} / ${state.view.h}`);
    // The fidelity plot shares the panels' shape; its layout space keeps a 1280 width.
    FIDELITY_VIEW.height = Math.round((FIDELITY_VIEW.width * state.view.h) / state.view.w);
    for (const canvas of viewCanvases()) {
      if (canvas.width !== state.view.w) canvas.width = state.view.w;
      if (canvas.height !== state.view.h) canvas.height = state.view.h;
      canvas.getContext("2d").setTransform(1, 0, 0, 1, -x0, -y0);
    }
    // The hull lies outside the crop, so its legend entries go.
    document.querySelectorAll(".legend-hull").forEach((node) => {
      node.parentElement.hidden = Boolean(scene.viewCrop);
    });
    const ppd = Number(scene.pixelsPerDegree);
    if (Number.isFinite(ppd) && ppd > 0) {
      const width = state.view.w / ppd;
      const height = state.view.h / ppd;
      const x = document.querySelector(".screen-degrees-x");
      const y = document.querySelector(".screen-degrees-y");
      if (x) x.textContent = `${width.toFixed(1)}°`;
      if (y) y.textContent = `${height.toFixed(1)}°`;
      document
        .querySelector("#screen-scale")
        ?.setAttribute("aria-label", `View ${width.toFixed(1)} by ${height.toFixed(1)} degrees`);
    }
  }

  // Map a pointer event on a view canvas to display coordinates.
  function viewPoint(canvas, event) {
    const bounds = canvas.getBoundingClientRect();
    const view = state.view ?? { x: 0, y: 0, w: FULL_W, h: FULL_H };
    return [
      view.x + ((event.clientX - bounds.left) / bounds.width) * view.w,
      view.y + ((event.clientY - bounds.top) / bounds.height) * view.h,
    ];
  }

  function applySceneGeometry(scene) {
    const patch = Number(scene.patchDegrees);
    if (Number.isFinite(patch)) {
      document.querySelectorAll(".patch-degrees").forEach((node) => {
        node.textContent = `${patch.toFixed(2)}°`;
      });
    }
    const degrees = scene.screenDegrees;
    if (Array.isArray(degrees) && degrees.length === 2) {
      const [width, height] = degrees.map(Number);
      const x = document.querySelector(".screen-degrees-x");
      const y = document.querySelector(".screen-degrees-y");
      if (x) x.textContent = `${width.toFixed(1)}°`;
      if (y) y.textContent = `${height.toFixed(1)}°`;
      const stage = document.querySelector("#screen-scale");
      if (stage) {
        stage.setAttribute(
          "aria-label",
          `Screen size ${width.toFixed(1)} by ${height.toFixed(1)} degrees`,
        );
      }
    }
    const note = document.querySelector("#restoration-note");
    if (note) {
      const gains = scene.contrastRestoration;
      note.textContent = gains
        ? `Contrast restored ×${Number(gains.lowGain).toFixed(1)}/${Number(gains.highGain).toFixed(1)}`
        : "Contrast restored";
      note.hidden = !gains;
    }
    const input = document.querySelector("#decoder-input");
    if (input && Number.isFinite(Number(scene.windowMilliseconds))) {
      input.textContent = `${Math.round(Number(scene.windowMilliseconds))} ms neural activity`;
    }
  }

  // The decoder was rebuilt on 2026-08-19; the derived panels are re-rendering
  // behind it. Anything not yet rebuilt is covered rather than shown stale.
  const REBUILD_ETA = "midnight tonight";

  function pendingMessage(what) {
    return [
      Object.assign(document.createElement("b"), {
        textContent: `${what} is rebuilding`,
      }),
      document.createTextNode(
        `New leave-one-photo-out decoder · expected by ${REBUILD_ETA}. ` +
          `The scene, density, decoded patches and 1/f reconstruction above are already current.`,
      ),
    ];
  }

  function applyRebuildState(scene) {
    // Viewing time, presentation index and per-session cell counts all come from
    // the trial rasters. Hide them rather than show em dashes and 0:00.
    const timed = Boolean(scene.recordingSeconds);
    progressTime.parentElement.hidden = !timed;
    trialLabel.hidden = !Array.isArray(scene.rasterTrial) && !Array.isArray(scene.presentation);
    sessionCells.hidden = !Array.isArray(scene.sessionCells);

    const hasFidelity = Boolean(scene.fidelity?.counts?.length);
    fidelityPending.hidden = true;
    fidelityToggle.hidden = !hasFidelity;
    if (!hasFidelity && !fidelityPanel.hidden) setFidelityVisible(false);
    fidelityToggle.disabled = false;

    const hasPatchDecoder = isLgn(scene)
      ? Boolean(scene.assets?.rfSteps && scene.assets?.rfCounts && scene.assets?.rfRasters)
      : Boolean(scene.assets?.truthPatches && scene.assets?.trialRasters);
    patchPending.hidden = hasPatchDecoder;
    if (!hasPatchDecoder) patchPending.replaceChildren(...pendingMessage("Patch decoder"));

    const hasReplay = Boolean(scene.assets?.replay) || isLgn(scene);
    replayPending.hidden = hasReplay;
    if (!hasReplay) {
      replayPending.textContent =
        `Per-fixation replay is still rendering for this scene (expected by ${REBUILD_ETA}); ` +
        `the scrubber steps through ${scene.frameCounts?.length ?? 28} checkpoints of the current reconstruction meanwhile.`;
    }
  }

  // V1 scenes carry the per-fixation ridge replay (decoded patches, 1/f, patch
  // decoder, Langevin); LGN scenes carry the gaze and receptive-field timeline
  // and the paper's simple ridge (patch mosaic, 1/f) at the model checkpoints.
  function applyMode(scene) {
    const lgn = isLgn(scene);
    viewer.classList.toggle("is-lgn", lgn);
    evidencePanel.hidden = false;
    posteriorPanel.hidden = false;
    restorationLegend.title = lgn ? "" : restorationTitle;
    patchToggle.hidden = lgn && !scene.assets?.rfSteps;
    langevinToggle.hidden = false;
    if (patchToggle.hidden && !patchDrawer.hidden) setPatchDrawerVisible(false);
    clickHint.hidden = patchToggle.hidden;
    clickHint.textContent = lgn
      ? "Click a receptive field (a square) in the original scene, or its block of cells in the raster (top to bottom like the squares), to see the patch its spikes decode."
      : "Click a point in the original scene to inspect the separate local patch decoder.";
    const windowMs = lgn ? 100 : Number(scene.windowMilliseconds);
    if (Number.isFinite(windowMs)) {
      document.querySelector("#decoder-input").textContent = `${Math.round(windowMs)} ms neural activity`;
      decoderBox.setAttribute(
        "aria-label",
        `Ridge regression: input ${Math.round(windowMs)} milliseconds of neural activity; output ${lgn ? "receptive-field" : "gaze-contingent"} patch`,
      );
    }
    decoderOutput.textContent = lgn ? "Receptive-field patch" : "Gaze-contingent patch";
    rasterAxisStart.textContent = "0 s";
    rasterAxisLabel.textContent = lgn ? "Presentation time" : "Trial time";
    if (lgn) {
      document.querySelectorAll(".patch-degrees").forEach((node) => {
        node.textContent = `${Number(scene.ridgePatchDegrees || 0.75).toFixed(2)}°`;
      });
    }
    stepNoun.textContent = lgn ? "time" : "fixations";
    progressNoun.textContent = lgn ? "Window" : "Fixation";
    progressNoun.parentElement.title = lgn ? "One 100-ms window of neural activity every 200 ms of viewing" : "";
    fidelityLegendPosterior.hidden = !scene.fidelity?.series?.posterior;
    if (lgn) {
      patchLegend.textContent = `${Number(scene.tileDegrees || 1)}° receptive fields`;
    } else {
      const degrees = Number(scene.patchDegrees);
      patchLegend.replaceChildren(
        Object.assign(document.createElement("span"), {
          className: "patch-degrees",
          textContent: Number.isFinite(degrees) ? `${degrees.toFixed(2)}°` : "",
        }),
        document.createTextNode(" Decoded patch"),
      );
    }
    canvases.truth.setAttribute(
      "aria-label",
      lgn
        ? "Static natural scene with the eye position and receptive fields over viewing time."
        : "Static natural scene. Click a location to inspect its best decoded patch.",
    );
    updatePanelColumns();
  }

  function animalLabel(animal = state.animal) {
    return ANIMALS.find((entry) => entry.id === animal)?.label ?? animal;
  }

  function dataRoot(animal = state.animal) {
    return `./data/${animal}`;
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
    if (!isBusy) setLoadProgress(null);
  }

  // The replay is by far the largest asset, so its download drives the bar.
  function setLoadProgress(fraction, secondsLeft) {
    if (fraction === null) {
      loadProgress.hidden = true;
      loadProgressBar.style.width = "0%";
      loadProgress.removeAttribute("aria-valuenow");
      return;
    }
    const percent = Math.max(0, Math.min(1, fraction)) * 100;
    loadProgress.hidden = false;
    loadProgressBar.style.width = `${percent.toFixed(1)}%`;
    loadProgress.setAttribute("aria-valuenow", String(Math.round(percent)));
    const remaining =
      secondsLeft === undefined || !Number.isFinite(secondsLeft) || secondsLeft < 0
        ? ""
        : secondsLeft < 1
          ? " · almost done"
          : ` · about ${Math.ceil(secondsLeft)}s left`;
    loadStatus.textContent = `Loading replay… ${Math.round(percent)}%${remaining}`;
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
    if (!scene || isLgn(scene)) return -1;
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

  // LGN patch decoder ------------------------------------------------------
  //
  // rf-steps.json lists, for every replay step, the receptive fields the
  // paper's ridge can decode in that 100-ms window (gid, centre, spikes). The
  // ridge, its calibration and the colour transform are one linear map per
  // field (rf-decoders-f<fold>.bin), so the browser decodes any field from the
  // step's spike counts (rf-counts.png). Default field: the most spikes.

  function rfRange(step) {
    const meta = state.rfMeta;
    if (!meta || step < 0 || step >= meta.steps) return [0, 0];
    return [meta.entryStart[step], meta.entryStart[step + 1]];
  }

  function rfDefaultEntry(step) {
    const meta = state.rfMeta;
    const [from, to] = rfRange(step);
    let best = -1;
    for (let entry = from; entry < to; entry += 1) {
      if (best < 0 || meta.spikes[entry] > meta.spikes[best]) best = entry;
    }
    return best;
  }

  // The chosen field while its session lasts, else the default.
  function rfCurrentEntry(step) {
    const meta = state.rfMeta;
    const choice = state.rfChoice;
    if (choice && state.scene.session[step] === choice.session) {
      const [from, to] = rfRange(step);
      for (let entry = from; entry < to; entry += 1) if (meta.gid[entry] === choice.gid) return entry;
    }
    return rfDefaultEntry(step);
  }

  function rfChoose(step, entry) {
    state.rfChoice = entry < 0 ? null : { session: state.scene.session[step], gid: state.rfMeta.gid[entry] };
  }

  // The field whose square contains the point in this step (-1 if none). The
  // squares are small on screen, so a click within 14 screen pixels of a
  // square's centre counts as on it.
  function rfEntryAtPoint(step, x, y) {
    const meta = state.rfMeta;
    if (!meta) return -1;
    const bounds = canvases.truth.getBoundingClientRect();
    const displayPerScreen = bounds.width ? (state.view?.w ?? FULL_W) / bounds.width : 1;
    const half = Math.max(meta.sidePixels / 2, 14 * displayPerScreen);
    const [from, to] = rfRange(step);
    let found = -1;
    let foundDistance = Infinity;
    for (let entry = from; entry < to; entry += 1) {
      const dx = meta.x[entry] / 10 - x;
      const dy = meta.y[entry] / 10 - y;
      if (Math.abs(dx) > half || Math.abs(dy) > half) continue;
      const distance = dx * dx + dy * dy;
      if (distance < foundDistance) {
        found = entry;
        foundDistance = distance;
      }
    }
    return found;
  }

  // Anywhere else: the step whose default field, covering the point, was
  // decoded best (lowest error), else the nearest (the V1 rule).
  function bestRfStepAtPoint(x, y) {
    const meta = state.rfMeta;
    if (!meta) return -1;
    const half = meta.sidePixels / 2;
    let best = -1;
    let bestError = Infinity;
    let nearest = -1;
    let nearestDistance = Infinity;
    for (let step = 0; step < meta.steps; step += 1) {
      if (meta.error[step] < 0) continue;
      const entry = rfDefaultEntry(step);
      const dx = meta.x[entry] / 10 - x;
      const dy = meta.y[entry] / 10 - y;
      const distance = dx * dx + dy * dy;
      if (distance < nearestDistance) {
        nearest = step;
        nearestDistance = distance;
      }
      if (Math.abs(dx) <= half && Math.abs(dy) <= half && meta.error[step] < bestError) {
        best = step;
        bestError = meta.error[step];
      }
    }
    return best >= 0 ? best : nearest;
  }

  function rfField(step, entry) {
    const decoder = state.rfDecoder;
    if (!decoder) return null;
    const name = state.rfMeta.sessions[state.scene.session[step]];
    return decoder.fields.get(`${name}:${state.rfMeta.gid[entry]}`) ?? null;
  }

  const OPPONENT = [
    [1 / Math.sqrt(3), 1 / Math.sqrt(3), 1 / Math.sqrt(3)],
    [1 / Math.sqrt(6), 1 / Math.sqrt(6), -2 / Math.sqrt(6)],
    [1 / Math.sqrt(2), -1 / Math.sqrt(2), 0],
  ];

  // The paper's ridge for one field, in float64: d = (x - xmean) @ coef with
  // x the paper's float32 log1p of each cell's spike count; the two-gain
  // calibration (DC and the rest, per opponent channel) around the mean patch;
  // opponent -> RGB; clip. Fields with a zero gain are stored in float64.
  function rfDecode(step, entry) {
    const field = rfField(step, entry);
    if (!field) return null;
    const meta = state.rfMeta;
    const decoder = state.rfDecoder;
    const data = field.f64 ? decoder.data64 : decoder.data32;
    const members = field.members;
    const pixels = meta.patchSize * meta.patchSize;
    const width = pixels * 3;
    const coef = field.offset;
    const xmean = coef + members.length * width;
    const mean = xmean + members.length;
    const gains = mean + width;
    const x = new Float64Array(members.length);
    for (let index = 0; index < members.length; index += 1) {
      x[index] = decoder.log1p[state.rfCounts[step * meta.units + members[index]]] - data[xmean + index];
    }
    const d = new Float64Array(width);
    for (let column = 0; column < width; column += 1) {
      let value = 0;
      for (let index = 0; index < members.length; index += 1) value += x[index] * data[coef + index * width + column];
      d[column] = value;
    }
    const dc = [0, 0, 0];
    for (let column = 0; column < width; column += 1) dc[column % 3] += d[column] / pixels;
    const out = new Uint8ClampedArray(pixels * 4);
    for (let pixel = 0; pixel < pixels; pixel += 1) {
      const opponent = [0, 1, 2].map((channel) => {
        const column = pixel * 3 + channel;
        return (
          data[mean + column] +
          dc[channel] / Math.max(data[gains + channel], 1e-8) +
          (d[column] - dc[channel]) / Math.max(data[gains + 3 + channel], 1e-8)
        );
      });
      for (let rgb = 0; rgb < 3; rgb += 1) {
        const value =
          opponent[0] * OPPONENT[0][rgb] + opponent[1] * OPPONENT[1][rgb] + opponent[2] * OPPONENT[2][rgb];
        out[pixel * 4 + rgb] = Math.round(Math.min(1, Math.max(0, value)) * 255);
      }
      out[pixel * 4 + 3] = 255;
    }
    return out;
  }

  function hideSceneMagnifier() {
    sceneMagnifier.hidden = true;
  }

  // The lens is about a third of the scene panel's shorter side (48-112 px),
  // so it never covers most of a small panel; its canvas matches its size on
  // screen (times the pixel ratio) so the magnified pixels stay crisp.
  function sizeSceneMagnifier(bounds) {
    const side = Math.round(Math.max(48, Math.min(112, Math.min(bounds.width, bounds.height) * 0.34)));
    if (state.magnifierSide !== side) {
      state.magnifierSide = side;
      sceneMagnifier.style.width = `${side}px`;
      sceneMagnifier.style.height = `${side}px`;
    }
    const backing = Math.round(side * Math.min(window.devicePixelRatio || 1, 2));
    if (sceneMagnifierCanvas.width !== backing) {
      sceneMagnifierCanvas.width = backing;
      sceneMagnifierCanvas.height = backing;
    }
  }

  function updateSceneMagnifier(event) {
    if (
      event.pointerType === "touch" ||
      !state.scene ||
      (isLgn() && !state.scene.assets?.rfSteps) ||
      !state.images?.original ||
      viewer.getAttribute("aria-busy") === "true"
    ) {
      hideSceneMagnifier();
      return;
    }

    const canvas = canvases.truth;
    const bounds = canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    sizeSceneMagnifier(bounds);
    const [canvasX, canvasY] = viewPoint(canvas, event);
    const image = state.images.original;
    const sourceScaleX = image.naturalWidth / FULL_W;
    const sourceScaleY = image.naturalHeight / FULL_H;
    const patchSide = isLgn()
      ? (state.scene.pixelsPerDegree || 27.7) * (state.scene.ridgePatchDegrees || 0.75)
      : state.scene.patchSelection?.typicalSidePixels ?? 21;
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
    const gap = Math.round(sceneMagnifier.offsetWidth * 0.14);
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

  function traceHull(context, hull) {
    if (!hull || hull.length < 6) return false;
    context.beginPath();
    context.moveTo(hull[0] / 10, hull[1] / 10);
    for (let index = 2; index < hull.length; index += 2) {
      context.lineTo(hull[index] / 10, hull[index + 1] / 10);
    }
    context.closePath();
    return true;
  }

  function drawHull(context, hull) {
    context.save();
    if (!traceHull(context, hull)) {
      context.restore();
      return;
    }
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
    context.drawImage(state.images.original, 0, 0, FULL_W, FULL_H);
    drawHull(context, scene.hull);
    if (current < 0) return;

    // Only the current eye position: the gaze trail was removed for
    // simplicity (user, 11-26).
    const [x, y] = roundedPoint(scene.gaze, current);
    if (isLgn(scene)) {
      updateLgnLegend();
      if (rfFieldsShown()) drawRfFields(context, current);
      else drawLgnTiles(context, current);
    } else {
      drawPatchWindow(context, current);
    }
    drawGaze(context, x, y);
  }

  function rfFieldsShown() {
    return Boolean(state.rfMeta && state.rfDecoder && !patchDrawer.hidden);
  }

  function updateLgnLegend() {
    const text = rfFieldsShown()
      ? `${Number(state.scene.ridgePatchDegrees || 0.75)}° decodable receptive fields`
      : `${Number(state.scene.tileDegrees || 1)}° receptive fields`;
    if (patchLegend.textContent !== text) patchLegend.textContent = text;
  }

  // With the decoder open: every decodable field of this window as a square
  // (clickable), the hovered one in white, the decoded one in white and cyan.
  function drawRfFields(context, current) {
    const meta = state.rfMeta;
    if (current < 0) return;
    const side = meta.sidePixels;
    const chosen = rfCurrentEntry(current);
    const [from, to] = rfRange(current);
    context.save();
    for (let entry = from; entry < to; entry += 1) {
      if (entry === chosen) continue;
      const x = meta.x[entry] / 10 - side / 2;
      const y = meta.y[entry] / 10 - side / 2;
      context.strokeStyle = entry === state.rfHover ? "#ffffff" : colors.patch;
      context.lineWidth = entry === state.rfHover ? 4 : 2.5;
      context.strokeRect(x, y, side, side);
    }
    if (chosen >= 0) {
      const x = meta.x[chosen] / 10 - side / 2;
      const y = meta.y[chosen] / 10 - side / 2;
      context.strokeStyle = "#ffffff";
      context.lineWidth = 8;
      context.strokeRect(x, y, side, side);
      context.strokeStyle = colors.gaze;
      context.lineWidth = 4;
      context.strokeRect(x, y, side, side);
    }
    context.restore();
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
      FULL_W,
      FULL_H,
    );
    return context;
  }

  function drawImageInsideHull(context, image, hull, alpha = 1) {
    context.save();
    if (!traceHull(context, hull)) {
      context.restore();
      return;
    }
    context.clip();
    context.globalAlpha = alpha;
    context.drawImage(image, 0, 0, FULL_W, FULL_H);
    context.restore();
  }

  // Transformer and diffusion ----------------------------------------------
  //
  // Both panels show the paper's held-out models. `paperProgress.counts[k]` is
  // the scrubber position at which checkpoint k is exact: the model's packet
  // restricted to the first presentations of this scene, in chronological order.
  // Between checkpoints the two exact frames are cross-faded by position; before
  // the first checkpoint the frame fades in from neutral grey. The last
  // checkpoint is the paper's own final render (the `transformer` / `diffusion`
  // image), never a re-render.

  function isLgn(scene = state.scene) {
    return scene?.mode === "lgn";
  }

  function drawModelFrame(context, kind, frameIndex, alpha) {
    const progress = state.scene.paperProgress;
    context.save();
    context.globalAlpha = Math.max(0, Math.min(1, alpha));
    if (!traceHull(context, state.scene.hull)) {
      context.restore();
      return;
    }
    context.clip();
    if (frameIndex < 0) {
      context.fillStyle = "#808080";
      context.fill();
    } else if (!progress || frameIndex >= progress.counts.length - 1) {
      context.drawImage(state.images[kind], 0, 0, FULL_W, FULL_H);
    } else {
      const sprite = state.images[`${kind}Prefix`];
      const sourceX = (frameIndex % progress.spriteColumns) * progress.frameWidth;
      const sourceY = Math.floor(frameIndex / progress.spriteColumns) * progress.frameHeight;
      context.drawImage(
        sprite,
        sourceX,
        sourceY,
        progress.frameWidth,
        progress.frameHeight,
        0,
        0,
        FULL_W,
        FULL_H,
      );
    }
    context.restore();
  }

  function drawModel(kind, canvas = canvases[kind]) {
    const context = clearCanvas(canvas);
    const progress = state.scene.paperProgress;
    if (!progress?.counts?.length || !state.images[`${kind}Prefix`]) {
      drawModelFrame(context, kind, Infinity, 1);
      return context;
    }
    const counts = progress.counts;
    const count = state.count;
    // index = last exact checkpoint at or before this position (-1 = neutral)
    let index = -1;
    while (index + 1 < counts.length && counts[index + 1] <= count) index += 1;
    drawModelFrame(context, kind, index, 1);
    if (index + 1 < counts.length) {
      const from = index < 0 ? 0 : counts[index];
      const span = counts[index + 1] - from;
      const linear = span > 0 ? (count - from) / span : 1;
      // Diffusion samples at neighbouring checkpoints can differ in content, so
      // its blend is eased to keep double exposures brief.
      const fraction = kind === "diffusion" ? linear * linear * (3 - 2 * linear) : linear;
      if (fraction > 0) drawModelFrame(context, kind, index + 1, fraction);
    }
    return context;
  }

  // Receptive field density -------------------------------------------------
  //
  // The paper's coverage maps (Fig. 2C, Figs. S1/S2): every receptive-field
  // sample splatted with a Gaussian (sigma 7 px for V1, 3.5 px for LGN, on the
  // 1280 x 720 canvas), shown as sqrt(density / the scene's 99.5th percentile)
  // from navy to cyan. Here the samples accumulate with the scrubber: one
  // decoded-patch centre per fixation (V1), or every receptive-field tile of
  // every 200-ms window (LGN). The scale is the final density's, so the map
  // fills in as viewing time accumulates.

  const RF_NAVY = [9, 14, 22];
  const RF_CYAN = [34, 211, 238];

  function rfPrepare(scene) {
    const lgn = isLgn(scene);
    const scale = lgn ? 2 : 4;
    const sigma = (lgn ? 3.5 : 7) / scale;
    const width = Math.round(1280 / scale);
    const height = Math.round(720 / scale);
    const radius = Math.ceil(3 * sigma);
    const kernel = new Float32Array((2 * radius + 1) ** 2);
    for (let dy = -radius; dy <= radius; dy += 1) {
      for (let dx = -radius; dx <= radius; dx += 1) {
        kernel[(dy + radius) * (2 * radius + 1) + dx + radius] = Math.exp(-(dx * dx + dy * dy) / (2 * sigma * sigma));
      }
    }
    const xs = [];
    const ys = [];
    const start = new Int32Array(scene.total + 1);
    for (let index = 0; index < scene.total; index += 1) {
      start[index] = xs.length;
      if (lgn) {
        const gx = scene.gaze[index * 2] / 10;
        const gy = scene.gaze[index * 2 + 1] / 10;
        for (const [dx, dy] of scene.tileOffsets[scene.session[index]]) {
          xs.push(gx + dx / 10);
          ys.push(gy + dy / 10);
        }
      } else {
        const [x0, y0, x1, y1] = patchBox(scene.patchBox, index);
        xs.push((x0 + x1) / 2);
        ys.push((y0 + y1) / 2);
      }
    }
    start[scene.total] = xs.length;
    const rf = {
      scene,
      scale,
      width,
      height,
      radius,
      kernel,
      xs: Float32Array.from(xs),
      ys: Float32Array.from(ys),
      start,
      grid: new Float32Array(width * height),
      upTo: 0,
      norm: 1,
      canvas: document.createElement("canvas"),
      image: null,
    };
    rf.canvas.width = width;
    rf.canvas.height = height;
    rf.image = rf.canvas.getContext("2d").createImageData(width, height);
    rfAccumulate(rf, scene.total);
    const positive = rf.grid.filter((value) => value > 0).sort();
    rf.norm = positive.length ? positive[Math.min(positive.length - 1, Math.floor(0.995 * (positive.length - 1)))] : 1;
    return rf;
  }

  function rfAccumulate(rf, count) {
    if (count < rf.upTo) {
      rf.grid.fill(0);
      rf.upTo = 0;
    }
    const size = 2 * rf.radius + 1;
    for (let point = rf.start[rf.upTo]; point < rf.start[count]; point += 1) {
      const cx = Math.round(rf.xs[point] / rf.scale);
      const cy = Math.round(rf.ys[point] / rf.scale);
      for (let dy = -rf.radius; dy <= rf.radius; dy += 1) {
        const y = cy + dy;
        if (y < 0 || y >= rf.height) continue;
        const row = y * rf.width;
        const krow = (dy + rf.radius) * size + rf.radius;
        for (let dx = -rf.radius; dx <= rf.radius; dx += 1) {
          const x = cx + dx;
          if (x < 0 || x >= rf.width) continue;
          rf.grid[row + x] += rf.kernel[krow + dx];
        }
      }
    }
    rf.upTo = count;
  }

  function drawDensity(current) {
    const scene = state.scene;
    if (!state.rf || state.rf.scene !== scene) state.rf = rfPrepare(scene);
    const rf = state.rf;
    rfAccumulate(rf, state.count);
    const data = rf.image.data;
    for (let index = 0; index < rf.grid.length; index += 1) {
      const value = Math.sqrt(Math.min(1, rf.grid[index] / rf.norm));
      const offset = index * 4;
      data[offset] = RF_NAVY[0] + (RF_CYAN[0] - RF_NAVY[0]) * value;
      data[offset + 1] = RF_NAVY[1] + (RF_CYAN[1] - RF_NAVY[1]) * value;
      data[offset + 2] = RF_NAVY[2] + (RF_CYAN[2] - RF_NAVY[2]) * value;
      data[offset + 3] = 255;
    }
    rf.canvas.getContext("2d").putImageData(rf.image, 0, 0);
    const context = clearCanvas(canvases.density);
    context.save();
    if (traceHull(context, scene.hull)) context.clip();
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(rf.canvas, 0, 0, FULL_W, FULL_H);
    context.restore();
    if (current >= 0) {
      if (isLgn()) drawLgnTiles(context, current);
      else drawPatchWindow(context, current);
    }
  }

  // LGN replay: gaze, trail and receptive-field tiles ------------------------

  function lgnTileSize() {
    return (state.scene.pixelsPerDegree || 27.7) * (state.scene.tileDegrees || 1);
  }

  function drawLgnTiles(context, current, degrees) {
    const scene = state.scene;
    const [x, y] = roundedPoint(scene.gaze, current);
    const size = degrees ? scene.pixelsPerDegree * degrees : lgnTileSize();
    context.save();
    context.strokeStyle = colors.patch;
    context.lineWidth = 3;
    for (const [dx, dy] of scene.tileOffsets[scene.session[current]]) {
      context.strokeRect(x + dx / 10 - size / 2, y + dy / 10 - size / 2, size, size);
    }
    context.restore();
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
      FULL_W,
      FULL_H,
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
    // Trial rasters are a later build stage. Without them there is no wall-clock
    // mapping, so fall back to fixation-proportional time rather than failing to
    // open the scene at all.
    if (!Array.isArray(scene.rasterTrials) || !scene.rasterTrials.length) {
      const seconds = new Float64Array(scene.total + 1);
      const span = Number(scene.recordingSeconds) || 0;
      for (let count = 0; count <= scene.total; count += 1) {
        seconds[count] = scene.total ? (span * count) / scene.total : 0;
      }
      scene.viewingSeconds = seconds;
      scene.recordingSeconds = span;
      return;
    }
    const totalBins = scene.rasterTrials.reduce((sum, trial) => sum + trial.bins, 0);
    const secondsPerBin = scene.recordingSeconds / totalBins;
    let elapsedBins = 0;
    const trialStarts = scene.rasterTrials.map((trial) => {
      const start = elapsedBins * secondsPerBin;
      elapsedBins += trial.bins;
      return start;
    });
    // Elapsed viewing time for every scrubber position, forced non-decreasing so
    // the fidelity chart can invert it to place viewing-time ticks.
    const seconds = new Float64Array(scene.total + 1);
    let running = 0;
    for (let count = 1; count < scene.total; count += 1) {
      const fixationIndex = count - 1;
      const trialIndex = scene.rasterTrial[fixationIndex];
      const withinTrialBins = scene.rasterWindow[fixationIndex * 2 + 1];
      running = Math.max(running, trialStarts[trialIndex] + withinTrialBins * secondsPerBin);
      seconds[count] = running;
    }
    seconds[scene.total] = Math.max(running, scene.recordingSeconds);
    scene.viewingSeconds = seconds;
  }

  function viewingSecondsAtCount(count) {
    const seconds = state.scene.viewingSeconds;
    const index = Math.max(0, Math.min(state.scene.total, Math.round(count)));
    return seconds[index];
  }

  function countAtViewingSeconds(target) {
    const seconds = state.scene.viewingSeconds;
    let low = 0;
    let high = state.scene.total;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (seconds[middle] < target) low = middle + 1;
      else high = middle;
    }
    return low;
  }

  // Reconstruction fidelity -------------------------------------------------
  //
  // Every curve point is precomputed in scene.json. The plot is drawn at a
  // fixed 1280x720 like every other panel canvas, so CSS scaling keeps it
  // proportional at any panel width instead of reflowing.

  const FIDELITY_METRICS = {
    psnr: { axis: "PSNR (dB)", short: "PSNR", suffix: " dB", digits: 2 },
    ssim: { axis: "SSIM", short: "SSIM", suffix: "", digits: 3 },
    rmse: { axis: "RMSE (intensity)", short: "RMSE", suffix: "", digits: 4 },
    correlation: { axis: "Correlation (r)", short: "r", suffix: "", digits: 3 },
  };

  const FIDELITY_SERIES = [
    { key: "posterior", label: "1/f reconstruction", color: "--fidelity-posterior", dash: [] },
    { key: "transformer", label: "Transformer", color: "--fidelity-transformer", dash: [26, 18] },
    { key: "diffusion", label: "Diffusion", color: "--fidelity-diffusion", dash: [6, 16] },
  ];

  // Series present for this scene (LGN has no 1/f reconstruction).
  function fidelitySeries(scene = state.scene) {
    return FIDELITY_SERIES.filter((definition) => scene?.fidelity?.series?.[definition.key]);
  }

  // Layout is always computed in this fixed coordinate space, so the plot can
  // never reflow with panel width. Only the backing-store resolution tracks the
  // display size, which keeps the type crisp instead of downscaled.
  // 900 virtual units wide: the plot sits in a box the size of a comparison
  // panel, so its type is set larger relative to the plot than at 1280.
  const FIDELITY_VIEW = { width: 900, height: 506 };
  const FIDELITY_PLOT = { right: 52, top: 74, bottom: 178 };
  function fidelityRows() {
    return [isLgn() ? "Windows" : "Fixations", "Viewing time"];
  }

  function niceTicks(minimum, maximum, target) {
    const span = maximum - minimum;
    if (!(span > 0)) return [minimum];
    const magnitude = 10 ** Math.floor(Math.log10(span / target));
    const step =
      [1, 2, 2.5, 5, 10].map((factor) => factor * magnitude).find((value) => value >= span / target) ??
      10 * magnitude;
    const ticks = [];
    for (
      let value = Math.ceil(minimum / step) * step;
      value <= maximum + step * 1e-6;
      value += step
    ) {
      ticks.push(Number(value.toPrecision(12)));
    }
    return ticks;
  }

  function fidelityValueAt(values, counts, count) {
    if (count <= counts[0]) return values[0];
    const last = counts.length - 1;
    if (count >= counts[last]) return values[last];
    let low = 0;
    let high = last;
    while (low < high) {
      const middle = (low + high) >> 1;
      if (counts[middle] < count) low = middle + 1;
      else high = middle;
    }
    const upper = low;
    const lower = Math.max(0, upper - 1);
    const span = counts[upper] - counts[lower];
    if (span <= 0) return values[upper];
    const weight = (count - counts[lower]) / span;
    return values[lower] + weight * (values[upper] - values[lower]);
  }

  function fidelityAvailable() {
    return Boolean(state.scene?.fidelity?.counts?.length);
  }

  function fidelityGeometry() {
    const scene = state.scene;
    const values = scene.fidelity.series;
    const metricKey = state.fidelityMetric;
    let minimum = Infinity;
    let maximum = -Infinity;
    for (const definition of fidelitySeries(scene)) {
      for (const value of values[definition.key][metricKey]) {
        if (value < minimum) minimum = value;
        if (value > maximum) maximum = value;
      }
    }
    const pad = Math.max((maximum - minimum) * 0.08, 1e-6);
    minimum -= pad;
    maximum += pad;
    // A scratch context, so measuring never disturbs the display transform.
    const measure = fidelityMeasureContext();
    const family = getComputedStyle(document.body).fontFamily;
    const metric = FIDELITY_METRICS[metricKey];
    measure.font = `46px ${family}`;
    const tickWidth = Math.max(
      ...niceTicks(minimum, maximum, 5).map(
        (value) => measure.measureText(String(Number(value.toFixed(metric.digits + 1)))).width,
      ),
    );
    measure.font = `600 44px ${family}`;
    const labelWidth = Math.max(...fidelityRows().map((text) => measure.measureText(text).width));
    const left = Math.ceil(Math.max(tickWidth, labelWidth)) + 30;
    const right = FIDELITY_VIEW.width - FIDELITY_PLOT.right;
    const top = FIDELITY_PLOT.top;
    const bottom = FIDELITY_VIEW.height - FIDELITY_PLOT.bottom;
    return {
      left,
      right,
      top,
      bottom,
      minimum,
      maximum,
      metricKey,
      metric,
      x: (count) => left + (count / scene.total) * (right - left),
      y: (value) => bottom - ((value - minimum) / (maximum - minimum)) * (bottom - top),
    };
  }

  let fidelityMeasureCanvas = null;

  function fidelityMeasureContext() {
    if (!fidelityMeasureCanvas) fidelityMeasureCanvas = document.createElement("canvas");
    return fidelityMeasureCanvas.getContext("2d");
  }

  function fidelityContext() {
    const canvas = canvases.fidelity;
    const bounds = canvas.getBoundingClientRect();
    if (bounds.width < 2) return null;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.round(bounds.width * ratio);
    const height = Math.round((bounds.width * FIDELITY_VIEW.height) / FIDELITY_VIEW.width * ratio);
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
    const context = canvas.getContext("2d");
    context.setTransform(width / FIDELITY_VIEW.width, 0, 0, height / FIDELITY_VIEW.height, 0, 0);
    return context;
  }

  function drawFidelity() {
    if (fidelityPanel.hidden || !fidelityAvailable()) return;
    const scene = state.scene;
    const fidelity = scene.fidelity;
    const context = fidelityContext();
    if (!context) return;
    const styles = getComputedStyle(fidelityPanel);
    const ink = styles.getPropertyValue("--fidelity-ink").trim();
    const muted = styles.getPropertyValue("--fidelity-muted").trim();
    const label = styles.getPropertyValue("--fidelity-label").trim();
    const gridColor = styles.getPropertyValue("--fidelity-grid").trim();
    const axisColor = styles.getPropertyValue("--fidelity-axis").trim();
    const surface = styles.getPropertyValue("--fidelity-surface").trim();
    context.fillStyle = surface;
    context.fillRect(0, 0, FIDELITY_VIEW.width, FIDELITY_VIEW.height);
    const plot = fidelityGeometry();
    const family = getComputedStyle(document.body).fontFamily;
    const tickFont = `46px ${family}`;
    const labelFont = `600 44px ${family}`;

    context.font = tickFont;
    context.textBaseline = "middle";
    for (const value of niceTicks(plot.minimum, plot.maximum, 5)) {
      const y = plot.y(value);
      context.strokeStyle = gridColor;
      context.lineWidth = 2;
      context.beginPath();
      context.moveTo(plot.left, y);
      context.lineTo(plot.right, y);
      context.stroke();
      context.fillStyle = muted;
      context.textAlign = "right";
      context.fillText(String(Number(value.toFixed(plot.metric.digits + 1))), plot.left - 18, y);
    }

    context.strokeStyle = axisColor;
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(plot.left, plot.bottom);
    context.lineTo(plot.right, plot.bottom);
    context.stroke();

    // Both measures read along the bottom, one labelled row each.
    const rowLabel = (text, y) => {
      context.font = labelFont;
      context.fillStyle = label;
      context.textAlign = "right";
      context.textBaseline = "middle";
      context.fillText(text, plot.left - 18, y);
    };
    const tickRow = (positions, y) => {
      context.font = tickFont;
      context.textBaseline = "middle";
      for (const [x, text, align] of positions) {
        context.strokeStyle = axisColor;
        context.lineWidth = 2;
        context.beginPath();
        context.moveTo(x, y - 30);
        context.lineTo(x, y - 18);
        context.stroke();
        context.fillStyle = muted;
        context.textAlign = align;
        context.fillText(text, x, y);
      }
    };

    const fixationRowY = plot.bottom + 48;
    const timeRowY = plot.bottom + 128;
    const xTicks = niceTicks(0, scene.total, 3).filter((count) => count <= scene.total);
    tickRow(
      xTicks.map((count, index) => [
        plot.x(count),
        count.toLocaleString(),
        index === 0 ? "left" : index === xTicks.length - 1 ? "right" : "center",
      ]),
      fixationRowY,
    );
    rowLabel(fidelityRows()[0], fixationRowY);

    const span = scene.viewingSeconds[scene.total];
    const timeStep = [15, 30, 60, 120, 300, 600, 900].find((step) => span / step <= 4) ?? 1800;
    const timeTicks = [];
    for (let seconds = 0; seconds <= span + 1; seconds += timeStep) {
      const x = plot.x(seconds <= 0 ? 0 : countAtViewingSeconds(seconds));
      if (x > plot.right - 10) continue;
      timeTicks.push([x, formatViewingTime(seconds), timeTicks.length === 0 ? "left" : "center"]);
    }
    tickRow(timeTicks, timeRowY);
    rowLabel(fidelityRows()[1], timeRowY);

    context.font = labelFont;
    context.fillStyle = label;
    context.textAlign = "left";
    context.textBaseline = "alphabetic";
    context.fillText(plot.metric.axis, plot.left, plot.top - 24);

    // Identity comes from the caption legend plus solid/dashed.
    const strokes = fidelitySeries(scene).map((definition) => ({
      ...definition,
      values: fidelity.series[definition.key][plot.metricKey],
      counts: fidelity.series[definition.key].counts ?? fidelity.counts,
      stroke: styles.getPropertyValue(definition.color).trim(),
    }));
    for (const entry of strokes) {
      if (entry.counts.length === 1) {
        // A single exact point (the final reconstruction): a ring at its position.
        context.beginPath();
        context.arc(plot.x(entry.counts[0]), plot.y(entry.values[0]), 17, 0, Math.PI * 2);
        context.strokeStyle = entry.stroke;
        context.lineWidth = 7;
        context.stroke();
        continue;
      }
      context.save();
      context.beginPath();
      entry.counts.forEach((count, index) => {
        const x = plot.x(count);
        const y = plot.y(entry.values[index]);
        if (index === 0) context.moveTo(x, y);
        else context.lineTo(x, y);
      });
      context.strokeStyle = entry.stroke;
      context.lineWidth = 7;
      context.lineJoin = "round";
      context.lineCap = "round";
      context.setLineDash(entry.dash);
      context.stroke();
      context.restore();
    }

    const markerX = plot.x(state.count);
    context.save();
    context.globalAlpha = 0.62;
    context.strokeStyle = ink;
    context.lineWidth = 5;
    context.beginPath();
    context.moveTo(markerX, plot.top);
    context.lineTo(markerX, plot.bottom);
    context.stroke();
    context.restore();
    for (const entry of strokes) {
      if (entry.counts.length < 2 || state.count < entry.counts[0]) continue;
      const value = fidelityValueAt(entry.values, entry.counts, state.count);
      context.beginPath();
      context.arc(markerX, plot.y(value), 15, 0, Math.PI * 2);
      context.fillStyle = entry.stroke;
      context.fill();
      context.strokeStyle = surface;
      context.lineWidth = 6;
      context.stroke();
    }
  }

  function setFidelityVisible(show, { scroll = false } = {}) {
    fidelityPanel.hidden = !show;
    updatePanelColumns();
    fidelityToggle.setAttribute("aria-pressed", String(show));
    fidelityToggle.textContent = show ? "Hide fidelity curve" : "Show fidelity curve";
    paint();
    if (show && scroll) {
      requestAnimationFrame(() => {
        fidelityPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  }
  // Langevin sampling ------------------------------------------------------
  //
  // The panel treats the displayed 1/f reconstruction as the image and runs the
  // denoising post's Fourier-domain update on it (denoise.py / denoise.m),
  // restricted to the robust hull. Everything happens in a worker so the replay
  // keeps its frame rate; see langevin-worker.js for the update itself.

  const LANGEVIN_WIDTH = 512;
  const LANGEVIN_HEIGHT = 256;
  const LANGEVIN_SYNC_MS = 120;

  function langevinScratch() {
    const langevin = state.langevin;
    if (!langevin.canvas) {
      langevin.canvas = document.createElement("canvas");
      langevin.canvas.width = LANGEVIN_WIDTH;
      langevin.canvas.height = LANGEVIN_HEIGHT;
      langevin.source = document.createElement("canvas");
      langevin.source.width = LANGEVIN_WIDTH;
      langevin.source.height = LANGEVIN_HEIGHT;
    }
    return langevin;
  }

  // The hull polygon is stored in tenths of a display pixel; rasterize it once
  // per scene onto the work grid.
  function langevinHullMask(scene) {
    const canvas = document.createElement("canvas");
    canvas.width = LANGEVIN_WIDTH;
    canvas.height = LANGEVIN_HEIGHT;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    const scaleX = LANGEVIN_WIDTH / FULL_W;
    const scaleY = LANGEVIN_HEIGHT / FULL_H;
    context.beginPath();
    context.moveTo((scene.hull[0] / 10) * scaleX, (scene.hull[1] / 10) * scaleY);
    for (let index = 2; index < scene.hull.length; index += 2) {
      context.lineTo((scene.hull[index] / 10) * scaleX, (scene.hull[index + 1] / 10) * scaleY);
    }
    context.closePath();
    context.fillStyle = "#ffffff";
    context.fill();
    const pixels = context.getImageData(0, 0, LANGEVIN_WIDTH, LANGEVIN_HEIGHT).data;
    const mask = new Uint8Array(LANGEVIN_WIDTH * LANGEVIN_HEIGHT);
    for (let index = 0; index < mask.length; index += 1) {
      mask[index] = pixels[index * 4 + 3] > 127 ? 1 : 0;
    }
    return mask;
  }

  // Sample the reconstruction the same way the posterior panel does, straight
  // from the replay frame or the sprite, so the sampler never reads back the
  // large display canvas.
  function langevinObservation() {
    const scene = state.scene;
    const langevin = langevinScratch();
    const context = langevin.source.getContext("2d", { willReadFrequently: true });
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, LANGEVIN_WIDTH, LANGEVIN_HEIGHT);
    if (isLgn(scene)) {
      // LGN: the colour 1/f reconstruction exactly as its panel draws it
      // (checkpoints cross-faded by position), in the paper's opponent space,
      // one channel after another.
      context.setTransform(LANGEVIN_WIDTH / FULL_W, 0, 0, LANGEVIN_HEIGHT / FULL_H, 0, 0);
      drawModel("ridge", langevin.source);
      context.setTransform(1, 0, 0, 1, 0, 0);
      const pixels = context.getImageData(0, 0, LANGEVIN_WIDTH, LANGEVIN_HEIGHT).data;
      const count = LANGEVIN_WIDTH * LANGEVIN_HEIGHT;
      const observation = new Float32Array(3 * count);
      for (let index = 0; index < count; index += 1) {
        const offset = index * 4;
        for (let channel = 0; channel < 3; channel += 1) {
          const row = OPPONENT[channel];
          observation[channel * count + index] =
            row[0] * pixels[offset] + row[1] * pixels[offset + 1] + row[2] * pixels[offset + 2];
        }
      }
      return observation;
    }
    if (replayFrameReady()) {
      context.drawImage(
        replayVideo,
        2 * scene.frameWidth,
        0,
        scene.frameWidth,
        scene.frameHeight,
        0,
        0,
        LANGEVIN_WIDTH,
        LANGEVIN_HEIGHT,
      );
    } else {
      const frameIndex = frameIndexForCount(state.count);
      context.drawImage(
        state.images.posterior,
        (frameIndex % scene.spriteColumns) * scene.frameWidth,
        Math.floor(frameIndex / scene.spriteColumns) * scene.frameHeight,
        scene.frameWidth,
        scene.frameHeight,
        0,
        0,
        LANGEVIN_WIDTH,
        LANGEVIN_HEIGHT,
      );
    }
    const pixels = context.getImageData(0, 0, LANGEVIN_WIDTH, LANGEVIN_HEIGHT).data;
    const observation = new Float32Array(LANGEVIN_WIDTH * LANGEVIN_HEIGHT);
    for (let index = 0; index < observation.length; index += 1) {
      const offset = index * 4;
      observation[index] =
        0.299 * pixels[offset] + 0.587 * pixels[offset + 1] + 0.114 * pixels[offset + 2];
    }
    return observation;
  }

  function langevinParams() {
    return {
      eta: Number(langevinEta.value),
      snr: Number(langevinSnr.value),
      temperature: Number(langevinTemperature.value),
    };
  }

  function drawLangevinFrame(message) {
    const langevin = langevinScratch();
    const context = langevin.canvas.getContext("2d");
    context.putImageData(
      new ImageData(new Uint8ClampedArray(message.pixels), message.width, message.height),
      0,
      0,
    );
    const target = clearCanvas(canvases.langevin);
    target.drawImage(langevin.canvas, 0, 0, FULL_W, FULL_H);
    drawHull(target, state.scene.hull);
    langevinIterations.textContent = `${message.iteration.toLocaleString()} steps`;
    langevinDeviation.textContent = `${message.deviation.toFixed(1)} / 255`;
  }

  function langevinWorker() {
    const langevin = state.langevin;
    if (langevin.worker || langevin.failed) return langevin.worker;
    if (typeof Worker === "undefined") {
      langevin.failed = true;
      return null;
    }
    try {
      langevin.worker = new Worker(`./langevin-worker.js?v=${DATA_VERSION}`);
    } catch (error) {
      console.error(error);
      langevin.failed = true;
      return null;
    }
    langevin.worker.addEventListener("message", (event) => {
      const message = event.data;
      if (message.type === "frame") {
        if (!state.scene || langevinPanel.hidden) return;
        drawLangevinFrame(message);
        return;
      }
      if (message.type === "error") {
        console.error(message.error);
        langevinFailed();
      }
    });
    langevin.worker.addEventListener("error", (event) => {
      console.error(event.message || event);
      langevinFailed();
    });
    return langevin.worker;
  }

  function langevinFailed() {
    const langevin = state.langevin;
    langevin.failed = true;
    if (langevin.worker) langevin.worker.terminate();
    langevin.worker = null;
    langevin.token = -1;
    langevinToggle.disabled = true;
    langevinIterations.textContent = "unavailable";
  }

  function setLangevinRunning(running) {
    const langevin = state.langevin;
    langevin.running = running;
    langevinRun.setAttribute("aria-pressed", String(running));
    langevinRun.textContent = running ? "Pause sampling" : "Resume sampling";
    if (langevin.worker) langevin.worker.postMessage({ type: "run", running });
  }

  // Called from paint(): keeps the sampler pointed at the reconstruction that is
  // currently on screen, and re-seeds it whenever the scene changes.
  function syncLangevin({ force = false } = {}) {
    if (langevinPanel.hidden || !state.scene || !state.images) return;
    const worker = langevinWorker();
    if (!worker) return;
    const langevin = state.langevin;
    const now = performance.now();
    const fresh = langevin.token !== state.loadToken;
    if (!force && !fresh && now - langevin.lastSync < LANGEVIN_SYNC_MS) return;
    langevin.lastSync = now;

    if (fresh) {
      langevin.token = state.loadToken;
      langevin.mask = langevinHullMask(state.scene);
      clearCanvas(canvases.langevin);
      langevinIterations.textContent = "0 steps";
      const mask = langevin.mask.slice();
      const observation = langevinObservation();
      worker.postMessage(
        {
          type: "init",
          width: LANGEVIN_WIDTH,
          height: LANGEVIN_HEIGHT,
          aspect: isLgn() ? FULL_H / FULL_W : state.scene.frameHeight / state.scene.frameWidth,
          channels: isLgn() ? 3 : 1,
          mask: mask.buffer,
          observation: observation.buffer,
          params: langevinParams(),
        },
        [mask.buffer, observation.buffer],
      );
      setLangevinRunning(true);
      return;
    }

    const observation = langevinObservation();
    worker.postMessage({ type: "observation", observation: observation.buffer }, [
      observation.buffer,
    ]);
  }

  function setLangevinVisible(show, { scroll = false } = {}) {
    langevinPanel.hidden = !show;
    langevinReadout.hidden = !show;
    updatePanelColumns();
    langevinToggle.setAttribute("aria-pressed", String(show));
    langevinToggle.textContent = show ? "Hide Langevin sampling" : "Show Langevin sampling";
    if (show) {
      clearCanvas(canvases.langevin);
      syncLangevin({ force: true });
      setLangevinRunning(true);
    } else {
      setLangevinRunning(false);
    }
    if (show && scroll) {
      requestAnimationFrame(() => {
        langevinPanel.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  }

  // A 60-column grid. The core comparison always shares the first row (five
  // V1 panels, three LGN panels); diagnostics take a centred second row, so
  // opening a tool never squeezes or reorders the comparison. LGN has room for
  // the density map in the first row.
  function updatePanelColumns() {
    const core = 5;
    const optional = [densityPanel, langevinPanel, fidelityPanel].filter((panel) => !panel.hidden);
    const firstRow = [];
    const secondRow = optional;
    const span = 60 / core;
    panelGrid.style.setProperty("--core-span", String(span));
    firstRow.forEach((panel) => {
      panel.style.gridColumn = `span ${span}`;
    });
    // Diagnostics get exactly the size of a comparison box, packed from the
    // left in a fixed order (density, Langevin, fidelity), so opening one never
    // shows a box larger than the others.
    secondRow.forEach((panel, index) => {
      const start = 1 + index * span;
      panel.style.gridColumn = `${start} / span ${span}`;
    });
    panelGrid.dataset.columns = String(core + optional.length);
  }

  // Rows are the session's units, so a field's cells are rows: they are
  // shaded across the presentation, and the decoded window is the blue band.
  function rfRasterGeometry(current) {
    const meta = state.rfMeta;
    const presentation = current >= 0 ? state.scene.presentation[current] : -1;
    const record = meta?.presentations?.[presentation];
    return record ? { presentation, record } : null;
  }

  // One block of rows per receptive field, the blocks top to bottom in the
  // order the squares lie on screen (rf-steps presentations[p].fields), each
  // block its field's cells (a cell feeding two fields appears in both). Only
  // fields decodable somewhere in the presentation are drawn. The atlas holds
  // each needed cell once, as a 1-px row (presentations[p].units, at[]).
  function rfRasterLayout(current) {
    const geometry = rfRasterGeometry(current);
    if (!geometry || !state.rfDecoder || !state.images?.rfRasters) return null;
    if (state.rfLayoutToken !== state.loadToken) {
      state.rfLayouts = new Map();
      state.rfLayoutToken = state.loadToken;
    }
    const { presentation, record } = geometry;
    const cached = state.rfLayouts.get(presentation);
    if (cached) return cached;
    const name = state.rfMeta.sessions[state.scene.session[current]];
    const strip = new Map((record.units ?? []).map((unit, index) => [unit, index]));
    const rows = [];
    const blocks = [];
    for (const gid of record.fields ?? []) {
      const field = state.rfDecoder.fields.get(`${name}:${gid}`);
      if (!field) continue;
      const start = rows.length;
      for (const unit of field.members) if (strip.has(unit)) rows.push(strip.get(unit));
      if (rows.length > start) blocks.push({ gid, start, end: rows.length });
    }
    const layout = { presentation, record, rows, blocks, image: null };
    state.rfLayouts.set(presentation, layout);
    return layout;
  }

  // Pixel geometry of the blocks on a raster of this height: a small gap
  // between blocks so each field reads as one region.
  const RF_BLOCK_GAP = 4;
  function rfBlockPixels(layout, height) {
    if (layout.pixels && layout.pixels.height === height) return layout.pixels;
    const count = layout.blocks.length;
    const gap = count > 1 ? Math.min(RF_BLOCK_GAP, (height * 0.2) / (count - 1)) : 0;
    const rowHeight = (height - gap * Math.max(0, count - 1)) / Math.max(1, layout.rows.length);
    const spans = layout.blocks.map((block, index) => {
      const y0 = block.start * rowHeight + index * gap;
      return { y0, y1: y0 + (block.end - block.start) * rowHeight };
    });
    layout.pixels = { height, gap, rowHeight, spans };
    return layout.pixels;
  }

  // The rows drawn once per presentation at the canvas's resolution; spikes
  // are multiplied in, so rows thinner than a pixel still show theirs.
  function rfRasterImage(layout, width, height) {
    if (layout.image && layout.image.width === width && layout.image.height === height) return layout.image;
    const meta = state.rfMeta;
    const { rowHeight, spans } = rfBlockPixels(layout, height);
    const image = document.createElement("canvas");
    image.width = width;
    image.height = height;
    const context = image.getContext("2d");
    context.fillStyle = "#cbd5e1";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#ffffff";
    for (const span of spans) context.fillRect(0, span.y0, width, span.y1 - span.y0);
    const tick = rowHeight >= 2.5 ? rowHeight * 0.7 : rowHeight;
    context.imageSmoothingEnabled = rowHeight < 1;
    context.globalCompositeOperation = "multiply";
    const [column, top] = layout.record.at;
    layout.blocks.forEach((block, index) => {
      for (let row = block.start; row < block.end; row += 1) {
        context.drawImage(
          state.images.rfRasters,
          column * meta.rasterWidth,
          top + layout.rows[row],
          meta.rasterWidth,
          1,
          0,
          spans[index].y0 + (row - block.start) * rowHeight,
          width,
          Math.max(tick, 0.5),
        );
      }
    });
    layout.image = image;
    return image;
  }

  // The field (entry in this step) whose block is at this height of the
  // raster (0 top, 1 bottom), or -1 if that field is not decodable in this step.
  function rfEntryAtRasterY(current, fraction) {
    const layout = rfRasterLayout(current);
    if (!layout || !layout.rows.length) return -1;
    const height = canvases.raster.height;
    const { gap, spans } = rfBlockPixels(layout, height);
    const y = fraction * height;
    const index = spans.findIndex((span) => y >= span.y0 - gap / 2 && y < span.y1 + gap / 2);
    if (index < 0) return -1;
    const gid = layout.blocks[index].gid;
    const [from, to] = rfRange(current);
    for (let entry = from; entry < to; entry += 1) if (state.rfMeta.gid[entry] === gid) return entry;
    return -1;
  }

  // Fields are numbered top to bottom, as their squares and blocks lie.
  function rfFieldRank(current, entry) {
    const layout = rfRasterLayout(current);
    const [from, to] = rfRange(current);
    const decodable = new Set();
    for (let item = from; item < to; item += 1) decodable.add(state.rfMeta.gid[item]);
    const order = (layout?.blocks ?? []).map((block) => block.gid).filter((gid) => decodable.has(gid));
    const rank = order.indexOf(state.rfMeta.gid[entry]);
    return rank >= 0 ? rank + 1 : entry - from + 1;
  }

  function drawRfRaster(current, entry) {
    const canvas = canvases.raster;
    const context = clearCanvas(canvas, "#f8fafc");
    const meta = state.rfMeta;
    const layout = rfRasterLayout(current);
    if (!layout) {
      rasterCells.textContent = "— cells";
      rasterDuration.textContent = "—";
      return;
    }
    const { record } = layout;
    if (!layout.rows.length) {
      context.fillStyle = "#64748b";
      context.font = "15px system-ui, sans-serif";
      context.textAlign = "center";
      context.textBaseline = "middle";
      context.fillText("No receptive field the ridge can decode in this presentation", canvas.width / 2, canvas.height / 2);
      rasterCells.textContent = "0 cells";
      rasterDuration.textContent = `${((record.bins * meta.binMilliseconds) / 1000).toFixed(1)} s`;
      return;
    }
    context.save();
    context.globalCompositeOperation = "multiply";
    context.drawImage(rfRasterImage(layout, canvas.width, canvas.height), 0, 0);
    context.restore();
    const { spans } = rfBlockPixels(layout, canvas.height);
    const decodable = new Map();
    const [from, to] = rfRange(current);
    for (let item = from; item < to; item += 1) decodable.set(meta.gid[item], item);
    const chosenGid = entry >= 0 ? meta.gid[entry] : null;
    const hoverGid = state.rfHover >= from && state.rfHover < to ? meta.gid[state.rfHover] : null;
    layout.blocks.forEach((block, index) => {
      const y = spans[index].y0;
      const h = spans[index].y1 - y;
      if (block.gid === chosenGid) {
        context.fillStyle = "rgba(245, 158, 11, 0.3)";
        context.fillRect(0, y, canvas.width, h);
        context.fillStyle = "#d97706";
        context.fillRect(0, y, 6, h);
      } else if (!decodable.has(block.gid)) {
        // Not decodable in this window (off screen, on the target, or too few
        // spikes observed): no square for it in the scene right now.
        context.fillStyle = "rgba(248, 250, 252, 0.62)";
        context.fillRect(0, y, canvas.width, h);
      }
      if (block.gid === hoverGid && block.gid !== chosenGid) {
        context.strokeStyle = "#d97706";
        context.lineWidth = 2;
        context.setLineDash([5, 4]);
        context.strokeRect(1, y + 1, canvas.width - 2, Math.max(2, h - 2));
        context.setLineDash([]);
      }
    });
    const x0 = (meta.window[current * 2] / record.bins) * canvas.width;
    const x1 = (meta.window[current * 2 + 1] / record.bins) * canvas.width;
    context.fillStyle = "rgba(37, 99, 235, 0.16)";
    context.fillRect(x0, 0, Math.max(2, x1 - x0), canvas.height);
    context.strokeStyle = "#2563eb";
    context.lineWidth = 3;
    context.strokeRect(x0, 1.5, Math.max(2, x1 - x0), canvas.height - 3);
    rasterCells.textContent = `${record.cells.toLocaleString()} cells`;
    rasterDuration.textContent = `${((record.bins * meta.binMilliseconds) / 1000).toFixed(1)} s`;
  }

  function drawRfPatch(current) {
    const truthCanvas = canvases.groundTruthPatch;
    const truthContext = clearCanvas(truthCanvas, "#808080");
    const decodedCanvas = canvases.patch;
    const decodedContext = clearCanvas(decodedCanvas, "#808080");
    truthContext.imageSmoothingEnabled = false;
    decodedContext.imageSmoothingEnabled = false;
    const meta = state.rfMeta;
    if (!meta || !state.rfDecoder || !state.rfCounts || !state.images?.rfRasters) {
      drawRfRaster(-1, -1);
      patchFixation.textContent = state.patchPromise ? "Loading the decoders…" : "Patch decoder unavailable";
      return;
    }
    if (current < 0) {
      drawRfRaster(-1, -1);
      patchFixation.textContent = "Play, or click a receptive field in the scene";
      return;
    }
    const entry = rfCurrentEntry(current);
    drawRfRaster(current, entry);
    const [from, to] = rfRange(current);
    if (entry < 0) {
      patchFixation.textContent = `Window ${(current + 1).toLocaleString()} · no receptive field the ridge can decode in this window`;
      return;
    }
    const pixels = rfDecode(current, entry);
    if (pixels) {
      if (!state.rfScratch) {
        state.rfScratch = document.createElement("canvas");
        state.rfScratch.width = meta.patchSize;
        state.rfScratch.height = meta.patchSize;
      }
      state.rfScratch.getContext("2d").putImageData(new ImageData(pixels, meta.patchSize, meta.patchSize), 0, 0);
      decodedContext.drawImage(state.rfScratch, 0, 0, decodedCanvas.width, decodedCanvas.height);
    }
    const side = meta.sidePixels;
    const scaleX = state.images.original.naturalWidth / FULL_W;
    const scaleY = state.images.original.naturalHeight / FULL_H;
    truthContext.drawImage(
      state.images.original,
      (meta.x[entry] / 10 - side / 2) * scaleX,
      (meta.y[entry] / 10 - side / 2) * scaleY,
      side * scaleX,
      side * scaleY,
      0,
      0,
      truthCanvas.width,
      truthCanvas.height,
    );
    const field = rfField(current, entry);
    patchFixation.textContent =
      `Window ${(current + 1).toLocaleString()} · receptive field ${rfFieldRank(current, entry)} of ${to - from} from the top: ` +
      `${meta.spikes[entry].toLocaleString()} spikes from ${(field?.members.length ?? 0).toLocaleString()} cells ` +
      `(shaded block) · click another square in the scene, or another block in the raster`;
  }

  function drawPatch(current) {
    if (isLgn()) {
      drawRfPatch(current);
      return;
    }
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
      const scaleX = state.images.original.naturalWidth / FULL_W;
      const scaleY = state.images.original.naturalHeight / FULL_H;
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

  const rfDecoderCache = new Map();

  function loadRfDecoder(animal, fold) {
    const key = `${animal}:${fold}`;
    if (!rfDecoderCache.has(key)) {
      const base = `${dataRoot(animal)}/rf-decoders-f${fold}`;
      const promise = Promise.all([
        fetch(`${base}.json?v=${DATA_VERSION}`).then((response) => {
          if (!response.ok) throw new Error(`Decoder index returned ${response.status}`);
          return response.json();
        }),
        fetch(`${base}.bin?v=${DATA_VERSION}`).then((response) => {
          if (!response.ok) throw new Error(`Decoders returned ${response.status}`);
          return response.arrayBuffer();
        }),
        fetch(`${base}.f64.bin?v=${DATA_VERSION}`).then((response) => {
          if (!response.ok) throw new Error(`Decoders returned ${response.status}`);
          return response.arrayBuffer();
        }),
      ]).then(([index, buffer, buffer64]) => {
        const fields = new Map();
        for (const [session, list] of Object.entries(index.sessions)) {
          for (const field of list) fields.set(`${session}:${field.gid}`, field);
        }
        return {
          fields,
          data32: new Float32Array(buffer),
          data64: new Float64Array(buffer64),
          log1p: Float64Array.from(index.log1p),
        };
      });
      promise.catch(() => rfDecoderCache.delete(key));
      rfDecoderCache.set(key, promise);
    }
    return rfDecoderCache.get(key);
  }

  function loadRfCounts(path, width, height) {
    return loadImage(path).then((image) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      context.drawImage(image, 0, 0);
      const rgba = context.getImageData(0, 0, width, height).data;
      const counts = new Uint8Array(width * height);
      for (let index = 0; index < counts.length; index += 1) counts[index] = rgba[index * 4];
      return counts;
    });
  }

  function ensureRfPatches() {
    if (!state.images || !state.assetPaths?.rfSteps) return Promise.resolve();
    if (state.rfMeta && state.rfDecoder && state.rfCounts && state.images.rfRasters) {
      drawRfPatch(state.count - 1);
      return Promise.resolve();
    }
    if (state.patchPromise) return state.patchPromise;
    const token = state.loadToken;
    const animal = state.animal;
    patchFixation.textContent = "Loading the decoders…";
    state.patchPromise = fetch(`${state.assetPaths.rfSteps}?v=${DATA_VERSION}`)
      .then((response) => {
        if (!response.ok) throw new Error(`Patch metadata returned ${response.status}`);
        return response.json();
      })
      .then((meta) =>
        Promise.all([
          meta,
          loadRfDecoder(animal, meta.fold),
          loadRfCounts(`${state.assetPaths.rfCounts}?v=${DATA_VERSION}`, meta.units, meta.steps),
          loadImage(`${state.assetPaths.rfRasters}?v=${DATA_VERSION}`),
        ]),
      )
      .then(([meta, decoder, counts, rasters]) => {
        if (token !== state.loadToken || !state.images) return;
        state.rfMeta = meta;
        state.rfDecoder = decoder;
        state.rfCounts = counts;
        state.images.rfRasters = rasters;
        state.patchPromise = null;
        paint();
      })
      .catch((error) => {
        console.error(error);
        if (token === state.loadToken) patchFixation.textContent = "Patch decoder unavailable";
      })
      .finally(() => {
        if (token === state.loadToken) state.patchPromise = null;
      });
    return state.patchPromise;
  }

  function ensurePatchImage() {
    if (isLgn()) return ensureRfPatches();
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
    // LGN outlines the decoded receptive field in the scene while the drawer is open.
    if (isLgn() && state.images) paint();
    if (!show) return;
    drawPatch(state.count - 1);
    ensurePatchImage();
    if (scroll) {
      requestAnimationFrame(() => {
        patchDrawer.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    }
  }

  // The replay video may be drawn only while it rests on the requested fixation:
  // mid-seek it still holds the previous frame, which can be thousands of
  // fixations earlier (a barely started reconstruction) after a long scrub.
  function replayFrameReady() {
    return (
      state.videoReady && !state.videoSeeking && !replayVideo.seeking && replayVideo.readyState >= 2
    );
  }

  // A paused video's `seeked` can fire before the decoder presents the new frame
  // (Safari, and Chromium with hardware decoding), so drawImage at `seeked` may
  // still return the old one. Repaint once the frame is actually presented
  // (requestVideoFrameCallback), and again shortly after as a fallback, so a
  // stale frame never stays on screen.
  function confirmReplayFrame() {
    const count = state.count;
    const scene = state.scene;
    const repaint = () => {
      if (state.scene === scene && state.count === count && replayFrameReady()) paint();
    };
    if (replayVideo.requestVideoFrameCallback) {
      if (state.confirmFrameHandle && replayVideo.cancelVideoFrameCallback) {
        replayVideo.cancelVideoFrameCallback(state.confirmFrameHandle);
      }
      state.confirmFrameHandle = replayVideo.requestVideoFrameCallback(() => {
        state.confirmFrameHandle = 0;
        repaint();
      });
    }
    window.clearTimeout(state.confirmFrameTimer);
    state.confirmFrameTimer = window.setTimeout(() => {
      if (!state.playing) repaint();
    }, 200);
  }

  function paint() {
    if (!state.scene || !state.images) return;
    const current = state.count - 1;
    const lgn = isLgn();
    drawTruth(current);
    if (!lgn) {
      let evidenceContext;
      if (replayFrameReady()) {
        evidenceContext = drawReplaySlice(canvases.evidence, 1);
        drawReplaySlice(canvases.posterior, 2);
      } else {
        const frameIndex = frameIndexForCount(state.count);
        evidenceContext = drawSprite(canvases.evidence, state.images.evidence, frameIndex);
        drawSprite(canvases.posterior, state.images.posterior, frameIndex);
      }
      if (current >= 0) drawPatchWindow(evidenceContext, current);
    } else if (state.images.mosaic) {
      const mosaicContext = drawModel("mosaic", canvases.evidence);
      drawModel("ridge", canvases.posterior);
      if (current >= 0) drawLgnTiles(mosaicContext, current, state.scene.ridgePatchDegrees);
    } else {
      clearCanvas(canvases.evidence);
      clearCanvas(canvases.posterior);
    }
    drawModel("transformer");
    drawModel("diffusion");
    if (!densityPanel.hidden) drawDensity(current);

    if (current >= 0) {
      const sessionIndex = state.scene.session[current];
      dateLabel.textContent = state.scene.dates[sessionIndex];
      // rasterTrial and sessionCells arrive with the trial rasters (V1);
      // LGN steps carry their presentation index directly.
      const presentation = lgn ? state.scene.presentation[current] : state.scene.rasterTrial?.[current];
      trialLabel.textContent =
        presentation == null ? "Presentation —" : `Presentation ${(presentation + 1).toLocaleString()}`;
      const sessionCellCount = state.scene.sessionCells?.[sessionIndex];
      sessionCells.textContent =
        sessionCellCount == null ? "— cells" : `${sessionCellCount.toLocaleString()} cells`;
    } else {
      dateLabel.textContent = "—";
      trialLabel.textContent = "Presentation —";
      sessionCells.textContent = "— cells";
    }

    if (!patchDrawer.hidden) drawPatch(current);
    if (!langevinPanel.hidden) syncLangevin();
    drawFidelity();
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
      // currentTime already reports a seek's target while it is under way, so
      // "already there" also needs the video to have finished seeking.
      if (!replayVideo.seeking && Math.abs(replayVideo.currentTime - target) < 0.0005) {
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
    const blob = await readWithProgress(response, token);
    if (token !== state.loadToken) return;
    state.replayAbort = null;
    state.replayObjectUrl = URL.createObjectURL(blob);
    replayVideo.src = state.replayObjectUrl;
    replayVideo.load();
    await waitForVideo("loadeddata");
    if (token !== state.loadToken) return;
    state.videoReady = true;
    replayVideo.playbackRate = state.speed;
    // Seek to where the viewer is now: the scrubber may have moved while the
    // replay downloaded (the sprites drew those positions meanwhile).
    const target = state.scene ? state.count : count;
    state.pendingSeekCount = target;
    const seeked = waitForVideo("seeked");
    replayVideo.currentTime = target / state.scene.replayFps + 0.0001;
    await seeked;
    if (token !== state.loadToken) return;
    // A later seek (the viewer scrubbing) clears this in its own `seeked`.
    if (!replayVideo.seeking) state.videoSeeking = false;
  }

  async function readWithProgress(response, token) {
    const expected = Number(response.headers.get("content-length")) || 0;
    if (!expected || !response.body?.getReader) return response.blob();
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    const started = performance.now();
    setLoadProgress(0);
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      if (token !== state.loadToken) {
        reader.cancel().catch(() => undefined);
        break;
      }
      const elapsed = (performance.now() - started) / 1000;
      const rate = elapsed > 0.15 ? received / elapsed : 0;
      setLoadProgress(received / expected, rate > 0 ? (expected - received) / rate : undefined);
    }
    return new Blob(chunks, { type: response.headers.get("content-type") || "video/mp4" });
  }

  function releaseReplay() {
    setLoadProgress(null);
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
      const dataPath = `${dataRoot()}/${record.data}`;
      const response = await fetch(`${dataPath}?v=${DATA_VERSION}`);
      if (!response.ok) throw new Error(`Scene metadata returned ${response.status}`);
      const scene = await response.json();
      const paths = imagePaths(scene, dataPath);
      const names = isLgn(scene)
        ? ["original", "transformer", "diffusion"]
        : ["original", "evidence", "posterior", "transformer", "diffusion"];
      const extras = isLgn(scene)
        ? ["mosaic", "ridge", "transformerPrefix", "diffusionPrefix", "mosaicPrefix", "ridgePrefix"]
        : ["transformerPrefix", "diffusionPrefix"];
      for (const name of extras) if (paths[name]) names.push(name);
      const loaded = await Promise.all(names.map((name) => loadImage(paths[name])));
      if (token !== state.loadToken) return;
      state.scene = scene;
      state.rf = null;
      prepareViewingTimeline(scene);
      state.images = Object.fromEntries(names.map((name, index) => [name, loaded[index]]));
      state.assetPaths = paths;
      state.patchPromise = null;
      state.rfMeta = null;
      state.rfCounts = null;
      state.rfDecoder = null;
      state.rfChoice = null;
      state.rfHover = -1;
      applySceneGeometry(scene);
      applyView(scene);
      applyRebuildState(scene);
      applyMode(scene);
      const minutes = scene.recordingSeconds / 60;
      const cells = Number(scene.totalCells);
      sceneData.textContent = isLgn(scene)
        ? `${animalLabel()} · ${scene.dates.length.toLocaleString()} sessions` +
          ` · ${minutes.toFixed(1)} min viewing` +
          ` · ${scene.presentationCount.toLocaleString()} presentations`
        : `${animalLabel()} · ${scene.dates.length.toLocaleString()} sessions` +
          (minutes ? ` · ${minutes.toFixed(1)} min free viewing` : "") +
          (cells ? ` · ${cells.toLocaleString()} cells` : "") +
          ` · ${scene.total.toLocaleString()} fixations`;
      timeline.max = String(scene.total);
      state.count = scene.total;
      state.fractionalCount = scene.total;
      viewerTitle.textContent = record.title;

      paint();
      if (paths.replay) {
        // A replay that will not decode must not take the scene down with it: the
        // checkpoint sprites render the same reconstruction, just coarser.
        try {
          await loadReplay(paths.replay, scene.total, token);
        } catch (error) {
          console.error(error);
          releaseReplay();
          state.videoReady = false;
          state.videoSeeking = false;
          replayPending.hidden = false;
          replayPending.textContent =
            `This browser could not play the per-fixation replay, so the decoded patches and the 1/f ` +
            `reconstruction step through ${scene.frameCounts?.length ?? 28} checkpoints instead.`;
        }
      }
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
    const records = [...manifest.scenes].sort(
      (a, b) => (rank.get(a.slug) ?? 999) - (rank.get(b.slug) ?? 999),
    );
    records.forEach((record) => {
      const button = document.createElement("button");
      button.className = "scene-card";
      button.type = "button";
      button.role = "option";
      button.dataset.slug = record.slug;
      button.setAttribute("aria-selected", "false");
      button.setAttribute(
        "aria-label",
        `${record.title}: photograph and diffusion reconstruction`,
      );

      const image = document.createElement("img");
      image.src = `${dataRoot()}/${record.thumb}`;
      image.alt = "";
      image.width = 600;
      image.height = 200;
      image.loading = "lazy";
      image.decoding = "async";

      const label = document.createElement("span");
      label.textContent = record.title;
      button.append(image, label);
      button.addEventListener("click", () => selectScene(record, { focusViewer: true }));
      fragment.append(button);
    });
    grid.replaceChildren(fragment);
    sceneCount.textContent =
      `${records.length} scenes · photograph | diffusion reconstruction`;
    updateSceneToggle();
  }

  // Two rows of scenes unless the reader asks for all of them; the choice
  // holds across monkeys. Collapsing scrolls the scenes back into view so the
  // page does not jump past them.
  function sceneColumns() {
    const columns = getComputedStyle(grid).gridTemplateColumns.split(" ").filter(Boolean).length;
    return Math.max(1, columns);
  }

  function updateSceneToggle() {
    const total = grid.querySelectorAll(".scene-card").length;
    const expanded = !grid.classList.contains("is-collapsed");
    sceneToggle.hidden = total <= 2 * sceneColumns();
    sceneToggle.setAttribute("aria-expanded", String(expanded));
    const noun = isLivingstone() && liv.mode === "faces" ? "faces" : "scenes";
    sceneToggle.textContent = expanded ? "Show less" : `Show all ${total} ${noun}`;
  }

  sceneToggle.addEventListener("click", () => {
    const collapse = !grid.classList.contains("is-collapsed");
    grid.classList.toggle("is-collapsed", collapse);
    updateSceneToggle();
    if (collapse) {
      const heading = document.querySelector(".scene-picker");
      if (heading.getBoundingClientRect().top < 0) heading.scrollIntoView({ block: "start" });
    }
  });

  window.addEventListener("resize", updateSceneToggle);

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
  canvases.truth.addEventListener("pointermove", (event) => {
    if (!isLgn() || !rfFieldsShown()) return;
    const [x, y] = viewPoint(canvases.truth, event);
    const hover = rfEntryAtPoint(state.count - 1, x, y);
    canvases.truth.classList.toggle("over-field", hover >= 0);
    setRfHover(hover);
  });
  canvases.truth.addEventListener("pointerleave", () => {
    canvases.truth.classList.remove("over-field");
    setRfHover(-1);
  });

  // Hovering a square outlines its block in the raster, and hovering a block
  // outlines its square in the scene.
  function setRfHover(entry) {
    if (entry === state.rfHover) return;
    state.rfHover = entry;
    if (!state.scene || !isLgn()) return;
    const current = state.count - 1;
    drawTruth(current);
    if (!patchDrawer.hidden && state.rfMeta) drawRfRaster(current, rfCurrentEntry(current));
  }

  // LGN: a click on a field's block of rows selects that field.
  function rfEntryAtRasterRow(event) {
    if (!state.rfMeta) return -1;
    const bounds = canvases.raster.getBoundingClientRect();
    if (!bounds.height) return -1;
    return rfEntryAtRasterY(state.count - 1, (event.clientY - bounds.top) / bounds.height);
  }

  canvases.raster.addEventListener("pointermove", (event) => {
    if (!isLgn()) return;
    const entry = rfEntryAtRasterRow(event);
    canvases.raster.classList.toggle("over-field", entry >= 0);
    setRfHover(entry);
  });
  canvases.raster.addEventListener("pointerleave", () => {
    canvases.raster.classList.remove("over-field");
    if (isLgn()) setRfHover(-1);
  });
  canvases.raster.addEventListener("click", (event) => {
    if (!isLgn() || !state.rfMeta) return;
    const entry = rfEntryAtRasterRow(event);
    if (entry < 0) return;
    setPlaying(false);
    rfChoose(state.count - 1, entry);
    paint();
  });
  canvases.truth.addEventListener("pointerleave", hideSceneMagnifier);

  canvases.truth.addEventListener("click", async (event) => {
    if (!state.scene || viewer.getAttribute("aria-busy") === "true") return;
    const selectedScene = state.scene;
    const [x, y] = viewPoint(canvases.truth, event);
    if (isLgn(selectedScene)) {
      if (!selectedScene.assets?.rfSteps) return;
      setPlaying(false);
      await ensureRfPatches();
      if (state.scene !== selectedScene || !state.rfMeta) return;
      const current = state.count - 1;
      const here = rfEntryAtPoint(current, x, y);
      if (here >= 0) {
        rfChoose(current, here);
      } else {
        const step = bestRfStepAtPoint(x, y);
        if (step < 0) return;
        await setCount(step + 1);
        rfChoose(step, rfDefaultEntry(step));
      }
      if (patchDrawer.hidden) setPatchDrawerVisible(true, { scroll: true });
      else paint();
      return;
    }
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
    // An earlier seek finished after a newer one started: the video does not
    // hold the requested frame yet, and the newer seek's `seeked` will paint.
    if (replayVideo.seeking) return;
    const next = state.pendingSeekCount ?? Math.round(replayVideo.currentTime * state.scene.replayFps);
    state.pendingSeekCount = null;
    state.count = Math.max(0, Math.min(state.scene.total, next));
    state.fractionalCount = state.count;
    state.videoSeeking = false;
    paint();
    confirmReplayFrame();
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

  langevinToggle.addEventListener("click", () => {
    setLangevinVisible(langevinPanel.hidden, { scroll: true });
  });

  langevinRun.addEventListener("click", () => {
    setLangevinRunning(!state.langevin.running);
  });

  langevinReset.addEventListener("click", () => {
    syncLangevin({ force: true });
    if (state.langevin.worker) state.langevin.worker.postMessage({ type: "reset" });
  });

  langevinEta.addEventListener("input", () => {
    langevinEtaValue.textContent = Number(langevinEta.value).toFixed(3);
    if (state.langevin.worker) {
      state.langevin.worker.postMessage({ type: "params", params: langevinParams() });
    }
  });

  langevinTemperature.addEventListener("input", () => {
    langevinTemperatureValue.textContent = Number(langevinTemperature.value).toFixed(2);
    if (state.langevin.worker) {
      state.langevin.worker.postMessage({ type: "params", params: langevinParams() });
    }
  });

  langevinSnr.addEventListener("input", () => {
    langevinSnrValue.textContent = Number(langevinSnr.value).toFixed(1);
    if (state.langevin.worker) {
      state.langevin.worker.postMessage({ type: "params", params: langevinParams() });
    }
  });

  fidelityToggle.addEventListener("click", () => {
    setFidelityVisible(fidelityPanel.hidden, { scroll: true });
  });

  fidelityMetric.addEventListener("change", () => {
    state.fidelityMetric = fidelityMetric.value;
    drawFidelity();
  });

  canvases.fidelity.addEventListener("click", (event) => {
    if (!fidelityAvailable() || viewer.getAttribute("aria-busy") === "true") return;
    const bounds = canvases.fidelity.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / bounds.width) * FIDELITY_VIEW.width;
    const plot = fidelityGeometry();
    const fraction = (x - plot.left) / (plot.right - plot.left);
    setPlaying(false);
    setCount(Math.max(0, Math.min(state.scene.total, Math.round(fraction * state.scene.total))));
  });

  densityToggle.addEventListener("click", () => {
    const show = densityPanel.hidden;
    densityPanel.hidden = !show;
    updatePanelColumns();
    densityToggle.setAttribute("aria-pressed", String(show));
    densityToggle.textContent = show ? "Hide receptive field density" : "Show receptive field density";
    if (show) paint();
  });

  document.addEventListener("keydown", (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    if (isLivingstone()) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (event.target instanceof Element && event.target.closest("select, option")) return;
    event.preventDefault();
    if (!event.repeat) startArrowHold(event.key === "ArrowRight" ? 1 : -1);
  });

  document.addEventListener("keyup", (event) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    stopArrowHold();
  });

  // Only the backing-store resolution depends on window size; the plot layout
  // is fixed in virtual coordinates, so this cannot reflow the chart.
  let fidelityResizeTimer = 0;
  window.addEventListener("resize", () => {
    window.clearTimeout(fidelityResizeTimer);
    fidelityResizeTimer = window.setTimeout(drawFidelity, 120);
  });

  window.addEventListener("blur", stopArrowHold);
  window.addEventListener("pagehide", () => {
    stopArrowHold();
    releaseReplay();
    if (state.langevin.worker) state.langevin.worker.terminate();
    state.langevin.worker = null;
    state.langevin.token = -1;
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      setPlaying(false);
      if (state.langevin.running) setLangevinRunning(false);
    } else if (!langevinPanel.hidden && !state.langevin.running) {
      setLangevinRunning(true);
    }
  });

  async function loadAnimalManifest(animal) {
    if (state.animalManifests.has(animal)) return state.animalManifests.get(animal);
    const response = await fetch(`${dataRoot(animal)}/manifest.json?v=${DATA_VERSION}`);
    if (!response.ok) throw new Error(`Manifest returned ${response.status}`);
    const manifest = await response.json();
    state.animalManifests.set(animal, manifest);
    return manifest;
  }

  function animalSummary(manifest, animal) {
    if (!manifest) return "";
    if (animal === LIVINGSTONE) return livSummary(manifest);
    const parts = [];
    const kind = ANIMALS.find((entry) => entry.id === animal)?.kind;
    if (kind) parts.push(kind);
    if (manifest.sessions) parts.push(`${manifest.sessions} sessions`);
    parts.push(`${manifest.sceneCount ?? manifest.scenes.length} scenes`);
    return parts.join(" · ");
  }

  function buildAnimalPicker() {
    const fragment = document.createDocumentFragment();
    ANIMALS.forEach((animal) => {
      const button = document.createElement("button");
      button.className = "animal-card";
      button.type = "button";
      button.role = "radio";
      button.dataset.animal = animal.id;
      const name = document.createElement("span");
      name.className = "animal-name";
      name.textContent = animal.label;
      const stats = document.createElement("span");
      stats.className = "animal-stats";
      stats.textContent = animalSummary(state.animalManifests.get(animal.id), animal.id) || "—";
      button.append(name, stats);
      button.addEventListener("click", () => selectAnimal(animal.id));
      fragment.append(button);
    });
    animalGrid.replaceChildren(fragment);
    markAnimal();
  }

  const animalNote = document.querySelector("#animal-note");
  const ANIMAL_NOTE = animalNote.textContent;

  function markAnimal() {
    animalNote.textContent =
      ANIMAL_NOTE +
      (state.animal === "monkey-c"
        ? " Monkey C saw an earlier color rendering of the photographs, so they look warmer."
        : state.animal === LIVINGSTONE
          ? " The Livingstone data (Xiao et al., 2024; DANDI 000628) are 13 macaques recorded from V1 to inferotemporal cortex while they " +
            "freely viewed pictures; about 86% of the recorded population is in central and anterior IT, and V1 and V2 together are 2.4%."
          : "");
    animalGrid.querySelectorAll(".animal-card").forEach((card) => {
      const selected = card.dataset.animal === state.animal;
      card.classList.toggle("is-selected", selected);
      card.setAttribute("aria-checked", String(selected));
      const stats = card.querySelector(".animal-stats");
      const summary = animalSummary(state.animalManifests.get(card.dataset.animal), card.dataset.animal);
      if (summary) stats.textContent = summary;
    });
  }

  // Livingstone data (Xiao et al., 2024): 13 macaques, V1 to inferotemporal
  // cortex. A slimmer viewer: the picture and its diffusion reconstruction,
  // which grows with the share of the picture's fixations decoded (1, 3, 10,
  // 30 and 100%); "Faces only" shows face crops and their decoded faces.
  // Data: data/livingstone/manifest.json (summary, modes.full, modes.faces).
  const LIVINGSTONE = "livingstone";
  const livViewer = document.querySelector("#liv-viewer");
  const livKicker = document.querySelector("#liv-kicker");
  const livTitle = document.querySelector("#liv-title");
  const livMeta = document.querySelector("#liv-meta");
  const livOriginal = document.querySelector("#liv-original");
  const livDecoded = document.querySelector("#liv-decoded");
  const livOriginalTitle = document.querySelector("#liv-original-title");
  const livFrameNote = document.querySelector("#liv-frame-note");
  const livTransport = document.querySelector("#liv-transport");
  const livPlay = document.querySelector("#liv-play");
  const livTimeline = document.querySelector("#liv-timeline");
  const livShare = document.querySelector("#liv-progress-share");
  const livTime = document.querySelector("#liv-progress-time");
  const livTimeLabel = document.querySelector("#liv-progress-label");
  const livNote = document.querySelector("#liv-note");
  const livPanels = document.querySelector(".liv-panels");
  const livMapCanvases = [...document.querySelectorAll(".liv-map")];
  // Inferno, as the paper's maps: decoded read-out on a fixed 0 to 1 scale.
  const LIV_MAP_STOPS = [
    [0, 0, 4], [40, 11, 84], [101, 21, 110], [159, 42, 99],
    [212, 72, 66], [245, 125, 21], [250, 193, 39], [252, 255, 164],
  ];
  const sceneMode = document.querySelector("#scene-mode");
  const LIV_PLAY_SECONDS = 10;
  const LIV_NOTES = {
    full:
      "Held out: no decoder saw the picture it reconstructs. The frames are decoded from 1%, 3%, 10% and 30% of the fixations on " +
      "the picture, pooled across monkeys and sessions, by an earlier decoder; the last frame is our current best decoder, using all of them. " +
      "The maps are the decoded features' read-out of people, faces (human or monkey) and monkeys, on a fixed 0 to 1 scale.",
    // No caption for faces (user, 11-26: "get rid of this").
    faces: "",
  };
  const liv = {
    mode: "full", record: null, original: null, frames: null, maps: null, dim: null, tile: null,
    position: 1, playing: false, frame: 0, token: 0,
  };

  function isLivingstone() {
    return state.animal === LIVINGSTONE;
  }

  function livSummary(manifest) {
    const summary = manifest?.summary;
    if (!summary) return "";
    return (
      `${summary.monkeys} macaques · ${summary.sessions.toLocaleString()} sessions · ` +
      `${summary.areas.join(", ")} · ${summary.pictures.toLocaleString()} pictures`
    );
  }

  function livRecords() {
    return state.manifest?.modes?.[liv.mode]?.scenes ?? [];
  }

  function livPercent(share) {
    if (share >= 1) return "all";
    const percent = share * 100;
    return `${percent < 10 ? percent.toFixed(1).replace(/\.0$/, "") : Math.round(percent)}%`;
  }

  function buildLivGrid() {
    const records = livRecords();
    const faces = liv.mode === "faces";
    const fragment = document.createDocumentFragment();
    records.forEach((record) => {
      const button = document.createElement("button");
      button.className = "scene-card";
      button.type = "button";
      button.role = "option";
      button.dataset.slug = record.slug;
      button.setAttribute("aria-selected", "false");
      button.setAttribute(
        "aria-label",
        faces ? `Face ${record.rank}: face and decoded face` : `Picture ${record.rank}: picture and diffusion reconstruction`,
      );
      const image = document.createElement("img");
      image.src = `${dataRoot()}/${record.thumb}?v=${DATA_VERSION}`;
      image.alt = "";
      image.width = 400;
      image.height = 200;
      image.loading = "lazy";
      image.decoding = "async";
      const label = document.createElement("span");
      label.textContent = faces
        ? `#${record.rank} · ${record.fixations.toLocaleString()} fixations`
        : `#${record.rank} · ${formatViewingTime(record.viewingSeconds)} viewed`;
      button.append(image, label);
      button.addEventListener("click", () => selectLivScene(record, { focusViewer: true }));
      fragment.append(button);
    });
    grid.classList.add("is-square-pairs");
    grid.replaceChildren(fragment);
    sceneCount.textContent = faces
      ? `${records.length} most-viewed faces, one per photograph · face | decoded face`
      : `${records.length} most-viewed pictures · picture | diffusion reconstruction`;
    sceneMode.querySelectorAll("button").forEach((button) => {
      button.setAttribute("aria-pressed", String(button.dataset.mode === liv.mode));
    });
    updateSceneToggle();
  }

  function livDrawFrame(context, index, alpha) {
    const size = liv.frames.height;
    context.globalAlpha = Math.max(0, Math.min(1, alpha));
    context.drawImage(liv.frames, index * size, 0, size, size, 0, 0, livDecoded.width, livDecoded.height);
    context.globalAlpha = 1;
  }

  // maps.png: 80 x 48 greyscale; columns = the 5 frames x 16 cells, rows =
  // people, faces, monkeys x 16 cells; value / 255 = the class read-out.
  function livReadMaps(image) {
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, image.width, image.height).data;
    const frames = image.width / 16;
    return [0, 1, 2].map((row) =>
      Array.from({ length: frames }, (_, frame) => {
        const values = new Float32Array(256);
        for (let y = 0; y < 16; y += 1) {
          for (let x = 0; x < 16; x += 1) {
            values[y * 16 + x] = pixels[((row * 16 + y) * image.width + frame * 16 + x) * 4] / 255;
          }
        }
        return values;
      }),
    );
  }

  // The picture in grey, dimmed, under each map.
  function livDimmed(image, size) {
    const canvas = document.createElement("canvas");
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    context.drawImage(image, 0, 0, size, size);
    const data = context.getImageData(0, 0, size, size);
    const pixels = data.data;
    for (let index = 0; index < pixels.length; index += 4) {
      const grey = 0.35 * (0.299 * pixels[index] + 0.587 * pixels[index + 1] + 0.114 * pixels[index + 2]);
      pixels[index] = grey;
      pixels[index + 1] = grey;
      pixels[index + 2] = grey;
    }
    context.putImageData(data, 0, 0);
    return canvas;
  }

  function livMapColor(value) {
    const x = Math.max(0, Math.min(1, value)) * (LIV_MAP_STOPS.length - 1);
    const i = Math.min(Math.floor(x), LIV_MAP_STOPS.length - 2);
    const t = x - i;
    return LIV_MAP_STOPS[i].map((channel, k) => channel * (1 - t) + LIV_MAP_STOPS[i + 1][k] * t);
  }

  function livDrawMap(canvas, values) {
    const context = canvas.getContext("2d");
    context.drawImage(liv.dim, 0, 0, canvas.width, canvas.height);
    if (!liv.tile) {
      liv.tile = document.createElement("canvas");
      liv.tile.width = 16;
      liv.tile.height = 16;
    }
    const tileContext = liv.tile.getContext("2d");
    const image = tileContext.createImageData(16, 16);
    for (let cell = 0; cell < 256; cell += 1) {
      const value = Math.max(0, Math.min(1, values[cell]));
      const [r, g, b] = livMapColor(value);
      image.data[cell * 4] = r;
      image.data[cell * 4 + 1] = g;
      image.data[cell * 4 + 2] = b;
      image.data[cell * 4 + 3] = Math.round(255 * value);
    }
    tileContext.putImageData(image, 0, 0);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(liv.tile, 0, 0, canvas.width, canvas.height);
  }

  // Frames are exact at their share of the fixations and cross-fade in between;
  // before the first one the panel fades in from neutral grey, as the other
  // monkeys' model panels do.
  function livPaint() {
    const record = liv.record;
    if (!record || !liv.original || !liv.frames) return;
    livOriginal.getContext("2d").drawImage(liv.original, 0, 0, livOriginal.width, livOriginal.height);
    const context = livDecoded.getContext("2d");
    context.fillStyle = "#808080";
    context.fillRect(0, 0, livDecoded.width, livDecoded.height);
    if ((record.fractions?.length ?? 1) < 2) {
      context.drawImage(liv.frames, 0, 0, livDecoded.width, livDecoded.height);
      livFrameNote.textContent = "Decoded face";
      return;
    }
    const fractions = record.fractions;
    const t = liv.position;
    let index = -1;
    while (index + 1 < fractions.length && fractions[index + 1] <= t) index += 1;
    if (index >= 0) livDrawFrame(context, index, 1);
    if (index + 1 < fractions.length) {
      const from = index < 0 ? 0 : fractions[index];
      const span = fractions[index + 1] - from;
      const fraction = span > 0 ? (t - from) / span : 1;
      if (fraction > 0) livDrawFrame(context, index + 1, fraction);
    }
    if (liv.maps && liv.dim) {
      const from = index < 0 ? 0 : fractions[index];
      const next = index + 1 < fractions.length ? fractions[index + 1] : null;
      const fraction = next == null ? 0 : next > from ? (t - from) / (next - from) : 1;
      livMapCanvases.forEach((canvas) => {
        const series = liv.maps[Number(canvas.dataset.map)];
        const a = index >= 0 ? series[index] : null;
        const b = next == null ? null : series[index + 1];
        const values = new Float32Array(256);
        for (let cell = 0; cell < 256; cell += 1) {
          const left = a ? a[cell] : 0;
          values[cell] = b ? left * (1 - fraction) + b[cell] * fraction : left;
        }
        livDrawMap(canvas, values);
      });
    }
    livFrameNote.textContent = index < 0 ? "No fixations decoded yet" : `From ${livPercent(fractions[index])} of the fixations`;
    livShare.textContent = livPercent(t);
    // Scenes count viewing time; faces count the fixations near the face.
    if (record.viewingSeconds) {
      livTimeLabel.textContent = "Viewing time";
      livTime.textContent = `${formatViewingTime(t * record.viewingSeconds)} / ${formatViewingTime(record.viewingSeconds)}`;
    } else {
      livTimeLabel.textContent = "Fixations";
      livTime.textContent = `${Math.round(t * record.fixations).toLocaleString()} / ${record.fixations.toLocaleString()}`;
    }
  }

  function livStop() {
    liv.playing = false;
    if (liv.frame) cancelAnimationFrame(liv.frame);
    liv.frame = 0;
    livPlay.textContent = "Play";
    livPlay.setAttribute("aria-pressed", "false");
  }

  function livStart() {
    if (!liv.record || (liv.record.fractions?.length ?? 1) < 2) return;
    if (liv.position >= 1) liv.position = 0;
    liv.playing = true;
    livPlay.textContent = "Pause";
    livPlay.setAttribute("aria-pressed", "true");
    let last = performance.now();
    const step = (now) => {
      if (!liv.playing) return;
      liv.position = Math.min(1, liv.position + (now - last) / (LIV_PLAY_SECONDS * 1000));
      last = now;
      livTimeline.value = String(Math.round(liv.position * 1000));
      livPaint();
      if (liv.position >= 1) {
        livStop();
        return;
      }
      liv.frame = requestAnimationFrame(step);
    };
    liv.frame = requestAnimationFrame(step);
  }

  async function selectLivScene(record, { focusViewer = false } = {}) {
    const token = ++liv.token;
    livStop();
    liv.record = record;
    selectCard(record.slug);
    const faces = liv.mode === "faces";
    livKicker.textContent = faces ? "Selected face" : "Selected scene";
    livTitle.textContent = faces ? `Face ${record.rank}` : `Picture ${record.rank}`;
    livMeta.textContent = faces
      ? `${record.species === "human" ? "Human" : "Monkey"} face · ${record.faceDegrees.toFixed(1)}° wide · ` +
        `${record.fixations.toLocaleString()} fixations within 2° of it`
      : `${formatViewingTime(record.viewingSeconds)} of viewing · ${record.fixations.toLocaleString()} fixations · ` +
        `${record.sessions.toLocaleString()} sessions`;
    livOriginalTitle.textContent = faces ? "Face" : "Static natural scene";
    const ladder = (record.fractions?.length ?? 1) > 1;
    livTransport.hidden = !ladder;
    livPanels.classList.toggle("is-faces", faces);
    livNote.textContent = LIV_NOTES[liv.mode];
    livNote.hidden = !LIV_NOTES[liv.mode];
    const root = dataRoot();
    try {
      const [original, frames, maps] = await Promise.all([
        loadImage(`${root}/${record.original}?v=${DATA_VERSION}`),
        loadImage(`${root}/${record.sprite ?? record.frames[0]}?v=${DATA_VERSION}`),
        !faces && record.maps ? loadImage(`${root}/${record.maps}?v=${DATA_VERSION}`) : Promise.resolve(null),
      ]);
      if (token !== liv.token) return;
      liv.original = original;
      liv.frames = frames;
      liv.maps = maps ? livReadMaps(maps) : null;
      liv.dim = maps ? livDimmed(original, livMapCanvases[0].width) : null;
      liv.position = 1;
      livTimeline.value = "1000";
      livPaint();
    } catch (error) {
      console.error(error);
    }
    if (focusViewer) livViewer.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function enterLivingstone() {
    viewer.hidden = true;
    livViewer.hidden = false;
    sceneMode.hidden = false;
    const shared = sharedView && !sharedView.sceneTaken ? sharedView : null;
    if (shared?.mode === "faces" || shared?.mode === "full") liv.mode = shared.mode;
    buildLivGrid();
    const records = livRecords();
    let record = records[0];
    if (shared?.scene) {
      sharedView.sceneTaken = true;
      record = records.find((item) => item.slug === shared.scene) || record;
    }
    return record ? selectLivScene(record) : Promise.resolve();
  }

  function leaveLivingstone() {
    livStop();
    livViewer.hidden = true;
    viewer.hidden = false;
    sceneMode.hidden = true;
    grid.classList.remove("is-square-pairs");
  }

  sceneMode.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-mode]");
    if (!button || !isLivingstone() || button.dataset.mode === liv.mode) return;
    liv.mode = button.dataset.mode;
    buildLivGrid();
    const first = livRecords()[0];
    if (first) selectLivScene(first);
  });

  livPlay.addEventListener("click", () => {
    if (liv.playing) livStop();
    else livStart();
  });

  livTimeline.addEventListener("input", () => {
    livStop();
    liv.position = Number(livTimeline.value) / 1000;
    livPaint();
  });

  // Switching animal keeps the scene you were looking at when that animal has it,
  // and resets everything that is keyed to the old data root.
  async function selectAnimal(animal, { initial = false } = {}) {
    if (!initial && animal === state.animal) return;
    const previousSlug = state.scene?.slug;
    setPlaying(false);
    releaseReplay();
    state.animal = animal;
    state.langevin.token = -1;
    setBusy(true, "Loading monkey…");
    const manifest = await loadAnimalManifest(animal);
    state.manifest = manifest;
    markAnimal();
    if (animal === LIVINGSTONE) {
      setBusy(false);
      return enterLivingstone();
    }
    leaveLivingstone();
    buildSceneGrid(manifest);
    let sharedRecord = null;
    if (sharedView?.scene && !sharedView.sceneTaken) {
      sharedView.sceneTaken = true;
      sharedRecord = manifest.scenes.find((scene) => scene.slug === sharedView.scene) || null;
    }
    const record =
      sharedRecord ||
      manifest.scenes.find((scene) => scene.slug === previousSlug) ||
      manifest.scenes.find((scene) => scene.slug === "cornellornithography") ||
      manifest.scenes[0];
    // No scroll on an animal switch: the point is to compare the two animals'
    // reconstructions in the thumbnail grid without the page moving.
    return selectScene(record);
  }

  // Share a view ------------------------------------------------------------
  // "Copy link to this view" writes the current view into a link. The address
  // bar never carries state while you interact; opening such a link restores
  // the view and then removes the parameters from the address bar.
  const shareButton = document.querySelector("#share-link");
  const shareStatus = document.querySelector("#share-status");
  const shareInput = document.querySelector("#share-url");
  const SHARE_PANELS = {
    density: () => densityPanel,
    patch: () => patchDrawer,
    langevin: () => langevinPanel,
    fidelity: () => fidelityPanel,
  };

  function readSharedView() {
    const params = new URLSearchParams(window.location.search);
    if (!params.has("monkey")) return null;
    const view = Object.fromEntries(params.entries());
    return ANIMALS.some((animal) => animal.id === view.monkey) ? view : null;
  }

  let sharedView = readSharedView();
  if (sharedView) state.animal = sharedView.monkey;

  function shareUrl() {
    const params = new URLSearchParams();
    params.set("monkey", state.animal);
    if (isLivingstone()) {
      params.set("mode", liv.mode);
      if (liv.record) params.set("scene", liv.record.slug);
      if ((liv.record?.fractions?.length ?? 1) > 1) params.set("t", String(Math.round(liv.position * 1000)));
    } else if (state.scene) {
      params.set("scene", state.scene.slug);
      params.set("t", String(state.count));
      const panels = Object.keys(SHARE_PANELS).filter((name) => !SHARE_PANELS[name]().hidden);
      if (panels.length) params.set("panels", panels.join(","));
      if (!fidelityPanel.hidden) params.set("metric", fidelityMetric.value);
      if (!langevinPanel.hidden) {
        params.set("sampler", [langevinEta.value, langevinTemperature.value, langevinSnr.value].join(","));
      }
      if (isLgn() && state.rfChoice) params.set("field", `${state.rfChoice.session}:${state.rfChoice.gid}`);
    }
    return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  }

  function setInput(input, value) {
    if (!Number.isFinite(value)) return;
    input.value = String(value);
    input.dispatchEvent(new Event("input"));
  }

  async function applySharedView() {
    const view = sharedView;
    sharedView = null;
    if (!view) return;
    try {
      if (isLivingstone()) {
        const t = Number(view.t);
        if ((liv.record?.fractions?.length ?? 1) > 1 && Number.isFinite(t)) {
          liv.position = Math.max(0, Math.min(1, t / 1000));
          livTimeline.value = String(Math.round(liv.position * 1000));
          livPaint();
        }
      } else if (state.scene) {
        const t = Number(view.t);
        if (Number.isFinite(t)) await setCount(t);
        const panels = new Set((view.panels || "").split(",").filter(Boolean));
        if (view.sampler) {
          const [eta, temperature, snr] = view.sampler.split(",").map(Number);
          setInput(langevinEta, eta);
          setInput(langevinTemperature, temperature);
          setInput(langevinSnr, snr);
        }
        if (panels.has("density") && densityPanel.hidden) densityToggle.click();
        if (panels.has("langevin") && langevinPanel.hidden && !langevinToggle.hidden) setLangevinVisible(true);
        if (panels.has("fidelity") && fidelityPanel.hidden && !fidelityToggle.hidden) setFidelityVisible(true);
        if (view.metric && [...fidelityMetric.options].some((option) => option.value === view.metric)) {
          fidelityMetric.value = view.metric;
          fidelityMetric.dispatchEvent(new Event("change"));
        }
        if (view.field && isLgn()) {
          const [session, gid] = view.field.split(":").map(Number);
          if (Number.isFinite(session) && Number.isFinite(gid)) state.rfChoice = { session, gid };
        }
        if (panels.has("patch") && patchDrawer.hidden && !patchToggle.hidden) setPatchDrawerVisible(true);
        else paint();
      }
      // A shared scene beyond the first two rows: show all, so it is visible.
      const card = grid.querySelector(".scene-card.is-selected");
      if (card && !card.offsetParent) {
        grid.classList.remove("is-collapsed");
        updateSceneToggle();
      }
      (isLivingstone() ? livViewer : viewer).scrollIntoView({ block: "start" });
    } catch (error) {
      console.error(error);
    } finally {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.hash}`);
    }
  }

  shareButton.addEventListener("click", async () => {
    const url = shareUrl();
    shareButton.dataset.url = url;
    let copied = false;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        copied = true;
      }
    } catch {
      copied = false;
    }
    window.clearTimeout(state.shareTimer);
    if (copied) {
      shareInput.hidden = true;
      shareStatus.textContent = "Link copied";
      state.shareTimer = window.setTimeout(() => {
        shareStatus.textContent = "";
      }, 2500);
    } else {
      // No clipboard access (an older browser or a blocked permission): show
      // the link, selected, to copy by hand.
      shareInput.hidden = false;
      shareInput.value = url;
      shareInput.focus();
      shareInput.select();
      shareStatus.textContent = "Copy this link:";
    }
  });

  Promise.all(ANIMALS.map((animal) => loadAnimalManifest(animal.id).catch(() => null)))
    .then(() => {
      buildAnimalPicker();
      return selectAnimal(state.animal, { initial: true });
    })
    .then(applySharedView)
    .catch((error) => {
      console.error(error);
      sceneCount.textContent = "Scenes unavailable";
      setBusy(true, "Interactive data is not available yet.");
    });
})();
