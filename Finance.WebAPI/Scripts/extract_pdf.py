import csv
import os
import sys
import tempfile

import camelot
from pypdf import PdfReader, PdfWriter


def decrypt_pdf_if_needed(source_path: str, password: str | None) -> str:
    reader = PdfReader(source_path)
    if not reader.is_encrypted:
        return source_path

    if not password:
        raise RuntimeError("PDF requires a password.")

    decrypt_result = reader.decrypt(password)
    if decrypt_result == 0:
        raise RuntimeError("Incorrect PDF password.")

    handle, decrypted_path = tempfile.mkstemp(suffix=".pdf")
    os.close(handle)

    writer = PdfWriter()
    for page in reader.pages:
        writer.add_page(page)

    with open(decrypted_path, "wb") as decrypted_file:
        writer.write(decrypted_file)

    return decrypted_path


def main() -> int:
    if len(sys.argv) < 3:
        print("Usage: extract_pdf.py <input.pdf> <output.csv> [password]", file=sys.stderr)
        return 1

    source_path = sys.argv[1]
    output_path = sys.argv[2]
    password = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3] else None
    decrypted_path = None

    try:
        effective_source_path = decrypt_pdf_if_needed(source_path, password)
        if effective_source_path != source_path:
            decrypted_path = effective_source_path

        tables = camelot.read_pdf(effective_source_path, pages="all", flavor="stream")
        if tables.n == 0:
            raise RuntimeError("No tables were found in the PDF.")

        with open(output_path, "w", newline="", encoding="utf-8") as csv_file:
          writer = csv.writer(csv_file)
          for table in tables:
              for row in table.df.values.tolist():
                  writer.writerow(row)

        return 0
    except Exception as exception:
        print(str(exception), file=sys.stderr)
        return 1
    finally:
        if decrypted_path and os.path.exists(decrypted_path):
            os.remove(decrypted_path)


if __name__ == "__main__":
    raise SystemExit(main())
