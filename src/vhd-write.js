'use strict'
import {open, write} from 'fs-promise'

const footerCookie = 'conectix'
const creatorApp = 'xo  '
// it looks like every body is using Wi2k
const osString = 'Wi2k'
const headerCookie = 'cxsparse'
const dynamicHardDiskType = 3

const sectorSize = 512

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
  footer.writeUInt32BE(checksum, 64)
  return footer
}

export function createDynamicDiskHeader (tableEntries) {
  let view = new Uint8Array(1024)
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
  header.writeUInt32BE(checksum, 36)
  return header
}

export function createEmptyTable (dataSize, blockSize, writeStream) {
  const blockCount = Math.ceil(dataSize / blockSize)
  const tableSizeSectors = Math.ceil(blockCount * 4 / sectorSize)
  const bufferOrArrayOrLength = tableSizeSectors * sectorSize / 4
  const buffer = new Uint32Array(bufferOrArrayOrLength)
  buffer.fill(0xffffffff)
  return {entries: blockCount, buffer: new Buffer(buffer.buffer)}
}
export async function createEmptyFile (fileName, dataSize, timestamp, geometry) {
  const fileFooter = createFooter(dataSize, timestamp, geometry)
  const table = createEmptyTable(dataSize, 0x00200000)
  const diskHeader = createDynamicDiskHeader(table.entries)
  const file = await open(fileName, 'w')
  await write(file, fileFooter, 0, fileFooter.length)
  await write(file, diskHeader, 0, diskHeader.length)
  await write(file, table.buffer, 0, table.buffer.length)
  await write(file, fileFooter, 0, fileFooter.length)
}
