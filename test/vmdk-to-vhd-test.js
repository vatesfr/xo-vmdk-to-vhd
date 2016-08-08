'use strict'

import {assert} from 'chai'
import {describe, it} from 'mocha'
import {exec} from 'child-process-promise'
import {readFile, createReadStream} from 'fs-promise'
import {readRawContent} from '../src/vmdk-read'
import {VHDFile} from '../src/vhd-write'

describe('VMDK to VHD conversion', function () {
  it('can convert a random data file', () => {
    let inputRawFileName = 'random-data.raw'
    let vmdkFileName = 'random-data.vmdk'
    let vhdFileName = 'from-vmdk.vhd'
    let reconvertedRawFilemane = 'from-vhd.raw'
    let dataSize = 5222400
    return exec('base64 /dev/urandom | head -c ' + dataSize + ' > ' + inputRawFileName)
      .then(() => {
        return exec('qemu-img convert -fraw -Ovmdk  -o subformat=streamOptimized ' + inputRawFileName + ' ' + vmdkFileName)
      })
      .then(() => {
        return Promise.all([readRawContent(createReadStream(vmdkFileName)), readFile(inputRawFileName)])
      })
      .then((result) => {
        const readRawContent = result[0].rawFile
        const f = new VHDFile(readRawContent.length, 523557791)
        f.writeBuffer(readRawContent)
        return f.writeFile(vhdFileName)
          .then(() => {
            return exec('qemu-img convert -fvpc -Oraw ' + vhdFileName + ' ' + reconvertedRawFilemane)
          })
          .then(() => {
            return exec('qemu-img compare ' + vmdkFileName + ' ' + vhdFileName)
              .catch((error) => {
                console.error(error.stdout)
                console.error(error.stderr)
                assert.fail(vhdFileName, vmdkFileName, error.message)
              })
          })
      })
  })
})
