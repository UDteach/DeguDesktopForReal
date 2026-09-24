const test = require('node:test');
const assert = require('node:assert/strict');
const { defaultModes, validModes, pomodoroPhase } = require('../electron/modes');

test('mode settings reject invalid durations and timer visibility values', () => {
  assert.equal(validModes(defaultModes), true);
  assert.equal(validModes({ ...defaultModes, showTimer: 'yes' }), false);
  assert.equal(validModes({ ...defaultModes, pomodoro: { ...defaultModes.pomodoro, focus: 0 } }), false);
  assert.equal(validModes({ ...defaultModes, pomodoro: { ...defaultModes.pomodoro, shortBreak: 61 } }), false);
});

test('pomodoro moves through four focus periods, short breaks, and a long break', () => {
  const minute = 60000;
  const pomodoro = { enabled: true, startedAt: 1000, focus: 25, shortBreak: 5, longBreak: 15 };
  const at = (minutes) => pomodoroPhase(pomodoro, 1000 + minutes * minute);
  assert.deepEqual(at(0), { kind: 'focus', round: 1, remainingMs: 25 * minute });
  assert.equal(at(25).kind, 'break');
  assert.equal(at(30).kind, 'focus');
  assert.equal(at(115).kind, 'longBreak');
  assert.deepEqual(at(130), { kind: 'focus', round: 1, remainingMs: 25 * minute });
  assert.equal(pomodoroPhase({ ...pomodoro, enabled: false }), null);
});
