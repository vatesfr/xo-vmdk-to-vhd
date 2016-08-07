'use strict'

import {describe, it} from 'mocha'
import {exec} from 'child-process-promise'
import {readFile} from 'fs-promise'
import {readRawContent} from '../src/vmdk-read'
import {createExpandedFile, computeGeometryForSize} from '../src/vhd-write'

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
        return Promise.all([readRawContent(vmdkFileName), readFile(inputRawFileName)])
      })
      .then((result) => {
        const readRawContent = result[0].rawFile
        const geometry = computeGeometryForSize(readRawContent.length)
        return createExpandedFile(vhdFileName, readRawContent, 523557791, geometry)
          .then(() => {
            return exec('qemu-img convert -fvpc -Oraw ' + vhdFileName + ' ' + reconvertedRawFilemane)
          })
          .then(() => {
            return exec('qemu-img compare ' + vmdkFileName + ' ' + vhdFileName)
          })
      })
  })
})
