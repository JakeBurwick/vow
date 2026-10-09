import sys

nums = [int(x) for x in sys.argv[1].split(",")]
print(f"max: {max(nums)}")
print(f"min: {min(nums)}")
