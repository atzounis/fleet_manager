#!/usr/bin/env python3
"""Simulate an ESP32 heartbeat against a running Fleet Manager API."""

import argparse
import os
import sys
import urllib.error
import urllib.request

try:
    import cbor2
except ImportError:
    print("Install cbor2: pip install cbor2", file=sys.stderr)
    sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--api",
        default=os.environ.get("FLEET_API", "http://127.0.0.1:52841"),
        help="API base URL",
    )
    parser.add_argument(
        "--device-id",
        default=os.environ.get("DEVICE_ID", "240ac4dead01"),
        help="12-char lowercase hex MAC",
    )
    parser.add_argument(
        "--device-token",
        default=os.environ.get("FLEET_DEVICE_TOKEN", ""),
        help="X-Device-Token from dashboard registration",
    )
    parser.add_argument("--hw-version", default="1.0")
    parser.add_argument("--fw-version", default="1.0.0")
    args = parser.parse_args()

    if not args.device_token:
        print("FLEET_DEVICE_TOKEN is required (register device in dashboard first).", file=sys.stderr)
        sys.exit(1)

    body = cbor2.dumps(
        {
            "heap_free": 45000,
            "heap_min_free": 32000,
            "wifi_rssi": -55,
            "battery_mv": 3700,
        }
    )
    url = f"{args.api.rstrip('/')}/api/v1/agent/heartbeat/"
    req = urllib.request.Request(
        url,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/cbor",
            "X-Device-Id": args.device_id,
            "X-Device-Token": args.device_token,
            "X-Hw-Version": args.hw_version,
            "X-Fw-Version": args.fw_version,
        },
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            print(resp.status, resp.read().decode())
    except urllib.error.HTTPError as exc:
        print(exc.code, exc.read().decode(), file=sys.stderr)
        sys.exit(1)


if __name__ == "__main__":
    main()
