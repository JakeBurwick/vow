#!/usr/bin/env python3
import sys
import re

# Read the log from the first argument
log_content = sys.argv[1]

# Parse the log lines
lines = log_content.split('\n')

# Counters
level_counts = {'ERROR': 0, 'WARN': 0, 'INFO': 0}
error_modules = {}
malformed_count = 0

# Pattern to match valid log lines: "<LEVEL> <module> <message...>"
# LEVEL must be one of: INFO, WARN, ERROR
log_pattern = re.compile(r'^(ERROR|WARN|INFO)\s+(\S+)\s+(.*)$')

for line in lines:
    # Ignore blank lines
    if not line.strip():
        continue

    # Try to match the pattern
    match = log_pattern.match(line)
    if match:
        level = match.group(1)
        module = match.group(2)

        # Count this level
        level_counts[level] += 1

        # If it's an ERROR, track the module
        if level == 'ERROR':
            if module not in error_modules:
                error_modules[module] = 0
            error_modules[module] += 1
    else:
        # Malformed line
        malformed_count += 1

# Generate output
output_lines = []

# 1. Print levels that appear at least once, in order: ERROR, WARN, INFO
for level in ['ERROR', 'WARN', 'INFO']:
    if level_counts[level] > 0:
        output_lines.append(f"{level}: {level_counts[level]}")

# 2. Print worst module (module with most ERROR lines, ties broken alphabetically)
if error_modules:
    # Find the module with the most errors
    max_errors = max(error_modules.values())
    # Get all modules with max errors and sort alphabetically
    worst_modules = sorted([m for m, count in error_modules.items() if count == max_errors])
    worst_module = worst_modules[0]  # First one alphabetically
    output_lines.append(f"worst module: {worst_module}")
else:
    output_lines.append("worst module: none")

# 3. Print malformed count
output_lines.append(f"malformed: {malformed_count}")

# Print all output
for line in output_lines:
    print(line)
