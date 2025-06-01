#!/usr/bin/env bash

set -e

if [ "$1" == "web" ]; then
  command="mitmweb"
elif [ "$1" == "dump" ]; then
  command="mitmdump"
elif [ "$1" == "proxy" ] || [ -z "$1" ]; then
  command="mitmproxy"
else
  echo "Usage: $0 [web|dump|proxy] [mitmproxy args...]"
  exit 1
fi

$command \
    --set ignore_hosts="cdninstagram.com|fbcdn.net" \
    --set save_stream_file="+flows.out"
