#!/usr/bin/env python3
"""
Extract figures from PDF files for use in flashcards.

Usage:
    python3 extract_figures.py --pdf public/sources/chapter_1.pdf --output public/figures/chapter_1/

Requirements:
    pip install pdf2image pillow

On macOS, also requires:
    brew install poppler
"""

import argparse
import os
from pathlib import Path
from pdf2image import convert_from_path


def extract_figures(pdf_path, output_dir, dpi=300, fmt='png'):
    """
    Extract all pages from a PDF as images.

    Args:
        pdf_path: Path to input PDF file
        output_dir: Directory to save extracted images
        dpi: Resolution for image extraction (default: 300)
        fmt: Output format (default: 'png')
    """
    # Create output directory if it doesn't exist
    output_path = Path(output_dir)
    output_path.mkdir(parents=True, exist_ok=True)

    # Get PDF filename without extension
    pdf_name = Path(pdf_path).stem

    print(f"Extracting figures from: {pdf_path}")
    print(f"Output directory: {output_dir}")
    print(f"Resolution: {dpi} DPI\n")

    # Convert PDF pages to images
    images = convert_from_path(pdf_path, dpi=dpi)

    # Save each page as an image
    for i, image in enumerate(images, start=1):
        output_file = output_path / f"page_{i:03d}.{fmt}"
        image.save(output_file, fmt.upper())
        print(f"✓ Saved: {output_file}")

    print(f"\n✓ Successfully extracted {len(images)} pages")
    print(f"\nNext steps:")
    print(f"1. Review extracted images in {output_dir}")
    print(f"2. Identify figures you want to use")
    print(f"3. Crop and rename relevant figures (e.g., page_005.png → fig_1_5.png)")
    print(f"4. Delete full-page images you don't need")
    print(f"5. Reference figures in flashcards with relative paths:")
    print(f"   ![Figure description](../public/figures/chapter_1/fig_1_5.png)")


def main():
    parser = argparse.ArgumentParser(
        description="Extract figures from PDF files for flashcards",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  # Extract from chapter 1 PDF
  python3 extract_figures.py --pdf public/sources/chapter_1.pdf --output public/figures/chapter_1/

  # Extract at higher resolution
  python3 extract_figures.py --pdf public/sources/chapter_2.pdf --output public/figures/chapter_2/ --dpi 600

  # Extract as JPEG instead of PNG
  python3 extract_figures.py --pdf public/sources/appendix.pdf --output public/figures/appendix/ --fmt jpg

Note: This extracts ALL pages. You'll need to manually:
  1. Identify which images contain the figures you need
  2. Crop figures from full pages (using Preview, GIMP, or ImageMagick)
  3. Rename to descriptive names (fig_1_5.png, vector_addition.png, etc.)
  4. Delete unused full-page extractions
        """
    )

    parser.add_argument(
        '--pdf',
        required=True,
        help='Path to PDF file'
    )

    parser.add_argument(
        '--output',
        required=True,
        help='Output directory for extracted images'
    )

    parser.add_argument(
        '--dpi',
        type=int,
        default=300,
        help='Resolution in DPI (default: 300)'
    )

    parser.add_argument(
        '--fmt',
        choices=['png', 'jpg', 'jpeg'],
        default='png',
        help='Output image format (default: png)'
    )

    args = parser.parse_args()

    # Check if PDF exists
    if not os.path.exists(args.pdf):
        print(f"Error: PDF file not found: {args.pdf}")
        return 1

    # Extract figures
    try:
        extract_figures(args.pdf, args.output, args.dpi, args.fmt)
        return 0
    except Exception as e:
        print(f"\nError: {e}")
        print("\nMake sure you have installed dependencies:")
        print("  pip install pdf2image pillow")
        print("  brew install poppler  # macOS only")
        return 1


if __name__ == '__main__':
    exit(main())
