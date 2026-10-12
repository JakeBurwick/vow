import { args } from 'deno';
import * as csv from 'csv-parser';

const oldTable = args[1];
const newTable = args[2];

if (!oldTable || !newTable) {
  console.log('error: both table files are required');
  process.exit(1);
}

const oldHeader = oldTable.split('\n')[0].split(',');
const newHeader = newTable.split('\n')[0].split(',');

if (oldHeader.join(',') !== newHeader.join(',')) {
  console.log('error: headers differ');
  process.exit(1);
}

const oldData = oldTable.split('\n').slice(1).filter(line => line);
const newData = newTable.split('\n').slice(1).filter(line => line);

const oldKeys = oldData.map(line => line.split(',')[0]);
const newKeys = newData.map(line => line.split(',')[0]);

const oldDataMap = new Map(oldKeys.map((key, index) => [key, line.split(',')[1 + index]]));
const newDataMap = new Map(newKeys.map((key, index) => [key, line.split(',')[1 + index]]));

const differences: { [key: string]: string[] } = {};

for (const key of [...new Set([...oldKeys, ...newKeys].sort())]) {
  if (oldKeys.includes(key) && newKeys.includes(key)) {
    const oldValue = oldDataMap.get(key);
    const newValue = newDataMap.get(key);
    if (oldValue !== newValue) {
      differences[key] = [oldValue, newValue];
    }
  } else if (newKeys.includes(key)) {
    differences[key] = [null, newDataMap.get(key)!];
  } else {
    differences[key] = [oldDataMap.get(key)!, null];
  }
}

if (Object.keys(differences).length === 0) {
  console.log('no changes');
} else {
  for (const key in differences) {
    const [oldValue, newValue] = differences[key];
    if (oldValue === null) {
      console.log(`+ ${key}`);
    } else if (newValue === null) {
      console.log(`- ${key}`);
    } else {
      console.log(`~ ${key}: ${oldValue} -> ${newValue}`);
    }
  }
}
