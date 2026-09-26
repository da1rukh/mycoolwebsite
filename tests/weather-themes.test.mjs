import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../script.js', import.meta.url), 'utf8');
function loadPhaseFunction() {
  const start=source.indexOf('function timeMinutes('), end=source.indexOf('function setRain(',start);
  assert.ok(start>=0&&end>start,'solar phase helpers exist');
  const code=source.slice(start,end).replace(/function phaseFromSolarEvents\(/,'globalThis.phaseFromSolarEvents=function phaseFromSolarEvents(');
  const context={Intl,Date};vm.runInNewContext(code,context);return context.phaseFromSolarEvents;
}
test('solar phase windows cover dawn, midday, sunset and night across midnight',()=>{
  const phase=loadPhaseFunction();
  const at=(hour,minute)=>new Date(2025,5,21,hour,minute);
  const sunrise='2025-06-21T05:00',sunset='2025-06-21T21:00';
  assert.equal(phase(at(4,30),sunrise,sunset,0),'dawn');
  assert.equal(phase(at(10,0),sunrise,sunset,1),'noon');
  assert.equal(phase(at(20,0),sunrise,sunset,1),'sunset');
  assert.equal(phase(at(22,30),sunrise,sunset,0),'night');
  assert.equal(phase(at(0,30),sunrise,sunset,0),'night');
});
test('solar phase helper has a fallback when solar events are absent',()=>{
  const phase=loadPhaseFunction();
  assert.equal(phase(new Date(2025,0,1,6,0),null,null,1),'dawn');
  assert.equal(phase(new Date(2025,0,1,12,0),null,null,1),'noon');
  assert.equal(phase(new Date(2025,0,1,12,0),null,null,0),'night');
});
test('precipitation is an independent data attribute, not a time-of-day palette',()=>{
  assert.match(source,/function setRain\(raining\)[\s\S]*?dataset\.rain = raining \? 'true' : 'false'/);
  assert.match(source,/setGardenPhase\(phaseFromSolarEvents/);
  assert.doesNotMatch(source,/data-weather-mode|dataset\.weather =/);
});
