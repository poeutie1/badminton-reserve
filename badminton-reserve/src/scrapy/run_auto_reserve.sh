#!/bin/sh
set -eu

RESERVE_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)

# cron/launchdのPATHやPythonの既定バージョンに左右されないようにする。
if [ -n "${BADMINTON_PYTHON:-}" ]; then
    RESERVE_PYTHON=$BADMINTON_PYTHON
elif [ -x "$RESERVE_DIR/.venv/bin/python" ]; then
    RESERVE_PYTHON=$RESERVE_DIR/.venv/bin/python
elif [ -x /Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12 ]; then
    RESERVE_PYTHON=/Library/Frameworks/Python.framework/Versions/3.12/bin/python3.12
else
    RESERVE_PYTHON=$(command -v python3)
fi

cd "$RESERVE_DIR"
exec "$RESERVE_PYTHON" -u "$RESERVE_DIR/auto_reserve.py" "$@"
