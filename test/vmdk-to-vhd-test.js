'use strict'

import {expect, assert} from 'chai'
import {describe, it} from 'mocha'
import {exec} from 'child-process-promise'
import {readFile} from 'fs-promise'
import {readRawContent} from '../src/vmdk-read'
import {createExpandedFile, computeGeometryForSize} from '../src/vhd-write'

describe('VMDK to VHD conversion', function () {
  it('can convert a random data file', () => {
    let rawFileName = 'random-data.raw'
    let fileName = 'random-data.vmdk'
    let outputFilename = 'from-vmdk.vhd'
    let reconvertedRawFilemane = 'from-vhd.raw'
    let dataSize = 5222400
    return exec('base64 /dev/urandom | head -c ' + dataSize + ' > ' + rawFileName)
      .then(() => {
        return exec('qemu-img convert -fraw -Ovmdk  -o subformat=streamOptimized ' + rawFileName + ' ' + fileName)
      })
      .then(() => {
        return Promise.all([readRawContent(fileName), readFile(rawFileName)])
      })
      .then((result) => {
        const readRawContent = result[0].rawFile
        const originalRawContent = result[1]
        const geometry = computeGeometryForSize(readRawContent.length)
        return createExpandedFile(outputFilename, readRawContent, 523557791, geometry)
          .then(() => {
            return exec('qemu-img convert -fvpc -Oraw ' + outputFilename + ' ' + reconvertedRawFilemane)
          })
          .then(() => {
            return readFile(reconvertedRawFilemane)
          })
          .then((fileContent) => {
            expect(fileContent.length).to.equal(originalRawContent.length)
            for (let i = 0; i < fileContent.length; i++) {
              if (fileContent[i] !== originalRawContent[i]) {
                assert.fail(fileContent[i], originalRawContent[i])
              }
            }
          })
      })
  })
})
