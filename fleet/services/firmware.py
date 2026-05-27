from __future__ import annotations

import re

from fleet.models import Device, FirmwareRelease

_SEMVER = re.compile(r"^(\d+)\.(\d+)\.(\d+)(?:-([\w.]+))?$")


def parse_version(version: str) -> tuple[int, int, int, str]:
    match = _SEMVER.match(version.strip())
    if not match:
        raise ValueError(f"Invalid semantic version: {version}")
    major, minor, patch, prerelease = match.groups()
    return int(major), int(minor), int(patch), prerelease or ""


def is_newer_version(candidate: str, current: str) -> bool:
    try:
        c = parse_version(candidate)
        cur = parse_version(current)
    except ValueError:
        return candidate > current
    if c[:3] != cur[:3]:
        return c[:3] > cur[:3]
    if c[3] and not cur[3]:
        return False
    if not c[3] and cur[3]:
        return True
    return c[3] > cur[3]


def find_ota_release(device: Device) -> FirmwareRelease | None:
    if not device.cohort_id:
        return None
    releases = FirmwareRelease.objects.filter(
        cohort_id=device.cohort_id,
        hw_version=device.hw_version,
        is_active=True,
    )
    best: FirmwareRelease | None = None
    for release in releases:
        if not is_newer_version(release.version, device.fw_version):
            continue
        if best is None or is_newer_version(release.version, best.version):
            best = release
    return best
