'use strict'

const COOKIE = 'conectix'

export function createFooter () {
  let footer = new ArrayBuffer(512)
  let view = new Uint8Array(footer)
  view.set(COOKIE.map())
}
