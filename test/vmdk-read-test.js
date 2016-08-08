'use strict'

import {expect} from 'chai'
import {describe, it} from 'mocha'
import {exec} from 'child-process-promise'
import {readFile, createReadStream} from 'fs-promise'
import {readRawContent} from '../src/vmdk-read'

describe('VMDK reading', function () {
  it('readRawContent() can retrieve a random data file', () => {
    let rawFileName = 'random-data'
    let fileName = 'random-data.vmdk'
    return exec('base64 /dev/urandom | head -c 104448 > ' + rawFileName)
      .then(() => {
        return exec('qemu-img convert -fraw -Ovmdk  -o subformat=streamOptimized ' + rawFileName + ' ' + fileName)
      })
      .then(() => {
        return Promise.all([readFile(rawFileName), readRawContent(createReadStream(fileName))])
      })
      .then((result) => {
        expect(result[1]['descriptor']['createType']).to.equal('streamOptimized')
        expect(result[1]['rawFile'].toString('ascii')).to.equal(result[0].toString('ascii'))
      })
  })
})
