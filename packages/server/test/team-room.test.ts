import assert from 'node:assert/strict'
import { getTeamRoomId } from '../src/skyoffice/team-room.js'

assert.equal(getTeamRoomId('abc'), 'team-abc')
console.log('team-room check passed')
