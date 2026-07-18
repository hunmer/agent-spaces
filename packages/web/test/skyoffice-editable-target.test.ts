import assert from 'node:assert/strict'
// @ts-expect-error Node 22 strip-types 运行测试时需要显式 .ts 扩展名
import { isEditableTarget } from '../src/features/skyoffice/utils/dom.ts'

assert.equal(isEditableTarget({ tagName: 'INPUT' } as unknown as EventTarget), true)
assert.equal(isEditableTarget({ tagName: 'TEXTAREA' } as unknown as EventTarget), true)
assert.equal(isEditableTarget({ tagName: 'DIV', isContentEditable: true } as unknown as EventTarget), true)
assert.equal(isEditableTarget({ tagName: 'BUTTON' } as unknown as EventTarget), false)
