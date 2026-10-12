function mergeIntervals(intervals: string[]): string[] {
  if (intervals.length === 0) return [];

  intervals = intervals.map(interval => interval.split('-').map(Number));
  intervals = intervals.filter(interval => interval.length === 2 && interval[0] <= interval[1]);

  if (intervals.length === 0) return [];

  intervals.sort((a, b) => a[0] - b[0]);

  const merged: string[] = [intervals[0].join('-')];
  for (const interval of intervals.slice(1)) {
    if (interval[0] > merged[merged.length - 1].split('-')[1] + 1) {
      merged.push(interval.join('-'));
    } else {
      const lastMerged = merged[merged.length - 1];
      merged[merged.length - 1] = [Math.min(lastMerged.split('-')[0], interval[0]), Math.max(lastMerged.split('-')[1], interval[1])].join('-');
    }
  }

  return merged;
}

const args = Deno.args;
if (args.length === 0) {
  console.log('');
} else {
  try {
    const mergedIntervals = mergeIntervals(args);
    console.log(mergedIntervals.join(', '));
  } catch (error) {
    for (const piece of args) {
      if (error instanceof Error && error.message.includes(piece)) {
        console.log(`error: bad interval ${piece}`);
        Deno.exit(1);
      }
    }
    Deno.exit(1);
  }
}
