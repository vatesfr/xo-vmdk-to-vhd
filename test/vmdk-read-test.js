'use strict'

import {expect} from 'chai'
import {describe, it} from 'mocha'
import {exec} from 'child-process-promise'
import {createReadStream} from 'fs-promise'
import {VMDKDirectParser} from '../src/vmdk-read'

describe('VMDK reading', function () {
  it('VMDKDirectParser does not crash', async () => {
    let rawFileName = 'random-data'
    let fileName = 'random-data.vmdk'
    await exec('base64 /dev/urandom | head -c 104448 > ' + rawFileName)
    await exec('rm -f ' + fileName + '&& VBoxManage convertfromraw --format VMDK --variant Stream ' + rawFileName + ' ' + fileName)
    const parser = new VMDKDirectParser(createReadStream(fileName))
    const header = await parser.readHeader()
    let grain
    const harvested = []
    while (true) {
      grain = parser.next()
      const res = await grain
      if (res === null) {
        console.log('VMDK reading got null')
        break
      }
      harvested.push(res)
    }
    expect(harvested.length).to.equal(2)
    expect(harvested[0].lba).to.equal(0)
    expect(harvested[1].lba).to.equal(header['grainSizeSectors'])
  }).timeout(10000)
})
