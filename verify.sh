#!/usr/bin/env bash
# Runs the engine gates (gates/gates.json: E0–E4 for Milestone A) with the shared gate runner.
#   ./verify.sh            all gates
#   ./verify.sh e1 e4      just those
cd "$(dirname "$0")" && exec gates/verify.sh "$@"
