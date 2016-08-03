'use strict'

import {expect} from 'chai'
import {lol} from '../src/lol'
import {describe, it} from 'mocha'

describe('lol() function', function () {
  it('returns "lol"', () => {
    var res = lol()
    expect(res).to.equal('lol')
  })
})
