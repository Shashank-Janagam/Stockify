#!/bin/bash

# Save docker env variables to /app/.env so cron job has access to them
# Exclude some read-only/system environment variables
printenv | grep -v 'no_proxy' > /app/.env

echo "[$(date)] Running initial pipeline execution..."
/usr/local/bin/python /app/pipeline.py --source rbi

echo "[$(date)] Starting cron daemon..."
exec cron -f
