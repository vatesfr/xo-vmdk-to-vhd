'use strict'

import {expect} from 'chai'
import {describe, it} from 'mocha'
import {readGeometry} from '../src/vmdk-read'

describe('VMDK reading', function () {
  it('readGeometry() with the virtualbox file', () => {
    return readGeometry('test.vmdk').then(result => {
      const descriptor = result['descriptor']
      expect(descriptor['createType']).to.equal('streamOptimized')
      expect(descriptor['parentCID']).to.equal('ffffffff')
      expect(descriptor['ddb.adapterType']).to.equal('ide')
      expect(descriptor['createType']).to.equal('streamOptimized')
      expect(descriptor['ddb.geometry.cylinders']).to.equal('8')
      expect(descriptor['ddb.geometry.heads']).to.equal('16')
      expect(descriptor['ddb.geometry.sectors']).to.equal('63')
    })
  })
})
