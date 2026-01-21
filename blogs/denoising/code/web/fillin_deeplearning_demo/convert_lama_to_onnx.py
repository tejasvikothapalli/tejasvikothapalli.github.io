#!/usr/bin/env python3
"""
Convert LaMa PyTorch model to ONNX format for browser inference.

This script loads the simple-lama-inpainting model and exports it to ONNX format
that can be used with ONNX.js in the browser.

Usage:
    python convert_lama_to_onnx.py [--output big-lama.onnx]

Requirements:
    pip install simple-lama-inpainting torch onnx
"""

import argparse
import torch
import os
import sys

def convert_lama_to_onnx(output_path='big-lama.onnx', device='cpu'):
    """
    Convert LaMa model from PyTorch to ONNX format.
    
    Args:
        output_path: Path to save the ONNX model
        device: Device to use ('cpu' or 'cuda')
    """
    try:
        from simple_lama_inpainting import SimpleLama
    except ImportError:
        print("Error: simple-lama-inpainting not installed.")
        print("Install with: pip install simple-lama-inpainting")
        sys.exit(1)
    
    print("Loading LaMa model...")
    # Monkey-patch torch.jit.load to force CPU loading
    original_jit_load = torch.jit.load
    def jit_load_cpu(path, map_location=None, **kwargs):
        return original_jit_load(path, map_location='cpu', **kwargs)
    torch.jit.load = jit_load_cpu
    
    device_obj = torch.device(device)
    lama_model = SimpleLama(device=device_obj)
    
    # Restore original
    torch.jit.load = original_jit_load
    
    print("Model loaded. Extracting underlying PyTorch model...")
    
    # Get the underlying PyTorch model from SimpleLama
    # SimpleLama wraps a TorchScript model, we need to access it
    pytorch_model = lama_model.model
    
    print("Creating dummy inputs for ONNX export...")
    # Create dummy inputs: image [1, 3, H, W] and mask [1, 1, H, W]
    # Use a standard size like 256x256
    dummy_size = 256
    dummy_image = torch.randn(1, 3, dummy_size, dummy_size).to(device_obj)
    dummy_mask = torch.randn(1, 1, dummy_size, dummy_size).to(device_obj)
    
    print(f"Exporting to ONNX format: {output_path}")
    print("This may take a few minutes...")
    
    # Try different opset versions (ONNX Runtime Web supports up to opset 17)
    opset_versions = [17, 16, 15, 14, 13, 12, 11]
    
    for opset in opset_versions:
        try:
            print(f"\nTrying opset version {opset}...")
            torch.onnx.export(
                pytorch_model,
                (dummy_image, dummy_mask),
                output_path,
                input_names=['image', 'mask'],
                output_names=['output'],
                dynamic_axes={
                    'image': {2: 'height', 3: 'width'},
                    'mask': {2: 'height', 3: 'width'},
                    'output': {2: 'height', 3: 'width'}
                },
                opset_version=opset,
                do_constant_folding=True,
            )
            print(f"✓ Successfully exported ONNX model to {output_path} (opset {opset})")
            print(f"  Model size: {os.path.getsize(output_path) / (1024*1024):.1f} MB")
            print("\nNext steps:")
            print(f"  1. Copy {output_path} to the fillin_deeplearning_demo directory")
            print("  2. Update the model path in lama_inference.js if needed")
            print("  3. The model will be loaded automatically when the page loads")
            return
        except Exception as e:
            if opset == opset_versions[-1]:
                # Last attempt failed
                print(f"\n✗ All opset versions failed. Last error: {e}")
            else:
                print(f"  Opset {opset} failed: {str(e)[:100]}...")
                continue
    
    # If all opset versions fail, suggest alternatives
    print("\n" + "="*60)
    print("ONNX export failed. The model uses FFT operations not supported in ONNX.")
    print("\nAlternative solutions:")
    print("\n1. Download a pre-converted ONNX model:")
    print("   - Hugging Face: https://huggingface.co/Carve/LaMa-ONNX")
    print("   - Download 'lama_fp32.onnx' and rename to 'big-lama.onnx'")
    print("   - Place it in the fillin_deeplearning_demo directory")
    print("\n2. Use a server-side approach instead:")
    print("   - Create a Flask/FastAPI backend to run PyTorch inference")
    print("   - The web demo can call the backend API")
    print("\n3. Try the original LaMa PyTorch implementation:")
    print("   - Clone: https://github.com/saic-mdal/lama")
    print("   - Convert the PyTorch model (not TorchScript) to ONNX")
    sys.exit(1)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Convert LaMa model to ONNX')
    parser.add_argument('--output', default='big-lama.onnx',
                       help='Output ONNX model path (default: big-lama.onnx)')
    parser.add_argument('--device', default='cpu', choices=['cpu', 'cuda'],
                       help='Device to use (default: cpu)')
    
    args = parser.parse_args()
    convert_lama_to_onnx(args.output, args.device)

