from __future__ import annotations

import logging
import shutil
import subprocess
import tempfile
from pathlib import Path

from django.conf import settings

from fleet.services.storage import StorageError, get_s3_client

logger = logging.getLogger(__name__)


def symbolicate_crash(dump_s3_key: str, elf_s3_key: str) -> str:
    """Run xtensa-esp32-elf-gdb against the core dump and ELF when available."""
    gdb = shutil.which("xtensa-esp32-elf-gdb")
    if not gdb or not elf_s3_key:
        return (
            "Symbolication skipped: xtensa-esp32-elf-gdb or ELF binary not available. "
            "Upload a matching .elf for this firmware build to enable stack traces."
        )

    client = get_s3_client()
    bucket = settings.AWS_STORAGE_BUCKET_NAME

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        dump_path = tmp_path / "core.dump"
        elf_path = tmp_path / "firmware.elf"
        try:
            client.download_file(bucket, dump_s3_key, str(dump_path))
            client.download_file(bucket, elf_s3_key, str(elf_path))
        except Exception as exc:
            raise StorageError("Failed to download artifacts for symbolication.") from exc

        try:
            result = subprocess.run(
                [gdb, "-batch", "-ex", "bt", str(elf_path), str(dump_path)],
                capture_output=True,
                text=True,
                timeout=120,
                check=False,
            )
            output = (result.stdout or "") + (result.stderr or "")
            return output.strip() or "GDB produced no backtrace output."
        except subprocess.TimeoutExpired:
            return "Symbolication timed out after 120 seconds."
        except OSError as exc:
            logger.warning("GDB execution failed: %s", exc)
            return f"Symbolication failed: {exc}"
