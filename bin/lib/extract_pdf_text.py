#!/usr/bin/env python3
"""
Extract text from PDF files for flashcard generation.
"""

import sys
import pymupdf  # PyMuPDF

def extract_text_from_pdf(pdf_path):
    """Extract all text from a PDF file."""
    try:
        doc = pymupdf.open(pdf_path)
        text = ""

        for page_num, page in enumerate(doc, start=1):
            text += f"\n{'='*80}\n"
            text += f"PAGE {page_num}\n"
            text += f"{'='*80}\n\n"
            text += page.get_text()

        doc.close()
        return text
    except Exception as e:
        print(f"Error extracting text from PDF: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("Usage: extract_pdf_text.py <pdf_path>", file=sys.stderr)
        sys.exit(1)

    pdf_path = sys.argv[1]
    text = extract_text_from_pdf(pdf_path)
    print(text)
