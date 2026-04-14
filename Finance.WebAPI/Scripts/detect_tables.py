import argparse
import json
import sys

CANVAS_WIDTH = 760.0
CANVAS_HEIGHT = 980.0


def read_page_info(pdf_path):
    reader = None
    for module_name in ("pypdf", "PyPDF2"):
        try:
            module = __import__(module_name)
            reader = module.PdfReader(pdf_path)
            break
        except Exception:
            continue

    if reader is None:
        return {
            "page_count": 1,
            "supports_text_extraction": True,
            "page_sizes": {1: (612.0, 792.0)},
            "warning": "pypdf/PyPDF2 not available. Using fallback page size.",
        }

    page_sizes = {}
    has_text = False
    for index, page in enumerate(reader.pages, start=1):
        width = float(page.mediabox.width)
        height = float(page.mediabox.height)
        page_sizes[index] = (width, height)
        try:
            extracted_text = page.extract_text() or ""
            if extracted_text.strip():
                has_text = True
        except Exception:
            pass

    return {
        "page_count": len(reader.pages),
        "supports_text_extraction": has_text,
        "page_sizes": page_sizes,
        "warning": None,
    }


def run_camelot(args):
    try:
        import camelot  # type: ignore
    except Exception as exc:
        raise RuntimeError(f"Camelot is not available: {exc}") from exc

    camelot_kwargs = {
        "pages": args.pages,
        "flavor": args.flavor,
        "split_text": args.split_text.lower() == "true",
        "strip_text": "\n" if args.strip_text.lower() == "true" else "",
    }

    if args.flavor == "lattice":
        camelot_kwargs["line_scale"] = int(args.line_scale)
    else:
        camelot_kwargs["edge_tol"] = int(args.edge_tolerance)
        camelot_kwargs["row_tol"] = int(args.row_tolerance)
        camelot_kwargs["column_tol"] = int(args.column_tolerance)

    return camelot.read_pdf(args.pdf, **camelot_kwargs)


def scale_region(table, page_size, label_index):
    page_width, page_height = page_size
    x1, y1, x2, y2 = table._bbox
    left = (x1 / page_width) * CANVAS_WIDTH
    top = ((page_height - y2) / page_height) * CANVAS_HEIGHT
    width = ((x2 - x1) / page_width) * CANVAS_WIDTH
    height = ((y2 - y1) / page_height) * CANVAS_HEIGHT
    accuracy = None
    parsing_report = getattr(table, "parsing_report", None)
    if isinstance(parsing_report, dict):
        accuracy = parsing_report.get("accuracy")

    return {
        "id": f"auto_{table.page}_{label_index}",
        "pageNumber": int(table.page),
        "x": round(left, 2),
        "y": round(top, 2),
        "width": round(width, 2),
        "height": round(height, 2),
        "label": f"Auto Table {label_index}",
        "source": "auto",
        "confidence": round(float(accuracy) / 100.0, 4) if accuracy is not None else None,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pdf", required=True)
    parser.add_argument("--pages", required=True)
    parser.add_argument("--flavor", choices=["lattice", "stream"], default="lattice")
    parser.add_argument("--line-scale", default="40")
    parser.add_argument("--edge-tolerance", default="50")
    parser.add_argument("--row-tolerance", default="2")
    parser.add_argument("--column-tolerance", default="0")
    parser.add_argument("--split-text", default="true")
    parser.add_argument("--strip-text", default="true")
    args = parser.parse_args()

    page_info = read_page_info(args.pdf)
    if not page_info["supports_text_extraction"]:
        raise RuntimeError("This PDF appears to be image-based and is not supported. Only text-based PDFs are supported.")

    tables = run_camelot(args)
    grouped_index = {}
    regions = []

    for table in tables:
        page_number = int(table.page)
        grouped_index[page_number] = grouped_index.get(page_number, 0) + 1
        page_size = page_info["page_sizes"].get(page_number, (612.0, 792.0))
        regions.append(scale_region(table, page_size, grouped_index[page_number]))

    print(
        json.dumps(
            {
                "pageCount": page_info["page_count"],
                "supportsTextExtraction": page_info["supports_text_extraction"],
                "warningMessage": page_info["warning"],
                "regions": regions,
            }
        )
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
