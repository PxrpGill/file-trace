"""Deciding what's previewable and converting office documents to PDF.

Images/video/PDF are streamed to the browser as-is (it renders them
natively); DOCX/XLS(X) go through headless LibreOffice first, and the
resulting PDF is cached on the FileVersion (immutable, so the cache never
goes stale for a given version).

Preview kind is always derived from the filename extension, never from the
stored (client-supplied, unreliable) FileVersion.mime_type — this is the
enforcement point that keeps the preview endpoint from ever rendering an
arbitrary uploaded file inline.
"""

import enum
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import BinaryIO

from app.services.storage import FileStorage, StoredBlob

MAX_OFFICE_SOURCE_SIZE = 100 * 1024 * 1024  # 100 MiB
CONVERSION_TIMEOUT_SECONDS = 45

_RANGE_CHUNK = 1024 * 1024


class PreviewKind(str, enum.Enum):
    image = "image"
    video = "video"
    pdf = "pdf"
    office = "office"


_IMAGE_MIME_BY_EXT = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".webp": "image/webp",
    ".bmp": "image/bmp",
}
_VIDEO_MIME_BY_EXT = {
    ".mp4": "video/mp4",
    ".webm": "video/webm",
}
_OFFICE_EXTENSIONS = (".docx", ".doc", ".xlsx", ".xls")
_PDF_EXTENSIONS = (".pdf",)


class PreviewUnsupportedError(Exception):
    """Extension is not in the previewable whitelist."""


class PreviewToolUnavailableError(Exception):
    """An office file needs conversion but soffice isn't installed."""


class PreviewSourceTooLargeError(Exception):
    """Office source file exceeds MAX_OFFICE_SOURCE_SIZE."""


class PreviewConversionTimeoutError(Exception):
    """soffice didn't finish within CONVERSION_TIMEOUT_SECONDS."""


class PreviewConversionFailedError(Exception):
    """soffice exited non-zero or produced no output file."""


class PreviewRangeNotSatisfiableError(Exception):
    """Range start is at or beyond the resource size."""


def get_preview_kind(name: str) -> PreviewKind | None:
    lower = name.lower()
    if lower.endswith(tuple(_IMAGE_MIME_BY_EXT)):
        return PreviewKind.image
    if lower.endswith(tuple(_VIDEO_MIME_BY_EXT)):
        return PreviewKind.video
    if lower.endswith(_PDF_EXTENSIONS):
        return PreviewKind.pdf
    if lower.endswith(_OFFICE_EXTENSIONS):
        return PreviewKind.office
    return None


def get_preview_mime(name: str) -> str:
    """Mime for kinds streamed as-is (image/video/pdf). Office always
    resolves to application/pdf post-conversion — handled by the caller."""
    lower = name.lower()
    for ext, mime in _IMAGE_MIME_BY_EXT.items():
        if lower.endswith(ext):
            return mime
    for ext, mime in _VIDEO_MIME_BY_EXT.items():
        if lower.endswith(ext):
            return mime
    if lower.endswith(_PDF_EXTENSIONS):
        return "application/pdf"
    raise PreviewUnsupportedError(name)


def convert_office_to_pdf(
    storage: FileStorage, name: str, source_key: str, source_size: int
) -> StoredBlob:
    if shutil.which("soffice") is None:
        raise PreviewToolUnavailableError(
            "Предпросмотр документа недоступен: не найден soffice на сервере"
        )
    if source_size > MAX_OFFICE_SOURCE_SIZE:
        raise PreviewSourceTooLargeError(
            f"Документ слишком большой для предпросмотра: {source_size} байт"
        )

    suffix = Path(name).suffix or ".bin"
    with tempfile.TemporaryDirectory() as tmp_dir:
        src_path = Path(tmp_dir) / f"source{suffix}"
        with storage.open(source_key) as src_stream, src_path.open("wb") as out:
            shutil.copyfileobj(src_stream, out)

        # A per-invocation profile dir is required: concurrent headless
        # soffice processes sharing the default profile fight over its lock
        # file and can hang outright, not just duplicate work.
        profile_dir = Path(tmp_dir) / "profile"
        profile_dir.mkdir()

        try:
            result = subprocess.run(
                [
                    "soffice",
                    "--headless",
                    f"-env:UserInstallation=file://{profile_dir}",
                    "--convert-to",
                    "pdf",
                    "--outdir",
                    tmp_dir,
                    str(src_path),
                ],
                timeout=CONVERSION_TIMEOUT_SECONDS,
                capture_output=True,
            )
        except subprocess.TimeoutExpired as exc:
            raise PreviewConversionTimeoutError(
                "Превышено время ожидания конвертации документа"
            ) from exc

        out_path = src_path.with_suffix(".pdf")
        if result.returncode != 0 or not out_path.exists():
            detail = result.stderr.decode("utf-8", errors="replace") if result.stderr else ""
            raise PreviewConversionFailedError(
                f"Не удалось сконвертировать документ в PDF: {detail}".strip()
            )

        with out_path.open("rb") as pdf_stream:
            return storage.save(pdf_stream)


def parse_range_header(range_header: str | None, size: int) -> tuple[int, int] | None:
    """Returns an inclusive (start, end) byte range, or None to serve the
    full resource. Only a single `bytes=start-end` range is supported —
    multi-range requests are treated as "no range" (full 200 response)."""
    if not range_header or not range_header.startswith("bytes="):
        return None
    spec = range_header[len("bytes=") :]
    if "," in spec:
        return None
    start_str, sep, end_str = spec.partition("-")
    if not sep:
        return None
    try:
        if start_str == "":
            # suffix range "bytes=-N" — last N bytes
            if end_str == "":
                return None
            start = max(size - int(end_str), 0)
            end = size - 1
        else:
            start = int(start_str)
            end = int(end_str) if end_str else size - 1
    except ValueError:
        return None
    if start >= size or start < 0:
        raise PreviewRangeNotSatisfiableError()
    end = min(end, size - 1)
    return start, end


def iter_range(stream: BinaryIO, start: int, end: int):
    """Yields chunks covering the inclusive [start, end] byte range, then
    closes the stream."""
    try:
        stream.seek(start)
        remaining = end - start + 1
        while remaining > 0:
            chunk = stream.read(min(_RANGE_CHUNK, remaining))
            if not chunk:
                break
            remaining -= len(chunk)
            yield chunk
    finally:
        stream.close()
