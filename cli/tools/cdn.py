"""CDN URL of asset paths, as `fetch.cdn_url` builds them. No network.

uv run python tools/cdn.py <path> [<path> ...]
"""

import sys

from shiniri_cli.fetch import cdn_url


def main(argv: list[str]) -> int:
    if not argv:
        print(__doc__.strip().splitlines()[-1].strip(), file=sys.stderr)
        return 2
    for p in argv:
        print(cdn_url(p))
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
