'use strict'

import {assert} from 'chai'
import {describe, it} from 'mocha'
import {exec} from 'child-process-promise'
import {createReadStream, readFile} from 'fs-promise'
import {VirtualBuffer} from '../src/virtual-buffer'

describe('Virtual Buffer', function () {
  it('readRawContent() can retrieve a random data file', () => {
    let rawFileName = 'random-data'
    return exec('base64 /dev/urandom | head -c 104448 > ' + rawFileName)
      .then(() => {
        const buffer = new VirtualBuffer(createReadStream(rawFileName))
        return Promise.all([readFile(rawFileName), buffer.readChunk(0, 10), buffer.readChunk(10, -1)])
      })
      .then((array) => {
        const original = array.shift()
        assert.equal(Buffer.concat(array).toString('ascii'), original.toString('ascii'))
      })
  })
})
