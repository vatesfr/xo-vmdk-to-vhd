'use strict'

const footerCookie = 'conectix'
const creatorApp = 'xo  '
// it looks like every body is using Wi2k
const osString = 'Wi2k'
const headerCookie = 'cxsparse'
const dynamicHardDiskType = 3

export function computeChecksum (buffer) {
  let sum = 0
  for (let i = 0; i < buffer.length; i++) {
    sum += buffer[i]
  }
  // http://stackoverflow.com/a/1908655/72637 the >>> prevents the number from going negative
  return (~sum) >>> 0
}

export function createFooter (size, timestamp, geometry) {
  let view = new Uint8Array(512)
  let footer = new Buffer(view.buffer)
  view.set(new Buffer(footerCookie, 'ascii'), 0)
  footer.writeUInt32BE(2, 8)
  footer.writeUInt32BE(0x00010000, 12)
  // hard code the position of the next structure, we have no reason to change it
  footer.writeUInt32BE(0, 16)
  footer.writeUInt32BE(512, 20)
  footer.writeUInt32BE(timestamp, 24)
  view.set(new Buffer(creatorApp, 'ascii'), 28)
  view.set(new Buffer(osString, 'ascii'), 36)
  footer.writeUInt32BE(size >> 32, 40)
  footer.writeUInt32BE(size, 44)
  footer.writeUInt32BE(size >> 32, 48)
  footer.writeUInt32BE(size, 52)
  footer.writeUInt16BE(geometry['cylinders'], 56)
  footer.writeUInt8(geometry['heads'], 58)
  footer.writeUInt8(geometry['sectorsPerTrack'], 59)
  footer.writeUInt32BE(dynamicHardDiskType, 60)
  let checksum = computeChecksum(footer)
  console.log('checksum', checksum)
  footer.writeUInt32BE(checksum, 64)
}

export function createDynamicDiskHeader (tableEntries) {
  let view = new Uint8Array(512)
  let header = new Buffer(view.buffer)
  view.set(new Buffer(headerCookie, 'ascii'), 0)
  // hard code no next data
  header.writeUInt32BE(0xFFFFFFFF, 8)
  header.writeUInt32BE(0xFFFFFFFF, 12)
  // hard code table offset
  header.writeUInt32BE(0, 16)
  header.writeUInt32BE(512 * 3, 20)
  header.writeUInt32BE(0x00010000, 24)
  header.writeUInt32BE(tableEntries, 28)
  // hard code 2MB block size
  header.writeUInt32BE(0x00200000, 32)
  let checksum = computeChecksum(header)
  console.log('checksum', checksum)
  header.writeUInt32BE(checksum, 36)
}
