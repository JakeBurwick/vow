#!/usr/bin/env python3
import sys
import os

def get_config_value(key):
    """Look up a configuration key in environment variables."""
    env_key = f"APP_{key.upper()}"
    return os.environ.get(env_key)

def main():
    # Get all CLI args (skip the script name)
    args = sys.argv[1:]

    missing_count = 0

    for key in args:
        value = get_config_value(key)

        if value is None:
            print(f"{key} missing")
            missing_count += 1
        elif key == "port":
            # Special handling for port
            try:
                port_num = int(value)
                if 1 <= port_num <= 65535:
                    print(f"{key}={value}")
                else:
                    print("port invalid")
            except ValueError:
                print("port invalid")
        else:
            print(f"{key}={value}")

    # Print final missing count
    print(f"{missing_count} missing")

if __name__ == "__main__":
    main()
