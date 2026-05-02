#!/bin/sh
set -e

echo "Running deployCommands..."
node deployCommands.js

echo "Starting bot..."
exec node index.js
