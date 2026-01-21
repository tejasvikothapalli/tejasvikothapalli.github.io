#!/usr/bin/env python3
"""
Download pre-converted LaMa ONNX model from Hugging Face.

This script downloads the pre-converted LaMa ONNX model that works with ONNX Runtime Web.

Usage:
    python download_lama_onnx.py [--output big-lama.onnx]

Requirements:
    pip install huggingface-hub
"""

import argparse
import os
import sys

def download_lama_onnx(output_path='big-lama.onnx'):
    """
    Download pre-converted LaMa ONNX model from Hugging Face.
    
    Args:
        output_path: Path to save the ONNX model
    """
    try:
        from huggingface_hub import hf_hub_download
    except ImportError:
        print("Error: huggingface-hub not installed.")
        print("Install with: pip install huggingface-hub")
        sys.exit(1)
    
    print("Downloading pre-converted LaMa ONNX model from Hugging Face...")
    print("Repository: Carve/LaMa-ONNX")
    print("This may take a few minutes (model is ~200MB)...")
    
    try:
        model_path = hf_hub_download(
            repo_id="Carve/LaMa-ONNX",
            filename="lama_fp32.onnx",
            local_dir=os.path.dirname(output_path) if os.path.dirname(output_path) else ".",
            local_dir_use_symlinks=False
        )
        
        # Rename to desired output name if different
        if model_path != output_path:
            if os.path.exists(output_path):
                os.remove(output_path)
            os.rename(model_path, output_path)
        
        print(f"✓ Successfully downloaded ONNX model to {output_path}")
        print(f"  Model size: {os.path.getsize(output_path) / (1024*1024):.1f} MB")
        print("\nNext steps:")
        print(f"  1. The model is already in the correct location: {output_path}")
        print("  2. The model will be loaded automatically when the page loads")
        print("  3. Open the demo in a browser to test")
        
    except Exception as e:
        print(f"✗ Download failed: {e}")
        print("\nManual download instructions:")
        print("  1. Visit: https://huggingface.co/Carve/LaMa-ONNX")
        print("  2. Download 'lama_fp32.onnx'")
        print(f"  3. Rename it to '{output_path}'")
        print(f"  4. Place it in: {os.path.abspath(os.path.dirname(output_path) or '.')}")
        sys.exit(1)

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='Download pre-converted LaMa ONNX model')
    parser.add_argument('--output', default='big-lama.onnx',
                       help='Output ONNX model path (default: big-lama.onnx)')
    
    args = parser.parse_args()
    download_lama_onnx(args.output)

