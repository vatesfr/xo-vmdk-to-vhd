'use strict'

import {describe, it} from 'mocha'
import {exec} from 'child-process-promise'
import {createReadStream} from 'fs-promise'
import {VirtualBuffer} from '../src/virtual-buffer'

describe('Virtual Buffer', function () {
  it('readRawContent() can retrieve a random data file', () => {
    let rawFileName = 'random-data'
    return exec('base64 /dev/urandom | head -c 104448 > ' + rawFileName)
      .then(() => {
        const buffer = new VirtualBuffer(createReadStream(rawFileName))
        return Promise.all([buffer.readChunk(0, 10), buffer.readChunk(10, -1)])
      })
      .then((chunk) => {
        console.log(chunk)
      })
  })
})
