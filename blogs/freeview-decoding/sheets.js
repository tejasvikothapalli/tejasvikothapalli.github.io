// Progression contact sheets. The sheets show all 27 scenes, restricted ones included, so they
// ship as AES-256-GCM ciphertext under the same passphrase as the restricted scene set. The key
// is derived per visit and held in memory only; a reload re-locks.
(() => {
  "use strict";

  const root = document.querySelector("#progression");
  if (!root) return;

  const stage = root.querySelector("#sheet-stage");
  const pane = root.querySelector("#sheet-pane");
  const img = root.querySelector("#sheet-img");
  const locked = root.querySelector("#sheet-locked");
  const form = root.querySelector("#sheet-unlock-form");
  const pass = root.querySelector("#sheet-pass");
  const errorNote = root.querySelector("#sheet-error");
  const status = root.querySelector("#sheet-status");
  const caption = root.querySelector("#sheet-caption");
  const download = root.querySelector("#sheet-download");
  const animalGroup = root.querySelector("#sheet-animals");
  const zoomOut = root.querySelector("#sheet-zoom-out");
  const zoomIn = root.querySelector("#sheet-zoom-in");
  const zoomLevel = root.querySelector("#sheet-zoom-level");
  const fitButton = root.querySelector("#sheet-fit");
  const fullButton = root.querySelector("#sheet-full");

  const state = {
    index: null,
    key: null,
    current: null,
    blobs: new Map(),      // id -> { url, bytes }
    scale: 1,
    fitScale: 1,
    tx: 0,
    ty: 0,
    natural: { w: 1, h: 1 },
    fitted: true,
  };

  const MIN_SCALE = 0.02;
  const MAX_SCALE = 4;

  function base64Bytes(value) {
    const binary = atob(value);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  }

  function mb(bytes) {
    return `${(bytes / 1048576).toFixed(1)} MB`;
  }

  function setStatus(text) {
    if (status) status.textContent = text ?? "";
  }

  async function deriveKey(passphrase) {
    const { kdf } = state.index;
    const material = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(passphrase),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: base64Bytes(kdf.salt), iterations: kdf.iterations, hash: kdf.hash },
      material,
      { name: "AES-GCM", length: 256 },
      false,
      ["decrypt"],
    );
  }

  async function openSealed(key, path) {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`${path} returned ${response.status}`);
    const sealed = new Uint8Array(await response.arrayBuffer());
    // A wrong key fails the GCM tag here rather than yielding garbage.
    return crypto.subtle.decrypt(
      { name: "AES-GCM", iv: sealed.subarray(0, 12) },
      key,
      sealed.subarray(12),
    );
  }

  // ---- zoom / pan -------------------------------------------------------------------------

  function clamp(value, low, high) {
    return Math.min(high, Math.max(low, value));
  }

  function apply() {
    const box = stage.getBoundingClientRect();
    const w = state.natural.w * state.scale;
    const h = state.natural.h * state.scale;
    // Centre whichever axis is smaller than the stage; otherwise keep the image covering it.
    state.tx = w <= box.width ? (box.width - w) / 2 : clamp(state.tx, box.width - w, 0);
    state.ty = h <= box.height ? (box.height - h) / 2 : clamp(state.ty, box.height - h, 0);
    pane.style.transform = `translate(${state.tx}px, ${state.ty}px) scale(${state.scale})`;
    const pct = state.scale / state.fitScale;
    zoomLevel.textContent = state.fitted && Math.abs(pct - 1) < 0.001
      ? "Fit"
      : `${Math.round(state.scale * 100)}%`;
    // Only pixelate when magnifying past 1:1; see the note in style.css.
    stage.dataset.magnified = state.scale >= 1 ? "true" : "false";
  }

  function computeFit() {
    const box = stage.getBoundingClientRect();
    state.fitScale = box.width > 0 ? box.width / state.natural.w : 1;
    return state.fitScale;
  }

  function fit() {
    computeFit();
    state.scale = state.fitScale;
    state.fitted = true;
    state.ty = 0;
    apply();
  }

  function zoomAbout(nextScale, clientX, clientY) {
    const box = stage.getBoundingClientRect();
    const px = (clientX ?? box.left + box.width / 2) - box.left;
    const py = (clientY ?? box.top + box.height / 2) - box.top;
    const next = clamp(nextScale, Math.min(MIN_SCALE, state.fitScale), MAX_SCALE);
    const ratio = next / state.scale;
    state.tx = px - (px - state.tx) * ratio;
    state.ty = py - (py - state.ty) * ratio;
    state.scale = next;
    state.fitted = Math.abs(next - state.fitScale) < 1e-6;
    apply();
  }

  stage.addEventListener(
    "wheel",
    (event) => {
      if (!state.current) return;
      // Plain scroll should still scroll the page unless the sheet is zoomed in.
      if (!event.ctrlKey && state.scale <= state.fitScale * 1.001) return;
      event.preventDefault();
      if (event.ctrlKey) {
        zoomAbout(state.scale * Math.exp(-event.deltaY / 320), event.clientX, event.clientY);
      } else {
        state.ty -= event.deltaY;
        state.tx -= event.deltaX;
        apply();
      }
    },
    { passive: false },
  );

  let drag = null;
  stage.addEventListener("pointerdown", (event) => {
    if (!state.current || event.button !== 0) return;
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY };
    stage.setPointerCapture(event.pointerId);
    stage.dataset.dragging = "true";
  });
  stage.addEventListener("pointermove", (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    state.tx += event.clientX - drag.x;
    state.ty += event.clientY - drag.y;
    drag.x = event.clientX;
    drag.y = event.clientY;
    apply();
  });
  const endDrag = (event) => {
    if (!drag || event.pointerId !== drag.id) return;
    drag = null;
    stage.dataset.dragging = "false";
  };
  stage.addEventListener("pointerup", endDrag);
  stage.addEventListener("pointercancel", endDrag);

  stage.addEventListener("dblclick", (event) => {
    if (!state.current) return;
    if (state.scale > state.fitScale * 1.001) fit();
    else zoomAbout(1, event.clientX, event.clientY);
  });

  stage.addEventListener("keydown", (event) => {
    if (!state.current) return;
    const step = event.shiftKey ? 240 : 80;
    const moves = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
    if (moves[event.key]) {
      event.preventDefault();
      state.tx += moves[event.key][0];
      state.ty += moves[event.key][1];
      apply();
    } else if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      zoomAbout(state.scale * 1.3);
    } else if (event.key === "-") {
      event.preventDefault();
      zoomAbout(state.scale / 1.3);
    } else if (event.key === "0") {
      event.preventDefault();
      fit();
    }
  });

  zoomIn.addEventListener("click", () => zoomAbout(state.scale * 1.3));
  zoomOut.addEventListener("click", () => zoomAbout(state.scale / 1.3));
  fitButton.addEventListener("click", fit);
  fullButton.addEventListener("click", () => zoomAbout(1));

  let resizeTimer = null;
  window.addEventListener("resize", () => {
    if (!state.current) return;
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      const wasFitted = state.fitted;
      computeFit();
      if (wasFitted) fit();
      else apply();
    }, 120);
  });

  // ---- loading ----------------------------------------------------------------------------

  function record(id) {
    return state.index.sheets.find((sheet) => sheet.id === id) ?? null;
  }

  async function show(id) {
    const sheet = record(id);
    if (!sheet || !state.key) return;
    for (const button of animalGroup.querySelectorAll("button")) {
      button.setAttribute("aria-pressed", String(button.dataset.sheet === id));
    }
    let entry = state.blobs.get(id);
    if (!entry) {
      setStatus(`Decrypting ${sheet.animal} sheet — ${mb(sheet.sealedBytes)}…`);
      const buffer = await openSealed(state.key, `./data/sheets/${sheet.file}`);
      entry = { url: URL.createObjectURL(new Blob([buffer], { type: "image/webp" })), bytes: buffer.byteLength };
      state.blobs.set(id, entry);
    }
    setStatus("");
    state.current = id;
    state.natural = { w: sheet.width, h: sheet.height };
    // The download link is wired up BEFORE the render is attempted: if a browser refuses this
    // image (iOS Safari caps decoding near 17 Mpixel and this sheet is 52), the file itself is
    // still the point of the section, and a decode failure must not read as a bad passphrase.
    download.href = entry.url;
    download.download = sheet.download;
    download.hidden = false;
    download.textContent = `Download ${sheet.animal} sheet · ${mb(entry.bytes)}`;
    const rendered = await new Promise((resolve) => {
      img.onload = () => resolve(true);
      img.onerror = () => resolve(false);
      img.src = entry.url;
    });
    if (!rendered) {
      stage.hidden = true;
      setStatus(
        `This browser would not render the ${sheet.animal} sheet at ${sheet.width}×${sheet.height}. ` +
          `The download above is unaffected.`,
      );
      return;
    }
    stage.hidden = false;
    img.width = sheet.width;
    img.height = sheet.height;
    img.alt = `${sheet.animal} progression contact sheet: ${state.index.rows} scenes by ${state.index.columns} model variants`;
    caption.textContent =
      `${sheet.animal} · ${sheet.width}×${sheet.height} px · ${state.index.rows} scenes × ` +
      `${state.index.columns} columns · lossless, pixel-identical to the source render.`;
    fit();
  }

  async function unlock(passphrase) {
    const key = await deriveKey(passphrase);
    // Cheapest possible probe: a few bytes either authenticate or they do not.
    await openSealed(key, `./data/sheets/${state.index.probe}`);
    state.key = key;
    locked.hidden = true;
    stage.hidden = false;
    root.dataset.unlocked = "true";
    await show(state.index.sheets[0].id);
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    errorNote.hidden = true;
    const value = pass.value.trim();
    if (!value) return;
    setStatus("Deriving key…");
    try {
      await unlock(value);
      pass.value = "";
    } catch (error) {
      console.error(error);
      setStatus("");
      errorNote.textContent = "That passphrase did not unlock the sheets.";
      errorNote.hidden = false;
    }
  });

  animalGroup.addEventListener("click", (event) => {
    const button = event.target.closest("button[data-sheet]");
    if (!button || button.dataset.sheet === state.current) return;
    show(button.dataset.sheet).catch((error) => {
      console.error(error);
      setStatus("That sheet failed to load.");
    });
  });

  // If the scene set was already unlocked, adopt the same passphrase rather than asking twice.
  document.addEventListener("freeview:restricted-unlocked", (event) => {
    const passphrase = event.detail?.passphrase;
    if (!passphrase || state.key || !state.index) return;
    unlock(passphrase).catch(() => {
      /* different salt or a rebuilt set: leave the section's own prompt in place */
    });
  });

  fetch("./data/sheets/index.json")
    .then((response) => (response.ok ? response.json() : Promise.reject(new Error("no sheet index"))))
    .then((index) => {
      if (!index?.sheets?.length) throw new Error("empty sheet index");
      state.index = index;
      animalGroup.innerHTML = "";
      for (const sheet of index.sheets) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "quiet-button";
        button.dataset.sheet = sheet.id;
        button.setAttribute("aria-pressed", "false");
        button.textContent = sheet.animal;
        animalGroup.append(button);
      }
      root.hidden = false;
    })
    .catch((error) => {
      console.error(error);
      root.hidden = true;
    });
})();
