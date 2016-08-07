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

export function computeGeometryForSize (size) {
  let totalSectors = Math.ceil(size / 512)
  let sectorsPerTrack
  let heads
  let cylinderTimesHeads
  if (totalSectors > 65535 * 16 * 255) {
    throw Error('disk is too big')
  }
  // straight copypasta from the file spec appendix on CHS Calculation
  if (totalSectors >= 65535 * 16 * 63) {
    sectorsPerTrack = 255
    heads = 16
    cylinderTimesHeads = totalSectors / sectorsPerTrack
  } else {
    sectorsPerTrack = 17
    cylinderTimesHeads = totalSectors / sectorsPerTrack
    heads = Math.floor((cylinderTimesHeads + 1023) / 1024)
    if (heads < 4) {
      heads = 4
    }
    if (cylinderTimesHeads >= (heads * 1024) || heads > 16) {
      sectorsPerTrack = 31
      heads = 16
      cylinderTimesHeads = totalSectors / sectorsPerTrack
    }
    if (cylinderTimesHeads >= (heads * 1024)) {
      sectorsPerTrack = 63
      heads = 16
      cylinderTimesHeads = totalSectors / sectorsPerTrack
    }
  }
  let cylinders = Math.floor(cylinderTimesHeads / heads)
  let actualSize = cylinders * heads * sectorsPerTrack * sectorSize
  return {cylinders, heads, sectorsPerTrack, actualSize}
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

export function createDynamicDiskHeader (tableEntries, blockSize) {
  let view = new Uint8Array(1024)
  let header = new Buffer(view.buffer)
  view.set(new Buffer(headerCookie, 'ascii'), 0)
  // hard code no next data
  header.writeUInt32BE(0xFFFFFFFF, 8)
  header.writeUInt32BE(0xFFFFFFFF, 12)
  // hard code table offset
  header.writeUInt32BE(0, 16)
  header.writeUInt32BE(sectorSize * 3, 20)
  header.writeUInt32BE(0x00010000, 24)
  header.writeUInt32BE(tableEntries, 28)
  header.writeUInt32BE(blockSize, 32)
  let checksum = computeChecksum(header)
  header.writeUInt32BE(checksum, 36)
  return header
}

export function createEmptyTable (dataSize, blockSize) {
  const blockCount = Math.ceil(dataSize / blockSize)
  const tableSizeSectors = Math.ceil(blockCount * 4 / sectorSize)
  const bufferSize = tableSizeSectors * sectorSize
  const buffer = new Buffer(bufferSize)
  buffer.fill(0xff)
  return {entryCount: blockCount, buffer: buffer}
}

function createBlock (blockSize, buffer) {
  const bitmapSize = blockSize / sectorSize / 8
  const bufferSize = Math.ceil((blockSize + bitmapSize) / sectorSize) * sectorSize
  const blockBuffer = new Buffer(bufferSize)
  blockBuffer.fill(0)
  const bitmapBuffer = blockBuffer.slice(0, bitmapSize)
  bitmapBuffer.fill(0xff)
  if (buffer !== null) {
    buffer.copy(blockBuffer, bitmapSize)
  }
  return blockBuffer
}

export async function createExpandedEmptyFile (fileName, dataBuffer, timestamp, geometry) {
  const dataSize = dataBuffer.length
  const fileFooter = createFooter(dataSize, timestamp, geometry)
  const blockSize = 0x00200000
  const table = createEmptyTable(dataSize, blockSize)
  const tableBuffer = table.buffer
  const diskHeader = createDynamicDiskHeader(table.entryCount, 0x00200000)
  let currentPosition = (sectorSize * 3 + tableBuffer.length) / sectorSize
  const blockCount = Math.ceil(dataSize / blockSize)
  const blocks = []
  for (let i = 0; i < blockCount; i++) {
    const block = createBlock(blockSize, dataBuffer.slice(i * blockSize, (i + 1) * blockSize))
    blocks.push(block)
    table.buffer.writeUInt32BE(currentPosition, i * 4)
    currentPosition += block.length / sectorSize
  }
  const file = await open(fileName, 'w')
  await write(file, fileFooter, 0, fileFooter.length)
  await write(file, diskHeader, 0, diskHeader.length)
  await write(file, tableBuffer, 0, tableBuffer.length)
  for (let i = 0; i < blocks.length; i++) {
    await write(file, blocks[i], 0, blocks[i].length)
  }
  await write(file, fileFooter, 0, fileFooter.length)
}
