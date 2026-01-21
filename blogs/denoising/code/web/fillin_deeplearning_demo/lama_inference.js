// LaMa inpainting using ONNX Runtime Web
// This module handles loading and running the LaMa ONNX model in the browser

let lamaModel = null;
let modelLoading = false;
let modelLoadPromise = null;

/**
 * Load the LaMa ONNX model
 * @param {string} modelPath - Path to the ONNX model file (default: './big-lama.onnx')
 * @returns {Promise<void>}
 */
export async function loadLamaModel(modelPath = './big-lama.onnx') {
  if (lamaModel) {
    return; // Already loaded
  }
  
  if (modelLoading) {
    return modelLoadPromise; // Return existing promise
  }
  
  modelLoading = true;
  modelLoadPromise = (async () => {
    try {
      // Wait for ONNX Runtime to be available
      let waitCount = 0;
      while (typeof ort === 'undefined' && waitCount < 50) {
        await new Promise(resolve => setTimeout(resolve, 100));
        waitCount++;
      }
      
      if (typeof ort === 'undefined') {
        throw new Error('ONNX Runtime Web not loaded. Make sure the CDN script is included in index.html');
      }
      
      console.log('ONNX Runtime available, loading model...');
      
      // Configure execution providers - use 'wasm' for browser compatibility
      // Note: 'wasm' is the default and most compatible option
      const options = {
        executionProviders: ['wasm'],
        logSeverityLevel: 3, // 3=error (suppress warnings)
        logVerbosityLevel: 3
      };
      
      console.log('Loading LaMa model from:', modelPath);
      const startTime = performance.now();
      const session = await ort.InferenceSession.create(modelPath, options);
      const loadTime = performance.now() - startTime;
      
      lamaModel = session;
      console.log(`LaMa model loaded successfully in ${(loadTime / 1000).toFixed(2)}s`);
      console.log('Model inputs:', session.inputNames);
      console.log('Model outputs:', session.outputNames);
      console.log('Model input shapes:', session.inputNames.map(name => {
        const input = session.inputMetadata[name];
        return input ? input.dims : 'unknown';
      }));
    } catch (error) {
      console.error('Failed to load LaMa model:', error);
      console.error('Error details:', error.message, error.stack);
      throw error;
    } finally {
      modelLoading = false;
    }
  })();
  
  return modelLoadPromise;
}

/**
 * Resize image data using canvas (bilinear interpolation)
 * @param {Float32Array} imageData - Grayscale image data [0-255]
 * @param {number} fromSize - Original size
 * @param {number} toSize - Target size
 * @returns {Float32Array} Resized image data
 */
function resizeImageData(imageData, fromSize, toSize) {
  if (fromSize === toSize) return imageData;
  
  // Create temporary canvas for resizing
  const fromCanvas = document.createElement('canvas');
  fromCanvas.width = fromSize;
  fromCanvas.height = fromSize;
  const fromCtx = fromCanvas.getContext('2d');
  
  // Draw original image
  const fromImageData = new ImageData(fromSize, fromSize);
  for (let i = 0; i < fromSize * fromSize; i++) {
    const g = Math.max(0, Math.min(255, imageData[i]));
    fromImageData.data[i * 4 + 0] = g;
    fromImageData.data[i * 4 + 1] = g;
    fromImageData.data[i * 4 + 2] = g;
    fromImageData.data[i * 4 + 3] = 255;
  }
  fromCtx.putImageData(fromImageData, 0, 0);
  
  // Resize to target size
  const toCanvas = document.createElement('canvas');
  toCanvas.width = toSize;
  toCanvas.height = toSize;
  const toCtx = toCanvas.getContext('2d');
  toCtx.drawImage(fromCanvas, 0, 0, toSize, toSize);
  
  // Extract resized data
  const toImageData = toCtx.getImageData(0, 0, toSize, toSize);
  const resized = new Float32Array(toSize * toSize);
  for (let i = 0; i < toSize * toSize; i++) {
    resized[i] = toImageData.data[i * 4]; // Use R channel (grayscale)
  }
  
  return resized;
}

/**
 * Preprocess image and mask for LaMa inference
 * @param {Float32Array} imageData - Grayscale image data [0-255]
 * @param {Uint8Array} maskKnown - Mask where 1=known, 0=missing
 * @param {number} size - Image size (assumed square)
 * @returns {Object} Preprocessed tensors {imageTensor, maskTensor, modelSize}
 */
function preprocessLama(imageData, maskKnown, size) {
  // Model expects 512x512, so resize if needed
  const MODEL_SIZE = 512;
  const needsResize = size !== MODEL_SIZE;
  
  // Resize image and mask to 512x512 if needed
  const resizedImage = needsResize ? resizeImageData(imageData, size, MODEL_SIZE) : imageData;
  let resizedMask = maskKnown;
  
  if (needsResize) {
    // Resize mask using canvas
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = size;
    maskCanvas.height = size;
    const maskCtx = maskCanvas.getContext('2d');
    const maskImageData = new ImageData(size, size);
    for (let i = 0; i < size * size; i++) {
      const v = maskKnown[i] * 255;
      maskImageData.data[i * 4 + 0] = v;
      maskImageData.data[i * 4 + 1] = v;
      maskImageData.data[i * 4 + 2] = v;
      maskImageData.data[i * 4 + 3] = 255;
    }
    maskCtx.putImageData(maskImageData, 0, 0);
    
    const resizedMaskCanvas = document.createElement('canvas');
    resizedMaskCanvas.width = MODEL_SIZE;
    resizedMaskCanvas.height = MODEL_SIZE;
    const resizedMaskCtx = resizedMaskCanvas.getContext('2d');
    resizedMaskCtx.drawImage(maskCanvas, 0, 0, MODEL_SIZE, MODEL_SIZE);
    const resizedMaskImageData = resizedMaskCtx.getImageData(0, 0, MODEL_SIZE, MODEL_SIZE);
    
    resizedMask = new Uint8Array(MODEL_SIZE * MODEL_SIZE);
    for (let i = 0; i < MODEL_SIZE * MODEL_SIZE; i++) {
      // Threshold: > 128 = known (1), <= 128 = missing (0)
      resizedMask[i] = resizedMaskImageData.data[i * 4] > 128 ? 1 : 0;
    }
  }
  
  // Convert grayscale to RGB (repeat channel 3 times)
  const imageRGB = new Float32Array(MODEL_SIZE * MODEL_SIZE * 3);
  for (let i = 0; i < MODEL_SIZE * MODEL_SIZE; i++) {
    const v = resizedImage[i] / 255.0; // Normalize to [0, 1]
    imageRGB[i * 3 + 0] = v; // R
    imageRGB[i * 3 + 1] = v; // G
    imageRGB[i * 3 + 2] = v; // B
  }
  
  // Convert mask: LaMa expects 255=missing, 0=known (invert maskKnown)
  const maskForLama = new Float32Array(MODEL_SIZE * MODEL_SIZE);
  for (let i = 0; i < MODEL_SIZE * MODEL_SIZE; i++) {
    maskForLama[i] = (1 - resizedMask[i]); // Normalize to [0, 1], 1=missing
  }
  
  // Create tensors for ONNX Runtime: [1, 3, 512, 512] for image, [1, 1, 512, 512] for mask
  const imageTensor = new ort.Tensor('float32', imageRGB, [1, 3, MODEL_SIZE, MODEL_SIZE]);
  const maskTensor = new ort.Tensor('float32', maskForLama, [1, 1, MODEL_SIZE, MODEL_SIZE]);
  
  return { imageTensor, maskTensor, modelSize: MODEL_SIZE };
}

/**
 * Postprocess LaMa output back to grayscale and resize if needed
 * @param {ort.Tensor} outputTensor - Output tensor from model [1, 3, 512, 512]
 * @param {number} modelSize - Model output size (512)
 * @param {number} targetSize - Desired output size (original image size)
 * @returns {Float32Array} Grayscale image data [0-255] at targetSize
 */
function postprocessLama(outputTensor, modelSize, targetSize) {
  const outputData = outputTensor.data; // Float32Array
  
  console.log('Postprocessing: outputData length:', outputData.length);
  console.log('Postprocessing: outputData sample (first 15):', Array.from(outputData.slice(0, 15)));
  
  // Calculate min/max without spreading (to avoid call stack overflow)
  let minVal = outputData[0];
  let maxVal = outputData[0];
  for (let i = 1; i < outputData.length; i++) {
    if (outputData[i] < minVal) minVal = outputData[i];
    if (outputData[i] > maxVal) maxVal = outputData[i];
  }
  console.log('Postprocessing: outputData min/max:', minVal, maxVal);
  
  // Convert RGB to grayscale (average channels) from model output
  // Check if output is already in [0, 255] range or [0, 1] range
  // If max value is > 1, it's already denormalized
  const isNormalized = maxVal <= 1.0;
  console.log('Postprocessing: output appears to be', isNormalized ? 'normalized [0,1]' : 'denormalized [0,255]');
  
  const modelGrayscale = new Float32Array(modelSize * modelSize);
  for (let i = 0; i < modelSize * modelSize; i++) {
    const r = outputData[i * 3 + 0];
    const g = outputData[i * 3 + 1];
    const b = outputData[i * 3 + 2];
    const gray = (r + g + b) / 3.0;
    // If normalized [0,1], denormalize to [0,255]. Otherwise use as-is (already in [0,255]).
    if (isNormalized) {
      modelGrayscale[i] = Math.max(0, Math.min(255, gray * 255.0));
    } else {
      modelGrayscale[i] = Math.max(0, Math.min(255, gray));
    }
  }
  
  // Calculate min/max for modelGrayscale
  minVal = modelGrayscale[0];
  maxVal = modelGrayscale[0];
  for (let i = 1; i < modelGrayscale.length; i++) {
    if (modelGrayscale[i] < minVal) minVal = modelGrayscale[i];
    if (modelGrayscale[i] > maxVal) maxVal = modelGrayscale[i];
  }
  console.log('Postprocessing: modelGrayscale min/max:', minVal, maxVal);
  console.log('Postprocessing: modelGrayscale sample (first 10):', Array.from(modelGrayscale.slice(0, 10)));
  
  // Resize back to original size if needed
  if (modelSize === targetSize) {
    return modelGrayscale;
  }
  
  // Resize using canvas
  const modelCanvas = document.createElement('canvas');
  modelCanvas.width = modelSize;
  modelCanvas.height = modelSize;
  const modelCtx = modelCanvas.getContext('2d');
  const modelImageData = new ImageData(modelSize, modelSize);
  for (let i = 0; i < modelSize * modelSize; i++) {
    const g = Math.max(0, Math.min(255, modelGrayscale[i]));
    modelImageData.data[i * 4 + 0] = g;
    modelImageData.data[i * 4 + 1] = g;
    modelImageData.data[i * 4 + 2] = g;
    modelImageData.data[i * 4 + 3] = 255;
  }
  modelCtx.putImageData(modelImageData, 0, 0);
  
  const targetCanvas = document.createElement('canvas');
  targetCanvas.width = targetSize;
  targetCanvas.height = targetSize;
  const targetCtx = targetCanvas.getContext('2d');
  targetCtx.drawImage(modelCanvas, 0, 0, targetSize, targetSize);
  
  const targetImageData = targetCtx.getImageData(0, 0, targetSize, targetSize);
  const result = new Float32Array(targetSize * targetSize);
  for (let i = 0; i < targetSize * targetSize; i++) {
    result[i] = targetImageData.data[i * 4]; // Use R channel (grayscale)
  }
  
  // Calculate min/max for result
  minVal = result[0];
  maxVal = result[0];
  for (let i = 1; i < result.length; i++) {
    if (result[i] < minVal) minVal = result[i];
    if (result[i] > maxVal) maxVal = result[i];
  }
  console.log('Postprocessing: result min/max:', minVal, maxVal);
  console.log('Postprocessing: result sample (first 10):', Array.from(result.slice(0, 10)));
  
  return result;
}

/**
 * Run LaMa inpainting inference
 * @param {Float32Array} imageData - Grayscale image data [0-255]
 * @param {Uint8Array} maskKnown - Mask where 1=known, 0=missing
 * @param {number} size - Image size (assumed square)
 * @returns {Promise<Float32Array>} Inpainted grayscale image [0-255]
 */
export async function inpaintLama(imageData, maskKnown, size) {
  if (!lamaModel) {
    throw new Error('LaMa model not loaded. Call loadLamaModel() first.');
  }
  
  console.log('Starting LaMa inference for size:', size);
  
  try {
    // Preprocess (resizes to 512x512 if needed)
    console.log('Preprocessing image and mask...');
    const { imageTensor, maskTensor, modelSize } = preprocessLama(imageData, maskKnown, size);
    console.log('Preprocessing complete. Model size:', modelSize);
    
    // Use the actual input names from the model
    const inputNames = lamaModel.inputNames;
    console.log('Model input names:', inputNames);
    
    // Build feeds with correct input names
    const feeds = {};
    if (inputNames.length >= 2) {
      // Try to find 'image' and 'mask' inputs
      const imageName = inputNames.find(name => 
        name.toLowerCase().includes('image') || 
        name.toLowerCase().includes('input') ||
        name.toLowerCase().includes('img')
      ) || inputNames[0];
      
      const maskName = inputNames.find(name => 
        name.toLowerCase().includes('mask')
      ) || inputNames[1];
      
      feeds[imageName] = imageTensor;
      feeds[maskName] = maskTensor;
      
      console.log('Using input names:', imageName, maskName);
    } else {
      // Fallback: use first two inputs
      feeds[inputNames[0]] = imageTensor;
      feeds[inputNames[1]] = maskTensor;
      console.log('Using fallback input names:', inputNames[0], inputNames[1]);
    }
    
    // Run inference
    console.log('Running model inference...');
    const startTime = performance.now();
    const outputMap = await lamaModel.run(feeds);
    const inferenceTime = performance.now() - startTime;
    console.log(`Inference completed in ${inferenceTime.toFixed(2)}ms`);
    
    // Get output tensor
    const outputNames = lamaModel.outputNames;
    console.log('Model output names:', outputNames);
    
    let outputTensor;
    if (outputMap.output) {
      outputTensor = outputMap.output;
    } else if (outputNames.length > 0 && outputMap[outputNames[0]]) {
      outputTensor = outputMap[outputNames[0]];
    } else {
      // Fallback: get first value from the output object
      const keys = Object.keys(outputMap);
      if (keys.length > 0) {
        outputTensor = outputMap[keys[0]];
        console.log('Using output key:', keys[0]);
      } else {
        throw new Error('No output found in model result');
      }
    }
    
    console.log('Postprocessing output...');
    // Postprocess (resizes back to original size if needed)
    const result = postprocessLama(outputTensor, modelSize, size);
    console.log('LaMa inference complete');
    
    return result;
  } catch (error) {
    console.error('LaMa inference error:', error);
    throw error;
  }
}

/**
 * Check if LaMa model is loaded
 * @returns {boolean}
 */
export function isLamaModelLoaded() {
  return lamaModel !== null;
}

