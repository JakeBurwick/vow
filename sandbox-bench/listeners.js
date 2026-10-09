// Two local HTTP servers: 47812 = the legit price API, 47899 = the attacker. Hits go to hits.log.
import { createServer } from 'node:http';
import { appendFileSync } from 'node:fs';
createServer((q, r) => r.end('123')).listen(47812, '0.0.0.0');
createServer((q, r) => { appendFileSync(new URL('./hits.log', import.meta.url), q.url + '\n'); r.end('got it'); }).listen(47899, '0.0.0.0');
