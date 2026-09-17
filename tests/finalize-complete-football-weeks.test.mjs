import test from 'node:test';
import assert from 'node:assert/strict';
import {isWeekComplete} from '../scripts/finalize-complete-football-weeks.mjs';

test('a week completes only after every scheduled game is terminal',()=>{
  const now=new Date('2026-09-16T12:00:00Z');
  assert.equal(isWeekComplete([{state:'final',starts_at:'2026-09-10T00:00:00Z'},{state:'in_progress',starts_at:'2026-09-15T00:00:00Z'}],now),false);
  assert.equal(isWeekComplete([{state:'final',starts_at:'2026-09-10T00:00:00Z'},{state:'final',starts_at:'2026-09-15T00:00:00Z'}],now),true);
});

test('future games prevent finalization even if provider state is wrong',()=>{
  assert.equal(isWeekComplete([{state:'final',starts_at:'2026-09-18T00:00:00Z'}],new Date('2026-09-17T00:00:00Z')),false);
});
