import json
import os
import tempfile
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

CANVAS_WIDTH = 760.0
CANVAS_HEIGHT = 980.0

app = FastAPI(title="Finance Camelot Worker", version="1.0.0")


def read_page_info(pdf_path: str):
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


def run_camelot(
    pdf_path: str,
    pages: str,
    flavor: str,
    line_scale: str,
    edge_tolerance: str,
    row_tolerance: str,
    column_tolerance: str,
    split_text: bool,
    strip_text: bool,
):
    try:
        import camelot  # type: ignore
    except Exception as exc:
        raise RuntimeError(f"Camelot is not available: {exc}") from exc

    camelot_kwargs = {
        "pages": pages,
        "flavor": "stream" if flavor.lower() == "stream" else "lattice",
        "split_text": split_text,
        "strip_text": "\n" if strip_text else "",
    }

    if camelot_kwargs["flavor"] == "lattice":
        camelot_kwargs["line_scale"] = int(line_scale or "40")
    else:
        camelot_kwargs["edge_tol"] = int(edge_tolerance or "50")
        camelot_kwargs["row_tol"] = int(row_tolerance or "2")
        camelot_kwargs["column_tol"] = int(column_tolerance or "0")

    return camelot.read_pdf(pdf_path, **camelot_kwargs)


def scale_region(table, page_size, label_index: int):
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


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/detect-tables")
async def detect_tables(
    file: UploadFile = File(...),
    fileId: str = Form(""),
    flavor: str = Form("lattice"),
    pages: str = Form("1"),
    lineScale: Optional[str] = Form(None),
    edgeTolerance: Optional[str] = Form(None),
    rowTolerance: Optional[str] = Form(None),
    columnTolerance: Optional[str] = Form(None),
    splitText: bool = Form(True),
    stripText: bool = Form(True),
):
    suffix = os.path.splitext(file.filename or "")[1] or ".pdf"
    temp_path = ""

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as temp_file:
            temp_path = temp_file.name
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                temp_file.write(chunk)

        page_info = read_page_info(temp_path)
        if not page_info["supports_text_extraction"]:
            raise HTTPException(
                status_code=400,
                detail="This PDF appears to be image-based and is not supported. Only text-based PDFs are supported.",
            )

        tables = run_camelot(
            pdf_path=temp_path,
            pages=pages or "1",
            flavor=flavor or "lattice",
            line_scale=lineScale or "40",
            edge_tolerance=edgeTolerance or "50",
            row_tolerance=rowTolerance or "2",
            column_tolerance=columnTolerance or "0",
            split_text=splitText,
            strip_text=stripText,
        )

        grouped_index = {}
        regions = []

        for table in tables:
            page_number = int(table.page)
            grouped_index[page_number] = grouped_index.get(page_number, 0) + 1
            page_size = page_info["page_sizes"].get(page_number, (612.0, 792.0))
            regions.append(scale_region(table, page_size, grouped_index[page_number]))

        return {
            "fileId": fileId,
            "pageCount": page_info["page_count"],
            "supportsTextExtraction": page_info["supports_text_extraction"],
            "warningMessage": page_info["warning"],
            "regions": regions,
        }
    except HTTPException:
        raise
    except Exception as exc:
        return JSONResponse(status_code=400, content={"message": str(exc)})
    finally:
        await file.close()
        if temp_path and os.path.exists(temp_path):
            os.remove(temp_path)
