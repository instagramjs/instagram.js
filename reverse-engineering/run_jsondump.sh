#!/usr/bin/env bash

set -e

mitmdump \
  -ns jsondump.py \
  -r flows.out \
  --set dump_destination=flows_json.out \
  --set dump_encodecontent=true
